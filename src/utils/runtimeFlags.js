const RUNTIME_FLAGS_KEY = 'crs-runtime-flags-v1';

export const DEFAULT_RUNTIME_FLAGS = {
  forceLocalData: false,
  allowRemoteQuestionBank: true,
  enableAdvancedForecasting: true,
  enablePerfTelemetry: true,
};

function normalizeFlags(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    forceLocalData: !!source.forceLocalData,
    allowRemoteQuestionBank: source.allowRemoteQuestionBank !== false,
    enableAdvancedForecasting: source.enableAdvancedForecasting !== false,
    enablePerfTelemetry: source.enablePerfTelemetry !== false,
  };
}

export function readRuntimeFlags() {
  if (typeof window === 'undefined') return { ...DEFAULT_RUNTIME_FLAGS };
  try {
    const raw = window.localStorage.getItem(RUNTIME_FLAGS_KEY);
    if (!raw) return { ...DEFAULT_RUNTIME_FLAGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RUNTIME_FLAGS, ...normalizeFlags(parsed) };
  } catch {
    return { ...DEFAULT_RUNTIME_FLAGS };
  }
}

export function saveRuntimeFlags(nextFlags) {
  const normalized = {
    ...DEFAULT_RUNTIME_FLAGS,
    ...normalizeFlags(nextFlags),
  };
  if (typeof window === 'undefined') return normalized;
  try {
    window.localStorage.setItem(RUNTIME_FLAGS_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage failures
  }
  try {
    window.dispatchEvent(new Event('crs-runtime-flags-updated'));
  } catch {
    // ignore event dispatch failures
  }
  return normalized;
}

export function resetRuntimeFlags() {
  if (typeof window === 'undefined') return { ...DEFAULT_RUNTIME_FLAGS };
  try {
    window.localStorage.removeItem(RUNTIME_FLAGS_KEY);
  } catch {
    // ignore storage failures
  }
  try {
    window.dispatchEvent(new Event('crs-runtime-flags-updated'));
  } catch {
    // ignore event dispatch failures
  }
  return { ...DEFAULT_RUNTIME_FLAGS };
}
