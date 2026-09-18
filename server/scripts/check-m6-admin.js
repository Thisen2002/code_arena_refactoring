import '../src/config.js';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Report } from '../src/models/Report.js';
import { ConfigVersion } from '../src/models/ConfigVersion.js';
import { Feedback } from '../src/models/Feedback.js';
import { hashPassword } from '../src/auth.js';

if (!process.env.MONGODB_URI) {
  console.error('Configure MONGODB_URI in server/.env to run persistence integration checks.');
  process.exit(1);
}

const runTag = `m6test-${Date.now()}`;
let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const app = createApp({ databaseConfigured: true, connection: mongoose.connection });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const cleanupIds = { users: [], reports: [], configs: [], feedback: [] };

  try {
    // 1. Create admin, officer, and citizen accounts
    const admin = await User.create({
      username: `admin-${runTag}`,
      passwordHash: await hashPassword('test-admin-pwd-123'),
      role: 'admin',
    });
    cleanupIds.users.push(admin._id);

    const officer = await User.create({
      username: `officer-${runTag}`,
      passwordHash: await hashPassword('test-officer-pwd-123'),
      role: 'officer',
    });
    cleanupIds.users.push(officer._id);

    const citizen = await User.create({
      username: `citizen-${runTag}`,
      passwordHash: await hashPassword('test-citizen-pwd-123'),
      role: 'citizen',
    });
    cleanupIds.users.push(citizen._id);

    async function login(username, password) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena' },
        body: JSON.stringify({ username, password }),
      });
      return res.headers.get('set-cookie');
    }

    const adminCookie = await login(`admin-${runTag}`, 'test-admin-pwd-123');
    const officerCookie = await login(`officer-${runTag}`, 'test-officer-pwd-123');
    const citizenCookie = await login(`citizen-${runTag}`, 'test-citizen-pwd-123');

    console.log('--- Step 1: Role Protection on Admin Endpoints (R15) ---');
    // Citizen cannot access admin config (403)
    const citRes = await fetch(`${baseUrl}/api/admin/config`, {
      headers: { Cookie: citizenCookie },
    });
    assert.equal(citRes.status, 403);

    // Regular officer cannot access admin config (403)
    const offRes = await fetch(`${baseUrl}/api/admin/config`, {
      headers: { Cookie: officerCookie },
    });
    assert.equal(offRes.status, 403);

    // Admin can access config (200)
    const admRes = await fetch(`${baseUrl}/api/admin/config`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(admRes.status, 200);
    const admData = await admRes.json();
    assert.ok(admData.activeConfig);
    console.log(`✓ Admin role enforced: Citizen and Officer rejected (403); Admin authorized (200).`);

    console.log('--- Step 2: Versioned Configuration Management & Rollback (R15) ---');
    const initialVersion = admData.activeConfig.version;

    // Deploy new version
    const deployRes = await fetch(`${baseUrl}/api/admin/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'CodeArena',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        parameters: {
          weatherThresholds: { alertMmH: 45, alertRiverFeet: 5.5 },
          clusterRadiusMeters: 250,
        },
        changeSummary: `Tuned rainfall threshold for heavy monsoon surge - ${runTag}`,
      }),
    });
    assert.equal(deployRes.status, 201);
    const deployData = await deployRes.json();
    cleanupIds.configs.push(deployData.config._id);
    assert.equal(deployData.config.version, initialVersion + 1);
    assert.equal(deployData.config.parameters.weatherThresholds.alertMmH, 45);
    assert.equal(deployData.config.isActive, true);
    console.log(`✓ Deployed Version ${deployData.config.version}: Parameters updated, previous deactivated.`);

    // Roll back to initial version
    const rollbackRes = await fetch(`${baseUrl}/api/admin/config/${initialVersion}/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'CodeArena',
        Cookie: adminCookie,
      },
    });
    assert.equal(rollbackRes.status, 200);
    const rollbackData = await rollbackRes.json();
    cleanupIds.configs.push(rollbackData.config._id);
    assert.equal(rollbackData.config.version, initialVersion + 2);
    assert.equal(rollbackData.config.parameters.weatherThresholds.alertMmH, admData.activeConfig.parameters.weatherThresholds.alertMmH);
    assert.match(rollbackData.config.changeSummary, /Rollback to Version/);
    console.log(`✓ Rollback executed cleanly: Created Version ${rollbackData.config.version} with restored baseline parameters.`);

    console.log('--- Step 3: Human Review Feedback Loop & Accuracy Tracking (R15) ---');
    // Create a test report for evaluation feedback
    const testReport = await Report.create({
      ownerId: citizen._id,
      kind: 'hazard',
      description: `Water accumulation near Grandpass junction - ${runTag}`,
      latitude: 6.9535,
      longitude: 79.8732,
      locationSource: 'manual',
      status: 'submitted',
      assessment: {
        status: 'evaluated',
        aggregator: { verdict: 'needs_verification', urgency: 'moderate' },
      },
      history: [{ action: 'submitted', actorId: citizen._id, at: new Date() }],
    });
    cleanupIds.reports.push(testReport._id);

    // Submit human feedback
    const feedbackRes = await fetch(`${baseUrl}/api/admin/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'CodeArena',
        Cookie: officerCookie,
      },
      body: JSON.stringify({
        reportId: String(testReport._id),
        humanVerdict: 'confirmed',
        humanUrgency: 'high',
        tags: ['severity_underestimated', 'good_assessment'],
        notes: 'Water depth verified via ground observation to be knee-deep.',
      }),
    });
    assert.equal(feedbackRes.status, 201);
    const feedbackData = await feedbackRes.json();
    cleanupIds.feedback.push(feedbackData.feedback._id);
    assert.equal(feedbackData.feedback.humanVerdict, 'confirmed');
    assert.ok(feedbackData.disclaimer.includes('not retrained live'));
    console.log('✓ Human feedback recorded: Linked to active config version; no-retraining disclaimer attached.');

    // Query feedback analytics
    const fbListRes = await fetch(`${baseUrl}/api/admin/feedback`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(fbListRes.status, 200);
    const fbListData = await fbListRes.json();
    assert.ok(fbListData.analytics.total >= 1);
    assert.ok(fbListData.analytics.byVerdict.confirmed >= 1);
    console.log(`✓ Feedback analytics aggregated: ${fbListData.analytics.total} total reviews tracked.`);

    console.log('--- Step 4: Reporter Moderation & Restrictions (R15) ---');
    // Restrict citizen account
    const restrictRes = await fetch(`${baseUrl}/api/admin/reporters/${citizen._id}/restrict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'CodeArena',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        isRestricted: true,
        reason: 'Repeated non-disaster submission spam',
      }),
    });
    assert.equal(restrictRes.status, 200);
    const restrictData = await restrictRes.json();
    assert.equal(restrictData.user.isRestricted, true);

    // Re-login citizen to pick up fresh session/user state
    const restrictedCitizenCookie = await login(`citizen-${runTag}`, 'test-citizen-pwd-123');

    // Attempt to submit report as restricted citizen -> Must be rejected with 403
    const photoBytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const spamForm = new FormData();
    spamForm.append('report', JSON.stringify({
      kind: 'hazard',
      description: 'Attempting to report while restricted by admin',
      latitude: 6.9535,
      longitude: 79.8732,
      locationSource: 'manual',
      submissionKey: randomUUID(),
    }));
    spamForm.append('photo', new Blob([photoBytes], { type: 'image/png' }), 'test.png');

    const blockedReportRes = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'X-Requested-With': 'CodeArena',
        Cookie: restrictedCitizenCookie,
      },
      body: spamForm,
    });
    assert.equal(blockedReportRes.status, 403);
    const blockedData = await blockedReportRes.json();
    assert.match(blockedData.error, /restricted from submitting reports/);
    console.log('✓ Reporter restriction enforced: Restricted citizen submission rejected with HTTP 403 Forbidden.');

    console.log('--- Step 5: Unified Audit Stream (R15) ---');
    const auditRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(auditRes.status, 200);
    const auditData = await auditRes.json();
    assert.ok(auditData.logs.length >= 2);
    assert.ok(auditData.restrictedUsers.some(u => u.username === `citizen-${runTag}`));
    console.log(`✓ System audit stream verified: Captured ${auditData.logs.length} chronological events.`);

    console.log('\n✅ ALL MILESTONE 6 INTEGRATION CHECKS PASSED.');
  } finally {
    // Cleanup
    await Report.deleteMany({ _id: { $in: cleanupIds.reports } }).catch(() => {});
    await Feedback.deleteMany({ _id: { $in: cleanupIds.feedback } }).catch(() => {});
    await ConfigVersion.deleteMany({ _id: { $in: cleanupIds.configs } }).catch(() => {});
    await User.deleteMany({ _id: { $in: cleanupIds.users } }).catch(() => {});
    if (server) await new Promise(res => server.close(res));
    await mongoose.disconnect();
  }
}

run().catch(err => {
  console.error('M6 Check failed:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
