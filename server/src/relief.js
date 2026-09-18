import express from 'express';
import { Shelter, ensureDefaultShelters } from './models/Shelter.js';
import { Report } from './models/Report.js';

export function reliefRouter({ requireAuth, requireRole } = {}) {
  const router = express.Router();

  const reliefGuard = (requireAuth && requireRole)
    ? [requireAuth, requireRole(['relief', 'officer', 'admin'])]
    : [];

  // Public / Responder: List shelters and current capacities
  router.get('/shelters', async (req, res) => {
    try {
      await ensureDefaultShelters();
      const shelters = await Shelter.find().sort({ wardName: 1, name: 1 }).lean();
      
      const formatted = shelters.map(s => {
        const occupancyPct = Math.round((s.currentOccupancy / s.maxCapacity) * 100);
        return {
          ...s,
          occupancyPercentage: occupancyPct,
          remainingCapacity: Math.max(0, s.maxCapacity - s.currentOccupancy),
        };
      });

      res.json({ shelters: formatted });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Staff: Assign a citizen help request to an evacuation shelter
  router.post('/assign', ...reliefGuard, async (req, res) => {
    try {
      const { reportId, shelterId, partySize = 1, notes = '' } = req.body || {};

      if (!reportId || !shelterId) {
        return res.status(400).json({ error: 'Both reportId and shelterId are required.' });
      }

      const count = Math.max(1, parseInt(partySize, 10) || 1);

      // Verify shelter exists and is open before taking the lock
      const shelterCheck = await Shelter.findById(shelterId).lean();
      if (!shelterCheck) return res.status(404).json({ error: 'Shelter not found.' });
      if (shelterCheck.status === 'closed') {
        return res.status(409).json({ error: 'Selected shelter is currently closed.' });
      }

      // RC-02: Atomically mark the report as assigned only if it is NOT already assigned.
      // The query filter 'reliefAssignment.status': { $ne: 'assigned' } acts as a
      // compare-and-swap — only one concurrent request can win this update.
      const now = new Date();
      const updatedReport = await Report.findOneAndUpdate(
        {
          _id: reportId,
          kind: 'help',
          'reliefAssignment.status': { $ne: 'assigned' },
        },
        {
          $set: {
            reliefAssignment: {
              shelterId,
              shelterName: shelterCheck.name,
              assignedAt: now,
              assignedBy: req.user?._id,
              partySize: count,
              status: 'assigned',
              notes: String(notes).trim(),
            },
          },
          $push: { history: { action: 'shelter_assigned', actorId: req.user?._id, at: now } },
        },
        { new: true }
      );

      if (!updatedReport) {
        // Either report not found, wrong kind, or already assigned by a concurrent request
        const existing = await Report.findById(reportId).lean();
        if (!existing) return res.status(404).json({ error: 'Help report not found.' });
        if (existing.kind !== 'help') return res.status(400).json({ error: 'Only help requests can be assigned to relief shelters.' });
        return res.status(409).json({
          error: `This help request is already allocated to ${existing.reliefAssignment?.shelterName || 'a shelter'}.`,
        });
      }

      // RC-01: Atomically increment shelter occupancy only if the new total will not
      // exceed maxCapacity. The $expr filter enforces the cap inside MongoDB — no
      // application-level read-check-write gap.
      const updatedShelter = await Shelter.findOneAndUpdate(
        {
          _id: shelterId,
          status: { $ne: 'closed' },
          $expr: { $lte: [{ $add: ['$currentOccupancy', count] }, '$maxCapacity'] },
        },
        { $inc: { currentOccupancy: count } },
        { new: true }
      );

      if (!updatedShelter) {
        // Shelter became full between our check and this write — roll back the report assignment
        await Report.findByIdAndUpdate(reportId, {
          $unset: { reliefAssignment: '' },
          $push: { history: { action: 'shelter_assignment_rolled_back', actorId: req.user?._id, at: new Date() } },
        });
        return res.status(409).json({
          error: `Shelter capacity exceeded. Requested ${count} spaces but the shelter has no room. Please choose another shelter.`,
        });
      }

      // Reflect status after the atomic increment
      const newOccupancy = updatedShelter.currentOccupancy;
      const newMaxCapacity = updatedShelter.maxCapacity;
      const statusUpdate =
        newOccupancy >= newMaxCapacity ? 'full'
        : newOccupancy / newMaxCapacity >= 0.85 ? 'near_capacity'
        : updatedShelter.status;

      if (statusUpdate !== updatedShelter.status) {
        updatedShelter.status = statusUpdate;
        await updatedShelter.save();
      }

      res.json({
        success: true,
        report: updatedReport,
        shelter: {
          ...updatedShelter.toObject(),
          occupancyPercentage: Math.round((newOccupancy / newMaxCapacity) * 100),
          remainingCapacity: Math.max(0, newMaxCapacity - newOccupancy),
        },
      });
    } catch {
      res.status(500).json({ error: 'Unable to complete shelter assignment. Please try again.' });
    }
  });

  // Staff: Update shelter resources or operational status
  router.post('/shelters/:id/supplies', ...reliefGuard, async (req, res) => {
    try {
      const { id } = req.params;
      const { resources, status } = req.body || {};

      const shelter = await Shelter.findById(id);
      if (!shelter) {
        return res.status(404).json({ error: 'Shelter not found.' });
      }

      if (resources && typeof resources === 'object') {
        shelter.resources = {
          ...shelter.resources.toObject(),
          ...resources,
        };
      }

      if (status && ['open', 'near_capacity', 'full', 'closed'].includes(status)) {
        shelter.status = status;
      }

      await shelter.save();
      res.json({ success: true, shelter });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
