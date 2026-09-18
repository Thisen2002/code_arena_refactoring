import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Notification } from './models/Notification.js';
import { User } from './models/User.js';
import { DEMO_WARDS } from './data/demoRegion.js';

const savedLocationSchema = z.object({
  optInAlerts: z.boolean(),
  wardId: z.string().trim().max(50).optional().nullable(),
  wardName: z.string().trim().max(100).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  channelEmail: z.boolean().optional(),
});

export function notificationsRouter({ requireAuth, requireDatabase } = {}) {
  const router = express.Router();
  const auth = requireAuth || ((_req, _res, next) => next());
  const db = requireDatabase || ((_req, _res, next) => next());

  // 1. Get current citizen's in-app notifications
  router.get('/notifications', db, auth, async (req, res) => {
    try {
      const items = await Notification.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const unreadCount = await Notification.countDocuments({
        userId: req.user._id,
        read: false,
      });

      res.json({
        notifications: items.map(n => ({
          _id: String(n._id),
          type: n.type,
          title: n.title,
          message: n.message,
          area: n.area,
          severity: n.severity,
          source: n.source,
          incidentId: n.incidentId ? String(n.incidentId) : null,
          alertId: n.alertId || null,
          read: n.read,
          emailDelivery: n.emailDelivery || null,
          createdAt: n.createdAt,
        })),
        unreadCount,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Mark notification as read
  router.patch('/notifications/:id/read', db, auth, async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    try {
      const updated = await Notification.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        { $set: { read: true } },
        { new: true }
      ).lean();

      if (!updated) return res.status(404).json({ error: 'Notification not found.' });

      res.json({ success: true, notification: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Mark all notifications as read
  router.post('/notifications/mark-all-read', db, auth, async (req, res) => {
    try {
      await Notification.updateMany(
        { userId: req.user._id, read: false },
        { $set: { read: true } }
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Get citizen's saved monitored location
  router.get('/user/saved-location', db, auth, async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select('savedLocation').lean();
      res.json({
        savedLocation: user?.savedLocation || {
          optInAlerts: false,
          wardId: '',
          wardName: '',
          latitude: null,
          longitude: null,
          email: '',
          channelEmail: false,
        },
        availableWards: DEMO_WARDS.map(w => ({
          id: w.id,
          name: w.name,
          center: w.center,
          district: w.district,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Save citizen's monitored location preferences
  router.put('/user/saved-location', db, auth, async (req, res) => {
    const parsed = savedLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid location settings.',
        details: parsed.error.issues,
      });
    }

    const data = parsed.data;

    // Resolve wardName if wardId was provided
    let resolvedWardName = data.wardName || '';
    if (data.wardId && !resolvedWardName) {
      const matched = DEMO_WARDS.find(w => w.id === data.wardId);
      if (matched) resolvedWardName = matched.name;
    }

    const payload = {
      optInAlerts: Boolean(data.optInAlerts),
      wardId: data.wardId || undefined,
      wardName: resolvedWardName || undefined,
      latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
      longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
      email: data.email || undefined,
      channelEmail: Boolean(data.channelEmail && data.email),
      updatedAt: new Date(),
    };

    try {
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { savedLocation: payload } },
        { new: true }
      ).select('savedLocation').lean();

      res.json({
        success: true,
        savedLocation: updatedUser?.savedLocation,
        message: payload.optInAlerts
          ? 'Saved monitored location. You will receive in-app alerts when emergencies affect this area.'
          : 'Saved location preferences updated.',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
