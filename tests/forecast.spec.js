import { describe, expect, it } from 'vitest';
import { buildInvitationDigitalTwin, buildOutcomeForecast, computeStrategicInsights } from '../src/utils/strategyHub';

describe('buildOutcomeForecast', () => {
  it('returns projection output for available draw data', () => {
    const forecast = buildOutcomeForecast({
      activeDraws: {
        generalProgram: [
          { date: '2026-01-21', score: 509, program: 'CEC' },
          { date: '2026-01-07', score: 511, program: 'CEC' },
          { date: '2025-12-16', score: 515, program: 'CEC' },
        ],
        categoryBased: [
          { date: '2026-02-06', score: 400, program: 'French' },
        ],
        pnpDraws: [],
      },
      userScore: 520,
      baseConfidence: 70,
    });

    expect(forecast).toBeTruthy();
    expect(forecast.projectedNextCutoff).toBeGreaterThan(0);
    expect(forecast.projectedDraws.length).toBe(3);
    expect(['High', 'Medium', 'Low']).toContain(forecast.confidenceBand);
    expect(['High', 'Medium', 'Low']).toContain(forecast.invitationLikelihood);
  });

  it('returns null when no draw data is available', () => {
    const forecast = buildOutcomeForecast({
      activeDraws: { generalProgram: [], categoryBased: [], pnpDraws: [] },
      userScore: 500,
    });
    expect(forecast).toBeNull();
  });
});

describe('buildInvitationDigitalTwin', () => {
  it('returns horizon projections with bounded probability bands', () => {
    const twin = buildInvitationDigitalTwin({
      strategy: {
        score: 520,
        overallConfidence: 67,
        top: { title: 'Language-first lane', scoreGain: 44 },
      },
      forecast: {
        projectedNextCutoff: 506,
        slopePerDraw: -1.5,
        volatility: 11.2,
        confidenceScore: 74,
      },
      actionPlan: { completionPct: 32 },
      averageCutoff: 515,
      userScore: 520,
    });

    expect(twin).toBeTruthy();
    expect(Array.isArray(twin.horizons)).toBe(true);
    expect(twin.horizons.length).toBe(3);
    expect(['3m', '6m', '12m']).toContain(twin.recommendedHorizonId);
    for (const horizon of twin.horizons) {
      expect(horizon.baseProbabilityPct).toBeGreaterThanOrEqual(1);
      expect(horizon.baseProbabilityPct).toBeLessThanOrEqual(99);
      expect(horizon.bestProbabilityPct).toBeGreaterThanOrEqual(1);
      expect(horizon.worstProbabilityPct).toBeLessThanOrEqual(99);
      expect(horizon.confidenceInterval.lowPct).toBeGreaterThanOrEqual(1);
      expect(horizon.confidenceInterval.highPct).toBeLessThanOrEqual(99);
    }
  });

  it('is included in computeStrategicInsights output', () => {
    const insights = computeStrategicInsights({
      answers: {
        age: '30',
        education: 'masters',
        knowsScore: 'no',
        langTestType: 'ielts',
        ielts_listening: '8',
        ielts_reading: '7',
        ielts_writing: '7',
        ielts_speaking: '7',
        canadianWorkExp: '1',
        foreignWorkExp: '2',
      },
      result: {
        total: 512,
        breakdown: {
          coreHumanCapital: 430,
          spouseFactors: 0,
          skillTransferability: 60,
          additionalPoints: 22,
        },
      },
      suggestions: [{ title: 'Improve language score', potentialGain: 24, description: 'Retake IELTS' }],
      averageCutoff: 520,
      activeDraws: {
        generalProgram: [
          { date: '2026-01-21', score: 510, program: 'CEC' },
          { date: '2026-01-07', score: 514, program: 'CEC' },
        ],
        categoryBased: [],
        pnpDraws: [],
      },
      categoryInfo: [],
      provinces: [],
      progress: {},
      enableAdvancedForecasting: true,
      eligibleCategoryCount: 0,
    });

    expect(insights.digitalTwin).toBeTruthy();
    expect(Array.isArray(insights.digitalTwin.horizons)).toBe(true);
    expect(insights.digitalTwin.horizons.length).toBeGreaterThan(0);
  });
});
