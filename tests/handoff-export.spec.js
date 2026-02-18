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
      opportunityRadar: {
        readinessIndex: 73,
        recommendedWindow: 'Next 30 days',
        recommendedOpportunityId: 'opportunity-lane-a',
        signals: [{ id: 'opportunity-lane-a', title: 'Language lane', lane: 'Language', opportunityScore: 81, confidenceBand: 'High', scoreDeltaNeeded: 4, windowLabel: 'Next 30 days', riskLevel: 'low' }],
        alertTriggers: [{ id: 'trigger-a', title: 'Language lane', trigger: 'Activate now', windowLabel: 'Next 30 days' }],
      },
      commandCenter: {
        readinessScore: 68,
        readinessBand: 'Medium',
        profileCompleteness: 84,
        blockers: [{ id: 'b1', label: 'Large score gap', detail: 'Gap remains 8 points' }],
        checklist: [{ id: 'c1', title: 'Lock baseline profile', owner: 'Candidate', dueWindow: 'This week', status: 'in_progress', evidence: 'Baseline saved' }],
      },
      copilot: {
        modelLabel: 'Grounded Strategy Copilot',
        groundingMode: 'deterministic_rulepack_v1',
        cards: [{ id: 'cp1', prompt: 'What should I do?', response: 'Book exam', confidenceBand: 'Medium', quickAction: 'section-90-day-plan', evidence: ['Top lane: Language lane'] }],
      },
      collaboration: {
        workspaceId: 'ws-demo-001',
        workspaceReadiness: 71,
        readinessBand: 'Medium',
        packageStatus: 'review_ready',
        reviewChecklist: [{ id: 'r1', label: 'Policy snapshot attached', status: 'ready', detail: 'Policy attached' }],
        collaborationNotes: ['Attach latest test receipts'],
      },
      communityBenchmarks: {
        percentile: 72,
        benchmarkBand: 'Upper quartile',
        cohort: { ageBand: '25-29', educationTier: 'masters', languageFloor: 8 },
        summary: 'You are above median.',
        comparison: [{ id: 'p50', label: 'Cohort median (P50)', score: 496, isUser: false }],
        leverageSignals: [{ id: 'l1', label: 'Additional point factors', headroom: 44 }],
      },
      drawData: { averageCutoff: 520, lastUpdated: '2026-02-14', source: 'supabase' },
      categoryInfo: [{ id: 'french', name: 'French', recentCutoff: 400, cutoffRange: '379–416', source: 'supabase', updatedAt: '2026-02-10', check: () => false }],
    });

    expect(payload.schema).toBe('crs_consultant_handoff_v1');
    expect(payload.summary.score).toBe(512);
    expect(payload.summary.averageCutoff).toBe(520);
    expect(payload.policy.version).toBe('ircc-2025-03-25-v2');
    expect(payload.strategy.top.title).toBe('Language lane');
    expect(payload.opportunityRadar.readinessIndex).toBe(73);
    expect(payload.commandCenter.readinessBand).toBe('Medium');
    expect(payload.copilot.groundingMode).toBe('deterministic_rulepack_v1');
    expect(payload.collaboration.workspaceId).toBe('ws-demo-001');
    expect(payload.communityBenchmarks.percentile).toBe(72);
    expect(payload.actionPlan.tasks.length).toBe(1);
    expect(payload.dataSnapshot.categoryEligibility.length).toBe(1);
  });
});
