import { describe, expect, it } from 'vitest';
import { buildConsultantHandoffPayload } from '../src/utils/handoffExport';

describe('consultant handoff export', () => {
  it('builds a structured payload with summary, strategy, and plan blocks', () => {
    const payload = buildConsultantHandoffPayload({
      answers: { age: '29', education: 'masters', hasPNP: 'no' },
      result: {
        total: 512,
        breakdown: { coreHumanCapital: 410, spouseFactors: 0, skillTransferability: 72, additionalPoints: 30 },
        details: { age: 110 },
        policy: { version: 'ircc-2025-03-25-v2' },
      },
      strategy: {
        confidenceBand: 'Medium',
        overallConfidence: 64,
        cutoff: 520,
        gap: 8,
        top: { title: 'Language lane', lane: 'Language', score: 78, scoreGain: 22, months: 3, confidence: 69, effort: 'Medium' },
        ranked: [{ id: 'lane-a', title: 'Language lane', lane: 'Language', score: 78, scoreGain: 22, months: 3, confidence: 69, effort: 'Medium' }],
      },
      actionPlan: {
        completionPct: 40,
        completedCount: 2,
        totalCount: 5,
        tasks: [{ id: 't1', title: 'Book exam', lane: 'Language', priority: 'High', impact: 12, dateWindow: 'Mar 1 - Mar 7', weekWindow: 'Week 1' }],
      },
      drawData: { averageCutoff: 520, lastUpdated: '2026-02-14', source: 'supabase' },
      categoryInfo: [{ id: 'french', name: 'French', recentCutoff: 400, cutoffRange: '379–416', source: 'supabase', updatedAt: '2026-02-10', check: () => false }],
    });

    expect(payload.schema).toBe('crs_consultant_handoff_v1');
    expect(payload.summary.score).toBe(512);
    expect(payload.summary.averageCutoff).toBe(520);
    expect(payload.policy.version).toBe('ircc-2025-03-25-v2');
    expect(payload.strategy.top.title).toBe('Language lane');
    expect(payload.actionPlan.tasks.length).toBe(1);
    expect(payload.dataSnapshot.categoryEligibility.length).toBe(1);
  });
});
