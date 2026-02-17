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
  const actionPlan = useMemo(
    () => buildNinetyDayPlan({
      suggestions,
      strategy,
      scoreGap: Math.max((averageCutoff || 0) - (result?.total || 0), 0),
    }),
    [averageCutoff, result?.total, strategy, suggestions]
  );

  const [planProgress, setPlanProgress] = useState(() => readActionPlanProgress(answers));

  useEffect(() => {
    setPlanProgress(readActionPlanProgress(answers));
  }, [answers]);

  const completedCount = useMemo(
    () => actionPlan.tasks.filter((task) => !!planProgress[task.id]).length,
    [actionPlan.tasks, planProgress]
  );

  const totalCount = actionPlan.tasks.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const toggleTask = (taskId) => {
    const next = {
      ...planProgress,
      [taskId]: !planProgress[taskId],
    };
    setPlanProgress(next);
    saveActionPlanProgress(answers, next);
    trackEvent('action_plan_task_toggled', {
      task_id: taskId,
      completed: !!next[taskId],
      completion_pct: completionPct,
    });
  };

  const topFactors = [
    { label: 'Core Human Capital', value: result?.breakdown?.coreHumanCapital || 0 },
    { label: 'Skill Transferability', value: result?.breakdown?.skillTransferability || 0 },
    { label: 'Additional Points', value: result?.breakdown?.additionalPoints || 0 },
    { label: 'Spouse Factors', value: result?.breakdown?.spouseFactors || 0 },
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return (
    <>
      <section className="card strategic-action-center" id="section-action-center">
        <h3>Action Center</h3>
        <p className="cat-intro">Use this control center to execute the highest-impact moves without losing flow.</p>
        <div className="strategic-action-grid">
          <button type="button" className="action-btn" onClick={() => onJumpToSection('section-save')}>
            Save profile
          </button>
          <button type="button" className="action-btn" onClick={() => onJumpToSection('section-optimizer')}>
            Open strategy optimizer
          </button>
          <button type="button" className="action-btn" onClick={() => onJumpToSection('section-90-day-plan')}>
            Open 90-day plan
          </button>
          <button type="button" className="action-btn" onClick={() => onJumpToSection('section-pricing')}>
            Compare plans
          </button>
          <button type="button" className="action-btn" onClick={() => onJumpToSection('section-coach')}>
            Expert strategy coach
          </button>
          <button type="button" className="action-btn" onClick={onOpenAccount}>
            Manage account
          </button>
        </div>
        <div className="strategic-action-status">
          <span>Profile save status: <strong>{saveStatus || 'Not saved yet'}</strong></span>
          <span>90-day completion: <strong>{completionPct}%</strong></span>
        </div>
      </section>

      <section className="card strategic-optimizer" id="section-optimizer">
        <h3>Strategy Optimizer</h3>
        <p className="cat-intro">{strategy.guidanceSummary}</p>
        {strategy.top && (
          <div className="optimizer-top-callout">
            <strong>Top lane: {strategy.top.title}</strong>
            <p>{strategy.top.reason}</p>
            <div className="optimizer-meta">
              <span>Estimated gain: +{strategy.top.scoreGain}</span>
              <span>Expected timeline: ~{strategy.top.months} months</span>
              <span>Confidence: {strategy.top.confidence}%</span>
              <EffortBadge value={strategy.top.effort} />
            </div>
          </div>
        )}
        <div className="optimizer-options">
          {strategy.ranked.map((option, idx) => (
            <article key={option.id} className="optimizer-option">
              <div className="optimizer-option-head">
                <strong>{idx + 1}. {option.title}</strong>
                <EffortBadge value={option.effort} />
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
        <p className="cat-intro">Execution-focused milestones with realistic sequence and measurable progress.</p>
        <div className="plan-milestones">
          {actionPlan.milestones.map((milestone) => (
            <div key={milestone.label} className="plan-milestone">
              <strong>{milestone.label}</strong>
              <p>{milestone.objective}</p>
              <small>Expected gain: +{milestone.expectedGain} pts</small>
            </div>
          ))}
        </div>
        <ul className="plan-task-list">
          {actionPlan.tasks.map((task) => (
            <li key={task.id} className={planProgress[task.id] ? 'done' : ''}>
              <button type="button" className="plan-task-toggle" onClick={() => toggleTask(task.id)} aria-label={`Toggle ${task.title}`}>
                {planProgress[task.id] ? '✓' : '○'}
              </button>
              <div>
                <div className="plan-task-head">
                  <strong>{task.title}</strong>
                  <PriorityBadge value={task.priority} />
                </div>
                <p>{task.rationale}</p>
                <div className="optimizer-meta">
                  <span>{task.window}</span>
                  <span>Lane: {task.lane}</span>
                  <span>Impact: +{task.impact} pts</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card strategic-pricing" id="section-pricing">
        <h3>Plans & Upgrade Path</h3>
        <p className="cat-intro">Choose the depth of support based on your urgency and complexity.</p>
        <div className="pricing-grid">
          <article className="pricing-tier">
            <h4>Free</h4>
            <strong>0 CAD</strong>
            <ul>
              <li>CRS scoring + basic suggestions</li>
              <li>Scenario compare</li>
              <li>Local profile save</li>
            </ul>
          </article>
          <article className="pricing-tier featured">
            <h4>Pro Tracking</h4>
            <strong>5 CAD / month</strong>
            <ul>
              <li>Expert strategy coach</li>
              <li>Daily action tracking</li>
              <li>Cloud sync + alerts</li>
            </ul>
            <button type="button" className="action-btn auth-btn-primary" onClick={() => onJumpToSection('section-coach')}>
              Go to Pro setup
            </button>
          </article>
          <article className="pricing-tier">
            <h4>Advisor Mode</h4>
            <strong>Coming soon</strong>
            <ul>
              <li>Multi-profile management</li>
              <li>Team workflows</li>
              <li>Priority insights</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="card strategic-explainability" id="section-explainability">
        <h3>Explainability & Confidence</h3>
        <p className="cat-intro">Why your recommendations are prioritized and what assumptions matter most.</p>
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
            <h4>Data confidence</h4>
            <ul>
              <li>Draw freshness: <strong>{drawFreshness?.label || 'Unknown'}</strong></li>
              <li>Category freshness: <strong>{categoryFreshness?.label || 'Unknown'}</strong></li>
              <li>Draw source snapshot: <strong>{activeDraws?.lastUpdated || 'Unavailable'}</strong></li>
            </ul>
          </article>
          <article>
            <h4>Assumptions used</h4>
            <ul>
              <li>Self-reported profile values are accurate.</li>
              <li>Recent draw patterns remain directionally stable.</li>
              <li>Strategy projections are estimate ranges, not guarantees.</li>
            </ul>
          </article>
        </div>
        <p className="save-note">
          Read governance details in the <a href="/trust.html">Trust Center</a> and execution playbooks in <a href="/guides.html">Guides</a>.
        </p>
      </section>
    </>
  );
}
