import express from 'express';
import {
  ROUTING_NODES,
  ROUTING_EDGES,
  SAFETY_DISCLAIMER,
  calculateSafeRoute,
  findNearestNode,
  getClosedRoadIds,
} from './services/routingService.js';

export function routingRouter() {
  const router = express.Router();

  // Public: Get graph network definition and currently closed corridors
  router.get('/network', async (req, res) => {
    try {
      const closedRoads = await getClosedRoadIds();
      res.json({
        nodes: ROUTING_NODES,
        edges: ROUTING_EDGES,
        closedRoads,
        disclaimer: SAFETY_DISCLAIMER,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Calculate safe route avoiding closed roads
  router.post('/plan', async (req, res) => {
    try {
      const { originNodeId, destinationNodeId, start, destination } = req.body || {};

      let resolvedOriginId = originNodeId;
      let resolvedDestId = destinationNodeId;

      // Coordinate-based resolution if provided
      if (!resolvedOriginId && start?.latitude && start?.longitude) {
        const match = findNearestNode(Number(start.latitude), Number(start.longitude));
        if (!match) {
          return res.status(400).json({
            success: false,
            reason: 'OUT_OF_COVERAGE',
            message: 'Starting location is outside the simulated Colombo/Kelani demo network.',
            disclaimer: SAFETY_DISCLAIMER,
          });
        }
        resolvedOriginId = match.node.id;
      }

      if (!resolvedDestId && destination?.latitude && destination?.longitude) {
        const match = findNearestNode(Number(destination.latitude), Number(destination.longitude));
        if (!match) {
          return res.status(400).json({
            success: false,
            reason: 'OUT_OF_COVERAGE',
            message: 'Destination location is outside the simulated Colombo/Kelani demo network.',
            disclaimer: SAFETY_DISCLAIMER,
          });
        }
        resolvedDestId = match.node.id;
      }

      if (!resolvedOriginId || !resolvedDestId) {
        return res.status(400).json({
          success: false,
          error: 'Please provide origin and destination (node IDs or coordinates).',
        });
      }

      const result = await calculateSafeRoute({
        originNodeId: resolvedOriginId,
        destinationNodeId: resolvedDestId,
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message, disclaimer: SAFETY_DISCLAIMER });
    }
  });

  return router;
}
