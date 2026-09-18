import '../src/config.js';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Report } from '../src/models/Report.js';
import { Incident } from '../src/models/Incident.js';
import { Shelter, ensureDefaultShelters } from '../src/models/Shelter.js';
import { Alert } from '../src/models/Alert.js';
import { hashPassword } from '../src/auth.js';
import { resetSimulationStage } from '../src/services/feedReplayService.js';

if (!process.env.MONGODB_URI) {
  console.error('Configure MONGODB_URI in server/.env to run persistence integration checks.');
  process.exit(1);
}

const runTag = `m5test-${Date.now()}`;
let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const app = createApp({ databaseConfigured: true, connection: mongoose.connection });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const cleanupIds = { users: [], reports: [], incidents: [], shelters: [], alerts: [] };

  try {
    // 1. Create officer and relief staff users
    const officer = await User.create({
      username: `officer-${runTag}`,
      passwordHash: await hashPassword('test-officer-pwd-123'),
      role: 'officer',
    });
    cleanupIds.users.push(officer._id);

    const reliefWorker = await User.create({
      username: `relief-${runTag}`,
      passwordHash: await hashPassword('test-relief-pwd-123'),
      role: 'relief',
    });
    cleanupIds.users.push(reliefWorker._id);

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

    const officerCookie = await login(`officer-${runTag}`, 'test-officer-pwd-123');
    const reliefCookie = await login(`relief-${runTag}`, 'test-relief-pwd-123');
    const citizenCookie = await login(`citizen-${runTag}`, 'test-citizen-pwd-123');

    console.log('--- Step 1: Hydrological Feed Replay & Proactive Warnings (R02) ---');
    // Reset feed to stage 0
    await resetSimulationStage();
    const feedRes0 = await fetch(`${baseUrl}/api/feed/status`);
    const feed0 = await feedRes0.json();
    assert.equal(feed0.stage, 0);

    // Advance feed to stage 1 (Advisory)
    const stepRes1 = await fetch(`${baseUrl}/api/feed/step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'CodeArena',
        Cookie: officerCookie,
      },
    });
    assert.equal(stepRes1.status, 200);
    const step1 = await stepRes1.json();
    assert.equal(step1.feed.stage, 1);

    // Verify public alerts endpoint returns the generated advisory
    const alertsRes1 = await fetch(`${baseUrl}/api/alerts`);
    assert.equal(alertsRes1.status, 200);
    const alertsData1 = await alertsRes1.json();
    assert.ok(alertsData1.alerts.length >= 1);
    assert.equal(alertsData1.alerts[0].severity, 'advisory');
    assert.ok(alertsData1.disclaimer.includes('SIMULATED HYDROLOGICAL ALERT'));
    console.log(`✓ Feed advanced to stage 1: Issued proactive advisory for ${alertsData1.alerts[0].affectedWards.join(', ')}`);

    // Reset feed back to 0
    await fetch(`${baseUrl}/api/feed/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'CodeArena',
        Cookie: officerCookie,
      },
    });
    console.log('✓ Feed reset to baseline stage 0.');

    console.log('--- Step 2: Closure-Aware Graph Routing Engine (R11) ---');
    // Check network graph definition
    const netRes = await fetch(`${baseUrl}/api/routing/network`);
    assert.equal(netRes.status, 200);
    const network = await netRes.json();
    assert.ok(network.nodes.length >= 7);
    assert.ok(network.edges.length >= 8);

    // Calculate baseline direct route from Modara to Borella
    const directRes = await fetch(`${baseUrl}/api/routing/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena' },
      body: JSON.stringify({
        originNodeId: 'node-modara',
        destinationNodeId: 'node-borella',
      }),
    });
    assert.equal(directRes.status, 200);
    const directRoute = await directRes.json();
    assert.equal(directRoute.success, true);
    assert.equal(directRoute.hasDetour, false);
    assert.ok(directRoute.disclaimer.includes('NEVER GUARANTEES REAL-WORLD SAFETY'));
    console.log(`✓ Direct route computed: ${(directRoute.totalDistanceMeters / 1000).toFixed(1)} km, ~${directRoute.estimatedMinutes} mins`);

    // Create an active incident closing road-baseline
    const closeIncident = await Incident.create({
      title: `Severe Flooding at Grandpass - ${runTag}`,
      hazardType: 'flood',
      severity: 'critical',
      status: 'open',
      isRoadClosed: true,
      center: { latitude: 6.9535, longitude: 79.8732 },
      ward: { id: 'ward-grandpass', name: 'Grandpass / Nagalagam Street' },
      road: { id: 'road-baseline', name: 'Baseline Road', hierarchy: 'arterial' },
      history: [{ action: 'created', actorId: officer._id, at: new Date() }],
    });
    cleanupIds.incidents.push(closeIncident._id);

    // Request route again from Grandpass to Borella: must detour avoiding road-baseline!
    const detourRes = await fetch(`${baseUrl}/api/routing/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena' },
      body: JSON.stringify({
        originNodeId: 'node-grandpass',
        destinationNodeId: 'node-borella',
      }),
    });
    assert.equal(detourRes.status, 200);
    const detourRoute = await detourRes.json();
    assert.equal(detourRoute.success, true);
    assert.equal(detourRoute.hasDetour, true);
    assert.ok(detourRoute.closedRoadsAvoided.includes('road-baseline'));
    // Ensure road-baseline was avoided
    for (const edge of detourRoute.edges) {
      assert.notEqual(edge.roadId, 'road-baseline');
    }
    console.log(`✓ Dijkstra detour applied: avoided closed road-baseline, routed via alternative corridor.`);

    // Close all remaining corridors from Grandpass to test NO_SAFE_ROUTE_AVAILABLE
    const closeIncident2 = await Incident.create({
      title: `Peliyagoda Bridge Submerged - ${runTag}`,
      hazardType: 'flood',
      severity: 'critical',
      status: 'open',
      isRoadClosed: true,
      center: { latitude: 6.9650, longitude: 79.8820 },
      ward: { id: 'ward-grandpass', name: 'Grandpass' },
      road: { id: 'road-kandy-corridor', name: 'Peliyagoda Bridge' },
      history: [{ action: 'created', actorId: officer._id, at: new Date() }],
    });
    cleanupIds.incidents.push(closeIncident2._id);

    const closeIncident3 = await Incident.create({
      title: `Nagalagam River Road Breached - ${runTag}`,
      hazardType: 'flood',
      severity: 'critical',
      status: 'open',
      isRoadClosed: true,
      center: { latitude: 6.9540, longitude: 79.8725 },
      ward: { id: 'ward-grandpass', name: 'Grandpass' },
      road: { id: 'road-nagalagam', name: 'Nagalagam Street' },
      history: [{ action: 'created', actorId: officer._id, at: new Date() }],
    });
    cleanupIds.incidents.push(closeIncident3._id);

    // Request route from Grandpass to Borella when all exits are closed
    const blockedRes = await fetch(`${baseUrl}/api/routing/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CodeArena' },
      body: JSON.stringify({
        originNodeId: 'node-grandpass',
        destinationNodeId: 'node-borella',
      }),
    });
    assert.equal(blockedRes.status, 200);
    const blocked = await blockedRes.json();
    assert.equal(blocked.success, false);
    assert.equal(blocked.reason, 'NO_SAFE_ROUTE_AVAILABLE');
    assert.match(blocked.message, /No safe route available/);
    assert.ok(blocked.disclaimer.includes('NEVER GUARANTEES REAL-WORLD SAFETY'));
    console.log('✓ Dijkstra detected impassable graph: gracefully returned NO_SAFE_ROUTE_AVAILABLE.');

    console.log('--- Step 3: Emergency Shelter Capacity & Relief Allocation (R14) ---');
    // Query shelters list
    const sheltersRes = await fetch(`${baseUrl}/api/relief/shelters`);
    assert.equal(sheltersRes.status, 200);
    const sheltersData = await sheltersRes.json();
    assert.ok(sheltersData.shelters.length >= 5);
    const targetShelter = sheltersData.shelters.find(s => s.wardId === 'ward-modara') || sheltersData.shelters[0];
    const initialOccupancy = targetShelter.currentOccupancy;
    console.log(`✓ Seeded evacuation shelters loaded: ${targetShelter.name} (${targetShelter.remainingCapacity} spaces available)`);

    // Create a citizen help request
    const helpReport = await Report.create({
      ownerId: citizen._id,
      kind: 'help',
      helpCategory: 'shelter',
      description: `Family displaced by flood water entering ground floor in Modara - ${runTag}`,
      latitude: 6.9685,
      longitude: 79.8645,
      locationSource: 'manual',
      status: 'submitted',
      history: [{ action: 'submitted', actorId: citizen._id, at: new Date() }],
    });
    cleanupIds.reports.push(helpReport._id);

    // Allocate citizen help request to shelter
    const assignRes = await fetch(`${baseUrl}/api/relief/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'CodeArena',
        Cookie: reliefCookie,
      },
      body: JSON.stringify({
        reportId: String(helpReport._id),
        shelterId: String(targetShelter._id),
        partySize: 4,
        notes: 'Elderly family member, requested ground floor',
      }),
    });
    assert.equal(assignRes.status, 200);
    const assignData = await assignRes.json();
    assert.equal(assignData.success, true);
    assert.equal(assignData.shelter.currentOccupancy, initialOccupancy + 4);
    assert.equal(assignData.report.reliefAssignment.partySize, 4);
    assert.equal(assignData.report.reliefAssignment.status, 'assigned');
    console.log(`✓ Help request assigned: Shelter occupancy incremented by 4 (New occupancy: ${assignData.shelter.currentOccupancy})`);

    // Test over-capacity protection guard (requesting more spaces than remaining)
    const overAssignRes = await fetch(`${baseUrl}/api/relief/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'CodeArena',
        Cookie: reliefCookie,
      },
      body: JSON.stringify({
        reportId: String(helpReport._id),
        shelterId: String(targetShelter._id),
        partySize: 9999, // Exceeds maxCapacity
      }),
    });
    assert.equal(overAssignRes.status, 409);
    const overData = await overAssignRes.json();
    assert.match(overData.error, /Shelter capacity exceeded/);
    console.log('✓ Over-capacity protection guard verified: Rejected with HTTP 409 Conflict.');

    // Test role restriction: Citizen cannot assign to shelter
    const citizenAssignRes = await fetch(`${baseUrl}/api/relief/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'CodeArena',
        Cookie: citizenCookie,
      },
      body: JSON.stringify({
        reportId: String(helpReport._id),
        shelterId: String(targetShelter._id),
        partySize: 1,
      }),
    });
    assert.equal(citizenAssignRes.status, 403);
    console.log('✓ Role authorization verified: Citizen assignment rejected with HTTP 403 Forbidden.');

    console.log('\n✅ ALL MILESTONE 5 INTEGRATION CHECKS PASSED.');
  } finally {
    // Clean up test records
    await Report.deleteMany({ _id: { $in: cleanupIds.reports } }).catch(() => {});
    await Incident.deleteMany({ _id: { $in: cleanupIds.incidents } }).catch(() => {});
    await User.deleteMany({ _id: { $in: cleanupIds.users } }).catch(() => {});
    await resetSimulationStage().catch(() => {});
    if (server) await new Promise(res => server.close(res));
    await mongoose.disconnect();
  }
}

run().catch(err => {
  console.error('M5 Check failed:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
