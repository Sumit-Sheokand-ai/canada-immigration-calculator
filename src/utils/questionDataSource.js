import { fallbackQuestionBank } from '../data/questionBank';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { readRuntimeFlags } from './runtimeFlags';

const CACHE_TTL_MS = 5 * 60 * 1000;
const QUESTION_BANK_STORAGE_KEY = 'crs-cache-question-bank-v1';
let questionCache = {
  data: null,
  source: 'none',
  fetchedAt: 0,
};
let questionCacheHydrated = false;

function normalizeOption(option) {
  if (!option || typeof option !== 'object') return null;
  const value = String(option.value ?? '').trim();
  const label = String(option.label ?? '').trim();
  if (!value || !label) return null;
  const example = typeof option.example === 'string' ? option.example : '';
  const keywords = Array.isArray(option.keywords) ? option.keywords.map((item) => String(item)) : [];
  return { value, label, example, keywords };
}

function readPersistedCache() {
  try {
    const raw = localStorage.getItem(QUESTION_BANK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePersistedCache(value) {
  try {
    localStorage.setItem(QUESTION_BANK_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // no-op for private mode/storage quota issues
  }
}

function removePersistedCache() {
  try {
    localStorage.removeItem(QUESTION_BANK_STORAGE_KEY);
  } catch {
    // no-op for private mode/storage quota issues
  }
}

function isCacheFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && fetchedAt > 0 && (Date.now() - fetchedAt) < CACHE_TTL_MS;
}

function toQuestionResponse(cacheEntry, { revalidating = false } = {}) {
  return {
    status: 'ok',
    source: cacheEntry.source,
    data: cacheEntry.data,
    fetchedAt: cacheEntry.fetchedAt,
    freshness: isCacheFresh(cacheEntry.fetchedAt) ? 'fresh' : 'stale',
    revalidating,
  };
}

function hydrateQuestionCacheFromStorage() {
  if (questionCacheHydrated) return;
  questionCacheHydrated = true;
  const persisted = readPersistedCache();
  const normalized = normalizeQuestionSetPayload(persisted?.data);
  const fetchedAt = Number(persisted?.fetchedAt || 0);
  if (!normalized || !Number.isFinite(fetchedAt) || fetchedAt <= 0) return;
  questionCache = {
    data: normalized,
    source: String(persisted?.source || 'supabase-cache'),
    fetchedAt,
  };
}

function setQuestionCache(data, source) {
  questionCache = {
    data,
    source,
    fetchedAt: Date.now(),
  };
  writePersistedCache({
    data,
    source,
    fetchedAt: questionCache.fetchedAt,
  });
}

function normalizeGroup(group) {
  if (!group || typeof group !== 'object') return null;
  const answerKey = String(group.answerKey ?? '').trim();
  const title = String(group.title ?? '').trim();
  if (!answerKey || !title) return null;
  const type = String(group.type || 'list');
  const options = Array.isArray(group.options)
    ? group.options.map(normalizeOption).filter(Boolean)
    : [];
  return {
    title,
    answerKey,
    type,
    searchable: Boolean(group.searchable),
    searchPlaceholder: typeof group.searchPlaceholder === 'string' ? group.searchPlaceholder : '',
    options,
  };
}

function normalizeVisibility(visibility) {
  if (!visibility || typeof visibility !== 'object') return undefined;
  const normalizeRules = (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((rule) => rule && typeof rule === 'object' && rule.key)
      .map((rule) => ({
        key: String(rule.key),
        op: String(rule.op || 'eq'),
        value: rule.value,
      }));
  };
  const all = normalizeRules(visibility.all);
  const any = normalizeRules(visibility.any);
  const none = normalizeRules(visibility.none);
  if (!all.length && !any.length && !none.length) return undefined;
  return { all, any, none };
}

function normalizeQuestion(step) {
  if (!step || typeof step !== 'object') return null;
  const id = String(step.id ?? '').trim();
  const type = String(step.type ?? '').trim();
  if (!id || !type) return null;

  const normalized = {
    id,
    label: String(step.label ?? ''),
    title: String(step.title ?? ''),
    subtitle: String(step.subtitle ?? ''),
    helpTip: String(step.helpTip ?? ''),
    type,
    answerKey: String(step.answerKey ?? ''),
    layout: String(step.layout ?? ''),
    searchable: Boolean(step.searchable),
    searchPlaceholder: String(step.searchPlaceholder ?? ''),
    hasNOCSearch: Boolean(step.hasNOCSearch),
    visibility: normalizeVisibility(step.visibility),
  };

  if (type === 'grouped') {
    normalized.groups = Array.isArray(step.groups)
      ? step.groups.map(normalizeGroup).filter(Boolean)
      : [];
    if (!normalized.groups.length) return null;
  } else {
    normalized.options = Array.isArray(step.options)
      ? step.options.map(normalizeOption).filter(Boolean)
      : [];
    if (!normalized.answerKey || !normalized.options.length) return null;
  }

  return normalized;
}

function normalizeQuestionSetPayload(payload) {
  let steps = [];
  if (Array.isArray(payload)) {
    steps = payload;
  } else if (payload && typeof payload === 'object' && Array.isArray(payload.steps)) {
    steps = payload.steps;
  }
  const normalized = steps.map(normalizeQuestion).filter(Boolean);
  return normalized.length > 0 ? normalized : null;
}

export function getFallbackQuestionBank() {
  return fallbackQuestionBank;
}
export function peekQuestionBankCache() {
  hydrateQuestionCacheFromStorage();
  if (questionCache.data) return toQuestionResponse(questionCache);
  return toQuestionResponse({
    data: fallbackQuestionBank,
    source: 'local-fallback',
    fetchedAt: 0,
  });
}

export function clearQuestionBankCache() {
  questionCache = { data: null, source: 'none', fetchedAt: 0 };
  questionCacheHydrated = true;
  removePersistedCache();
}

async function refreshQuestionBankFromRemote() {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('Supabase client unavailable');
      const { data, error } = await supabase
        .from('question_sets')
        .select('id,source,version,payload,updated_at')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (!error) {
        const row = data?.[0];
        const normalized = normalizeQuestionSetPayload(row?.payload);
        if (normalized) {
          setQuestionCache(normalized, 'supabase');
          return toQuestionResponse(questionCache);
        }
      }
    } catch {
      // fallback below
    }
  }

  if (questionCache.data) {
    return toQuestionResponse(questionCache);
  }

  setQuestionCache(fallbackQuestionBank, 'local-fallback');
  return toQuestionResponse(questionCache);
}

function notifyRevalidated(onRevalidated, payload) {
  if (typeof onRevalidated !== 'function') return;
  onRevalidated(payload);
}

export async function getQuestionBank({ forceRefresh = false, staleWhileRevalidate = true, onRevalidated = null } = {}) {
  const runtimeFlags = readRuntimeFlags();
  if (runtimeFlags.forceLocalData || !runtimeFlags.allowRemoteQuestionBank) {
    setQuestionCache(fallbackQuestionBank, runtimeFlags.forceLocalData ? 'local-forced' : 'local-config');
    return toQuestionResponse(questionCache);
  }

  hydrateQuestionCacheFromStorage();

  if (!forceRefresh && questionCache.data) {
    const cachedResponse = toQuestionResponse(questionCache);
    if (cachedResponse.freshness === 'fresh' || !staleWhileRevalidate) {
      return cachedResponse;
    }
    void refreshQuestionBankFromRemote()
      .then((next) => notifyRevalidated(onRevalidated, next))
      .catch(() => {
        // no-op: keep stale cache response
      });
    return { ...cachedResponse, revalidating: true };
  }

  const refreshed = await refreshQuestionBankFromRemote();
  return refreshed;
}

