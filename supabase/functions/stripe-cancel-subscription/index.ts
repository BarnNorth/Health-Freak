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

    // Parse request body for instant cancellation flag (DEV only)
    const body = await req.json().catch(() => ({}));
    const instantCancel = body.instant === true;

    console.log('Cancelling subscription for user:', user.id);
    if (instantCancel) {
      console.log('⚡ DEV MODE: Instant cancellation requested');
    }

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
      // Check if subscription was already cancelled
      const allSubscriptions = await stripe.subscriptions.list({
        customer: customerData.customer_id,
        limit: 1,
      });
      
      if (allSubscriptions.data.length > 0 && allSubscriptions.data[0].status === 'canceled') {
        console.log('Subscription already cancelled:', allSubscriptions.data[0].id);
        return Response.json({ 
          success: true, 
          message: 'Subscription already cancelled' 
        });
      }
      
      console.error('No active subscription found for customer:', customerData.customer_id);
      return Response.json({ 
        success: false,
        error: 'No active subscription found' 
      }, { status: 404 });
    }

    const subscription = subscriptions.data[0];

    let cancelledSubscription;

    if (instantCancel) {
      // DEV MODE: Cancel immediately for easy testing
      console.log('⚡ DEV MODE: Cancelling subscription immediately');
      cancelledSubscription = await stripe.subscriptions.cancel(subscription.id);
      
      // Update database immediately to free status
      await supabase
        .from('users')
        .update({
          subscription_status: 'free',
          payment_method: null,
          stripe_subscription_id: null,
          subscription_renewal_date: null,
          cancels_at_period_end: false
        })
        .eq('id', user.id);
        
      console.log('✅ Database updated to free status immediately');
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
      mode: instantCancel ? 'immediate' : 'end-of-period'
    });

    return Response.json({ 
      success: true, 
      subscription_id: cancelledSubscription.id,
      cancel_at_period_end: cancelledSubscription.cancel_at_period_end,
      current_period_end: cancelledSubscription.current_period_end,
      cancelled_immediately: instantCancel
    });

  } catch (error: any) {
    console.error('Error cancelling subscription:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
