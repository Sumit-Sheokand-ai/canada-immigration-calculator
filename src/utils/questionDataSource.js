import { fallbackQuestionBank } from '../data/questionBank';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const CACHE_TTL_MS = 5 * 60 * 1000;
let questionCache = {
  data: null,
  source: 'none',
  fetchedAt: 0,
};

function normalizeOption(option) {
  if (!option || typeof option !== 'object') return null;
  const value = String(option.value ?? '').trim();
  const label = String(option.label ?? '').trim();
  if (!value || !label) return null;
  const example = typeof option.example === 'string' ? option.example : '';
  const keywords = Array.isArray(option.keywords) ? option.keywords.map((item) => String(item)) : [];
  return { value, label, example, keywords };
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

export function clearQuestionBankCache() {
  questionCache = { data: null, source: 'none', fetchedAt: 0 };
}

export async function getQuestionBank({ forceRefresh = false } = {}) {
  if (!forceRefresh && questionCache.data && (Date.now() - questionCache.fetchedAt) < CACHE_TTL_MS) {
    return { status: 'ok', source: questionCache.source, data: questionCache.data };
  }

  if (isSupabaseConfigured && supabase) {
    try {
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
          questionCache = {
            data: normalized,
            source: 'supabase',
            fetchedAt: Date.now(),
          };
          return { status: 'ok', source: 'supabase', data: normalized };
        }
      }
    } catch {
      // fallback below
    }
  }

  questionCache = {
    data: fallbackQuestionBank,
    source: 'local-fallback',
    fetchedAt: Date.now(),
  };
  return { status: 'ok', source: 'local-fallback', data: fallbackQuestionBank };
}

