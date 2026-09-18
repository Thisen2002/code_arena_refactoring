import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import { Incident } from './models/Incident.js';
import { Report } from './models/Report.js';
import { User } from './models/User.js';
import { allow } from './auth.js';
import { evidenceStore, inspectImage, MAX_PHOTO_BYTES } from './evidence.js';
import { findNearestWard, findNearestRoad } from './data/demoRegion.js';
import {
  notifyNearbyCitizensOnIncidentCreated,
  notifyNearbyCitizensOnIncidentResolved,
} from './services/notificationService.js';

export function incidentDto(document, user = null) {
  const i = document.toObject ? document.toObject() : document;
  const isStaff = !user || ['officer', 'admin', 'crew'].includes(user.role);
  return {
    _id: String(i._id),
    title: i.title,
    hazardType: i.hazardType,
    severity: i.severity,
    status: i.status,
    isRoadClosed: Boolean(i.isRoadClosed),
    center: i.center,
    ward: i.ward,
    road: i.road,
    reportCount: i.reportIds?.length || 0,
    reportIds: isStaff ? (i.reportIds?.map(String) || []) : [],
    dispatch: i.dispatch?.crewId ? {
      crewId: String(i.dispatch.crewId),
      crewName: i.dispatch.crewName,
      dispatchedBy: String(i.dispatch.dispatchedBy),
      dispatchedAt: i.dispatch.dispatchedAt,
      instructions: isStaff ? i.dispatch.instructions : undefined,
    } : null,
    closure: i.closure?.closedAt ? {
      closedBy: String(i.closure.closedBy),
      closedAt: i.closure.closedAt,
      notes: i.closure.notes,
      photo: i.closure.photo?.fileId ? {
        url: `/api/incidents/${i._id}/photo`,
        mimeType: i.closure.photo.mimeType,
        size: i.closure.photo.size,
      } : null,
    } : null,
    clarifications: (i.clarifications || []).map(c => ({
      _id: String(c._id),
      question: c.question,
      requestedAt: c.requestedAt,
      status: c.status,
      responseCount: c.responses?.length || 0,
      responses: isStaff ? (c.responses || []).map(r => ({
        citizenId: String(r.citizenId),
        citizenName: r.citizenName,
        responseChoice: r.responseChoice,
        comment: r.comment,
        at: r.at,
      })) : (c.responses || []).map(r => ({
        responseChoice: r.responseChoice,
        at: r.at,
      })),
    })),
    history: isStaff ? (i.history || []) : [],
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

const createIncidentSchema = z.object({
  title: z.string().trim().min(5).max(200),
  hazardType: z.enum(['flood', 'blocked_road', 'fallen_tree', 'landslide', 'structural_damage', 'other']).default('flood'),
  severity: z.enum(['minor', 'moderate', 'severe', 'critical']).default('moderate'),
  isRoadClosed: z.boolean().default(false),
  reportIds: z.array(z.string()).min(1),
  initialReportStatus: z.enum(['under_review', 'confirmed']).optional(),
}).strict();

const dispatchSchema = z.object({
  crewId: z.string(),
  instructions: z.string().trim().max(1000).optional(),
  markRoadClosed: z.boolean().optional(),
}).strict();

const clarificationSchema = z.object({
  question: z.string().trim().min(5).max(500),
}).strict();

const respondClarificationSchema = z.object({
  responseChoice: z.enum(['confirmed_hazard', 'hazard_cleared', 'uncertain']),
  comment: z.string().trim().max(500).optional(),
}).strict();

export function incidentsRouter({ incidents = Incident, reports = Report, storage = evidenceStore() } = {}) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 2, parts: 4 },
  }).single('photo');

  // 1. List incidents (all authenticated users)
  router.get('/', async (req, res) => {
    const { status, wardId, assigned } = req.query;
    const filter = {};

    if (status === 'active') {
      filter.status = { $in: ['open', 'dispatched', 'in_progress'] };
    } else if (status) {
      filter.status = status;
    }

    if (wardId) {
      filter['ward.id'] = wardId;
    }

    if (assigned === 'me' && req.user?.role === 'crew') {
      filter['dispatch.crewId'] = req.user._id;
    }

    const items = await incidents.find(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
    res.json({ incidents: items.map(item => incidentDto(item, req.user)) });
  });

  // Get available crew units (Officer / Admin) - declared before /:id to avoid route shadowing
  router.get('/crews', allow('officer', 'admin'), async (_req, res) => {
    const crews = await User.find({ role: 'crew' }).select('_id username').lean();
    res.json({ crews: crews.map(c => ({ _id: String(c._id), username: c.username })) });
  });

  // 2. Get single incident
  router.get('/:id', async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Incident not found.' });
    const item = await incidents.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'Incident not found.' });

    const isStaff = req.user && ['officer', 'admin', 'crew'].includes(req.user.role);
    const reportQuery = isStaff
      ? { _id: { $in: item.reportIds } }
      : { _id: { $in: item.reportIds }, ownerId: req.user?._id };

    // Populate linked reports summary respecting privacy boundaries
    const linkedReports = await reports.find(reportQuery).select('_id kind description latitude longitude status photo.fileId createdAt').lean();
    res.json({
      incident: incidentDto(item, req.user),
      linkedReports: linkedReports.map(r => ({
        _id: String(r._id),
        kind: r.kind,
        description: r.description,
        coordinates: { latitude: r.latitude, longitude: r.longitude },
        status: r.status,
        hasPhoto: Boolean(r.photo?.fileId),
        createdAt: r.createdAt,
      })),
      totalLinkedReportsCount: item.reportIds.length,
    });
  });

  // 3. Create incident from reports (Officer / Admin)
  router.post('/', allow('officer', 'admin'), async (req, res) => {
    const parsed = createIncidentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid incident creation data.', details: parsed.error.issues });

    const { title, hazardType, severity, isRoadClosed, reportIds, initialReportStatus } = parsed.data;
    const validReportIds = reportIds.filter(id => mongoose.isObjectIdOrHexString(id));
    if (!validReportIds.length) return res.status(400).json({ error: 'Provide at least one valid report ID.' });

    const matchedReports = await reports.find({ _id: { $in: validReportIds } });
    if (!matchedReports.length) return res.status(404).json({ error: 'No matching reports found.' });

    // Calculate center coordinates
    const sumLat = matchedReports.reduce((acc, r) => acc + r.latitude, 0);
    const sumLon = matchedReports.reduce((acc, r) => acc + r.longitude, 0);
    const center = {
      latitude: Number((sumLat / matchedReports.length).toFixed(6)),
      longitude: Number((sumLon / matchedReports.length).toFixed(6)),
    };

    // Spatial lookup for ward & road
    const wardLookup = findNearestWard(center.latitude, center.longitude);
    const roadLookup = findNearestRoad(center.latitude, center.longitude);

    const incident = await incidents.create({
      title,
      hazardType,
      severity,
      status: 'open',
      isRoadClosed,
      center,
      ward: { id: wardLookup.ward?.id || 'unknown', name: wardLookup.coverageLabel },
      road: { id: roadLookup.road?.id || 'unmapped', name: roadLookup.roadLabel, hierarchy: roadLookup.hierarchy },
      reportIds: matchedReports.map(r => r._id),
      history: [{
        action: 'created',
        actorId: req.user._id,
        actorRole: req.user.role,
        at: new Date(),
        details: { linkedReportCount: matchedReports.length },
      }],
    });

    // Update all linked reports without premature confirmation if under review
    const targetReportStatus = initialReportStatus || (isRoadClosed ? 'confirmed' : 'under_review');
    await reports.updateMany(
      { _id: { $in: matchedReports.map(r => r._id) } },
      {
        $set: { incidentId: incident._id, status: targetReportStatus },
        $push: { history: { action: 'grouped_into_incident', actorId: req.user._id, at: new Date() } },
      }
    );

    // Notify nearby citizens who opted into alerts for this area
    notifyNearbyCitizensOnIncidentCreated(incident).catch(() => {});

    res.status(201).json({ incident: incidentDto(incident, req.user) });
  });

  // 4. Dispatch field crew (Officer / Admin) - IDEMPOTENT GUARD
  router.post('/:id/dispatch', allow('officer', 'admin'), async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Incident not found.' });
    const parsed = dispatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid dispatch instructions.', details: parsed.error.issues });

    const incident = await incidents.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });

    // Idempotency check: Cannot re-dispatch if closed or already dispatched to same crew
    if (incident.status === 'closed') {
      return res.status(409).json({ error: 'Cannot dispatch crew to an already closed incident.' });
    }
    if (incident.status === 'dispatched' && (String(incident.dispatch?.crewId) === parsed.data.crewId || incident.dispatch?.crewName === parsed.data.crewId)) {
      return res.status(409).json({ error: 'This field crew unit is already dispatched to this incident.' });
    }

    let crewUser = null;
    if (mongoose.isObjectIdOrHexString(parsed.data.crewId)) {
      crewUser = await User.findById(parsed.data.crewId);
    }
    if (!crewUser) {
      crewUser = await User.findOne({ username: parsed.data.crewId, role: 'crew' });
    }
    if (!crewUser || crewUser.role !== 'crew') {
      return res.status(400).json({ error: 'Selected responder must have the crew role.' });
    }

    incident.status = 'dispatched';
    incident.dispatch = {
      crewId: crewUser._id,
      crewName: crewUser.username,
      dispatchedBy: req.user._id,
      dispatchedAt: new Date(),
      instructions: parsed.data.instructions || 'Inspect and clear hazard.',
    };
    if (parsed.data.markRoadClosed !== undefined) {
      incident.isRoadClosed = parsed.data.markRoadClosed;
    }
    incident.history.push({
      action: 'dispatched',
      actorId: req.user._id,
      actorRole: req.user.role,
      at: new Date(),
      details: { crewId: String(crewUser._id), crewName: crewUser.username },
    });
    await incident.save();

    // Update linked reports
    await reports.updateMany(
      { _id: { $in: incident.reportIds } },
      {
        $set: { status: 'dispatched' },
        $push: { history: { action: 'crew_dispatched', actorId: req.user._id, at: new Date() } },
      }
    );

    res.json({ incident: incidentDto(incident) });
  });

  // 5. Ask for clarification from citizens (Officer / Admin)
  router.post('/:id/clarification', allow('officer', 'admin'), async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Incident not found.' });
    const parsed = clarificationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Clarification question required (5–500 chars).' });

    const incident = await incidents.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });

    incident.clarifications.push({
      question: parsed.data.question,
      requestedAt: new Date(),
      requestedBy: req.user._id,
      status: 'active',
      responses: [],
    });
    incident.history.push({
      action: 'clarification_requested',
      actorId: req.user._id,
      actorRole: req.user.role,
      at: new Date(),
      details: { question: parsed.data.question },
    });
    await incident.save();

    res.status(201).json({ incident: incidentDto(incident) });
  });

  // 6. Citizen responds to clarification
  router.post('/:id/clarification/:cid/respond', allow('citizen', 'officer', 'admin'), async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Incident not found.' });
    const parsed = respondClarificationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a valid response choice.' });

    const incident = await incidents.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });

    const clar = incident.clarifications.id(req.params.cid);
    if (!clar) return res.status(404).json({ error: 'Clarification request not found.' });

    if (clar.status !== 'active') {
      return res.status(409).json({ error: 'This clarification inquiry is no longer active.' });
    }

    const alreadyResponded = (clar.responses || []).some(
      r => String(r.citizenId) === String(req.user._id)
    );
    if (alreadyResponded) {
      return res.status(409).json({ error: 'You have already submitted a response for this inquiry.' });
    }

    clar.responses.push({
      citizenId: req.user._id,
      citizenName: req.user.username,
      responseChoice: parsed.data.responseChoice,
      comment: parsed.data.comment || '',
      at: new Date(),
    });
    await incident.save();

    res.json({ incident: incidentDto(incident) });
  });

  // 7. Crew closure with photo upload (Crew / Admin)
  router.post('/:id/close', allow('crew', 'admin'), (req, res, next) => {
    if (!req.is('multipart/form-data')) return res.status(415).json({ error: 'Submit multipart form data with a closure photo and resolution notes.' });
    upload(req, res, next);
  }, async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Incident not found.' });
    if (!req.file) return res.status(400).json({ error: 'A physical resolution photo is mandatory for crew closure.' });

    const incident = await incidents.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });

    // Crew authorization check: only assigned crew or admin can close
    if (req.user.role === 'crew' && String(incident.dispatch?.crewId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only the assigned field crew unit can close this job.' });
    }
    if (incident.status === 'closed') {
      return res.status(409).json({ error: 'This incident is already closed.' });
    }

    const photoMeta = await inspectImage(req.file.buffer);
    const fileId = await storage.save(req.file.buffer, {
      ...photoMeta,
      ownerId: String(req.user._id),
      submissionKey: `closure-${incident._id}-${Date.now()}`,
    });

    incident.status = 'closed';
    incident.isRoadClosed = false; // Re-open road upon verified closure!
    incident.closure = {
      closedBy: req.user._id,
      closedAt: new Date(),
      notes: req.body?.notes || 'Hazard rectified on site.',
      photo: { ...photoMeta, fileId },
    };
    incident.history.push({
      action: 'closed_by_crew',
      actorId: req.user._id,
      actorRole: req.user.role,
      at: new Date(),
      details: { notes: incident.closure.notes },
    });
    await incident.save();

    // Mark all linked citizen reports as resolved!
    await reports.updateMany(
      { _id: { $in: incident.reportIds } },
      {
        $set: { status: 'resolved' },
        $push: { history: { action: 'resolved_by_crew', actorId: req.user._id, at: new Date() } },
      }
    );

    // Notify nearby citizens that hazard is cleared and road corridor is re-opened
    notifyNearbyCitizensOnIncidentResolved(incident).catch(() => {});

    res.json({ incident: incidentDto(incident) });
  });

  // 8. Stream closure photo
  router.get('/:id/photo', async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Incident not found.' });
    const incident = await incidents.findById(req.params.id).lean();
    if (!incident || !incident.closure?.photo?.fileId) {
      return res.status(404).json({ error: 'No closure photo stored for this incident.' });
    }

    res.set({
      'Content-Type': incident.closure.photo.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    });
    const stream = storage.open(incident.closure.photo.fileId);
    stream.on('error', () => { if (!res.headersSent) res.status(503).json({ error: 'Photo is temporarily unavailable.' }); else res.destroy(); });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });

  return router;
}
