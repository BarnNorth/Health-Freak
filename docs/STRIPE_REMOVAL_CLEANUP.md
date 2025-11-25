# Stripe Removal Cleanup Guide

This guide walks you through cleaning up Stripe-related configuration from Supabase and Expo/EAS after removing Stripe from the codebase.

## 📋 Overview

Since Stripe has been removed from the app, you need to:
1. ✅ Remove Stripe Edge Functions from Supabase (if still deployed)
2. ✅ Remove Stripe secrets from Supabase Edge Function secrets
3. ✅ Remove Stripe environment variables from EAS
4. ✅ Remove Stripe variables from local `.env` files
5. ✅ Verify RevenueCat webhook is still configured

---

## 🔧 Step 1: Supabase Cleanup

### 1.1 Remove Stripe Edge Functions (if still deployed)

**Check which functions are deployed:**
```bash
npx supabase functions list
```

**If you see any Stripe functions, delete them:**
```bash
# These functions should already be deleted from codebase, but may still be deployed
# Delete them from Supabase if they exist:
npx supabase functions delete stripe-checkout
npx supabase functions delete stripe-webhook
npx supabase functions delete stripe-cancel-subscription
```

**Note:** If the functions don't exist, you'll get an error - that's fine, they're already gone.

### 1.2 Remove Stripe Secrets from Supabase

**Go to Supabase Dashboard:**
1. Navigate to: **Project Settings → Edge Functions → Secrets**
   - Direct link: `https://supabase.com/dashboard/project/[YOUR_PROJECT_ID]/settings/functions`

2. **Delete these Stripe secrets** (if they exist):
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_ID_SANDBOX`
   - `STRIPE_PRICE_ID_PROD`
   - `STRIPE_CANCEL_MODE`

3. **Keep these secrets** (still needed):
   - `OPENAI_API_KEY` ✅
   - `REVENUECAT_WEBHOOK_AUTH_TOKEN` ✅
   - `SUPABASE_SERVICE_ROLE_KEY` ✅

**Alternative: Using Supabase CLI**
```bash
# List all secrets
npx supabase secrets list

# Delete Stripe secrets (if they exist)
npx supabase secrets unset STRIPE_SECRET_KEY
npx supabase secrets unset STRIPE_WEBHOOK_SECRET
npx supabase secrets unset STRIPE_PRICE_ID_SANDBOX
npx supabase secrets unset STRIPE_PRICE_ID_PROD
npx secrets unset STRIPE_CANCEL_MODE
```

### 1.3 Verify RevenueCat Webhook is Active

**Check RevenueCat webhook function:**
```bash
npx supabase functions list
```

**Should show:**
- ✅ `revenuecat-webhook` - Active
- ✅ `delete-user` - Active

**If `revenuecat-webhook` is missing, redeploy it:**
```bash
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
```

**Verify webhook in RevenueCat Dashboard:**
1. Go to: https://app.revenuecat.com/
2. Navigate to: **Project Settings → Webhooks**
3. Verify webhook URL is correct:
   ```
   https://[your-project].supabase.co/functions/v1/revenuecat-webhook
   ```
4. Verify webhook is active and receiving events

---

## 🔧 Step 2: EAS Environment Variables Cleanup

### 2.1 List Current Environment Variables

```bash
# Check all environments
eas env:list

# Check specific environment
eas env:list --environment production
eas env:list --environment preview
eas env:list --environment development
```

### 2.2 Remove Stripe Variables from EAS

**Delete Stripe environment variables** (if they exist):

```bash
# Remove from all environments
eas env:delete STRIPE_SECRET_KEY --environment production
eas env:delete STRIPE_SECRET_KEY --environment preview
eas env:delete STRIPE_SECRET_KEY --environment development

eas env:delete STRIPE_WEBHOOK_SECRET --environment production
eas env:delete STRIPE_WEBHOOK_SECRET --environment preview
eas env:delete STRIPE_WEBHOOK_SECRET --environment development

eas env:delete EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY --environment production
eas env:delete EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY --environment preview
eas env:delete EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY --environment development

eas env:delete STRIPE_PRICE_ID --environment production
eas env:delete STRIPE_PRICE_ID --environment preview
eas env:delete STRIPE_PRICE_ID --environment development

eas env:delete STRIPE_TEST_PRICE_ID --environment production
eas env:delete STRIPE_TEST_PRICE_ID --environment preview
eas env:delete STRIPE_TEST_PRICE_ID --environment development
```

**Note:** If a variable doesn't exist, you'll get an error - that's fine, it's already removed.

### 2.3 Verify Required Variables Still Exist

**These should remain:**
- ✅ `EXPO_PUBLIC_SUPABASE_URL` (Plain)
- ✅ `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Plain)
- ✅ `EXPO_PUBLIC_REVENUECAT_API_KEY` (Plain)
- ✅ `EXPO_PUBLIC_APP_URL` (Plain)
- ✅ `OPENAI_API_KEY` (Secret) - if using EAS for OpenAI

---

## 🔧 Step 3: Local Environment Variables Cleanup

### 3.1 Update Local `.env` File

**Remove Stripe variables from your local `.env` file:**

```bash
# Open your .env file and remove these lines:
# EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
# STRIPE_PRICE_ID=price_...
# STRIPE_TEST_PRICE_ID=price_...
```

**Your `.env` should now only contain:**

```bash
# ============================================
# Database & Authentication
# ============================================
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# ============================================
# Payments (Apple IAP via RevenueCat)
# ============================================
EXPO_PUBLIC_REVENUECAT_API_KEY=appl_your-revenuecat-api-key

# ============================================
# App Configuration
# ============================================
EXPO_PUBLIC_APP_URL=exp://localhost:8081
```

**Note:** `OPENAI_API_KEY` is stored in Supabase Edge Function secrets, not in `.env`.

### 3.2 Update `.env.example` (if it exists)

If you have a `.env.example` file, remove Stripe references from it as well.

---

## ✅ Verification Checklist

After cleanup, verify everything still works:

### Supabase Verification
- [ ] Stripe Edge Functions removed (or confirmed they don't exist)
- [ ] Stripe secrets removed from Supabase Dashboard
- [ ] RevenueCat webhook function is deployed and active
- [ ] RevenueCat webhook URL is correct in RevenueCat Dashboard

### EAS Verification
- [ ] Stripe environment variables removed from EAS
- [ ] Required variables (`EXPO_PUBLIC_REVENUECAT_API_KEY`, etc.) still exist
- [ ] Can list variables without errors: `eas env:list`

### Local Development Verification
- [ ] `.env` file updated (Stripe variables removed)
- [ ] App builds successfully: `npm start`
- [ ] No Stripe-related errors in console
- [ ] Apple IAP purchase flow works

### RevenueCat Verification
- [ ] Webhook is active in RevenueCat Dashboard
- [ ] Webhook URL points to correct Supabase function
- [ ] Test webhook event succeeds (check Supabase logs)

---

## 🧪 Test After Cleanup

### 1. Test App Build
```bash
# Start development server
npm start

# Should start without errors
# Check console for any Stripe-related warnings
```

### 2. Test Apple IAP Flow
1. Sign in to app
2. Tap "Upgrade to Premium"
3. Complete Apple IAP purchase (sandbox account)
4. Verify subscription status updates
5. Check Supabase logs for webhook events

### 3. Test Webhook
1. Go to RevenueCat Dashboard → Webhooks
2. Click "Send test event"
3. Select "Initial Purchase" event
4. Check Supabase → Functions → Logs
5. Should see successful webhook processing

---

## 🚨 Troubleshooting

### "Function not found" errors
- **Issue:** Trying to delete functions that don't exist
- **Solution:** This is fine - they're already removed. Ignore the error.

### "Secret not found" errors
- **Issue:** Trying to delete secrets that don't exist
- **Solution:** This is fine - they're already removed. Ignore the error.

### "Environment variable not found" errors
- **Issue:** Trying to delete EAS variables that don't exist
- **Solution:** This is fine - they're already removed. Ignore the error.

### Webhook not receiving events
- **Issue:** RevenueCat webhook not firing
- **Solution:**
  1. Verify webhook URL in RevenueCat Dashboard
  2. Check webhook authorization token matches Supabase secret
  3. Verify `revenuecat-webhook` function is deployed
  4. Check Supabase function logs for errors

### App build errors
- **Issue:** Build fails after cleanup
- **Solution:**
  1. Verify all required environment variables exist
  2. Check `app.config.js` doesn't reference Stripe
  3. Clear cache: `expo start -c`
  4. Rebuild: `npm run build`

---

## 📝 Summary

After completing this cleanup:

✅ **Supabase:**
- Stripe Edge Functions removed
- Stripe secrets removed
- RevenueCat webhook active

✅ **EAS:**
- Stripe environment variables removed
- Required variables still configured

✅ **Local:**
- `.env` file cleaned up
- No Stripe references in code

✅ **App:**
- Apple IAP only
- RevenueCat integration working
- Webhooks functioning

---

## 🎯 Next Steps

After cleanup is complete:

1. **Test thoroughly** - Verify Apple IAP flow works end-to-end
2. **Monitor webhooks** - Check RevenueCat webhook events are processing
3. **Update team** - Let team know Stripe has been removed
4. **Documentation** - Update any internal docs referencing Stripe

---

**Need Help?**
- Supabase Docs: https://supabase.com/docs
- EAS Docs: https://docs.expo.dev/eas/
- RevenueCat Docs: https://docs.revenuecat.com/

