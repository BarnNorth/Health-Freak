# Apple In-App Purchase Testing Guide

## Overview

This guide explains how to test Apple in-app purchases for the Health Freak app during development and before App Store submission. We use RevenueCat for managing Apple IAP subscriptions alongside our existing Stripe integration.

**Testing Environments:**
- **Sandbox:** For development and testing (free, no real charges)
- **TestFlight:** For beta testing with real users
- **Production:** For App Store releases

---

## Prerequisites

Before you begin testing, ensure you have:

1. ✅ RevenueCat account set up and configured
2. ✅ Subscription products created in RevenueCat
3. ✅ App Store Connect access
4. ✅ Physical iOS device (sandbox testing doesn't work reliably in simulator)
5. ✅ Development build installed on device
6. ✅ Supabase database with Apple IAP migration applied
7. ✅ RevenueCat webhook configured and deployed

---

## Setting Up Sandbox Test Accounts

Sandbox accounts allow you to test purchases without being charged.

### Step 1: Create Sandbox Tester in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Navigate to **Users and Access** → **Sandbox** → **Testers**
3. Click the **+** button to add a new tester
4. Fill in the form:
   - **First Name:** Test
   - **Last Name:** User
   - **Email:** `testuser@example.com` (can be fake, Apple doesn't verify)
   - **Password:** Create a secure password (you'll need this!)
   - **Country/Region:** Select your region
   - **App Store Territory:** Same as region
5. Click **Invite**
6. **Important:** Don't sign into iCloud/App Store with this account in Settings!

### Step 2: Prepare Your Test Device

1. **Sign out of your real Apple ID** (ONLY in the App Store, not iCloud):
   - Open **Settings**
   - Scroll down to **App Store**
   - Tap your Apple ID at the top
   - Tap **Sign Out**

2. **Do NOT sign back in yet** - you'll sign in during purchase

### Step 3: Verify Sandbox Account

1. Open your app
2. Navigate to a premium feature
3. Attempt to make a purchase
4. When prompted, sign in with your **sandbox test account**
5. Complete the purchase (it's free!)
6. Verify premium access is granted

**Common Issues:**
- ❌ "Cannot connect to iTunes Store" → Check internet connection
- ❌ "This Apple ID has not yet been used in the iTunes Store" → Normal for new sandbox accounts, tap Review
- ❌ Purchase doesn't complete → Check RevenueCat product configuration

---

## Testing on TestFlight

TestFlight provides a realistic testing environment closer to production.

### Step 1: Build and Upload to TestFlight

```bash
# Build for TestFlight
eas build --profile preview --platform ios

# Or use the production profile
eas build --profile production --platform ios
```

### Step 2: Upload Build to App Store Connect

1. Wait for build to complete (check `eas build:list`)
2. EAS will automatically upload to App Store Connect
3. Wait for Apple's processing (15-30 minutes)

### Step 3: Create TestFlight Group

1. Go to App Store Connect → Your App → TestFlight
2. Create a **new group** (e.g., "IAP Testers")
3. Add testers by email
4. Enable the build for this group

### Step 4: Test Purchase Flow

1. Testers install app via TestFlight
2. Create account / sign in
3. Navigate to upgrade screen
4. Select "Apple In-App Purchase"
5. Complete purchase using **sandbox account**
6. Verify premium access granted immediately
7. Check Supabase database for correct data

**Verification Query:**
```sql
SELECT 
  email,
  subscription_status,
  payment_method,
  apple_original_transaction_id,
  revenuecat_customer_id
FROM users
WHERE email = 'tester@example.com';
```

---

## Testing Purchase Flows

### Apple IAP Purchase Flow

**Test Scenario:** New user purchases via Apple

1. **Setup:** Fresh user account, logged in
2. **Action:** 
   - Tap "Upgrade to Premium"
   - Select "Apple In-App Purchase"
   - Sign in with sandbox account
   - Confirm purchase
3. **Expected Results:**
   - ✅ Purchase completes successfully
   - ✅ User sees success message
   - ✅ User immediately has premium access
   - ✅ Database shows `subscription_status = 'premium'`
   - ✅ Database shows `payment_method = 'apple_iap'`
   - ✅ `apple_original_transaction_id` is populated
   - ✅ `revenuecat_customer_id` is populated
4. **Timing:** Should complete within 5-10 seconds

### Stripe Purchase Flow

**Test Scenario:** New user purchases via Stripe

1. **Setup:** Fresh user account, logged in
2. **Action:**
   - Tap "Upgrade to Premium"
   - Select "Web Payment (Stripe)"
   - Complete Stripe checkout
3. **Expected Results:**
   - ✅ Redirected to Stripe checkout
   - ✅ After payment, redirected back to app
   - ✅ User has premium access
   - ✅ Database shows `subscription_status = 'premium'`
   - ✅ Database shows `payment_method = 'stripe'`
   - ✅ `stripe_customer_id` is populated
   - ✅ `stripe_subscription_id` is populated
4. **Timing:** Depends on Stripe processing (usually instant)

---

## Testing Subscription Restoration

Subscription restoration ensures users keep access after reinstalling the app or switching devices.

### Test Case 1: Reinstall App (Apple IAP)

1. **Setup:** User with active Apple IAP subscription
2. **Action:**
   - Delete app from device
   - Reinstall app (via TestFlight or Xcode)
   - Launch app
   - Sign in with same account
3. **Expected:**
   - ✅ App automatically calls `restorePurchases()`
   - ✅ RevenueCat returns active subscription
   - ✅ User immediately has premium access
   - ✅ No manual "Restore Purchases" needed
4. **Check Logs:**
   ```
   🔄 [LAYOUT] Restoring subscription status for user: [id]
   ✅ [LAYOUT] Purchases restored successfully
   ✅ [LAYOUT] Subscription restoration completed. Premium status: true
   ```

### Test Case 2: Reinstall App (Stripe)

1. **Setup:** User with active Stripe subscription
2. **Action:**
   - Delete app
   - Reinstall app
   - Sign in with same account
3. **Expected:**
   - ✅ User immediately has premium access (from database)
   - ✅ Subscription info loads from Supabase
   - ✅ No additional steps needed
4. **Database Check:**
   ```sql
   SELECT subscription_status, stripe_subscription_id
   FROM users WHERE email = 'user@example.com';
   ```

### Test Case 3: Device Switch

1. **Setup:** User purchased on Device A
2. **Action:**
   - Install app on Device B
   - Sign in with same account
3. **Expected:**
   - ✅ Subscription restored automatically
   - ✅ Premium access granted
   - ✅ Works for both payment methods

---

## Testing Webhooks

Webhooks keep our database in sync with RevenueCat and Stripe events.

### RevenueCat Webhook Testing

**Endpoint:** `https://[your-project].supabase.co/functions/v1/revenuecat-webhook`

#### Test Event: INITIAL_PURCHASE

1. **Trigger:** Complete a purchase in sandbox
2. **Check RevenueCat:**
   - Go to RevenueCat Dashboard → Customers
   - Find your test user
   - Verify purchase appears in transaction history
3. **Check Webhook Delivery:**
   - Go to RevenueCat Dashboard → Integrations → Webhooks
   - View webhook history
   - Verify `INITIAL_PURCHASE` event sent
   - Status should be `200 OK`
4. **Verify Database:**
   ```sql
   SELECT 
     subscription_status,
     payment_method,
     apple_original_transaction_id,
     updated_at
   FROM users
   WHERE id = '[user-id]';
   ```
   - ✅ `subscription_status` = `'premium'`
   - ✅ `payment_method` = `'apple_iap'`
   - ✅ `apple_original_transaction_id` populated
   - ✅ `updated_at` recent

#### Test Event: RENEWAL

1. **Trigger:** Wait for subscription renewal (or use RevenueCat's test renewal feature)
2. **Expected:**
   - Webhook fires with type `RENEWAL`
   - Database `updated_at` timestamp updates
   - Subscription remains active

#### Test Event: CANCELLATION

1. **Trigger:** Cancel subscription in iPhone Settings
2. **Expected:**
   - Webhook fires with type `CANCELLATION`
   - Database updates but user keeps access until period end
   - App shows "Cancelling" status

#### Test Event: EXPIRATION

1. **Trigger:** Let cancelled subscription expire
2. **Expected:**
   - Webhook fires with type `EXPIRATION`
   - Database `subscription_status` → `'free'`
   - User loses premium access

### Webhook Debugging

**Check Supabase Edge Function Logs:**

```bash
# View recent webhook logs
supabase functions logs revenuecat-webhook --limit 50
```

**Manual Webhook Test:**

Use RevenueCat Dashboard → Integrations → Webhooks → Test:
- Send sample `INITIAL_PURCHASE` event
- Verify your Edge Function receives it
- Check response is `200 OK`

**Common Issues:**
- ❌ 401 Unauthorized → Check authorization header matches secret
- ❌ 500 Internal Error → Check Edge Function logs for details
- ❌ Webhook not received → Verify URL and events are configured

---

## Testing Cancellations

### Stripe Cancellation

1. **Setup:** User with active Stripe subscription
2. **Action:**
   - Go to Profile → Manage Subscription
   - Tap "Cancel Subscription"
   - Confirm cancellation
3. **Expected:**
   - ✅ Confirmation dialog appears
   - ✅ Stripe cancellation processes
   - ✅ Success message shown
   - ✅ User keeps access until period end
   - ✅ Database shows cancellation scheduled

### Apple IAP Cancellation

1. **Setup:** User with active Apple subscription
2. **Action:**
   - Go to Profile → Manage Subscription
   - Tap "Manage in iPhone Settings"
   - Deep link opens Settings
   - Navigate to subscriptions
   - Cancel subscription
3. **Expected:**
   - ✅ Deep link opens Settings successfully
   - ✅ Health Freak subscription listed
   - ✅ Can cancel subscription
   - ✅ Webhook fires to update database
   - ✅ User sees "Cancelling" status in app

**Deep Link Fallback Test:**
1. If deep link fails, instructions should display
2. Verify instructions are clear and accurate

---

## Testing Edge Cases

### Expired Subscription

**Scenario:** Subscription expires without renewal

1. **Setup:** Cancelled subscription, past renewal date
2. **Expected:**
   - `EXPIRATION` webhook fires
   - User's `subscription_status` → `'free'`
   - User sees upgrade prompts again
   - Scan limit enforced (10 scans)
   - History still accessible

### Billing Issue

**Scenario:** Payment fails during renewal

1. **Setup:** Subscription with failed payment
2. **Expected:**
   - `BILLING_ISSUE` webhook fires
   - User notified (if implemented)
   - Grace period applies
   - User can update payment method

### Network Errors

**Scenario:** No internet during purchase

1. **Setup:** Disable Wi-Fi/cellular
2. **Action:** Attempt purchase
3. **Expected:**
   - ✅ Error message shown
   - ✅ Purchase doesn't complete
   - ✅ No partial state issues
   - ✅ User can retry when online

### Cache Validation

**Scenario:** Verify cache works correctly

1. **Purchase premium subscription**
2. **Check logs:** "Setting subscription cache"
3. **Navigate around app:** Verify no repeated API calls
4. **Wait 5 minutes:** Cache should expire
5. **Navigate again:** Should re-fetch subscription status
6. **Cancel subscription:** Cache should clear immediately

---

## Troubleshooting

### "No products available"

**Cause:** RevenueCat not connected to App Store Connect

**Solution:**
1. Verify products exist in RevenueCat dashboard
2. Check App Store Connect has matching subscription
3. Ensure bundle ID matches
4. Wait 24 hours after creating products (Apple caching)
5. Check RevenueCat API key is correct

### "Purchase failed" with no error

**Cause:** Could be multiple issues

**Solutions:**
1. Check sandbox account is signed in
2. Verify product ID matches exactly
3. Check RevenueCat logs for details
4. Ensure app has correct entitlements
5. Try different sandbox account

### Webhook not received

**Cause:** Configuration or delivery issue

**Solutions:**
1. Verify webhook URL is correct
2. Check authorization header matches secret
3. Test webhook manually in RevenueCat dashboard
4. Check Supabase Edge Function logs
5. Verify Edge Function is deployed
6. Check network/firewall isn't blocking

### Subscription not restoring

**Cause:** RevenueCat not configured or network issue

**Solutions:**
1. Check RevenueCat initialized successfully
2. Verify user ID passed to `configureRevenueCat()`
3. Check network connection
4. Try manual restore (debug screen)
5. Check RevenueCat dashboard for user's purchases

### Deep link to Settings fails

**Cause:** iOS version or permissions

**Solutions:**
1. Ensure iOS 13 or later
2. Test on physical device (simulators behave differently)
3. Verify URL scheme is correct
4. Check fallback instructions display
5. Try `Linking.openSettings()` as alternative

---

## Verification Checklist

Use this checklist before submitting to App Store:

### Sandbox Testing
- [ ] Sandbox account created in App Store Connect
- [ ] Can complete purchase with sandbox account
- [ ] Webhook fires and updates database
- [ ] Subscription shows in RevenueCat dashboard
- [ ] User has immediate premium access

### Restoration Testing
- [ ] Reinstall app restores subscription automatically
- [ ] Device switch maintains subscription
- [ ] Works for both Stripe and Apple IAP
- [ ] Logs show restoration success

### Cancellation Testing
- [ ] Stripe cancellation works correctly
- [ ] Apple Settings deep link works
- [ ] Cancelled subscription shows correct status
- [ ] User keeps access until period end
- [ ] Database updates correctly

### Webhook Testing
- [ ] INITIAL_PURCHASE webhook received and processed
- [ ] RENEWAL webhook received and processed
- [ ] CANCELLATION webhook received and processed
- [ ] EXPIRATION webhook received and processed
- [ ] All webhooks return 200 OK status

### UI/UX Testing
- [ ] Payment method selection modal displays correctly
- [ ] Loading states show during purchase
- [ ] Error messages are user-friendly
- [ ] Success states display correctly
- [ ] Manage Subscription screen shows correct info
- [ ] Profile screen shows payment method badge

---

## Testing Timeline

**Week 1: Sandbox Testing**
- Set up sandbox accounts
- Test basic purchase flow
- Verify webhook delivery
- Test cancellation

**Week 2: TestFlight Testing**
- Upload build to TestFlight
- Invite beta testers
- Test all flows with real users
- Gather feedback

**Week 3: Edge Case Testing**
- Test restoration flows
- Test error scenarios
- Test device switching
- Final verification

**Week 4: App Store Submission**
- Complete final checklist
- Switch to production keys
- Submit for review

---

## Useful Commands

### Check Webhook Logs
```bash
supabase functions logs revenuecat-webhook --limit 50
```

### Query User Subscription
```sql
SELECT 
  email,
  subscription_status,
  payment_method,
  apple_original_transaction_id,
  revenuecat_customer_id,
  stripe_customer_id,
  stripe_subscription_id,
  updated_at
FROM users
WHERE email = 'test@example.com';
```

### Check Sandbox Purchases in RevenueCat
1. Go to RevenueCat Dashboard
2. Navigate to **Customers**
3. Search for your app user ID
4. View transaction history

---

## Resources

- [RevenueCat Sandbox Testing Guide](https://www.revenuecat.com/docs/test-and-launch/sandbox-testing)
- [Apple Sandbox Testing Documentation](https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases_with_sandbox)
- [RevenueCat Webhook Events](https://www.revenuecat.com/docs/integrations/webhooks)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)

---

## Support

If you encounter issues not covered in this guide:

1. Check RevenueCat logs in dashboard
2. Check Supabase Edge Function logs
3. Review app console logs (look for `[REVENUECAT]` prefix)
4. Contact RevenueCat support (they're very responsive)
5. Check Apple Developer Forums for StoreKit issues

---

**Last Updated:** October 2025  
**Version:** 1.0.0

