import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
// Allowed Stripe Price IDs - whitelist for security
const sandboxPriceId = (Deno.env.get('STRIPE_PRICE_ID_SANDBOX') ?? '').trim();
const productionPriceId = (Deno.env.get('STRIPE_PRICE_ID_PROD') ?? '').trim();

const ALLOWED_PRICE_IDS = [sandboxPriceId, productionPriceId].filter((id) => id.length > 0);

if (ALLOWED_PRICE_IDS.length === 0) {
  console.error(
    '❌ Stripe price IDs not configured. Set STRIPE_PRICE_ID_SANDBOX and STRIPE_PRICE_ID_PROD environment variables for the $6.99 subscription.'
  );
}

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

// Helper function to create responses with CORS headers
function corsResponse(body: string | object | null, status = 200) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  // For 204 No Content, don't include Content-Type or body
  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse({}, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    const { price_id, success_url, cancel_url, mode } = await req.json();

    const error = validateParameters(
      { price_id, success_url, cancel_url, mode },
      {
        cancel_url: 'string',
        price_id: 'string',
        success_url: 'string',
        mode: { values: ['payment', 'subscription'] },
      },
    );

    if (error) {
      return corsResponse({ error }, 400);
    }

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser(token);

    if (getUserError) {
      return corsResponse({ error: 'Failed to authenticate user' }, 401);
    }

    if (!user) {
      return corsResponse({ error: 'User not found' }, 404);
    }

    if (ALLOWED_PRICE_IDS.length === 0) {
      console.error('❌ Rejecting checkout attempt due to missing Stripe price ID configuration');
      return corsResponse({ error: 'Subscription temporarily unavailable. Please contact support.' }, 500);
    }

    // Validate price ID against whitelist
    if (!ALLOWED_PRICE_IDS.includes(price_id)) {
      console.warn(`⚠️ Invalid price ID attempted: ${price_id} by user ${user.id}`);
      return corsResponse({ error: 'Invalid product selected' }, 400);
    }

    const { data: customer, error: getCustomerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (getCustomerError) {
      console.error('Failed to fetch customer information from the database', getCustomerError);

      return corsResponse({ error: 'Unable to process request. Please try again.' }, 500);
    }

    let customerId;

    /**
     * In case we don't have a mapping yet, the customer does not exist and we need to create one.
     */
    if (!customer || !customer.customer_id) {
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id,
        },
      });

      console.log(`Created new Stripe customer ${newCustomer.id} for user ${user.id}`);

      const { error: createCustomerError } = await supabase.from('stripe_customers').insert({
        user_id: user.id,
        customer_id: newCustomer.id,
      });

      if (createCustomerError) {
        console.error('Failed to save customer information in the database', createCustomerError);

        // Try to clean up both the Stripe customer and subscription record
        try {
          await stripe.customers.del(newCustomer.id);
          await supabase.from('stripe_subscriptions').delete().eq('customer_id', newCustomer.id);
        } catch (deleteError) {
          console.error('Failed to clean up after customer mapping error:', deleteError);
        }

        return corsResponse({ error: 'Unable to process request. Please try again.' }, 500);
      }

      if (mode === 'subscription') {
        const { error: createSubscriptionError } = await supabase.from('stripe_subscriptions').insert({
          customer_id: newCustomer.id,
          status: 'not_started',
        });

        if (createSubscriptionError) {
          console.error('Failed to save subscription in the database', createSubscriptionError);

          // Try to clean up the Stripe customer since we couldn't create the subscription
          try {
            await stripe.customers.del(newCustomer.id);
          } catch (deleteError) {
            console.error('Failed to delete Stripe customer after subscription creation error:', deleteError);
          }

          return corsResponse({ error: 'Unable to process request. Please try again.' }, 500);
        }
      }

      customerId = newCustomer.id;

      console.log(`Successfully set up new customer ${customerId} with subscription record`);
    } else {
      customerId = customer.customer_id;

      // Verify the customer exists in Stripe (handles test vs production mismatch)
      try {
        await stripe.customers.retrieve(customerId);
      } catch (stripeError: any) {
        // If customer doesn't exist in current Stripe environment, create a new one
        if (stripeError?.code === 'resource_missing') {
          console.log(`⚠️ Customer ${customerId} not found in Stripe, creating new customer for user ${user.id}`);

          const newCustomer = await stripe.customers.create({
            email: user.email,
            metadata: {
              userId: user.id,
            },
          });

          console.log(`Created new Stripe customer ${newCustomer.id} to replace missing customer ${customerId}`);

          // Update database with new customer ID
          const { error: updateCustomerError } = await supabase
            .from('stripe_customers')
            .update({ customer_id: newCustomer.id })
            .eq('user_id', user.id)
            .is('deleted_at', null);

          if (updateCustomerError) {
            console.error('Failed to update customer ID in database', updateCustomerError);

            // Cleanup: delete the newly created Stripe customer
            try {
              await stripe.customers.del(newCustomer.id);
              console.log(`Cleaned up orphaned Stripe customer ${newCustomer.id}`);
            } catch (deleteError) {
              console.error('Failed to delete newly created Stripe customer after database update failure:', deleteError);
            }

            return corsResponse({ error: 'Unable to process request. Please try again.' }, 500);
          }

          // Update customerId to the new one
          customerId = newCustomer.id;
          console.log(`Successfully migrated customer ID from ${customer.customer_id} to ${newCustomer.id}`);
        } else {
          // For any other Stripe error, rethrow to be caught by outer try-catch
          throw stripeError;
        }
      }

      if (mode === 'subscription') {
        // Verify subscription exists for existing customer
        const { data: subscription, error: getSubscriptionError } = await supabase
          .from('stripe_subscriptions')
          .select('status')
          .eq('customer_id', customerId)
          .maybeSingle();

        if (getSubscriptionError) {
          console.error('Failed to fetch subscription information from the database', getSubscriptionError);

          return corsResponse({ error: 'Unable to process request. Please try again.' }, 500);
        }

        if (!subscription) {
          // Create subscription record for existing customer if missing
          const { error: createSubscriptionError } = await supabase.from('stripe_subscriptions').insert({
            customer_id: customerId,
            status: 'not_started',
          });

          if (createSubscriptionError) {
            console.error('Failed to create subscription record for existing customer', createSubscriptionError);

            return corsResponse({ error: 'Unable to process request. Please try again.' }, 500);
          }
        }
      }
    }

    // create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      mode,
      success_url,
      cancel_url,
    });

    console.log(`Created checkout session ${session.id} for customer ${customerId}`);

    return corsResponse({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error(`Checkout error:`, error.message, error.stack);
    return corsResponse({ error: 'An error occurred processing your request. Please try again.' }, 500);
  }
});

type ExpectedType = 'string' | { values: string[] };
type Expectations<T> = { [K in keyof T]: ExpectedType };

function validateParameters<T extends Record<string, any>>(values: T, expected: Expectations<T>): string | undefined {
  for (const parameter in values) {
    const expectation = expected[parameter];
    const value = values[parameter];

    if (expectation === 'string') {
      if (value == null) {
        return `Missing required parameter ${parameter}`;
      }
      if (typeof value !== 'string') {
        return `Expected parameter ${parameter} to be a string got ${JSON.stringify(value)}`;
      }
    } else {
      if (!expectation.values.includes(value)) {
        return `Expected parameter ${parameter} to be one of ${expectation.values.join(', ')}`;
      }
    }
  }

  return undefined;
}