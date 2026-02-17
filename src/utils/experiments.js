import { trackEvent } from './analytics';

const EXP_ASSIGNMENTS_KEY = 'crs-exp-assignments-v1';
const EXP_OVERRIDES_KEY = 'crs-exp-overrides-v1';
const EXP_VISITOR_ID_KEY = 'crs-exp-visitor-id-v1';
const EXP_SESSION_EXPOSURES_KEY = 'crs-exp-exposures-v1';

export const EXPERIMENT_DEFINITIONS = {
  pricing_layout_v1: {
    variants: [
      { id: 'control', weight: 50 },
      { id: 'pro_first', weight: 50 },
    ],
    goals: ['pricing_cta_click', 'handoff_export'],
  },
};

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function readLocalObject(key) {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(key), {});
}

function writeLocalObject(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value || {}));
  } catch {
    // ignore storage quota failures
  }
}

function readSessionObject(key) {
  if (typeof window === 'undefined') return {};
  return safeParse(window.sessionStorage.getItem(key), {});
}

function writeSessionObject(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value || {}));
  } catch {
    // ignore storage quota failures
  }
}

function hashString(value = '') {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function computeExperimentVariant(experimentKey, subjectId, definitions = EXPERIMENT_DEFINITIONS) {
  const experiment = definitions?.[experimentKey];
  if (!experiment || !Array.isArray(experiment.variants) || experiment.variants.length === 0) {
    return 'control';
  }
  const normalized = experiment.variants
    .map((variant) => ({
      id: String(variant.id || ''),
      weight: Number(variant.weight) > 0 ? Number(variant.weight) : 0,
    }))
    .filter((variant) => variant.id && variant.weight > 0);
  if (!normalized.length) return 'control';

  const totalWeight = normalized.reduce((sum, variant) => sum + variant.weight, 0);
  const seed = hashString(`${experimentKey}:${subjectId || 'default'}`);
  const bucket = seed % totalWeight;

  let cursor = 0;
  for (const variant of normalized) {
    cursor += variant.weight;
    if (bucket < cursor) return variant.id;
  }
  return normalized[normalized.length - 1].id;
}

function getOrCreateVisitorId() {
  if (typeof window === 'undefined') return 'server';
  const existing = String(window.localStorage.getItem(EXP_VISITOR_ID_KEY) || '').trim();
  if (existing) return existing;
  const next = `visitor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  try {
    window.localStorage.setItem(EXP_VISITOR_ID_KEY, next);
  } catch {
    // ignore storage failures
  }
  return next;
}

function getVariantOverride(experimentKey) {
  const overrides = readLocalObject(EXP_OVERRIDES_KEY);
  const value = String(overrides?.[experimentKey] || '').trim();
  if (!value) return null;
  const experiment = EXPERIMENT_DEFINITIONS[experimentKey];
  const hasVariant = experiment?.variants?.some((variant) => variant.id === value);
  return hasVariant ? value : null;
}

function trackExposureOnce(assignment) {
  if (typeof window === 'undefined') return;
  const seen = readSessionObject(EXP_SESSION_EXPOSURES_KEY);
  const signature = `${assignment.experimentKey}:${assignment.variant}`;
  if (seen?.[assignment.experimentKey] === signature) return;
  writeSessionObject(EXP_SESSION_EXPOSURES_KEY, {
    ...seen,
    [assignment.experimentKey]: signature,
  });
  trackEvent('experiment_exposure', {
    experiment_key: assignment.experimentKey,
    experiment_variant: assignment.variant,
    experiment_source: assignment.source,
  });
}

export function getExperimentAssignment(experimentKey, { autoTrack = false } = {}) {
  const definition = EXPERIMENT_DEFINITIONS[experimentKey];
  if (!definition) {
    return {
      experimentKey,
      variant: 'control',
      source: 'unknown_experiment',
    };
  }

  const overrides = getVariantOverride(experimentKey);
  const visitorId = getOrCreateVisitorId();
  const variant = overrides || computeExperimentVariant(experimentKey, visitorId);
  const source = overrides ? 'override' : 'hash';

  const assignments = readLocalObject(EXP_ASSIGNMENTS_KEY);
  if (assignments?.[experimentKey] !== variant) {
    writeLocalObject(EXP_ASSIGNMENTS_KEY, {
      ...assignments,
      [experimentKey]: variant,
    });
  }

  const assignment = {
    experimentKey,
    variant,
    source,
    visitorId,
  };

  if (autoTrack) trackExposureOnce(assignment);
  return assignment;
}

export function trackExperimentGoal(experimentKey, goal, payload = {}) {
  const assignment = getExperimentAssignment(experimentKey, { autoTrack: true });
  trackEvent('experiment_goal', {
    experiment_key: assignment.experimentKey,
    experiment_variant: assignment.variant,
    experiment_source: assignment.source,
    goal,
    ...payload,
  });
  return assignment;
}

export function readExperimentAssignments() {
  return readLocalObject(EXP_ASSIGNMENTS_KEY);
}
