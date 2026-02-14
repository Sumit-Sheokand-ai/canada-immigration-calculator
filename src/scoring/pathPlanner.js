import { latestDraws } from '../data/crsData.js';
import { getMinCLB, hasAccompanyingSpouse, recalcWith } from './scoring.js';

const EDUCATION_ORDER = [
  'less_than_secondary',
  'secondary',
  'one_year_post',
  'two_year_post',
  'bachelors',
  'two_or_more',
  'masters',
  'doctoral',
];

const DIFFICULTY_WEIGHT = { Easy: 14, Medium: 7, Hard: 0 };
const LIKELIHOOD_PERCENT = { high: 78, medium: 58, low: 35 };

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getDefaultTargetScore(currentScore) {
  return Math.max(latestDraws.averageCutoff + 10, currentScore + 25);
}

function getIELTSBandForCLB(skill, clb) {
  const map = {
    listening: { 7: 6.0, 8: 7.5, 9: 8.0, 10: 8.5 },
    reading: { 7: 6.0, 8: 6.5, 9: 7.0, 10: 8.0 },
    writing: { 7: 6.0, 8: 6.5, 9: 7.0, 10: 7.5 },
    speaking: { 7: 6.0, 8: 6.5, 9: 7.0, 10: 7.5 },
  };
  return map[skill]?.[clb] || 0;
}

function getEnglishBoostOverrides(answers, targetClb) {
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  if (answers.langTestType === 'celpip') {
    const overrides = {};
    for (const skill of skills) {
      const key = `celpip_${skill}`;
      overrides[key] = String(Math.max(parseInt(answers[key], 10) || 0, targetClb));
    }
    return overrides;
  }

  if (answers.langTestType === 'ielts') {
    const overrides = {};
    for (const skill of skills) {
      const key = `ielts_${skill}`;
      const targetBand = getIELTSBandForCLB(skill, targetClb);
      overrides[key] = String(Math.max(parseFloat(answers[key]) || 0, targetBand));
    }
    return overrides;
  }

  return {
    langTestType: 'celpip',
    celpip_listening: String(targetClb),
    celpip_reading: String(targetClb),
    celpip_writing: String(targetClb),
    celpip_speaking: String(targetClb),
  };
}

function getFrenchOverrides(answers, targetNclc = 7) {
  const current = {
    listening: parseInt(answers.french_listening, 10) || 0,
    reading: parseInt(answers.french_reading, 10) || 0,
    writing: parseInt(answers.french_writing, 10) || 0,
    speaking: parseInt(answers.french_speaking, 10) || 0,
  };
  return {
    hasFrench: 'yes',
    frenchTestType: 'clb',
    french_listening: String(Math.max(current.listening, targetNclc)),
    french_reading: String(Math.max(current.reading, targetNclc)),
    french_writing: String(Math.max(current.writing, targetNclc)),
    french_speaking: String(Math.max(current.speaking, targetNclc)),
  };
}

function buildMilestones({ pathId, gain, months, steps }) {
  return steps.map((step, i) => ({
    id: `${pathId}-m${i + 1}`,
    title: step.title,
    details: step.details,
    etaWeeks: step.etaWeeks,
    expectedGain: i === steps.length - 1
      ? Math.max(gain - steps.slice(0, -1).reduce((s, x) => s + x.expectedGain, 0), 0)
      : step.expectedGain,
    done: false,
    monthHint: clamp(Math.ceil((step.etaWeeks || 1) / 4), 1, months),
  }));
}

function computeFitScore({ gain, months, difficulty, goalReached, likelihood }) {
  const speedScore = clamp(24 - months * 2, 0, 24);
  const gainScore = clamp(Math.round(gain / 4), 0, 80);
  const goalScore = goalReached ? 32 : 0;
  const likelihoodScore = Math.round((LIKELIHOOD_PERCENT[likelihood] || 0) / 3);
  return gainScore + speedScore + goalScore + likelihoodScore + (DIFFICULTY_WEIGHT[difficulty] || 0);
}

function createPath({
  id,
  title,
  summary,
  category,
  difficulty,
  months,
  estimatedCostCad,
  whyItFits,
  likelihood = 'medium',
  overrides,
  currentScore,
  targetScore,
  milestoneSteps,
}) {
  const projected = recalcWith(overrides.baseAnswers, overrides.patch);
  const gain = projected.total - currentScore;
  if (gain <= 0) return null;
  const goalReached = projected.total >= targetScore;
  const milestones = buildMilestones({
    pathId: id,
    gain,
    months,
    steps: milestoneSteps,
  });

  return {
    id,
    title,
    summary,
    category,
    difficulty,
    estimatedMonths: months,
    estimatedCostCad,
    projectedScore: projected.total,
    potentialGain: gain,
    goalReached,
    whyItFits,
    likelihood,
    likelihoodPercent: LIKELIHOOD_PERCENT[likelihood] || 50,
    fitScore: computeFitScore({ gain, months, difficulty, goalReached, likelihood }),
    milestones,
    checks: {
      targetScore,
      currentScore,
      stillNeededAfterPath: Math.max(targetScore - projected.total, 0),
    },
  };
}

function makeEnglishPath(answers, currentScore, targetScore) {
  const minClb = getMinCLB(answers);
  if (minClb >= 10) return null;
  const targetClb = minClb < 7 ? 8 : 9;
  return createPath({
    id: 'english-accelerator',
    title: 'English Accelerator Path',
    summary: 'Raise your weakest English ability first, then target CLB 9+ for transferability gains.',
    category: 'Language',
    difficulty: 'Medium',
    months: 4,
    estimatedCostCad: 460,
    whyItFits: `Your current minimum English level is CLB ${minClb}, so language gains are one of the fastest realistic boosters.`,
    likelihood: 'high',
    overrides: {
      baseAnswers: answers,
      patch: getEnglishBoostOverrides(answers, targetClb),
    },
    currentScore,
    targetScore,
    milestoneSteps: [
      { title: 'Baseline audit and weak-skill diagnosis', details: 'Run a mock test and identify the lowest 2 abilities to prioritize.', etaWeeks: 1, expectedGain: 0 },
      { title: 'Targeted study sprint', details: 'Follow a 5-day weekly schedule focused on weakest modules and timed drills.', etaWeeks: 6, expectedGain: 8 },
      { title: 'Exam booking + strategy correction', details: 'Book IELTS/CELPIP and fine-tune pacing, vocabulary, and response format.', etaWeeks: 4, expectedGain: 8 },
      { title: 'Retake and profile refresh', details: 'Update final language scores in your profile and reassess draw competitiveness.', etaWeeks: 4, expectedGain: 12 },
    ],
  });
}

function makeFrenchPath(answers, currentScore, targetScore) {
  return createPath({
    id: 'french-advantage',
    title: 'French Advantage Path',
    summary: 'Reach NCLC 7 in all French abilities to unlock additional points and French-category draw access.',
    category: 'Language',
    difficulty: 'Hard',
    months: 8,
    estimatedCostCad: 690,
    whyItFits: 'French pathways remain one of the highest-yield options for many candidates below general cutoffs.',
    likelihood: answers.hasFrench === 'yes' ? 'high' : 'medium',
    overrides: {
      baseAnswers: answers,
      patch: getFrenchOverrides(answers, 7),
    },
    currentScore,
    targetScore,
    milestoneSteps: [
      { title: 'French baseline + study plan', details: 'Assess current level and choose a structured curriculum for NCLC 7 goal.', etaWeeks: 2, expectedGain: 0 },
      { title: 'Core skill build phase', details: 'Intensive reading/listening practice with weekly speaking/writing correction.', etaWeeks: 12, expectedGain: 8 },
      { title: 'TEF/TCF prep and mock cycles', details: 'Complete timed mocks and focus weak modules before exam booking.', etaWeeks: 8, expectedGain: 8 },
      { title: 'Exam and score integration', details: 'Enter verified NCLC scores and evaluate French-category competitiveness.', etaWeeks: 6, expectedGain: 12 },
    ],
  });
}

function makeCanadianWorkPath(answers, currentScore, targetScore) {
  const cwe = parseInt(answers.canadianWorkExp, 10) || 0;
  if (cwe >= 5) return null;
  return createPath({
    id: 'canadian-work-ladder',
    title: 'Canadian Work Ladder Path',
    summary: 'Add one more year of Canadian skilled work to increase core and transferability points.',
    category: 'Work Experience',
    difficulty: 'Hard',
    months: 12,
    estimatedCostCad: 0,
    whyItFits: `You currently report ${cwe} year(s) of Canadian work; the next year can materially lift your score.`,
    likelihood: 'medium',
    overrides: {
      baseAnswers: answers,
      patch: { canadianWorkExp: String(cwe + 1) },
    },
    currentScore,
    targetScore,
    milestoneSteps: [
      { title: 'Employer alignment', details: 'Confirm TEER eligibility and maintain full-time skilled role continuity.', etaWeeks: 2, expectedGain: 0 },
      { title: 'Documentation discipline', details: 'Collect monthly pay records and letters for future proof of experience.', etaWeeks: 16, expectedGain: 4 },
      { title: 'Mid-year score checkpoint', details: 'Recalculate progress and combine with language upgrades if needed.', etaWeeks: 24, expectedGain: 6 },
      { title: 'Complete one full year increment', details: 'Update profile immediately when additional year is met.', etaWeeks: 52, expectedGain: 12 },
    ],
  });
}

function makeEducationPath(answers, currentScore, targetScore) {
  const idx = EDUCATION_ORDER.indexOf(answers.education);
  if (idx < 0 || idx >= EDUCATION_ORDER.length - 1) return null;
  const nextEducation = EDUCATION_ORDER[idx + 1];
  return createPath({
    id: 'education-upgrade',
    title: 'Education Upgrade Path',
    summary: 'Move to the next recognized credential tier for predictable CRS uplift.',
    category: 'Education',
    difficulty: 'Hard',
    months: 18,
    estimatedCostCad: 12000,
    whyItFits: `Your current education level can be improved to ${nextEducation.replace(/_/g, ' ')} for additional points.`,
    likelihood: 'medium',
    overrides: {
      baseAnswers: answers,
      patch: { education: nextEducation },
    },
    currentScore,
    targetScore,
    milestoneSteps: [
      { title: 'Program selection', details: 'Choose an accredited credential path aligned to CRS point tiers.', etaWeeks: 4, expectedGain: 0 },
      { title: 'Enrollment and milestone completion', details: 'Track term-level progress to keep the plan on schedule.', etaWeeks: 20, expectedGain: 4 },
      { title: 'Credential completion prep', details: 'Prepare final documents and ECA requirements where needed.', etaWeeks: 20, expectedGain: 4 },
      { title: 'Credential update in profile', details: 'Add completed credential and recalculate total score immediately.', etaWeeks: 28, expectedGain: 10 },
    ],
  });
}

function makeSpousePath(answers, currentScore, targetScore) {
  if (!hasAccompanyingSpouse(answers)) return null;
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  const patch = {};
  for (const s of skills) {
    const key = `spouseLang_${s}`;
    patch[key] = String(Math.max(parseInt(answers[key], 10) || 0, 9));
  }
  return createPath({
    id: 'spouse-optimization',
    title: 'Spouse Optimization Path',
    summary: 'Use spouse language and experience factors for faster low-cost point improvements.',
    category: 'Family Factors',
    difficulty: 'Medium',
    months: 5,
    estimatedCostCad: 420,
    whyItFits: 'You have an accompanying spouse, so spouse-factor optimization is available and often underused.',
    likelihood: 'high',
    overrides: {
      baseAnswers: answers,
      patch,
    },
    currentScore,
    targetScore,
    milestoneSteps: [
      { title: 'Spouse baseline review', details: 'Identify spouse factors currently missing points.', etaWeeks: 1, expectedGain: 0 },
      { title: 'Spouse language prep', details: 'Prepare specifically for CLB 9 in the weakest spouse abilities.', etaWeeks: 8, expectedGain: 4 },
      { title: 'Spouse profile integration', details: 'Update spouse test scores and re-optimize joint profile configuration.', etaWeeks: 6, expectedGain: 8 },
    ],
  });
}

function makePnpPath(answers, currentScore, targetScore) {
  if (answers.hasPNP === 'yes') return null;
  return createPath({
    id: 'pnp-fast-track',
    title: 'PNP Fast-Track Path',
    summary: 'Pursue provincial nomination for the largest single CRS jump (+600).',
    category: 'Provincial',
    difficulty: 'Hard',
    months: 6,
    estimatedCostCad: 2200,
    whyItFits: 'If your baseline is below recent cutoffs, PNP remains the most direct guaranteed-lift route.',
    likelihood: 'medium',
    overrides: {
      baseAnswers: answers,
      patch: { hasPNP: 'yes' },
    },
    currentScore,
    targetScore,
    milestoneSteps: [
      { title: 'Province shortlist', details: 'Match your profile to provinces aligned with occupation/language strengths.', etaWeeks: 2, expectedGain: 0 },
      { title: 'Document stack preparation', details: 'Prepare references, test proofs, ECA, and provincial forms early.', etaWeeks: 6, expectedGain: 0 },
      { title: 'Submit nomination stream', details: 'Apply to selected stream and monitor NOI/application updates.', etaWeeks: 8, expectedGain: 0 },
      { title: 'Nomination linked to profile', details: 'Accept nomination and refresh profile for major score jump.', etaWeeks: 8, expectedGain: 600 },
    ],
  });
}

function makeComboPath(basePaths, targetScore) {
  const sorted = [...basePaths].sort((a, b) => b.fitScore - a.fitScore);
  if (sorted.length < 2) return null;
  const [a, b] = sorted;
  const projectedScore = Math.min(a.projectedScore + b.potentialGain, 1200);
  const potentialGain = projectedScore - a.checks.currentScore;
  if (potentialGain <= 0) return null;
  const goalReached = projectedScore >= targetScore;
  return {
    id: 'combo-bridge-plan',
    title: 'Bridge Combination Path',
    summary: `Combine “${a.title}” + “${b.title}” to maximize speed while limiting risk.`,
    category: 'Combination',
    difficulty: a.difficulty === 'Hard' || b.difficulty === 'Hard' ? 'Hard' : 'Medium',
    estimatedMonths: Math.round((a.estimatedMonths + b.estimatedMonths) / 2),
    estimatedCostCad: a.estimatedCostCad + b.estimatedCostCad,
    projectedScore,
    potentialGain,
    goalReached,
    whyItFits: 'A blended route often reaches target faster than single-track attempts.',
    likelihood: 'medium',
    likelihoodPercent: 62,
    fitScore: computeFitScore({
      gain: potentialGain,
      months: Math.round((a.estimatedMonths + b.estimatedMonths) / 2),
      difficulty: a.difficulty === 'Hard' || b.difficulty === 'Hard' ? 'Hard' : 'Medium',
      goalReached,
      likelihood: 'medium',
    }),
    milestones: [
      ...a.milestones.slice(0, 2).map(m => ({ ...m, id: `combo-${m.id}` })),
      ...b.milestones.slice(0, 2).map(m => ({ ...m, id: `combo-${m.id}` })),
      {
        id: 'combo-final-sync',
        title: 'Final score synchronization',
        details: 'Update all achieved improvements together and reassess draw strategy.',
        etaWeeks: 4,
        expectedGain: Math.max(potentialGain - 16, 0),
        done: false,
        monthHint: 2,
      },
    ],
    checks: {
      targetScore,
      currentScore: a.checks.currentScore,
      stillNeededAfterPath: Math.max(targetScore - projectedScore, 0),
    },
  };
}

export function buildPathPlans(answers, result, options = {}) {
  const currentScore = result?.total || 0;
  const targetScore = Number(options.targetScore) || getDefaultTargetScore(currentScore);

  const candidates = [
    makeEnglishPath(answers, currentScore, targetScore),
    makeFrenchPath(answers, currentScore, targetScore),
    makeCanadianWorkPath(answers, currentScore, targetScore),
    makeEducationPath(answers, currentScore, targetScore),
    makeSpousePath(answers, currentScore, targetScore),
    makePnpPath(answers, currentScore, targetScore),
  ].filter(Boolean);

  const combo = makeComboPath(candidates, targetScore);
  if (combo) candidates.push(combo);

  const ranked = candidates
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 5);

  return {
    currentScore,
    targetScore,
    plans: ranked,
    generatedAt: new Date().toISOString(),
  };
}
