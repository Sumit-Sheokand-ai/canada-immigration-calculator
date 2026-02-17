import { describe, expect, it } from 'vitest';
import { getCRSPolicy, getAvailablePolicyRuleSets, resolvePolicyRuleSet } from '../src/scoring/policy';

describe('scoring policy rulesets', () => {
  it('exposes versioned rulesets with effective dates', () => {
    const ruleSets = getAvailablePolicyRuleSets();
    expect(Array.isArray(ruleSets)).toBe(true);
    expect(ruleSets.length).toBeGreaterThan(1);
    expect(ruleSets.every((ruleSet) => ruleSet.id && ruleSet.effectiveDate)).toBe(true);
  });

  it('resolves pre-2025 policy with arranged-employment points', () => {
    const resolved = resolvePolicyRuleSet({ asOfDate: '2024-06-01', ignoreOverride: true });
    const policy = getCRSPolicy({ asOfDate: '2024-06-01', ignoreOverride: true });
    expect(resolved.id).toBe('ircc-2024-01-01-v1');
    expect(policy.tables.additionalPointsTable.job_offer_00).toBe(200);
    expect(policy.tables.additionalPointsTable.job_offer_other).toBe(50);
  });

  it('resolves post-2025 policy with arranged-employment points removed', () => {
    const resolved = resolvePolicyRuleSet({ asOfDate: '2026-01-01', ignoreOverride: true });
    const policy = getCRSPolicy({ asOfDate: '2026-01-01', ignoreOverride: true });
    expect(resolved.id).toBe('ircc-2025-03-25-v2');
    expect(policy.tables.additionalPointsTable.job_offer_00).toBe(0);
    expect(policy.tables.additionalPointsTable.job_offer_other).toBe(0);
  });
});
