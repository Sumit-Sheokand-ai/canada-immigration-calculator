import { describe, expect, it } from 'vitest';
import { countQuestionPrompts, fallbackQuestionBank } from '../src/data/questionBank';

describe('question bank', () => {
  it('contains at least 50 prompts', () => {
    const total = countQuestionPrompts(fallbackQuestionBank);
    expect(total).toBeGreaterThanOrEqual(50);
  });

  it('has valid question structures', () => {
    for (const step of fallbackQuestionBank) {
      expect(typeof step.id).toBe('string');
      expect(step.id.length).toBeGreaterThan(0);
      expect(typeof step.type).toBe('string');

      if (step.type === 'grouped') {
        expect(Array.isArray(step.groups)).toBe(true);
        expect(step.groups.length).toBeGreaterThan(0);
        for (const group of step.groups) {
          expect(typeof group.answerKey).toBe('string');
          expect(Array.isArray(group.options)).toBe(true);
          expect(group.options.length).toBeGreaterThan(0);
        }
      } else {
        expect(typeof step.answerKey).toBe('string');
        expect(Array.isArray(step.options)).toBe(true);
        expect(step.options.length).toBeGreaterThan(0);
      }
    }
  });
});

