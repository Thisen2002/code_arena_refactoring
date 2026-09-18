import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { Report } from './models/Report.js';
import { allow } from './auth.js';
import { reportInput, listInput } from './validation.js';
import { evidenceStore, inspectImage, MAX_PHOTO_BYTES } from './evidence.js';

import { evaluateReport } from './services/assessmentService.js';

export function reportScope(user) {
  if (user.role === 'citizen') return { ownerId: user._id };
  if (user.role === 'relief') return { kind: 'help' };
  if (['officer', 'admin'].includes(user.role)) return {};
  return null;
}
export function reportDto(document) {
  const r = document.toObject ? document.toObject() : document;
  return {
    _id: String(r._id), kind: r.kind || 'hazard', description: r.description,
    helpCategory: r.helpCategory, latitude: r.latitude, longitude: r.longitude,
    locationSource: r.locationSource || 'manual', gpsAccuracy: r.gpsAccuracy,
    status: r.status, locationEvidence: 'unverified', createdAt: r.createdAt,
    legacy: !r.ownerId, history: r.history || [],
    photo: r.photo?.fileId ? { url: `/api/reports/${r._id}/photo`, mimeType: r.photo.mimeType, size: r.photo.size, sha256: r.photo.sha256, exifGps: r.photo.exifGps?.latitude !== undefined ? r.photo.exifGps : null } : null,
    assessment: r.assessment?.status ? {
      status: r.assessment.status,
      evaluatedAt: r.assessment.evaluatedAt,
      error: r.assessment.error,
      caseSnapshot: r.assessment.caseSnapshot,
      checks: r.assessment.checks,
      aggregator: r.assessment.aggregator,
    } : null,
  };
}
export function reportsRouter({ reports = Report, storage = evidenceStore() } = {}) {
  const router = Router();
  // Busboy signals partsLimit on reaching the configured count; allow its terminal
  // boundary while files/fields still strictly enforce one of each.
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 1, fieldSize: 8192, parts: 3 } }).single('photo');
  const throttle = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many uploads. Please wait a minute.' } });
  router.post('/', allow('citizen'), throttle, (req, res, next) => {
    if (req.user?.isRestricted) return res.status(403).json({ error: 'Your account has been administratively restricted from submitting reports.' });
    if (!req.is('multipart/form-data')) return res.status(415).json({ error: 'Submit multipart form data with one photo and one report JSON field.' });
    upload(req, res, next);
  }, async (req, res) => {
    let body;
    try { body = JSON.parse(req.body?.report); } catch { return res.status(400).json({ error: 'Report must be valid JSON.' }); }
    const parsed = reportInput.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid report.', fields: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    if (!req.file) return res.status(400).json({ error: 'A photo is required for new reports and help requests.' });
    const photo = await inspectImage(req.file.buffer);
    const input = parsed.data;
    const requestHash = createHash('sha256').update(JSON.stringify(input)).update(photo.sha256).digest('hex');
    const key = { ownerId: req.user._id, submissionKey: input.submissionKey };
    async function replay() {
      const existing = await reports.findOne(key).select('+requestHash');
      if (!existing) return false;
      if (existing.requestHash !== requestHash) res.status(409).json({ error: 'This submission key was already used for different evidence. Start a new report.' });
      else res.status(200).json({ report: reportDto(existing), replayed: true });
      return true;
    }
    await reports.init(); // Wait for the unique submission index before accepting a write.
    if (await replay()) return;
    const fileId = await storage.save(req.file.buffer, { ...photo, ownerId: String(req.user._id), submissionKey: input.submissionKey });
    try {
      const report = await reports.create({ ...input, ownerId: req.user._id, photo: { ...photo, fileId }, requestHash, history: [{ action: 'submitted', actorId: req.user._id, at: new Date() }] });
      res.status(201).json({ report: reportDto(report) });
    } catch (error) {
      // A failed/duplicate report must not leave its newly uploaded file behind.
      await storage.remove(fileId).catch(() => { console.warn('Evidence cleanup needs review.'); });
      if (error.code === 11000 && await replay()) return;
      throw error;
    }
  });
  router.use(allow('citizen', 'officer', 'relief', 'admin'));
  router.get('/', async (req, res) => {
    const parsed = listInput.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Use limit 1–100, offset 0–100000, and optional kind hazard/help.' });
    const { limit, offset, kind } = parsed.data;
    const scope = reportScope(req.user);
    const filter = kind ? { $and: [scope, { kind }] } : scope;
    const rows = await reports.find(filter).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit + 1).lean();
    res.json({ reports: rows.slice(0, limit).map(reportDto), hasMore: rows.length > limit, limit, offset });
  });
  async function findVisible(req, res, next) {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Report not found.' });
    req.report = await reports.findOne({ $and: [{ _id: req.params.id }, reportScope(req.user)] }).lean();
    if (!req.report) return res.status(404).json({ error: 'Report not found.' });
    next();
  }
  router.get('/:id', findVisible, (req, res) => res.json({ report: reportDto(req.report) }));
  router.get('/:id/photo', findVisible, (req, res) => {
    if (!req.report.photo?.fileId) return res.status(404).json({ error: 'No photo is stored for this report.' });
    res.set({ 'Content-Type': req.report.photo.mimeType, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' });
    const stream = storage.open(req.report.photo.fileId);
    stream.on('error', () => { if (!res.headersSent) res.status(503).json({ error: 'Photo is temporarily unavailable.' }); else res.destroy(); });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
  router.post('/:id/evaluate', allow('officer', 'admin'), findVisible, async (req, res) => {
    let photoBuffer = null;
    if (req.report.photo?.fileId && storage.readBuffer) {
      try {
        photoBuffer = await storage.readBuffer(req.report.photo.fileId);
      } catch {
        // Handled gracefully inside evaluateReport
      }
    }
    const assessment = await evaluateReport({
      report: req.report,
      reportsModel: reports,
      photoBuffer,
      actorId: req.user._id,
    });
    const updated = await reports.findByIdAndUpdate(
      req.report._id,
      {
        $set: { assessment },
        $push: { history: { action: 'evaluated', actorId: req.user._id, at: new Date() } },
      },
      { new: true }
    ).lean();
    res.json({ report: reportDto(updated || { ...req.report, assessment }), assessment });
  });
  router.get('/:id/case', findVisible, (req, res) => {
    res.json({ case: req.report.assessment || null, report: reportDto(req.report) });
  });
  return router;
}
