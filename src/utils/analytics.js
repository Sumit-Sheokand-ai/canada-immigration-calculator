const ANALYTICS_QUEUE_KEY = 'crs-analytics-queue-v2';
const ANALYTICS_SESSION_KEY = 'crs-analytics-session-v1';
const MAX_QUEUE_ITEMS = 300;
const ANALYTICS_SCHEMA_VERSION = '2.0';
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const DISPATCH_TIMEOUT_MS = 2500;

function safeParse(json, fallback) {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

function readLocalStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  return safeParse(window.localStorage.getItem(key), fallback);
}

function writeLocalStorage(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota issues
  }
}

function randomId(prefix = 'evt') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sanitizeEventName(eventName) {
  if (!eventName) return '';
  return String(eventName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .slice(0, 80);
}

function sanitizePayload(payload = {}) {
  const next = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (!key || value == null) continue;
    if (typeof value === 'string') {
      next[key] = value.slice(0, 280);
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      next[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      next[key] = value.slice(0, 20).map((item) => String(item).slice(0, 120));
      continue;
    }
    next[key] = String(value).slice(0, 280);
  }
  return next;
}

function getQueue() {
  return readLocalStorage(ANALYTICS_QUEUE_KEY, []);
}

function setQueue(queue) {
  const trimmed = Array.isArray(queue) ? queue.slice(-MAX_QUEUE_ITEMS) : [];
  writeLocalStorage(ANALYTICS_QUEUE_KEY, trimmed);
}

function getSessionMeta() {
  if (typeof window === 'undefined') {
    return { id: 'server', seq: 0, started_at: new Date().toISOString() };
  }
  const now = Date.now();
  const existing = safeParse(window.sessionStorage.getItem(ANALYTICS_SESSION_KEY), null);
  const isExpired = !existing || !existing.last_activity_ms || (now - existing.last_activity_ms > SESSION_IDLE_TIMEOUT_MS);

  const next = isExpired
    ? {
      id: randomId('sess'),
      seq: 1,
      started_at: new Date().toISOString(),
      last_activity_ms: now,
    }
    : {
      ...existing,
      seq: toNumber(existing.seq, 0) + 1,
      last_activity_ms: now,
    };

  try {
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
  return next;
}

function getClientMeta() {
  if (typeof window === 'undefined') {
    return { app_version: import.meta.env.VITE_APP_VERSION || 'dev' };
  }
  let timezone = 'unknown';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    // ignore timezone errors
  }

  return {
    app_version: import.meta.env.VITE_APP_VERSION || 'dev',
    lang: window.navigator?.language || 'unknown',
    timezone,
    path: window.location?.pathname || '/',
  };
}

function isSafeAnalyticsEndpoint(endpoint) {
  if (!endpoint || typeof window === 'undefined') return false;
  try {
    const resolved = new URL(endpoint, window.location.origin);
    if (!['https:', 'http:'].includes(resolved.protocol)) return false;
    if (resolved.origin !== window.location.origin && resolved.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
}

async function dispatchToOptionalEndpoint(event) {
  if (typeof window === 'undefined') return false;
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  if (!isSafeAnalyticsEndpoint(endpoint)) return false;

  const payload = JSON.stringify(event);
  if (window.navigator?.sendBeacon && document.visibilityState === 'hidden') {
    try {
      const ok = window.navigator.sendBeacon(
        endpoint,
        new Blob([payload], { type: 'application/json' })
      );
      if (ok) return true;
    } catch {
      // ignore and continue to fetch fallback
    }
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId = null;
  if (controller) {
    timeoutId = window.setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      signal: controller?.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

function dispatchToPlausible(eventName, payload) {
  if (typeof window === 'undefined') return;
  if (typeof window.plausible !== 'function') return;
  try {
    window.plausible(eventName, { props: payload });
  } catch {
    // non-blocking analytics failures
  }
}

export function trackEvent(eventName, payload = {}) {
  if (typeof window === 'undefined') return;
  const name = sanitizeEventName(eventName);
  if (!name) return;

  const session = getSessionMeta();
  const safePayload = sanitizePayload(payload);
  const clientMeta = getClientMeta();
  const event = {
    event_id: randomId('evt'),
    schema_version: ANALYTICS_SCHEMA_VERSION,
    name,
    ts: new Date().toISOString(),
    session_id: session.id,
    session_seq: session.seq,
    session_started_at: session.started_at,
    payload: safePayload,
    meta: clientMeta,
  };

  const queue = getQueue();
  queue.push(event);
  setQueue(queue);

  dispatchToPlausible(name, {
    ...safePayload,
    schema_version: ANALYTICS_SCHEMA_VERSION,
    session_seq: session.seq,
  });
  void dispatchToOptionalEndpoint(event);
}

export function readTrackedEvents(limit = 100) {
  return getQueue().slice(-(Number(limit) || 100));
}

export function clearTrackedEvents() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ANALYTICS_QUEUE_KEY);
  } catch {
    // ignore storage failures
  }
}
