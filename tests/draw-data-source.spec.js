import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCategoryConfigCache,
  clearLatestDrawsCache,
  getCategoryDrawInfo,
  getFallbackCategoryDrawInfo,
  getFallbackLatestDraws,
  getLatestDraws,
} from '../src/utils/drawDataSource.js';

describe('draw data source', () => {
  beforeEach(() => {
    clearLatestDrawsCache();
    clearCategoryConfigCache();
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

  it('returns category draw info with fallback-compatible shape', async () => {
    const res = await getCategoryDrawInfo({ forceRefresh: true });
    expect(res.status).toBe('ok');
    expect(['local-fallback', 'supabase']).toContain(res.source);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data[0]).toHaveProperty('id');
    expect(res.data[0]).toHaveProperty('check');
  });

  it('exposes fallback category list used by app bootstrap', () => {
    const fallback = getFallbackCategoryDrawInfo();
    expect(Array.isArray(fallback)).toBe(true);
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback[0]).toHaveProperty('recentCutoff');
  });
});
