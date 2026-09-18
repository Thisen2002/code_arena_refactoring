import express from 'express';
import { ConfigVersion, ensureDefaultConfig } from './models/ConfigVersion.js';
import { Feedback, FEEDBACK_DISCLAIMER } from './models/Feedback.js';
import { User } from './models/User.js';
import { Report } from './models/Report.js';
import { Incident } from './models/Incident.js';

export function adminRouter({ requireAuth, requireRole } = {}) {
  const router = express.Router();

  const adminOnly = (requireAuth && requireRole)
    ? [requireAuth, requireRole(['admin'])]
    : [];

  const staffGuard = (requireAuth && requireRole)
    ? [requireAuth, requireRole(['officer', 'admin'])]
    : [];

  // 1. Get configuration and version history
  router.get('/config', ...adminOnly, async (req, res) => {
    try {
      await ensureDefaultConfig();
      const [activeConfig, versions] = await Promise.all([
        ConfigVersion.findOne({ isActive: true }).lean(),
        ConfigVersion.find().sort({ version: -1 }).limit(20).lean(),
      ]);

      res.json({
        activeConfig,
        versions,
        notice: 'Configuration changes update versioned deterministic rules and prompts. Model weights are never retrained.',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Deploy new versioned configuration
  router.post('/config', ...adminOnly, async (req, res) => {
    try {
      const { parameters, changeSummary } = req.body || {};

      if (!changeSummary || typeof changeSummary !== 'string' || changeSummary.trim().length < 5) {
        return res.status(400).json({ error: 'A change summary of at least 5 characters is required for version audit.' });
      }

      await ensureDefaultConfig();
      const latest = await ConfigVersion.findOne().sort({ version: -1 });
      const nextVersion = (latest?.version || 0) + 1;

      // Deactivate all previous versions
      await ConfigVersion.updateMany({}, { $set: { isActive: false } });

      const prevParams = latest?.parameters?.toObject ? latest.parameters.toObject() : latest?.parameters || {};
      const mergedParams = {
        ...prevParams,
        ...(parameters || {}),
        weatherThresholds: {
          ...(prevParams.weatherThresholds || {}),
          ...(parameters?.weatherThresholds || {}),
        },
      };

      const newConfig = await ConfigVersion.create({
        version: nextVersion,
        isActive: true,
        parameters: mergedParams,
        changeSummary: changeSummary.trim(),
        deployedBy: req.user?._id,
        deployedAt: new Date(),
      });

      res.status(201).json({ success: true, config: newConfig });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 3. Roll back to an earlier configuration version
  router.post('/config/:version/rollback', ...adminOnly, async (req, res) => {
    try {
      const targetVersion = parseInt(req.params.version, 10);
      const target = await ConfigVersion.findOne({ version: targetVersion });
      if (!target) {
        return res.status(404).json({ error: `Configuration version ${targetVersion} not found.` });
      }

      const latest = await ConfigVersion.findOne().sort({ version: -1 });
      const nextVersion = (latest?.version || 0) + 1;

      await ConfigVersion.updateMany({}, { $set: { isActive: false } });

      const rollbackConfig = await ConfigVersion.create({
        version: nextVersion,
        isActive: true,
        parameters: target.parameters,
        changeSummary: `Rollback to Version ${target.version}: ${target.changeSummary}`,
        deployedBy: req.user?._id,
        deployedAt: new Date(),
      });

      res.json({ success: true, config: rollbackConfig });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 4. List human review feedback
  router.get('/feedback', ...staffGuard, async (req, res) => {
    try {
      const feedbackItems = await Feedback.find()
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('reportId', 'kind description status')
        .populate('submittedBy', 'username role')
        .lean();

      // Aggregate simple analytics
      const byVerdict = { confirmed: 0, needs_verification: 0, rejected: 0 };
      const byTag = {};

      for (const item of feedbackItems) {
        if (byVerdict[item.humanVerdict] !== undefined) {
          byVerdict[item.humanVerdict]++;
        }
        for (const tag of (item.tags || [])) {
          byTag[tag] = (byTag[tag] || 0) + 1;
        }
      }

      res.json({
        feedback: feedbackItems,
        analytics: {
          total: feedbackItems.length,
          byVerdict,
          byTag,
        },
        disclaimer: FEEDBACK_DISCLAIMER,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Submit human evaluation feedback
  router.post('/feedback', ...staffGuard, async (req, res) => {
    try {
      const { reportId, humanVerdict, humanUrgency, tags = [], notes = '' } = req.body || {};

      if (!reportId || !humanVerdict) {
        return res.status(400).json({ error: 'Both reportId and humanVerdict are required.' });
      }

      const report = await Report.findById(reportId);
      if (!report) {
        return res.status(404).json({ error: 'Report not found.' });
      }

      await ensureDefaultConfig();
      const activeConfig = await ConfigVersion.findOne({ isActive: true });

      const feedback = await Feedback.create({
        reportId: report._id,
        aiVerdict: report.assessment?.aggregator?.verdict || 'unassessed',
        aiUrgency: report.assessment?.aggregator?.urgency || 'unassessed',
        humanVerdict,
        humanUrgency: humanUrgency || report.assessment?.aggregator?.urgency,
        tags: Array.isArray(tags) ? tags : [],
        notes: String(notes).trim(),
        configVersion: activeConfig?.version || 1,
        submittedBy: req.user?._id,
        submittedAt: new Date(),
      });

      report.history.push({
        action: 'human_feedback_recorded',
        actorId: req.user?._id,
        at: new Date(),
      });
      await report.save();

      res.status(201).json({
        success: true,
        feedback,
        disclaimer: FEEDBACK_DISCLAIMER,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 6. Restrict or unrestrict a reporter account
  router.post('/reporters/:id/restrict', ...adminOnly, async (req, res) => {
    try {
      const { isRestricted = true, reason = '' } = req.body || {};
      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({ error: 'User account not found.' });
      }

      if (user.role === 'admin') {
        return res.status(400).json({ error: 'Cannot restrict administrative accounts.' });
      }

      user.isRestricted = Boolean(isRestricted);
      user.restrictionReason = String(reason).trim();
      await user.save();

      res.json({
        success: true,
        user: {
          _id: user._id,
          username: user.username,
          role: user.role,
          isRestricted: user.isRestricted,
          restrictionReason: user.restrictionReason,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 7. Administrative Incident Override
  router.post('/incidents/:id/override', ...adminOnly, async (req, res) => {
    try {
      const { status = 'closed', reason = 'Administrative action', reopenRoad = true } = req.body || {};
      const incident = await Incident.findById(req.params.id);

      if (!incident) {
        return res.status(404).json({ error: 'Incident not found.' });
      }

      const prevStatus = incident.status;
      incident.status = status;
      if (reopenRoad || status === 'closed') {
        incident.isRoadClosed = false;
      }

      incident.history.push({
        action: 'admin_override',
        actorId: req.user?._id,
        actorRole: req.user?.role,
        at: new Date(),
        details: { prevStatus, newStatus: status, reason: String(reason).trim() },
      });

      await incident.save();

      // If closed, resolve linked reports
      if (status === 'closed' && incident.reportIds?.length > 0) {
        await Report.updateMany(
          { _id: { $in: incident.reportIds } },
          { $set: { status: 'resolved' } }
        );
      }

      res.json({ success: true, incident });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 8. Unified System Audit Log
  router.get('/audit-logs', ...adminOnly, async (req, res) => {
    try {
      const [recentIncidents, recentConfigs, recentFeedback, restrictedUsers] = await Promise.all([
        Incident.find().select('title status history center road isRoadClosed updatedAt').sort({ updatedAt: -1 }).limit(20).lean(),
        ConfigVersion.find().select('version changeSummary deployedAt deployedBy').sort({ version: -1 }).limit(10).lean(),
        Feedback.find().select('reportId humanVerdict tags notes createdAt submittedBy').sort({ createdAt: -1 }).limit(15).lean(),
        User.find({ isRestricted: true }).select('username role restrictionReason updatedAt').lean(),
      ]);

      const events = [];

      for (const inc of recentIncidents) {
        for (const h of (inc.history || [])) {
          events.push({
            type: 'incident_event',
            title: `Incident: ${inc.title}`,
            action: h.action,
            actorId: h.actorId,
            actorRole: h.actorRole,
            timestamp: h.at,
            details: h.details || { status: inc.status, road: inc.road?.name },
          });
        }
      }

      for (const cfg of recentConfigs) {
        events.push({
          type: 'config_event',
          title: `Config Version ${cfg.version} Deployed`,
          action: 'config_deployed',
          actorId: cfg.deployedBy,
          timestamp: cfg.deployedAt,
          details: { summary: cfg.changeSummary },
        });
      }

      for (const fb of recentFeedback) {
        events.push({
          type: 'feedback_event',
          title: `Human Review: ${fb.humanVerdict}`,
          action: 'feedback_recorded',
          actorId: fb.submittedBy,
          timestamp: fb.createdAt,
          details: { tags: fb.tags, notes: fb.notes },
        });
      }

      // Sort by timestamp descending
      events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      res.json({
        logs: events.slice(0, 50),
        restrictedUsers,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
