// Independent Mock Weather & River Hydrological Feed Replay Service
// Simulates Kelani River Basin hydrometric gauges and Colombo automated rainfall stations.
// Proactively raises simulated flood warnings independently of citizen reports (R02, R11).

import { Alert } from '../models/Alert.js';
import { notifyCitizensOnWeatherAlert } from './notificationService.js';

export const SIMULATION_STAGES = [
  {
    stage: 0,
    name: 'Normal Baseline Conditions',
    description: 'Dry season / normal inter-monsoon baseline. River flow is within safe containment.',
    gauges: {
      'gauge-nagalagam': { levelFeet: 3.4, status: 'normal', trend: 'steady' },
      'gauge-hanwella': { levelFeet: 5.2, status: 'normal', trend: 'steady' },
    },
    weather: {
      'weather-colombo-central': { rainfallRateMmH: 4.5, rainfall3hMm: 8.0, condition: 'light_showers' },
      'weather-kolonnawa-basin': { rainfallRateMmH: 6.0, rainfall3hMm: 11.0, condition: 'overcast' },
    },
    alerts: [],
  },
  {
    stage: 1,
    name: 'Monsoon Surge / Hydrological Advisory',
    description: 'Heavy catchment rainfall upstream at Hanwella. River levels reaching preliminary alert thresholds.',
    gauges: {
      'gauge-nagalagam': { levelFeet: 5.2, status: 'alert', trend: 'rising' },
      'gauge-hanwella': { levelFeet: 7.8, status: 'alert', trend: 'rising' },
    },
    weather: {
      'weather-colombo-central': { rainfallRateMmH: 32.0, rainfall3hMm: 45.0, condition: 'heavy_rain' },
      'weather-kolonnawa-basin': { rainfallRateMmH: 45.0, rainfall3hMm: 62.0, condition: 'heavy_rain' },
    },
    alerts: [
      {
        title: 'Kelani River Basin - Hydrological Advisory',
        severity: 'advisory',
        source: 'Kelani River Basin Hydrological Monitor',
        trigger: {
          stationId: 'gauge-nagalagam',
          stationName: 'Kelani Ganga - Nagalagam Street Gauge',
          metric: 'water_level_feet',
          value: 5.2,
          threshold: 5.0,
        },
        affectedWards: ['ward-grandpass', 'ward-wellampitiya'],
        recommendations: [
          'Monitor river levels closely.',
          'Avoid low-lying riverbank paths and footbridges.',
          'Prepare emergency contact details.',
        ],
      },
    ],
  },
  {
    stage: 2,
    name: 'Minor Flood Warning / Floodplain Spillage',
    description: 'Continuous torrential downpour. Lower Kelani floodplains spilling into riverbank settlements.',
    gauges: {
      'gauge-nagalagam': { levelFeet: 7.3, status: 'minor_flood_warning', trend: 'rising' },
      'gauge-hanwella': { levelFeet: 9.4, status: 'minor_flood_warning', trend: 'rising' },
    },
    weather: {
      'weather-colombo-central': { rainfallRateMmH: 55.0, rainfall3hMm: 90.0, condition: 'torrential_downpour' },
      'weather-kolonnawa-basin': { rainfallRateMmH: 72.0, rainfall3hMm: 120.0, condition: 'torrential_downpour' },
    },
    alerts: [
      {
        title: 'Kelani River Minor Flood Warning - Grandpass & Wellampitiya',
        severity: 'warning',
        source: 'Kelani River Basin Hydrological Monitor',
        trigger: {
          stationId: 'gauge-nagalagam',
          stationName: 'Kelani Ganga - Nagalagam Street Gauge',
          metric: 'water_level_feet',
          value: 7.3,
          threshold: 7.0,
        },
        affectedWards: ['ward-grandpass', 'ward-wellampitiya', 'ward-kolonnawa'],
        recommendations: [
          'Move valuable property and livestock to upper levels.',
          'Residents in low-lying riverside corridors should prepare for potential evacuation.',
          'Follow municipal emergency dispatch announcements.',
        ],
      },
    ],
  },
  {
    stage: 3,
    name: 'CRITICAL: Major Flood Inundation Emergency',
    description: 'Major flood threshold breached at Nagalagam Street. Severe urban inundation across river basin.',
    gauges: {
      'gauge-nagalagam': { levelFeet: 8.6, status: 'major_flood_danger', trend: 'rapidly_rising' },
      'gauge-hanwella': { levelFeet: 11.6, status: 'major_flood_danger', trend: 'rapidly_rising' },
    },
    weather: {
      'weather-colombo-central': { rainfallRateMmH: 82.0, rainfall3hMm: 165.0, condition: 'severe_cyclonic_downpour' },
      'weather-kolonnawa-basin': { rainfallRateMmH: 105.0, rainfall3hMm: 210.0, condition: 'severe_cyclonic_downpour' },
    },
    alerts: [
      {
        title: 'CRITICAL: Kelani River Major Flood Inundation Alert',
        severity: 'danger',
        source: 'Kelani River Basin Hydrological Monitor',
        trigger: {
          stationId: 'gauge-nagalagam',
          stationName: 'Kelani Ganga - Nagalagam Street Gauge',
          metric: 'water_level_feet',
          value: 8.6,
          threshold: 8.0,
        },
        affectedWards: ['ward-grandpass', 'ward-wellampitiya', 'ward-kolonnawa', 'ward-modara'],
        recommendations: [
          'IMMEDIATE EVACUATION for riverbank and low-lying floodplain residents.',
          'Low-Level Road and Nagalagam Street river corridors impassable.',
          'Proceed immediately to designated municipal relief shelters.',
        ],
      },
    ],
  },
];

let currentStageIndex = 0;

export async function syncAlertsToDatabase() {
  const current = SIMULATION_STAGES[currentStageIndex];
  
  // Deactivate existing alerts if stage is 0 or updating
  await Alert.updateMany({ active: true }, { $set: { active: false } }).catch(() => {});

  if (!current.alerts || current.alerts.length === 0) {
    return [];
  }

  const createdAlerts = [];
  for (const alertDef of current.alerts) {
    let alertObj = alertDef;
    try {
      const alert = await Alert.create({
        ...alertDef,
        active: true,
        issuedAt: new Date(),
      });
      createdAlerts.push(alert);
      alertObj = alert;
    } catch {
      // If DB is offline or mock, continue gracefully
    }
    notifyCitizensOnWeatherAlert(alertObj).catch(() => {});
  }
  return createdAlerts;
}

export function getCurrentFeedState() {
  const current = SIMULATION_STAGES[currentStageIndex];
  return {
    stage: current.stage,
    stageName: current.name,
    description: current.description,
    gauges: current.gauges,
    weather: current.weather,
    alerts: current.alerts,
    timestamp: new Date().toISOString(),
    isSimulated: true,
    totalStages: SIMULATION_STAGES.length,
  };
}

export async function setSimulationStage(stageIdx) {
  if (typeof stageIdx !== 'number' || stageIdx < 0 || stageIdx >= SIMULATION_STAGES.length) {
    throw new Error(`Invalid stage index. Must be between 0 and ${SIMULATION_STAGES.length - 1}`);
  }
  currentStageIndex = stageIdx;
  await syncAlertsToDatabase();
  return getCurrentFeedState();
}

export async function advanceSimulationStage() {
  currentStageIndex = (currentStageIndex + 1) % SIMULATION_STAGES.length;
  await syncAlertsToDatabase();
  return getCurrentFeedState();
}

export async function resetSimulationStage() {
  currentStageIndex = 0;
  await syncAlertsToDatabase();
  return getCurrentFeedState();
}
