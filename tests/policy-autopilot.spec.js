import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPolicyAutopilotSync, readPolicyAutopilotState } from '../src/utils/policyAutopilot';
import { getSavedProfileById, saveProfileLocal } from '../src/utils/profileStore';

const SAVED_PROFILES_KEY = 'crs-saved-profiles-v1';
const POLICY_AUTOPILOT_STATE_KEY = 'crs-policy-autopilot-state-v1';
const POLICY_RULESET_OVERRIDE_KEY = 'crs-policy-ruleset-override-v1';

function createStorageMock() {
  const map = new Map();
  return {
    getItem(key) {
      const normalized = String(key);
      return map.has(normalized) ? map.get(normalized) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
  };
}

function createWindowMock(localStorage) {
  const listeners = new Map();
  return {
    localStorage,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent(event) {
      const handlers = listeners.get(event?.type);
      if (!handlers) return true;
      handlers.forEach((handler) => handler(event));
      return true;
    },
  };
}

function sampleAnswers() {
  return {
    pathway: 'fsw',
    firstOfficialLanguage: 'english',
    age: '30',
    education: 'bachelors',
    langTestType: 'celpip',
    celpip_listening: '9',
    celpip_reading: '9',
    celpip_writing: '9',
    celpip_speaking: '9',
    hasFrench: 'no',
    canadianWorkExp: '1',
    foreignWorkExp: '2',
    hasSpouse: 'no',
    hasPNP: 'no',
    hasJobOffer: 'no',
    canadianEducation: 'no',
    hasSibling: 'no',
  };
}

let previousWindow;
let previousLocalStorage;
let previousEvent;
let previousCustomEvent;

beforeEach(() => {
  previousWindow = globalThis.window;
  previousLocalStorage = globalThis.localStorage;
  previousEvent = globalThis.Event;
  previousCustomEvent = globalThis.CustomEvent;

  const localStorage = createStorageMock();
  globalThis.window = createWindowMock(localStorage);
  globalThis.localStorage = localStorage;

  if (typeof globalThis.Event !== 'function') {
    globalThis.Event = class Event {
      constructor(type) {
        this.type = type;
      }
    };
  }
  if (typeof globalThis.CustomEvent !== 'function') {
    globalThis.CustomEvent = class CustomEvent extends globalThis.Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init.detail;
      }
    };
  }
});

afterEach(() => {
  if (typeof previousWindow === 'undefined') delete globalThis.window;
  else globalThis.window = previousWindow;

  if (typeof previousLocalStorage === 'undefined') delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;

  if (typeof previousEvent === 'undefined') delete globalThis.Event;
  else globalThis.Event = previousEvent;

  if (typeof previousCustomEvent === 'undefined') delete globalThis.CustomEvent;
  else globalThis.CustomEvent = previousCustomEvent;
});

describe('policy autopilot', () => {
  it('recalculates saved profiles and persists autopilot state on first sync', () => {
    const profile = saveProfileLocal({
      id: 'profile-one',
      name: 'Profile One',
      answers: sampleAnswers(),
      score: 1,
    });
    expect(profile.id).toBe('profile-one');

    const summary = runPolicyAutopilotSync({ reason: 'test_boot' });
    expect(summary.status).toBe('updated');
    expect(summary.recalculation?.scanned).toBe(1);
    expect(summary.recalculation?.updated).toBe(1);
    expect(summary.activePolicyId).toBeTypeOf('string');
    expect(summary.registryVersion).toBeTypeOf('string');

    const saved = getSavedProfileById('profile-one');
    expect(saved.score).not.toBe(1);
    expect(saved.policyVersion).toBe(summary.activePolicyId);
    expect(saved.policyRecalculatedAt).toBeTypeOf('string');

    const state = readPolicyAutopilotState();
    expect(state.activePolicyId).toBe(summary.activePolicyId);
    expect(state.registryVersion).toBe(summary.registryVersion);
    expect(state.lastRunAt).toBeTypeOf('string');
    expect(state.lastRecalculation?.updated).toBe(1);
  });

  it('returns noop when active policy and registry are unchanged', () => {
    saveProfileLocal({
      id: 'profile-two',
      name: 'Profile Two',
      answers: sampleAnswers(),
      score: 300,
    });
    const first = runPolicyAutopilotSync({ reason: 'first_pass' });
    expect(first.status).toBe('updated');

    const second = runPolicyAutopilotSync({ reason: 'second_pass' });
    expect(second.status).toBe('noop');
    expect(second.changed).toBe(false);
    expect(second.recalculation).toBeNull();
  });

  it('emits a synced event with recalculation details', () => {
    saveProfileLocal({
      id: 'profile-three',
      name: 'Profile Three',
      answers: sampleAnswers(),
      score: 0,
    });

    let eventDetail = null;
    window.addEventListener('crs-policy-autopilot-synced', (event) => {
      eventDetail = event?.detail || null;
    });

    const summary = runPolicyAutopilotSync({ reason: 'event_check', force: true });
    expect(summary.status).toBe('updated');
    expect(eventDetail).toBeTruthy();
    expect(eventDetail.reason).toBe('event_check');
    expect(eventDetail.activePolicyId).toBe(summary.activePolicyId);
    expect(Number(eventDetail.recalculation?.updated || 0)).toBeGreaterThanOrEqual(0);
  });

  it('uses only expected local storage keys for policy autopilot workflow', () => {
    saveProfileLocal({
      id: 'profile-four',
      name: 'Profile Four',
      answers: sampleAnswers(),
      score: 100,
    });
    runPolicyAutopilotSync({ reason: 'storage_keys', force: true });

    expect(window.localStorage.getItem(SAVED_PROFILES_KEY)).toBeTypeOf('string');
    expect(window.localStorage.getItem(POLICY_AUTOPILOT_STATE_KEY)).toBeTypeOf('string');
    expect(window.localStorage.getItem(POLICY_RULESET_OVERRIDE_KEY)).toBeNull();
  });
});
