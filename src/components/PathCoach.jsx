import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { buildPathPlans } from '../scoring/pathPlanner';
import {
  appendTrackingNote,
  buildTrackingFromPlan,
  clearPathTracking,
  deferNextCheckIn,
  getCoachMessage,
  getTrackingProgress,
  getTrackingStorageKey,
  loadPathTracking,
  savePathTracking,
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

export default function PathCoach({ answers, result, averageCutoff }) {
  const { user, isAuthenticated } = useAuth();

  const checkoutUrl = import.meta.env.VITE_STRIPE_TRACKING_CHECKOUT_URL;
  const billingPortalUrl = import.meta.env.VITE_STRIPE_BILLING_PORTAL_URL;
  const forceActive = import.meta.env.VITE_TRACKING_FORCE_ACTIVE === 'true';

  const [targetScore, setTargetScore] = useState(() => Math.max((result?.total || 0) + 25, 500));
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

  const planner = useMemo(() => buildPathPlans(answers, result, { targetScore, averageCutoff }), [answers, result, targetScore, averageCutoff]);
  const selectedPath = useMemo(
    () => planner.plans.find((p) => p.id === selectedPathId) || planner.plans[0] || null,
    [planner.plans, selectedPathId]
  );

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      const local = loadPathTracking(storageKey);
      if (local) setTracking(updateTrackingScore(local, result.total));
      else setTracking(null);
    });
    return () => { mounted = false; };
  }, [result.total, storageKey]);

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
          savePathTracking(storageKey, res.data);
          setTracking(updateTrackingScore(res.data, result.total));
        }
      })
      .catch(() => {
        // silent fallback to local data
      });
    return () => { active = false; };
  }, [isAuthenticated, result.total, storageKey, user?.id]);

  const hasPaidAccess = forceActive || (isAuthenticated && accessState.active);
  const progressPct = getTrackingProgress(tracking);
  const coachMessage = getCoachMessage(tracking);

  const persistTracking = async (nextTracking) => {
    const withScore = updateTrackingScore(nextTracking, result.total);
    withScore.progressPct = getTrackingProgress(withScore);
    savePathTracking(storageKey, withScore);
    setTracking(withScore);
    if (isAuthenticated && hasPaidAccess && user?.id) {
      try {
        await savePathTrackingCloud(user.id, withScore);
      } catch {
        // keep local state even if cloud sync fails
      }
    }
    return withScore;
  };

  const handleStartTracking = async () => {
    if (!selectedPath) return;
    if (!hasPaidAccess) {
      setTrackingStatus('Tracking is available on the 5 CAD/month plan.');
      return;
    }
    const next = buildTrackingFromPlan(selectedPath, result.total, targetScore);
    await persistTracking(next);
    setTrackingStatus('Path tracking started. Follow the first milestone this week.');
  };

  const handleToggleMilestone = async (milestoneId) => {
    if (!tracking || !hasPaidAccess) return;
    const next = toggleMilestone(tracking, milestoneId);
    await persistTracking(next);
    setTrackingStatus('Milestone progress updated.');
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
    setTrackingStatus('Tracking reset. Choose a path to start again.');
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
        <h3>Goal Path Coach (Most Important)</h3>
        <span className="path-pill">Detailed</span>
      </div>
      <p className="cat-intro">
        Pick the most suitable path for your situation, then track weekly milestones with guided assistance.
      </p>

      <div className="path-target-row">
        <label className="wi-field">
          <span>Target score</span>
          <input
            type="number"
            min="300"
            max="1200"
            value={targetScore}
            onChange={(e) => setTargetScore(Number(e.target.value) || planner.targetScore)}
          />
        </label>
        <div className="path-target-meta">
          <small>Current: {planner.currentScore}</small>
          <small>Gap: {Math.max(targetScore - planner.currentScore, 0)}</small>
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
            <small>{plan.goalReached ? 'Can hit target alone' : `Still need ${plan.checks.stillNeededAfterPath} pts after this path`}</small>
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
          <ul className="path-milestones-preview">
            {selectedPath.milestones.map((m) => (
              <li key={m.id}>
                <span>{m.title}</span>
                <small>~{m.etaWeeks} weeks</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isAuthenticated && (
        <div className="path-paywall">
          <p>Login first, then activate paid tracking (5 CAD/month) to unlock weekly coaching and cloud sync.</p>
        </div>
      )}

      {isAuthenticated && !hasPaidAccess && (
        <div className="path-paywall">
          <p><strong>Tracking plan:</strong> 5 CAD / month</p>
          <p>This includes guided path tracking, milestone reminders, and cross-device progress sync.</p>
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
                setAccessState((s) => ({ ...s, loading: true }));
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
            {tracking ? 'Switch to this path' : 'Start this path'}
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

          <div className="path-coach-note">
            <strong>Coach guidance:</strong> {coachMessage}
          </div>

          <ul className="path-milestone-list">
            {(tracking.milestones || []).map((m) => (
              <li key={m.id} className={m.done ? 'done' : ''}>
                <button type="button" onClick={() => handleToggleMilestone(m.id)} disabled={!hasPaidAccess}>
                  {m.done ? '✓' : '○'}
                </button>
                <div>
                  <strong>{m.title}</strong>
                  <p>{m.details}</p>
                  <small>Expected impact: +{m.expectedGain} pts · ~{m.etaWeeks} weeks</small>
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
