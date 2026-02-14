import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { buildPathPlans } from '../scoring/pathPlanner';
import {
  appendTrackingNote,
  buildTrackingFromPlan,
  clearPathTracking,
  deferNextCheckIn,
  estimateTrackingCompletion,
  getCoachMessage,
  getDailyProgressStats,
  getDailyTasksForDate,
  getTrackingProgress,
  getTrackingStorageKey,
  getUpcomingDailyTasks,
  loadPathTracking,
  savePathTracking,
  toggleDailyTask,
  toggleMilestone,
  updateTrackingScore,
} from '../utils/pathTrackingStore';
import {
  getTrackingAccess,
  loadLatestPathTrackingCloud,
  savePathTrackingCloud,
} from '../utils/pathTrackingCloud';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabaseClient';
import StarBorder from './StarBorder';

function formatDate(dateIso) {
  if (!dateIso) return '—';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function difficultyClass(level) {
  const value = String(level || '').toLowerCase();
  if (value === 'easy') return 'path-diff-easy';
  if (value === 'hard') return 'path-diff-hard';
  return 'path-diff-medium';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addMonths(dateIso, months) {
  const date = new Date(dateIso || Date.now());
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}
function formatExpectedGain(value) {
  const numeric = Number(value) || 0;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function getPaceLabel(status) {
  const map = {
    'on-track': 'On track',
    'slightly-behind': 'Slightly behind',
    behind: 'Behind schedule',
    'not-started': 'Not started',
  };
  return map[String(status || '')] || 'In progress';
}

function getCompletionPaceNote(projection) {
  if (!projection) return '';
  if (projection.delayDays > 0) return `${projection.delayDays} day(s) behind baseline`;
  if (projection.delayDays < 0) return `${Math.abs(projection.delayDays)} day(s) ahead of baseline`;
  return 'On baseline timeline';
}

function getRecommendedTarget({ answers, result, averageCutoff, categoryInfo }) {
  const current = Number(result?.total) || 0;
  const baseGeneralTarget = Math.max(Number(averageCutoff) || 520, current + 25);
  const eligibleCategoryCutoffs = (categoryInfo || [])
    .filter((cat) => typeof cat?.check === 'function' && cat.check(answers))
    .map((cat) => Number(cat.recentCutoff))
    .filter((cutoff) => Number.isFinite(cutoff) && cutoff > 0);

  if (eligibleCategoryCutoffs.length === 0) {
    return clamp(baseGeneralTarget + 10, 300, 1200);
  }

  const bestCategoryCutoff = Math.min(...eligibleCategoryCutoffs);
  const categoryTarget = Math.max(bestCategoryCutoff + 5, current + 5);
  return clamp(Math.min(baseGeneralTarget + 10, categoryTarget), 300, 1200);
}

export default function PathCoach({ answers, result, averageCutoff, categoryInfo = [] }) {
  const { user, isAuthenticated } = useAuth();

  const checkoutUrl = import.meta.env.VITE_STRIPE_TRACKING_CHECKOUT_URL;
  const billingPortalUrl = import.meta.env.VITE_STRIPE_BILLING_PORTAL_URL;
  const forceActive = import.meta.env.VITE_TRACKING_FORCE_ACTIVE === 'true';

  const recommendedTarget = useMemo(
    () => getRecommendedTarget({ answers, result, averageCutoff, categoryInfo }),
    [answers, result, averageCutoff, categoryInfo]
  );

  const [targetScore, setTargetScore] = useState(() => Math.max((result?.total || 0) + 25, 500));
  const [targetTouched, setTargetTouched] = useState(false);
  const [selectedPathId, setSelectedPathId] = useState('');
  const [tracking, setTracking] = useState(null);
  const [noteInput, setNoteInput] = useState('');
  const [trackingStatus, setTrackingStatus] = useState('');
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [accessState, setAccessState] = useState({
    loading: false,
    active: false,
    reason: '',
  });

  const storageKey = useMemo(() => getTrackingStorageKey(user?.id || null, null), [user?.id]);
  const planner = useMemo(
    () => buildPathPlans(answers, result, { targetScore, averageCutoff }),
    [answers, result, targetScore, averageCutoff]
  );
  const selectedPath = useMemo(
    () => planner.plans.find((path) => path.id === selectedPathId) || planner.plans[0] || null,
    [planner.plans, selectedPathId]
  );

  const hasPaidAccess = forceActive || (isAuthenticated && accessState.active);
  const progressPct = getTrackingProgress(tracking);
  const coachMessage = getCoachMessage(tracking);
  const dailyStats = useMemo(() => getDailyProgressStats(tracking), [tracking]);
  const todayTasks = useMemo(() => getDailyTasksForDate(tracking), [tracking]);
  const upcomingTasks = useMemo(() => getUpcomingDailyTasks(tracking, 7), [tracking]);
  const completionProjection = useMemo(() => estimateTrackingCompletion(tracking), [tracking]);

  const selectedTimeline = useMemo(() => {
    if (!selectedPath) return null;
    const startDate = tracking?.startedAt || new Date().toISOString();
    const spread = selectedPath.difficulty === 'Easy' ? 1 : selectedPath.difficulty === 'Hard' ? 3 : 2;
    const earliestMonths = Math.max(selectedPath.estimatedMonths - spread, 1);
    const latestMonths = selectedPath.estimatedMonths + spread + (selectedPath.goalReached ? 0 : 1);
    return {
      earliestMonths,
      latestMonths,
      earliestDate: addMonths(startDate, earliestMonths),
      latestDate: addMonths(startDate, latestMonths),
    };
  }, [selectedPath, tracking?.startedAt]);

  useEffect(() => {
    setTargetTouched(false);
  }, [result?.total]);

  useEffect(() => {
    if (!targetTouched) {
      setTargetScore(recommendedTarget);
    }
  }, [recommendedTarget, targetTouched]);

  useEffect(() => {
    if (!planner.plans.length) {
      setSelectedPathId('');
      return;
    }
    const valid = planner.plans.some((path) => path.id === selectedPathId);
    if (!valid) {
      setSelectedPathId(planner.plans[0].id);
    }
  }, [planner.plans, selectedPathId]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      const local = loadPathTracking(storageKey);
      if (local) {
        const hydrated = { ...local, currentScore: Number(result?.total) || 0 };
        setTracking(hydrated);
      } else {
        setTracking(null);
      }
    });
    return () => { mounted = false; };
  }, [result?.total, storageKey]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }
    let active = true;
    getTrackingAccess(user.id)
      .then((res) => {
        if (!active) return;
        setAccessState({
          loading: false,
          active: !!res.active,
          reason: res.reason || '',
        });
      })
      .catch((err) => {
        if (!active) return;
        setAccessState({
          loading: false,
          active: false,
          reason: err.message || 'Could not verify tracking access.',
        });
      });
    return () => { active = false; };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let active = true;
    loadLatestPathTrackingCloud(user.id)
      .then((res) => {
        if (!active || res.status !== 'ok' || !res.data) return;
        const local = loadPathTracking(storageKey);
        const cloudUpdated = new Date(res.data.updatedAt || 0).getTime();
        const localUpdated = new Date(local?.updatedAt || 0).getTime();
        if (!local || cloudUpdated > localUpdated) {
          const hydrated = { ...res.data, currentScore: Number(result?.total) || 0 };
          savePathTracking(storageKey, hydrated);
          setTracking(hydrated);
        }
      })
      .catch(() => {
        // silent fallback to local data
      });
    return () => { active = false; };
  }, [isAuthenticated, result?.total, storageKey, user?.id]);

  const persistTracking = async (nextTracking) => {
    const withScore = updateTrackingScore(nextTracking, result.total);
    const persisted = savePathTracking(storageKey, withScore);
    setTracking(persisted);
    if (isAuthenticated && hasPaidAccess && user?.id) {
      try {
        await savePathTrackingCloud(user.id, persisted);
      } catch {
        // keep local state even if cloud sync fails
      }
    }
    return persisted;
  };

  const handleStartTracking = async () => {
    if (!selectedPath) return;
    if (!hasPaidAccess) {
      setTrackingStatus('Tracking is available on the 5 CAD/month plan.');
      return;
    }
    const next = buildTrackingFromPlan(selectedPath, result.total, targetScore);
    await persistTracking(next);
    setTrackingStatus('Expert path started. Complete today\'s tasks to build momentum.');
  };

  const handleToggleMilestone = async (milestoneId) => {
    if (!tracking || !hasPaidAccess) return;
    const next = toggleMilestone(tracking, milestoneId);
    await persistTracking(next);
    setTrackingStatus('Milestone progress updated.');
  };

  const handleToggleDailyTask = async (taskId) => {
    if (!tracking || !hasPaidAccess) return;
    const next = toggleDailyTask(tracking, taskId);
    await persistTracking(next);
    setTrackingStatus('Daily task updated.');
  };

  const handleNextCheckIn = async () => {
    if (!tracking || !hasPaidAccess) return;
    const next = deferNextCheckIn(tracking, 7);
    await persistTracking(next);
    setTrackingStatus('Next check-in moved by 7 days.');
  };

  const handleSaveNote = async () => {
    if (!tracking || !hasPaidAccess) return;
    const text = noteInput.trim();
    if (!text) return;
    const next = appendTrackingNote(tracking, text);
    await persistTracking(next);
    setNoteInput('');
    setTrackingStatus('Coach note saved.');
  };

  const handleResetTracking = () => {
    clearPathTracking(storageKey);
    setTracking(null);
    setTrackingStatus('Tracking reset. Choose another expert path.');
  };

  const handleSubscribe = async () => {
    if (!isAuthenticated || !user?.id) {
      setTrackingStatus('Please log in before subscribing.');
      return;
    }
    setSubscribeBusy(true);
    setTrackingStatus('');
    try {
      if (!supabase) {
        throw new Error('Supabase client is not configured.');
      }
      const { data, error } = await supabase.functions.invoke('create-tracking-checkout', {
        body: {
          source: 'path-coach',
        },
      });
      if (error) throw error;
      const dynamicCheckoutUrl = data?.url;
      if (!dynamicCheckoutUrl) {
        throw new Error('Checkout function returned no URL.');
      }
      window.location.href = dynamicCheckoutUrl;
      setTrackingStatus('Opening secure checkout...');
    } catch (err) {
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        setTrackingStatus('Checkout function unavailable. Opened fallback checkout link.');
      } else {
        setTrackingStatus(err.message || 'Could not start subscription checkout.');
      }
    } finally {
      setSubscribeBusy(false);
    }
  };

  return (
    <motion.div className="card path-coach-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
      <div className="path-coach-head">
        <h3>Expert Strategy Coach</h3>
        <span className="path-pill">Phase 2</span>
      </div>
      <p className="cat-intro">
        Pick the strategy that fits you best, then follow a guided daily plan to close your CRS gap faster.
      </p>

      <div className="path-target-row">
        <label className="wi-field">
          <span>Target score</span>
          <input
            type="number"
            min="300"
            max="1200"
            value={targetScore}
            onChange={(e) => {
              setTargetTouched(true);
              setTargetScore(Number(e.target.value) || planner.targetScore);
            }}
          />
        </label>
        <div className="path-target-meta">
          <small>Current: {planner.currentScore}</small>
          <small>Score gap: {Math.max(targetScore - planner.currentScore, 0)}</small>
          <small>Smart target: {recommendedTarget}</small>
        </div>
      </div>

      <div className="path-grid">
        {planner.plans.map((plan) => (
          <motion.button
            key={plan.id}
            className={`path-option ${selectedPath?.id === plan.id ? 'selected' : ''}`}
            onClick={() => setSelectedPathId(plan.id)}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="path-option-head">
              <strong>{plan.title}</strong>
              <span className={`path-diff ${difficultyClass(plan.difficulty)}`}>{plan.difficulty}</span>
            </div>
            <p>{plan.summary}</p>
            <div className="path-stats">
              <span>+{plan.potentialGain} pts</span>
              <span>{plan.estimatedMonths} months</span>
              <span>{plan.likelihoodPercent}% likely</span>
            </div>
            <small>{plan.goalReached ? 'Can likely reach your target with this path' : `${plan.checks.stillNeededAfterPath} pts still needed after this path`}</small>
          </motion.button>
        ))}
      </div>

      {selectedPath && (
        <div className="path-detail">
          <h4>{selectedPath.title}</h4>
          <p className="path-why">{selectedPath.whyItFits}</p>
          <div className="path-meta-line">
            <span>Projected score: <strong>{selectedPath.projectedScore}</strong></span>
            <span>Estimated cost: <strong>{selectedPath.estimatedCostCad} CAD</strong></span>
          </div>
          {selectedTimeline && (
            <div className="path-meta-line">
              <span>
                Likely completion window: <strong>{selectedTimeline.earliestMonths}-{selectedTimeline.latestMonths} months</strong>
              </span>
              <span>
                Target finish dates: <strong>{formatDate(selectedTimeline.earliestDate)} - {formatDate(selectedTimeline.latestDate)}</strong>
              </span>
            </div>
          )}
          <ul className="path-milestones-preview">
            {selectedPath.milestones.map((milestone) => (
              <li key={milestone.id}>
                <span>{milestone.title}</span>
                <small>~{milestone.etaWeeks} weeks</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isAuthenticated && (
        <div className="path-paywall">
          <p>Log in first, then activate paid tracking (5 CAD/month) to unlock daily guidance and cloud sync.</p>
        </div>
      )}

      {isAuthenticated && !hasPaidAccess && (
        <div className="path-paywall">
          <p><strong>Tracking plan:</strong> 5 CAD / month</p>
          <p>Includes expert strategy tracking, daily tasks, reminders, and cross-device progress sync.</p>
          <div className="path-pay-actions">
            <button
              className="action-btn auth-btn-primary"
              disabled={subscribeBusy}
              onClick={handleSubscribe}
            >
              {subscribeBusy ? 'Opening...' : 'Subscribe (5 CAD/month)'}
            </button>
            <button
              className="action-btn"
              onClick={async () => {
                if (!user?.id) return;
                setAccessState((state) => ({ ...state, loading: true }));
                try {
                  const res = await getTrackingAccess(user.id);
                  setAccessState({ loading: false, active: !!res.active, reason: res.reason || '' });
                  setTrackingStatus(res.active ? 'Subscription detected. Tracking unlocked.' : 'Subscription not active yet.');
                } catch (err) {
                  setAccessState({ loading: false, active: false, reason: err.message || '' });
                }
              }}
            >
              {accessState.loading ? 'Checking...' : 'Refresh payment status'}
            </button>
            {billingPortalUrl && (
              <button
                className="action-btn"
                onClick={() => window.open(billingPortalUrl, '_blank', 'noopener,noreferrer')}
              >
                Manage billing
              </button>
            )}
          </div>
          {accessState.reason && <small>{accessState.reason}</small>}
        </div>
      )}

      <div className="path-actions">
        <StarBorder color="var(--primary)" speed="5s">
          <button className="btn-next finish" type="button" onClick={handleStartTracking}>
            {tracking ? 'Switch to this strategy' : 'Start this strategy'}
          </button>
        </StarBorder>
        {tracking && (
          <button className="btn-toggle" type="button" onClick={handleResetTracking}>
            Reset tracking
          </button>
        )}
      </div>

      {tracking && (
        <div className="path-tracker">
          <div className="path-progress-head">
            <strong>Progress: {progressPct}%</strong>
            <span>Next check-in: {formatDate(tracking.nextCheckInAt)}</span>
          </div>
          <div className="path-progress-bar-wrap">
            <motion.div
              className="path-progress-bar"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.7 }}
            />
          </div>

          <div className="path-daily-stats">
            <span>Streak: <strong>{dailyStats.streakDays} day(s)</strong></span>
            <span>Completed: <strong>{dailyStats.completedTasks}/{dailyStats.totalTasks}</strong></span>
            <span>Today: <strong>{dailyStats.completedToday}/{dailyStats.dueToday}</strong></span>
            <span className={`pace pace-${dailyStats.paceStatus}`}>Pace: <strong>{getPaceLabel(dailyStats.paceStatus)}</strong></span>
          </div>

          {completionProjection && (
            <div className="path-coach-note">
              <strong>Completion forecast:</strong> baseline {formatDate(completionProjection.baselineDate)} · current pace {formatDate(completionProjection.projectedDate)} ({getCompletionPaceNote(completionProjection)})
            </div>
          )}

          <div className="path-coach-note">
            <strong>Coach guidance:</strong> {coachMessage}
          </div>

          <div className="path-daily-section">
            <h5>Today&apos;s guide</h5>
            {!todayTasks.length && <p className="path-empty-text">No task is due today. Continue with the next upcoming task.</p>}
            {!!todayTasks.length && (
              <ul className="path-daily-list">
                {todayTasks.map((task) => (
                  <li key={task.id} className={task.done ? 'done' : ''}>
                    <button type="button" onClick={() => handleToggleDailyTask(task.id)} disabled={!hasPaidAccess}>
                      {task.done ? '✓' : '○'}
                    </button>
                    <div>
                      <strong>{task.title}</strong>
                      <p>{task.details}</p>
                      <small>{task.expectedMinutes} min planned · +{formatExpectedGain(task.expectedGain)} projected CRS pace</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="path-daily-section">
            <h5>Upcoming 7-day guide</h5>
            {!upcomingTasks.length && <p className="path-empty-text">No upcoming tasks yet.</p>}
            {!!upcomingTasks.length && (
              <ul className="path-upcoming-list">
                {upcomingTasks.slice(0, 10).map((task) => (
                  <li key={task.id}>
                    <span>{formatDate(task.date)}</span>
                    <span>{task.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="path-milestone-list">
            {(tracking.milestones || []).map((milestone) => (
              <li key={milestone.id} className={milestone.done ? 'done' : ''}>
                <button type="button" onClick={() => handleToggleMilestone(milestone.id)} disabled={!hasPaidAccess}>
                  {milestone.done ? '✓' : '○'}
                </button>
                <div>
                  <strong>{milestone.title}</strong>
                  <p>{milestone.details}</p>
                  <small>Expected impact: +{milestone.expectedGain} pts · ~{milestone.etaWeeks} weeks</small>
                </div>
              </li>
            ))}
          </ul>

          <div className="path-checkin-row">
            <button className="action-btn" type="button" onClick={handleNextCheckIn} disabled={!hasPaidAccess}>
              Move next check-in by 7 days
            </button>
          </div>

          <div className="path-note-input">
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Add blocker or update note for your next check-in..."
            />
            <button className="action-btn" type="button" onClick={handleSaveNote} disabled={!hasPaidAccess}>
              Save note
            </button>
          </div>
        </div>
      )}

      {trackingStatus && <p className="save-status">{trackingStatus}</p>}
    </motion.div>
  );
}
