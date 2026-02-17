import { buildPathPlans } from '../scoring/pathPlanner';

const ACTION_PLAN_STORAGE_KEY = 'crs-90-day-action-plan-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITY_ORDER = {
  High: 3,
  Medium: 2,
  Low: 1,
};

const SCORE_WEIGHTS = {
  impact: 0.34,
  speed: 0.18,
  confidence: 0.22,
  effort: 0.12,
  laneFit: 0.14,
};
export const DEFAULT_OPTIMIZER_CONSTRAINTS = {
  budgetCad: 3500,
  weeklyHours: 6,
  examAttempts: 2,
  relocationPreference: 'balanced',
};
const DIGITAL_TWIN_HORIZONS = [
  { id: '3m', label: '3 months', months: 3, gainFactor: 0.35 },
  { id: '6m', label: '6 months', months: 6, gainFactor: 0.62 },
  { id: '12m', label: '12 months', months: 12, gainFactor: 0.88 },
];

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
function toInt(value, fallback = 0) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}
export function normalizeOptimizerConstraints(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const relocationPreference = ['balanced', 'province', 'federal'].includes(source.relocationPreference)
    ? source.relocationPreference
    : DEFAULT_OPTIMIZER_CONSTRAINTS.relocationPreference;
  return {
    budgetCad: clamp(toInt(source.budgetCad, DEFAULT_OPTIMIZER_CONSTRAINTS.budgetCad), 500, 20000),
    weeklyHours: clamp(toInt(source.weeklyHours, DEFAULT_OPTIMIZER_CONSTRAINTS.weeklyHours), 2, 30),
    examAttempts: clamp(toInt(source.examAttempts, DEFAULT_OPTIMIZER_CONSTRAINTS.examAttempts), 1, 8),
    relocationPreference,
  };
}

function startOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  return new Date(date.getTime() + (days * DAY_MS));
}

function formatShortDate(date) {
  try {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function getDateWindow(planStartDate, dayFrom, dayTo) {
  const startDate = addDays(planStartDate, Math.max(dayFrom - 1, 0));
  const endDate = addDays(planStartDate, Math.max(dayTo - 1, 0));
  return {
    startDateIso: startDate.toISOString(),
    endDateIso: endDate.toISOString(),
    weekWindow: `Week ${Math.ceil(dayFrom / 7)}-${Math.ceil(dayTo / 7)}`,
    dateWindow: `${formatShortDate(startDate)} → ${formatShortDate(endDate)}`,
  };
}

function ieltsToClb(skill, bandRaw) {
  const band = toNumber(bandRaw);
  if (skill === 'listening') {
    if (band >= 8.5) return 10;
    if (band >= 8) return 9;
    if (band >= 7.5) return 8;
    if (band >= 6) return 7;
    if (band >= 5.5) return 6;
    if (band >= 5) return 5;
    return 0;
  }
  if (skill === 'reading') {
    if (band >= 8) return 10;
    if (band >= 7) return 9;
    if (band >= 6.5) return 8;
    if (band >= 6) return 7;
    if (band >= 5) return 6;
    if (band >= 4) return 5;
    return 0;
  }
  if (band >= 7.5) return 10;
  if (band >= 7) return 9;
  if (band >= 6.5) return 8;
  if (band >= 6) return 7;
  if (band >= 5.5) return 6;
  if (band >= 5) return 5;
  return 0;
}

function getMinFirstLanguageClb(answers = {}) {
  const skills = ['listening', 'reading', 'writing', 'speaking'];
  const firstOfficialIsFrench = answers.firstOfficialLanguage === 'french';
  const values = skills.map((skill) => {
    if (firstOfficialIsFrench) {
      return toInt(answers[`french_${skill}`], 0);
    }
    if (answers.langTestType === 'celpip') {
      return toInt(answers[`celpip_${skill}`], 0);
    }
    return ieltsToClb(skill, answers[`ielts_${skill}`]);
  });
  const filtered = values.filter((v) => v > 0);
  if (!filtered.length) return 0;
  return Math.min(...filtered);
}

function buildRiskFlag(id, label, detail, severity = 'medium') {
  return { id, label, detail, severity };
}

function riskWeight(severity) {
  if (severity === 'high') return 10;
  if (severity === 'medium') return 5;
  return 2;
}

function effortReadinessScore(effort = 'Medium') {
  if (effort === 'Easy') return 100;
  if (effort === 'Medium') return 68;
  return 38;
}

function confidenceBandFromScore(score = 0) {
  if (score >= 76) return 'High';
  if (score >= 56) return 'Medium';
  return 'Low';
}

function deriveProfileSignals(answers = {}, result, cutoff) {
  const score = toNumber(result?.total);
  const gap = cutoff - score;
  const age = toInt(answers.age, 0);
  const minLanguageClb = getMinFirstLanguageClb(answers);
  const hasFrench = answers.hasFrench === 'yes' || answers.firstOfficialLanguage === 'french';
  const canadianWorkExp = toInt(answers.canadianWorkExp, 0);
  const foreignWorkExp = toInt(answers.foreignWorkExp, 0);

  const languageHeadroom = minLanguageClb >= 9
    ? 18
    : minLanguageClb >= 7
      ? 46
      : 74;

  const profileComplexity = clamp(
    (age >= 33 ? 28 : 14)
    + (minLanguageClb < 7 ? 26 : minLanguageClb < 9 ? 16 : 6)
    + (canadianWorkExp === 0 ? 12 : 4)
    + (foreignWorkExp >= 3 ? 8 : 3),
    10,
    90
  );

  const assumptions = [
    {
      key: 'answers_accuracy',
      label: 'Profile values are accurate and complete',
      confidence: answers.knowsScore === 'yes' ? 'Medium' : 'High',
    },
    {
      key: 'draw_trend_stability',
      label: 'Recent draw patterns remain directionally similar',
      confidence: Math.abs(gap) <= 20 ? 'Medium' : 'Low',
    },
    {
      key: 'execution_discipline',
      label: 'You can sustain weekly execution cadence for 90 days',
      confidence: profileComplexity <= 45 ? 'High' : profileComplexity <= 65 ? 'Medium' : 'Low',
    },
  ];

  const globalRiskFlags = [];
  if (age >= 33) {
    globalRiskFlags.push(
      buildRiskFlag(
        'risk-age-decay',
        'Age-point decay risk',
        'Delays can reduce score as age thresholds change.',
        age >= 38 ? 'high' : 'medium'
      )
    );
  }
  if (minLanguageClb > 0 && minLanguageClb < 7) {
    globalRiskFlags.push(
      buildRiskFlag(
        'risk-language-floor',
        'Language floor below CLB 7',
        'Several lanes become weaker or inaccessible below CLB 7.',
        'high'
      )
    );
  }
  if (!hasFrench) {
    globalRiskFlags.push(
      buildRiskFlag(
        'risk-no-french',
        'No French upside yet',
        'You may miss lower-cutoff category opportunities tied to French strength.',
        'low'
      )
    );
  }
  if (gap > 40) {
    globalRiskFlags.push(
      buildRiskFlag(
        'risk-large-gap',
        'Large score gap',
        'A single action may not close this gap; a combination strategy is likely required.',
        'high'
      )
    );
  }

  return {
    score,
    gap,
    age,
    minLanguageClb,
    hasFrench,
    canadianWorkExp,
    foreignWorkExp,
    languageHeadroom,
    profileComplexity,
    assumptions,
    globalRiskFlags,
  };
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

function buildPathwayOption(path, signals, gap) {
  const laneFitBase = path.category === 'Language'
    ? 50 + (signals.languageHeadroom * 0.45)
    : path.category === 'Provincial'
      ? 72
      : path.category === 'Combination'
        ? 76
        : 60;
  const laneFit = clamp(
    laneFitBase
      + (path.goalReached ? 8 : 0)
      + ((path.likelihoodPercent - 50) * 0.35),
    30,
    95
  );
  const riskFlags = [];
  if (path.estimatedMonths >= 10) {
    riskFlags.push(
      buildRiskFlag(
        `${path.id}-timeline`,
        'Long timeline',
        'This lane can take substantial time before score impact materializes.',
        'medium'
      )
    );
  }
  if (path.difficulty === 'Hard') {
    riskFlags.push(
      buildRiskFlag(
        `${path.id}-effort`,
        'Execution intensity',
        'Consistent weekly effort is required to avoid plan drift.',
        'medium'
      )
    );
  }
  if (!path.goalReached && gap > 0) {
    riskFlags.push(
      buildRiskFlag(
        `${path.id}-bridge`,
        'May require a second lane',
        'This lane may need a backup action to fully close your gap.',
        'low'
      )
    );
  }
  return {
    id: `path-${path.id}`,
    title: path.title,
    lane: path.category,
    reason: path.whyItFits,
    scoreGain: path.potentialGain,
    months: path.estimatedMonths,
    confidence: path.likelihoodPercent,
    effort: path.difficulty,
    estimatedCostCad: toNumber(path.estimatedCostCad, 0),
    examSensitive: path.category === 'Language' || /language|ielts|celpip|tef|tcf|french/i.test(path.title || ''),
    laneFit,
    riskFlags,
  };
}

function buildCategoryOption({ score, cutoff, eligibleCount, signals }) {
  const gap = cutoff - score;
  const confidence = gap <= 0 ? 82 : gap <= 20 ? 64 : 38;
  const riskFlags = [];
  if (!eligibleCount) {
    riskFlags.push(
      buildRiskFlag(
        'category-not-eligible',
        'Not category-eligible yet',
        'A prerequisite profile change is required before this lane can be used.',
        'high'
      )
    );
  }
  if (gap > 35) {
    riskFlags.push(
      buildRiskFlag(
        'category-gap',
        'Gap still material',
        'Category targeting helps, but the score gap remains significant.',
        'medium'
      )
    );
  }
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
    estimatedCostCad: 1200,
    examSensitive: !signals.hasFrench,
    laneFit: clamp((eligibleCount > 0 ? 70 : 35) + (signals.hasFrench ? 8 : 0), 25, 90),
    riskFlags,
  };
}

function buildProvinceOption(bestProvince) {
  if (!bestProvince) return null;
  const riskFlags = [];
  if (bestProvince.matchScore < 55) {
    riskFlags.push(
      buildRiskFlag(
        `province-${bestProvince.id}-fit`,
        'Lower province fit',
        'Province alignment is currently moderate; stream targeting needs tighter matching.',
        'high'
      )
    );
  }
  if (bestProvince.matchScore >= 55 && bestProvince.matchScore < 70) {
    riskFlags.push(
      buildRiskFlag(
        `province-${bestProvince.id}-variance`,
        'Selection variance',
        'Provincial intake criteria can shift and may require profile tuning.',
        'medium'
      )
    );
  }
  return {
    id: `lane-province-${bestProvince.id}`,
    title: `${bestProvince.name} PNP Focus`,
    lane: 'Provincial',
    reason: `${bestProvince.name} has the highest profile match in your province analysis.`,
    scoreGain: bestProvince.matchScore >= 70 ? 600 : 300,
    months: bestProvince.matchScore >= 70 ? 6 : 9,
    confidence: clamp(bestProvince.matchScore, 35, 88),
    effort: bestProvince.matchScore >= 70 ? 'Medium' : 'Hard',
    estimatedCostCad: bestProvince.matchScore >= 70 ? 3200 : 4200,
    examSensitive: false,
    laneFit: clamp(bestProvince.matchScore + (bestProvince.matchScore >= 70 ? 6 : -4), 25, 95),
    riskFlags,
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
function buildScoredOption(option, gap) {
  const neededGain = Math.max(Math.abs(gap), 35);
  const impact = clamp(Math.round((option.scoreGain / neededGain) * 100), 8, 100);
  const speed = clamp(100 - (option.months * 11), 12, 100);
  const confidence = clamp(option.confidence, 12, 100);
  const effort = effortReadinessScore(option.effort);
  const laneFit = clamp(toNumber(option.laneFit, 60), 10, 100);
  const weightedRaw = (
    (impact * SCORE_WEIGHTS.impact)
    + (speed * SCORE_WEIGHTS.speed)
    + (confidence * SCORE_WEIGHTS.confidence)
    + (effort * SCORE_WEIGHTS.effort)
    + (laneFit * SCORE_WEIGHTS.laneFit)
  );

  const riskFlags = Array.isArray(option.riskFlags) ? option.riskFlags : [];
  const riskPenalty = clamp(
    riskFlags.reduce((sum, flag) => sum + riskWeight(flag.severity), 0),
    0,
    24
  );

  const score = clamp(Math.round(weightedRaw - riskPenalty), 1, 100);
  return {
    ...option,
    score,
    riskPenalty,
    scoreBreakdown: [
      { key: 'impact', label: 'Impact potential', value: impact, weight: SCORE_WEIGHTS.impact },
      { key: 'speed', label: 'Speed to value', value: speed, weight: SCORE_WEIGHTS.speed },
      { key: 'confidence', label: 'Data confidence', value: confidence, weight: SCORE_WEIGHTS.confidence },
      { key: 'effort', label: 'Execution ease', value: effort, weight: SCORE_WEIGHTS.effort },
      { key: 'laneFit', label: 'Profile-lane fit', value: laneFit, weight: SCORE_WEIGHTS.laneFit },
    ],
  };
}

function requiredWeeklyHoursForOption(option = {}) {
  const base = option.effort === 'Hard' ? 10 : option.effort === 'Medium' ? 6 : 3;
  const timelinePressure = toNumber(option.months, 6) <= 3 ? 2 : toNumber(option.months, 6) <= 6 ? 1 : 0;
  return base + timelinePressure;
}
function estimatedCostForOption(option = {}) {
  const explicit = toNumber(option.estimatedCostCad, 0);
  if (explicit > 0) return explicit;
  if (option.lane === 'Provincial') return 3600;
  if (option.lane === 'Category Draws') return 1200;
  if (option.lane === 'Language') return 1800;
  return 2200;
}
function isProvincialLane(option = {}) {
  return /provincial/i.test(option.lane || '');
}
function applyConstraintAwareScore(option, constraintsInput) {
  const constraints = normalizeOptimizerConstraints(constraintsInput);
  const factors = [];
  const estimatedCostCad = estimatedCostForOption(option);
  const requiredWeeklyHours = requiredWeeklyHoursForOption(option);
  let adjustment = 0;

  const budgetCoverage = constraints.budgetCad / Math.max(estimatedCostCad, 1);
  if (budgetCoverage < 0.75) {
    const penalty = Math.min(Math.round((0.75 - budgetCoverage) * 20), 12);
    adjustment -= penalty;
    factors.push({ id: 'budget', label: 'Budget pressure', delta: -penalty });
  } else if (budgetCoverage > 1.35) {
    const bonus = Math.min(Math.round((budgetCoverage - 1.35) * 8), 5);
    adjustment += bonus;
    factors.push({ id: 'budget', label: 'Budget headroom', delta: bonus });
  }

  const hourGap = constraints.weeklyHours - requiredWeeklyHours;
  if (hourGap < 0) {
    const penalty = Math.min(Math.abs(hourGap) * 2, 10);
    adjustment -= penalty;
    factors.push({ id: 'time', label: 'Time constraint', delta: -penalty });
  } else if (hourGap > 0) {
    const bonus = Math.min(hourGap, 4);
    adjustment += bonus;
    factors.push({ id: 'time', label: 'Time capacity', delta: bonus });
  }

  if (option.examSensitive) {
    if (constraints.examAttempts <= 1) {
      adjustment -= 8;
      factors.push({ id: 'exam', label: 'Low exam retry budget', delta: -8 });
    } else if (constraints.examAttempts >= 3) {
      const bonus = Math.min((constraints.examAttempts - 2) * 2, 4);
      adjustment += bonus;
      factors.push({ id: 'exam', label: 'Exam retry flexibility', delta: bonus });
    }
  }

  const provincialLane = isProvincialLane(option);
  if (constraints.relocationPreference === 'province') {
    const delta = provincialLane ? 8 : -3;
    adjustment += delta;
    factors.push({ id: 'relocation', label: 'Province-focused preference', delta });
  } else if (constraints.relocationPreference === 'federal') {
    const delta = provincialLane ? -7 : 4;
    adjustment += delta;
    factors.push({ id: 'relocation', label: 'Federal-focused preference', delta });
  }

  const constraintAdjustment = clamp(Math.round(adjustment), -24, 18);
  const score = clamp(option.score + constraintAdjustment, 1, 100);
  const constraintFitScore = clamp(Math.round(70 + (constraintAdjustment * 2)), 12, 99);

  return {
    ...option,
    baseScore: option.score,
    score,
    constraintAdjustment,
    constraintFitScore,
    constraintFactors: factors,
    estimatedCostCad,
    requiredWeeklyHours,
  };
}

function parseDrawDate(draw) {
  const parsed = new Date(draw?.date || '');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function collectRecentDrawSeries(activeDraws = {}, maxItems = 10) {
  const merged = [
    ...(activeDraws.generalProgram || []),
    ...(activeDraws.categoryBased || []),
    ...(activeDraws.pnpDraws || []),
  ]
    .map((draw) => ({
      score: toNumber(draw?.score),
      date: parseDrawDate(draw),
      program: draw?.program || 'Unknown',
    }))
    .filter((item) => item.score > 0 && item.date)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, maxItems);
  return merged;
}

function standardDeviation(values = []) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function confidenceBand(score = 0) {
  if (score >= 75) return 'High';
  if (score >= 55) return 'Medium';
  return 'Low';
}

function probabilityFromGap({ scoreGap = 0, volatility = 0, confidence = 60 }) {
  const gapSignal = clamp((scoreGap + 80) / 160, 0, 1);
  const volatilityPenalty = clamp((toNumber(volatility) / 120), 0, 0.26);
  const confidenceBoost = clamp(toNumber(confidence, 60) / 100, 0, 1) * 0.2;
  const probability = (gapSignal * 0.72) + confidenceBoost - volatilityPenalty;
  return clamp(probability, 0.02, 0.98);
}

function projectedCutoffForHorizon({ forecast, averageCutoff, horizonMonths }) {
  if (!forecast) return Math.round(toNumber(averageCutoff, 520));
  const base = toNumber(forecast.projectedNextCutoff, toNumber(averageCutoff, 520));
  const slopePerDraw = toNumber(forecast.slopePerDraw, 0);
  const drawSteps = Math.max(Math.round(horizonMonths / 2), 1);
  return Math.round(clamp(base + (slopePerDraw * Math.max(drawSteps - 1, 0)), 300, 800));
}

function chanceBandFromProbability(probabilityPct = 0) {
  if (probabilityPct >= 70) return 'High';
  if (probabilityPct >= 45) return 'Medium';
  return 'Low';
}

export function buildInvitationDigitalTwin({
  strategy,
  forecast,
  actionPlan,
  averageCutoff,
  userScore,
}) {
  const baseScore = toNumber(userScore, toNumber(strategy?.score, 0));
  const topGain = Math.max(toNumber(strategy?.top?.scoreGain, 0), 0);
  const completionPct = clamp(toNumber(actionPlan?.completionPct, 0), 0, 100);
  const executionMultiplier = clamp((completionPct / 100) * 0.55 + 0.45, 0.4, 1);
  const volatility = toNumber(forecast?.volatility, 14);
  const confidenceScore = toNumber(forecast?.confidenceScore, strategy?.overallConfidence || 58);
  const topLane = strategy?.top?.title || 'Primary strategy lane';

  const horizons = DIGITAL_TWIN_HORIZONS.map((horizon) => {
    const projectedCutoff = projectedCutoffForHorizon({
      forecast,
      averageCutoff,
      horizonMonths: horizon.months,
    });
    const expectedGain = Math.round(topGain * horizon.gainFactor * executionMultiplier);
    const expectedScore = baseScore + expectedGain;
    const scoreGap = Math.round(expectedScore - projectedCutoff);

    const baseProbability = probabilityFromGap({
      scoreGap,
      volatility,
      confidence: confidenceScore,
    });
    const bestProbability = probabilityFromGap({
      scoreGap: scoreGap + Math.max(Math.round(topGain * 0.35), 8),
      volatility: volatility * 0.75,
      confidence: confidenceScore + 8,
    });
    const worstProbability = probabilityFromGap({
      scoreGap: scoreGap - Math.max(Math.round(topGain * 0.45), 10),
      volatility: volatility * 1.25,
      confidence: confidenceScore - 10,
    });

    const baseProbabilityPct = Math.round(baseProbability * 100);
    const bestProbabilityPct = Math.round(bestProbability * 100);
    const worstProbabilityPct = Math.round(worstProbability * 100);
    const uncertaintyPct = clamp(
      Math.round(26 + (volatility * 0.8) - (confidenceScore * 0.18)),
      8,
      34
    );
    const confidenceLowPct = clamp(Math.round(baseProbabilityPct - (uncertaintyPct / 2)), 1, 99);
    const confidenceHighPct = clamp(Math.round(baseProbabilityPct + (uncertaintyPct / 2)), 1, 99);

    return {
      id: horizon.id,
      label: horizon.label,
      months: horizon.months,
      projectedCutoff,
      expectedScore,
      expectedGain,
      scoreGap,
      baseProbabilityPct,
      bestProbabilityPct,
      worstProbabilityPct,
      chanceBand: chanceBandFromProbability(baseProbabilityPct),
      confidenceInterval: {
        lowPct: confidenceLowPct,
        highPct: confidenceHighPct,
        uncertaintyPct,
      },
    };
  });

  const ranked = [...horizons].sort((a, b) => {
    if (b.baseProbabilityPct !== a.baseProbabilityPct) return b.baseProbabilityPct - a.baseProbabilityPct;
    return a.months - b.months;
  });
  const recommended = ranked[0] || horizons[0] || null;
  const recommendedHorizonId = recommended?.id || '6m';
  const confidenceBandLabel = confidenceBand(confidenceScore);

  const keyDrivers = [
    {
      id: 'top_lane_gain',
      label: `${topLane} expected gain`,
      value: `+${Math.round(topGain)} pts potential`,
      influence: topGain >= 20 ? 'positive' : 'neutral',
    },
    {
      id: 'execution_cadence',
      label: 'Execution cadence',
      value: `${completionPct}% action-plan completion`,
      influence: completionPct >= 55 ? 'positive' : completionPct >= 25 ? 'neutral' : 'negative',
    },
    {
      id: 'draw_volatility',
      label: 'Draw volatility pressure',
      value: `${Number(volatility).toFixed(2)} volatility`,
      influence: volatility <= 12 ? 'positive' : volatility <= 24 ? 'neutral' : 'negative',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    confidenceBand: confidenceBandLabel,
    recommendedHorizonId,
    topLane,
    horizons,
    keyDrivers,
    summary: recommended
      ? `Best current horizon: ${recommended.label} with ${recommended.baseProbabilityPct}% base invitation probability.`
      : 'Digital twin is preparing probability projections.',
  };
}

export function buildOutcomeForecast({ activeDraws, userScore, baseConfidence = 60 }) {
  const series = collectRecentDrawSeries(activeDraws, 10);
  if (!series.length) return null;

  const latest = series[0];
  const chronological = [...series].reverse();
  const first = chronological[0];
  const last = chronological[chronological.length - 1];
  const sampleSize = chronological.length;
  const slopePerDraw = sampleSize > 1
    ? (last.score - first.score) / (sampleSize - 1)
    : 0;

  const latestScore = latest.score;
  const projectedNextCutoff = Math.round(clamp(latestScore + slopePerDraw, 300, 800));
  const projectedSecondCutoff = Math.round(clamp(projectedNextCutoff + slopePerDraw, 300, 800));
  const projectedThirdCutoff = Math.round(clamp(projectedSecondCutoff + slopePerDraw, 300, 800));
  const projectedThreeDrawAvg = Math.round((projectedNextCutoff + projectedSecondCutoff + projectedThirdCutoff) / 3);

  const volatility = standardDeviation(series.map((item) => item.score));
  const latestDate = latest.date;
  const daysSinceUpdate = latestDate
    ? Math.floor((Date.now() - latestDate.getTime()) / DAY_MS)
    : 999;

  let confidenceScore = toNumber(baseConfidence, 60);
  confidenceScore += Math.min(sampleSize * 3, 18);
  confidenceScore -= Math.min(volatility * 1.2, 24);
  if (daysSinceUpdate <= 2) confidenceScore += 5;
  else if (daysSinceUpdate <= 7) confidenceScore += 1;
  else if (daysSinceUpdate > 14) confidenceScore -= 9;
  confidenceScore = clamp(Math.round(confidenceScore), 20, 92);

  const trendDirection = slopePerDraw > 1.5 ? 'rising' : slopePerDraw < -1.5 ? 'falling' : 'stable';
  const trendLabel = trendDirection === 'rising'
    ? 'Cutoff trend is rising'
    : trendDirection === 'falling'
      ? 'Cutoff trend is falling'
      : 'Cutoff trend is stable';

  const userGapToNext = toNumber(userScore) - projectedNextCutoff;
  const invitationLikelihood = userGapToNext >= 20
    ? 'High'
    : userGapToNext >= 0
      ? 'Medium'
      : 'Low';

  return {
    sampleSize,
    volatility: Number(volatility.toFixed(2)),
    slopePerDraw: Number(slopePerDraw.toFixed(2)),
    projectedNextCutoff,
    projectedThreeDrawAvg,
    projectedDraws: [projectedNextCutoff, projectedSecondCutoff, projectedThirdCutoff],
    trendDirection,
    trendLabel,
    confidenceScore,
    confidenceBand: confidenceBand(confidenceScore),
    invitationLikelihood,
    userGapToNext,
    latestObservedCutoff: latestScore,
    latestObservedProgram: latest.program,
    latestObservedDateIso: latestDate?.toISOString() || '',
  };
}
export function buildStrategyOptimizer({
  answers,
  result,
  averageCutoff,
  categoryInfo = [],
  provinces = [],
  eligibleCategoryCount = Number.NaN,
  optimizerConstraints = DEFAULT_OPTIMIZER_CONSTRAINTS,
}) {
  const normalizedConstraints = normalizeOptimizerConstraints(optimizerConstraints);
  const score = toNumber(result?.total);
  const cutoff = toNumber(averageCutoff, 520);
  const gap = cutoff - score;
  const signals = deriveProfileSignals(answers, result, cutoff);
  const pathPlans = buildPathPlans(answers, result, { averageCutoff: cutoff }).plans || [];
  const pathOptions = pathPlans.slice(0, 2).map((path) => buildPathwayOption(path, signals, gap));
  const explicitEligibleCount = toNumber(eligibleCategoryCount, Number.NaN);
  const eligibleCount = Number.isFinite(explicitEligibleCount)
    ? Math.max(Math.round(explicitEligibleCount), 0)
    : categoryInfo.filter((cat) => typeof cat?.check === 'function' && cat.check(answers)).length;
  const categoryOption = buildCategoryOption({ score, cutoff, eligibleCount, signals });
  const provinceOption = buildProvinceOption((provinces || [])[0] || null);

  const options = [
    ...pathOptions,
    categoryOption,
    provinceOption,
  ].filter(Boolean);

  const ranked = options
    .map((option) => buildScoredOption(option, gap))
    .map((option) => applyConstraintAwareScore(option, normalizedConstraints))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const top = ranked[0] || null;
  const nextBest = ranked[1] || null;
  const bottlenecks = getPrimaryBottlenecks(result?.breakdown, score);
  const topRiskFlags = [
    ...(signals.globalRiskFlags || []),
    ...ranked.slice(0, 2).flatMap((item) => item.riskFlags || []),
  ];
  const globalRiskFlags = Object.values(
    topRiskFlags.reduce((acc, flag) => {
      if (!flag?.id) return acc;
      if (!acc[flag.id]) acc[flag.id] = flag;
      return acc;
    }, {})
  ).slice(0, 5);

  const confidenceSamples = ranked.slice(0, 2).map((option) => clamp(option.confidence - option.riskPenalty, 0, 100));
  const overallConfidence = confidenceSamples.length
    ? Math.round(confidenceSamples.reduce((sum, value) => sum + value, 0) / confidenceSamples.length)
    : 36;
  const confidenceBand = confidenceBandFromScore(overallConfidence);
  const guidanceSummary = top
    ? `Primary lane: ${top.title}. Estimated gain ${top.scoreGain} points in ~${top.months} months (${confidenceBand.toLowerCase()} confidence).`
    : 'No strong lane detected yet. Start by improving language and category eligibility.';

  return {
    score,
    cutoff,
    gap,
    ranked,
    top,
    nextBest,
    bottlenecks,
    assumptions: signals.assumptions,
    globalRiskFlags,
    overallConfidence,
    confidenceBand,
    profileSignals: {
      minLanguageClb: signals.minLanguageClb,
      profileComplexity: signals.profileComplexity,
      languageHeadroom: signals.languageHeadroom,
    },
    optimizerConstraints: normalizedConstraints,
    scoreWeights: SCORE_WEIGHTS,
    guidanceSummary,
  };
}

export function computeStrategicInsights({
  answers,
  result,
  suggestions = [],
  averageCutoff,
  activeDraws,
  categoryInfo = [],
  provinces = [],
  progress = {},
  enableAdvancedForecasting = false,
  eligibleCategoryCount = Number.NaN,
  optimizerConstraints = DEFAULT_OPTIMIZER_CONSTRAINTS,
}) {
  const strategy = buildStrategyOptimizer({
    answers,
    result,
    averageCutoff,
    categoryInfo,
    provinces,
    eligibleCategoryCount,
    optimizerConstraints,
  });
  const actionPlan = buildNinetyDayPlan({
    suggestions,
    strategy,
    scoreGap: Math.max((averageCutoff || 0) - (result?.total || 0), 0),
    progress,
  });
  const forecast = enableAdvancedForecasting
    ? buildOutcomeForecast({
      activeDraws,
      userScore: result?.total || 0,
      baseConfidence: strategy.overallConfidence,
    })
    : null;
  const digitalTwin = buildInvitationDigitalTwin({
    strategy,
    forecast,
    actionPlan,
    averageCutoff,
    userScore: result?.total || 0,
  });
  return { strategy, actionPlan, forecast, digitalTwin };
}
function createPlanTask(
  id,
  title,
  rationale,
  dayFrom,
  dayTo,
  impact,
  lane,
  priority = 'Medium',
  planStartDate,
  options = {}
) {
  const { startDateIso, endDateIso, weekWindow, dateWindow } = getDateWindow(planStartDate, dayFrom, dayTo);
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
    startDateIso,
    endDateIso,
    weekWindow,
    dateWindow,
    successMetric: options.successMetric || 'Task completed with verified profile update.',
    checkpoint: options.checkpoint || 'Run a score recalculation and note delta.',
    dependencies: options.dependencies || [],
    cadence: options.cadence || '3 focused sessions per week',
  };
}

export function buildNinetyDayPlan({
  suggestions = [],
  strategy,
  scoreGap = 0,
  progress = {},
}) {
  const secondSuggestion = suggestions[1];
  const topLane = strategy?.top?.title || 'Profile Optimization';
  const estimatedGap = Math.max(toNumber(scoreGap), 0);
  const planStartDate = startOfDay(new Date());

  const tasks = [
    createPlanTask(
      'plan-baseline',
      'Lock baseline and target score',
      `Set a concrete target and freeze your baseline profile to avoid random changes. Current gap: ${estimatedGap} points.`,
      1,
      7,
      0,
      topLane,
      'High',
      planStartDate,
      {
        successMetric: 'Target score and top lane documented; baseline snapshot saved.',
        checkpoint: 'Save profile with date tag and score target.',
        cadence: 'One 45-minute planning block + one review',
      }
    ),
    createPlanTask(
      'plan-primary-lane',
      `Execute primary lane: ${topLane}`,
      strategy?.top?.reason || 'Follow the highest-impact lane identified by optimizer.',
      8,
      30,
      strategy?.top?.scoreGain || 10,
      topLane,
      'High',
      planStartDate,
      {
        successMetric: `Deliver at least 60% of ${topLane} milestones.`,
        checkpoint: 'Verify measurable progress (test booking, docs, submissions, etc.).',
      }
    ),
    createPlanTask(
      'plan-secondary-lane',
      secondSuggestion
        ? `Secondary boost: ${secondSuggestion.title}`
        : 'Secondary boost: language and profile precision',
      secondSuggestion?.description || 'Add one additional improvement path to reduce draw uncertainty.',
      24,
      50,
      secondSuggestion?.potentialGain || 8,
      secondSuggestion?.title || 'Secondary path',
      'Medium',
      planStartDate,
      {
        successMetric: 'Secondary lane started with first concrete deliverable completed.',
        checkpoint: 'Compare score delta before/after secondary-lane kickoff.',
        dependencies: ['plan-primary-lane'],
      }
    ),
    createPlanTask(
      'plan-document-pack',
      'Prepare immigration document pack',
      'Collect and verify key documents (identity, education, work proofs, test reports, proof-of-funds readiness).',
      35,
      68,
      0,
      'Readiness',
      'High',
      planStartDate,
      {
        successMetric: 'Core document checklist reaches 90% readiness.',
        checkpoint: 'Review missing docs and issue dates.',
        cadence: 'Two short admin sessions weekly',
      }
    ),
    createPlanTask(
      'plan-risk-buffer',
      'Activate fallback lane if progress stalls',
      'If progress velocity is below target, start a backup action immediately (e.g., category-specific adjustment or province-first route).',
      55,
      80,
      6,
      'Fallback Control',
      'Medium',
      planStartDate,
      {
        successMetric: 'Fallback lane is selected and started within 7 days of stall signal.',
        checkpoint: 'Mark stall trigger if expected gain is short by 20%+.',
        dependencies: ['plan-primary-lane'],
      }
    ),
    createPlanTask(
      'plan-profile-audit',
      'Profile audit and draw readiness check',
      `Re-evaluate score vs latest draws and category cutoffs. Trigger fallback lane if gap remains above 15 points.`,
      75,
      90,
      0,
      'Risk Control',
      'High',
      planStartDate,
      {
        successMetric: 'Final 90-day readiness review completed with go/no-go decision.',
        checkpoint: 'Capture current score, active cutoff delta, and next 30-day plan.',
        dependencies: ['plan-document-pack'],
      }
    ),
  ];

  const milestones = [
    {
      label: 'Days 1-30',
      objective: 'Baseline lock + launch primary lane',
      expectedGain: tasks[1].impact,
      dateWindow: getDateWindow(planStartDate, 1, 30).dateWindow,
    },
    {
      label: 'Days 31-60',
      objective: 'Add secondary lane + document readiness',
      expectedGain: tasks[2].impact,
      dateWindow: getDateWindow(planStartDate, 31, 60).dateWindow,
    },
    {
      label: 'Days 61-90',
      objective: 'Fallback control + final draw readiness review',
      expectedGain: tasks[4].impact,
      dateWindow: getDateWindow(planStartDate, 61, 90).dateWindow,
    },
  ];

  const completedCount = tasks.filter((task) => !!progress[task.id]).length;
  const totalCount = tasks.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const nextBestTask = [...tasks]
    .filter((task) => !progress[task.id])
    .sort((a, b) => {
      const byPriority = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (byPriority !== 0) return byPriority;
      return a.dayFrom - b.dayFrom;
    })[0] || null;

  const completionGuidance = completionPct >= 100
    ? 'All action-plan tasks are complete. Keep a weekly score monitor to stay draw-ready.'
    : nextBestTask
      ? `Next best task: ${nextBestTask.title} (${nextBestTask.dateWindow}).`
      : 'Continue progressing through the plan in order of priority.';

  const reviewDates = [14, 30, 60, 90].map((day) => {
    const date = addDays(planStartDate, day - 1);
    return { day, iso: date.toISOString(), label: formatShortDate(date) };
  });

  return {
    tasks,
    milestones,
    completedCount,
    totalCount,
    completionPct,
    nextBestTask,
    completionGuidance,
    calendar: {
      planStartIso: planStartDate.toISOString(),
      planEndIso: addDays(planStartDate, 89).toISOString(),
      reviewDates,
    },
  };
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
