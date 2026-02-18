import * as D from '../data/crsData.js';
const POLICY_RULESET_OVERRIDE_KEY = 'crs-policy-ruleset-override-v1';
export const POLICY_RULESET_REGISTRY_VERSION = '2026-02-18-v1';
export const POLICY_RULESET_ALIASES = Object.freeze({
  'ircc-2025-03-25-v1': 'ircc-2025-03-25-v2',
});

function parseIsoDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const CRS_POLICY_RULESETS = [
  {
    id: 'ircc-2024-01-01-v1',
    label: 'Legacy arranged-employment points',
    effectiveDate: '2024-01-01',
    arrangedEmploymentPoints: true,
    notes: [
      'Legacy profile includes arranged-employment CRS additional points (NOC 00: +200, others: +50).',
      'PNP nomination remains +600 additional points.',
      'French additional points depend on both French and English thresholds.',
    ],
  },
  {
    id: 'ircc-2025-03-25-v2',
    label: 'Arranged-employment points removed',
    effectiveDate: '2025-03-25',
    arrangedEmploymentPoints: false,
    notes: [
      'Arranged-employment CRS additional points removed effective March 25, 2025.',
      'PNP nomination remains +600 additional points.',
      'French additional points depend on both French and English thresholds.',
    ],
  },
].sort((a, b) => {
  const aDate = parseIsoDate(a.effectiveDate)?.getTime() || 0;
  const bDate = parseIsoDate(b.effectiveDate)?.getTime() || 0;
  return aDate - bDate;
});

function getLatestPolicyRuleSet() {
  return CRS_POLICY_RULESETS[CRS_POLICY_RULESETS.length - 1];
}

function getPolicyRuleSetById(id) {
  const normalizedId = normalizePolicyRuleSetId(id);
  return CRS_POLICY_RULESETS.find((ruleSet) => ruleSet.id === normalizedId) || null;
}

export function normalizePolicyRuleSetId(ruleSetId) {
  const normalized = String(ruleSetId || '').trim();
  if (!normalized) return '';
  return POLICY_RULESET_ALIASES[normalized] || normalized;
}
export function getPolicyRuleSetRegistryMeta() {
  return {
    version: POLICY_RULESET_REGISTRY_VERSION,
    aliases: { ...POLICY_RULESET_ALIASES },
    latestRuleSetId: getLatestPolicyRuleSet()?.id || '',
  };
}

function readPolicyOverrideId() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(POLICY_RULESET_OVERRIDE_KEY);
    if (!raw) return null;
    const normalized = normalizePolicyRuleSetId(raw);
    const known = getPolicyRuleSetById(normalized)?.id || null;
    if (!known) return null;
    if (String(raw).trim() !== known) {
      window.localStorage.setItem(POLICY_RULESET_OVERRIDE_KEY, known);
    }
    return known;
  } catch {
    return null;
  }
}

export function getAvailablePolicyRuleSets() {
  return CRS_POLICY_RULESETS.map((ruleSet) => ({ ...ruleSet }));
}

export function readPolicyRuleSetOverride() {
  return readPolicyOverrideId();
}

export function savePolicyRuleSetOverride(ruleSetId) {
  if (typeof window === 'undefined') return null;
  const normalized = normalizePolicyRuleSetId(ruleSetId);
  const nextRuleSet = getPolicyRuleSetById(normalized);
  try {
    if (nextRuleSet) {
      window.localStorage.setItem(POLICY_RULESET_OVERRIDE_KEY, nextRuleSet.id);
    } else {
      window.localStorage.removeItem(POLICY_RULESET_OVERRIDE_KEY);
    }
    window.dispatchEvent(new Event('crs-policy-ruleset-updated'));
  } catch {
    // ignore storage/dispatch failures
  }
  return nextRuleSet?.id || null;
}

export function clearPolicyRuleSetOverride() {
  return savePolicyRuleSetOverride('');
}

function resolvePolicyRuleSetByDate(asOfDate = new Date()) {
  const asOf = parseIsoDate(asOfDate) || new Date();
  let active = CRS_POLICY_RULESETS[0];
  for (const ruleSet of CRS_POLICY_RULESETS) {
    const effective = parseIsoDate(ruleSet.effectiveDate);
    if (effective && effective.getTime() <= asOf.getTime()) {
      active = ruleSet;
    }
  }
  return active || getLatestPolicyRuleSet();
}

export function resolvePolicyRuleSet({ asOfDate = new Date(), ignoreOverride = false } = {}) {
  if (!ignoreOverride) {
    const overrideId = readPolicyOverrideId();
    if (overrideId) {
      const override = getPolicyRuleSetById(overrideId);
      if (override) return { ...override, source: 'override' };
    }
  }
  const byDate = resolvePolicyRuleSetByDate(asOfDate);
  return { ...byDate, source: 'effective_date' };
}

function buildAdditionalPointsTable(ruleSet) {
  const table = { ...D.additionalPointsTable };
  if (ruleSet?.arrangedEmploymentPoints) {
    table.job_offer_00 = 200;
    table.job_offer_other = 50;
  } else {
    table.job_offer_00 = 0;
    table.job_offer_other = 0;
  }
  return table;
}

export function getCRSPolicy({ asOfDate = new Date(), ignoreOverride = false } = {}) {
  const activeRuleSet = resolvePolicyRuleSet({ asOfDate, ignoreOverride });
  return {
    version: activeRuleSet.id,
    label: activeRuleSet.label,
    source: activeRuleSet.source,
    effectiveDate: activeRuleSet.effectiveDate,
    notes: activeRuleSet.notes,
    tables: {
      agePoints: D.agePoints,
      educationPoints: D.educationPoints,
      firstLangPoints: D.firstLangPoints,
      secondLangPoints: D.secondLangPoints,
      canadianWorkPoints: D.canadianWorkPoints,
      spouseEducationPoints: D.spouseEducationPoints,
      spouseLangPoints: D.spouseLangPoints,
      spouseWorkPoints: D.spouseWorkPoints,
      eduRank: D.eduRank,
      eduLangTransfer: D.eduLangTransfer,
      eduCWETransfer: D.eduCWETransfer,
      fweLangTransfer: D.fweLangTransfer,
      fweCWETransfer: D.fweCWETransfer,
      certLangTransfer: D.certLangTransfer,
      additionalPointsTable: buildAdditionalPointsTable(activeRuleSet),
    },
    converters: {
      ieltsToCLB: D.convertIELTStoCLB,
      tefToNCLC: D.convertTEFtoNCLC,
      tcfToNCLC: D.convertTCFtoNCLC,
    },
    caps: {
      secondLanguageNoSpouse: 24,
      secondLanguageWithSpouse: 22,
      spouseTotal: 40,
      skillTransferabilityTotal: 100,
      additionalPointsTotal: 600,
      crsTotal: 1200,
    },
  };
}

const latestRuleSet = getLatestPolicyRuleSet();
export const CRS_POLICY_VERSION = latestRuleSet.id;
export const CRS_POLICY_EFFECTIVE_DATE = latestRuleSet.effectiveDate;
export const crsPolicy = getCRSPolicy({ ignoreOverride: true });
