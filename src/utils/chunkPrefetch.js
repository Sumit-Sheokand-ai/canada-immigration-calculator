const prefetchedChunks = new Set();

function scheduleIdle(task) {
  if (typeof window === 'undefined') {
    task();
    return;
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task(), { timeout: 1800 });
  } else {
    window.setTimeout(task, 220);
  }
}

function prefetchOnce(key, importer) {
  if (prefetchedChunks.has(key)) return;
  prefetchedChunks.add(key);
  Promise.resolve()
    .then(() => importer())
    .catch(() => {
      prefetchedChunks.delete(key);
    });
}

function prefetch(key, importer, { idle = false } = {}) {
  const run = () => prefetchOnce(key, importer);
  if (idle) {
    scheduleIdle(run);
    return;
  }
  run();
}

export function prefetchWizardChunk(options) {
  prefetch('chunk:wizard', () => import('../components/Wizard.jsx'), options);
}

export function prefetchResultsChunk(options) {
  prefetch('chunk:results', () => import('../components/Results.jsx'), options);
}

export function prefetchPathCoachChunk(options) {
  prefetch('chunk:path-coach', () => import('../components/PathCoach.jsx'), options);
}

export function prefetchAuthModalChunk(options) {
  prefetch('chunk:auth-modal', () => import('../components/AuthModal.jsx'), options);
}
