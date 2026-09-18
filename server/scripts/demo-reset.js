import '../src/config.js';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { User, roles } from '../src/models/User.js';
import { Report } from '../src/models/Report.js';
import { Incident } from '../src/models/Incident.js';
import { Alert } from '../src/models/Alert.js';
import { ConfigVersion, ensureDefaultConfig } from '../src/models/ConfigVersion.js';
import { Shelter, ensureDefaultShelters } from '../src/models/Shelter.js';
import { hashPassword } from '../src/auth.js';
import { evidenceStore } from '../src/evidence.js';
import { setSimulationStage } from '../src/services/feedReplayService.js';

if (!process.env.MONGODB_URI) {
  console.error('Configure MONGODB_URI in server/.env to run demo reset.');
  process.exit(1);
}

const directory = new URL('../generated/', import.meta.url);
const accountFile = new URL('demo-accounts.json', directory);

async function resetDemo() {
  console.log('🔄 Initializing CodeArena 26 Disaster Response demonstration data…');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await mkdir(directory, { recursive: true });

  // 1. Ensure 5 standard demo accounts
  const DEMO_PASSWORD = 'password123';
  const accounts = [];
  const userMap = {};
  for (const role of roles) {
    const username = `demo-${role}`;
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    let existing = await User.findOne({ username });
    if (!existing) {
      existing = await User.create({
        username,
        role,
        demo: true,
        passwordHash,
      });
    } else {
      existing.passwordHash = passwordHash;
      existing.isRestricted = false;
      await existing.save();
    }
    if (role === 'citizen' && !existing.savedLocation?.wardId) {
      existing.savedLocation = {
        optInAlerts: true,
        wardId: 'ward-grandpass',
        wardName: 'Grandpass / Nagalagam Street',
        latitude: 6.9535,
        longitude: 79.8732,
        email: 'citizen.kelani@resilient-lanka.gov.lk',
        channelEmail: true,
        updatedAt: new Date(),
      };
      await existing.save();
    }
    accounts.push({ username, role, password: DEMO_PASSWORD });
    userMap[role] = existing;
  }
  await writeFile(accountFile, JSON.stringify(accounts, null, 2) + '\n', { mode: 0o600 });
  console.log('✓ Demo accounts verified (citizen, officer, crew, relief, admin) with demo password.');

  // 2. Ensure baseline configuration version
  await ensureDefaultConfig();
  console.log('✓ Baseline configuration Version 1 deployed.');

  // 3. Ensure default evacuation shelters
  await ensureDefaultShelters();
  console.log('✓ Designated Colombo evacuation shelters seeded with capacity tracking.');

  // 4. Set hydrological simulation feed to Stage 1 (Advisory)
  await setSimulationStage(1);
  console.log('✓ Hydrological monitor set to Stage 1: Active Kelani River Advisory broadcasted.');

  // 5. Seed sample demonstration reports with real Colombo flood photos in GridFS
  const store = evidenceStore(mongoose.connection);

  const nagalagamImgPath = new URL('../src/data/demo-images/flood_nagalagam.jpg', import.meta.url);
  const baselineImgPath = new URL('../src/data/demo-images/flood_baseline.jpg', import.meta.url);

  let nagalagamBuffer;
  try {
    nagalagamBuffer = await readFile(nagalagamImgPath);
  } catch {
    nagalagamBuffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#3465a4' } }).jpeg().toBuffer();
  }

  let baselineBuffer;
  try {
    baselineBuffer = await readFile(baselineImgPath);
  } catch {
    baselineBuffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#204a87' } }).jpeg().toBuffer();
  }

  const nagalagamSha = createHash('sha256').update(nagalagamBuffer).digest('hex');
  const baselineSha = createHash('sha256').update(baselineBuffer).digest('hex');

  // Store photos in GridFS
  let nagalagamFileId = null;
  let baselineFileId = null;
  if (store.save) {
    nagalagamFileId = await store.save(nagalagamBuffer, {
      ownerId: String(userMap.citizen._id),
      mimeType: 'image/jpeg',
      originalName: 'nagalagam-street-flooding.jpg',
    });
    baselineFileId = await store.save(baselineBuffer, {
      ownerId: String(userMap.citizen._id),
      mimeType: 'image/jpeg',
      originalName: 'baseline-road-inundation.jpg',
    });
  }

  // Clear previous demo seeded reports/incidents
  await Report.deleteMany({ description: { $regex: /\[DEMO SEED\]/ } });
  await Incident.deleteMany({ title: { $regex: /\[DEMO SEED\]/ } });

  // Create Seeded Hazard Report 1: Nagalagam Street
  const hazardReport = await Report.create({
    ownerId: userMap.citizen._id,
    kind: 'hazard',
    description: '[DEMO SEED] Severe water accumulation overflowing onto Nagalagam Street near Kelani riverbank. Water depth ~1.5 feet, vehicles struggling to pass.',
    latitude: 6.9535,
    longitude: 79.8732,
    locationSource: 'device',
    gpsAccuracy: 12,
    photo: {
      fileId: nagalagamFileId,
      mimeType: 'image/jpeg',
      size: nagalagamBuffer.length,
      sha256: nagalagamSha,
      width: 1024,
      height: 768,
      exifGps: null,
    },
    status: 'under_review',
    locationEvidence: 'unverified',
    assessment: {
      status: 'evaluated',
      evaluatedAt: new Date(),
      evaluator: { type: 'hybrid_system_ai', model: 'gemini-3.8-flash' },
      caseSnapshot: {
        mappedWard: {
          id: 'ward-grandpass',
          name: 'Grandpass / Nagalagam Street',
          floodVulnerability: 'high',
          riverBasin: 'Kelani Ganga',
          withinCoverage: true,
        },
        mappedRoad: {
          id: 'road-nagalagam',
          name: 'Nagalagam Street River Road',
          hierarchy: 'collector',
          adjacent: true,
        },
        nearbyCluster: { radiusMeters: 200, timeWindowHours: 4, count: 2, reports: [] },
        weatherSnapshot: {
          rainfallRateMmH: 32.0,
          riverGaugeLevelFeet: 5.2,
          riverStatus: 'alert',
        },
      },
      checks: {
        weather: { signal: 'supportive', verdict: 'RIVER_ALERT_LEVEL_BREACHED', metrics: { rainfallRateMmH: 32.0, riverGaugeLevelFeet: 5.2 } },
        cluster: { densityClassification: 'clustered', countInRadius: 2 },
        image: { hazardDetected: true, hazardType: 'flood', severity: 'moderate', isDisasterRelated: true, reasons: ['Visible brown floodwater on roadway', 'Vehicles partially submerged'] },
        location: { sceneType: 'urban_riverbank', sceneConsistency: 'consistent_urban_riverbank', locationEvidence: 'unknown' },
        risk: { roadHierarchy: 'collector', risingWater: true, lifeSafetyRisk: 'moderate', urgencyFactors: ['Rising water near occupied buildings'] },
      },
      aggregator: {
        verdict: 'confirmed',
        urgency: 'high',
        confidence: 0.82,
        reasons: ['Kelani river gauge alert breached (5.2 ft)', 'Visual evidence shows brown floodwater encroaching shops and roadway', 'Traffic stalled near Grandpass junction'],
        uncertainty: 'Location GPS not independently cryptographically verified; estimated from report metadata.',
        recommendedOutcome: 'published',
      },
    },
    history: [{ action: 'submitted', actorId: userMap.citizen._id, at: new Date() }],
  });

  // Create Seeded Hazard Report 2: Baseline Road
  const baselineReport = await Report.create({
    ownerId: userMap.citizen._id,
    kind: 'hazard',
    description: '[DEMO SEED] Baseline Road arterial corridor completely submerged under 2 feet of water. Orange warning barrier deployed, buses and cars halted.',
    latitude: 6.9450,
    longitude: 79.8780,
    locationSource: 'device',
    gpsAccuracy: 15,
    photo: {
      fileId: baselineFileId,
      mimeType: 'image/jpeg',
      size: baselineBuffer.length,
      sha256: baselineSha,
      width: 1024,
      height: 768,
      exifGps: null,
    },
    status: 'under_review',
    locationEvidence: 'unverified',
    assessment: {
      status: 'evaluated',
      evaluatedAt: new Date(),
      evaluator: { type: 'hybrid_system_ai', model: 'gemini-3.8-flash' },
      caseSnapshot: {
        mappedWard: {
          id: 'ward-grandpass',
          name: 'Grandpass / Nagalagam Street',
          floodVulnerability: 'high',
          riverBasin: 'Kelani Ganga',
          withinCoverage: true,
        },
        mappedRoad: {
          id: 'road-baseline',
          name: 'Baseline Road (Arterial Corridor)',
          hierarchy: 'arterial',
          adjacent: true,
        },
        nearbyCluster: { radiusMeters: 200, timeWindowHours: 4, count: 3, reports: [] },
        weatherSnapshot: {
          rainfallRateMmH: 42.0,
          riverGaugeLevelFeet: 5.4,
          riverStatus: 'alert',
        },
      },
      checks: {
        weather: { signal: 'supportive', verdict: 'HEAVY_MONSOON_RAINFALL', metrics: { rainfallRateMmH: 42.0, riverGaugeLevelFeet: 5.4 } },
        cluster: { densityClassification: 'clustered', countInRadius: 3 },
        image: { hazardDetected: true, hazardType: 'flood', severity: 'critical', isDisasterRelated: true, reasons: ['Arterial corridor completely submerged', 'Orange warning barriers deployed', 'Transit vehicles halted'] },
        location: { sceneType: 'urban_arterial', sceneConsistency: 'consistent_urban_arterial', locationEvidence: 'unknown' },
        risk: { roadHierarchy: 'arterial', risingWater: true, lifeSafetyRisk: 'critical', urgencyFactors: ['Arterial road closed — major evacuation route blocked', 'Rising water level near hospitals'] },
      },
      aggregator: {
        verdict: 'confirmed',
        urgency: 'critical',
        confidence: 0.91,
        reasons: ['Key arterial highway impassable', 'Knee-deep floodwaters blocking public transit', 'Flash runoff from canal overflow'],
        uncertainty: 'Location GPS not independently cryptographically verified; estimated from report metadata.',
        recommendedOutcome: 'area_alert',
      },
    },
    history: [{ action: 'submitted', actorId: userMap.citizen._id, at: new Date() }],
  });

  // Create Seeded Help Request
  const helpReport = await Report.create({
    ownerId: userMap.citizen._id,
    kind: 'help',
    helpCategory: 'shelter',
    description: '[DEMO SEED] Elderly family (4 pax) trapped on ground floor as canal waters rise in Wellampitiya. Require shelter evacuation assistance.',
    latitude: 6.9468,
    longitude: 79.8895,
    locationSource: 'manual',
    status: 'submitted',
    history: [{ action: 'submitted', actorId: userMap.citizen._id, at: new Date() }],
  });

  // Create Seeded Active Incident with Road Closure
  const demoIncident = await Incident.create({
    title: '[DEMO SEED] Baseline Road Flooding & Corridor Closure',
    hazardType: 'flood',
    severity: 'severe',
    status: 'dispatched',
    isRoadClosed: true,
    center: { latitude: 6.9535, longitude: 79.8732 },
    ward: { id: 'ward-grandpass', name: 'Grandpass / Nagalagam Street' },
    road: { id: 'road-baseline', name: 'Baseline Road (Arterial Corridor)', hierarchy: 'arterial' },
    reportIds: [hazardReport._id, baselineReport._id],
    dispatch: {
      crewId: userMap.crew._id,
      crewName: 'Field Team Alpha (demo-crew)',
      dispatchedBy: userMap.officer._id,
      dispatchedAt: new Date(),
      instructions: 'Deploy water barriers and warning signage at Grandpass junction. Divert southbound traffic via Peliyagoda corridor.',
    },
    clarifications: [
      {
        question: 'Local confirmation requested: Is Baseline Road north of Grandpass junction passable for light vehicles?',
        requestedBy: userMap.officer._id,
        requestedAt: new Date(),
        status: 'active',
        responses: [],
      },
    ],
    history: [
      { action: 'created', actorId: userMap.officer._id, at: new Date() },
      { action: 'dispatched', actorId: userMap.officer._id, at: new Date() },
    ],
  });

  hazardReport.incidentId = demoIncident._id;
  hazardReport.status = 'dispatched';
  await hazardReport.save();

  console.log(`✓ Seeded demonstration incident: ${demoIncident.title} (ID: ${demoIncident._id})`);
  console.log(`✓ Baseline Road marked CLOSED (triggers dynamic Dijkstra safe rerouting).`);
  console.log(`✓ Seeded help request pending at Relief Desk: ID ${helpReport._id}`);
  console.log('\n🌟 DEMO ENVIRONMENT READY.');
  console.log('To view credentials, inspect server/generated/demo-accounts.json.');
  console.log('All 5 workspaces (Citizen, Operations, Crew, Relief, Admin) are fully populated.');
}

resetDemo()
  .catch(err => {
    console.error('Demo reset failed:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
