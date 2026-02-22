import { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import Loader from './components/Loader';
const WelcomeScreen = lazy(() => import('./components/WelcomeScreen'));
const Wizard = lazy(() => import('./components/Wizard'));
const Results = lazy(() => import('./components/Results'));
import { useLanguage } from './i18n/LanguageContext';
import { unsubscribeAlertsByToken } from './utils/cloudProfiles';
import {
  getCategoryDrawInfo,
  getFallbackCategoryDrawInfo,
  getFallbackLatestDraws,
  getLatestDraws,
  peekCategoryDrawInfoCache,
  peekLatestDrawsCache,
} from './utils/drawDataSource';
import { trackEvent, trackError } from './utils/analytics';
import { readAccountSettings } from './utils/accountSettings';
import { readRuntimeFlags } from './utils/runtimeFlags';
import { prefetchPathCoachChunk, prefetchResultsChunk, prefetchWizardChunk } from './utils/chunkPrefetch';
import { readConsultantHandoffFromQuery } from './utils/handoffExport';
import { runPolicyAutopilotSync } from './utils/policyAutopilot';
import './App.css';

const STORAGE_KEY = 'crs-progress';
const MODE_ROUTE_MAP = {
  welcome: '/',
  wizard: '/wizard',
  results: '/results',
  unsubscribe: '/unsubscribe',
  handoff: '/handoff',
};
const PERF_METRIC_THRESHOLDS = {
  FCP: { good: 1800, needsImprovement: 3000 },
  LCP: { good: 2500, needsImprovement: 4000 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  INP: { good: 200, needsImprovement: 500 },
};

function getRouteFromMode(mode) {
  return MODE_ROUTE_MAP[mode] || '/';
}
function getSupportedEntryTypes() {
  if (typeof PerformanceObserver === 'undefined') return [];
  return Array.isArray(PerformanceObserver.supportedEntryTypes)
    ? PerformanceObserver.supportedEntryTypes
    : [];
}
function hasSupportedEntryType(type) {
  return getSupportedEntryTypes().includes(type);
}
function getVitalRating(metric, value) {
  const thresholds = PERF_METRIC_THRESHOLDS[metric];
  if (!thresholds || !Number.isFinite(value)) return 'unknown';
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.needsImprovement) return 'needs_improvement';
  return 'poor';
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveProgress(answers) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(answers)); } catch { /* ignore storage errors */ }
}

function clearProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore storage errors */ }
}
function getUnsubscribeToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('unsubscribe');
  } catch {
    return null;
  }
}

function getInitialAnswers() {
  return {};
}
function detectLowEndDevice() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav) return false;
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
  const saveDataEnabled = Boolean(connection?.saveData);
  const deviceMemory = Number(nav.deviceMemory || 0);
  const hardwareCores = Number(nav.hardwareConcurrency || 0);
  const lowMemory = Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4;
  const lowCores = Number.isFinite(hardwareCores) && hardwareCores > 0 && hardwareCores <= 4;
  return saveDataEnabled || lowMemory || lowCores;
}
function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
async function withRetries(task, { retries = 2, baseDelayMs = 250 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(baseDelayMs * (2 ** attempt));
    }
  }
  throw lastError || new Error('Retry attempts exhausted.');
}


export default function App() {
  const { t } = useLanguage();
  const [accountSettings, setAccountSettings] = useState(() => readAccountSettings());
  const [runtimeFlags, setRuntimeFlags] = useState(() => readRuntimeFlags());
  const shouldAutoSaveProgress = accountSettings.autoSaveProgress !== false;
  const motionIntensity = ['off', 'subtle', 'full'].includes(accountSettings.motionIntensity)
    ? accountSettings.motionIntensity
    : 'full';
  const isLowEndDevice = useMemo(() => detectLowEndDevice(), []);
  const effectiveMotionIntensity = motionIntensity === 'off'
    ? 'off'
    : (isLowEndDevice && motionIntensity === 'full' ? 'subtle' : motionIntensity);
  const unsubscribeToken = getUnsubscribeToken();
  const sharedHandoffPayload = useMemo(() => readConsultantHandoffFromQuery(), []);
  const initialAnswers = getInitialAnswers();
  const initialDrawSnapshot = useMemo(() => peekLatestDrawsCache(), []);
  const initialCategorySnapshot = useMemo(() => peekCategoryDrawInfoCache(), []);

  const [mode, setMode] = useState(() => (
    unsubscribeToken
      ? 'unsubscribe'
      : (sharedHandoffPayload ? 'handoff' : (Object.keys(initialAnswers).length > 0 ? 'results' : 'welcome'))
  ));
  const previousModeRef = useRef(mode);
  const previousTrackedRouteRef = useRef(getRouteFromMode(mode));
  const modeEnteredAtRef = useRef(0);
  const perfMetricSentRef = useRef(new Set());
  const [answers, setAnswers] = useState(() => initialAnswers);
  const [unsubscribeState, setUnsubscribeState] = useState(() => (unsubscribeToken ? 'loading' : 'idle'));
  const [drawData, setDrawData] = useState(() => initialDrawSnapshot?.data || getFallbackLatestDraws());
  const [drawSource, setDrawSource] = useState(() => initialDrawSnapshot?.source || 'local-fallback');
  const [categoryInfo, setCategoryInfo] = useState(() => (
    Array.isArray(initialCategorySnapshot?.data) && initialCategorySnapshot.data.length > 0
      ? initialCategorySnapshot.data
      : getFallbackCategoryDrawInfo()
  ));
  const [dataSyncState, setDataSyncState] = useState(() => ({
    syncing: false,
    lastError: '',
    lastSyncedAt: '',
    drawFreshness: initialDrawSnapshot?.freshness || 'stale',
    categoryFreshness: initialCategorySnapshot?.freshness || 'stale',
    drawRevalidating: false,
    categoryRevalidating: false,
  }));

  useEffect(() => {
    if (!unsubscribeToken) return;
    let mounted = true;
    unsubscribeAlertsByToken(unsubscribeToken)
      .then((res) => {
        if (!mounted) return;
        setUnsubscribeState(res.status === 'ok' ? 'success' : 'notfound');
      })
      .catch((error) => {
        if (!mounted) return;
        setUnsubscribeState('error');
        trackError('unsubscribe_request_failed', error, {
          source: 'unsubscribe_flow',
          has_token: !!unsubscribeToken,
        });
      });
    return () => { mounted = false; };
  }, [unsubscribeToken]);

  const syncDataSources = useCallback(async ({ forceRefresh = false, reason = 'initial' } = {}) => {
    setDataSyncState((prev) => ({ ...prev, syncing: true, lastError: '' }));
    let latestError = null;
    let categoryError = null;
    let latestMeta = { freshness: 'fresh', revalidating: false };
    let categoryMeta = { freshness: 'fresh', revalidating: false };

    const handleLatestRevalidated = (latest) => {
      if (latest?.status === 'ok' && latest.data) {
        setDrawData(latest.data);
        setDrawSource(latest.source || 'local-fallback');
      }
      setDataSyncState((prev) => ({
        ...prev,
        drawFreshness: latest?.freshness || prev.drawFreshness,
        drawRevalidating: false,
        lastSyncedAt: new Date().toISOString(),
      }));
      trackEvent('draw_data_swr_revalidated', {
        resource: 'latest_draws',
        source: latest?.source || 'unknown',
        freshness: latest?.freshness || 'unknown',
      });
    };

    const handleCategoryRevalidated = (category) => {
      if (category?.status === 'ok' && Array.isArray(category.data) && category.data.length > 0) {
        setCategoryInfo(category.data);
      }
      setDataSyncState((prev) => ({
        ...prev,
        categoryFreshness: category?.freshness || prev.categoryFreshness,
        categoryRevalidating: false,
        lastSyncedAt: new Date().toISOString(),
      }));
      trackEvent('draw_data_swr_revalidated', {
        resource: 'category_config',
        source: category?.source || 'unknown',
        freshness: category?.freshness || 'unknown',
      });
    };

    try {
      const latest = await withRetries(
        () => getLatestDraws({ forceRefresh, onRevalidated: handleLatestRevalidated }),
        { retries: 2, baseDelayMs: 250 }
      );
      if (latest?.status === 'ok' && latest.data) {
        setDrawData(latest.data);
        setDrawSource(latest.source || 'local-fallback');
      }
      latestMeta = {
        freshness: latest?.freshness || 'fresh',
        revalidating: !!latest?.revalidating,
      };
    } catch (error) {
      latestError = error;
      trackError('draw_data_sync_error', error, {
        reason,
        resource: 'latest_draws',
        force_refresh: !!forceRefresh,
      });
      setDrawData(getFallbackLatestDraws());
      setDrawSource('local-fallback');
      latestMeta = { freshness: 'stale', revalidating: false };
    }

    try {
      const category = await withRetries(
        () => getCategoryDrawInfo({ forceRefresh, onRevalidated: handleCategoryRevalidated }),
        { retries: 2, baseDelayMs: 250 }
      );
      if (category?.status === 'ok' && Array.isArray(category.data) && category.data.length > 0) {
        setCategoryInfo(category.data);
      } else {
        setCategoryInfo(getFallbackCategoryDrawInfo());
      }
      categoryMeta = {
        freshness: category?.freshness || 'fresh',
        revalidating: !!category?.revalidating,
      };
    } catch (error) {
      categoryError = error;
      trackError('draw_data_sync_error', error, {
        reason,
        resource: 'category_config',
        force_refresh: !!forceRefresh,
      });
      setCategoryInfo(getFallbackCategoryDrawInfo());
      categoryMeta = { freshness: 'stale', revalidating: false };
    }

    const degraded = !!latestError || !!categoryError;
    setDataSyncState({
      syncing: false,
      lastError: degraded ? 'Live sync is currently unavailable. Showing local data mode.' : '',
      lastSyncedAt: new Date().toISOString(),
      drawFreshness: latestMeta.freshness,
      categoryFreshness: categoryMeta.freshness,
      drawRevalidating: latestMeta.revalidating,
      categoryRevalidating: categoryMeta.revalidating,
    });

    if (degraded) {
      trackEvent('draw_data_sync_degraded', {
        reason,
        latest_error: String(latestError?.message || ''),
        category_error: String(categoryError?.message || ''),
      });
    } else {
      trackEvent('draw_data_sync_ok', {
        reason,
        source: 'live',
      });
    }
  }, []);
  const handleRetryDataSync = useCallback(() => {
    void syncDataSources({ forceRefresh: true, reason: 'manual_retry' });
  }, [syncDataSources]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncDataSources();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [syncDataSources]);
  useEffect(() => {
    try {
      const summary = runPolicyAutopilotSync({ reason: 'app_boot' });
      trackEvent('policy_autopilot_sync', {
        reason: 'app_boot',
        status: summary.status,
        active_policy_id: summary.activePolicyId || '',
        policy_source: summary.policySource || '',
        changed: !!summary.changed,
        recalculated_profiles: Number(summary.recalculation?.updated || 0),
      });
    } catch (error) {
      trackError('policy_autopilot_sync_failed', error, { reason: 'app_boot' });
    }
  }, []);
  useEffect(() => {
    const onPolicyRulesetUpdated = () => {
      try {
        const summary = runPolicyAutopilotSync({
          reason: 'policy_override_updated',
          force: true,
        });
        trackEvent('policy_autopilot_sync', {
          reason: 'policy_override_updated',
          status: summary.status,
          active_policy_id: summary.activePolicyId || '',
          policy_source: summary.policySource || '',
          changed: !!summary.changed,
          recalculated_profiles: Number(summary.recalculation?.updated || 0),
        });
      } catch (error) {
        trackError('policy_autopilot_sync_failed', error, { reason: 'policy_override_updated' });
      }
    };
    window.addEventListener('crs-policy-ruleset-updated', onPolicyRulesetUpdated);
    return () => {
      window.removeEventListener('crs-policy-ruleset-updated', onPolicyRulesetUpdated);
    };
  }, []);
  useEffect(() => {
    if (mode === 'welcome') {
      prefetchWizardChunk({ idle: true });
      return;
    }
    if (mode === 'wizard') {
      prefetchResultsChunk({ idle: true });
      return;
    }
    if (mode === 'results') {
      prefetchPathCoachChunk({ idle: true });
    }
  }, [mode]);

  const handleStart = useCallback((resume) => {
    if (resume && shouldAutoSaveProgress) {
      const saved = loadProgress();
      if (saved) setAnswers(saved);
    }
    trackEvent('wizard_started', { resumed: !!resume });
    setMode('wizard');
  }, [shouldAutoSaveProgress]);

  const handleFinish = useCallback((ans) => {
    setAnswers(ans);
    clearProgress();
    trackEvent('wizard_completed', { answer_count: Object.keys(ans || {}).length });
    setMode('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleRestart = useCallback(() => {
    setAnswers({});
    clearProgress();
    trackEvent('calculator_restarted');
    window.history.replaceState(null, '', window.location.pathname);
    setMode('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const hasSaved = shouldAutoSaveProgress && !!loadProgress();

  // Back-to-top button
  const [showTop, setShowTop] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(() => {
    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const standaloneNavigator = window.navigator?.standalone === true;
    return !!(standaloneMedia || standaloneNavigator);
  });
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      if (typeof event?.prompt === 'function') {
        setDeferredInstallPrompt(event);
      }
    };
    const onInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallApp = useCallback(async () => {
    if (!deferredInstallPrompt) return;
    trackEvent('install_prompt_triggered');
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === 'accepted') {
      setDeferredInstallPrompt(null);
      trackEvent('install_prompt_accepted');
    } else {
      trackEvent('install_prompt_dismissed');
    }
  }, [deferredInstallPrompt]);

  useEffect(() => {
    const refreshSettings = () => {
      setAccountSettings(readAccountSettings());
    };
    window.addEventListener('storage', refreshSettings);
    window.addEventListener('crs-account-settings-updated', refreshSettings);
    return () => {
      window.removeEventListener('storage', refreshSettings);
      window.removeEventListener('crs-account-settings-updated', refreshSettings);
    };
  }, []);
  useEffect(() => {
    const refreshRuntimeFlags = () => {
      setRuntimeFlags(readRuntimeFlags());
    };
    window.addEventListener('storage', refreshRuntimeFlags);
    window.addEventListener('crs-runtime-flags-updated', refreshRuntimeFlags);
    return () => {
      window.removeEventListener('storage', refreshRuntimeFlags);
      window.removeEventListener('crs-runtime-flags-updated', refreshRuntimeFlags);
    };
  }, []);
  useEffect(() => {
    if (modeEnteredAtRef.current !== 0) return;
    modeEnteredAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }, []);
  useEffect(() => {
    if (!runtimeFlags.enablePerfTelemetry) return undefined;
    const onWindowError = (event) => {
      const error = event?.error instanceof Error
        ? event.error
        : new Error(event?.message || 'Window error');
      trackError('app_window_error', error, {
        source: 'window_error',
        filename: event?.filename || '',
        line: Number(event?.lineno || 0),
        column: Number(event?.colno || 0),
      });
    };
    const onUnhandledRejection = (event) => {
      const reason = event?.reason;
      const error = reason instanceof Error
        ? reason
        : new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection');
      trackError('app_unhandled_rejection', error, {
        source: 'unhandled_rejection',
        reason_type: typeof reason,
      });
    };
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [runtimeFlags.enablePerfTelemetry]);
  useEffect(() => {
    if (!runtimeFlags.enablePerfTelemetry) return;
    const route = getRouteFromMode(mode);
    trackEvent('perf_route_view', {
      mode,
      route,
      previous_route: previousTrackedRouteRef.current,
      transition_type: previousTrackedRouteRef.current === route ? 'initial' : 'virtual_navigation',
    });
    previousTrackedRouteRef.current = route;
  }, [mode, runtimeFlags.enablePerfTelemetry]);
  useEffect(() => {
    if (!runtimeFlags.enablePerfTelemetry) return;
    try {
      const navEntry = window.performance?.getEntriesByType?.('navigation')?.[0];
      if (!navEntry) return;
      trackEvent('perf_navigation_summary', {
        type: navEntry.type || 'navigate',
        dom_content_loaded_ms: Math.round(navEntry.domContentLoadedEventEnd || 0),
        load_event_ms: Math.round(navEntry.loadEventEnd || 0),
        transfer_kb: Number(((navEntry.transferSize || 0) / 1024).toFixed(1)),
      });
    } catch {
      // no-op on unsupported browsers
    }
  }, [runtimeFlags.enablePerfTelemetry]);
  useEffect(() => {
    if (!runtimeFlags.enablePerfTelemetry) return undefined;
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return undefined;

    const observers = [];
    const sentMetrics = perfMetricSentRef.current;
    let lcpValue = 0;
    let lcpSize = 0;
    let clsValue = 0;
    let inpValue = 0;
    let inpSamples = 0;
    let longTaskCount = 0;
    let longTaskTotal = 0;
    let longTaskMax = 0;

    const reportMetric = (metric, rawValue, extra = {}) => {
      if (!Number.isFinite(rawValue) || rawValue <= 0) return;
      if (sentMetrics.has(metric)) return;
      sentMetrics.add(metric);
      const rounded = metric === 'CLS' ? Number(rawValue.toFixed(3)) : Math.round(rawValue);
      trackEvent('perf_web_vital', {
        metric,
        value: rounded,
        rating: getVitalRating(metric, rawValue),
        ...extra,
      });
    };
    const observeType = (type, handler) => {
      if (!hasSupportedEntryType(type)) return;
      try {
        const observer = new PerformanceObserver((list) => {
          handler(list.getEntries() || []);
        });
        observer.observe(type === 'event'
          ? { type, buffered: true, durationThreshold: 16 }
          : { type, buffered: true });
        observers.push(observer);
      } catch {
        // no-op for browsers that partially support observer types
      }
    };

    observeType('paint', (entries) => {
      const fcpEntry = entries.find((entry) => entry.name === 'first-contentful-paint');
      if (!fcpEntry) return;
      reportMetric('FCP', Number(fcpEntry.startTime || 0));
    });
    observeType('largest-contentful-paint', (entries) => {
      const latest = entries[entries.length - 1];
      if (!latest) return;
      lcpValue = Number(latest.startTime || 0);
      lcpSize = Number(latest.size || 0);
    });
    observeType('layout-shift', (entries) => {
      for (const entry of entries) {
        if (entry.hadRecentInput) continue;
        clsValue += Number(entry.value || 0);
      }
    });
    observeType('event', (entries) => {
      for (const entry of entries) {
        const duration = Number(entry.duration || 0);
        if (!Number.isFinite(duration) || duration <= 0) continue;
        inpValue = Math.max(inpValue, duration);
        inpSamples += 1;
      }
    });
    observeType('longtask', (entries) => {
      for (const entry of entries) {
        const duration = Number(entry.duration || 0);
        if (!Number.isFinite(duration) || duration <= 0) continue;
        longTaskCount += 1;
        longTaskTotal += duration;
        longTaskMax = Math.max(longTaskMax, duration);
      }
    });

    let flushed = false;
    const flush = () => {
      if (flushed) return;
      flushed = true;
      reportMetric('LCP', lcpValue, { element_size_px: Math.round(lcpSize) });
      reportMetric('CLS', clsValue);
      reportMetric('INP', inpValue, { sample_count: inpSamples });
      if (longTaskCount > 0 && !sentMetrics.has('LONG_TASK_SUMMARY')) {
        sentMetrics.add('LONG_TASK_SUMMARY');
        trackEvent('perf_long_task_summary', {
          task_count: longTaskCount,
          max_duration_ms: Math.round(longTaskMax),
          total_duration_ms: Math.round(longTaskTotal),
          average_duration_ms: Math.round(longTaskTotal / longTaskCount),
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('visibilitychange', onVisibilityChange, true);
    window.addEventListener('pagehide', flush, true);
    return () => {
      flush();
      document.removeEventListener('visibilitychange', onVisibilityChange, true);
      window.removeEventListener('pagehide', flush, true);
      observers.forEach((observer) => observer.disconnect());
    };
  }, [runtimeFlags.enablePerfTelemetry]);
  useEffect(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const previousMode = previousModeRef.current;
    if (!runtimeFlags.enablePerfTelemetry) {
      previousModeRef.current = mode;
      modeEnteredAtRef.current = now;
      return;
    }
    if (previousMode !== mode) {
      trackEvent('perf_mode_transition', {
        from_mode: previousMode,
        to_mode: mode,
        duration_ms: Math.max(Math.round(now - modeEnteredAtRef.current), 0),
      });
      previousModeRef.current = mode;
      modeEnteredAtRef.current = now;
    }
  }, [mode, runtimeFlags.enablePerfTelemetry]);

  useEffect(() => {
    document.documentElement.setAttribute('data-motion', effectiveMotionIntensity);
  }, [effectiveMotionIntensity]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--pointer-x', '50%');
    root.style.setProperty('--pointer-y', '40%');
    root.style.setProperty('--pointer-glow', effectiveMotionIntensity === 'off' ? '0' : '0.18');
  }, [effectiveMotionIntensity]);

  return (
    <div className="app">
      <div className="anime-bg" aria-hidden="true">
        <span className="anime-bg-aurora anime-bg-aurora--one" />
        <span className="anime-bg-vignette" />
      </div>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header
        canInstallApp={!isStandalone && !!deferredInstallPrompt}
        onInstallApp={handleInstallApp}
        motionIntensity={effectiveMotionIntensity}
      />
      <main className="main" role="main" id="main-content">
        <AnimatePresence mode="wait">
          {mode === 'welcome' && (
            <Suspense fallback={<div className="loading-fallback"><Loader /></div>}>
              <WelcomeScreen
                key="welcome"
                onStart={handleStart}
                onPrepareStart={() => prefetchWizardChunk()}
                hasSaved={hasSaved}
                drawData={drawData}
                drawSource={drawSource}
                motionIntensity={effectiveMotionIntensity}
              />
            </Suspense>
          )}
          {mode === 'wizard' && (
            <Suspense fallback={<div className="loading-fallback"><Loader /></div>}>
              <Wizard
                key="wizard"
                onFinish={handleFinish}
                onProgress={shouldAutoSaveProgress ? saveProgress : undefined}
                initialAnswers={answers}
                motionIntensity={effectiveMotionIntensity}
              />
            </Suspense>
          )}
          {mode === 'unsubscribe' && (
            <div className="card unsubscribe-card">
              <h3>Draw alert preferences</h3>
              {unsubscribeState === 'loading' && <p>Processing your unsubscribe request…</p>}
              {unsubscribeState === 'success' && <p>You’ve been unsubscribed from draw alerts successfully.</p>}
              {unsubscribeState === 'notfound' && <p>This unsubscribe link is invalid or already inactive.</p>}
              {unsubscribeState === 'error' && <p>We couldn’t process this request right now. Please try again later.</p>}
              <button type="button" className="btn-restart" onClick={() => setMode('welcome')}>
                Back to calculator
              </button>
            </div>
          )}
          {mode === 'handoff' && (
            <div className="card unsubscribe-card">
              <h3>Consultant handoff summary</h3>
              {sharedHandoffPayload ? (
                <>
                  <p>
                    Score: <strong>{sharedHandoffPayload?.summary?.score ?? '—'}</strong>
                    {' · '}
                    Avg cutoff: <strong>{sharedHandoffPayload?.summary?.averageCutoff ?? '—'}</strong>
                    {' · '}
                    Confidence: <strong>{sharedHandoffPayload?.summary?.confidenceBand || 'Unknown'}</strong>
                  </p>
                  <p>
                    Generated: {sharedHandoffPayload?.generatedAt ? new Date(sharedHandoffPayload.generatedAt).toLocaleString() : '—'}
                  </p>
                </>
              ) : (
                <p>This handoff link is invalid or expired.</p>
              )}
              <button
                type="button"
                className="btn-restart"
                onClick={() => {
                  window.history.replaceState(null, '', window.location.pathname);
                  setMode('welcome');
                }}
              >
                Open calculator
              </button>
            </div>
          )}
          {mode === 'results' && (
            <Suspense fallback={<div className="loading-fallback"><Loader /></div>}>
              <Results
                key="results"
                answers={answers}
                onRestart={handleRestart}
                drawData={drawData}
                drawSource={drawSource}
                categoryInfo={categoryInfo}
                motionIntensity={effectiveMotionIntensity}
                onRetryDataSync={handleRetryDataSync}
                isDataSyncing={dataSyncState.syncing}
                dataSyncError={dataSyncState.lastError}
                dataSyncFreshness={dataSyncState.drawFreshness === 'stale' || dataSyncState.categoryFreshness === 'stale' ? 'stale' : 'fresh'}
                isDataRevalidating={dataSyncState.drawRevalidating || dataSyncState.categoryRevalidating}
                dataLastSyncedAt={dataSyncState.lastSyncedAt}
              />
            </Suspense>
          )}
        </AnimatePresence>
      </main>
      <footer className="footer">
        <p>© {new Date().getFullYear()} {t('footer.copy')}</p>
        <p className="footer-legal-links">
          <a href="/guides.html">Guides</a>
          <span aria-hidden="true"> · </span>
          <a href="/terms.html">Terms of Service</a>
          <span aria-hidden="true"> · </span>
          <a href="/privacy.html">Privacy Policy</a>
          <span aria-hidden="true"> · </span>
          <a href="/trust.html">Trust Center</a>
        </p>
      </footer>
      {showTop && (
        <button
          type="button"
          className="btn-top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          ↑
        </button>
      )}
    </div>
  );
}
