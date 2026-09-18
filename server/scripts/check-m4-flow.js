import '../src/config.js';
import mongoose from 'mongoose';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Report } from '../src/models/Report.js';
import { Incident } from '../src/models/Incident.js';
import { hashPassword } from '../src/auth.js';

if (!process.env.MONGODB_URI) {
  console.error('Configure MONGODB_URI in server/.env to run persistence integration checks.');
  process.exit(1);
}

const runTag = `m4test-${Date.now()}`;
let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const app = createApp({ databaseConfigured: true, connection: mongoose.connection });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const cleanupIds = { users: [], reports: [], incidents: [] };

  try {
    // 1. Create officer, crew, and citizen users
    const officer = await User.create({
      username: `officer-${runTag}`,
      passwordHash: await hashPassword('test-officer-password-123'),
      role: 'officer',
    });
    cleanupIds.users.push(officer._id);

    const crew = await User.create({
      username: `crew-${runTag}`,
      passwordHash: await hashPassword('test-crew-password-123'),
      role: 'crew',
    });
    cleanupIds.users.push(crew._id);

    const citizen = await User.create({
      username: `citizen-${runTag}`,
      passwordHash: await hashPassword('test-citizen-password-123'),
      role: 'citizen',
    });
    cleanupIds.users.push(citizen._id);

    // Helper for authenticated requests
    async function login(username, password) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena' },
        body: JSON.stringify({ username, password }),
      });
      return res.headers.get('set-cookie');
    }

    const citCookie = await login(citizen.username, 'test-citizen-password-123');
    const offCookie = await login(officer.username, 'test-officer-password-123');
    const crewCookie = await login(crew.username, 'test-crew-password-123');

    // 2. Citizen uploads a report
    const initialPhoto = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#134e4a' } }).png().toBuffer();
    const form = new FormData();
    form.append('photo', new Blob([initialPhoto], { type: 'image/png' }), 'incident-source.png');
    form.append('report', JSON.stringify({
      kind: 'hazard',
      description: 'Major storm flood blocking Baseline Road corridor near canal outlet',
      latitude: 6.9535,
      longitude: 79.8732,
      locationSource: 'device',
      gpsAccuracy: 10,
      submissionKey: randomUUID(),
    }));

    const uploadRes = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'CodeArena', Cookie: citCookie },
      body: form,
    });
    const reportJson = await uploadRes.json();
    assert.equal(uploadRes.status, 201);
    const reportId = reportJson.report._id;
    cleanupIds.reports.push(reportId);

    // 3. Officer creates an Incident grouping this report and marks the road closed
    const createIncRes = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: offCookie },
      body: JSON.stringify({
        title: 'Severe Inundation on Baseline Road',
        hazardType: 'flood',
        severity: 'severe',
        isRoadClosed: true,
        reportIds: [reportId],
      }),
    });
    const incJson = await createIncRes.json();
    assert.equal(createIncRes.status, 201);
    const incidentId = incJson.incident._id;
    cleanupIds.incidents.push(incidentId);

    assert.equal(incJson.incident.status, 'open');
    assert.equal(incJson.incident.isRoadClosed, true);
    assert.equal(incJson.incident.reportCount, 1);

    // Verify linked report status is now 'confirmed'
    const updatedReport = await Report.findById(reportId).lean();
    assert.equal(updatedReport.status, 'confirmed');
    assert.equal(String(updatedReport.incidentId), incidentId);
    console.log('[PASS] Step 1: Incident created and report grouped successfully.');

    // 4. Clarification loop: Officer posts a question
    const clarRes = await fetch(`${baseUrl}/api/incidents/${incidentId}/clarification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: offCookie },
      body: JSON.stringify({ question: 'Can nearby residents confirm if water has breached the pedestrian walkway?' }),
    });
    const clarJson = await clarRes.json();
    assert.equal(clarRes.status, 201);
    const clarId = clarJson.incident.clarifications[0]._id;
    assert.equal(clarJson.incident.clarifications[0].question, 'Can nearby residents confirm if water has breached the pedestrian walkway?');

    // Citizen responds to clarification
    const respRes = await fetch(`${baseUrl}/api/incidents/${incidentId}/clarification/${clarId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: citCookie },
      body: JSON.stringify({ responseChoice: 'confirmed_hazard', comment: 'Yes, walkway is fully submerged.' }),
    });
    const respJson = await respRes.json();
    assert.equal(respRes.status, 200);
    assert.equal(respJson.incident.clarifications[0].responses.length, 1);
    assert.equal(respJson.incident.clarifications[0].responses[0].responseChoice, 'confirmed_hazard');
    console.log('[PASS] Step 2: Clarification loop and citizen response verified.');

    // 5. Officer dispatches field crew
    const dispatchRes = await fetch(`${baseUrl}/api/incidents/${incidentId}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: offCookie },
      body: JSON.stringify({ crewId: String(crew._id), instructions: 'Deploy drainage team and pump debris.' }),
    });
    const dispatchJson = await dispatchRes.json();
    assert.equal(dispatchRes.status, 200);
    assert.equal(dispatchJson.incident.status, 'dispatched');
    assert.equal(dispatchJson.incident.dispatch.crewId, String(crew._id));

    // Verify idempotency: duplicate dispatch returns 409
    const dupDispatchRes = await fetch(`${baseUrl}/api/incidents/${incidentId}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: offCookie },
      body: JSON.stringify({ crewId: String(crew._id), instructions: 'Duplicate attempt' }),
    });
    assert.equal(dupDispatchRes.status, 409);
    console.log('[PASS] Step 3: Officer dispatch and duplicate dispatch prevention (409) verified.');

    // Verify linked report status updated to 'dispatched'
    const repDispatched = await Report.findById(reportId).lean();
    assert.equal(repDispatched.status, 'dispatched');

    // 6. Unauthorized closure check: Citizen cannot close incident (403)
    const closurePhoto = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#1e3a8a' } }).jpeg().toBuffer();
    const closeForm = new FormData();
    closeForm.append('photo', new Blob([closurePhoto], { type: 'image/jpeg' }), 'closure.jpg');
    closeForm.append('notes', 'Drain cleared.');

    const deniedCloseRes = await fetch(`${baseUrl}/api/incidents/${incidentId}/close`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'CodeArena', Cookie: citCookie },
      body: closeForm,
    });
    assert.equal(deniedCloseRes.status, 403);
    console.log('[PASS] Step 4: Role enforcement on incident closure (403 for unauthorized citizen) verified.');

    // 7. Assigned crew closes incident with closure photo
    const crewCloseForm = new FormData();
    crewCloseForm.append('photo', new Blob([closurePhoto], { type: 'image/jpeg' }), 'closure.jpg');
    crewCloseForm.append('notes', 'Drain unblocked, road surface cleared and dry.');

    const closeRes = await fetch(`${baseUrl}/api/incidents/${incidentId}/close`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'CodeArena', Cookie: crewCookie },
      body: crewCloseForm,
    });
    const closeJson = await closeRes.json();
    assert.equal(closeRes.status, 200);
    assert.equal(closeJson.incident.status, 'closed');
    assert.equal(closeJson.incident.isRoadClosed, false); // Road re-opened!
    assert.ok(closeJson.incident.closure.photo.url);

    // 8. Verify linked report is now 'resolved'
    const finalReport = await Report.findById(reportId).lean();
    assert.equal(finalReport.status, 'resolved');

    // 9. Verify closure photo streaming
    const photoStreamRes = await fetch(`${baseUrl}/api/incidents/${incidentId}/photo`, {
      headers: { Cookie: citCookie },
    });
    assert.equal(photoStreamRes.status, 200);
    assert.equal(photoStreamRes.headers.get('content-type'), 'image/jpeg');
    const photoBytes = Buffer.from(await photoStreamRes.arrayBuffer());
    assert.equal(photoBytes.length, closurePhoto.length);

    console.log('[PASS] Step 5: Crew photo closure, road reopening, citizen status resolution, and GridFS photo streaming verified.');
    console.log('PASS: All Milestone 4 end-to-end integration requirements verified against real MongoDB and GridFS.');
  } finally {
    // Cleanup created test records
    if (cleanupIds.incidents.length) {
      await Incident.deleteMany({ _id: { $in: cleanupIds.incidents } });
    }
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
  console.error('M4 Integration flow failed:', err);
  process.exit(1);
});
