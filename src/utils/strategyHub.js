import { buildPathPlans } from '../scoring/pathPlanner';

const ACTION_PLAN_STORAGE_KEY = 'crs-90-day-action-plan-v1';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWindow(daysFrom, daysTo) {
  return `Day ${daysFrom}-${daysTo}`;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hashAnswers(answers = {}) {
  const seed = [
    answers.age,
    answers.education,
    answers.pathway,
    answers.canadianWorkExp,
    answers.foreignWorkExp,
    answers.hasFrench,
    answers.hasPNP,
  ].join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function buildPathwayOption(path) {
  return {
    id: `path-${path.id}`,
    title: path.title,
    lane: path.category,
    reason: path.whyItFits,
    scoreGain: path.potentialGain,
    months: path.estimatedMonths,
    confidence: path.likelihoodPercent,
    effort: path.difficulty,
  };
}

function buildCategoryOption({ score, cutoff, eligibleCount }) {
  const gap = cutoff - score;
  const confidence = gap <= 0 ? 82 : gap <= 20 ? 64 : 38;
  return {
    id: 'lane-category-draws',
    title: 'Category Draw Positioning',
    lane: 'Category Draws',
    reason: eligibleCount > 0
      ? `You match ${eligibleCount} category stream(s). Improve targeted factors to close the category cutoff gap.`
      : 'You are not currently category-eligible; targeted profile adjustments can unlock lower-cutoff streams.',
    scoreGain: clamp(Math.round(Math.max(gap, 0) * 0.5), 0, 80),
    months: gap <= 0 ? 1 : gap <= 20 ? 4 : 8,
    confidence,
    effort: gap <= 0 ? 'Easy' : gap <= 20 ? 'Medium' : 'Hard',
  };
}

function buildProvinceOption(bestProvince) {
  if (!bestProvince) return null;
  return {
    id: `lane-province-${bestProvince.id}`,
    title: `${bestProvince.name} PNP Focus`,
    lane: 'Provincial',
    reason: `${bestProvince.name} has the highest profile match in your province analysis.`,
    scoreGain: bestProvince.matchScore >= 70 ? 600 : 300,
    months: bestProvince.matchScore >= 70 ? 6 : 9,
    confidence: clamp(bestProvince.matchScore, 35, 88),
    effort: bestProvince.matchScore >= 70 ? 'Medium' : 'Hard',
  };
}

function getPrimaryBottlenecks(breakdown = {}, resultTotal = 0) {
  const buckets = [
    { key: 'coreHumanCapital', label: 'Core profile factors', value: toNumber(breakdown.coreHumanCapital) },
    { key: 'skillTransferability', label: 'Transferability factors', value: toNumber(breakdown.skillTransferability) },
    { key: 'additionalPoints', label: 'Additional point factors', value: toNumber(breakdown.additionalPoints) },
    { key: 'spouseFactors', label: 'Spouse factors', value: toNumber(breakdown.spouseFactors) },
  ];
  return buckets
    .map((bucket) => ({
      ...bucket,
      headroom: clamp(100 - Math.round((bucket.value / Math.max(resultTotal, 1)) * 100), 0, 100),
    }))
    .sort((a, b) => b.headroom - a.headroom)
    .slice(0, 2);
}

export function buildStrategyOptimizer({
  answers,
  result,
  averageCutoff,
  categoryInfo = [],
  provinces = [],
}) {
  const score = toNumber(result?.total);
  const cutoff = toNumber(averageCutoff, 520);
  const gap = cutoff - score;
  const pathPlans = buildPathPlans(answers, result, { averageCutoff: cutoff }).plans || [];
  const pathOptions = pathPlans.slice(0, 2).map(buildPathwayOption);
  const eligibleCount = categoryInfo.filter((cat) => typeof cat?.check === 'function' && cat.check(answers)).length;
  const categoryOption = buildCategoryOption({ score, cutoff, eligibleCount });
  const provinceOption = buildProvinceOption((provinces || [])[0] || null);

  const options = [
    ...pathOptions,
    categoryOption,
    provinceOption,
  ].filter(Boolean);

  const ranked = options
    .map((option) => ({
      ...option,
      score: Math.round(
        (option.scoreGain * 0.42)
        + ((100 - (option.months * 6)) * 0.22)
        + (option.confidence * 0.24)
        + (option.effort === 'Easy' ? 12 : option.effort === 'Medium' ? 7 : 2)
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const top = ranked[0] || null;
  const bottlenecks = getPrimaryBottlenecks(result?.breakdown, score);
  const guidanceSummary = top
    ? `Primary lane: ${top.title}. Estimated gain ${top.scoreGain} points in ~${top.months} months.`
    : 'No strong lane detected yet. Start by improving language and category eligibility.';

  return {
    score,
    cutoff,
    gap,
    ranked,
    top,
    bottlenecks,
    guidanceSummary,
  };
}

function createPlanTask(id, title, rationale, dayFrom, dayTo, impact, lane, priority = 'Medium') {
  return {
    id,
    title,
    rationale,
    window: normalizeWindow(dayFrom, dayTo),
    dayFrom,
    dayTo,
    impact,
    lane,
    priority,
  };
}

export function buildNinetyDayPlan({
  suggestions = [],
  strategy,
  scoreGap = 0,
}) {
  const secondSuggestion = suggestions[1];
  const topLane = strategy?.top?.title || 'Profile Optimization';
  const estimatedGap = Math.max(toNumber(scoreGap), 0);

  const tasks = [
    createPlanTask(
      'plan-baseline',
      'Lock baseline and target score',
      `Set a concrete target and freeze your baseline profile to avoid random changes. Current gap: ${estimatedGap} points.`,
      1,
      10,
      0,
      topLane,
      'High'
    ),
    createPlanTask(
      'plan-primary-lane',
      `Execute primary lane: ${topLane}`,
      strategy?.top?.reason || 'Follow the highest-impact lane identified by optimizer.',
      11,
      35,
      strategy?.top?.scoreGain || 10,
      topLane,
      'High'
    ),
    createPlanTask(
      'plan-secondary-lane',
      secondSuggestion
        ? `Secondary boost: ${secondSuggestion.title}`
        : 'Secondary boost: language and profile precision',
      secondSuggestion?.description || 'Add one additional improvement path to reduce draw uncertainty.',
      30,
      55,
      secondSuggestion?.potentialGain || 8,
      secondSuggestion?.title || 'Secondary path',
      'Medium'
    ),
    createPlanTask(
      'plan-document-pack',
      'Prepare immigration document pack',
      'Collect and verify key documents (identity, education, work proofs, test reports, proof-of-funds readiness).',
      40,
      70,
      0,
      'Readiness',
      'High'
    ),
    createPlanTask(
      'plan-profile-audit',
      'Profile audit and draw readiness check',
      `Re-evaluate score vs latest draws and category cutoffs. Trigger fallback lane if gap remains above 15 points.`,
      65,
      90,
      0,
      'Risk Control',
      'High'
    ),
  ];

  const milestones = [
    { label: 'Days 1-30', objective: 'Baseline lock + launch primary lane', expectedGain: tasks[1].impact },
    { label: 'Days 31-60', objective: 'Add secondary lane + document readiness', expectedGain: tasks[2].impact },
    { label: 'Days 61-90', objective: 'Audit, stabilize, and draw-position for submission', expectedGain: 0 },
  ];

  return { tasks, milestones };
}

export function readActionPlanProgress(answers = {}) {
  if (typeof window === 'undefined') return {};
  const key = `${ACTION_PLAN_STORAGE_KEY}:${hashAnswers(answers)}`;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveActionPlanProgress(answers = {}, progress = {}) {
  if (typeof window === 'undefined') return;
  const key = `${ACTION_PLAN_STORAGE_KEY}:${hashAnswers(answers)}`;
  try {
    window.localStorage.setItem(key, JSON.stringify(progress || {}));
  } catch {
    // ignore storage failures
  }
}
