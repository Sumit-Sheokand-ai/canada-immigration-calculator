import { getCRSPolicy } from './policy.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const getPolicy = () => getCRSPolicy();

// Normalize French scores: convert TEF/TCF to NCLC if needed
function normalizeFrench(a, policy = getPolicy()) {
  const norm = { ...a };
  const frenchIsActive = getFirstOfficialLanguage(a) === 'french' || a.hasFrench === 'yes';
  if (frenchIsActive && a.frenchTestType === 'tef') {
    for (const s of ['listening', 'reading', 'writing', 'speaking']) {
      norm[`french_${s}`] = String(policy.converters.tefToNCLC(s, parseInt(a[`tef_${s}`], 10) || 0));
    }
  } else if (frenchIsActive && a.frenchTestType === 'tcf') {
    for (const s of ['listening', 'reading', 'writing', 'speaking']) {
      norm[`french_${s}`] = String(policy.converters.tcfToNCLC(s, parseInt(a[`tcf_${s}`], 10) || 0));
    }
  }
  return norm;
}

function getFirstOfficialLanguage(a) {
  return a.firstOfficialLanguage === 'french' ? 'french' : 'english';
}

function hasFrenchResults(a) {
  return getFirstOfficialLanguage(a) === 'french' || a.hasFrench === 'yes';
}

export function hasAccompanyingSpouse(a) {
  return a.hasSpouse === 'yes' && a.spouseIsCanadian !== 'yes' && a.spouseAccompanying !== 'no';
}

const col = (a) => (hasAccompanyingSpouse(a) ? 1 : 0);

export function getEnglishCLBForSkill(a, skill, policy = getPolicy()) {
  if (a.langTestType === 'celpip') {
    return clamp(parseInt(a[`celpip_${skill}`], 10) || 0, 0, 12);
  }
  const band = parseFloat(a[`ielts_${skill}`]) || 0;
  return policy.converters.ieltsToCLB(skill, band);
}

function getFrenchCLBForSkill(a, skill) {
  return clamp(parseInt(a[`french_${skill}`], 10) || 0, 0, 12);
}

export function getCLBForSkill(a, skill, policy = getPolicy()) {
  return getFirstOfficialLanguage(a) === 'french'
    ? getFrenchCLBForSkill(a, skill)
    : getEnglishCLBForSkill(a, skill, policy);
}

export function getMinCLB(a, policy = getPolicy()) {
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  let min = 99;
  for (const s of skills) {
    const clb = getCLBForSkill(a, s, policy);
    if (clb < min) min = clb;
  }
  return min === 99 ? 0 : min;
}

export function getMinEnglishCLB(a, policy = getPolicy()) {
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  let min = 99;
  for (const s of skills) {
    const clb = getEnglishCLBForSkill(a, s, policy);
    if (clb < min) min = clb;
  }
  return min === 99 ? 0 : min;
}

export function getMinFrenchCLB(a) {
  if (!hasFrenchResults(a)) return 0;
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  let min = 99;
  for (const s of skills) {
    const clb = getFrenchCLBForSkill(a, s);
    if (clb < min) min = clb;
  }
  return min === 99 ? 0 : min;
}

function langBracket(a, policy) {
  const min = getMinCLB(a, policy);
  if (min >= 9) return 2;
  if (min >= 7) return 1;
  return 0;
}

function cweBracket(a) {
  const y = parseInt(a.canadianWorkExp, 10) || 0;
  if (y >= 2) return 2;
  if (y >= 1) return 1;
  return 0;
}

function fweBracket(a) {
  const y = parseInt(a.foreignWorkExp, 10) || 0;
  if (y >= 3) return 2;
  if (y >= 1) return 1;
  return 0;
}

function calcAge(a, policy) {
  let age = parseInt(a.age, 10);
  if (Number.isNaN(age)) return 0;
  if (age < 18) age = 17;
  if (age > 47) age = 47;
  if (age > 44) age = 45;
  return policy.tables.agePoints[age]?.[col(a)] || 0;
}

function calcEducation(a, policy) {
  return policy.tables.educationPoints[a.education]?.[col(a)] || 0;
}

function calcFirstLanguage(a, policy) {
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  const c = col(a);
  return skills.reduce((sum, s) => {
    const clb = getCLBForSkill(a, s, policy);
    return sum + (policy.tables.firstLangPoints[clb]?.[c] || 0);
  }, 0);
}

function calcSecondLanguage(a, policy) {
  const firstOfficial = getFirstOfficialLanguage(a);
  const hasSecondOfficial = firstOfficial === 'french'
    ? (a.langTestType === 'ielts' || a.langTestType === 'celpip')
    : hasFrenchResults(a);
  if (!hasSecondOfficial) return 0;
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  const c = col(a);
  const total = skills.reduce((sum, s) => {
    const clb = firstOfficial === 'french'
      ? getEnglishCLBForSkill(a, s, policy)
      : getFrenchCLBForSkill(a, s);
    return sum + (policy.tables.secondLangPoints[clb]?.[c] || 0);
  }, 0);
  return Math.min(total, c === 0 ? policy.caps.secondLanguageNoSpouse : policy.caps.secondLanguageWithSpouse);
}

function calcCanadianWork(a, policy) {
  let y = parseInt(a.canadianWorkExp, 10) || 0;
  if (y > 5) y = 5;
  return policy.tables.canadianWorkPoints[y]?.[col(a)] || 0;
}

function calcSpouseFactors(a, policy) {
  if (!hasAccompanyingSpouse(a)) return 0;
  let total = 0;
  total += policy.tables.spouseEducationPoints[a.spouseEducation] || 0;
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  let langTotal = 0;
  for (const s of skills) {
    const clb = parseInt(a[`spouseLang_${s}`], 10) || 0;
    langTotal += policy.tables.spouseLangPoints[clb] || 0;
  }
  total += Math.min(langTotal, 20);
  let y = parseInt(a.spouseCanadianWork, 10) || 0;
  if (y > 5) y = 5;
  total += policy.tables.spouseWorkPoints[y] || 0;
  return Math.min(total, policy.caps.spouseTotal);
}

function calcSkillTransferability(a, policy) {
  const er = policy.tables.eduRank[a.education] || 0;
  const lb = langBracket(a, policy);
  const cb = cweBracket(a);
  const fb = fweBracket(a);
  const eduLang = policy.tables.eduLangTransfer[er]?.[lb] || 0;
  const eduCWE = policy.tables.eduCWETransfer[er]?.[cb] || 0;
  const eduCombo = Math.min(eduLang + eduCWE, 50);
  const fweLang = policy.tables.fweLangTransfer[fb]?.[lb] || 0;
  const fweCWE = policy.tables.fweCWETransfer[fb]?.[cb] || 0;
  const fweCombo = Math.min(fweLang + fweCWE, 50);
  let certPts = 0;
  if (a.pathway === 'fst' && a.hasCertificate === 'yes') {
    const min = getMinCLB(a, policy);
    certPts = policy.tables.certLangTransfer[min >= 7 ? 2 : min >= 5 ? 1 : 0];
  }
  return Math.min(eduCombo + fweCombo + certPts, policy.caps.skillTransferabilityTotal);
}

function calcAdditionalPoints(a, policy) {
  let total = 0;
  const AP = policy.tables.additionalPointsTable;
  if (a.hasPNP === 'yes') total += AP.pnp_nomination;
  if (a.hasJobOffer === 'yes') {
    total += a.jobOfferTeer === 'teer_0' ? AP.job_offer_00 : AP.job_offer_other;
  }
  if (a.canadianEducation === 'yes') {
    total += a.canadianEduType === 'long' ? AP.canadian_edu_long : AP.canadian_edu_short;
  }
  if (a.hasSibling === 'yes') total += AP.sibling_in_canada;
  if (hasFrenchResults(a)) {
    const minFr = getMinFrenchCLB(a);
    if (minFr >= 7) {
      total += getMinEnglishCLB(a, policy) >= 5 ? AP.french_strong_strong_english : AP.french_strong_weak_english;
    }
  }
  return Math.min(total, policy.caps.additionalPointsTotal);
}

export function calculate(rawAnswers) {
  const policy = getPolicy();
  const answers = normalizeFrench(rawAnswers, policy);
  const age = calcAge(answers, policy);
  const education = calcEducation(answers, policy);
  const firstLanguage = calcFirstLanguage(answers, policy);
  const secondLanguage = calcSecondLanguage(answers, policy);
  const canadianWork = calcCanadianWork(answers, policy);
  const foreignWork = parseInt(answers.foreignWorkExp, 10) || 0;
  const core = age + education + firstLanguage + secondLanguage + canadianWork;
  const spouse = calcSpouseFactors(answers, policy);
  const skill = calcSkillTransferability(answers, policy);
  const addl = calcAdditionalPoints(answers, policy);

  return {
    total: Math.min(core + spouse + skill + addl, policy.caps.crsTotal),
    breakdown: {
      coreHumanCapital: core,
      spouseFactors: spouse,
      skillTransferability: skill,
      additionalPoints: addl,
    },
    details: {
      age,
      education,
      firstLanguage,
      secondLanguage,
      canadianWork,
      foreignWork,
      spouseTotal: spouse,
      skillTotal: skill,
      additionalTotal: addl,
    },
    policy: {
      version: policy.version,
      effectiveDate: policy.effectiveDate,
      source: policy.source,
    },
  };
}

export function recalcWith(answers, overrides) {
  return calculate({ ...answers, ...overrides });
}
