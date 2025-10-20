import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const REVENUECAT_AUTH_TOKEN = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_TOKEN');
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

/**
 * RevenueCat Webhook Event Interface
 * Based on RevenueCat's webhook documentation
 */
interface RevenueCatEvent {
  api_version: string;
  event: {
    type: 'INITIAL_PURCHASE' | 'RENEWAL' | 'CANCELLATION' | 'EXPIRATION' | 'BILLING_ISSUE' | string;
    app_user_id: string;
    original_app_user_id: string;
    product_id: string;
    period_type: 'NORMAL' | 'TRIAL' | 'INTRO';
    purchased_at_ms: number;
    expiration_at_ms?: number;
    store: 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | 'PROMOTIONAL';
    environment: 'SANDBOX' | 'PRODUCTION';
    is_trial_conversion?: boolean;
    presented_offering_id?: string | null;
    transaction_id?: string;
    original_transaction_id?: string;
  };
}

Deno.serve(async (req) => {
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify webhook authorization
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader) {
      console.error('❌ No authorization header found');
      return new Response('Unauthorized - No authorization header', { status: 401 });
    }

    // RevenueCat sends: "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');
    
    if (!REVENUECAT_AUTH_TOKEN) {
      console.error('❌ REVENUECAT_WEBHOOK_AUTH_TOKEN not configured in Supabase secrets');
      return new Response('Webhook not configured', { status: 500 });
    }

    if (token !== REVENUECAT_AUTH_TOKEN) {
      console.error('❌ Invalid authorization token - webhook rejected');
      console.error('This webhook request is not from RevenueCat and will be rejected.');
      return new Response('Unauthorized - Invalid token', { status: 401 });
    }

    // Parse webhook body
    const webhookEvent: RevenueCatEvent = await req.json();
    
    console.log('📬 [RevenueCat Webhook] Received event:', {
      type: webhookEvent.event.type,
      userId: webhookEvent.event.app_user_id,
      productId: webhookEvent.event.product_id,
      environment: webhookEvent.event.environment,
    });

    // Process event asynchronously (don't block webhook response)
    EdgeRuntime.waitUntil(handleRevenueCatEvent(webhookEvent));

    return Response.json({ received: true });

  } catch (error: any) {
    console.error('❌ Error processing RevenueCat webhook:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Handle RevenueCat webhook events and update user subscription status
 */
async function handleRevenueCatEvent(webhookEvent: RevenueCatEvent) {
  const { event } = webhookEvent;
  const userId = event.app_user_id; // This is the Supabase user ID we passed during configuration
  
  if (!userId) {
    console.error('❌ No app_user_id in webhook event');
    return;
  }

  try {
    console.log(`🔄 Processing ${event.type} for user: ${userId}`);

    switch (event.type) {
      case 'INITIAL_PURCHASE':
        await handleInitialPurchase(userId, event);
        break;

      case 'RENEWAL':
        await handleRenewal(userId, event);
        break;

      case 'CANCELLATION':
        await handleCancellation(userId, event);
        break;

      case 'EXPIRATION':
        await handleExpiration(userId, event);
        break;

      case 'BILLING_ISSUE':
        await handleBillingIssue(userId, event);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    console.log(`✅ Successfully processed ${event.type} for user: ${userId}`);

  } catch (error) {
    console.error(`❌ Failed to process ${event.type} for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Handle initial purchase - user just subscribed
 */
async function handleInitialPurchase(userId: string, event: any) {
  console.log('💳 Processing INITIAL_PURCHASE');
  
  const { error } = await supabase
    .from('users')
    .update({
      subscription_status: 'premium',
      payment_method: 'apple_iap',
      apple_original_transaction_id: event.original_transaction_id || event.transaction_id,
      revenuecat_customer_id: event.app_user_id,
    })
    .eq('id', userId);

  if (error) {
    console.error('❌ Error updating user for INITIAL_PURCHASE:', error);
    throw error;
  }

  console.log(`✅ User ${userId} upgraded to premium via Apple IAP`);
}

/**
 * Handle subscription renewal - subscription auto-renewed
 */
async function handleRenewal(userId: string, event: any) {
  console.log('🔄 Processing RENEWAL');
  
  // Ensure user is still premium and update transaction ID
  const { error } = await supabase
    .from('users')
    .update({
      subscription_status: 'premium',
      payment_method: 'apple_iap',
      apple_original_transaction_id: event.original_transaction_id || event.transaction_id,
    })
    .eq('id', userId);

  if (error) {
    console.error('❌ Error updating user for RENEWAL:', error);
    throw error;
  }

  console.log(`✅ Subscription renewed for user ${userId}`);
}

/**
 * Handle cancellation - user cancelled but still has access until expiration
 */
async function handleCancellation(userId: string, event: any) {
  console.log('⚠️ Processing CANCELLATION');
  
  // User cancelled but subscription is still active until expiration
  // Keep them as premium, they'll be downgraded on EXPIRATION event
  console.log(`ℹ️ User ${userId} cancelled subscription`);
  console.log(`ℹ️ Will remain premium until expiration: ${event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : 'N/A'}`);
  
  // No database update needed - wait for EXPIRATION event
}

/**
 * Handle expiration - subscription has expired
 */
async function handleExpiration(userId: string, event: any) {
  console.log('❌ Processing EXPIRATION');
  
  const { error } = await supabase
    .from('users')
    .update({
      subscription_status: 'free',
      // Keep payment_method and transaction IDs for history
    })
    .eq('id', userId);

  if (error) {
    console.error('❌ Error updating user for EXPIRATION:', error);
    throw error;
  }

  console.log(`✅ User ${userId} downgraded to free (subscription expired)`);
}

/**
 * Handle billing issue - payment failed but user might still have access
 */
async function handleBillingIssue(userId: string, event: any) {
  console.log('⚠️ Processing BILLING_ISSUE');
  
  // Log the issue but don't immediately downgrade
  // RevenueCat usually provides grace period before sending EXPIRATION
  console.log(`⚠️ Billing issue for user ${userId}`);
  console.log(`ℹ️ Grace period may apply - wait for EXPIRATION event if not resolved`);
  
  // No database update needed - Apple/RevenueCat handles grace period
  // User will be downgraded via EXPIRATION event if payment not resolved
}

