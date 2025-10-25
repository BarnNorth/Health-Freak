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
      return Response.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    
    let user;
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError) {
        return Response.json({ error: 'Authentication failed', details: authError.message }, { status: 401 });
      }
      
      if (!authUser) {
        return Response.json({ error: 'No user found' }, { status: 401 });
      }
      
      user = authUser;
    } catch (authException) {
      return Response.json({ error: 'Authentication exception', details: authException.message }, { status: 401 });
    }

    // Ensure user is defined before proceeding
    if (!user) {
      return Response.json({ error: 'User not defined' }, { status: 401 });
    }

    // Parse request body for instant cancellation flag (DEV only)
    const body = await req.json().catch(() => ({}));
    const instantCancel = body.instant === true;

    // Get the customer ID from the database
    const { data: customerData, error: customerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .single();
    
    if (customerError || !customerData) {
      console.error('No customer found for user:', user.id, 'Error:', customerError);
      return Response.json({ 
        success: false,
        error: 'No subscription found',
        details: 'User does not have a Stripe customer record'
      }, { status: 404 });
    }

    // Get the active subscription from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerData.customer_id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      // No active subscriptions found, check all subscriptions
      const allSubscriptions = await stripe.subscriptions.list({
        customer: customerData.customer_id,
        limit: 10,
      });

      if (allSubscriptions.data.length === 0) {
        return Response.json({ 
          success: false,
          error: 'No subscription found',
          details: 'No subscriptions found for this customer'
        }, { status: 404 });
      }

      // Check if any subscription is already cancelled or canceling
      const cancelledSub = allSubscriptions.data.find(sub => sub.status === 'canceled');
      const cancelingSub = allSubscriptions.data.find(sub => sub.status === 'active' && sub.cancel_at_period_end);

      if (cancelledSub) {
        // Subscription is already cancelled, update database
        await supabase
          .from('users')
          .update({ 
            subscription_status: 'free',
            payment_method: null,
            cancels_at_period_end: false,
            subscription_renewal_date: null
          })
          .eq('id', user.id);

        return Response.json({ 
          success: true,
          message: 'Subscription was already cancelled',
          cancelled_immediately: true
        });
      }

      if (cancelingSub) {
        // Subscription is set to cancel at period end, update database
        const renewalDate = new Date(cancelingSub.current_period_end * 1000).toISOString();
        await supabase
          .from('users')
          .update({ 
            cancels_at_period_end: true,
            subscription_renewal_date: renewalDate
          })
          .eq('id', user.id);

        return Response.json({ 
          success: true,
          message: 'Subscription is already set to cancel at period end',
          cancelled_immediately: false
        });
      }

      return Response.json({ 
        success: false,
        error: 'No active subscription found',
        details: 'No active subscriptions found for this customer'
      }, { status: 404 });
    }

    const subscription = subscriptions.data[0];

    try {
      if (instantCancel) {
        // DEV MODE: Cancel immediately
        await stripe.subscriptions.cancel(subscription.id);
        
        // Update database to free status
        await supabase
          .from('users')
          .update({ 
            subscription_status: 'free',
            payment_method: null,
            cancels_at_period_end: false,
            subscription_renewal_date: null
          })
          .eq('id', user.id);

        return Response.json({ 
          success: true,
          message: 'Subscription cancelled immediately',
          cancelled_immediately: true
        });
      } else {
        // Normal cancellation: cancel at period end
        await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: true
        });

        // Update database with cancellation info
        const renewalDate = new Date(subscription.current_period_end * 1000).toISOString();
        await supabase
          .from('users')
          .update({ 
            cancels_at_period_end: true,
            subscription_renewal_date: renewalDate
          })
          .eq('id', user.id);

        return Response.json({ 
          success: true,
          message: 'Subscription will be cancelled at the end of the billing period',
          cancelled_immediately: false
        });
      }
    } catch (stripeError) {
      console.error('Stripe API error:', stripeError);
      return Response.json({ 
        success: false,
        error: 'Unable to cancel subscription. Please try again or contact support.'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Edge function error:', error);
    return Response.json({ 
      success: false,
      error: 'An error occurred. Please try again or contact support.'
    }, { status: 500 });
  }
});