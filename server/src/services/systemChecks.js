/**
 * System Checks (Plain Code) - Topic 04 Reference Flow Stage 03:
 * Weather Check and Cluster Check execute entirely in deterministic code and rules.
 * No AI models are called in this layer.
 */

export function runWeatherCheck(caseContext) {
  const { weatherSnapshot } = caseContext;
  if (!weatherSnapshot) {
    return {
      type: 'system',
      checkName: 'weather',
      verdict: 'inconclusive',
      signal: 'missing_feed',
      confidenceWeight: 0.1,
      reasons: ['No hydrometric or meteorological data was available for this location.'],
      metrics: null,
    };
  }

  const { station, riverGauge } = weatherSnapshot;
  const rainfallRate = station?.reading?.rainfallRateMmH || 0;
  const rainfall3h = station?.reading?.rainfall3hMm || 0;
  const riverLevel = riverGauge?.reading?.levelFeet || 0;
  const riverAlertLevel = riverGauge?.levels?.alertFeet || 5.0;
  const riverMinorFlood = riverGauge?.levels?.minorFloodFeet || 7.0;

  const reasons = [];
  let score = 0; // -2 to +3

  // Rainfall rules (Sri Lanka Meteorology Department standard thresholds)
  if (rainfallRate >= 50 || rainfall3h >= 100) {
    score += 2;
    reasons.push(`Extreme torrential precipitation recorded: ${rainfallRate} mm/h (3h cumulative: ${rainfall3h} mm).`);
  } else if (rainfallRate >= 25 || rainfall3h >= 50) {
    score += 1.5;
    reasons.push(`Heavy monsoon rainfall recorded: ${rainfallRate} mm/h (3h cumulative: ${rainfall3h} mm).`);
  } else if (rainfallRate >= 10 || rainfall3h >= 25) {
    score += 0.5;
    reasons.push(`Moderate rainfall recorded: ${rainfallRate} mm/h.`);
  } else if (rainfallRate < 2 && rainfall3h < 5) {
    score -= 1;
    reasons.push(`Dry or minimal precipitation observed locally: ${rainfallRate} mm/h (3h: ${rainfall3h} mm).`);
  }

  // River gauge rules (Kelani basin flood levels)
  if (riverGauge?.reading) {
    if (riverLevel >= riverMinorFlood) {
      score += 2;
      reasons.push(`${riverGauge.name} is above minor flood stage at ${riverLevel} ft (flood threshold ${riverMinorFlood} ft).`);
    } else if (riverLevel >= riverAlertLevel) {
      score += 1;
      reasons.push(`${riverGauge.name} has breached alert stage at ${riverLevel} ft (alert threshold ${riverAlertLevel} ft).`);
    } else {
      reasons.push(`${riverGauge.name} remains within normal capacity at ${riverLevel} ft.`);
    }
  }

  let verdict = 'inconclusive';
  let signal = 'neutral';
  let confidenceWeight = 0.5;

  if (score >= 2) {
    verdict = 'supportive';
    signal = 'strongly_corroborates_flood';
    confidenceWeight = 0.9;
  } else if (score >= 1) {
    verdict = 'supportive';
    signal = 'moderately_corroborates_flood';
    confidenceWeight = 0.75;
  } else if (score < 0) {
    verdict = 'contradictory';
    signal = 'unsupported_by_weather';
    confidenceWeight = 0.65;
    reasons.push('Current meteorological sensors do not indicate elevated flood conditions. Localized pipe/drain blockage remains possible.');
  } else {
    verdict = 'inconclusive';
    signal = 'borderline';
    confidenceWeight = 0.5;
    reasons.push('Weather data is borderline or insufficient to definitively confirm or contradict flooding.');
  }

  return {
    type: 'system',
    checkName: 'weather',
    verdict,
    signal,
    confidenceWeight,
    reasons,
    metrics: {
      rainfallRateMmH: rainfallRate,
      rainfall3hMm: rainfall3h,
      riverGaugeName: riverGauge?.name,
      riverGaugeLevelFeet: riverLevel,
      riverGaugeStatus: riverGauge?.reading?.status || 'normal',
    },
  };
}

export function runClusterCheck(caseContext) {
  const { nearbyCluster } = caseContext;
  const count = nearbyCluster?.count || 0;
  const radius = nearbyCluster?.radiusMeters || 200;
  const windowHours = nearbyCluster?.timeWindowHours || 4;

  const reasons = [];
  let verdict = 'isolated';
  let corroborationStrength = 'none';
  let confidenceWeight = 0.3;

  if (count >= 3) {
    verdict = 'dense_cluster';
    corroborationStrength = 'strong';
    confidenceWeight = 0.9;
    reasons.push(`Dense cluster: ${count} other independent reports submitted within ${radius} m in the past ${windowHours} hours.`);
  } else if (count >= 1) {
    verdict = 'clustered';
    corroborationStrength = 'moderate';
    confidenceWeight = 0.7;
    reasons.push(`Corroborated: ${count} other report(s) found within ${radius} m in the past ${windowHours} hours.`);
  } else {
    verdict = 'isolated';
    corroborationStrength = 'none';
    confidenceWeight = 0.4;
    reasons.push(`Isolated report: no corroborating citizen reports found within ${radius} m in the past ${windowHours} hours.`);
  }

  return {
    type: 'system',
    checkName: 'cluster',
    verdict,
    corroborationStrength,
    confidenceWeight,
    count,
    radiusMeters: radius,
    timeWindowHours: windowHours,
    reasons,
    nearbyReportIds: nearbyCluster?.reports?.map(r => r.id) || [],
  };
}
