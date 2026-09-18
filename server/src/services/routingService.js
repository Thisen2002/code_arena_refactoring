// Closure-Aware Graph Routing Engine (Dijkstra)
// Demonstrates safe route planning avoiding active disaster hazards and closed road edges (R11).
// Strictly enforces: Simulated demo only - Never guarantees real-world safety.

import { Incident } from '../models/Incident.js';
import { haversineDistanceMeters } from '../data/demoRegion.js';

export const ROUTING_NODES = [
  { id: 'node-modara', name: 'Modara North Hub', wardId: 'ward-modara', latitude: 6.9691, longitude: 79.8642 },
  { id: 'node-grandpass', name: 'Grandpass / Nagalagam Hub', wardId: 'ward-grandpass', latitude: 6.9535, longitude: 79.8732 },
  { id: 'node-peliyagoda', name: 'Peliyagoda Bridge Crossing', wardId: 'ward-grandpass', latitude: 6.9650, longitude: 79.8820 },
  { id: 'node-wellampitiya', name: 'Wellampitiya Hub', wardId: 'ward-wellampitiya', latitude: 6.9468, longitude: 79.8895 },
  { id: 'node-kolonnawa', name: 'Kolonnawa / Orugodawatta Hub', wardId: 'ward-kolonnawa', latitude: 6.9385, longitude: 79.8821 },
  { id: 'node-borella', name: 'Borella Junction', wardId: 'ward-borella', latitude: 6.9147, longitude: 79.8778 },
  { id: 'node-cinnamon', name: 'Cinnamon Gardens Hub', wardId: 'ward-cinnamon-gardens', latitude: 6.9044, longitude: 79.8672 },
];

export const ROUTING_EDGES = [
  {
    id: 'edge-modara-grandpass',
    from: 'node-modara',
    to: 'node-grandpass',
    roadId: 'road-baseline',
    roadName: 'Baseline Road (Northern Section)',
    distanceMeters: 1900,
    estimatedMinutes: 4,
  },
  {
    id: 'edge-grandpass-borella',
    from: 'node-grandpass',
    to: 'node-borella',
    roadId: 'road-baseline',
    roadName: 'Baseline Road (Arterial Corridor)',
    distanceMeters: 4300,
    estimatedMinutes: 8,
  },
  {
    id: 'edge-grandpass-peliyagoda',
    from: 'node-grandpass',
    to: 'node-peliyagoda',
    roadId: 'road-kandy-corridor',
    roadName: 'Peliyagoda / Kelani Bridge Corridor (A1)',
    distanceMeters: 1500,
    estimatedMinutes: 3,
  },
  {
    id: 'edge-peliyagoda-wellampitiya',
    from: 'node-peliyagoda',
    to: 'node-wellampitiya',
    roadId: 'road-kandy-link',
    roadName: 'Sedawatta By-Pass Link',
    distanceMeters: 2200,
    estimatedMinutes: 5,
  },
  {
    id: 'edge-grandpass-wellampitiya',
    from: 'node-grandpass',
    to: 'node-wellampitiya',
    roadId: 'road-nagalagam',
    roadName: 'Nagalagam Street River Road',
    distanceMeters: 2000,
    estimatedMinutes: 6,
  },
  {
    id: 'edge-wellampitiya-kolonnawa',
    from: 'node-wellampitiya',
    to: 'node-kolonnawa',
    roadId: 'road-lowlevel',
    roadName: 'Low-Level Road (B435)',
    distanceMeters: 1400,
    estimatedMinutes: 4,
  },
  {
    id: 'edge-kolonnawa-borella',
    from: 'node-kolonnawa',
    to: 'node-borella',
    roadId: 'road-dematagoda-link',
    roadName: 'Orugodawatta - Dematagoda Arterial Link',
    distanceMeters: 2800,
    estimatedMinutes: 6,
  },
  {
    id: 'edge-borella-cinnamon',
    from: 'node-borella',
    to: 'node-cinnamon',
    roadId: 'road-reid-bauddhaloka',
    roadName: 'Bauddhaloka Mawatha',
    distanceMeters: 1600,
    estimatedMinutes: 3,
  },
];

export const SAFETY_DISCLAIMER =
  'SIMULATED DEMO ONLY - NEVER GUARANTEES REAL-WORLD SAFETY. In an actual emergency, follow directives from local emergency services and the Disaster Management Centre (DMC).';

export function findNearestNode(lat, lon, maxDistanceMeters = 5000) {
  let nearest = null;
  let minDist = Infinity;
  for (const node of ROUTING_NODES) {
    const dist = haversineDistanceMeters(lat, lon, node.latitude, node.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  }
  if (minDist > maxDistanceMeters) return null;
  return { node: nearest, distanceMeters: minDist };
}

/**
 * Fetch currently closed roads from MongoDB
 */
export async function getClosedRoadIds() {
  try {
    const closedIncidents = await Incident.find({
      isRoadClosed: true,
      status: { $ne: 'closed' },
    }).select('road isRoadClosed title').lean();

    const closedRoads = new Set();
    for (const inc of closedIncidents) {
      if (inc.road?.id) {
        closedRoads.add(inc.road.id);
      }
    }
    return Array.from(closedRoads);
  } catch {
    return [];
  }
}

/**
 * Run Dijkstra algorithm on graph network
 */
export async function calculateSafeRoute({ originNodeId, destinationNodeId, explicitClosedRoads }) {
  if (!originNodeId || !destinationNodeId) {
    throw new Error('Both originNodeId and destinationNodeId are required.');
  }

  if (originNodeId === destinationNodeId) {
    const node = ROUTING_NODES.find(n => n.id === originNodeId);
    return {
      success: true,
      path: [node],
      edges: [],
      totalDistanceMeters: 0,
      estimatedMinutes: 0,
      closedRoadsAvoided: [],
      hasDetour: false,
      disclaimer: SAFETY_DISCLAIMER,
    };
  }

  // Determine which roads are closed
  const closedRoadIds = explicitClosedRoads || (await getClosedRoadIds());
  const closedRoadSet = new Set(closedRoadIds);

  // Build bidirectional adjacency list, excluding closed edges
  const adj = new Map();
  for (const node of ROUTING_NODES) {
    adj.set(node.id, []);
  }

  const activeEdges = [];
  const closedEdgesEncountered = [];

  for (const edge of ROUTING_EDGES) {
    if (closedRoadSet.has(edge.roadId)) {
      closedEdgesEncountered.push(edge);
      continue; // Filter out closed road
    }
    adj.get(edge.from).push({ to: edge.to, weight: edge.distanceMeters, minutes: edge.estimatedMinutes, edge });
    adj.get(edge.to).push({ to: edge.from, weight: edge.distanceMeters, minutes: edge.estimatedMinutes, edge });
    activeEdges.push(edge);
  }

  // Standard Dijkstra
  const distances = new Map();
  const previous = new Map();
  const edgeUsed = new Map();
  const unvisited = new Set();

  for (const node of ROUTING_NODES) {
    distances.set(node.id, Infinity);
    unvisited.add(node.id);
  }
  distances.set(originNodeId, 0);

  while (unvisited.size > 0) {
    // Find node with minimum distance in unvisited
    let curr = null;
    let currDist = Infinity;
    for (const nodeId of unvisited) {
      const d = distances.get(nodeId);
      if (d < currDist) {
        currDist = d;
        curr = nodeId;
      }
    }

    if (!curr || currDist === Infinity) {
      break; // Remaining nodes are unreachable
    }

    if (curr === destinationNodeId) {
      break; // Reached target
    }

    unvisited.delete(curr);

    const neighbors = adj.get(curr) || [];
    for (const { to, weight, edge } of neighbors) {
      if (!unvisited.has(to)) continue;
      const alt = distances.get(curr) + weight;
      if (alt < distances.get(to)) {
        distances.set(to, alt);
        previous.set(to, curr);
        edgeUsed.set(to, edge);
      }
    }
  }

  // Check if destination was reached
  if (distances.get(destinationNodeId) === Infinity) {
    return {
      success: false,
      reason: 'NO_SAFE_ROUTE_AVAILABLE',
      message: 'No safe route available. All connecting corridors in the simulated network are closed due to severe hazards.',
      closedRoads: Array.from(closedRoadSet),
      originNodeId,
      destinationNodeId,
      disclaimer: SAFETY_DISCLAIMER,
    };
  }

  // Reconstruct path
  const pathNodeIds = [];
  const pathEdges = [];
  let step = destinationNodeId;
  while (step) {
    pathNodeIds.unshift(step);
    const edge = edgeUsed.get(step);
    if (edge) pathEdges.unshift(edge);
    step = previous.get(step);
  }

  const nodesMap = new Map(ROUTING_NODES.map(n => [n.id, n]));
  const pathNodes = pathNodeIds.map(id => nodesMap.get(id));
  const totalDistance = distances.get(destinationNodeId);
  const totalMinutes = pathEdges.reduce((sum, e) => sum + e.estimatedMinutes, 0);

  // Check if any closed road was in the vicinity/avoided
  const avoidedRoads = Array.from(closedRoadSet);

  return {
    success: true,
    path: pathNodes,
    edges: pathEdges,
    totalDistanceMeters: totalDistance,
    estimatedMinutes: totalMinutes,
    closedRoadsAvoided: avoidedRoads,
    hasDetour: avoidedRoads.length > 0,
    disclaimer: SAFETY_DISCLAIMER,
  };
}
