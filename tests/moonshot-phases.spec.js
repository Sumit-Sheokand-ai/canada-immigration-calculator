import { describe, expect, it } from 'vitest';
import {
  buildApplicationCommandCenter,
  buildCommunityBenchmarkIntelligence,
  buildConsultantCollaborationWorkspace,
  buildGroundedStrategyCopilot,
  buildOpportunityRadar,
  computeStrategicInsights,
} from '../src/utils/strategyHub';

const BASE_ANSWERS = {
  age: '31',
  education: 'masters',
  pathway: 'fsw',
  knowsScore: 'no',
  firstOfficialLanguage: 'english',
  langTestType: 'ielts',
  ielts_listening: '8',
  ielts_reading: '7',
  ielts_writing: '7',
  ielts_speaking: '7',
  canadianWorkExp: '1',
  foreignWorkExp: '2',
  hasFrench: 'no',
  hasPNP: 'no',
};

const BASE_RESULT = {
  total: 514,
  breakdown: {
    coreHumanCapital: 426,
    spouseFactors: 0,
    skillTransferability: 66,
    additionalPoints: 22,
  },
  policy: {
    version: 'ircc-2025-03-25-v2',
    source: 'effective_date',
  },
};

describe('moonshot phases 4-8', () => {
  it('returns all new phase payload blocks from computeStrategicInsights', () => {
    const insights = computeStrategicInsights({
      answers: BASE_ANSWERS,
      result: BASE_RESULT,
      suggestions: [
        { title: 'Retake IELTS', description: 'Increase language floor', potentialGain: 18 },
        { title: 'Target category lanes', description: 'Align with category draws', potentialGain: 12 },
      ],
      averageCutoff: 525,
      activeDraws: {
        generalProgram: [
          { date: '2026-02-10', score: 522, program: 'CEC' },
          { date: '2026-01-27', score: 524, program: 'CEC' },
        ],
        categoryBased: [
          { date: '2026-02-03', score: 404, program: 'French' },
        ],
        pnpDraws: [],
      },
      provinces: [{ id: 'on', name: 'Ontario', matchScore: 76 }],
      progress: {},
      enableAdvancedForecasting: true,
      eligibleCategoryCount: 2,
    });

    expect(insights.opportunityRadar).toBeTruthy();
    expect(insights.commandCenter).toBeTruthy();
    expect(insights.copilot).toBeTruthy();
    expect(insights.collaboration).toBeTruthy();
    expect(insights.communityBenchmarks).toBeTruthy();

    expect(Array.isArray(insights.opportunityRadar.signals)).toBe(true);
    expect(insights.opportunityRadar.signals.length).toBeGreaterThan(0);
    expect(insights.commandCenter.readinessScore).toBeGreaterThanOrEqual(0);
    expect(insights.commandCenter.readinessScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(insights.copilot.cards)).toBe(true);
    expect(insights.copilot.cards.length).toBeGreaterThanOrEqual(3);
    expect(insights.collaboration.workspaceId).toMatch(/^ws-/);
    expect(insights.communityBenchmarks.percentile).toBeGreaterThanOrEqual(1);
    expect(insights.communityBenchmarks.percentile).toBeLessThanOrEqual(99);
  });

  it('builds deterministic standalone phase engines from provided context', () => {
    const strategy = {
      score: 510,
      cutoff: 525,
      gap: 15,
      confidenceBand: 'Medium',
      overallConfidence: 64,
      profileSignals: { minLanguageClb: 8, profileComplexity: 54 },
      top: {
        title: 'Language lane',
        score: 77,
        scoreGain: 24,
        months: 4,
        reason: 'Highest near-term gain per effort unit.',
        lane: 'Language',
        constraintFitScore: 73,
      },
      nextBest: {
        title: 'Ontario PNP Focus',
      },
      ranked: [
        {
          id: 'lane-language',
          title: 'Language lane',
          lane: 'Language',
          reason: 'Fastest controllable gain.',
          score: 77,
          scoreGain: 24,
          months: 4,
          confidence: 68,
          effort: 'Medium',
          riskPenalty: 4,
          riskFlags: [],
          constraintFitScore: 73,
        },
      ],
      bottlenecks: [{ key: 'additionalPoints', label: 'Additional point factors', headroom: 61 }],
      globalRiskFlags: [],
    };
    const actionPlan = {
      completionPct: 34,
      completedCount: 1,
      tasks: [{ id: 't1', title: 'Book IELTS', priority: 'High', dateWindow: 'Mar 1 - Mar 7' }],
      nextBestTask: { title: 'Book IELTS' },
    };
    const forecast = {
      confidenceScore: 66,
      trendDirection: 'stable',
      projectedNextCutoff: 523,
    };
    const digitalTwin = {
      recommendedHorizonId: '6m',
    };

    const opportunityRadar = buildOpportunityRadar({
      strategy,
      forecast,
      averageCutoff: 525,
      userScore: 510,
      eligibleCategoryCount: 1,
    });
    const commandCenter = buildApplicationCommandCenter({
      answers: BASE_ANSWERS,
      result: BASE_RESULT,
      strategy,
      actionPlan,
      opportunityRadar,
    });
    const copilot = buildGroundedStrategyCopilot({
      strategy,
      forecast,
      actionPlan,
      digitalTwin,
      commandCenter,
      opportunityRadar,
    });
    const collaboration = buildConsultantCollaborationWorkspace({
      answers: BASE_ANSWERS,
      result: BASE_RESULT,
      strategy,
      actionPlan,
      commandCenter,
      copilot,
    });
    const benchmarks = buildCommunityBenchmarkIntelligence({
      answers: BASE_ANSWERS,
      result: BASE_RESULT,
      strategy,
    });

    expect(opportunityRadar.readinessIndex).toBeGreaterThanOrEqual(0);
    expect(commandCenter.checklist.length).toBeGreaterThan(0);
    expect(copilot.cards.length).toBeGreaterThan(0);
    expect(collaboration.reviewChecklist.length).toBeGreaterThan(0);
    expect(['Top decile', 'Upper quartile', 'Above median', 'Emerging tier', 'Early tier']).toContain(benchmarks.benchmarkBand);
  });
});
