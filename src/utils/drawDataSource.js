import { latestDraws as fallbackLatestDraws } from '../data/crsData';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const CACHE_TTL_MS = 5 * 60 * 1000;
let latestDrawsCache = {
  data: null,
  source: 'none',
  fetchedAt: 0,
};

function hasBasicShape(payload) {
  return !!payload
    && typeof payload === 'object'
    && Array.isArray(payload.generalProgram)
    && Array.isArray(payload.categoryBased)
    && Array.isArray(payload.pnpDraws)
    && Number.isFinite(Number(payload.averageCutoff));
}

function normalizeDrawPayload(payload) {
  if (!hasBasicShape(payload)) return null;
  return {
    ...payload,
    generalProgram: payload.generalProgram || [],
    categoryBased: payload.categoryBased || [],
    pnpDraws: payload.pnpDraws || [],
    averageCutoff: Number(payload.averageCutoff) || fallbackLatestDraws.averageCutoff,
    lastUpdated: payload.lastUpdated || fallbackLatestDraws.lastUpdated,
    pnpRanges: payload.pnpRanges || fallbackLatestDraws.pnpRanges,
  };
}

export function getFallbackLatestDraws() {
  return fallbackLatestDraws;
}

export function clearLatestDrawsCache() {
  latestDrawsCache = { data: null, source: 'none', fetchedAt: 0 };
}

export async function getLatestDraws({ forceRefresh = false } = {}) {
  if (!forceRefresh && latestDrawsCache.data && (Date.now() - latestDrawsCache.fetchedAt) < CACHE_TTL_MS) {
    return { status: 'ok', source: latestDrawsCache.source, data: latestDrawsCache.data };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('draw_snapshots')
        .select('payload,last_updated')
        .order('last_updated', { ascending: false })
        .limit(1);

      if (!error) {
        const row = data?.[0];
        const normalized = normalizeDrawPayload(row?.payload);
        if (normalized) {
          latestDrawsCache = {
            data: normalized,
            source: 'supabase',
            fetchedAt: Date.now(),
          };
          return { status: 'ok', source: 'supabase', data: normalized };
        }
      }
    } catch {
      // fallback path below
    }
  }

  latestDrawsCache = {
    data: fallbackLatestDraws,
    source: 'local-fallback',
    fetchedAt: Date.now(),
  };
  return { status: 'ok', source: 'local-fallback', data: fallbackLatestDraws };
}
