import { readExperimentAssignments } from './experiments';

function sanitizeAnswers(answers = {}) {
  const next = {};
  for (const [key, value] of Object.entries(answers || {})) {
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      next[key] = value;
    }
  }
  return next;
}

function sanitizeCategoryInfo(categoryInfo = [], answers = {}) {
  return (Array.isArray(categoryInfo) ? categoryInfo : []).map((category) => {
    let eligible = false;
    try {
      eligible = typeof category?.check === 'function' ? !!category.check(answers) : false;
    } catch {
      eligible = false;
    }
    return {
      id: category?.id || '',
      name: category?.name || '',
      recentCutoff: Number(category?.recentCutoff) || 0,
      cutoffRange: category?.cutoffRange || '',
      source: category?.source || 'unknown',
      updatedAt: category?.updatedAt || null,
      eligible,
    };
  });
}

function sanitizeStrategy(strategy = {}) {
  return {
    confidenceBand: strategy?.confidenceBand || 'Unknown',
    overallConfidence: Number(strategy?.overallConfidence) || 0,
    score: Number(strategy?.score) || 0,
    cutoff: Number(strategy?.cutoff) || 0,
    gap: Number(strategy?.gap) || 0,
    top: strategy?.top
      ? {
        title: strategy.top.title,
        lane: strategy.top.lane,
        score: Number(strategy.top.score) || 0,
        scoreGain: Number(strategy.top.scoreGain) || 0,
        months: Number(strategy.top.months) || 0,
        confidence: Number(strategy.top.confidence) || 0,
        effort: strategy.top.effort || 'Unknown',
      }
      : null,
    ranked: (strategy?.ranked || []).slice(0, 4).map((option) => ({
      id: option.id,
      title: option.title,
      lane: option.lane,
      score: Number(option.score) || 0,
      scoreGain: Number(option.scoreGain) || 0,
      months: Number(option.months) || 0,
      confidence: Number(option.confidence) || 0,
      effort: option.effort || 'Unknown',
    })),
    riskFlags: (strategy?.globalRiskFlags || []).map((risk) => ({
      id: risk.id,
      label: risk.label,
      severity: risk.severity,
    })),
  };
}

function sanitizeActionPlan(actionPlan = {}) {
  return {
    completionPct: Number(actionPlan?.completionPct) || 0,
    completedCount: Number(actionPlan?.completedCount) || 0,
    totalCount: Number(actionPlan?.totalCount) || 0,
    nextBestTask: actionPlan?.nextBestTask
      ? {
        id: actionPlan.nextBestTask.id,
        title: actionPlan.nextBestTask.title,
        dateWindow: actionPlan.nextBestTask.dateWindow,
        successMetric: actionPlan.nextBestTask.successMetric,
      }
      : null,
    tasks: (actionPlan?.tasks || []).map((task) => ({
      id: task.id,
      title: task.title,
      lane: task.lane,
      priority: task.priority,
      impact: Number(task.impact) || 0,
      dateWindow: task.dateWindow,
      weekWindow: task.weekWindow,
    })),
  };
}

export function buildConsultantHandoffPayload({
  answers = {},
  result = {},
  strategy = {},
  forecast = null,
  actionPlan = {},
  drawData = {},
  categoryInfo = [],
} = {}) {
  const score = Number(result?.total) || 0;
  const averageCutoff = Number(drawData?.averageCutoff) || Number(strategy?.cutoff) || 0;
  const generatedAt = new Date().toISOString();
  return {
    schema: 'crs_consultant_handoff_v1',
    generatedAt,
    appVersion: import.meta.env.VITE_APP_VERSION || 'dev',
    summary: {
      score,
      averageCutoff,
      gapToAverageCutoff: score - averageCutoff,
      confidenceBand: strategy?.confidenceBand || 'Unknown',
    },
    policy: result?.policy || null,
    profileAnswers: sanitizeAnswers(answers),
    scoreBreakdown: result?.breakdown || {},
    scoreDetails: result?.details || {},
    strategy: sanitizeStrategy(strategy),
    forecast: forecast
      ? {
        trendLabel: forecast.trendLabel,
        confidenceBand: forecast.confidenceBand,
        confidenceScore: Number(forecast.confidenceScore) || 0,
        projectedNextCutoff: Number(forecast.projectedNextCutoff) || 0,
        projectedThreeDrawAvg: Number(forecast.projectedThreeDrawAvg) || 0,
        projectedDraws: Array.isArray(forecast.projectedDraws) ? forecast.projectedDraws : [],
        invitationLikelihood: forecast.invitationLikelihood || 'Unknown',
      }
      : null,
    actionPlan: sanitizeActionPlan(actionPlan),
    dataSnapshot: {
      drawLastUpdated: drawData?.lastUpdated || null,
      drawSource: drawData?.source || null,
      categoryCount: Array.isArray(categoryInfo) ? categoryInfo.length : 0,
      categoryEligibility: sanitizeCategoryInfo(categoryInfo, answers),
    },
    experimentAssignments: readExperimentAssignments(),
  };
}

function safeFileDate(isoString) {
  return String(isoString || '')
    .replace(/[:]/g, '-')
    .replace(/\..+$/, '')
    .replace('T', '_')
    .replace('Z', '');
}

export function downloadConsultantHandoff(payload, { filePrefix = 'consultant-handoff' } = {}) {
  if (typeof window === 'undefined') return false;
  try {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = safeFileDate(payload?.generatedAt || new Date().toISOString());
    anchor.href = url;
    anchor.download = `${filePrefix}-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
