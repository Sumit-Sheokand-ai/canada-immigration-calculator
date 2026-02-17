import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

function tableMissing(error, tableName) {
  const message = String(error?.message || '');
  return new RegExp(`relation\\s+["']?public\\.${tableName}["']?\\s+does not exist`, 'i').test(message)
    || new RegExp(`table\\s+["']?${tableName}["']?\\s+not found`, 'i').test(message);
}

function toStatusError(prefix, error) {
  return new Error(`${prefix}: ${error?.message || error?.hint || String(error)}`);
}

function nowIso() {
  return new Date().toISOString();
}

export function isTrackingFeatureEnabled() {
  return isSupabaseConfigured;
}

export function isTrackingAccessActive(accessRow) {
  if (!accessRow) return false;
  const activeStates = new Set(['active', 'trialing', 'paid']);
  const status = String(accessRow.status || '').toLowerCase();
  if (!activeStates.has(status)) return false;
  if (!accessRow.current_period_end) return true;
  const periodEnd = new Date(accessRow.current_period_end).getTime();
  return Number.isFinite(periodEnd) && periodEnd > Date.now();
}

export async function getTrackingAccess(userId) {
  if (!userId) return { status: 'skipped', reason: 'Missing user id', active: false };
  if (!isTrackingFeatureEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured', active: false };
  }
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return { status: 'skipped', reason: 'Supabase client is unavailable', active: false };
  }
  const { data, error } = await supabase
    .from('user_tracking_access')
    .select('*')
    .eq('user_id', userId)
    .limit(1);

  if (error && tableMissing(error, 'user_tracking_access')) {
    return {
      status: 'skipped',
      reason: 'Tracking access table missing. Run the latest supabase/schema.sql.',
      active: false,
    };
  }
  if (error) throw toStatusError('Failed to fetch tracking access', error);
  const row = data?.[0] || null;
  return {
    status: 'ok',
    row,
    active: isTrackingAccessActive(row),
  };
}

export async function savePathTrackingCloud(userId, tracking) {
  if (!userId || !tracking) {
    return { status: 'skipped', reason: 'Missing user id or tracking payload' };
  }
  if (!isTrackingFeatureEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured' };
  }
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return { status: 'skipped', reason: 'Supabase client is unavailable' };
  }
  const payload = {
    id: tracking.id,
    user_id: userId,
    path_id: tracking.selectedPath?.id || null,
    target_score: Number(tracking.targetScore) || 0,
    start_score: Number(tracking.selectedPath?.checks?.currentScore) || 0,
    current_score: Number(tracking.currentScore) || 0,
    status: tracking.status || 'active',
    progress_pct: Number.isFinite(tracking.progressPct) ? tracking.progressPct : 0,
    next_check_in_at: tracking.nextCheckInAt || null,
    milestones_json: tracking.milestones || [],
    daily_tasks_json: tracking.dailyTasks || [],
    plan_json: tracking.selectedPath || {},
    notes_json: tracking.notes || [],
    updated_at: nowIso(),
  };

  const { data, error } = await supabase
    .from('user_path_tracking')
    .upsert(payload, { onConflict: 'id' })
    .select();

  if (error && tableMissing(error, 'user_path_tracking')) {
    return {
      status: 'skipped',
      reason: 'Path tracking table missing. Run the latest supabase/schema.sql.',
    };
  }
  if (error) throw toStatusError('Failed to save path tracking', error);
  return { status: 'ok', data: data?.[0] || null };
}

export async function loadLatestPathTrackingCloud(userId) {
  if (!userId) return { status: 'skipped', reason: 'Missing user id' };
  if (!isTrackingFeatureEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured' };
  }
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return { status: 'skipped', reason: 'Supabase client is unavailable', data: null };
  }

  const { data, error } = await supabase
    .from('user_path_tracking')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error && tableMissing(error, 'user_path_tracking')) {
    return {
      status: 'skipped',
      reason: 'Path tracking table missing. Run the latest supabase/schema.sql.',
      data: null,
    };
  }
  if (error) throw toStatusError('Failed to load path tracking', error);
  const row = data?.[0] || null;
  if (!row) return { status: 'ok', data: null };
  return {
    status: 'ok',
    data: {
      id: row.id,
      status: row.status || 'active',
      startedAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || nowIso(),
      nextCheckInAt: row.next_check_in_at || null,
      currentScore: row.current_score || 0,
      targetScore: row.target_score || 0,
      selectedPath: row.plan_json || null,
      milestones: Array.isArray(row.milestones_json) ? row.milestones_json : [],
      dailyTasks: Array.isArray(row.daily_tasks_json) ? row.daily_tasks_json : [],
      notes: Array.isArray(row.notes_json) ? row.notes_json : [],
    },
  };
}
