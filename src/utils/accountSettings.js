const ACCOUNT_SETTINGS_KEY = 'crs-account-settings-v1';

export const DEFAULT_ACCOUNT_SETTINGS = {
  profileName: '',
  contactEmail: '',
  defaultDrawAlerts: false,
  autoSyncProfiles: true,
  autoSaveProgress: true,
};

export function readAccountSettings() {
  try {
    const raw = localStorage.getItem(ACCOUNT_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_ACCOUNT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_ACCOUNT_SETTINGS };
    return { ...DEFAULT_ACCOUNT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_ACCOUNT_SETTINGS };
  }
}

export function saveAccountSettings(nextSettings) {
  const merged = { ...DEFAULT_ACCOUNT_SETTINGS, ...(nextSettings || {}) };
  try {
    localStorage.setItem(ACCOUNT_SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage errors
  }
  return merged;
}

