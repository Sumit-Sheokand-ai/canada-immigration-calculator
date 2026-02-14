import { beforeEach, describe, expect, it } from 'vitest';
import { clearLatestDrawsCache, getFallbackLatestDraws, getLatestDraws } from '../src/utils/drawDataSource.js';

describe('draw data source', () => {
  beforeEach(() => {
    clearLatestDrawsCache();
  });

  it('returns fallback payload when Supabase data is unavailable', async () => {
    const res = await getLatestDraws({ forceRefresh: true });
    expect(res.status).toBe('ok');
    expect(['local-fallback', 'supabase']).toContain(res.source);
    expect(Array.isArray(res.data.generalProgram)).toBe(true);
    expect(Array.isArray(res.data.categoryBased)).toBe(true);
    expect(Array.isArray(res.data.pnpDraws)).toBe(true);
    expect(Number.isFinite(Number(res.data.averageCutoff))).toBe(true);
  });

  it('exposes fallback snapshot used by the app boot path', () => {
    const fallback = getFallbackLatestDraws();
    expect(fallback).toBeTypeOf('object');
    expect(Array.isArray(fallback.generalProgram)).toBe(true);
    expect(Array.isArray(fallback.categoryBased)).toBe(true);
    expect(Array.isArray(fallback.pnpDraws)).toBe(true);
    expect(Number.isFinite(Number(fallback.averageCutoff))).toBe(true);
  });
});
