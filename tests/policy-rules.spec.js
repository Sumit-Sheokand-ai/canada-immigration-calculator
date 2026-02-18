import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getAvailablePolicyRuleSets,
  getCRSPolicy,
  getPolicyRuleSetRegistryMeta,
  normalizePolicyRuleSetId,
  readPolicyRuleSetOverride,
  resolvePolicyRuleSet,
  savePolicyRuleSetOverride,
} from '../src/scoring/policy';

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

describe('scoring policy rulesets', () => {
  it('exposes versioned rulesets with effective dates', () => {
    const ruleSets = getAvailablePolicyRuleSets();
    expect(Array.isArray(ruleSets)).toBe(true);
    expect(ruleSets.length).toBeGreaterThan(1);
    expect(ruleSets.every((ruleSet) => ruleSet.id && ruleSet.effectiveDate)).toBe(true);
  });

  it('resolves pre-2025 policy with arranged-employment points', () => {
    const resolved = resolvePolicyRuleSet({ asOfDate: '2024-06-01', ignoreOverride: true });
    const policy = getCRSPolicy({ asOfDate: '2024-06-01', ignoreOverride: true });
    expect(resolved.id).toBe('ircc-2024-01-01-v1');
    expect(policy.tables.additionalPointsTable.job_offer_00).toBe(200);
    expect(policy.tables.additionalPointsTable.job_offer_other).toBe(50);
  });

  it('resolves post-2025 policy with arranged-employment points removed', () => {
    const resolved = resolvePolicyRuleSet({ asOfDate: '2026-01-01', ignoreOverride: true });
    const policy = getCRSPolicy({ asOfDate: '2026-01-01', ignoreOverride: true });
    expect(resolved.id).toBe('ircc-2025-03-25-v2');
    expect(policy.tables.additionalPointsTable.job_offer_00).toBe(0);
    expect(policy.tables.additionalPointsTable.job_offer_other).toBe(0);
  });

  it('normalizes aliases and reports registry metadata', () => {
    expect(normalizePolicyRuleSetId('ircc-2025-03-25-v1')).toBe('ircc-2025-03-25-v2');

    const meta = getPolicyRuleSetRegistryMeta();
    expect(meta.version).toBeTypeOf('string');
    expect(meta.latestRuleSetId).toBe('ircc-2025-03-25-v2');
    expect(meta.aliases['ircc-2025-03-25-v1']).toBe('ircc-2025-03-25-v2');
  });

  it('auto-migrates stored override aliases to canonical ruleset ids', () => {
    window.localStorage.setItem(POLICY_RULESET_OVERRIDE_KEY, 'ircc-2025-03-25-v1');
    expect(readPolicyRuleSetOverride()).toBe('ircc-2025-03-25-v2');
    expect(window.localStorage.getItem(POLICY_RULESET_OVERRIDE_KEY)).toBe('ircc-2025-03-25-v2');
  });

  it('normalizes override ids when persisting policy overrides', () => {
    expect(savePolicyRuleSetOverride('ircc-2025-03-25-v1')).toBe('ircc-2025-03-25-v2');
    expect(readPolicyRuleSetOverride()).toBe('ircc-2025-03-25-v2');
  });
});
