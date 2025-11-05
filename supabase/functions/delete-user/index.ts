import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
// @ts-ignore - Deno npm: imports are valid but not recognized by TypeScript linter
import Stripe from 'npm:stripe@17.7.0';
// @ts-ignore - Deno npm: imports are valid but not recognized by TypeScript linter
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

// Deno and Edge Runtime types
declare const Deno: any;

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req: Request) => {
  try {
    console.log('🗑️ [Delete User] Starting account deletion process');

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Get the current user from the request
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      console.error('❌ [Delete User] No authorization header');
      return Response.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    
    let user;
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError) {
        console.error('❌ [Delete User] Authentication failed:', authError.message);
        return Response.json({ error: 'Authentication failed', details: authError.message }, { status: 401 });
      }
      
      if (!authUser) {
        console.error('❌ [Delete User] No user found');
        return Response.json({ error: 'No user found' }, { status: 401 });
      }
      
      user = authUser;
      console.log('✅ [Delete User] Authenticated user:', user.id);
    } catch (authException: any) {
      console.error('❌ [Delete User] Authentication exception:', authException.message);
      return Response.json({ error: 'Authentication exception', details: authException.message }, { status: 401 });
    }

    // Ensure user is defined before proceeding
    if (!user) {
      return Response.json({ error: 'User not defined' }, { status: 401 });
    }

    const userId = user.id;
    console.log('👤 [Delete User] Processing deletion for user:', userId);

    // Step 1: Get user payment info from users table
    console.log('📊 [Delete User] Fetching user payment information...');
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('stripe_subscription_id, stripe_customer_id, payment_method')
      .eq('id', userId)
      .single();

    if (userDataError || !userData) {
      console.error('❌ [Delete User] Error fetching user data:', userDataError);
      return Response.json({ 
        error: 'User not found', 
        details: 'Could not retrieve user information' 
      }, { status: 404 });
    }

    console.log('💳 [Delete User] Payment method:', userData.payment_method);

    // Step 2: Handle Stripe subscription cancellation if applicable
    if (userData.payment_method === 'stripe' && userData.stripe_customer_id) {
      console.log('💳 [Delete User] Processing Stripe cancellation...');

      try {
        // Get customer ID from stripe_customers table
        const { data: customerData, error: customerError } = await supabase
          .from('stripe_customers')
          .select('customer_id')
          .eq('user_id', userId)
          .single();

        if (customerData && !customerError) {
          const stripeCustomerId = customerData.customer_id;
          console.log('💳 [Delete User] Found Stripe customer:', stripeCustomerId);

          // List all subscriptions for this customer
          const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            limit: 100,
          });

          console.log(`💳 [Delete User] Found ${subscriptions.data.length} subscription(s) to cancel`);

          // Cancel all active subscriptions
          for (const subscription of subscriptions.data) {
            if (subscription.status !== 'canceled') {
              try {
                console.log(`💳 [Delete User] Cancelling subscription: ${subscription.id}`);
                await stripe.subscriptions.cancel(subscription.id);
                console.log(`✅ [Delete User] Cancelled subscription: ${subscription.id}`);
              } catch (subError: any) {
                console.error(`❌ [Delete User] Error cancelling subscription ${subscription.id}:`, subError.message);
                // Continue with deletion even if subscription cancellation fails
              }
            }
          }

          // Delete Stripe customer
          try {
            console.log('💳 [Delete User] Deleting Stripe customer:', stripeCustomerId);
            await stripe.customers.del(stripeCustomerId);
            console.log('✅ [Delete User] Deleted Stripe customer');
          } catch (customerDelError: any) {
            console.error('❌ [Delete User] Error deleting Stripe customer:', customerDelError.message);
            // Continue with deletion even if customer deletion fails
          }

          // Delete from stripe_subscriptions table
          console.log('🗑️ [Delete User] Deleting from stripe_subscriptions table...');
          const { error: subDelError } = await supabase
            .from('stripe_subscriptions')
            .delete()
            .eq('customer_id', stripeCustomerId);

          if (subDelError) {
            console.error('❌ [Delete User] Error deleting stripe_subscriptions:', subDelError);
          } else {
            console.log('✅ [Delete User] Deleted stripe_subscriptions');
          }

          // Delete from stripe_orders table
          console.log('🗑️ [Delete User] Deleting from stripe_orders table...');
          const { error: ordersDelError } = await supabase
            .from('stripe_orders')
            .delete()
            .eq('customer_id', stripeCustomerId);

          if (ordersDelError) {
            console.error('❌ [Delete User] Error deleting stripe_orders:', ordersDelError);
          } else {
            console.log('✅ [Delete User] Deleted stripe_orders');
          }

          // Delete from stripe_customers table
          console.log('🗑️ [Delete User] Deleting from stripe_customers table...');
          const { error: customerDelDbError } = await supabase
            .from('stripe_customers')
            .delete()
            .eq('user_id', userId);

          if (customerDelDbError) {
            console.error('❌ [Delete User] Error deleting stripe_customers:', customerDelDbError);
          } else {
            console.log('✅ [Delete User] Deleted stripe_customers');
          }
        } else {
          console.log('⚠️ [Delete User] No stripe_customers record found, skipping Stripe cleanup');
        }
      } catch (stripeError: any) {
        console.error('❌ [Delete User] Stripe cleanup error:', stripeError.message);
        // Continue with user deletion even if Stripe cleanup fails
      }
    } else if (userData.payment_method === 'apple_iap') {
      console.log('🍎 [Delete User] Apple IAP detected - RevenueCat will handle cancellation automatically');
      // No action needed - RevenueCat handles Apple IAP cancellations automatically
    } else {
      console.log('ℹ️ [Delete User] No active payment method to cancel');
    }

    // Step 3: Delete user data from child tables
    console.log('🗑️ [Delete User] Deleting user data from child tables...');

    // Delete analyses_history
    console.log('🗑️ [Delete User] Deleting analyses_history...');
    const { error: analysesError } = await supabase
      .from('analyses_history')
      .delete()
      .eq('user_id', userId);

    if (analysesError) {
      console.error('❌ [Delete User] Error deleting analyses_history:', analysesError);
    } else {
      console.log('✅ [Delete User] Deleted analyses_history');
    }

    // Delete ingredient_feedback
    console.log('🗑️ [Delete User] Deleting ingredient_feedback...');
    const { error: feedbackError } = await supabase
      .from('ingredient_feedback')
      .delete()
      .eq('user_id', userId);

    if (feedbackError) {
      console.error('❌ [Delete User] Error deleting ingredient_feedback:', feedbackError);
    } else {
      console.log('✅ [Delete User] Deleted ingredient_feedback');
    }

    // Delete subscription_audit
    console.log('🗑️ [Delete User] Deleting subscription_audit...');
    const { error: auditError } = await supabase
      .from('subscription_audit')
      .delete()
      .eq('user_id', userId);

    if (auditError) {
      console.error('❌ [Delete User] Error deleting subscription_audit:', auditError);
    } else {
      console.log('✅ [Delete User] Deleted subscription_audit');
    }

    // Delete scans (if table exists - may have been removed)
    console.log('🗑️ [Delete User] Attempting to delete scans...');
    try {
      const { error: scansError } = await supabase
        .from('scans')
        .delete()
        .eq('user_id', userId);

      if (scansError) {
        // Table might not exist, which is okay
        console.log('⚠️ [Delete User] scans table may not exist or error occurred:', scansError.message);
      } else {
        console.log('✅ [Delete User] Deleted scans');
      }
    } catch (scansException: any) {
      console.log('⚠️ [Delete User] scans table may not exist:', scansException.message);
    }

    // Step 4: Delete from users table
    console.log('🗑️ [Delete User] Deleting from users table...');
    const { error: userDelError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (userDelError) {
      console.error('❌ [Delete User] Error deleting from users table:', userDelError);
      return Response.json({ 
        error: 'Failed to delete user record', 
        details: userDelError.message 
      }, { status: 500 });
    }

    console.log('✅ [Delete User] Deleted from users table');

    // Step 5: Delete auth user
    console.log('🗑️ [Delete User] Deleting auth user...');
    const { error: authDelError } = await supabase.auth.admin.deleteUser(userId);

    if (authDelError) {
      console.error('❌ [Delete User] Error deleting auth user:', authDelError);
      return Response.json({ 
        error: 'Failed to delete auth user', 
        details: authDelError.message 
      }, { status: 500 });
    }

    console.log('✅ [Delete User] Deleted auth user');
    console.log('🎉 [Delete User] Account deletion completed successfully for user:', userId);

    return Response.json({ 
      success: true,
      message: 'Account deleted successfully' 
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });

  } catch (error: any) {
    console.error('❌ [Delete User] Edge function error:', error);
    return Response.json({ 
      success: false,
      error: 'An error occurred during account deletion',
      details: error.message
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
});
