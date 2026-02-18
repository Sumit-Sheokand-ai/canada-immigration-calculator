import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeStrategicInsights,
  DEFAULT_OPTIMIZER_CONSTRAINTS,
  normalizeOptimizerConstraints,
  readActionPlanProgress,
  saveActionPlanProgress,
} from '../utils/strategyHub';
import { trackEvent } from '../utils/analytics';
import { readRuntimeFlags } from '../utils/runtimeFlags';
import { useLanguage } from '../i18n/LanguageContext';
import { getExperimentAssignment, trackExperimentGoal } from '../utils/experiments';
import { buildConsultantHandoffPayload, buildConsultantHandoffShareUrl, downloadConsultantHandoff } from '../utils/handoffExport';
import { listSavedProfiles } from '../utils/profileStore';

function PriorityBadge({ value }) {
  const cls = value === 'High' ? 'priority-high' : value === 'Medium' ? 'priority-medium' : 'priority-low';
  return <span className={`priority-badge ${cls}`}>{value}</span>;
}

function EffortBadge({ value }) {
  const cls = value === 'Easy' ? 'effort-easy' : value === 'Medium' ? 'effort-medium' : 'effort-hard';
  return <span className={`effort-badge ${cls}`}>{value}</span>;
}

function RiskBadge({ value }) {
  const cls = value === 'high' ? 'risk-high' : value === 'medium' ? 'risk-medium' : 'risk-low';
  return <span className={`risk-badge ${cls}`}>{value}</span>;
}

function confidenceClass(value = '') {
  if (value === 'High') return 'assumption-high';
  if (value === 'Medium') return 'assumption-medium';
  return 'assumption-low';
}
function commandStatusClass(value = 'in_progress') {
  if (value === 'ready') return 'command-ready';
  if (value === 'blocked') return 'command-blocked';
  return 'command-progress';
}

function normalizeTierName(value) {
  if (value === 'free') return 'Free';
  return 'Pro Tracking';
}
function readStorageJson(key, fallback = null) {
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
    // ignore storage write issues
  }
}

function hashAnswersFingerprint(answers = {}) {
  const seed = JSON.stringify(answers || {});
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export default function ResultsStrategicHub({
  answers,
  result,
  suggestions,
  averageCutoff,
  activeDraws,
  activeCategoryInfo,
  provinces,
  drawFreshness,
  categoryFreshness,
  saveStatus,
  onJumpToSection,
  onOpenAccount,
}) {
  const { t } = useLanguage();
  const [runtimeFlags, setRuntimeFlags] = useState(() => readRuntimeFlags());
  const [pricingExperiment, setPricingExperiment] = useState(() => ({
    experimentKey: 'pricing_layout_v1',
    variant: 'control',
    source: 'init',
  }));

  const [planProgress, setPlanProgress] = useState(() => readActionPlanProgress(answers));
  const workerRef = useRef(null);
  const workerRequestIdRef = useRef(0);
  const [computedInsights, setComputedInsights] = useState(null);
  const digitalTwinEventRef = useRef('');
  const profileFingerprint = useMemo(() => hashAnswersFingerprint(answers), [answers]);
  const lastVisitSnapshotKey = useMemo(() => `crs-last-visit-snapshot-v1:${profileFingerprint}`, [profileFingerprint]);
  const reminderStateKey = useMemo(() => `crs-action-reminders-v1:${profileFingerprint}`, [profileFingerprint]);
  const optimizerConstraintKey = useMemo(() => `crs-optimizer-constraints-v1:${profileFingerprint}`, [profileFingerprint]);
  const commandChecklistStateKey = useMemo(() => `crs-command-center-checklist-v1:${profileFingerprint}`, [profileFingerprint]);
  const [changeSummary, setChangeSummary] = useState(null);
  const [taskReminders, setTaskReminders] = useState(() => readStorageJson(reminderStateKey, {}) || {});
  const [commandChecklistState, setCommandChecklistState] = useState(() => readStorageJson(commandChecklistStateKey, {}) || {});
  const [optimizerConstraints, setOptimizerConstraints] = useState(() => normalizeOptimizerConstraints(DEFAULT_OPTIMIZER_CONSTRAINTS));
  const [shareStatus, setShareStatus] = useState('');
  const [selectedTwinHorizonId, setSelectedTwinHorizonId] = useState('6m');
  const eligibleCategoryCount = useMemo(
    () => activeCategoryInfo.filter((cat) => typeof cat?.check === 'function' && cat.check(answers)).length,
    [activeCategoryInfo, answers]
  );

  useEffect(() => {
    setPlanProgress(readActionPlanProgress(answers));
  }, [answers]);
  useEffect(() => {
    setTaskReminders(readStorageJson(reminderStateKey, {}) || {});
  }, [reminderStateKey]);
  useEffect(() => {
    setCommandChecklistState(readStorageJson(commandChecklistStateKey, {}) || {});
  }, [commandChecklistStateKey]);
  useEffect(() => {
    const persisted = readStorageJson(optimizerConstraintKey, DEFAULT_OPTIMIZER_CONSTRAINTS);
    setOptimizerConstraints(normalizeOptimizerConstraints(persisted));
  }, [optimizerConstraintKey]);
  useEffect(() => {
    const refresh = () => setRuntimeFlags(readRuntimeFlags());
    window.addEventListener('crs-runtime-flags-updated', refresh);
    return () => window.removeEventListener('crs-runtime-flags-updated', refresh);
  }, []);
  useEffect(() => {
    setPricingExperiment(getExperimentAssignment('pricing_layout_v1', { autoTrack: true }));
  }, []);
  const strategicInput = useMemo(() => ({
    answers,
    result,
    suggestions,
    averageCutoff,
    activeDraws,
    provinces,
    progress: planProgress,
    enableAdvancedForecasting: runtimeFlags.enableAdvancedForecasting,
    eligibleCategoryCount,
    optimizerConstraints,
  }), [activeDraws, answers, averageCutoff, eligibleCategoryCount, optimizerConstraints, planProgress, provinces, result, runtimeFlags.enableAdvancedForecasting, suggestions]);
  useEffect(() => {
    let cancelled = false;
    const applySyncFallback = () => {
      if (cancelled) return;
      setComputedInsights(computeStrategicInsights(strategicInput));
    };

    if (typeof Worker === 'undefined') {
      applySyncFallback();
      return () => {
        cancelled = true;
      };
    }

    try {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('../workers/strategy.worker.js', import.meta.url), { type: 'module' });
      }
      const worker = workerRef.current;
      const requestId = (workerRequestIdRef.current += 1);
      const handleMessage = (event) => {
        const message = event?.data || {};
        if (cancelled || message.id !== requestId) return;
        if (message.status === 'ok' && message.data) {
          setComputedInsights(message.data);
          return;
        }
        applySyncFallback();
      };
      const handleError = () => {
        if (cancelled) return;
        applySyncFallback();
      };
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.postMessage({ id: requestId, input: strategicInput });
      return () => {
        cancelled = true;
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
      };
    } catch {
      applySyncFallback();
      return () => {
        cancelled = true;
      };
    }
  }, [strategicInput]);
  useEffect(() => () => {
    workerRef.current?.terminate?.();
    workerRef.current = null;
  }, []);

  const strategyFallback = useMemo(() => ({
    score: Number(result?.total) || 0,
    cutoff: Number(averageCutoff) || 0,
    gap: Math.max((Number(averageCutoff) || 0) - (Number(result?.total) || 0), 0),
    ranked: [],
    top: null,
    nextBest: null,
    bottlenecks: [],
    assumptions: [],
    globalRiskFlags: [],
    overallConfidence: 0,
    confidenceBand: 'Low',
    profileSignals: { profileComplexity: 0, minLanguageClb: 0, languageHeadroom: 0 },
    guidanceSummary: 'Preparing strategic insights...',
  }), [averageCutoff, result?.total]);
  const actionPlanFallback = useMemo(() => ({
    tasks: [],
    milestones: [],
    completedCount: 0,
    totalCount: 0,
    completionPct: 0,
    nextBestTask: null,
    completionGuidance: 'Preparing action plan...',
    calendar: { reviewDates: [] },
  }), []);
  const strategy = useMemo(
    () => computedInsights?.strategy || strategyFallback,
    [computedInsights?.strategy, strategyFallback]
  );
  const actionPlan = useMemo(
    () => computedInsights?.actionPlan || actionPlanFallback,
    [actionPlanFallback, computedInsights?.actionPlan]
  );
  const forecast = computedInsights?.forecast || null;
  const digitalTwin = computedInsights?.digitalTwin || null;
  const opportunityRadar = computedInsights?.opportunityRadar || null;
  const commandCenter = computedInsights?.commandCenter || null;
  const copilot = computedInsights?.copilot || null;
  const collaboration = computedInsights?.collaboration || null;
  const communityBenchmarks = computedInsights?.communityBenchmarks || null;
  const recommendedTwinHorizonId = digitalTwin?.recommendedHorizonId || '';
  const digitalTwinHorizons = useMemo(
    () => (Array.isArray(digitalTwin?.horizons) ? digitalTwin.horizons : []),
    [digitalTwin?.horizons]
  );
  const selectedTwinHorizon = useMemo(
    () => digitalTwinHorizons.find((horizon) => horizon.id === selectedTwinHorizonId) || digitalTwinHorizons[0] || null,
    [digitalTwinHorizons, selectedTwinHorizonId]
  );
  const completedCount = actionPlan.completedCount || 0;
  const totalCount = actionPlan.totalCount || actionPlan.tasks.length;
  const completionPct = actionPlan.completionPct || 0;
  const commandChecklistItems = useMemo(
    () => (commandCenter?.checklist || []).map((item) => {
      const userMarkedDone = !!commandChecklistState[item.id];
      return {
        ...item,
        userMarkedDone,
        effectiveStatus: userMarkedDone ? 'ready' : item.status,
      };
    }),
    [commandCenter?.checklist, commandChecklistState]
  );
  const commandChecklistReadyCount = commandChecklistItems.filter((item) => item.effectiveStatus === 'ready').length;
  useEffect(() => {
    if (!computedInsights?.strategy) return;
    const previous = readStorageJson(lastVisitSnapshotKey, null);
    const current = {
      score: Number(strategy.score) || 0,
      cutoff: Number(strategy.cutoff) || 0,
      confidence: Number(strategy.overallConfidence) || 0,
      updatedAt: new Date().toISOString(),
    };
    if (previous && Number.isFinite(Number(previous.score))) {
      setChangeSummary({
        scoreDelta: current.score - (Number(previous.score) || 0),
        cutoffDelta: current.cutoff - (Number(previous.cutoff) || 0),
        confidenceDelta: current.confidence - (Number(previous.confidence) || 0),
        previousUpdatedAt: previous.updatedAt || '',
      });
    } else {
      setChangeSummary(null);
    }
    writeStorageJson(lastVisitSnapshotKey, current);
  }, [computedInsights?.strategy, lastVisitSnapshotKey, strategy.cutoff, strategy.overallConfidence, strategy.score]);
  useEffect(() => {
    if (!recommendedTwinHorizonId) return;
    if (recommendedTwinHorizonId) {
      setSelectedTwinHorizonId(recommendedTwinHorizonId);
    }
  }, [recommendedTwinHorizonId]);
  useEffect(() => {
    if (!digitalTwin) return;
    const eventKey = `${digitalTwin.generatedAt || ''}:${digitalTwin.recommendedHorizonId || ''}:${digitalTwinHorizons.length}`;
    if (!eventKey || eventKey === digitalTwinEventRef.current) return;
    digitalTwinEventRef.current = eventKey;
    trackEvent('digital_twin_rendered', {
      recommended_horizon_id: digitalTwin.recommendedHorizonId || 'none',
      horizon_count: digitalTwinHorizons.length,
      confidence_band: digitalTwin.confidenceBand || 'unknown',
    });
  }, [digitalTwin, digitalTwinHorizons.length]);
  useEffect(() => {
    if (!opportunityRadar) return;
    trackEvent('opportunity_radar_rendered', {
      signal_count: opportunityRadar.signals?.length || 0,
      readiness_index: Number(opportunityRadar.readinessIndex || 0),
      recommended_window: opportunityRadar.recommendedWindow || 'unknown',
    });
  }, [opportunityRadar]);
  useEffect(() => {
    if (!commandCenter) return;
    trackEvent('application_command_center_rendered', {
      readiness_score: Number(commandCenter.readinessScore || 0),
      blocker_count: commandCenter.blockers?.length || 0,
      checklist_count: commandCenter.checklist?.length || 0,
    });
  }, [commandCenter]);
  useEffect(() => {
    if (!copilot) return;
    trackEvent('grounded_copilot_rendered', {
      card_count: copilot.cards?.length || 0,
      grounding_mode: copilot.groundingMode || 'unknown',
    });
  }, [copilot]);
  useEffect(() => {
    if (!collaboration) return;
    trackEvent('consultant_collaboration_workspace_rendered', {
      readiness_score: Number(collaboration.workspaceReadiness || 0),
      package_status: collaboration.packageStatus || 'unknown',
    });
  }, [collaboration]);
  useEffect(() => {
    if (!communityBenchmarks) return;
    trackEvent('community_benchmark_rendered', {
      percentile: Number(communityBenchmarks.percentile || 0),
      benchmark_band: communityBenchmarks.benchmarkBand || 'unknown',
    });
  }, [communityBenchmarks]);

  const topFactors = [
    { label: 'Core Human Capital', value: result?.breakdown?.coreHumanCapital || 0 },
    { label: 'Skill Transferability', value: result?.breakdown?.skillTransferability || 0 },
    { label: 'Additional Points', value: result?.breakdown?.additionalPoints || 0 },
    { label: 'Spouse Factors', value: result?.breakdown?.spouseFactors || 0 },
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  const confidenceV2 = useMemo(() => {
    const drawDataScore = drawFreshness?.tier === 'fresh'
      ? 92
      : drawFreshness?.tier === 'recent'
        ? 74
        : 48;
    const categoryDataScore = categoryFreshness?.tier === 'fresh'
      ? 88
      : categoryFreshness?.tier === 'recent'
        ? 72
        : 45;
    const dataScore = Math.round((drawDataScore + categoryDataScore) / 2);
    const executionScore = Math.max(Math.min(Math.round((completionPct * 0.9) + 10), 100), 0);
    const highRiskCount = (strategy.globalRiskFlags || []).filter((flag) => flag.severity === 'high').length;
    const mediumRiskCount = (strategy.globalRiskFlags || []).filter((flag) => flag.severity === 'medium').length;
    const riskPenalty = Math.min((highRiskCount * 12) + (mediumRiskCount * 6), 36);
    const forecastScore = Number(forecast?.confidenceScore || strategy.overallConfidence || 0);
    const total = Math.max(Math.min(Math.round(
      (Number(strategy.overallConfidence || 0) * 0.35)
      + (dataScore * 0.25)
      + (executionScore * 0.2)
      + (forecastScore * 0.2)
      - riskPenalty
    ), 100), 0);
    return {
      total,
      dataScore,
      executionScore,
      forecastScore,
      riskPenalty,
    };
  }, [categoryFreshness?.tier, completionPct, drawFreshness?.tier, forecast?.confidenceScore, strategy.globalRiskFlags, strategy.overallConfidence]);
  const queuedTasks = useMemo(
    () => [...(actionPlan.tasks || [])]
      .filter((task) => !planProgress[task.id])
      .sort((a, b) => {
        const priorityRank = (a.priority === 'High' ? 0 : a.priority === 'Medium' ? 1 : 2)
          - (b.priority === 'High' ? 0 : b.priority === 'Medium' ? 1 : 2);
        if (priorityRank !== 0) return priorityRank;
        return (a.dayFrom || 0) - (b.dayFrom || 0);
      })
      .slice(0, 4),
    [actionPlan.tasks, planProgress]
  );
  const profileTrendPoints = (() => {
    const saved = listSavedProfiles()
      .slice(0, 8)
      .map((profile) => ({
        id: profile.id,
        label: profile.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : 'Saved',
        score: Number(profile.score) || 0,
        current: false,
      }));
    const current = {
      id: 'current-profile',
      label: 'Now',
      score: Number(result?.total) || 0,
      current: true,
    };
    return [...saved, current]
      .filter((point) => point.score > 0)
      .slice(-9);
  })();
  const handoffPayload = useMemo(() => buildConsultantHandoffPayload({
    answers,
    result,
    strategy,
    forecast,
    actionPlan,
    opportunityRadar,
    commandCenter,
    copilot,
    collaboration,
    communityBenchmarks,
    drawData: {
      ...activeDraws,
      source: drawFreshness?.tier || 'unknown',
    },
    categoryInfo: activeCategoryInfo,
  }), [
    actionPlan,
    activeCategoryInfo,
    activeDraws,
    answers,
    collaboration,
    commandCenter,
    communityBenchmarks,
    copilot,
    drawFreshness?.tier,
    forecast,
    opportunityRadar,
    result,
    strategy,
  ]);
  const trendMaxScore = Math.max(...profileTrendPoints.map((point) => point.score || 0), 600);

  const pricingRecommendation = useMemo(() => {
    const hasHighRisk = strategy.globalRiskFlags?.some((flag) => flag.severity === 'high');
    const complexProfile = (strategy.profileSignals?.profileComplexity || 0) >= 70;
    const largeGap = (strategy.gap || 0) > 45;
    const needsGuidance = hasHighRisk || (strategy.top?.effort === 'Hard') || (strategy.gap || 0) > 22;

    if (largeGap && complexProfile) {
      return {
        tier: 'pro',
        badge: 'Priority recommendation',
        rationale: 'Your profile looks high-complexity with a wider gap. Pro tracking helps reduce execution risk with tighter follow-through.',
      };
    }
    if (needsGuidance) {
      return {
        tier: 'pro',
        badge: 'Recommended now',
        rationale: 'You likely benefit from structured tracking and guided execution while closing your gap.',
      };
    }
    return {
      tier: 'free',
      badge: 'Sufficient for now',
      rationale: 'Your current profile can continue with free tools while monitoring draw changes.',
    };
  }, [strategy.gap, strategy.globalRiskFlags, strategy.profileSignals?.profileComplexity, strategy.top?.effort]);

  const riskLevelLabel = strategy.globalRiskFlags?.some((flag) => flag.severity === 'high')
    ? 'Elevated'
    : strategy.globalRiskFlags?.some((flag) => flag.severity === 'medium')
      ? 'Moderate'
      : 'Low';
  const activeOptimizerConstraints = strategy.optimizerConstraints || optimizerConstraints;
  const isProFirstVariant = pricingExperiment.variant === 'pro_first';
  const proCtaLabel = isProFirstVariant
    ? t('strategy.pricing.proCtaExperiment', 'Start Pro planning')
    : t('strategy.pricing.proCtaDefault', 'Go to Pro setup');

  const jumpFromAction = (sectionId, cta) => {
    onJumpToSection(sectionId);
    trackEvent('action_center_cta_clicked', {
      cta,
      target_section: sectionId,
      confidence_band: strategy.confidenceBand,
      experiment_key: pricingExperiment.experimentKey,
      experiment_variant: pricingExperiment.variant,
    });
  };

  const openAccountFromAction = () => {
    onOpenAccount?.();
    trackEvent('action_center_cta_clicked', {
      cta: 'manage_account',
      target_section: 'account_modal',
      confidence_band: strategy.confidenceBand,
      experiment_key: pricingExperiment.experimentKey,
      experiment_variant: pricingExperiment.variant,
    });
  };
  const handleExportHandoff = () => {
    const ok = downloadConsultantHandoff(handoffPayload);
    setShareStatus(ok ? 'Handoff file downloaded.' : 'Could not generate handoff file.');
    trackEvent('consultant_handoff_exported', {
      status: ok ? 'ok' : 'failed',
      score: Number(result?.total) || 0,
      confidence_band: strategy.confidenceBand,
      experiment_key: pricingExperiment.experimentKey,
      experiment_variant: pricingExperiment.variant,
    });
    trackExperimentGoal('pricing_layout_v1', 'handoff_export', {
      status: ok ? 'ok' : 'failed',
    });
  };
  const handleCopyHandoffLink = async () => {
    const shareUrl = buildConsultantHandoffShareUrl(handoffPayload);
    if (!shareUrl) {
      setShareStatus('Could not generate share link.');
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus('Share link copied to clipboard.');
      trackEvent('consultant_handoff_share_link', {
        status: 'copied',
        url_length: shareUrl.length,
        confidence_band: strategy.confidenceBand,
      });
    } catch {
      setShareStatus('Clipboard blocked. Copy this link manually from browser URL after opening it.');
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
      trackEvent('consultant_handoff_share_link', {
        status: 'fallback_opened',
        url_length: shareUrl.length,
        confidence_band: strategy.confidenceBand,
      });
    }
  };
  const updateOptimizerConstraint = (field, rawValue) => {
    setOptimizerConstraints((prev) => {
      const parsedValue = field === 'relocationPreference' ? rawValue : Number(rawValue);
      const next = normalizeOptimizerConstraints({
        ...prev,
        [field]: parsedValue,
      });
      writeStorageJson(optimizerConstraintKey, next);
      trackEvent('optimizer_constraints_updated', {
        field,
        budget_cad: next.budgetCad,
        weekly_hours: next.weeklyHours,
        exam_attempts: next.examAttempts,
        relocation_preference: next.relocationPreference,
      });
      return next;
    });
  };
  const toggleCommandChecklistItem = (itemId) => {
    setCommandChecklistState((prev) => {
      const next = {
        ...prev,
        [itemId]: !prev[itemId],
      };
      writeStorageJson(commandChecklistStateKey, next);
      trackEvent('application_command_checklist_toggled', {
        item_id: itemId,
        marked_done: !!next[itemId],
      });
      return next;
    });
  };
  const resetOptimizerConstraints = () => {
    const next = normalizeOptimizerConstraints(DEFAULT_OPTIMIZER_CONSTRAINTS);
    setOptimizerConstraints(next);
    writeStorageJson(optimizerConstraintKey, next);
    trackEvent('optimizer_constraints_reset', {
      budget_cad: next.budgetCad,
      weekly_hours: next.weeklyHours,
      exam_attempts: next.examAttempts,
      relocation_preference: next.relocationPreference,
    });
  };

  const toggleTask = (taskId) => {
    const next = {
      ...planProgress,
      [taskId]: !planProgress[taskId],
    };
    setPlanProgress(next);
    saveActionPlanProgress(answers, next);
    const nextCompletedCount = actionPlan.tasks.filter((task) => !!next[task.id]).length;
    const nextCompletionPct = actionPlan.tasks.length > 0
      ? Math.round((nextCompletedCount / actionPlan.tasks.length) * 100)
      : 0;
    trackEvent('action_plan_task_toggled', {
      task_id: taskId,
      completed: !!next[taskId],
      completion_pct: nextCompletionPct,
      completed_count: nextCompletedCount,
      total_count: actionPlan.tasks.length,
      next_task_id: actionPlan.nextBestTask?.id || 'none',
    });
  };
  const toggleTaskReminder = (taskId) => {
    setTaskReminders((prev) => {
      const next = {
        ...prev,
        [taskId]: !prev[taskId],
      };
      writeStorageJson(reminderStateKey, next);
      trackEvent('action_queue_reminder_toggled', {
        task_id: taskId,
        enabled: !!next[taskId],
      });
      return next;
    });
  };

  return (
    <>
      <section className="card strategic-action-center" id="section-action-center">
        <h3>{t('strategy.actionCenter.title', 'Action Center')}</h3>
        <p className="cat-intro">{t('strategy.actionCenter.subtitle', 'Use this control center to execute the highest-impact moves with clear priority and risk visibility.')}</p>
        <div className="strategic-action-grid">
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-save', 'save_profile')}>
            {t('strategy.actionCenter.saveProfile', 'Save profile')}
          </button>
          {runtimeFlags.enableAdvancedForecasting && (
            <button type="button" className="action-btn" onClick={() => jumpFromAction('section-forecast', 'open_forecast')}>
              {t('strategy.actionCenter.openForecast', 'Open forecast')}
            </button>
          )}
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-digital-twin', 'open_digital_twin')}>
            {t('strategy.actionCenter.openDigitalTwin', 'Open digital twin')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-optimizer', 'open_optimizer')}>
            {t('strategy.actionCenter.openOptimizer', 'Open strategy optimizer')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-opportunity-radar', 'open_opportunity_radar')}>
            {t('strategy.actionCenter.openOpportunityRadar', 'Open opportunity radar')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-command-center', 'open_application_command_center')}>
            {t('strategy.actionCenter.openCommandCenter', 'Open application command center')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-copilot', 'open_grounded_copilot')}>
            {t('strategy.actionCenter.openCopilot', 'Open grounded copilot')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-collaboration', 'open_collaboration_workspace')}>
            {t('strategy.actionCenter.openCollaboration', 'Open collaboration workspace')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-community-benchmarks', 'open_community_benchmarks')}>
            {t('strategy.actionCenter.openBenchmarks', 'Open community benchmarks')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-90-day-plan', 'open_90_day_plan')}>
            {t('strategy.actionCenter.openPlan', 'Open 90-day plan')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-pricing', 'compare_plans')}>
            {t('strategy.actionCenter.comparePlans', 'Compare plans')}
          </button>
          <button type="button" className="action-btn" onClick={handleExportHandoff}>
            {t('strategy.actionCenter.exportHandoff', 'Export consultant handoff')}
          </button>
          <button type="button" className="action-btn" onClick={handleCopyHandoffLink}>
            {t('strategy.actionCenter.shareHandoff', 'Copy handoff share link')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-action-queue', 'open_action_queue')}>
            {t('strategy.actionCenter.actionQueue', 'Smart action queue')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-coach', 'expert_strategy_coach')}>
            {t('strategy.actionCenter.expertCoach', 'Expert strategy coach')}
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-profile-trend', 'profile_trend_timeline')}>
            {t('strategy.actionCenter.profileTrend', 'Profile trend timeline')}
          </button>
          <button type="button" className="action-btn" onClick={openAccountFromAction}>
            {t('strategy.actionCenter.manageAccount', 'Manage account')}
          </button>
        </div>
        <div className="strategic-action-status">
          <span>{t('strategy.actionCenter.profileStatus', 'Profile save status')}: <strong>{saveStatus || t('strategy.actionCenter.notSavedYet', 'Not saved yet')}</strong></span>
          <span>{t('strategy.actionCenter.planCompletion', '90-day completion')}: <strong>{completionPct}%</strong> ({completedCount}/{totalCount})</span>
          <span>{t('strategy.actionCenter.confidence', 'Confidence')}: <strong>{strategy.confidenceBand}</strong> ({strategy.overallConfidence} / 100)</span>
          <span>{t('strategy.actionCenter.riskLevel', 'Risk level')}: <strong>{riskLevelLabel}</strong></span>
          {!!commandCenter && <span>Command readiness: <strong>{commandCenter.readinessScore}/100</strong></span>}
          {!!opportunityRadar && <span>Radar readiness: <strong>{opportunityRadar.readinessIndex}/100</strong></span>}
          {!!communityBenchmarks && <span>Benchmark percentile: <strong>P{communityBenchmarks.percentile}</strong></span>}
        </div>
        {shareStatus && <p className="save-note">{shareStatus}</p>}
        {actionPlan.nextBestTask && (
          <div className="next-task-callout">
            <div>
              <strong>{t('strategy.actionCenter.nextTask', 'Next best task')}: {actionPlan.nextBestTask.title}</strong>
              <p>{actionPlan.nextBestTask.dateWindow} · {actionPlan.nextBestTask.weekWindow}</p>
              <small>{actionPlan.nextBestTask.successMetric}</small>
            </div>
            <button
              type="button"
              className="action-btn auth-btn-primary"
              onClick={() => jumpFromAction('section-90-day-plan', 'next_best_task')}
            >
              {t('strategy.actionCenter.startTask', 'Start task')}
            </button>
          </div>
        )}
      </section>
      {changeSummary && (
        <section className="card change-since-last-card">
          <h3>{t('strategy.changes.title', 'Since your last visit')}</h3>
          <div className="strategic-action-status">
            <span>Score delta: <strong>{changeSummary.scoreDelta > 0 ? '+' : ''}{changeSummary.scoreDelta}</strong></span>
            <span>Cutoff delta: <strong>{changeSummary.cutoffDelta > 0 ? '+' : ''}{changeSummary.cutoffDelta}</strong></span>
            <span>Confidence delta: <strong>{changeSummary.confidenceDelta > 0 ? '+' : ''}{changeSummary.confidenceDelta}</strong></span>
          </div>
          {changeSummary.previousUpdatedAt && (
            <p className="save-note">
              Previous snapshot: {new Date(changeSummary.previousUpdatedAt).toLocaleString()}
            </p>
          )}
        </section>
      )}
      <section className="card strategic-action-queue" id="section-action-queue">
        <h3>{t('strategy.queue.title', 'Smart action queue')}</h3>
        <p className="cat-intro">
          {t('strategy.queue.subtitle', 'Prioritized next actions ordered by urgency and impact, with reminder toggles for follow-through.')}
        </p>
        {!queuedTasks.length && (
          <p className="save-note">All queued tasks are complete. Nice work.</p>
        )}
        {!!queuedTasks.length && (
          <ul className="plan-task-list">
            {queuedTasks.map((task) => (
              <li key={`queue-${task.id}`}>
                <button
                  type="button"
                  className="plan-task-toggle"
                  aria-label={`Toggle reminder for ${task.title}`}
                  onClick={() => toggleTaskReminder(task.id)}
                >
                  {taskReminders[task.id] ? '🔔' : '🔕'}
                </button>
                <div>
                  <div className="plan-task-head">
                    <strong>{task.title}</strong>
                    <PriorityBadge value={task.priority} />
                  </div>
                  <p>{task.rationale}</p>
                  <div className="optimizer-meta">
                    <span>{task.dateWindow}</span>
                    <span>{task.weekWindow}</span>
                    <span>Impact +{task.impact}</span>
                  </div>
                  <small className="plan-task-metric">
                    Reminder: {taskReminders[task.id] ? 'Enabled' : 'Disabled'}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {opportunityRadar && (
        <section className="card strategic-opportunity-radar" id="section-opportunity-radar">
          <h3>{t('strategy.radar.title', 'Opportunity Radar')}</h3>
          <p className="cat-intro">{opportunityRadar.summary}</p>
          <div className="strategic-action-status">
            <span>Readiness index: <strong>{opportunityRadar.readinessIndex}/100</strong></span>
            <span>Recommended window: <strong>{opportunityRadar.recommendedWindow || '—'}</strong></span>
            <span>Signals detected: <strong>{opportunityRadar.signals?.length || 0}</strong></span>
          </div>
          {!!opportunityRadar.alertTriggers?.length && (
            <ul className="opportunity-trigger-list">
              {opportunityRadar.alertTriggers.map((trigger) => (
                <li key={trigger.id}>
                  <strong>{trigger.title}</strong>
                  <span>{trigger.trigger}</span>
                  <small>{trigger.windowLabel}</small>
                </li>
              ))}
            </ul>
          )}
          {!!opportunityRadar.signals?.length && (
            <div className="optimizer-options">
              {opportunityRadar.signals.map((signal, idx) => (
                <article key={signal.id} className="optimizer-option">
                  <div className="optimizer-option-head">
                    <strong>{idx + 1}. {signal.title}</strong>
                    <span className="optimizer-score">{signal.opportunityScore}/100</span>
                  </div>
                  <p>{signal.whyNow}</p>
                  <div className="optimizer-meta">
                    <span>Lane: {signal.lane}</span>
                    <span>Window: {signal.windowLabel}</span>
                    <span>Gap to trigger: {signal.scoreDeltaNeeded}</span>
                    <span>Confidence: {signal.confidenceBand}</span>
                    <span>Risk: {signal.riskLevel}</span>
                  </div>
                  <small className="plan-task-metric">Next action: {signal.nextAction}</small>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {commandCenter && (
        <section className="card strategic-command-center" id="section-command-center">
          <h3>{t('strategy.command.title', 'Application Command Center')}</h3>
          <p className="cat-intro">{commandCenter.summary}</p>
          <div className="strategic-action-status">
            <span>Readiness: <strong>{commandCenter.readinessScore}/100 ({commandCenter.readinessBand})</strong></span>
            <span>Checklist: <strong>{commandChecklistReadyCount}/{commandChecklistItems.length}</strong></span>
            <span>Profile completeness: <strong>{commandCenter.profileCompleteness}%</strong></span>
          </div>
          {!!commandCenter.blockers?.length && (
            <ul className="risk-indicator-list">
              {commandCenter.blockers.map((blocker) => (
                <li key={blocker.id}>
                  <div>
                    <strong>{blocker.label}</strong>
                    <small>{blocker.detail}</small>
                  </div>
                  <RiskBadge value="high" />
                </li>
              ))}
            </ul>
          )}
          {!!commandChecklistItems.length && (
            <ul className="command-center-list">
              {commandChecklistItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="plan-task-toggle"
                    aria-label={`Toggle ${item.title}`}
                    onClick={() => toggleCommandChecklistItem(item.id)}
                  >
                    {item.userMarkedDone ? '✓' : '○'}
                  </button>
                  <div>
                    <div className="plan-task-head">
                      <strong>{item.title}</strong>
                      <span className={`command-status-badge ${commandStatusClass(item.effectiveStatus)}`}>{item.effectiveStatus.replace('_', ' ')}</span>
                    </div>
                    <p>{item.evidence}</p>
                    <div className="optimizer-meta">
                      <span>Owner: {item.owner}</span>
                      <span>Due: {item.dueWindow}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {copilot && (
        <section className="card strategic-copilot" id="section-copilot">
          <h3>{t('strategy.copilot.title', 'AI Strategy Copilot (Grounded)')}</h3>
          <p className="cat-intro">
            Grounding mode: <strong>{copilot.groundingMode}</strong>. Responses are generated from your active profile and forecast context.
          </p>
          {!!copilot.cards?.length && (
            <div className="copilot-card-grid">
              {copilot.cards.map((card) => (
                <article key={card.id} className="copilot-card">
                  <h4>{card.prompt}</h4>
                  <p>{card.response}</p>
                  <div className="optimizer-meta">
                    <span>Confidence: {card.confidenceBand}</span>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => jumpFromAction(card.quickAction || 'section-action-center', `copilot_jump_${card.id}`)}
                    >
                      Open related section
                    </button>
                  </div>
                  <ul className="copilot-evidence-list">
                    {(card.evidence || []).map((line) => (
                      <li key={`${card.id}-${line}`}>{line}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {collaboration && (
        <section className="card strategic-collaboration" id="section-collaboration">
          <h3>{t('strategy.collaboration.title', 'Consultant Collaboration Workspace')}</h3>
          <p className="cat-intro">
            Workspace <strong>{collaboration.workspaceId}</strong> · Status <strong>{collaboration.packageStatus}</strong>
          </p>
          <div className="strategic-action-status">
            <span>Workspace readiness: <strong>{collaboration.workspaceReadiness}/100</strong></span>
            <span>Checklist items: <strong>{collaboration.reviewChecklist?.length || 0}</strong></span>
          </div>
          {!!collaboration.reviewChecklist?.length && (
            <ul className="collaboration-checklist">
              {collaboration.reviewChecklist.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className={`command-status-badge ${commandStatusClass(item.status)}`}>{item.status.replace('_', ' ')}</span>
                </li>
              ))}
            </ul>
          )}
          {!!collaboration.collaborationNotes?.length && (
            <ul className="copilot-evidence-list">
              {collaboration.collaborationNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <div className="strategic-action-grid">
            <button type="button" className="action-btn" onClick={handleExportHandoff}>
              Export collaboration package
            </button>
            <button type="button" className="action-btn" onClick={handleCopyHandoffLink}>
              Copy collaboration share link
            </button>
          </div>
        </section>
      )}
      {communityBenchmarks && (
        <section className="card strategic-community-benchmarks" id="section-community-benchmarks">
          <h3>{t('strategy.community.title', 'Community Benchmark Intelligence')}</h3>
          <p className="cat-intro">{communityBenchmarks.summary}</p>
          <div className="strategic-action-status">
            <span>Percentile: <strong>P{communityBenchmarks.percentile}</strong></span>
            <span>Band: <strong>{communityBenchmarks.benchmarkBand}</strong></span>
            <span>Cohort: <strong>{communityBenchmarks.cohort?.ageBand || '—'} · {communityBenchmarks.cohort?.educationTier || '—'}</strong></span>
          </div>
          <ul className="community-benchmark-list">
            {(communityBenchmarks.comparison || []).map((item) => (
              <li key={item.id} className={item.isUser ? 'current' : ''}>
                <span>{item.label}</span>
                <strong>{item.score}</strong>
              </li>
            ))}
          </ul>
          {!!communityBenchmarks.leverageSignals?.length && (
            <div className="optimizer-meta">
              {communityBenchmarks.leverageSignals.map((signal) => (
                <span key={signal.id}>{signal.label}: {signal.headroom}% headroom</span>
              ))}
            </div>
          )}
        </section>
      )}
      {digitalTwin && (
        <section className="card strategic-digital-twin" id="section-digital-twin">
          <h3>{t('strategy.digitalTwin.title', 'Invitation probability digital twin')}</h3>
          <p className="cat-intro">{digitalTwin.summary}</p>
          <div className="strategic-action-status">
            <span>{t('strategy.digitalTwin.recommended', 'Recommended horizon')}: <strong>{digitalTwin.recommendedHorizonId?.toUpperCase?.() || '—'}</strong></span>
            <span>{t('strategy.digitalTwin.confidenceBand', 'Model confidence')}: <strong>{digitalTwin.confidenceBand || 'Unknown'}</strong></span>
            <span>{t('strategy.digitalTwin.topLane', 'Top lane')}: <strong>{digitalTwin.topLane || '—'}</strong></span>
          </div>
          <div className="digital-twin-horizon-switch">
            {digitalTwinHorizons.map((horizon) => (
              <button
                key={horizon.id}
                type="button"
                className={`action-btn ${selectedTwinHorizon?.id === horizon.id ? 'auth-btn-primary' : ''}`.trim()}
                onClick={() => {
                  setSelectedTwinHorizonId(horizon.id);
                  trackEvent('digital_twin_horizon_selected', {
                    horizon_id: horizon.id,
                    chance_band: horizon.chanceBand,
                    base_probability_pct: horizon.baseProbabilityPct,
                  });
                }}
              >
                {horizon.label}
              </button>
            ))}
          </div>
          {selectedTwinHorizon && (
            <div className="digital-twin-scenario-grid">
              <article className="digital-twin-scenario">
                <h4>Base scenario</h4>
                <strong>{selectedTwinHorizon.baseProbabilityPct}%</strong>
                <p>Projected cutoff: {selectedTwinHorizon.projectedCutoff}</p>
                <p>Expected score: {selectedTwinHorizon.expectedScore} ({selectedTwinHorizon.scoreGap >= 0 ? '+' : ''}{selectedTwinHorizon.scoreGap} gap)</p>
              </article>
              <article className="digital-twin-scenario">
                <h4>Best-case execution</h4>
                <strong>{selectedTwinHorizon.bestProbabilityPct}%</strong>
                <p>Assumes faster lane execution and lower draw variance.</p>
                <p>Expected gain by horizon: +{selectedTwinHorizon.expectedGain} pts</p>
              </article>
              <article className="digital-twin-scenario">
                <h4>Downside scenario</h4>
                <strong>{selectedTwinHorizon.worstProbabilityPct}%</strong>
                <p>Assumes execution slippage and higher draw volatility.</p>
                <p>Confidence interval: {selectedTwinHorizon.confidenceInterval.lowPct}%–{selectedTwinHorizon.confidenceInterval.highPct}%</p>
              </article>
            </div>
          )}
          {!!digitalTwin.keyDrivers?.length && (
            <ul className="digital-twin-driver-list">
              {digitalTwin.keyDrivers.map((driver) => (
                <li key={driver.id}>
                  <span>{driver.label}</span>
                  <strong>{driver.value}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {runtimeFlags.enableAdvancedForecasting && forecast && (
        <section className="card strategic-forecast" id="section-forecast">
          <h3>{t('strategy.forecast.title', 'Forecast Outlook')}</h3>
          <p className="cat-intro">{t('strategy.forecast.subtitle', 'Projection based on recent draw cutoffs, volatility, and freshness of available data.')}</p>
          <div className="strategic-action-status">
            <span>{t('strategy.forecast.trend', 'Trend')}: <strong>{forecast.trendLabel}</strong></span>
            <span>{t('strategy.forecast.confidence', 'Forecast confidence')}: <strong>{forecast.confidenceBand}</strong> ({forecast.confidenceScore}/100)</span>
            <span>{t('strategy.forecast.sampleSize', 'Sample size')}: <strong>{forecast.sampleSize}</strong></span>
            <span>{t('strategy.forecast.likelihood', 'Invitation likelihood')}: <strong>{forecast.invitationLikelihood}</strong></span>
          </div>
          <div className="optimizer-top-callout">
            <div className="optimizer-option-head">
              <strong>{t('strategy.forecast.nextCutoff', 'Projected next cutoff')}: {forecast.projectedNextCutoff}</strong>
              <span className="optimizer-score">{t('strategy.forecast.threeDrawAvg', '3-draw avg')} {forecast.projectedThreeDrawAvg}</span>
            </div>
            <p>
              {t('strategy.forecast.latestObserved', 'Latest observed cutoff')}: {forecast.latestObservedCutoff}
              {' · '}
              {t('strategy.forecast.gapToProjection', 'Gap to projection')}: {forecast.userGapToNext > 0 ? '+' : ''}{forecast.userGapToNext}
            </p>
            <div className="optimizer-meta">
              <span>{t('strategy.forecast.projectedSequence', 'Projected sequence')}: {forecast.projectedDraws.join(' → ')}</span>
              <span>{t('strategy.forecast.volatility', 'Volatility')}: {forecast.volatility.toFixed(2)}</span>
              <span>{t('strategy.forecast.slope', 'Slope/draw')}: {forecast.slopePerDraw}</span>
            </div>
          </div>
        </section>
      )}

      <section className="card strategic-optimizer" id="section-optimizer">
        <h3>{t('strategy.optimizer.title', 'Strategy Optimizer')}</h3>
        <p className="cat-intro">{strategy.guidanceSummary}</p>
        <div className="optimizer-constraint-panel">
          <div className="optimizer-constraint-head">
            <h4>{t('strategy.optimizer.constraintsTitle', 'Constraint inputs')}</h4>
            <button type="button" className="action-btn" onClick={resetOptimizerConstraints}>
              {t('strategy.optimizer.resetConstraints', 'Reset')}
            </button>
          </div>
          <div className="wi-grid">
            <label className="wi-field">
              <span>{t('strategy.optimizer.budgetCad', 'Available budget (CAD)')}</span>
              <select
                value={activeOptimizerConstraints.budgetCad}
                onChange={(event) => updateOptimizerConstraint('budgetCad', event.target.value)}
              >
                {[1200, 2000, 3500, 5000, 8000, 12000].map((value) => (
                  <option key={`budget-${value}`} value={value}>{value.toLocaleString()}</option>
                ))}
              </select>
            </label>
            <label className="wi-field">
              <span>{t('strategy.optimizer.weeklyHours', 'Weekly execution hours')}</span>
              <select
                value={activeOptimizerConstraints.weeklyHours}
                onChange={(event) => updateOptimizerConstraint('weeklyHours', event.target.value)}
              >
                {[3, 5, 8, 12, 16, 20].map((value) => (
                  <option key={`hours-${value}`} value={value}>{value}h / week</option>
                ))}
              </select>
            </label>
            <label className="wi-field">
              <span>{t('strategy.optimizer.examAttempts', 'Exam retry budget')}</span>
              <select
                value={activeOptimizerConstraints.examAttempts}
                onChange={(event) => updateOptimizerConstraint('examAttempts', event.target.value)}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={`exam-${value}`} value={value}>{value} attempt{value > 1 ? 's' : ''}</option>
                ))}
              </select>
            </label>
            <label className="wi-field">
              <span>{t('strategy.optimizer.relocationPreference', 'Relocation preference')}</span>
              <select
                value={activeOptimizerConstraints.relocationPreference}
                onChange={(event) => updateOptimizerConstraint('relocationPreference', event.target.value)}
              >
                <option value="balanced">Balanced</option>
                <option value="province">Province-focused</option>
                <option value="federal">Federal-focused</option>
              </select>
            </label>
          </div>
          <p className="save-note">
            {t('strategy.optimizer.constraintsHint', 'These constraints re-rank lanes by real-world feasibility, not just raw score gain.')}
          </p>
        </div>
        {strategy.top && (
          <div className="optimizer-top-callout">
            <div className="optimizer-option-head">
              <strong>Top lane: {strategy.top.title}</strong>
              <span className="optimizer-score">Priority {strategy.top.score}/100</span>
            </div>
            <p>{strategy.top.reason}</p>
            <div className="optimizer-meta">
              <span>Estimated gain: +{strategy.top.scoreGain}</span>
              <span>Expected timeline: ~{strategy.top.months} months</span>
              <span>Confidence: {strategy.top.confidence}%</span>
              <span>Constraint fit: {strategy.top.constraintFitScore}/100</span>
              <span>Estimated cost: {Math.round(strategy.top.estimatedCostCad || 0)} CAD</span>
              <span>Weekly load: ~{strategy.top.requiredWeeklyHours || 0}h</span>
              <span>Constraint adj: {strategy.top.constraintAdjustment > 0 ? '+' : ''}{strategy.top.constraintAdjustment || 0}</span>
              <EffortBadge value={strategy.top.effort} />
            </div>
            {!!strategy.top.riskFlags?.length && (
              <ul className="optimizer-risk-list">
                {strategy.top.riskFlags.map((flag) => (
                  <li key={flag.id}>
                    <RiskBadge value={flag.severity} />
                    <span>{flag.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="optimizer-options">
          {strategy.ranked.map((option, idx) => (
            <article key={option.id} className="optimizer-option">
              <div className="optimizer-option-head">
                <strong>{idx + 1}. {option.title}</strong>
                <div className="optimizer-option-end">
                  <span className="optimizer-score">Score {option.score}</span>
                  <EffortBadge value={option.effort} />
                </div>
              </div>
              <p>{option.reason}</p>
              <div className="optimizer-meta">
                <span>Lane: {option.lane}</span>
                <span>+{option.scoreGain} pts</span>
                <span>{option.months} mo</span>
                <span>{option.confidence}% confidence</span>
                <span>Fit {option.constraintFitScore}/100</span>
                <span>Cost {Math.round(option.estimatedCostCad || 0)} CAD</span>
                <span>Load ~{option.requiredWeeklyHours || 0}h/wk</span>
                <span>Adj {option.constraintAdjustment > 0 ? '+' : ''}{option.constraintAdjustment || 0}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card strategic-plan" id="section-90-day-plan">
        <h3>{t('strategy.plan.title', '90-Day Action Plan')}</h3>
        <p className="cat-intro">Execution-focused milestones with calendar windows, measurable outcomes, and fallback controls.</p>
        <p className="plan-guidance">{actionPlan.completionGuidance}</p>
        <div className="plan-review-dates">
          {actionPlan.calendar?.reviewDates?.map((review) => (
            <span key={review.day}>Review D{review.day}: {review.label}</span>
          ))}
        </div>
        <div className="plan-milestones">
          {actionPlan.milestones.map((milestone) => (
            <div key={milestone.label} className="plan-milestone">
              <strong>{milestone.label}</strong>
              <p>{milestone.objective}</p>
              <small>{milestone.dateWindow}</small>
              <small>Expected gain: +{milestone.expectedGain} pts</small>
            </div>
          ))}
        </div>
        <ul className="plan-task-list">
          {actionPlan.tasks.map((task) => {
            const isDone = !!planProgress[task.id];
            const isNext = actionPlan.nextBestTask?.id === task.id && !isDone;
            return (
              <li key={task.id} className={`${isDone ? 'done' : ''} ${isNext ? 'next-task' : ''}`.trim()}>
                <button type="button" className="plan-task-toggle" onClick={() => toggleTask(task.id)} aria-label={`Toggle ${task.title}`}>
                  {isDone ? '✓' : '○'}
                </button>
                <div>
                  <div className="plan-task-head">
                    <strong>{task.title}</strong>
                    <PriorityBadge value={task.priority} />
                  </div>
                  <p>{task.rationale}</p>
                  <div className="optimizer-meta">
                    <span>{task.window}</span>
                    <span>{task.weekWindow}</span>
                    <span>{task.dateWindow}</span>
                    <span>Lane: {task.lane}</span>
                    <span>Impact: +{task.impact} pts</span>
                  </div>
                  <small className="plan-task-metric">Success metric: {task.successMetric}</small>
                  <small className="plan-task-metric">Checkpoint: {task.checkpoint}</small>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card strategic-pricing" id="section-pricing">
        <h3>{t('strategy.pricing.title', 'Plans & Upgrade Path')}</h3>
        <p className="cat-intro">Choose support depth based on your current gap, risk profile, and execution complexity.</p>
        <div className="pricing-recommendation-banner">
          <strong>{pricingRecommendation.badge}: {normalizeTierName(pricingRecommendation.tier)}</strong>
          <p>{pricingRecommendation.rationale}</p>
          <small className="pricing-experiment-note">
            {t('strategy.pricing.experimentLabel', 'Active experiment variant')}: {pricingExperiment.variant}
          </small>
        </div>
        <div className={`pricing-grid ${isProFirstVariant ? 'pro-first' : ''}`}>
          <article className={`pricing-tier pricing-tier-free ${pricingRecommendation.tier === 'free' ? 'recommended' : ''}`}>
            {pricingRecommendation.tier === 'free' && <span className="pricing-reco-badge">Best fit now</span>}
            <h4>Free</h4>
            <strong>0 CAD</strong>
            <ul>
              <li>CRS scoring + basic suggestions</li>
              <li>Scenario compare</li>
              <li>Local profile save</li>
            </ul>
            <button
              type="button"
              className="action-btn"
              onClick={() => {
                trackExperimentGoal('pricing_layout_v1', 'pricing_cta_click', { tier: 'free' });
                trackEvent('pricing_cta_clicked', {
                  tier: 'free',
                  recommended: pricingRecommendation.tier === 'free',
                  experiment_key: pricingExperiment.experimentKey,
                  experiment_variant: pricingExperiment.variant,
                });
                jumpFromAction('section-optimizer', 'continue_free');
              }}
            >
              {t('strategy.pricing.freeCta', 'Continue with Free')}
            </button>
          </article>
          <article className={`pricing-tier pricing-tier-pro featured ${pricingRecommendation.tier === 'pro' ? 'recommended' : ''}`}>
            {pricingRecommendation.tier === 'pro' && <span className="pricing-reco-badge">Recommended</span>}
            <h4>Pro Tracking</h4>
            <strong>5 CAD / month</strong>
            <ul>
              <li>Expert strategy coach</li>
              <li>Daily action tracking</li>
              <li>Cloud sync + alerts</li>
            </ul>
            <button
              type="button"
              className="action-btn auth-btn-primary"
              onClick={() => {
                trackExperimentGoal('pricing_layout_v1', 'pricing_cta_click', { tier: 'pro_tracking' });
                trackEvent('pricing_cta_clicked', {
                  tier: 'pro_tracking',
                  recommended: pricingRecommendation.tier === 'pro',
                  experiment_key: pricingExperiment.experimentKey,
                  experiment_variant: pricingExperiment.variant,
                });
                jumpFromAction('section-coach', 'go_to_pro_setup');
              }}
            >
              {proCtaLabel}
            </button>
          </article>
        </div>
      </section>

      <section className="card strategic-profile-trend" id="section-profile-trend">
        <h3>{t('strategy.trend.title', 'Profile trend timeline')}</h3>
        <p className="cat-intro">{t('strategy.trend.subtitle', 'Track score movement across your saved snapshots and current profile.')}</p>
        {!profileTrendPoints.length && (
          <p className="save-note">Save a few profiles to unlock your timeline view.</p>
        )}
        {!!profileTrendPoints.length && (
          <ul className="profile-trend-list">
            {profileTrendPoints.map((point) => (
              <li key={point.id} className={point.current ? 'current' : ''}>
                <div className="profile-trend-label">
                  <strong>{point.label}</strong>
                  {point.current && <span className="profile-trend-current">Current</span>}
                </div>
                <div className="profile-trend-bar-wrap">
                  <span className="profile-trend-bar" style={{ width: `${Math.max(Math.min(Math.round((point.score / trendMaxScore) * 100), 100), 5)}%` }} />
                </div>
                <span className="profile-trend-score">{point.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card strategic-explainability" id="section-explainability">
        <h3>{t('strategy.explainability.title', 'Explainability & Confidence')}</h3>
        <p className="cat-intro">Structured reasoning for lane ranking, confidence, and risk assumptions.</p>
        <div className="explain-grid">
          <article>
            <h4>Top score drivers</h4>
            <ul>
              {topFactors.map((factor) => (
                <li key={factor.label}>
                  <span>{factor.label}</span>
                  <strong>{factor.value}</strong>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h4>Recommendation score factors</h4>
            <ul className="explain-factor-list">
              {(strategy.top?.scoreBreakdown || []).map((factor) => (
                <li key={factor.key}>
                  <div className="explain-factor-head">
                    <span>{factor.label}</span>
                    <strong>{factor.value}</strong>
                  </div>
                  <div className="explain-factor-track">
                    <span className="explain-factor-fill" style={{ width: `${factor.value}%` }} />
                  </div>
                  <small>Weight: {Math.round((factor.weight || 0) * 100)}%</small>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h4>Data confidence</h4>
            <ul>
              <li>Confidence v2: <strong>{confidenceV2.total}/100</strong></li>
              <li>Overall confidence: <strong>{strategy.confidenceBand} ({strategy.overallConfidence}/100)</strong></li>
              <li>Data signal score: <strong>{confidenceV2.dataScore}/100</strong></li>
              <li>Execution signal score: <strong>{confidenceV2.executionScore}/100</strong></li>
              <li>Forecast signal score: <strong>{confidenceV2.forecastScore}/100</strong></li>
              <li>Risk penalty: <strong>-{confidenceV2.riskPenalty}</strong></li>
              <li>Draw freshness: <strong>{drawFreshness?.label || 'Unknown'}</strong></li>
              <li>Category freshness: <strong>{categoryFreshness?.label || 'Unknown'}</strong></li>
              <li>Draw source snapshot: <strong>{activeDraws?.lastUpdated || 'Unavailable'}</strong></li>
            </ul>
          </article>
          <article>
            <h4>Assumptions used</h4>
            <ul className="assumption-list">
              {(strategy.assumptions || []).map((assumption) => (
                <li key={assumption.key}>
                  <span>{assumption.label}</span>
                  <strong className={confidenceClass(assumption.confidence)}>{assumption.confidence}</strong>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h4>Risk indicators</h4>
            <ul className="risk-indicator-list">
              {(strategy.globalRiskFlags || []).map((flag) => (
                <li key={flag.id}>
                  <div>
                    <strong>{flag.label}</strong>
                    <small>{flag.detail}</small>
                  </div>
                  <RiskBadge value={flag.severity} />
                </li>
              ))}
              {!strategy.globalRiskFlags?.length && <li>No major risk flags detected.</li>}
            </ul>
          </article>
          <article>
            <h4>Trust cues</h4>
            <div className="trust-inline-cues">
              <span>Estimate model only</span>
              <span>No legal advice</span>
              <span>Review official IRCC before filing</span>
            </div>
            <p className="save-note">
              Review governance in the <a href="/trust.html">Trust Center</a>, implementation guides in <a href="/guides.html">Guides</a>, and rights controls in <a href="/privacy.html">Privacy Policy</a>.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
