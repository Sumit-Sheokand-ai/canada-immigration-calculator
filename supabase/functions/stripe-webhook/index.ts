import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCorsPreflightRequest, jsonResponse } from '../_shared/cors.ts';

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function toIsoDate(unixSeconds: number | null | undefined) {
  if (!unixSeconds) return null;
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeTrackingStatus(stripeStatus: string | null | undefined) {
  const status = String(stripeStatus || '').toLowerCase();
  if (!status) return 'inactive';
  if (status === 'incomplete_expired') return 'inactive';
  return status;
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
    const stripeWebhookSecret = requiredEnv('STRIPE_WEBHOOK_SECRET');

    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return jsonResponse({ error: 'Missing Stripe signature header' }, { status: 400 });
    }

    const payload = await request.text();
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
    const event = await stripe.webhooks.constructEventAsync(payload, signature, stripeWebhookSecret);
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    async function findUserIdBySubscription(subscriptionId: string) {
      const { data, error } = await serviceClient
        .from('user_tracking_access')
        .select('user_id')
        .eq('stripe_subscription_id', subscriptionId)
        .limit(1);
      if (error) return null;
      return data?.[0]?.user_id || null;
    }

    async function upsertTrackingAccess(input: {
      userId: string;
      status: string;
      customerId?: string | null;
      subscriptionId?: string | null;
      currentPeriodEnd?: string | null;
    }) {
      const { error } = await serviceClient
        .from('user_tracking_access')
        .upsert({
          user_id: input.userId,
          status: input.status,
          plan_name: 'tracking_pro',
          amount_cad: 5.00,
          billing_period: 'month',
          stripe_customer_id: input.customerId || null,
          stripe_subscription_id: input.subscriptionId || null,
          current_period_end: input.currentPeriodEnd || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      if (error) throw new Error(`Failed to upsert tracking access: ${error.message}`);
    }

    async function upsertPayment(input: {
      userId: string;
      status: string;
      customerId?: string | null;
      subscriptionId?: string | null;
      checkoutSessionId?: string | null;
      customerEmail?: string | null;
      amountCad?: number | null;
      metadata?: Record<string, unknown>;
    }) {
      const { error } = await serviceClient
        .from('payments')
        .upsert({
          user_id: input.userId,
          stripe_event_id: event.id,
          stripe_checkout_session_id: input.checkoutSessionId || null,
          stripe_customer_id: input.customerId || null,
          stripe_subscription_id: input.subscriptionId || null,
          customer_email: input.customerEmail || null,
          amount_cad: input.amountCad ?? null,
          currency: 'cad',
          status: input.status,
          metadata: input.metadata || {},
          updated_at: new Date().toISOString(),
        }, { onConflict: 'stripe_event_id' });
      if (error) throw new Error(`Failed to upsert payment row: ${error.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = String(session.metadata?.user_id || session.client_reference_id || '');
      if (!userId) {
        return jsonResponse({ received: true, ignored: 'missing_user_id' });
      }

      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
      const customerId = typeof session.customer === 'string' ? session.customer : null;
      let status = 'active';
      let currentPeriodEnd: string | null = null;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        status = normalizeTrackingStatus(subscription.status);
        currentPeriodEnd = toIsoDate(subscription.current_period_end);
      }

      await upsertTrackingAccess({
        userId,
        status,
        customerId,
        subscriptionId,
        currentPeriodEnd,
      });

      await upsertPayment({
        userId,
        status: session.payment_status === 'paid' ? 'succeeded' : 'pending',
        customerId,
        subscriptionId,
        checkoutSessionId: session.id,
        customerEmail: session.customer_details?.email || session.customer_email || null,
        metadata: {
          source: session.metadata?.source || null,
          event_type: event.type,
        },
      });

      return jsonResponse({ received: true });
    }

    if (event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
      const metadataUserId = String(subscription.metadata?.user_id || '');
      const userId = metadataUserId || await findUserIdBySubscription(subscriptionId);

      if (!userId) {
        return jsonResponse({ received: true, ignored: 'missing_user_id' });
      }

      await upsertTrackingAccess({
        userId,
        status: normalizeTrackingStatus(subscription.status),
        customerId,
        subscriptionId,
        currentPeriodEnd: toIsoDate(subscription.current_period_end),
      });

      await upsertPayment({
        userId,
        status: normalizeTrackingStatus(subscription.status),
        customerId,
        subscriptionId,
        metadata: {
          event_type: event.type,
        },
      });

      return jsonResponse({ received: true });
    }

    if (event.type === 'invoice.payment_failed' || event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
      const userId = subscriptionId ? await findUserIdBySubscription(subscriptionId) : null;
      if (!userId) {
        return jsonResponse({ received: true, ignored: 'missing_user_id' });
      }

      await upsertTrackingAccess({
        userId,
        status: event.type === 'invoice.payment_failed' ? 'past_due' : 'active',
        customerId,
        subscriptionId,
      });

      await upsertPayment({
        userId,
        status: event.type === 'invoice.payment_failed' ? 'failed' : 'succeeded',
        customerId,
        subscriptionId,
        customerEmail: invoice.customer_email || null,
        amountCad: invoice.amount_paid != null ? Number(invoice.amount_paid) / 100 : null,
        metadata: {
          event_type: event.type,
          invoice_id: invoice.id,
        },
      });

      return jsonResponse({ received: true });
    }

    return jsonResponse({ received: true, ignored: event.type });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
});
