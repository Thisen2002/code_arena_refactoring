import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  findNearestWard,
  findNearestRoad,
  haversineDistanceMeters,
  getWeatherSnapshot,
} from '../src/data/demoRegion.js';
import { buildCase } from '../src/services/caseBuilder.js';
import { runWeatherCheck, runClusterCheck } from '../src/services/systemChecks.js';
import {
  fullAssessmentOutputSchema,
} from '../src/ai/gemini.js';
import { evaluateReport } from '../src/services/assessmentService.js';
import { createApp } from '../src/app.js';

test('spatial lookups map coordinates to simulated wards and roads or explicitly flag out-of-coverage', () => {
  // Near Nagalagam Street in Grandpass
  const grandpassWard = findNearestWard(6.9535, 79.8732);
  assert.equal(grandpassWard.withinDemoCoverage, true);
  assert.equal(grandpassWard.ward.id, 'ward-grandpass');

  const grandpassRoad = findNearestRoad(6.9535, 79.8732);
  assert.equal(grandpassRoad.adjacent, true);
  assert.ok(['road-nagalagam', 'road-baseline', 'road-kandy-corridor'].includes(grandpassRoad.road.id));

  // Point in Kandy / Central Highlands (outside Colombo demo coverage)
  const highlandPoint = findNearestWard(7.2906, 80.6337);
  assert.equal(highlandPoint.withinDemoCoverage, false);
  assert.equal(highlandPoint.coverageLabel, 'Outside simulated demo ward network');

  // Haversine distance accuracy sanity test (Colombo to Negombo is ~30km)
  const dist = haversineDistanceMeters(6.9271, 79.8612, 7.2088, 79.8358);
  assert.ok(dist > 25000 && dist < 38000, `Expected ~31km, got ${dist}m`);
});

test('weather SYSTEM check deterministic rules evaluate rainfall and river gauge flood signals', () => {
  // Supportive: heavy rain + river above flood stage
  const supportiveContext = {
    weatherSnapshot: {
      station: { reading: { rainfallRateMmH: 45, rainfall3hMm: 80 } },
      riverGauge: {
        name: 'Kelani Ganga Gauge',
        levels: { alertFeet: 5.0, minorFloodFeet: 7.0 },
        reading: { levelFeet: 7.5, status: 'minor_flood_warning' },
      },
    },
  };
  const supportive = runWeatherCheck(supportiveContext);
  assert.equal(supportive.type, 'system');
  assert.equal(supportive.verdict, 'supportive');
  assert.ok(supportive.confidenceWeight >= 0.7);

  // Contradictory: minimal rain and normal river levels
  const contradictoryContext = {
    weatherSnapshot: {
      station: { reading: { rainfallRateMmH: 0.5, rainfall3hMm: 1.0 } },
      riverGauge: {
        name: 'Kelani Ganga Gauge',
        levels: { alertFeet: 5.0, minorFloodFeet: 7.0 },
        reading: { levelFeet: 2.1, status: 'normal' },
      },
    },
  };
  const contradictory = runWeatherCheck(contradictoryContext);
  assert.equal(contradictory.verdict, 'contradictory');

  // Missing weather snapshot
  const missing = runWeatherCheck({});
  assert.equal(missing.verdict, 'inconclusive');
  assert.equal(missing.signal, 'missing_feed');
});

test('cluster SYSTEM check evaluates spatial-temporal report density within 200m and 4 hours', () => {
  // Isolated report
  const isolated = runClusterCheck({ nearbyCluster: { count: 0, radiusMeters: 200, timeWindowHours: 4 } });
  assert.equal(isolated.verdict, 'isolated');
  assert.equal(isolated.corroborationStrength, 'none');

  // Moderate cluster (1-2 reports)
  const clustered = runClusterCheck({ nearbyCluster: { count: 2, radiusMeters: 200, timeWindowHours: 4 } });
  assert.equal(clustered.verdict, 'clustered');
  assert.equal(clustered.corroborationStrength, 'moderate');

  // Dense cluster (3+ reports)
  const dense = runClusterCheck({ nearbyCluster: { count: 4, radiusMeters: 200, timeWindowHours: 4 } });
  assert.equal(dense.verdict, 'dense_cluster');
  assert.equal(dense.corroborationStrength, 'strong');
});

test('fullAssessmentOutputSchema enforces strict validation contracts and preserves unknown location evidence', () => {
  const validFullAssessment = {
    hazardType: 'flood',
    severity: 'severe',
    isDisasterRelated: true,
    visualEvidence: ['Submerged vehicle'],
    imageReasons: ['Water level is high'],
    sceneType: 'outdoor_road',
    plausibleForClaimedWard: true,
    locationEvidence: 'unknown',
    sceneConsistency: 'consistent_with_claimed_area',
    locationReasons: ['Looks like a road'],
    locationUncertainty: ['No GPS'],
    urgency: 'high',
    lifeSafetyRisk: 'severe',
    risingWaterIndicators: true,
    roadHierarchyRisk: 'arterial_critical',
    vulnerableFactors: ['Hospital access'],
    riskReasons: ['Road inundation'],
    verdict: 'confirmed',
    confidence: 0.88,
    recommendedOutcome: 'area_alert',
    aggregatorReasons: ['Visuals confirm'],
    aggregatorUncertainty: ['No GPS'],
  };
  
  assert.ok(fullAssessmentOutputSchema.safeParse(validFullAssessment).success);
  
  // Rejects verified location evidence based on literal 'unknown' rule
  assert.ok(!fullAssessmentOutputSchema.safeParse({ ...validFullAssessment, locationEvidence: 'verified' }).success);
  
  // Rejects invalid verdict
  assert.ok(!fullAssessmentOutputSchema.safeParse({ ...validFullAssessment, verdict: 'invalid' }).success);
});

test('case builder joins report with ward, road, nearby reports query and weather snapshot', async () => {
  const fakeReport = {
    _id: '507f1f77bcf86cd799439011',
    kind: 'hazard',
    description: 'Road inundated with 2 feet of water near Nagalagam gauge',
    latitude: 6.9535,
    longitude: 79.8732,
    locationSource: 'device',
    gpsAccuracy: 12,
    photo: { fileId: '507f1f77bcf86cd799439022', mimeType: 'image/jpeg' },
  };

  const fakeNearby = [
    {
      _id: '507f1f77bcf86cd799439033',
      kind: 'hazard',
      description: 'Water entering shop fronts',
      latitude: 6.9538,
      longitude: 79.8734,
      createdAt: new Date(),
    },
  ];

  const fakeModel = {
    find() {
      return {
        select() {
          return {
            lean: async () => fakeNearby,
          };
        },
      };
    },
  };

  const caseContext = await buildCase({ report: fakeReport, reportsModel: fakeModel });
  assert.equal(caseContext.reportId, fakeReport._id);
  assert.equal(caseContext.mappedWard.id, 'ward-grandpass');
  assert.ok(caseContext.weatherSnapshot.riverGauge);
  assert.equal(caseContext.nearbyCluster.count, 1);
  assert.ok(caseContext.nearbyCluster.reports[0].distanceMeters <= 200);
});

test('evaluateReport handles AI failure gracefully without fabricating synthetic results', async () => {
  const fakeReport = {
    _id: '507f1f77bcf86cd799439011',
    kind: 'hazard',
    description: 'Fallen tree blocking lane',
    latitude: 6.9535,
    longitude: 79.8732,
  };

  // Missing API key -> triggers safe error catch
  const result = await evaluateReport({
    report: fakeReport,
    reportsModel: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
    apiKey: '',
  });

  assert.equal(result.status, 'failed');
  assert.ok(result.error.includes('AI evaluation'));
  assert.equal(result.aggregator, null);
  assert.equal(result.checks.image, null);
  // System checks still executed cleanly!
  assert.equal(result.checks.weather.type, 'system');
  assert.equal(result.checks.cluster.type, 'system');
  assert.ok(result.caseSnapshot.mappedWard);
});

test('POST /api/reports/:id/evaluate enforces role authorization', async () => {
  const server = createApp({
    connection: { readyState: 1 },
    databaseConfigured: true,
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  try {
    // Unauthenticated -> 401
    const anonRes = await fetch(`${url}/api/reports/507f1f77bcf86cd799439011/evaluate`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'CodeArena' },
    });
    assert.equal(anonRes.status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
