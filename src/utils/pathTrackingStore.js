const TRACKING_KEY = 'crs-path-tracking-v1';
const DAILY_TASK_CAP = 540;
const DAILY_WEEKDAY_MINUTES = 55;
const DAILY_WEEKEND_MINUTES = 30;
const DAILY_STARTER_MINUTES = 25;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hasStorage() {
  return typeof localStorage !== 'undefined';
}

function toDateKey(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function fromDateKey(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function addDays(dateIso, days) {
  const dt = new Date(dateIso || Date.now());
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
}

function addDaysToKey(dateKey, days) {
  const dt = fromDateKey(dateKey);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toDateKey(dt);
}

function readMap() {
  if (!hasStorage()) return {};
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
  if (!hasStorage()) return;
  try {
    localStorage.setItem(TRACKING_KEY, JSON.stringify(map));
  } catch {
    // ignore write errors
  }
}

function normalizeMilestone(milestone, index) {
  if (!milestone || typeof milestone !== 'object') return null;
  const etaWeeks = Math.max(1, Number(milestone.etaWeeks) || 1);
  return {
    ...milestone,
    id: milestone.id || `m_${index + 1}`,
    title: milestone.title || `Milestone ${index + 1}`,
    details: milestone.details || '',
    etaWeeks,
    expectedGain: Number.isFinite(Number(milestone.expectedGain)) ? Number(milestone.expectedGain) : 0,
    done: !!milestone.done,
    completedAt: milestone.completedAt || null,
  };
}

function normalizeDailyTask(task, index) {
  if (!task || typeof task !== 'object') return null;
  const date = toDateKey(task.date || task.dateKey || task.scheduledFor);
  if (!date) return null;
  return {
    id: task.id || `d_${index + 1}`,
    date,
    milestoneId: task.milestoneId || null,
    title: String(task.title || 'Daily action').trim(),
    details: String(task.details || '').trim(),
    expectedMinutes: Math.max(10, Number(task.expectedMinutes) || DAILY_WEEKDAY_MINUTES),
    expectedGain: Number.isFinite(Number(task.expectedGain)) ? Number(task.expectedGain) : 0,
    done: !!task.done,
    completedAt: task.completedAt || null,
  };
}

function buildDailyTasksFromPlan(plan, startedAtIso) {
  const milestones = (plan?.milestones || [])
    .map((milestone, index) => normalizeMilestone(milestone, index))
    .filter(Boolean);
  if (!milestones.length) return [];

  const startKey = toDateKey(startedAtIso || new Date());
  if (!startKey) return [];

  const tasks = [];
  let dayOffset = 0;

  for (const milestone of milestones) {
    const durationDays = clamp(Math.round((Number(milestone.etaWeeks) || 1) * 7), 7, 224);
    const perDayGain = durationDays > 0
      ? Number(((Number(milestone.expectedGain) || 0) / durationDays).toFixed(2))
      : 0;

    for (let i = 0; i < durationDays && tasks.length < DAILY_TASK_CAP; i++) {
      const taskDateKey = addDaysToKey(startKey, dayOffset + i);
      const weekday = fromDateKey(taskDateKey).getUTCDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const isFirstDay = i === 0;

      let title = `Focused practice: ${milestone.title}`;
      let details = milestone.details || 'Work toward this milestone today.';
      let expectedMinutes = isWeekend ? DAILY_WEEKEND_MINUTES : DAILY_WEEKDAY_MINUTES;

      if (isFirstDay) {
        title = `Kickoff plan: ${milestone.title}`;
        details = `Set tasks and resources for this phase. ${milestone.details || ''}`.trim();
        expectedMinutes = DAILY_STARTER_MINUTES;
      } else if (isWeekend) {
        title = `Weekly review: ${milestone.title}`;
        details = `Light revision + progress check. ${milestone.details || ''}`.trim();
      }

      tasks.push({
        id: `${plan?.id || 'path'}-d${tasks.length + 1}`,
        date: taskDateKey,
        milestoneId: milestone.id,
        title,
        details,
        expectedMinutes,
        expectedGain: perDayGain,
        done: false,
        completedAt: null,
      });
    }

    dayOffset += durationDays;
    if (tasks.length >= DAILY_TASK_CAP) break;
  }

  return tasks;
}

function normalizeTracking(tracking) {
  if (!tracking || typeof tracking !== 'object') return null;
  const startedAt = tracking.startedAt || new Date().toISOString();
  const milestones = (tracking.milestones || [])
    .map((milestone, index) => normalizeMilestone(milestone, index))
    .filter(Boolean);
  const existingDailyTasks = (tracking.dailyTasks || [])
    .map((task, index) => normalizeDailyTask(task, index))
    .filter(Boolean);
  const dailyTasks = existingDailyTasks.length > 0
    ? existingDailyTasks
    : buildDailyTasksFromPlan(tracking.selectedPath, startedAt);

  return {
    ...tracking,
    id: tracking.id || `track_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: tracking.status || 'active',
    startedAt,
    updatedAt: tracking.updatedAt || startedAt,
    nextCheckInAt: tracking.nextCheckInAt || addDays(startedAt, 7),
    currentScore: Number(tracking.currentScore) || 0,
    targetScore: Number(tracking.targetScore) || Number(tracking?.selectedPath?.checks?.targetScore) || 0,
    selectedPath: tracking.selectedPath || null,
    milestones,
    dailyTasks,
    notes: Array.isArray(tracking.notes) ? tracking.notes : [],
    dailyStats: tracking.dailyStats || null,
  };
}

function finalizeTracking(tracking, { touchUpdatedAt = true } = {}) {
  const normalized = normalizeTracking(tracking);
  if (!normalized) return null;
  const progressPct = getTrackingProgress(normalized);
  const dailyStats = getDailyProgressStats(normalized);
  const allMilestonesDone = normalized.milestones.length > 0 && normalized.milestones.every((m) => m.done);
  const allDailyDone = normalized.dailyTasks.length === 0 || normalized.dailyTasks.every((task) => task.done);
  const status = allMilestonesDone && allDailyDone ? 'completed' : 'active';

  return {
    ...normalized,
    status,
    progressPct,
    dailyStats,
    updatedAt: touchUpdatedAt ? new Date().toISOString() : normalized.updatedAt,
  };
}

export function getTrackingStorageKey(userId = null, profileId = null) {
  if (userId) return `user:${userId}`;
  if (profileId) return `profile:${profileId}`;
  return 'guest:default';
}

export function loadPathTracking(storageKey) {
  if (!storageKey) return null;
  const map = readMap();
  return finalizeTracking(map[storageKey], { touchUpdatedAt: false });
}

export function savePathTracking(storageKey, tracking) {
  if (!storageKey || !tracking) return tracking;
  const map = readMap();
  const normalized = finalizeTracking(tracking, { touchUpdatedAt: false });
  map[storageKey] = normalized;
  writeMap(map);
  return normalized;
}

export function clearPathTracking(storageKey) {
  if (!storageKey) return;
  const map = readMap();
  delete map[storageKey];
  writeMap(map);
}

export function buildTrackingFromPlan(plan, currentScore, targetScore) {
  const now = new Date().toISOString();
  const milestones = (plan?.milestones || []).map((milestone, index) => normalizeMilestone({
    ...milestone,
    done: false,
    completedAt: null,
  }, index)).filter(Boolean);
  const dailyTasks = buildDailyTasksFromPlan(plan, now);

  return finalizeTracking({
    id: `track_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'active',
    startedAt: now,
    updatedAt: now,
    nextCheckInAt: addDays(now, 7),
    currentScore: Number(currentScore) || 0,
    targetScore: Number(targetScore) || Number(plan?.checks?.targetScore) || 0,
    selectedPath: plan,
    milestones,
    dailyTasks,
    notes: [],
  }, { touchUpdatedAt: true });
}

export function getTrackingProgress(tracking) {
  const milestones = tracking?.milestones || [];
  const dailyTasks = tracking?.dailyTasks || [];
  const milestonePct = milestones.length
    ? milestones.filter((milestone) => milestone.done).length / milestones.length
    : 0;
  const dailyPct = dailyTasks.length
    ? dailyTasks.filter((task) => task.done).length / dailyTasks.length
    : 0;

  if (!milestones.length && !dailyTasks.length) return 0;
  if (!dailyTasks.length) return Math.round(milestonePct * 100);
  if (!milestones.length) return Math.round(dailyPct * 100);
  return Math.round(((milestonePct * 0.65) + (dailyPct * 0.35)) * 100);
}

export function getDailyProgressStats(tracking) {
  const tasks = (tracking?.dailyTasks || [])
    .map((task, index) => normalizeDailyTask(task, index))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  const todayKey = toDateKey(new Date());

  if (!tasks.length) {
    return {
      totalTasks: 0,
      completedTasks: 0,
      completionPct: 0,
      dueToday: 0,
      completedToday: 0,
      overdueTasks: 0,
      expectedByToday: 0,
      completedByToday: 0,
      paceStatus: 'not-started',
      streakDays: 0,
      todayKey,
    };
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.done).length;
  const dueToday = tasks.filter((task) => task.date === todayKey).length;
  const completedToday = tasks.filter((task) => task.date === todayKey && task.done).length;
  const expectedByToday = tasks.filter((task) => task.date <= todayKey).length;
  const completedByToday = tasks.filter((task) => task.date <= todayKey && task.done).length;
  const overdueTasks = tasks.filter((task) => task.date < todayKey && !task.done).length;
  const completionPct = Math.round((completedTasks / totalTasks) * 100);

  let paceStatus = 'not-started';
  if (expectedByToday > 0) {
    const pace = completedByToday / expectedByToday;
    if (pace >= 1) paceStatus = 'on-track';
    else if (pace >= 0.75) paceStatus = 'slightly-behind';
    else paceStatus = 'behind';
  }

  const completedDaySet = new Set(
    tasks
      .filter((task) => task.done)
      .map((task) => toDateKey(task.completedAt || task.date))
      .filter(Boolean)
  );

  let streakCursor = todayKey;
  if (!completedDaySet.has(streakCursor) && dueToday === 0) {
    streakCursor = addDaysToKey(todayKey, -1);
  }

  let streakDays = 0;
  while (completedDaySet.has(streakCursor)) {
    streakDays += 1;
    streakCursor = addDaysToKey(streakCursor, -1);
  }

  return {
    totalTasks,
    completedTasks,
    completionPct,
    dueToday,
    completedToday,
    overdueTasks,
    expectedByToday,
    completedByToday,
    paceStatus,
    streakDays,
    todayKey,
  };
}

export function getDailyTasksForDate(tracking, dateKey = toDateKey(new Date())) {
  const tasks = tracking?.dailyTasks || [];
  return tasks.filter((task) => toDateKey(task.date) === dateKey);
}

export function getUpcomingDailyTasks(tracking, days = 7, fromDateKey = toDateKey(new Date())) {
  const endKey = addDaysToKey(fromDateKey, Math.max(days - 1, 0));
  return (tracking?.dailyTasks || []).filter((task) => {
    const key = toDateKey(task.date);
    return key >= fromDateKey && key <= endKey;
  });
}

export function estimateTrackingCompletion(tracking) {
  const normalized = normalizeTracking(tracking);
  if (!normalized || !normalized.dailyTasks.length) return null;
  const stats = getDailyProgressStats(normalized);
  const totalDays = normalized.dailyTasks.length;
  const startKey = normalized.dailyTasks[0]?.date || toDateKey(normalized.startedAt);
  const baselineDays = totalDays;
  const observedPace = stats.expectedByToday > 0
    ? (stats.completedByToday / stats.expectedByToday)
    : 1;
  const paceMultiplier = clamp(observedPace || 1, 0.45, 1.35);
  const projectedDays = Math.max(1, Math.round(totalDays / paceMultiplier));
  const baselineDate = addDaysToKey(startKey, baselineDays - 1);
  const projectedDate = addDaysToKey(startKey, projectedDays - 1);

  return {
    baselineDate,
    projectedDate,
    paceMultiplier,
    baselineDays,
    projectedDays,
    delayDays: projectedDays - baselineDays,
  };
}

export function toggleMilestone(tracking, milestoneId) {
  if (!tracking) return tracking;
  const milestones = (tracking.milestones || []).map((milestone) => {
    if (milestone.id !== milestoneId) return milestone;
    const done = !milestone.done;
    return {
      ...milestone,
      done,
      completedAt: done ? new Date().toISOString() : null,
    };
  });
  return finalizeTracking({
    ...tracking,
    milestones,
  }, { touchUpdatedAt: true });
}

export function toggleDailyTask(tracking, taskId) {
  if (!tracking) return tracking;
  const dailyTasks = (tracking.dailyTasks || []).map((task) => {
    if (task.id !== taskId) return task;
    const done = !task.done;
    return {
      ...task,
      done,
      completedAt: done ? new Date().toISOString() : null,
    };
  });
  return finalizeTracking({
    ...tracking,
    dailyTasks,
  }, { touchUpdatedAt: true });
}

export function updateTrackingScore(tracking, currentScore) {
  if (!tracking) return tracking;
  return finalizeTracking({
    ...tracking,
    currentScore: Number(currentScore) || 0,
  }, { touchUpdatedAt: true });
}

export function deferNextCheckIn(tracking, days = 7) {
  if (!tracking) return tracking;
  const base = tracking.nextCheckInAt || new Date().toISOString();
  return finalizeTracking({
    ...tracking,
    nextCheckInAt: addDays(base, days),
  }, { touchUpdatedAt: true });
}

export function appendTrackingNote(tracking, text) {
  if (!tracking || !text?.trim()) return tracking;
  const notes = [...(tracking.notes || []), {
    id: `note_${Date.now().toString(36)}`,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  }];
  return finalizeTracking({
    ...tracking,
    notes,
  }, { touchUpdatedAt: true });
}

export function getCoachMessage(tracking) {
  if (!tracking) {
    return 'Choose an expert path to get a daily action plan.';
  }
  if (tracking.status === 'completed') {
    return 'Great progress — this path is complete. Recalculate and choose your next upgrade target.';
  }

  const stats = getDailyProgressStats(tracking);
  const todayKey = toDateKey(new Date());
  const todayPending = (tracking.dailyTasks || []).find((task) => task.date === todayKey && !task.done);
  if (stats.overdueTasks > 0) {
    return `You have ${stats.overdueTasks} overdue daily task(s). Clear one overdue task before adding new work.`;
  }
  if (todayPending) {
    return `Today’s focus: ${todayPending.title} (~${todayPending.expectedMinutes} min).`;
  }
  const nextMilestone = (tracking.milestones || []).find((milestone) => !milestone.done);
  if (nextMilestone) {
    return `Next milestone: ${nextMilestone.title}. Keep your streak alive with one focused task today.`;
  }
  return 'You are close to completion — finish remaining daily actions and refresh your score.';
}
