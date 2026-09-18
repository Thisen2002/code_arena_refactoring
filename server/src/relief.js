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

      // Verify report
      const report = await Report.findById(reportId);
      if (!report) {
        return res.status(404).json({ error: 'Help report not found.' });
      }

      if (report.kind !== 'help') {
        return res.status(400).json({ error: 'Only help requests can be assigned to relief shelters.' });
      }

      if (report.reliefAssignment?.status === 'assigned') {
        return res.status(409).json({ error: `This help request is already allocated to ${report.reliefAssignment.shelterName}.` });
      }

      // Verify shelter
      const shelter = await Shelter.findById(shelterId);
      if (!shelter) {
        return res.status(404).json({ error: 'Shelter not found.' });
      }

      if (shelter.status === 'closed') {
        return res.status(409).json({ error: 'Selected shelter is currently closed.' });
      }

      // Capacity check
      if (shelter.currentOccupancy + count > shelter.maxCapacity) {
        return res.status(409).json({
          error: `Shelter capacity exceeded. ${shelter.name} has only ${Math.max(0, shelter.maxCapacity - shelter.currentOccupancy)} spaces remaining (requested ${count}).`,
        });
      }

      // Update shelter occupancy
      shelter.currentOccupancy += count;
      if (shelter.currentOccupancy >= shelter.maxCapacity) {
        shelter.status = 'full';
      } else if (shelter.currentOccupancy / shelter.maxCapacity >= 0.85) {
        shelter.status = 'near_capacity';
      }
      await shelter.save();

      // Update report relief assignment
      report.reliefAssignment = {
        shelterId: shelter._id,
        shelterName: shelter.name,
        assignedAt: new Date(),
        assignedBy: req.user?._id,
        partySize: count,
        status: 'assigned',
        notes: String(notes).trim(),
      };
      report.history.push({
        action: 'shelter_assigned',
        actorId: req.user?._id,
        at: new Date(),
      });
      await report.save();

      res.json({
        success: true,
        report,
        shelter: {
          ...shelter.toObject(),
          occupancyPercentage: Math.round((shelter.currentOccupancy / shelter.maxCapacity) * 100),
          remainingCapacity: Math.max(0, shelter.maxCapacity - shelter.currentOccupancy),
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
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
