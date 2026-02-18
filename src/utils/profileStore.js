import { calculate } from '../scoring/scoring.js';
const SAVED_PROFILES_KEY = 'crs-saved-profiles-v1';

function readProfilesMap() {
  try {
    const raw = localStorage.getItem(SAVED_PROFILES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeProfilesMap(map) {
  try {
    localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(map));
  } catch {
    // no-op
  }
}

export function encodeShareAnswers(answers) {
  try {
    return btoa(encodeURIComponent(JSON.stringify(answers || {})));
  } catch {
    return '';
  }
}

export function decodeShareAnswers(hash = window.location.hash) {
  try {
    const value = (hash || '').replace(/^#/, '');
    if (!value) return null;
    return JSON.parse(decodeURIComponent(atob(value)));
  } catch {
    return null;
  }
}

export function getProfileIdFromQuery(search = window.location.search) {
  try {
    const params = new URLSearchParams(search || '');
    return params.get('profile');
  } catch {
    return null;
  }
}

export function makeProfileId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `prf_${Date.now().toString(36)}_${rand}`;
}

export function makeAlertToken() {
  return `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

export function listSavedProfiles() {
  const map = readProfilesMap();
  return Object.values(map).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getSavedProfileById(id) {
  if (!id) return null;
  const map = readProfilesMap();
  return map[id] || null;
}

export function saveProfileLocal({ id, name = '', answers = {}, score = 0, email = '', alertOptIn = false, alertToken = null }) {
  const map = readProfilesMap();
  const profileId = id || makeProfileId();
  const now = new Date().toISOString();
  const existing = map[profileId];
  const next = {
    id: profileId,
    name: name || existing?.name || `Profile ${profileId.slice(-4)}`,
    answers,
    score,
    email,
    alertOptIn: !!alertOptIn,
    alertToken: alertOptIn ? (alertToken || existing?.alertToken || makeAlertToken()) : null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  map[profileId] = next;
  writeProfilesMap(map);
  return next;
}

export function recalculateSavedProfilesForPolicy({ reason = 'autopilot', force = false } = {}) {
  const map = readProfilesMap();
  const entries = Object.entries(map || {});
  if (!entries.length) {
    return {
      status: 'noop',
      reason,
      scanned: 0,
      updated: 0,
      skipped: 0,
      policyVersion: '',
    };
  }

  let updated = 0;
  let skipped = 0;
  let latestPolicyVersion = '';
  const recalculatedAt = new Date().toISOString();

  for (const [profileId, profile] of entries) {
    const profileAnswers = profile?.answers;
    if (!profileAnswers || typeof profileAnswers !== 'object') {
      skipped += 1;
      continue;
    }
    const recalculated = calculate(profileAnswers);
    const nextScore = Number(recalculated?.total || 0);
    const nextPolicyVersion = String(recalculated?.policy?.version || '');
    latestPolicyVersion = nextPolicyVersion || latestPolicyVersion;

    const currentScore = Number(profile?.score || 0);
    const currentPolicyVersion = String(profile?.policyVersion || '');
    const needsUpdate = !!force || currentScore !== nextScore || currentPolicyVersion !== nextPolicyVersion;
    if (!needsUpdate) continue;

    map[profileId] = {
      ...profile,
      score: nextScore,
      policyVersion: nextPolicyVersion,
      policyEffectiveDate: recalculated?.policy?.effectiveDate || '',
      policySource: recalculated?.policy?.source || '',
      policyRecalculatedAt: recalculatedAt,
    };
    updated += 1;
  }

  if (updated > 0) {
    writeProfilesMap(map);
  }
  return {
    status: updated > 0 ? 'updated' : 'noop',
    reason,
    scanned: entries.length,
    updated,
    skipped,
    policyVersion: latestPolicyVersion,
    recalculatedAt,
  };
}

export function buildProfileShareUrl(profileId, answers) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const hash = encodeShareAnswers(answers);
  const profilePart = profileId ? `?profile=${encodeURIComponent(profileId)}` : '';
  const hashPart = hash ? `#${hash}` : '';
  return `${base}${profilePart}${hashPart}`;
}
