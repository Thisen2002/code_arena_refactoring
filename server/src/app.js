import express from 'express';
import mongoose from 'mongoose';
import { Report } from './models/Report.js';
import { Incident } from './models/Incident.js';
import path from 'node:path';
import { authRouter, identify, requireUser, protectWrites } from './auth.js';
import { reportsRouter } from './reports.js';
import { incidentsRouter } from './incidents.js';
import { alertsRouter } from './alerts.js';
import { routingRouter } from './routing.js';
import { reliefRouter } from './relief.js';
import { adminRouter } from './admin.js';
import { notificationsRouter } from './notifications.js';
import { evidenceStore } from './evidence.js';
import { allow } from './auth.js';

// Injection supports isolated HTTP contract tests; production always uses Mongoose.
export function createApp({ reports = Report, incidents = Incident, connection = mongoose.connection, databaseConfigured = false, clientDirectory } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', protectWrites);
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (_req, res) => {
    const connected = connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
      server: 'ready', ready: connected,
      database: { configured: databaseConfigured, status: ['disconnected', 'connected', 'connecting', 'disconnecting'][connection.readyState] || 'unknown' },
    });
  });
  function requireDatabase(_req, res, next) {
    if (connection.readyState !== 1) return res.status(503).json({ error: 'Database unavailable. Try again after the database is connected.' });
    next();
  }
  app.use('/api/auth', requireDatabase, authRouter());
  app.use('/api/reports', requireDatabase, identify, requireUser, reportsRouter({ reports, storage: evidenceStore(connection) }));
  app.use('/api/incidents', requireDatabase, identify, requireUser, incidentsRouter({ incidents, reports, storage: evidenceStore(connection) }));
  app.use('/api', identify, alertsRouter({ requireAuth: requireUser, requireRole: roles => allow(...roles) }));
  app.use('/api', identify, notificationsRouter({ requireAuth: requireUser, requireDatabase }));
  app.use('/api/routing', routingRouter());
  app.use('/api/relief', requireDatabase, identify, reliefRouter({ requireAuth: requireUser, requireRole: roles => allow(...roles) }));
  app.use('/api/admin', requireDatabase, identify, adminRouter({ requireAuth: requireUser, requireRole: roles => allow(...roles) }));
  // Optional single-process hosting: API and built React assets share one origin.
  // Unknown API routes must never fall through to the frontend HTML.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  if (clientDirectory) {
    app.use(express.static(clientDirectory));
    app.get('/', (_req, res) => res.sendFile(path.join(clientDirectory, 'index.html')));
  }
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.destroy();
    if (error.name === 'MulterError') return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'Upload one JPEG, PNG or WebP photo up to 5 MiB and one report field.' });
    if (error.code === 'INVALID_IMAGE') return res.status(400).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large.' });
    // Never return or log driver errors, request bodies, connection strings, or API keys.
    res.status(503).json({ error: 'Unable to complete the request. Please try again.' });
  });
  return app;
}
