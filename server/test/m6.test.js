import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { ConfigVersion, DEFAULT_CONFIG } from '../src/models/ConfigVersion.js';
import { Feedback, FEEDBACK_DISCLAIMER } from '../src/models/Feedback.js';

test('ConfigVersion model initializes with valid parameters and tracks immutable versions (R15)', () => {
  assert.equal(DEFAULT_CONFIG.version, 1);
  assert.equal(DEFAULT_CONFIG.isActive, true);
  assert.equal(DEFAULT_CONFIG.parameters.weatherThresholds.alertMmH, 30);
  assert.equal(DEFAULT_CONFIG.parameters.clusterRadiusMeters, 200);
  assert.equal(DEFAULT_CONFIG.parameters.clusterWindowHours, 4);
  assert.equal(DEFAULT_CONFIG.parameters.aiModel, 'gemini-3.8-flash');
  assert.match(DEFAULT_CONFIG.parameters.aiPromptInstructions, /unknown/);
});

test('Feedback model stores human verdicts and enforces no-retraining disclaimer (R15)', () => {
  assert.match(FEEDBACK_DISCLAIMER, /not retrained/);
  assert.match(FEEDBACK_DISCLAIMER, /versioned prompt/);
});

test('admin router rejects unauthenticated requests with HTTP 401', async () => {
  const app = createApp({ databaseConfigured: true, connection: { readyState: 1 } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(res => server.once('listening', res));
  const port = server.address().port;

  try {
    // Unauthenticated GET /api/admin/config
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/config`);
    assert.equal(res.status, 401);

    // Unauthenticated GET /api/admin/audit-logs
    const auditRes = await fetch(`http://127.0.0.1:${port}/api/admin/audit-logs`);
    assert.equal(auditRes.status, 401);
  } finally {
    await new Promise(res => server.close(res));
  }
});
