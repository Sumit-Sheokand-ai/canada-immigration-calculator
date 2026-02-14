import { describe, expect, it } from 'vitest';
import { calculate } from '../src/scoring/scoring.js';
import { buildPathPlans } from '../src/scoring/pathPlanner.js';

function sampleAnswers() {
  return {
    pathway: 'fsw',
    age: '30',
    education: 'bachelors',
    langTestType: 'celpip',
    celpip_listening: '7',
    celpip_reading: '7',
    celpip_writing: '7',
    celpip_speaking: '7',
    hasFrench: 'no',
    canadianWorkExp: '0',
    foreignWorkExp: '3',
    hasSpouse: 'no',
    hasPNP: 'no',
    hasJobOffer: 'no',
    canadianEducation: 'no',
    hasSibling: 'no',
  };
}

describe('path planner', () => {
  it('returns ranked plans with non-negative structure and descending fit score', () => {
    const answers = sampleAnswers();
    const result = calculate(answers);
    const planner = buildPathPlans(answers, result, { targetScore: result.total + 80 });

    expect(planner.plans.length).toBeGreaterThan(0);
    for (const plan of planner.plans) {
      expect(plan.potentialGain).toBeGreaterThan(0);
      expect(plan.estimatedMonths).toBeGreaterThan(0);
      expect(Array.isArray(plan.milestones)).toBe(true);
      expect(plan.milestones.length).toBeGreaterThan(0);
    }

    for (let i = 1; i < planner.plans.length; i++) {
      expect(planner.plans[i - 1].fitScore).toBeGreaterThanOrEqual(planner.plans[i].fitScore);
    }
  });

  it('includes pnp fast-track path when candidate is not nominated', () => {
    const answers = sampleAnswers();
    const result = calculate(answers);
    const planner = buildPathPlans(answers, result, { targetScore: 520 });
    const pnp = planner.plans.find((p) => p.id === 'pnp-fast-track');
    expect(pnp).toBeTruthy();
    expect(pnp.potentialGain).toBeGreaterThanOrEqual(600);
  });
});
