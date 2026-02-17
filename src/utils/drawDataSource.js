import {
  categoryBasedInfo as fallbackCategoryDrawInfo,
  latestDraws as fallbackLatestDraws,
} from '../data/crsData';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const CACHE_TTL_MS = 5 * 60 * 1000;
const ENABLE_REMOTE_CATEGORY_CONFIG = import.meta.env.VITE_ENABLE_CATEGORY_CONFIG_REMOTE === 'true';
let latestDrawsCache = {
  data: null,
  source: 'none',
  fetchedAt: 0,
};
let categoryConfigCache = {
  data: null,
  source: 'none',
  fetchedAt: 0,
};
let canQueryRemoteCategoryConfig = ENABLE_REMOTE_CATEGORY_CONFIG;

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
function normalizeCategoryConfig(row) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || '').trim();
  const name = String(row.name || '').trim();
  const icon = String(row.icon || '').trim();
  const description = String(row.description || '').trim();
  const eligibility = String(row.eligibility || '').trim();
  const cutoffRange = String(row.cutoff_range || row.cutoffRange || '').trim();
  const recentCutoff = Number(row.recent_cutoff ?? row.recentCutoff);

  if (!id || !name || !icon || !description || !eligibility) return null;
  if (!Number.isFinite(recentCutoff)) return null;

  return {
    id,
    name,
    icon,
    description,
    eligibility,
    recentCutoff,
    cutoffRange: cutoffRange || 'N/A',
    source: row.source || 'supabase',
    updatedAt: row.updated_at || null,
  };
}
function isMissingCategoryConfigTable(error) {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  if (code === 'PGRST205') return true;
  if (message.includes('could not find the table')) return true;
  if (message.includes('category_draw_configs') && message.includes('schema cache')) return true;
  if (message.includes('relation') && message.includes('does not exist')) return true;
  return false;
}

function mergeCategoryDrawInfo(configRows = []) {
  const fallbackById = new Map(fallbackCategoryDrawInfo.map((item) => [item.id, item]));
  const overridesById = new Map();

  for (const row of configRows) {
    const normalized = normalizeCategoryConfig(row);
    if (!normalized) continue;
    if (!overridesById.has(normalized.id)) {
      overridesById.set(normalized.id, normalized);
    }
  }

  const mergedKnown = fallbackCategoryDrawInfo.map((base) => {
    const override = overridesById.get(base.id);
    if (!override) return base;
    return {
      ...base,
      name: override.name,
      icon: override.icon,
      description: override.description,
      eligibility: override.eligibility,
      recentCutoff: override.recentCutoff,
      cutoffRange: override.cutoffRange,
      source: override.source,
      updatedAt: override.updatedAt,
    };
  });

  const unknownOverrides = [...overridesById.values()]
    .filter((item) => !fallbackById.has(item.id))
    .map((item) => ({
      ...item,
      check: () => false,
    }));

  return [...mergedKnown, ...unknownOverrides];
}

export function getFallbackLatestDraws() {
  return fallbackLatestDraws;
}
export function getFallbackCategoryDrawInfo() {
  return fallbackCategoryDrawInfo;
}

export function clearLatestDrawsCache() {
  latestDrawsCache = { data: null, source: 'none', fetchedAt: 0 };
}
export function clearCategoryConfigCache() {
  categoryConfigCache = { data: null, source: 'none', fetchedAt: 0 };
  canQueryRemoteCategoryConfig = ENABLE_REMOTE_CATEGORY_CONFIG;
}

export async function getLatestDraws({ forceRefresh = false } = {}) {
  if (!forceRefresh && latestDrawsCache.data && (Date.now() - latestDrawsCache.fetchedAt) < CACHE_TTL_MS) {
    return { status: 'ok', source: latestDrawsCache.source, data: latestDrawsCache.data };
  }

  if (isSupabaseConfigured && supabase && canQueryRemoteCategoryConfig) {
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

export async function getCategoryDrawInfo({ forceRefresh = false } = {}) {
  if (!forceRefresh && categoryConfigCache.data && (Date.now() - categoryConfigCache.fetchedAt) < CACHE_TTL_MS) {
    return { status: 'ok', source: categoryConfigCache.source, data: categoryConfigCache.data };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('category_draw_configs')
        .select('id,source,name,icon,description,eligibility,recent_cutoff,cutoff_range,is_active,updated_at')
        .eq('is_active', true)
        .order('updated_at', { ascending: false });
      if (isMissingCategoryConfigTable(error)) {
        canQueryRemoteCategoryConfig = false;
      }

      if (!error && Array.isArray(data) && data.length > 0) {
        const merged = mergeCategoryDrawInfo(data);
        categoryConfigCache = {
          data: merged,
          source: 'supabase',
          fetchedAt: Date.now(),
        };
        return { status: 'ok', source: 'supabase', data: merged };
      }
    } catch {
      // fallback path below
    }
  }

  categoryConfigCache = {
    data: fallbackCategoryDrawInfo,
    source: 'local-fallback',
    fetchedAt: Date.now(),
  };
  return { status: 'ok', source: 'local-fallback', data: fallbackCategoryDrawInfo };
}
