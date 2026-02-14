const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getHeaders(prefer = null) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function parseErrorResponse(res) {
  try {
    const text = await res.text();
    return text || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function isCloudProfilesEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function upsertProfileCloud(profile) {
  if (!isCloudProfilesEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured' };
  }

  const payload = [{
    id: profile.id,
    name: profile.name || null,
    score: Number(profile.score) || 0,
    email: profile.email || null,
    alert_opt_in: !!profile.alertOptIn,
    alert_token: profile.alertToken || null,
    profile_json: profile.answers || {},
    updated_at: new Date().toISOString(),
  }];

  const res = await fetch(`${SUPABASE_URL}/rest/v1/saved_profiles?on_conflict=id`, {
    method: 'POST',
    headers: getHeaders('resolution=merge-duplicates,return=representation'),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(`Supabase upsert failed: ${message}`);
  }

  const data = await res.json();
  return { status: 'ok', data };
}

export async function unsubscribeAlertsByToken(token) {
  if (!token) return { status: 'skipped', reason: 'Missing token' };
  if (!isCloudProfilesEnabled()) {
    return { status: 'skipped', reason: 'Supabase env vars are not configured' };
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saved_profiles?alert_token=eq.${encodeURIComponent(token)}`,
    {
      method: 'PATCH',
      headers: getHeaders('return=representation'),
      body: JSON.stringify({
        alert_opt_in: false,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(`Supabase unsubscribe failed: ${message}`);
  }

  const rows = await res.json();
  if (!rows.length) return { status: 'not-found' };
  return { status: 'ok', data: rows[0] };
}
