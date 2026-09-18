// Simulated demonstration geographic region: Colombo Municipal Council & Kelani River Basin, Sri Lanka.
// Clearly labelled demonstration data representing real flood-prone wards and transport corridors.

export const DEMO_WARDS = [
  {
    id: 'ward-grandpass',
    name: 'Grandpass / Nagalagam Street',
    district: 'Colombo',
    center: { latitude: 6.9535, longitude: 79.8732 },
    radiusMeters: 1200,
    floodVulnerability: 'critical',
    riverBasin: 'Kelani Ganga Lower Basin',
    description: 'Low-lying riverbank zone adjacent to the primary Kelani River Nagalagam hydrometric gauge.',
  },
  {
    id: 'ward-wellampitiya',
    name: 'Wellampitiya / Sedawatta',
    district: 'Colombo',
    center: { latitude: 6.9468, longitude: 79.8895 },
    radiusMeters: 1400,
    floodVulnerability: 'critical',
    riverBasin: 'Kelani Ganga Floodplain',
    description: 'High-density residential and commercial basin historically prone to severe flash flooding and inundation.',
  },
  {
    id: 'ward-modara',
    name: 'Modara / Colombo North',
    district: 'Colombo',
    center: { latitude: 6.9691, longitude: 79.8642 },
    radiusMeters: 1100,
    floodVulnerability: 'moderate',
    riverBasin: 'Kelani Estuary / Coastal',
    description: 'Estuarine coastal ward subject to tidal backwater during high river discharge.',
  },
  {
    id: 'ward-kolonnawa',
    name: 'Kolonnawa / Orugodawatta',
    district: 'Colombo',
    center: { latitude: 6.9385, longitude: 79.8821 },
    radiusMeters: 1300,
    floodVulnerability: 'high',
    riverBasin: 'Kolonnawa Canal Catchment',
    description: 'Canal confluence area with industrial depots and vulnerable settlements.',
  },
  {
    id: 'ward-borella',
    name: 'Borella / Baseline Corridor',
    district: 'Colombo',
    center: { latitude: 6.9147, longitude: 79.8778 },
    radiusMeters: 1200,
    floodVulnerability: 'moderate',
    riverBasin: 'Colombo Urban Canal Basin',
    description: 'Major arterial transit junction with critical emergency hospital access routes.',
  },
  {
    id: 'ward-cinnamon-gardens',
    name: 'Cinnamon Gardens / Colombo 07',
    district: 'Colombo',
    center: { latitude: 6.9044, longitude: 79.8672 },
    radiusMeters: 1300,
    floodVulnerability: 'low',
    riverBasin: 'Western Higher Ground',
    description: 'Elevated urban district with institutions and major roadways; low baseline flood risk.',
  },
];

export const DEMO_ROADS = [
  {
    id: 'road-baseline',
    name: 'Baseline Road (A2 / A1 Link)',
    hierarchy: 'arterial',
    speedLimitKmH: 60,
    criticalRoute: true,
    start: { latitude: 6.9650, longitude: 79.8720 },
    end: { latitude: 6.9000, longitude: 79.8780 },
    elevationProfile: 'mixed',
  },
  {
    id: 'road-lowlevel',
    name: 'Low-Level Road (B435 - Wellampitiya to Kaduwela)',
    hierarchy: 'collector',
    speedLimitKmH: 45,
    criticalRoute: false,
    start: { latitude: 6.9480, longitude: 79.8800 },
    end: { latitude: 6.9350, longitude: 79.9100 },
    elevationProfile: 'floodplain_low',
  },
  {
    id: 'road-kandy-corridor',
    name: 'Peliyagoda / Kelani Bridge Corridor (A1)',
    hierarchy: 'arterial',
    speedLimitKmH: 70,
    criticalRoute: true,
    start: { latitude: 6.9580, longitude: 79.8750 },
    end: { latitude: 6.9750, longitude: 79.8900 },
    elevationProfile: 'elevated_bridge',
  },
  {
    id: 'road-nagalagam',
    name: 'Nagalagam Street River Road',
    hierarchy: 'residential',
    speedLimitKmH: 30,
    criticalRoute: false,
    start: { latitude: 6.9520, longitude: 79.8700 },
    end: { latitude: 6.9570, longitude: 79.8780 },
    elevationProfile: 'riverbank_flush',
  },
  {
    id: 'road-reid-bauddhaloka',
    name: 'Bauddhaloka Mawatha',
    hierarchy: 'arterial',
    speedLimitKmH: 50,
    criticalRoute: true,
    start: { latitude: 6.9020, longitude: 79.8580 },
    end: { latitude: 6.9080, longitude: 79.8800 },
    elevationProfile: 'high_ground',
  },
];

export const DEMO_STATIONS = {
  riverGauges: [
    {
      id: 'gauge-nagalagam',
      name: 'Kelani Ganga - Nagalagam Street Gauge',
      wardId: 'ward-grandpass',
      location: { latitude: 6.9540, longitude: 79.8725 },
      levels: {
        normalMaxFeet: 4.0,
        alertFeet: 5.0,
        minorFloodFeet: 7.0,
        majorFloodFeet: 8.0,
      },
      currentReading: {
        levelFeet: 6.4,
        status: 'minor_flood_warning',
        trend: 'rising',
        updatedAt: '2026-09-12T13:00:00Z',
      },
    },
    {
      id: 'gauge-hanwella',
      name: 'Kelani Ganga - Hanwella Upstream Gauge',
      location: { latitude: 6.9015, longitude: 80.0820 },
      levels: {
        normalMaxFeet: 6.0,
        alertFeet: 7.5,
        minorFloodFeet: 9.0,
        majorFloodFeet: 11.0,
      },
      currentReading: {
        levelFeet: 8.2,
        status: 'alert',
        trend: 'rising',
        updatedAt: '2026-09-12T13:00:00Z',
      },
    },
  ],
  weatherStations: [
    {
      id: 'weather-colombo-central',
      name: 'Colombo Met Center Station',
      location: { latitude: 6.9271, longitude: 79.8612 },
      currentReading: {
        rainfallRateMmH: 34.5,
        rainfall3hMm: 62.0,
        rainfall24hMm: 118.0,
        condition: 'heavy_monsoon_downpour',
        windSpeedKmh: 42,
        updatedAt: '2026-09-12T13:00:00Z',
      },
    },
    {
      id: 'weather-kolonnawa-basin',
      name: 'Kolonnawa Automated Rain Gauge',
      location: { latitude: 6.9400, longitude: 79.8850 },
      currentReading: {
        rainfallRateMmH: 48.0,
        rainfall3hMm: 85.5,
        rainfall24hMm: 145.0,
        condition: 'torrential_rain',
        windSpeedKmh: 38,
        updatedAt: '2026-09-12T13:00:00Z',
      },
    },
  ],
};

// Earth radius in meters for Haversine calculations
const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

// Distance from point to line segment in meters
function distanceToSegmentMeters(pLat, pLon, aLat, aLon, bLat, bLon) {
  const dAB = haversineDistanceMeters(aLat, aLon, bLat, bLon);
  if (dAB === 0) return haversineDistanceMeters(pLat, pLon, aLat, aLon);

  // Approximate planar projection for local distances (<20km)
  const x = (pLon - aLon) * Math.cos(((aLat + bLat) / 2 * Math.PI) / 180);
  const y = pLat - aLat;
  const dx = (bLon - aLon) * Math.cos(((aLat + bLat) / 2 * Math.PI) / 180);
  const dy = bLat - aLat;

  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy)));
  const projLat = aLat + t * (bLat - aLat);
  const projLon = aLon + t * (bLon - aLon);

  return haversineDistanceMeters(pLat, pLon, projLat, projLon);
}

export function findNearestWard(lat, lon) {
  let best = null;
  let minDistance = Infinity;

  for (const ward of DEMO_WARDS) {
    const dist = haversineDistanceMeters(lat, lon, ward.center.latitude, ward.center.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      best = ward;
    }
  }

  const isCovered = minDistance <= (best ? best.radiusMeters * 1.5 : 2000);
  return {
    ward: best,
    distanceMeters: minDistance,
    withinDemoCoverage: isCovered,
    coverageLabel: isCovered ? best.name : 'Outside simulated demo ward network',
  };
}

export function findNearestRoad(lat, lon) {
  let bestRoad = null;
  let minDistance = Infinity;

  for (const road of DEMO_ROADS) {
    const dist = distanceToSegmentMeters(
      lat, lon,
      road.start.latitude, road.start.longitude,
      road.end.latitude, road.end.longitude
    );
    if (dist < minDistance) {
      minDistance = dist;
      bestRoad = road;
    }
  }

  const isAdjacent = minDistance <= 1000;
  return {
    road: bestRoad,
    distanceMeters: minDistance,
    adjacent: isAdjacent,
    roadLabel: isAdjacent ? bestRoad.name : 'Unmapped local access road / lane',
    hierarchy: isAdjacent ? bestRoad.hierarchy : 'local',
  };
}

export function getWeatherSnapshot(lat, lon) {
  // Find nearest weather station
  let nearestStation = DEMO_STATIONS.weatherStations[0];
  let minWeatherDist = Infinity;
  for (const ws of DEMO_STATIONS.weatherStations) {
    const dist = haversineDistanceMeters(lat, lon, ws.location.latitude, ws.location.longitude);
    if (dist < minWeatherDist) {
      minWeatherDist = dist;
      nearestStation = ws;
    }
  }

  // Find nearest river gauge
  let nearestGauge = DEMO_STATIONS.riverGauges[0];
  let minGaugeDist = Infinity;
  for (const rg of DEMO_STATIONS.riverGauges) {
    const dist = haversineDistanceMeters(lat, lon, rg.location.latitude, rg.location.longitude);
    if (dist < minGaugeDist) {
      minGaugeDist = dist;
      nearestGauge = rg;
    }
  }

  return {
    station: {
      id: nearestStation.id,
      name: nearestStation.name,
      distanceMeters: minWeatherDist,
      reading: nearestStation.currentReading,
    },
    riverGauge: {
      id: nearestGauge.id,
      name: nearestGauge.name,
      distanceMeters: minGaugeDist,
      reading: nearestGauge.currentReading,
      levels: nearestGauge.levels,
    },
    capturedAt: new Date().toISOString(),
  };
}
