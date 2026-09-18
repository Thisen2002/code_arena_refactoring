import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentFeedState,
  setSimulationStage,
  advanceSimulationStage,
  resetSimulationStage,
  SIMULATION_STAGES,
} from '../src/services/feedReplayService.js';
import {
  calculateSafeRoute,
  findNearestNode,
  ROUTING_NODES,
  SAFETY_DISCLAIMER,
} from '../src/services/routingService.js';

test('feed replay advances hydrological simulation stages and generates independent warnings (R02)', async () => {
  // Reset to stage 0
  const stage0 = await resetSimulationStage();
  assert.equal(stage0.stage, 0);
  assert.equal(stage0.alerts.length, 0);
  assert.equal(stage0.gauges['gauge-nagalagam'].levelFeet, 3.4);

  // Advance to stage 1 (Advisory)
  const stage1 = await advanceSimulationStage();
  assert.equal(stage1.stage, 1);
  assert.equal(stage1.alerts.length, 1);
  assert.equal(stage1.alerts[0].severity, 'advisory');
  assert.ok(stage1.alerts[0].affectedWards.includes('ward-grandpass'));

  // Advance to stage 2 (Minor Flood Warning)
  const stage2 = await advanceSimulationStage();
  assert.equal(stage2.stage, 2);
  assert.equal(stage2.alerts.length, 1);
  assert.equal(stage2.alerts[0].severity, 'warning');
  assert.equal(stage2.gauges['gauge-nagalagam'].levelFeet, 7.3);

  // Advance to stage 3 (Major Flood Danger)
  const stage3 = await advanceSimulationStage();
  assert.equal(stage3.stage, 3);
  assert.equal(stage3.alerts.length, 1);
  assert.equal(stage3.alerts[0].severity, 'danger');
  assert.equal(stage3.gauges['gauge-nagalagam'].levelFeet, 8.6);

  // Reset back to stage 0
  const resetState = await resetSimulationStage();
  assert.equal(resetState.stage, 0);
  assert.equal(resetState.alerts.length, 0);
});

test('Dijkstra graph routing calculates shortest path and avoids closed roads with detour (R11)', async () => {
  // Normal baseline route: Modara to Borella
  // Direct path: Modara -> Grandpass (road-baseline) -> Borella (road-baseline)
  const normalRoute = await calculateSafeRoute({
    originNodeId: 'node-modara',
    destinationNodeId: 'node-borella',
    explicitClosedRoads: [],
  });

  assert.equal(normalRoute.success, true);
  assert.ok(normalRoute.totalDistanceMeters > 0);
  assert.equal(normalRoute.closedRoadsAvoided.length, 0);
  assert.equal(normalRoute.hasDetour, false);
  assert.equal(normalRoute.disclaimer, SAFETY_DISCLAIMER);
  assert.deepEqual(
    normalRoute.path.map(n => n.id),
    ['node-modara', 'node-grandpass', 'node-borella']
  );

  // Now simulate closing road-baseline
  // Modara cannot reach Grandpass via road-baseline, but if road-baseline is closed,
  // let's test Grandpass to Borella when road-baseline is closed:
  // Alternate path: Grandpass -> Peliyagoda (road-kandy-corridor) -> Wellampitiya (road-kandy-link) -> Kolonnawa (road-lowlevel) -> Borella (road-dematagoda-link)
  // or Grandpass -> Wellampitiya (road-nagalagam) -> Kolonnawa (road-lowlevel) -> Borella (road-dematagoda-link)
  const detourRoute = await calculateSafeRoute({
    originNodeId: 'node-grandpass',
    destinationNodeId: 'node-borella',
    explicitClosedRoads: ['road-baseline'],
  });

  assert.equal(detourRoute.success, true);
  assert.equal(detourRoute.hasDetour, true);
  assert.ok(detourRoute.closedRoadsAvoided.includes('road-baseline'));
  // Ensure the path does NOT use road-baseline
  for (const edge of detourRoute.edges) {
    assert.notEqual(edge.roadId, 'road-baseline');
  }
  // Verify distance is longer than direct route
  assert.ok(detourRoute.totalDistanceMeters > 4300);
});

test('Dijkstra graph routing reports NO_SAFE_ROUTE_AVAILABLE when all corridors are closed (R11)', async () => {
  // If road-baseline, road-kandy-corridor, and road-nagalagam are all closed:
  // Grandpass is completely isolated from all other nodes!
  const blockedRoute = await calculateSafeRoute({
    originNodeId: 'node-grandpass',
    destinationNodeId: 'node-borella',
    explicitClosedRoads: ['road-baseline', 'road-kandy-corridor', 'road-nagalagam'],
  });

  assert.equal(blockedRoute.success, false);
  assert.equal(blockedRoute.reason, 'NO_SAFE_ROUTE_AVAILABLE');
  assert.match(blockedRoute.message, /No safe route available/);
  assert.equal(blockedRoute.disclaimer, SAFETY_DISCLAIMER);
});

test('spatial node lookup matches demo coordinates and rejects out-of-coverage coordinates', () => {
  // Within Colombo/Kelani demo area: Modara
  const found = findNearestNode(6.9691, 79.8642);
  assert.ok(found);
  assert.equal(found.node.id, 'node-modara');

  // Distant location: Kandy (60km away) -> outside 5000m demo radius
  const distant = findNearestNode(7.2906, 80.6337, 5000);
  assert.equal(distant, null);
});
