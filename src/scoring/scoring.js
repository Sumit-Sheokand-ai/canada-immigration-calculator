import { crsPolicy } from './policy.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Normalize French scores: convert TEF/TCF to NCLC if needed
function normalizeFrench(a) {
  const norm = { ...a };
  const frenchIsActive = getFirstOfficialLanguage(a) === 'french' || a.hasFrench === 'yes';
  if (frenchIsActive && a.frenchTestType === 'tef') {
    for (const s of ['listening','reading','writing','speaking']) {
      norm[`french_${s}`] = String(crsPolicy.converters.tefToNCLC(s, parseInt(a[`tef_${s}`], 10) || 0));
    }
  } else if (frenchIsActive && a.frenchTestType === 'tcf') {
    for (const s of ['listening','reading','writing','speaking']) {
      norm[`french_${s}`] = String(crsPolicy.converters.tcfToNCLC(s, parseInt(a[`tcf_${s}`], 10) || 0));
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

const col = (a) => hasAccompanyingSpouse(a) ? 1 : 0;
export function getEnglishCLBForSkill(a, skill) {
  if (a.langTestType === 'celpip') {
    return clamp(parseInt(a[`celpip_${skill}`], 10) || 0, 0, 12);
  }
  const band = parseFloat(a[`ielts_${skill}`]) || 0;
  return crsPolicy.converters.ieltsToCLB(skill, band);
}

function getFrenchCLBForSkill(a, skill) {
  return clamp(parseInt(a[`french_${skill}`], 10) || 0, 0, 12);
}

export function getCLBForSkill(a, skill) {
  return getFirstOfficialLanguage(a) === 'french'
    ? getFrenchCLBForSkill(a, skill)
    : getEnglishCLBForSkill(a, skill);
}

export function getMinCLB(a) {
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  let min = 99;
  for (const s of skills) {
    const clb = getCLBForSkill(a, s);
    if (clb < min) min = clb;
  }
  return min === 99 ? 0 : min;
}

export function getMinEnglishCLB(a) {
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  let min = 99;
  for (const s of skills) {
    const clb = getEnglishCLBForSkill(a, s);
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

function langBracket(a) {
  const min = getMinCLB(a);
  if (min >= 9) return 2;
  if (min >= 7) return 1;
  return 0;
}

function cweBracket(a) {
  const y = parseInt(a.canadianWorkExp) || 0;
  if (y >= 2) return 2;
  if (y >= 1) return 1;
  return 0;
}

function fweBracket(a) {
  const y = parseInt(a.foreignWorkExp) || 0;
  if (y >= 3) return 2;
  if (y >= 1) return 1;
  return 0;
}

function calcAge(a) {
  let age = parseInt(a.age);
  if (isNaN(age)) return 0;
  if (age < 18) age = 17;
  if (age > 47) age = 47;
  if (age > 44) age = 45;
  return crsPolicy.tables.agePoints[age]?.[col(a)] || 0;
}

function calcEducation(a) {
  return crsPolicy.tables.educationPoints[a.education]?.[col(a)] || 0;
}

function calcFirstLanguage(a) {
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  const c = col(a);
  return skills.reduce((sum, s) => {
    const clb = getCLBForSkill(a, s);
    return sum + (crsPolicy.tables.firstLangPoints[clb]?.[c] || 0);
  }, 0);
}

function calcSecondLanguage(a) {
  const firstOfficial = getFirstOfficialLanguage(a);
  const hasSecondOfficial = firstOfficial === 'french'
    ? (a.langTestType === 'ielts' || a.langTestType === 'celpip')
    : hasFrenchResults(a);
  if (!hasSecondOfficial) return 0;
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  const c = col(a);
  const total = skills.reduce((sum, s) => {
    const clb = firstOfficial === 'french'
      ? getEnglishCLBForSkill(a, s)
      : getFrenchCLBForSkill(a, s);
    return sum + (crsPolicy.tables.secondLangPoints[clb]?.[c] || 0);
  }, 0);
  return Math.min(total, c === 0 ? crsPolicy.caps.secondLanguageNoSpouse : crsPolicy.caps.secondLanguageWithSpouse);
}

function calcCanadianWork(a) {
  let y = parseInt(a.canadianWorkExp) || 0;
  if (y > 5) y = 5;
  return crsPolicy.tables.canadianWorkPoints[y]?.[col(a)] || 0;
}

function calcSpouseFactors(a) {
  if (!hasAccompanyingSpouse(a)) return 0;
  let total = 0;
  total += crsPolicy.tables.spouseEducationPoints[a.spouseEducation] || 0;
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  let langTotal = 0;
  for (const s of skills) {
    const clb = parseInt(a[`spouseLang_${s}`]) || 0;
    langTotal += crsPolicy.tables.spouseLangPoints[clb] || 0;
  }
  total += Math.min(langTotal, 20);
  let y = parseInt(a.spouseCanadianWork) || 0;
  if (y > 5) y = 5;
  total += crsPolicy.tables.spouseWorkPoints[y] || 0;
  return Math.min(total, crsPolicy.caps.spouseTotal);
}

function calcSkillTransferability(a) {
  const er = crsPolicy.tables.eduRank[a.education] || 0;
  const lb = langBracket(a);
  const cb = cweBracket(a);
  const fb = fweBracket(a);
  const eduLang = crsPolicy.tables.eduLangTransfer[er]?.[lb] || 0;
  const eduCWE  = crsPolicy.tables.eduCWETransfer[er]?.[cb] || 0;
  const eduCombo = Math.min(eduLang + eduCWE, 50);
  const fweLang = crsPolicy.tables.fweLangTransfer[fb]?.[lb] || 0;
  const fweCWE  = crsPolicy.tables.fweCWETransfer[fb]?.[cb] || 0;
  const fweCombo = Math.min(fweLang + fweCWE, 50);
  let certPts = 0;
  if (a.pathway === 'fst' && a.hasCertificate === 'yes') {
    const min = getMinCLB(a);
    certPts = crsPolicy.tables.certLangTransfer[min >= 7 ? 2 : min >= 5 ? 1 : 0];
  }
  return Math.min(eduCombo + fweCombo + certPts, crsPolicy.caps.skillTransferabilityTotal);
}

function calcAdditionalPoints(a) {
  let total = 0;
  const AP = crsPolicy.tables.additionalPointsTable;
  if (a.hasPNP === 'yes') total += AP.pnp_nomination;
  if (a.canadianEducation === 'yes') {
    total += a.canadianEduType === 'long' ? AP.canadian_edu_long : AP.canadian_edu_short;
  }
  if (a.hasSibling === 'yes') total += AP.sibling_in_canada;
  if (hasFrenchResults(a)) {
    const minFr = getMinFrenchCLB(a);
    if (minFr >= 7) {
      total += getMinEnglishCLB(a) >= 5 ? AP.french_strong_strong_english : AP.french_strong_weak_english;
    }
  }
  return Math.min(total, crsPolicy.caps.additionalPointsTotal);
}

export function calculate(rawAnswers) {
  const answers = normalizeFrench(rawAnswers);
  const age = calcAge(answers);
  const education = calcEducation(answers);
  const firstLanguage = calcFirstLanguage(answers);
  const secondLanguage = calcSecondLanguage(answers);
  const canadianWork = calcCanadianWork(answers);
  const foreignWork = parseInt(answers.foreignWorkExp) || 0;
  const core = age + education + firstLanguage + secondLanguage + canadianWork;
  const spouse = calcSpouseFactors(answers);
  const skill = calcSkillTransferability(answers);
  const addl = calcAdditionalPoints(answers);
  return {
    total: Math.min(core + spouse + skill + addl, crsPolicy.caps.crsTotal),
    breakdown: { coreHumanCapital: core, spouseFactors: spouse, skillTransferability: skill, additionalPoints: addl },
    details: { age, education, firstLanguage, secondLanguage, canadianWork, foreignWork, spouseTotal: spouse, skillTotal: skill, additionalTotal: addl }
  };
}

export function recalcWith(answers, overrides) {
  return calculate({ ...answers, ...overrides });
}
