const TRACKING_KEY = 'crs-path-tracking-v1';

function readMap() {
  try {
    const raw = localStorage.getItem(TRACKING_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(TRACKING_KEY, JSON.stringify(map));
  } catch {
    // ignore write errors
  }
}

function addDays(dateIso, days) {
  const dt = new Date(dateIso || Date.now());
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
}

export function getTrackingStorageKey(userId = null, profileId = null) {
  if (userId) return `user:${userId}`;
  if (profileId) return `profile:${profileId}`;
  return 'guest:default';
}

export function loadPathTracking(storageKey) {
  if (!storageKey) return null;
  const map = readMap();
  return map[storageKey] || null;
}

export function savePathTracking(storageKey, tracking) {
  if (!storageKey || !tracking) return tracking;
  const map = readMap();
  map[storageKey] = tracking;
  writeMap(map);
  return tracking;
}

export function clearPathTracking(storageKey) {
  if (!storageKey) return;
  const map = readMap();
  delete map[storageKey];
  writeMap(map);
}

export function buildTrackingFromPlan(plan, currentScore, targetScore) {
  const now = new Date().toISOString();
  const milestones = (plan?.milestones || []).map((m) => ({
    ...m,
    done: false,
    completedAt: null,
  }));
  return {
    id: `track_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'active',
    startedAt: now,
    updatedAt: now,
    nextCheckInAt: addDays(now, 7),
    currentScore: Number(currentScore) || 0,
    targetScore: Number(targetScore) || Number(plan?.checks?.targetScore) || 0,
    selectedPath: plan,
    milestones,
    notes: [],
  };
}

export function getTrackingProgress(tracking) {
  const milestones = tracking?.milestones || [];
  if (!milestones.length) return 0;
  const doneCount = milestones.filter((m) => m.done).length;
  return Math.round((doneCount / milestones.length) * 100);
}

export function toggleMilestone(tracking, milestoneId) {
  if (!tracking) return tracking;
  const milestones = (tracking.milestones || []).map((m) => {
    if (m.id !== milestoneId) return m;
    const done = !m.done;
    return {
      ...m,
      done,
      completedAt: done ? new Date().toISOString() : null,
    };
  });
  const progress = milestones.length ? milestones.filter((m) => m.done).length / milestones.length : 0;
  return {
    ...tracking,
    milestones,
    status: progress >= 1 ? 'completed' : 'active',
    updatedAt: new Date().toISOString(),
  };
}

export function updateTrackingScore(tracking, currentScore) {
  if (!tracking) return tracking;
  return {
    ...tracking,
    currentScore,
    updatedAt: new Date().toISOString(),
  };
}

export function deferNextCheckIn(tracking, days = 7) {
  if (!tracking) return tracking;
  const base = tracking.nextCheckInAt || new Date().toISOString();
  return {
    ...tracking,
    nextCheckInAt: addDays(base, days),
    updatedAt: new Date().toISOString(),
  };
}

export function appendTrackingNote(tracking, text) {
  if (!tracking || !text?.trim()) return tracking;
  const notes = [...(tracking.notes || []), {
    id: `note_${Date.now().toString(36)}`,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  }];
  return {
    ...tracking,
    notes,
    updatedAt: new Date().toISOString(),
  };
}

export function getCoachMessage(tracking) {
  if (!tracking) {
    return 'Choose a path to get a week-by-week action plan.';
  }
  if (tracking.status === 'completed') {
    return 'Great progress — this path is completed. Recalculate and pick your next upgrade path if needed.';
  }
  const next = (tracking.milestones || []).find((m) => !m.done);
  if (!next) {
    return 'Your milestone list is complete. Refresh your score and plan the next targeted move.';
  }
  return `Next best action: ${next.title}. Focus on this before adding new goals.`;
}
