import {
  categoryBasedInfo as fallbackCategoryDrawInfo,
  latestDraws as fallbackLatestDraws,
} from '../data/crsData';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { readRuntimeFlags } from './runtimeFlags';

const CACHE_TTL_MS = 5 * 60 * 1000;
const ENABLE_REMOTE_CATEGORY_CONFIG = import.meta.env.VITE_ENABLE_CATEGORY_CONFIG_REMOTE === 'true';
const LATEST_DRAWS_STORAGE_KEY = 'crs-cache-latest-draws-v1';
const CATEGORY_CONFIG_STORAGE_KEY = 'crs-cache-category-config-v1';
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
let latestDrawsCacheHydrated = false;
let categoryConfigCacheHydrated = false;
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

function readPersistedCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePersistedCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // no-op for private mode/storage quota issues
  }
}

function removePersistedCache(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // no-op for private mode/storage quota issues
  }
}

function isCacheFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && fetchedAt > 0 && (Date.now() - fetchedAt) < CACHE_TTL_MS;
}

function toFreshness(fetchedAt) {
  return isCacheFresh(fetchedAt) ? 'fresh' : 'stale';
}

function toDrawResponse(cacheEntry, { revalidating = false } = {}) {
  return {
    status: 'ok',
    source: cacheEntry.source,
    data: cacheEntry.data,
    fetchedAt: cacheEntry.fetchedAt,
    freshness: toFreshness(cacheEntry.fetchedAt),
    revalidating,
  };
}

function serializeCategoryRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    id: row?.id || '',
    source: row?.source || 'supabase',
    name: row?.name || '',
    icon: row?.icon || '',
    description: row?.description || '',
    eligibility: row?.eligibility || '',
    recent_cutoff: Number(row?.recentCutoff ?? row?.recent_cutoff),
    cutoff_range: row?.cutoffRange ?? row?.cutoff_range ?? 'N/A',
    updated_at: row?.updatedAt ?? row?.updated_at ?? null,
  }));
}

function hydrateLatestDrawCacheFromStorage() {
  if (latestDrawsCacheHydrated) return;
  latestDrawsCacheHydrated = true;
  const persisted = readPersistedCache(LATEST_DRAWS_STORAGE_KEY);
  const normalized = normalizeDrawPayload(persisted?.data);
  const fetchedAt = Number(persisted?.fetchedAt || 0);
  if (!normalized || !Number.isFinite(fetchedAt) || fetchedAt <= 0) return;
  latestDrawsCache = {
    data: normalized,
    source: String(persisted?.source || 'supabase-cache'),
    fetchedAt,
  };
}

function hydrateCategoryCacheFromStorage() {
  if (categoryConfigCacheHydrated) return;
  categoryConfigCacheHydrated = true;
  const persisted = readPersistedCache(CATEGORY_CONFIG_STORAGE_KEY);
  const rows = serializeCategoryRows(persisted?.data || []);
  if (!rows.length) return;
  const merged = mergeCategoryDrawInfo(rows);
  if (!merged.length) return;
  const fetchedAt = Number(persisted?.fetchedAt || 0);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return;
  categoryConfigCache = {
    data: merged,
    source: String(persisted?.source || 'supabase-cache'),
    fetchedAt,
  };
}

function setLatestDrawsCache(data, source) {
  latestDrawsCache = {
    data,
    source,
    fetchedAt: Date.now(),
  };
  writePersistedCache(LATEST_DRAWS_STORAGE_KEY, {
    data,
    source,
    fetchedAt: latestDrawsCache.fetchedAt,
  });
}

function setCategoryConfigCache(data, source) {
  categoryConfigCache = {
    data,
    source,
    fetchedAt: Date.now(),
  };
  writePersistedCache(CATEGORY_CONFIG_STORAGE_KEY, {
    data: serializeCategoryRows(data),
    source,
    fetchedAt: categoryConfigCache.fetchedAt,
  });
}

export function getFallbackLatestDraws() {
  return fallbackLatestDraws;
}
export function getFallbackCategoryDrawInfo() {
  return fallbackCategoryDrawInfo;
}
export function peekLatestDrawsCache() {
  hydrateLatestDrawCacheFromStorage();
  if (latestDrawsCache.data) return toDrawResponse(latestDrawsCache);
  return toDrawResponse({
    data: fallbackLatestDraws,
    source: 'local-fallback',
    fetchedAt: 0,
  });
}
export function peekCategoryDrawInfoCache() {
  hydrateCategoryCacheFromStorage();
  if (categoryConfigCache.data) return toDrawResponse(categoryConfigCache);
  return toDrawResponse({
    data: fallbackCategoryDrawInfo,
    source: 'local-fallback',
    fetchedAt: 0,
  });
}

export function clearLatestDrawsCache() {
  latestDrawsCache = { data: null, source: 'none', fetchedAt: 0 };
  latestDrawsCacheHydrated = true;
  removePersistedCache(LATEST_DRAWS_STORAGE_KEY);
}
export function clearCategoryConfigCache() {
  categoryConfigCache = { data: null, source: 'none', fetchedAt: 0 };
  categoryConfigCacheHydrated = true;
  canQueryRemoteCategoryConfig = ENABLE_REMOTE_CATEGORY_CONFIG;
  removePersistedCache(CATEGORY_CONFIG_STORAGE_KEY);
}

async function refreshLatestDrawsFromRemote() {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('Supabase client unavailable');
      const { data, error } = await supabase
        .from('draw_snapshots')
        .select('payload,last_updated')
        .order('last_updated', { ascending: false })
        .limit(1);

      if (!error) {
        const row = data?.[0];
        const normalized = normalizeDrawPayload(row?.payload);
        if (normalized) {
          setLatestDrawsCache(normalized, 'supabase');
          return toDrawResponse(latestDrawsCache);
        }
      }
    } catch {
      // fallback path below
    }
  }

  if (latestDrawsCache.data) {
    return toDrawResponse(latestDrawsCache);
  }

  setLatestDrawsCache(fallbackLatestDraws, 'local-fallback');
  return toDrawResponse(latestDrawsCache);
}

async function refreshCategoryConfigFromRemote() {
  if (isSupabaseConfigured && canQueryRemoteCategoryConfig) {
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('Supabase client unavailable');
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
        setCategoryConfigCache(merged, 'supabase');
        return toDrawResponse(categoryConfigCache);
      }
    } catch {
      // fallback path below
    }
  }

  if (categoryConfigCache.data) {
    return toDrawResponse(categoryConfigCache);
  }

  setCategoryConfigCache(fallbackCategoryDrawInfo, 'local-fallback');
  return toDrawResponse(categoryConfigCache);
}

function notifyRevalidated(onRevalidated, payload) {
  if (typeof onRevalidated !== 'function') return;
  onRevalidated(payload);
}

export async function getLatestDraws({ forceRefresh = false, staleWhileRevalidate = true, onRevalidated = null } = {}) {
  const runtimeFlags = readRuntimeFlags();
  if (runtimeFlags.forceLocalData) {
    setLatestDrawsCache(fallbackLatestDraws, 'local-forced');
    return toDrawResponse(latestDrawsCache);
  }

  hydrateLatestDrawCacheFromStorage();

  if (!forceRefresh && latestDrawsCache.data) {
    const cachedResponse = toDrawResponse(latestDrawsCache);
    if (cachedResponse.freshness === 'fresh' || !staleWhileRevalidate) {
      return cachedResponse;
    }
    void refreshLatestDrawsFromRemote()
      .then((next) => notifyRevalidated(onRevalidated, next))
      .catch(() => {
        // no-op: keep stale cache response
      });
    return { ...cachedResponse, revalidating: true };
  }

  const refreshed = await refreshLatestDrawsFromRemote();
  return refreshed;
}

export async function getCategoryDrawInfo({ forceRefresh = false, staleWhileRevalidate = true, onRevalidated = null } = {}) {
  const runtimeFlags = readRuntimeFlags();
  if (runtimeFlags.forceLocalData) {
    setCategoryConfigCache(fallbackCategoryDrawInfo, 'local-forced');
    return toDrawResponse(categoryConfigCache);
  }

  hydrateCategoryCacheFromStorage();

  if (!forceRefresh && categoryConfigCache.data) {
    const cachedResponse = toDrawResponse(categoryConfigCache);
    if (cachedResponse.freshness === 'fresh' || !staleWhileRevalidate) {
      return cachedResponse;
    }
    void refreshCategoryConfigFromRemote()
      .then((next) => notifyRevalidated(onRevalidated, next))
      .catch(() => {
        // no-op: keep stale cache response
      });
    return { ...cachedResponse, revalidating: true };
  }

  const refreshed = await refreshCategoryConfigFromRemote();
  return refreshed;
}
