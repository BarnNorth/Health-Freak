import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Get the current user from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('No authorization header', { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response('Invalid token', { status: 401 });
    }

    console.log('Cancelling subscription for user:', user.id);

    // Get the customer ID from the database
    const { data: customerData, error: customerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .single();

    if (customerError || !customerData) {
      console.error('No customer found for user:', user.id);
      return new Response('No subscription found', { status: 404 });
    }

    // Get the active subscription from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerData.customer_id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      console.error('No active subscription found for customer:', customerData.customer_id);
      return new Response('No active subscription found', { status: 404 });
    }

    const subscription = subscriptions.data[0];

    // Determine cancellation behavior based on environment
    const isTestMode = Deno.env.get('STRIPE_CANCEL_MODE') === 'immediate';

    let cancelledSubscription;

    if (isTestMode) {
      // Test mode: Cancel immediately for easy testing
      console.log('TEST MODE: Cancelling subscription immediately');
      cancelledSubscription = await stripe.subscriptions.cancel(subscription.id);
    } else {
      // Production mode: Cancel at end of period (industry standard)
      console.log('PRODUCTION MODE: Cancelling at end of billing period');
      cancelledSubscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });
    }

    console.log('Subscription cancellation processed:', {
      subscription_id: cancelledSubscription.id,
      cancel_at_period_end: cancelledSubscription.cancel_at_period_end,
      current_period_end: cancelledSubscription.current_period_end,
      status: cancelledSubscription.status,
      mode: isTestMode ? 'immediate' : 'end-of-period'
    });

    return Response.json({ 
      success: true, 
      subscription_id: cancelledSubscription.id,
      cancel_at_period_end: cancelledSubscription.cancel_at_period_end,
      current_period_end: cancelledSubscription.current_period_end,
      cancelled_immediately: isTestMode
    });

  } catch (error: any) {
    console.error('Error cancelling subscription:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
