import { isSupabaseConfigured, supabase } from './supabaseClient';

function normalizeProfilePayload(profile, userId) {
  const answers = profile.answers || {};
  return {
    id: profile.id,
    user_id: userId || null,
    name: profile.name || null,
    score: Number(profile.score) || 0,
    email: profile.email || null,
    alert_opt_in: !!profile.alertOptIn,
    alert_token: profile.alertToken || null,
    profile_json: {
      answers,
      tracking: {
        userId: userId || null,
        savedAt: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
  };
}

function isMissingUserIdColumnError(error) {
  const message = String(error?.message || '');
  return /column\s+["']?user_id["']?\s+does not exist/i.test(message);
}

function toErrorMessage(prefix, error) {
  const detail = error?.message || error?.hint || String(error);
  return `${prefix}: ${detail}`;
}

export function isCloudProfilesEnabled() {
  return isSupabaseConfigured && !!supabase;
}

export async function upsertProfileCloud(profile, options = {}) {
  if (!isCloudProfilesEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured' };
  }

  const userId = options.userId || null;
  const payload = normalizeProfilePayload(profile, userId);

  let data;
  let error;
  ({ data, error } = await supabase.from('saved_profiles').upsert(payload, { onConflict: 'id' }).select());

  if (error && userId && isMissingUserIdColumnError(error)) {
    const { user_id: _ignored, ...fallbackPayload } = payload;
    ({ data, error } = await supabase.from('saved_profiles').upsert(fallbackPayload, { onConflict: 'id' }).select());
  }

  if (error) {
    throw new Error(toErrorMessage('Supabase upsert failed', error));
  }
  return { status: 'ok', data: data || [] };
}

export async function unsubscribeAlertsByToken(token) {
  if (!token) return { status: 'skipped', reason: 'Missing token' };
  if (!isCloudProfilesEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured' };
  }

  const { data, error } = await supabase
    .from('saved_profiles')
    .update({
      alert_opt_in: false,
      updated_at: new Date().toISOString(),
    })
    .eq('alert_token', token)
    .select();

  if (error) {
    throw new Error(toErrorMessage('Supabase unsubscribe failed', error));
  }

  if (!data?.length) return { status: 'not-found' };
  return { status: 'ok', data: data[0] };
}

export async function listProfilesForUser(userId) {
  if (!userId) return { status: 'skipped', reason: 'Missing user id' };
  if (!isCloudProfilesEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured' };
  }

  const { data, error } = await supabase
    .from('saved_profiles')
    .select('id,name,score,email,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(12);

  if (error && isMissingUserIdColumnError(error)) {
    return {
      status: 'skipped',
      reason: 'saved_profiles.user_id column not found; run the latest supabase/schema.sql',
    };
  }
  if (error) {
    throw new Error(toErrorMessage('Supabase profile list failed', error));
  }
  return { status: 'ok', data: data || [] };
}

export async function setAlertPreferenceForUser(userId, alertOptIn) {
  if (!userId) return { status: 'skipped', reason: 'Missing user id' };
  if (!isCloudProfilesEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured' };
  }

  const { error, data } = await supabase
    .from('saved_profiles')
    .update({
      alert_opt_in: !!alertOptIn,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('id');

  if (error && isMissingUserIdColumnError(error)) {
    return {
      status: 'skipped',
      reason: 'saved_profiles.user_id column not found; run the latest supabase/schema.sql',
    };
  }
  if (error) {
    throw new Error(toErrorMessage('Supabase alert preference update failed', error));
  }

  return { status: 'ok', updatedCount: data?.length || 0 };
}

export async function setProfileEmailForUser(userId, email) {
  if (!userId) return { status: 'skipped', reason: 'Missing user id' };
  if (!isCloudProfilesEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured' };
  }

  const normalized = email ? String(email).trim().toLowerCase() : null;
  const { error, data } = await supabase
    .from('saved_profiles')
    .update({
      email: normalized || null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('id');

  if (error && isMissingUserIdColumnError(error)) {
    return {
      status: 'skipped',
      reason: 'saved_profiles.user_id column not found; run the latest supabase/schema.sql',
    };
  }
  if (error) {
    throw new Error(toErrorMessage('Supabase profile email update failed', error));
  }

  return { status: 'ok', updatedCount: data?.length || 0 };
}
