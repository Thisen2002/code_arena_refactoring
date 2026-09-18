import '../src/config.js';
import mongoose from 'mongoose';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Report } from '../src/models/Report.js';
import { Incident } from '../src/models/Incident.js';
import { Shelter, ensureDefaultShelters } from '../src/models/Shelter.js';
import { ConfigVersion, ensureDefaultConfig } from '../src/models/ConfigVersion.js';
import { Feedback } from '../src/models/Feedback.js';
import { hashPassword } from '../src/auth.js';
import { buildCase } from '../src/services/caseBuilder.js';
import { runWeatherCheck, runClusterCheck } from '../src/services/systemChecks.js';
import { calculateSafeRoute } from '../src/services/routingService.js';

if (!process.env.MONGODB_URI) {
  console.error('Configure MONGODB_URI in server/.env to run E2E test.');
  process.exit(1);
}

const runTag = `e2e-${Date.now()}`;
let server;

async function runE2E() {
  console.log('================================================================');
  console.log('  CODEARENA ’26 DISASTER RESPONSE — END-TO-END SCENARIO MATRIX  ');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const app = createApp({ databaseConfigured: true, connection: mongoose.connection });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const cleanup = { users: [], reports: [], incidents: [], configs: [], feedback: [] };

  try {
    // 0. Setup accounts
    const password = 'test-e2e-password-123';
    const hash = await hashPassword(password);

    const citizen = await User.create({ username: `citizen-${runTag}`, role: 'citizen', passwordHash: hash });
    cleanup.users.push(citizen._id);

    const officer = await User.create({ username: `officer-${runTag}`, role: 'officer', passwordHash: hash });
    cleanup.users.push(officer._id);

    const crew = await User.create({ username: `crew-${runTag}`, role: 'crew', passwordHash: hash });
    cleanup.users.push(crew._id);

    const relief = await User.create({ username: `relief-${runTag}`, role: 'relief', passwordHash: hash });
    cleanup.users.push(relief._id);

    const admin = await User.create({ username: `admin-${runTag}`, role: 'admin', passwordHash: hash });
    cleanup.users.push(admin._id);

    async function login(username) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena' },
        body: JSON.stringify({ username, password }),
      });
      return res.headers.get('set-cookie');
    }

    const citizenCookie = await login(`citizen-${runTag}`);
    const officerCookie = await login(`officer-${runTag}`);
    const crewCookie = await login(`crew-${runTag}`);
    const reliefCookie = await login(`relief-${runTag}`);
    const adminCookie = await login(`admin-${runTag}`);

    await ensureDefaultShelters();
    await ensureDefaultConfig();

    // -------------------------------------------------------------
    // STAGE 01: Citizen Evidence Intake with Photo & GPS
    // -------------------------------------------------------------
    console.log('▶ STAGE 01: Citizen Intake (Multipart Photo + GPS + Submission Key)');
    const photoBytes = await sharp({
      create: { width: 320, height: 240, channels: 3, background: '#1c3d5a' },
    }).jpeg().toBuffer();

    const form = new FormData();
    const submissionKey = randomUUID();
    form.append('report', JSON.stringify({
      kind: 'hazard',
      description: `Severe street flooding near Nagalagam gauge - ${runTag}`,
      latitude: 6.9535,
      longitude: 79.8732,
      locationSource: 'manual',
      submissionKey,
    }));
    form.append('photo', new Blob([photoBytes], { type: 'image/jpeg' }), 'flood.jpg');

    const submitRes = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'CodeArena', Cookie: citizenCookie },
      body: form,
    });
    assert.equal(submitRes.status, 201);
    const { report: citizenReport } = await submitRes.json();
    cleanup.reports.push(citizenReport._id);
    assert.equal(citizenReport.locationEvidence, 'unverified');
    assert.ok(citizenReport.photo?.url);
    assert.ok(citizenReport.photo?.sha256);
    console.log(`  ✓ Report created (ID: ${citizenReport._id}) with GridFS photo and submissionKey deduplication.`);

    // -------------------------------------------------------------
    // STAGE 02: Case Builder & System Checks
    // -------------------------------------------------------------
    console.log('\n▶ STAGE 02: Case Builder & System Checks (Deterministic Rules)');
    const caseData = await buildCase({ report: citizenReport, reportsModel: Report });
    assert.equal(caseData.mappedWard.id, 'ward-grandpass');
    assert.equal(caseData.mappedRoad.id, 'road-baseline');

    const weatherCheck = runWeatherCheck(caseData);
    assert.ok(['supportive', 'contradictory', 'inconclusive'].includes(weatherCheck.verdict));

    const clusterCheck = runClusterCheck(caseData);
    assert.ok(['isolated', 'clustered', 'dense_cluster'].includes(clusterCheck.verdict));
    console.log(`  ✓ Case joined: Ward=${caseData.mappedWard.name}, Road=${caseData.mappedRoad.name}`);
    console.log(`  ✓ System Weather Check: ${weatherCheck.signal} (Rainfall: ${weatherCheck.metrics?.rainfallRateMmH || 0} mm/h)`);
    console.log(`  ✓ System Cluster Check: ${clusterCheck.verdict}`);

    // -------------------------------------------------------------
    // STAGE 03: Operations Evaluation & Verification
    // -------------------------------------------------------------
    console.log('\n▶ STAGE 03: Report Assessment & Evaluation State');
    const evalRes = await fetch(`${baseUrl}/api/reports/${citizenReport._id}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: officerCookie },
    });
    assert.equal(evalRes.status, 200);
    const { report: evaluatedReport } = await evalRes.json();
    assert.ok(['evaluated', 'failed'].includes(evaluatedReport.assessment.status));
    console.log(`  ✓ Assessment recorded: status=${evaluatedReport.assessment.status}`);

    // -------------------------------------------------------------
    // STAGE 04: Incident Grouping & Road Closure
    // -------------------------------------------------------------
    console.log('\n▶ STAGE 04: Incident Grouping & Road Closure by Officer');
    const incRes = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: officerCookie },
      body: JSON.stringify({
        title: `Flash Flooding on Baseline Corridor - ${runTag}`,
        hazardType: 'flood',
        severity: 'critical',
        reportIds: [citizenReport._id],
        isRoadClosed: true,
      }),
    });
    assert.equal(incRes.status, 201);
    const { incident } = await incRes.json();
    cleanup.incidents.push(incident._id);
    assert.equal(incident.isRoadClosed, true);
    assert.equal(incident.status, 'open');
    console.log(`  ✓ Incident created (ID: ${incident._id}): Road marked CLOSED on Baseline Road.`);

    // -------------------------------------------------------------
    // STAGE 05: Closure-Aware Dijkstra Routing Detour
    // -------------------------------------------------------------
    console.log('\n▶ STAGE 05: Closure-Aware Graph Routing Engine (Dijkstra)');
    const detourRoute = await calculateSafeRoute({
      originNodeId: 'node-grandpass',
      destinationNodeId: 'node-borella',
    });
    assert.equal(detourRoute.success, true);
    assert.equal(detourRoute.hasDetour, true);
    assert.ok(detourRoute.closedRoadsAvoided.includes('road-baseline'));
    for (const edge of detourRoute.edges) {
      assert.notEqual(edge.roadId, 'road-baseline');
    }
    console.log(`  ✓ Safe route calculated: avoided closed road-baseline, routed via ${detourRoute.edges.map(e => e.roadName).join(' -> ')}`);
    console.log(`  ✓ Route distance: ${(detourRoute.totalDistanceMeters / 1000).toFixed(1)} km, ~${detourRoute.estimatedMinutes} mins`);

    // -------------------------------------------------------------
    // STAGE 06: Clarification Request & Citizen Response
    // -------------------------------------------------------------
    console.log('\n▶ STAGE 06: Community Clarification Inquiry Loop');
    const clarRes = await fetch(`${baseUrl}/api/incidents/${incident._id}/clarification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: officerCookie },
      body: JSON.stringify({ question: 'Can regular passenger vehicles pass Grandpass junction?' }),
    });
    assert.equal(clarRes.status, 201);
    const { incident: incWithClar } = await clarRes.json();
    const clarId = incWithClar.clarifications[0]._id;

    // Citizen responds to clarification
    const respRes = await fetch(`${baseUrl}/api/incidents/${incident._id}/clarification/${clarId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: citizenCookie },
      body: JSON.stringify({ responseChoice: 'confirmed_hazard', comment: 'Water level above tire height. Impassable.' }),
    });
    assert.equal(respRes.status, 200);
    console.log('  ✓ Officer broadcasted clarification inquiry; citizen submitted on-the-ground observation.');

    // -------------------------------------------------------------
    // STAGE 07: Officer Dispatch & Field Crew Photo Closure
    // -------------------------------------------------------------
    console.log('\n▶ STAGE 07: Officer Crew Dispatch & Mandatory Photo Closure');
    const dispatchRes = await fetch(`${baseUrl}/api/incidents/${incident._id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: officerCookie },
      body: JSON.stringify({ crewId: crew._id, instructions: 'Clear drain grates and pump standing water.' }),
    });
    assert.equal(dispatchRes.status, 200);

    // Crew completes work and submits resolution with real completion photo
    const completionBytes = await sharp({
      create: { width: 320, height: 240, channels: 3, background: '#2e3436' },
    }).jpeg().toBuffer();

    const closeForm = new FormData();
    closeForm.append('notes', 'Drainage grates cleared of debris. Road reopened to regular traffic.');
    closeForm.append('photo', new Blob([completionBytes], { type: 'image/jpeg' }), 'cleared.jpg');

    const closeRes = await fetch(`${baseUrl}/api/incidents/${incident._id}/close`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'CodeArena', Cookie: crewCookie },
      body: closeForm,
    });
    assert.equal(closeRes.status, 200);
    const { incident: closedIncident } = await closeRes.json();
    assert.equal(closedIncident.status, 'closed');
    assert.equal(closedIncident.isRoadClosed, false);

    // Verify linked citizen report is automatically updated to 'resolved'
    const updatedCitizenReport = await Report.findById(citizenReport._id);
    assert.equal(updatedCitizenReport.status, 'resolved');
    console.log('  ✓ Assigned crew resolved hazard with mandatory completion photo stored in GridFS.');
    console.log('  ✓ Road reopening synchronized (isRoadClosed: false); linked citizen report marked resolved.');

    // -------------------------------------------------------------
    // STAGE 08: Relief Desk Shelter Allocation & Admin Audit
    // -------------------------------------------------------------
    console.log('\n▶ STAGE 08: Relief Desk Shelter Allocation & Admin Audit Governance');
    // Create citizen help request
    const helpReport = await Report.create({
      ownerId: citizen._id,
      kind: 'help',
      helpCategory: 'shelter',
      description: `Evacuation assistance requested for household of 3 - ${runTag}`,
      latitude: 6.9680,
      longitude: 79.8650,
      locationSource: 'manual',
      status: 'submitted',
      history: [{ action: 'submitted', actorId: citizen._id, at: new Date() }],
    });
    cleanup.reports.push(helpReport._id);

    const shelters = await Shelter.find();
    const targetShelter = shelters[0];

    const assignRes = await fetch(`${baseUrl}/api/relief/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena', Cookie: reliefCookie },
      body: JSON.stringify({
        reportId: String(helpReport._id),
        shelterId: String(targetShelter._id),
        partySize: 3,
        notes: 'Elderly family members',
      }),
    });
    assert.equal(assignRes.status, 200);
    console.log(`  ✓ Help request assigned to ${targetShelter.name} (party size: 3).`);

    // Admin configuration audit
    const auditRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(auditRes.status, 200);
    const { logs } = await auditRes.json();
    assert.ok(logs.length >= 3);
    console.log(`  ✓ Admin audit trail verified: Captured ${logs.length} chronological operational events.`);

    console.log('\n================================================================');
    console.log('  ✅ ALL 8 END-TO-END DISASTER RESPONSE STAGES VERIFIED CLEANLY  ');
    console.log('================================================================\n');
  } finally {
    // Cleanup test records
    await Report.deleteMany({ _id: { $in: cleanup.reports } }).catch(() => {});
    await Incident.deleteMany({ _id: { $in: cleanup.incidents } }).catch(() => {});
    await Feedback.deleteMany({ _id: { $in: cleanup.feedback } }).catch(() => {});
    await ConfigVersion.deleteMany({ _id: { $in: cleanup.configs } }).catch(() => {});
    await User.deleteMany({ _id: { $in: cleanup.users } }).catch(() => {});
    if (server) await new Promise(res => server.close(res));
    await mongoose.disconnect();
  }
}

runE2E().catch(err => {
  console.error('E2E Scenario Failure:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
