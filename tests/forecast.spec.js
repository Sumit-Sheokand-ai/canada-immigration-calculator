import { describe, expect, it } from 'vitest';
import { buildOutcomeForecast } from '../src/utils/strategyHub';

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
