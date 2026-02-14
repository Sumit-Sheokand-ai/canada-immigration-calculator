import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCorsPreflightRequest, jsonResponse } from '../_shared/cors.ts';

type TrackingAccessRow = {
  user_id: string;
  status: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalEnv(name: string, fallback = '') {
  return Deno.env.get(name) || fallback;
}

function parseBearerToken(authHeader: string | null) {
  if (!authHeader) return '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

function isAccessActive(row: TrackingAccessRow | null) {
  if (!row) return false;
  const status = String(row.status || '').toLowerCase();
  if (!new Set(['active', 'trialing', 'paid']).has(status)) return false;
  if (!row.current_period_end) return true;
  const periodEnd = new Date(row.current_period_end).getTime();
  return Number.isFinite(periodEnd) && periodEnd > Date.now();
}

serve(async (request) => {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const supabaseServiceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = requiredEnv('STRIPE_SECRET_KEY');
    const stripeTrackingPriceId = requiredEnv('STRIPE_TRACKING_PRICE_ID');
    const stripeTrialDays = Number(optionalEnv('STRIPE_TRACKING_TRIAL_DAYS', '0')) || 0;
    const appSiteUrl = optionalEnv('APP_SITE_URL', optionalEnv('SITE_URL', ''));
    const billingPortalReturnUrl = optionalEnv('STRIPE_BILLING_PORTAL_RETURN_URL', appSiteUrl || 'https://example.com');

    const authHeader = request.headers.get('Authorization');
    const token = parseBearerToken(authHeader);
    if (!token) {
      return jsonResponse({ error: 'Missing bearer token' }, { status: 401 });
    }

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

    const user = userData.user;
    const { data: accessRows, error: accessError } = await serviceClient
      .from('user_tracking_access')
      .select('user_id,status,stripe_customer_id,current_period_end')
      .eq('user_id', user.id)
      .limit(1);
    if (accessError) {
      return jsonResponse({ error: accessError.message }, { status: 500 });
    }
    const accessRow: TrackingAccessRow | null = (accessRows?.[0] as TrackingAccessRow | undefined) || null;

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
    const requestBody = await request.json().catch(() => ({}));
    const source = String(requestBody?.source || 'path-coach');

    if (isAccessActive(accessRow) && accessRow?.stripe_customer_id) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: accessRow.stripe_customer_id,
        return_url: billingPortalReturnUrl,
      });
      return jsonResponse({
        mode: 'billing_portal',
        url: portalSession.url,
      });
    }

    const requestOrigin = request.headers.get('origin') || appSiteUrl || 'http://localhost:5173';
    const successUrl = `${requestOrigin.replace(/\/+$/, '')}/?tracking=success`;
    const cancelUrl = `${requestOrigin.replace(/\/+$/, '')}/?tracking=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: stripeTrackingPriceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      customer: accessRow?.stripe_customer_id || undefined,
      customer_email: accessRow?.stripe_customer_id ? undefined : (user.email || undefined),
      subscription_data: {
        metadata: {
          user_id: user.id,
          source,
          plan_name: 'tracking_pro',
        },
        trial_period_days: stripeTrialDays > 0 ? stripeTrialDays : undefined,
      },
      metadata: {
        user_id: user.id,
        source,
        plan_name: 'tracking_pro',
      },
    });

    const customerId = typeof session.customer === 'string'
      ? session.customer
      : accessRow?.stripe_customer_id || null;

    const { error: upsertAccessError } = await serviceClient
      .from('user_tracking_access')
      .upsert({
        user_id: user.id,
        status: 'checkout_pending',
        plan_name: 'tracking_pro',
        amount_cad: 5.00,
        billing_period: 'month',
        stripe_customer_id: customerId,
        stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (upsertAccessError) {
      return jsonResponse({ error: upsertAccessError.message }, { status: 500 });
    }

    if (!session.url) {
      return jsonResponse({ error: 'Stripe checkout session created without URL' }, { status: 500 });
    }

    return jsonResponse({
      mode: 'checkout',
      url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
});
