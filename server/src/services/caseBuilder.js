import { findNearestWard, findNearestRoad, getWeatherSnapshot, haversineDistanceMeters } from '../data/demoRegion.js';

export const CLUSTER_RADIUS_METERS = 200;
export const CLUSTER_WINDOW_HOURS = 4;

/**
 * Case Builder (System) - Topic 04 Reference Flow Stage 02:
 * Plain backend code joins the report with everything the checks need:
 * - Maps each report to a road and ward
 * - Pulls stored reports nearby (within 200m in the last 4 hours)
 * - Captures a live/mocked weather & river level snapshot
 */
export async function buildCase({ report, reportsModel }) {
  const lat = Number(report.latitude);
  const lon = Number(report.longitude);

  // 1. Spatial lookups for ward and road network
  const wardLookup = findNearestWard(lat, lon);
  const roadLookup = findNearestRoad(lat, lon);

  // 2. Query nearby reports within 200m created in the last CLUSTER_WINDOW_HOURS
  const since = new Date(Date.now() - CLUSTER_WINDOW_HOURS * 60 * 60 * 1000);
  let nearbyReports = [];

  if (reportsModel && reportsModel.find) {
    // Spatial box filter approximation (~0.005 degrees is ~500m around lat/lon)
    const latDelta = 0.005;
    const lonDelta = 0.005;

    const candidates = await reportsModel.find({
      _id: { $ne: report._id },
      createdAt: { $gte: since },
      latitude: { $gte: lat - latDelta, $lte: lat + latDelta },
      longitude: { $gte: lon - lonDelta, $lte: lon + lonDelta },
    }).select('_id kind description latitude longitude createdAt status locationEvidence').lean();

    // Exact Haversine distance filter for 200m
    nearbyReports = candidates
      .map(c => ({
        ...c,
        distanceMeters: haversineDistanceMeters(lat, lon, c.latitude, c.longitude),
      }))
      .filter(c => c.distanceMeters <= CLUSTER_RADIUS_METERS)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  // 3. Current weather and river hydrometric snapshot
  const weatherSnapshot = getWeatherSnapshot(lat, lon);

  return {
    reportId: String(report._id),
    reportKind: report.kind || 'hazard',
    helpCategory: report.helpCategory || null,
    claimedCoordinates: { latitude: lat, longitude: lon },
    locationSource: report.locationSource || 'manual',
    gpsAccuracy: report.gpsAccuracy,
    hasPhoto: Boolean(report.photo?.fileId),
    photoMetadata: report.photo ? {
      mimeType: report.photo.mimeType,
      size: report.photo.size,
      width: report.photo.width,
      height: report.photo.height,
      hasExifGps: Boolean(report.photo.exifGps?.latitude !== undefined),
      exifGps: report.photo.exifGps || null,
    } : null,
    mappedWard: {
      id: wardLookup.ward?.id || 'unknown',
      name: wardLookup.coverageLabel,
      distanceMeters: wardLookup.distanceMeters,
      withinCoverage: wardLookup.withinDemoCoverage,
      floodVulnerability: wardLookup.ward?.floodVulnerability || 'unknown',
      riverBasin: wardLookup.ward?.riverBasin || 'unmapped',
    },
    mappedRoad: {
      id: roadLookup.road?.id || 'unmapped',
      name: roadLookup.roadLabel,
      hierarchy: roadLookup.hierarchy,
      distanceMeters: roadLookup.distanceMeters,
      adjacent: roadLookup.adjacent,
    },
    nearbyCluster: {
      radiusMeters: CLUSTER_RADIUS_METERS,
      timeWindowHours: CLUSTER_WINDOW_HOURS,
      count: nearbyReports.length,
      reports: nearbyReports.map(r => ({
        id: String(r._id),
        kind: r.kind,
        description: r.description.slice(0, 100),
        distanceMeters: r.distanceMeters,
        createdAt: r.createdAt,
      })),
    },
    weatherSnapshot,
    assembledAt: new Date().toISOString(),
  };
}
