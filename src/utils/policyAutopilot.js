import { getPolicyRuleSetRegistryMeta, resolvePolicyRuleSet } from '../scoring/policy';
import { recalculateSavedProfilesForPolicy } from './profileStore';

const POLICY_AUTOPILOT_STATE_KEY = 'crs-policy-autopilot-state-v1';

function readStorageJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorageJson(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

export function readPolicyAutopilotState() {
  return readStorageJson(POLICY_AUTOPILOT_STATE_KEY, {
    activePolicyId: '',
    policySource: '',
    registryVersion: '',
    lastRunAt: '',
    lastChangeAt: '',
    lastRecalculation: null,
  });
}

function dispatchAutopilotEvent(detail) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('crs-policy-autopilot-synced', { detail }));
  } catch {
    // ignore dispatch failures
  }
}

export function runPolicyAutopilotSync({ reason = 'app_startup', force = false } = {}) {
  const activePolicy = resolvePolicyRuleSet();
  const registryMeta = getPolicyRuleSetRegistryMeta();
  const previous = readPolicyAutopilotState();
  const hasPolicyDrift = previous.activePolicyId !== activePolicy.id || previous.policySource !== activePolicy.source;
  const hasRegistryDrift = previous.registryVersion !== registryMeta.version;
  const shouldRecalculate = !!force || hasPolicyDrift || hasRegistryDrift;

  if (!shouldRecalculate) {
    return {
      status: 'noop',
      reason,
      activePolicyId: activePolicy.id,
      policySource: activePolicy.source,
      registryVersion: registryMeta.version,
      recalculation: null,
      changed: false,
    };
  }

  const recalculation = recalculateSavedProfilesForPolicy({
    reason: `policy_autopilot:${reason}`,
    force: !!force || hasPolicyDrift || hasRegistryDrift,
  });
  const nowIso = new Date().toISOString();
  const nextState = {
    activePolicyId: activePolicy.id,
    policySource: activePolicy.source,
    registryVersion: registryMeta.version,
    lastRunAt: nowIso,
    lastChangeAt: hasPolicyDrift || hasRegistryDrift ? nowIso : previous.lastChangeAt || nowIso,
    lastRecalculation: recalculation,
  };
  writeStorageJson(POLICY_AUTOPILOT_STATE_KEY, nextState);

  const summary = {
    status: 'updated',
    reason,
    activePolicyId: activePolicy.id,
    policySource: activePolicy.source,
    registryVersion: registryMeta.version,
    recalculation,
    changed: hasPolicyDrift || hasRegistryDrift,
  };
  dispatchAutopilotEvent(summary);
  return summary;
}

