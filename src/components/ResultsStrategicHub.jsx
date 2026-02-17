import { useEffect, useMemo, useState } from 'react';
import {
  buildOutcomeForecast,
  buildNinetyDayPlan,
  buildStrategyOptimizer,
  readActionPlanProgress,
  saveActionPlanProgress,
} from '../utils/strategyHub';
import { trackEvent } from '../utils/analytics';
import { readRuntimeFlags } from '../utils/runtimeFlags';
import { useLanguage } from '../i18n/LanguageContext';
import { getExperimentAssignment, trackExperimentGoal } from '../utils/experiments';
import { buildConsultantHandoffPayload, downloadConsultantHandoff } from '../utils/handoffExport';

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

function normalizeTierName(value) {
  if (value === 'free') return 'Free';
  return 'Pro Tracking';
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
  const strategy = useMemo(
    () => buildStrategyOptimizer({
      answers,
      result,
      averageCutoff,
      categoryInfo: activeCategoryInfo,
      provinces,
    }),
    [activeCategoryInfo, answers, averageCutoff, provinces, result]
  );

  const [planProgress, setPlanProgress] = useState(() => readActionPlanProgress(answers));

  useEffect(() => {
    setPlanProgress(readActionPlanProgress(answers));
  }, [answers]);
  useEffect(() => {
    const refresh = () => setRuntimeFlags(readRuntimeFlags());
    window.addEventListener('crs-runtime-flags-updated', refresh);
    return () => window.removeEventListener('crs-runtime-flags-updated', refresh);
  }, []);
  useEffect(() => {
    setPricingExperiment(getExperimentAssignment('pricing_layout_v1', { autoTrack: true }));
  }, []);

  const actionPlan = useMemo(
    () => buildNinetyDayPlan({
      suggestions,
      strategy,
      scoreGap: Math.max((averageCutoff || 0) - (result?.total || 0), 0),
      progress: planProgress,
    }),
    [averageCutoff, planProgress, result?.total, strategy, suggestions]
  );

  const completedCount = actionPlan.completedCount || 0;
  const totalCount = actionPlan.totalCount || actionPlan.tasks.length;
  const completionPct = actionPlan.completionPct || 0;
  const forecast = useMemo(
    () => (runtimeFlags.enableAdvancedForecasting
      ? buildOutcomeForecast({
        activeDraws,
        userScore: result?.total || 0,
        baseConfidence: strategy.overallConfidence,
      })
      : null),
    [activeDraws, result?.total, runtimeFlags.enableAdvancedForecasting, strategy.overallConfidence]
  );

  const topFactors = [
    { label: 'Core Human Capital', value: result?.breakdown?.coreHumanCapital || 0 },
    { label: 'Skill Transferability', value: result?.breakdown?.skillTransferability || 0 },
    { label: 'Additional Points', value: result?.breakdown?.additionalPoints || 0 },
    { label: 'Spouse Factors', value: result?.breakdown?.spouseFactors || 0 },
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

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
    const payload = buildConsultantHandoffPayload({
      answers,
      result,
      strategy,
      forecast,
      actionPlan,
      drawData: {
        ...activeDraws,
        source: drawFreshness?.tier || 'unknown',
      },
      categoryInfo: activeCategoryInfo,
    });
    const ok = downloadConsultantHandoff(payload);
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
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-optimizer', 'open_optimizer')}>
            {t('strategy.actionCenter.openOptimizer', 'Open strategy optimizer')}
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
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-coach', 'expert_strategy_coach')}>
            {t('strategy.actionCenter.expertCoach', 'Expert strategy coach')}
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
        </div>
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
              <li>Overall confidence: <strong>{strategy.confidenceBand} ({strategy.overallConfidence}/100)</strong></li>
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
