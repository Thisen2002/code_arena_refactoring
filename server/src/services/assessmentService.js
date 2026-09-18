import { buildCase } from './caseBuilder.js';
import { runWeatherCheck, runClusterCheck } from './systemChecks.js';
import { runFullAssessment } from '../ai/gemini.js';

export async function evaluateReport({
  report,
  reportsModel,
  photoBuffer = null,
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  actorId = null,
}) {
  // 1. Stage 02: Case Builder (System)
  const caseContext = await buildCase({ report, reportsModel });

  // 2. Stage 03: System Checks (Deterministic plain code)
  const weatherCheck = runWeatherCheck(caseContext);
  const clusterCheck = runClusterCheck(caseContext);

  // If photo is missing or API credentials are not set, handle cleanly
  const mimeType = report.photo?.mimeType || 'image/jpeg';
  const hasPhotoBytes = Boolean(photoBuffer && photoBuffer.length > 0);

  let imageCheck;
  let locationCheck;
  let riskCheck;
  let aggregator;

  try {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in server/.env.');
    }

    if (!hasPhotoBytes) {
      // Legacy report without stored photo
      imageCheck = {
        type: 'ai',
        checkName: 'image',
        hazardType: 'unknown',
        severity: 'none',
        isDisasterRelated: false,
        visualEvidence: ['No photographic evidence stored with this legacy record.'],
        reasons: ['Visual AI evaluation skipped because no photo was submitted.'],
        confidence: 0.1,
      };
      locationCheck = {
        type: 'ai',
        checkName: 'location',
        sceneType: 'unclear',
        plausibleForClaimedWard: true,
        locationEvidence: 'unknown',
        sceneConsistency: 'inconclusive',
        reasons: ['No photo available to inspect environmental scene.'],
        uncertainty: ['Missing visual evidence; GPS remains unverified.'],
      };

      // Since there's no photo, we must still run an assessment based purely on context.
      // But the full assessment requires context anyway. We can pass empty bytes.
    }

    // Run the OPTIMIZED single API call for the entire case
    const fullResult = await runFullAssessment({
      report,
      bytes: hasPhotoBytes ? photoBuffer : null,
      mimeType,
      mappedWard: caseContext.mappedWard,
      mappedRoad: caseContext.mappedRoad,
      weatherCheck,
      clusterCheck,
      apiKey,
      model,
    });

    if (hasPhotoBytes) {
      imageCheck = {
        type: 'ai',
        checkName: 'image',
        hazardType: fullResult.hazardType,
        severity: fullResult.severity,
        isDisasterRelated: fullResult.isDisasterRelated,
        visualEvidence: fullResult.visualEvidence,
        reasons: fullResult.imageReasons,
        confidence: fullResult.confidence, // For schema compatibility, though it is usually 1 confidence overall
      };

      locationCheck = {
        type: 'ai',
        checkName: 'location',
        sceneType: fullResult.sceneType,
        plausibleForClaimedWard: fullResult.plausibleForClaimedWard,
        locationEvidence: fullResult.locationEvidence,
        sceneConsistency: fullResult.sceneConsistency,
        reasons: fullResult.locationReasons,
        uncertainty: fullResult.locationUncertainty,
      };
    }

    riskCheck = {
      type: 'ai',
      checkName: 'risk',
      urgency: fullResult.urgency,
      lifeSafetyRisk: fullResult.lifeSafetyRisk,
      risingWaterIndicators: fullResult.risingWaterIndicators,
      roadHierarchyRisk: fullResult.roadHierarchyRisk,
      vulnerableFactors: fullResult.vulnerableFactors,
      reasons: fullResult.riskReasons,
    };

    aggregator = {
      type: 'ai_aggregator',
      verdict: fullResult.verdict,
      urgency: fullResult.urgency,
      confidence: fullResult.confidence,
      recommendedOutcome: fullResult.recommendedOutcome,
      reasons: fullResult.aggregatorReasons,
      uncertainty: fullResult.aggregatorUncertainty,
    };

    const assessmentResult = {
      status: 'evaluated',
      caseSnapshot: {
        mappedWard: caseContext.mappedWard,
        mappedRoad: caseContext.mappedRoad,
        nearbyCluster: caseContext.nearbyCluster,
        weatherSnapshot: caseContext.weatherSnapshot,
        assembledAt: caseContext.assembledAt,
      },
      checks: {
        weather: weatherCheck,
        cluster: clusterCheck,
        image: imageCheck,
        location: locationCheck,
        risk: riskCheck,
      },
      aggregator,
      evaluatedAt: new Date(),
      evaluator: actorId ? { actorId, type: 'human_officer_triggered' } : { type: 'system_pipeline' },
      error: null,
    };

    return assessmentResult;
  } catch (error) {
    // Failure policy: Never fake AI results. Record failed evaluation for officer review/retry.
    return {
      status: 'failed',
      caseSnapshot: {
        mappedWard: caseContext.mappedWard,
        mappedRoad: caseContext.mappedRoad,
        nearbyCluster: caseContext.nearbyCluster,
        weatherSnapshot: caseContext.weatherSnapshot,
        assembledAt: caseContext.assembledAt,
      },
      checks: {
        weather: weatherCheck,
        cluster: clusterCheck,
        image: null,
        location: null,
        risk: null,
      },
      aggregator: null,
      evaluatedAt: new Date(),
      evaluator: actorId ? { actorId, type: 'human_officer_triggered' } : { type: 'system_pipeline' },
      error: error?.message ? `AI evaluation error: ${error.message}` : 'AI evaluation could not complete. Stored for manual officer review or retry.',
    };
  }
}
