import { describe, expect, it } from 'vitest';
import { buildStrategyOptimizer, normalizeOptimizerConstraints } from '../src/utils/strategyHub';

const BASE_INPUT = {
  answers: {
    age: '30',
    education: 'bachelors',
    pathway: 'express_entry',
    knowsScore: 'no',
    firstOfficialLanguage: 'english',
    langTestType: 'ielts',
    ielts_listening: '7',
    ielts_reading: '6',
    ielts_writing: '6',
    ielts_speaking: '6',
    canadianWorkExp: '0',
    foreignWorkExp: '2',
    hasFrench: 'no',
  },
  result: {
    total: 470,
    breakdown: {
      coreHumanCapital: 390,
      spouseFactors: 0,
      skillTransferability: 62,
      additionalPoints: 18,
    },
  },
  averageCutoff: 520,
  categoryInfo: [],
  provinces: [{ id: 'on', name: 'Ontario', matchScore: 82 }],
  eligibleCategoryCount: 0,
};

describe('optimizer constraints', () => {
  it('normalizes and clamps optimizer constraints safely', () => {
    const normalized = normalizeOptimizerConstraints({
      budgetCad: -50,
      weeklyHours: 999,
      examAttempts: 0,
      relocationPreference: 'unknown',
    });

    expect(normalized.budgetCad).toBeGreaterThanOrEqual(500);
    expect(normalized.weeklyHours).toBeLessThanOrEqual(30);
    expect(normalized.examAttempts).toBeGreaterThanOrEqual(1);
    expect(normalized.relocationPreference).toBe('balanced');
  });

  it('boosts provincial lane when relocation preference is province-focused', () => {
    const provinceFocused = buildStrategyOptimizer({
      ...BASE_INPUT,
      optimizerConstraints: {
        budgetCad: 5000,
        weeklyHours: 8,
        examAttempts: 2,
        relocationPreference: 'province',
      },
    });
    const federalFocused = buildStrategyOptimizer({
      ...BASE_INPUT,
      optimizerConstraints: {
        budgetCad: 5000,
        weeklyHours: 8,
        examAttempts: 2,
        relocationPreference: 'federal',
      },
    });

    const provinceLaneProvincePref = provinceFocused.ranked.find((option) => option.lane === 'Provincial');
    const provinceLaneFederalPref = federalFocused.ranked.find((option) => option.lane === 'Provincial');
    expect(provinceLaneProvincePref).toBeTruthy();
    expect(provinceLaneFederalPref).toBeTruthy();
    expect(provinceLaneProvincePref.score).toBeGreaterThan(provinceLaneFederalPref.score);
  });

  it('improves exam-sensitive lane scores when exam attempts increase', () => {
    const lowAttempts = buildStrategyOptimizer({
      ...BASE_INPUT,
      optimizerConstraints: {
        budgetCad: 5000,
        weeklyHours: 8,
        examAttempts: 1,
        relocationPreference: 'balanced',
      },
    });
    const highAttempts = buildStrategyOptimizer({
      ...BASE_INPUT,
      optimizerConstraints: {
        budgetCad: 5000,
        weeklyHours: 8,
        examAttempts: 4,
        relocationPreference: 'balanced',
      },
    });

    const lowExamSensitiveLane = lowAttempts.ranked.find((option) => option.examSensitive);
    expect(lowExamSensitiveLane).toBeTruthy();
    const highExamSensitiveLane = highAttempts.ranked.find((option) => option.id === lowExamSensitiveLane.id);
    expect(highExamSensitiveLane).toBeTruthy();
    expect(highExamSensitiveLane.score).toBeGreaterThanOrEqual(lowExamSensitiveLane.score);
  });
});
