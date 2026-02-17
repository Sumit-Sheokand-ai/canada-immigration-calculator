const ANALYTICS_QUEUE_KEY = 'crs-analytics-queue-v1';
const MAX_QUEUE_ITEMS = 250;

function safeParse(json, fallback) {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

function getQueue() {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(ANALYTICS_QUEUE_KEY), []);
}

function setQueue(queue) {
  if (typeof window === 'undefined') return;
  const trimmed = Array.isArray(queue) ? queue.slice(-MAX_QUEUE_ITEMS) : [];
  try {
    window.localStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage quota issues
  }
}

function sanitizePayload(payload = {}) {
  const next = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      next[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      next[key] = value.slice(0, 20).map((item) => String(item));
      continue;
    }
    next[key] = String(value);
  }
  return next;
}

async function dispatchToOptionalEndpoint(event) {
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  if (!endpoint || typeof window === 'undefined') return;

  const payload = JSON.stringify(event);

  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
    if (ok) return;
  }

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    });
  } catch {
    // non-blocking analytics failures
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
  if (!eventName || typeof window === 'undefined') return;
  const safePayload = sanitizePayload(payload);
  const event = {
    name: String(eventName),
    payload: safePayload,
    ts: new Date().toISOString(),
    path: window.location.pathname,
  };
  const queue = getQueue();
  queue.push(event);
  setQueue(queue);
  dispatchToPlausible(event.name, safePayload);
  dispatchToOptionalEndpoint(event);
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
