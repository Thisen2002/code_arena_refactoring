import { buildCase } from './caseBuilder.js';
import { runWeatherCheck, runClusterCheck } from './systemChecks.js';
import { runVisualCheck, runRiskAndAggregatorCheck } from '../ai/gemini.js';

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
    } else {
      // Run optimized combined Visual Check
      const visualResult = await runVisualCheck({
        bytes: photoBuffer,
        mimeType,
        claimedWard: caseContext.mappedWard?.name,
        claimedRoad: caseContext.mappedRoad?.name,
        apiKey,
        model,
      });

      // Unpack into expected structure to maintain backwards compatibility
      imageCheck = {
        type: 'ai',
        checkName: 'image',
        hazardType: visualResult.hazardType,
        severity: visualResult.severity,
        isDisasterRelated: visualResult.isDisasterRelated,
        visualEvidence: visualResult.visualEvidence,
        reasons: visualResult.imageReasons,
        confidence: visualResult.confidence,
      };

      locationCheck = {
        type: 'ai',
        checkName: 'location',
        sceneType: visualResult.sceneType,
        plausibleForClaimedWard: visualResult.plausibleForClaimedWard,
        locationEvidence: visualResult.locationEvidence,
        sceneConsistency: visualResult.sceneConsistency,
        reasons: visualResult.locationReasons,
        uncertainty: visualResult.locationUncertainty,
      };
    }

    // Run optimized combined Risk & Aggregator Check
    const combinedRiskAggregator = await runRiskAndAggregatorCheck({
      report,
      mappedRoad: caseContext.mappedRoad,
      mappedWard: caseContext.mappedWard,
      weatherCheck,
      clusterCheck,
      imageSignal: imageCheck,
      locationSignal: locationCheck,
      apiKey,
      model,
    });

    riskCheck = {
      type: 'ai',
      checkName: 'risk',
      urgency: combinedRiskAggregator.urgency,
      lifeSafetyRisk: combinedRiskAggregator.lifeSafetyRisk,
      risingWaterIndicators: combinedRiskAggregator.risingWaterIndicators,
      roadHierarchyRisk: combinedRiskAggregator.roadHierarchyRisk,
      vulnerableFactors: combinedRiskAggregator.vulnerableFactors,
      reasons: combinedRiskAggregator.riskReasons,
    };

    aggregator = {
      type: 'ai_aggregator',
      verdict: combinedRiskAggregator.verdict,
      urgency: combinedRiskAggregator.urgency,
      confidence: combinedRiskAggregator.confidence,
      recommendedOutcome: combinedRiskAggregator.recommendedOutcome,
      reasons: combinedRiskAggregator.aggregatorReasons,
      uncertainty: combinedRiskAggregator.aggregatorUncertainty,
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
