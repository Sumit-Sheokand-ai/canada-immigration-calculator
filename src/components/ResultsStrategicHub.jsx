import { useEffect, useMemo, useState } from 'react';
import {
  buildNinetyDayPlan,
  buildStrategyOptimizer,
  readActionPlanProgress,
  saveActionPlanProgress,
} from '../utils/strategyHub';
import { trackEvent } from '../utils/analytics';

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
  if (value === 'advisor') return 'Advisor Mode';
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
        tier: 'advisor',
        badge: 'Best for complex case',
        rationale: 'Your profile looks high-complexity with a wider gap. Advisor workflows may reduce execution risk.',
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

  const jumpFromAction = (sectionId, cta) => {
    onJumpToSection(sectionId);
    trackEvent('action_center_cta_clicked', {
      cta,
      target_section: sectionId,
      confidence_band: strategy.confidenceBand,
    });
  };

  const openAccountFromAction = () => {
    onOpenAccount?.();
    trackEvent('action_center_cta_clicked', {
      cta: 'manage_account',
      target_section: 'account_modal',
      confidence_band: strategy.confidenceBand,
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
        <h3>Action Center</h3>
        <p className="cat-intro">Use this control center to execute the highest-impact moves with clear priority and risk visibility.</p>
        <div className="strategic-action-grid">
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-save', 'save_profile')}>
            Save profile
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-optimizer', 'open_optimizer')}>
            Open strategy optimizer
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-90-day-plan', 'open_90_day_plan')}>
            Open 90-day plan
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-pricing', 'compare_plans')}>
            Compare plans
          </button>
          <button type="button" className="action-btn" onClick={() => jumpFromAction('section-coach', 'expert_strategy_coach')}>
            Expert strategy coach
          </button>
          <button type="button" className="action-btn" onClick={openAccountFromAction}>
            Manage account
          </button>
        </div>
        <div className="strategic-action-status">
          <span>Profile save status: <strong>{saveStatus || 'Not saved yet'}</strong></span>
          <span>90-day completion: <strong>{completionPct}%</strong> ({completedCount}/{totalCount})</span>
          <span>Confidence: <strong>{strategy.confidenceBand}</strong> ({strategy.overallConfidence} / 100)</span>
          <span>Risk level: <strong>{riskLevelLabel}</strong></span>
        </div>
        {actionPlan.nextBestTask && (
          <div className="next-task-callout">
            <div>
              <strong>Next best task: {actionPlan.nextBestTask.title}</strong>
              <p>{actionPlan.nextBestTask.dateWindow} · {actionPlan.nextBestTask.weekWindow}</p>
              <small>{actionPlan.nextBestTask.successMetric}</small>
            </div>
            <button
              type="button"
              className="action-btn auth-btn-primary"
              onClick={() => jumpFromAction('section-90-day-plan', 'next_best_task')}
            >
              Start task
            </button>
          </div>
        )}
      </section>

      <section className="card strategic-optimizer" id="section-optimizer">
        <h3>Strategy Optimizer</h3>
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
        <h3>90-Day Action Plan</h3>
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
        <h3>Plans & Upgrade Path</h3>
        <p className="cat-intro">Choose support depth based on your current gap, risk profile, and execution complexity.</p>
        <div className="pricing-recommendation-banner">
          <strong>{pricingRecommendation.badge}: {normalizeTierName(pricingRecommendation.tier)}</strong>
          <p>{pricingRecommendation.rationale}</p>
        </div>
        <div className="pricing-grid">
          <article className={`pricing-tier ${pricingRecommendation.tier === 'free' ? 'recommended' : ''}`}>
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
                trackEvent('pricing_cta_clicked', { tier: 'free', recommended: pricingRecommendation.tier === 'free' });
                jumpFromAction('section-optimizer', 'continue_free');
              }}
            >
              Continue with Free
            </button>
          </article>
          <article className={`pricing-tier featured ${pricingRecommendation.tier === 'pro' ? 'recommended' : ''}`}>
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
                trackEvent('pricing_cta_clicked', { tier: 'pro_tracking', recommended: pricingRecommendation.tier === 'pro' });
                jumpFromAction('section-coach', 'go_to_pro_setup');
              }}
            >
              Go to Pro setup
            </button>
          </article>
          <article className={`pricing-tier ${pricingRecommendation.tier === 'advisor' ? 'recommended' : ''}`}>
            {pricingRecommendation.tier === 'advisor' && <span className="pricing-reco-badge">Complex-case fit</span>}
            <h4>Advisor Mode</h4>
            <strong>Coming soon</strong>
            <ul>
              <li>Multi-profile management</li>
              <li>Team workflows</li>
              <li>Priority insights</li>
            </ul>
            <a
              className="action-btn action-link-btn"
              href="/guides.html"
              onClick={() => trackEvent('pricing_cta_clicked', { tier: 'advisor_mode_waitlist', recommended: pricingRecommendation.tier === 'advisor' })}
            >
              View Advisor playbooks
            </a>
          </article>
        </div>
      </section>

      <section className="card strategic-explainability" id="section-explainability">
        <h3>Explainability & Confidence</h3>
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
