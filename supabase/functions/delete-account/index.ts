import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCorsPreflightRequest, jsonResponse } from '../_shared/cors.ts';

type DeleteAccountRequestBody = {
  confirm?: boolean;
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseBearerToken(authHeader: string | null) {
  if (!authHeader) return '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

serve(async (request) => {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const token = parseBearerToken(authHeader);
    if (!token) {
      return jsonResponse({ error: 'Missing bearer token' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as DeleteAccountRequestBody;
    if (!body?.confirm) {
      return jsonResponse({ error: 'Account deletion requires explicit confirmation.' }, { status: 400 });
    }

    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const supabaseServiceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return jsonResponse(
        { error: userError?.message || 'Could not resolve user from auth token' },
        { status: 401 }
      );
    }

    const userId = userData.user.id;
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, { status: 500 });
    }

    return jsonResponse({
      success: true,
      user_id: userId,
      message: 'Account deleted successfully.',
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
});
