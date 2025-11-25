# Legacy Stripe Users Migration Guide

## Overview

After removing Stripe integration, you have existing users who subscribed via Stripe in both sandbox and production environments. This guide outlines your options and recommended approach.

## Current Situation

**What happens to Stripe users now:**
- ✅ They **keep premium access** until their Stripe subscription expires naturally
- ✅ The app checks `subscription_status='premium'` regardless of payment method
- ❌ They **cannot cancel** via the app (no Stripe cancellation UI)
- ❌ They **cannot renew** via Stripe (Stripe integration removed)
- ⚠️ When Stripe subscription expires, they'll automatically lose premium access

## Recommended Approach: Grandfather Existing Users

**Best Practice:** Honor existing Stripe subscriptions until they expire naturally, then guide users to resubscribe via Apple IAP.

### Why This Approach?

1. **No disruption** - Users keep what they paid for
2. **Compliance** - Honors existing subscription contracts
3. **User trust** - Doesn't cancel active subscriptions
4. **Natural migration** - Users migrate when subscription expires

---

## Step-by-Step Migration Plan

### Phase 1: Identify Legacy Stripe Users

**Query to find all Stripe subscribers:**

```sql
-- Find all active Stripe premium users
SELECT 
  id,
  email,
  subscription_status,
  payment_method,
  stripe_customer_id,
  stripe_subscription_id,
  created_at,
  updated_at
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'stripe'
ORDER BY created_at DESC;
```

**Count by environment:**

```sql
-- Count Stripe users
SELECT 
  COUNT(*) as total_stripe_users,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as recent_stripe_users
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'stripe';
```

### Phase 2: Monitor Stripe Subscription Expirations

**Set up monitoring** to track when Stripe subscriptions expire:

```sql
-- Check for Stripe users whose subscriptions may be expiring soon
-- Note: You'll need to check Stripe Dashboard for actual expiration dates
-- This query helps identify users to monitor
SELECT 
  id,
  email,
  stripe_subscription_id,
  updated_at as last_updated
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'stripe'
ORDER BY updated_at ASC; -- Oldest first (likely to expire first)
```

**Action Items:**
1. Export list of Stripe users with emails
2. Set calendar reminders for subscription expiration dates
3. Monitor Stripe Dashboard for subscription cancellations/expirations

### Phase 3: User Communication Strategy

**When to contact users:**

1. **30 days before expiration** - Send reminder email
2. **7 days before expiration** - Send final reminder
3. **After expiration** - Send migration email with resubscribe link

**Email Template:**

```
Subject: Your Health Freak Premium Subscription - Action Required

Hi [Name],

We're reaching out because you subscribed to Health Freak Premium using a credit card payment method. We've simplified our payment system to use Apple In-App Purchases exclusively, which offers better pricing and a smoother experience.

Your current subscription will remain active until [Expiration Date]. To continue enjoying Premium features after that date, please resubscribe via Apple In-App Purchase:

1. Open the Health Freak app
2. Go to Profile → Upgrade to Premium
3. Complete the purchase using your Apple ID

Benefits of Apple In-App Purchase:
• Lower fees (15% vs 30% after year 1)
• Manage subscriptions directly in iPhone Settings
• Seamless integration with your Apple account

If you have any questions, please reply to this email.

Thank you for being a Health Freak Premium member!

Best regards,
Health Freak Team
```

### Phase 4: Handle Expired Subscriptions

**When a Stripe subscription expires:**

1. **Stripe webhook** (if still active) will notify you
2. **Manual check** - Monitor Stripe Dashboard weekly
3. **Database update** - When confirmed expired:
   ```sql
   -- Mark user as free after Stripe subscription expires
   UPDATE users
   SET subscription_status = 'free',
       payment_method = NULL,
       updated_at = NOW()
   WHERE id = '[user_id]'
     AND payment_method = 'stripe'
     AND subscription_status = 'premium';
   ```

**Note:** Since Stripe webhooks are removed, you'll need to:
- Check Stripe Dashboard manually, OR
- Set up a scheduled job to check Stripe API, OR
- Let users naturally lose access when Stripe cancels

---

## Alternative Approaches

### Option B: Proactive Cancellation (Not Recommended)

**What it involves:**
- Cancel all Stripe subscriptions immediately
- Email users to resubscribe via Apple IAP
- Convert them to free tier

**Pros:**
- Clean break from Stripe
- Forces immediate migration

**Cons:**
- ❌ Disrupts active users
- ❌ May violate subscription terms
- ❌ Could lose customers
- ❌ Poor user experience

**When to consider:**
- Only if you have very few Stripe users (< 5)
- Only if all users explicitly agree
- Only if legal/compliance requires it

### Option C: Manual Conversion (Complex)

**What it involves:**
- Manually create Apple IAP subscriptions for Stripe users
- Update database to reflect Apple IAP
- Cancel Stripe subscriptions

**Pros:**
- Seamless transition
- No user action required

**Cons:**
- ❌ Very complex to implement
- ❌ May violate Apple's terms of service
- ❌ Requires manual work for each user
- ❌ Risk of errors

**When to consider:**
- Only for VIP/critical users
- Only with explicit user consent
- Only if you have developer resources

---

## Monitoring & Maintenance

### Weekly Checklist

- [ ] Check Stripe Dashboard for expired/cancelled subscriptions
- [ ] Update database for any expired Stripe subscriptions
- [ ] Send migration emails to users whose subscriptions expired
- [ ] Monitor support inbox for Stripe-related questions

### Monthly Review

- [ ] Count remaining Stripe users
- [ ] Review migration email open/click rates
- [ ] Check if any Stripe users resubscribed via Apple IAP
- [ ] Update migration timeline

### SQL Queries for Monitoring

**Remaining Stripe users:**
```sql
SELECT COUNT(*) as remaining_stripe_users
FROM users
WHERE payment_method = 'stripe'
  AND subscription_status = 'premium';
```

**Users who migrated (had Stripe, now have Apple IAP):**
```sql
-- This won't work directly, but you can track manually:
-- Users who had stripe_subscription_id but now have apple_original_transaction_id
SELECT COUNT(*) as migrated_users
FROM users
WHERE stripe_subscription_id IS NOT NULL
  AND apple_original_transaction_id IS NOT NULL
  AND payment_method = 'apple_iap';
```

---

## Database Cleanup (After All Migrations)

**Once all Stripe subscriptions have expired (6-12 months):**

You can optionally clean up Stripe-related data:

```sql
-- WARNING: Only run after confirming all Stripe subscriptions expired
-- This removes Stripe IDs but keeps historical data

-- Option 1: Clear Stripe IDs but keep payment_method for historical reference
UPDATE users
SET stripe_customer_id = NULL,
    stripe_subscription_id = NULL,
    payment_method = NULL
WHERE payment_method = 'stripe'
  AND subscription_status = 'free';

-- Option 2: Keep everything for historical/audit purposes (RECOMMENDED)
-- Just leave the data as-is - it doesn't hurt anything
```

**Recommendation:** Keep Stripe data for historical/audit purposes. It's minimal storage and provides valuable migration tracking.

---

## Support & Communication

### Common User Questions

**Q: "Why can't I cancel my subscription in the app?"**
A: "Your subscription was created via credit card payment. To cancel, please contact Stripe support or wait for it to expire naturally. Future subscriptions can be managed directly in iPhone Settings."

**Q: "Can I switch to Apple payment now?"**
A: "Yes! You can resubscribe via Apple In-App Purchase anytime. Your current subscription will remain active until it expires, then you'll be billed via Apple."

**Q: "Will I lose access immediately?"**
A: "No, you'll keep Premium access until your current subscription expires on [date]. After that, you can resubscribe via Apple In-App Purchase."

### Support Email Template

```
Subject: Re: Stripe Subscription Question

Hi [Name],

Thank you for reaching out. I can see you subscribed via credit card payment. Here's what you need to know:

Current Status:
• Your Premium subscription is active until [Expiration Date]
• You'll continue to have Premium features until then

After Expiration:
• You can resubscribe via Apple In-App Purchase
• Go to Profile → Upgrade to Premium in the app
• Manage future subscriptions in iPhone Settings

If you have any other questions, please let me know!

Best regards,
[Your Name]
```

---

## Timeline Estimate

**Typical migration timeline:**

- **Month 1-2:** Monitor and identify all Stripe users
- **Month 3-6:** Most monthly subscriptions expire naturally
- **Month 6-12:** Remaining annual subscriptions expire
- **Month 12+:** All Stripe subscriptions migrated or expired

**Factors affecting timeline:**
- Subscription duration (monthly vs annual)
- User retention rates
- Email communication effectiveness
- App Store approval timing

---

## Summary

**Recommended Action Plan:**

1. ✅ **Keep Stripe users as premium** until subscriptions expire
2. ✅ **Monitor Stripe Dashboard** for expirations
3. ✅ **Email users** 30 days before expiration
4. ✅ **Guide them** to resubscribe via Apple IAP
5. ✅ **Update database** when subscriptions expire
6. ✅ **Keep historical data** for audit purposes

**Key Principle:** Honor existing subscriptions, guide natural migration, maintain user trust.

---

## Questions?

If you need help with:
- Setting up monitoring queries
- Creating email templates
- Database migration scripts
- Support response templates

Refer to this guide or contact your development team.

