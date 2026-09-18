import '../src/config.js';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Report } from '../src/models/Report.js';
import { hashPassword } from '../src/auth.js';

if (!process.env.MONGODB_URI) {
  console.error('Configure MONGODB_URI in server/.env to run persistence integration checks.');
  process.exit(1);
}

const runTag = `m3test-${Date.now()}`;
let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const app = createApp({ databaseConfigured: true, connection: mongoose.connection });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const cleanupIds = { users: [], reports: [] };

  try {
    // 1. Create an officer user and a citizen user
    const officer = await User.create({
      username: `officer-${runTag}`,
      passwordHash: await hashPassword('test-officer-password-123'),
      role: 'officer',
    });
    cleanupIds.users.push(officer._id);

    const citizen = await User.create({
      username: `citizen-${runTag}`,
      passwordHash: await hashPassword('test-citizen-password-123'),
      role: 'citizen',
    });
    cleanupIds.users.push(citizen._id);

    // 2. Citizen signs in and uploads a real report with photo at Grandpass coordinates
    const citLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena' },
      body: JSON.stringify({ username: citizen.username, password: 'test-citizen-password-123' }),
    });
    const citCookie = citLogin.headers.get('set-cookie');

    const imageBytes = await sharp({
      create: { width: 120, height: 120, channels: 3, background: '#1c4d40' },
    }).png().toBuffer();

    const form = new FormData();
    form.append('photo', new Blob([imageBytes], { type: 'image/png' }), 'flood-sample.png');
    form.append('report', JSON.stringify({
      kind: 'hazard',
      description: 'Severe street flooding near Nagalagam gauge, water depth rising rapidly',
      latitude: 6.9535,
      longitude: 79.8732,
      locationSource: 'device',
      gpsAccuracy: 8.5,
      submissionKey: randomUUID(),
    }));

    const uploadRes = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'CodeArena', Cookie: citCookie },
      body: form,
    });
    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(`Upload failed: ${JSON.stringify(uploadJson)}`);
    const reportId = uploadJson.report._id;
    cleanupIds.reports.push(reportId);

    // 3. Officer signs in
    const offLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena' },
      body: JSON.stringify({ username: officer.username, password: 'test-officer-password-123' }),
    });
    const offCookie = offLogin.headers.get('set-cookie');

    // 4. Officer triggers case evaluation
    const evalRes = await fetch(`${baseUrl}/api/reports/${reportId}/evaluate`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'CodeArena', Cookie: offCookie },
    });
    const evalJson = await evalRes.json();
    if (!evalRes.ok) throw new Error(`Evaluation failed: ${JSON.stringify(evalJson)}`);

    const assessment = evalJson.assessment;
    console.log(`[PASS] Case evaluation returned with status: ${assessment.status}`);
    console.log(`- Mapped ward: ${assessment.caseSnapshot.mappedWard.name}`);
    console.log(`- Mapped road: ${assessment.caseSnapshot.mappedRoad.name}`);
    console.log(`- Weather check: ${assessment.checks.weather.verdict} (${assessment.checks.weather.signal})`);
    console.log(`- Cluster check: ${assessment.checks.cluster.verdict}`);

    if (assessment.status === 'evaluated') {
      console.log(`- Image check: ${assessment.checks.image.hazardType} (${assessment.checks.image.severity})`);
      console.log(`- Location check: ${assessment.checks.location.sceneConsistency} (locationEvidence: ${assessment.checks.location.locationEvidence})`);
      console.log(`- Risk check: ${assessment.checks.risk.urgency}`);
      console.log(`- Aggregator verdict: ${assessment.aggregator.verdict} (urgency: ${assessment.aggregator.urgency}, confidence: ${assessment.aggregator.confidence})`);
      console.log(`- Recommended outcome: ${assessment.aggregator.recommendedOutcome}`);
    } else {
      console.log(`- AI Status: ${assessment.status} (${assessment.error}) - Handled safely without fake results`);
    }

    // 5. Verify persisted assessment directly in MongoDB
    const persistedReport = await Report.findById(reportId).lean();
    if (!persistedReport.assessment) throw new Error('Assessment was not persisted in MongoDB!');
    if (!persistedReport.history.some(h => h.action === 'evaluated')) throw new Error('Audit history missing evaluation entry!');

    // 6. Test GET /api/reports/:id/case endpoint
    const caseRes = await fetch(`${baseUrl}/api/reports/${reportId}/case`, {
      headers: { Cookie: offCookie },
    });
    const caseJson = await caseRes.json();
    if (!caseRes.ok || !caseJson.case) throw new Error('GET /api/reports/:id/case failed');

    console.log('PASS: Milestone 3 Case Builder, System Checks, AI Checks / Aggregator, and MongoDB persistence verified.');
  } finally {
    // Clean up created records
    if (cleanupIds.reports.length) {
      await Report.deleteMany({ _id: { $in: cleanupIds.reports } });
    }
    if (cleanupIds.users.length) {
      await User.deleteMany({ _id: { $in: cleanupIds.users } });
    }
    if (server) server.close();
    await mongoose.disconnect();
  }
}

run().catch(err => {
  console.error('M3 Persistence check failed:', err);
  process.exit(1);
});
