# Production Launch Checklist

## 📋 Overview

**Current Status:** ✅ **90% Production Ready**

Most of the hard work is done! This checklist covers the final steps to transition from TestFlight to Production.

---

## ✅ COMPLETED - Already Production Ready

These critical items are complete and require no action:

- [x] **API Keys Secured** - All keys in environment variables, none in code
- [x] **Webhook Security** - Signature verification enforced, no bypasses
- [x] **Dynamic URLs** - Environment-based configuration ready
- [x] **Production Logging** - Clean, professional logging with 26% reduction
- [x] **Configurable Cancellation** - Environment-based behavior ready
- [x] **Fresh Git Repo** - No API key history, clean slate
- [x] **TestFlight Ready** - STRIPE_CANCEL_MODE=immediate set ✅

---

## 🎯 PRODUCTION LAUNCH CHECKLIST

Work through these items before launching to production:

### Phase 1: Stripe Configuration

#### [ ] 1.1 Switch to Live Stripe Keys

**App Environment (.env file):**
```bash
# Change from test key:
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# To live key:
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**Where to get live keys:**
- Go to: https://dashboard.stripe.com/apikeys
- Copy the **Publishable key** (starts with `pk_live_`)

---

#### [ ] 1.2 Update Supabase Stripe Secrets

**Supabase Dashboard:**
1. Go to: https://supabase.com/dashboard/project/vuiaqdkbpkbcvyrzpmzv/settings/functions
2. Navigate to **"Secrets"** tab
3. Update these secrets:

| Secret Name | Value | Where to Get |
|------------|--------|--------------|
| `STRIPE_SECRET_KEY` | `sk_live_your_key` | Stripe Dashboard → API Keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_your_secret` | Stripe Dashboard → Webhooks → Signing secret |

---

#### [ ] 1.3 Change Subscription Cancellation Mode

**Remove test mode behavior:**

**Option A - Delete the variable (Recommended):**
1. Go to: https://supabase.com/dashboard/project/vuiaqdkbpkbcvyrzpmzv/settings/functions
2. Go to **"Secrets"** tab
3. Find `STRIPE_CANCEL_MODE`
4. Click delete/remove

**Option B - Set to production value:**
- Change `STRIPE_CANCEL_MODE` from `immediate` to `end-of-period`

**Result:**
- ✅ Users retain access until billing period ends
- ✅ Industry-standard behavior
- ✅ User messages automatically update

---

#### [ ] 1.4 Configure Stripe Live Mode

**Stripe Dashboard:**
1. Go to: https://dashboard.stripe.com
2. Toggle to **Live mode** (top right)
3. Verify subscription products exist:
   - Premium subscription product
   - Price set correctly ($10/month or your pricing)
4. Create webhook for production:
   - Go to: Developers → Webhooks → Add endpoint
   - URL: Your Supabase function URL
   - Events: `checkout.session.completed`, `customer.subscription.*`

---

### Phase 2: Environment Variables

#### [ ] 2.1 Update App URL to Production

**Your .env file:**
```bash
# Change from:
EXPO_PUBLIC_APP_URL=exp://localhost:8081

# To your production URL:
EXPO_PUBLIC_APP_URL=https://yourapp.com
# Or your deep link scheme
```

**This affects:**
- Auth email callbacks
- Subscription success redirects
- Subscription cancel redirects

---

#### [ ] 2.2 Verify Production API Keys

**Check these in your .env file:**

```bash
# OpenAI - Production key
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-your-production-key

# Google Cloud Vision - Production key  
EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY=your-production-key
EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_ID=your-production-project

# Supabase - Should already be production
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Stripe - Live publishable key (updated in 1.1)
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**Verify:**
- [ ] All keys are production (not test)
- [ ] OpenAI key starts with `sk-proj-` or `sk-`
- [ ] Stripe key starts with `pk_live_`
- [ ] Keys are working (not revoked)

---

### Phase 3: Code Configuration

#### [ ] 3.1 Disable Mock Data Fallback (if enabled)

**File:** `app.json`

Check if this exists and set to false:
```json
{
  "expo": {
    "extra": {
      "ocrFallbackToMock": false  // or remove this line entirely
    }
  }
}
```

---

#### [ ] 3.2 Remove Test Functions (Optional)

**Search for and remove test functions in:**
- [ ] `services/aiAnalysis.ts` - `testOpenAIAPIKey()`, `testAIAnalysis()`
- [ ] `services/photoAnalysis.ts` - `testOCR()`
- [ ] `lib/database.ts` - `testDatabaseConnection()`

**Note:** Only if these functions exist

---

### Phase 4: Supabase Configuration

#### [ ] 4.1 Verify Edge Functions Are Deployed

**Check deployment:**
```bash
# List deployed functions
npx supabase functions list
```

**Should show:**
- [x] `stripe-webhook` - Active
- [x] `stripe-checkout` - Active
- [x] `stripe-cancel-subscription` - Active

**If needed, redeploy:**
```bash
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy stripe-checkout --no-verify-jwt
npx supabase functions deploy stripe-cancel-subscription --no-verify-jwt
```

---

#### [ ] 4.2 Update Supabase Allowed Origins

**Supabase Dashboard:**
1. Go to: Authentication → URL Configuration
2. Add your production URL to:
   - Site URL
   - Redirect URLs
   - Additional Redirect URLs (if needed)

---

#### [ ] 4.3 Verify Database RLS Policies

**Quick check:**
- [ ] Users can only access their own data
- [ ] Premium features gated by subscription_status
- [ ] Real-time subscriptions working

**Test in Supabase SQL Editor:**
```sql
-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

---

### Phase 5: App Store Preparation

#### [ ] 5.1 Update App Version

**File:** `app.json`

```json
{
  "expo": {
    "version": "1.0.0",  // Update to production version
    "ios": {
      "buildNumber": "1"  // Increment if needed
    },
    "android": {
      "versionCode": 1  // Increment if needed
    }
  }
}
```

---

#### [ ] 5.2 Build for Production

**iOS:**
```bash
eas build --platform ios --profile production
```

**Android:**
```bash
eas build --platform android --profile production
```

**Or traditional build:**
```bash
# iOS
expo build:ios

# Android  
expo build:android
```

---

#### [ ] 5.3 Prepare App Store Listing

**App Store Connect (iOS):**
- [ ] App name finalized
- [ ] Screenshots uploaded (all required sizes)
- [ ] App description written
- [ ] Keywords set
- [ ] Privacy policy URL added
- [ ] Terms of service URL added
- [ ] Support URL/email added
- [ ] Age rating configured
- [ ] Pricing set (free with IAP)

**Google Play Console (Android):**
- [ ] All similar items as above
- [ ] Store listing complete
- [ ] Content rating questionnaire completed
- [ ] Privacy policy link added

---

### Phase 6: Production Testing

#### [ ] 6.1 Test with Real Payment

**Critical: Test subscription flow with real card**

1. [ ] Create new account
2. [ ] Subscribe to premium with real card
3. [ ] Verify real charge in Stripe Dashboard
4. [ ] Verify premium features unlock
5. [ ] Refund the test charge immediately
6. [ ] Verify subscription status updates

---

#### [ ] 6.2 Test Cancellation Behavior

**Verify end-of-period cancellation:**

1. [ ] Subscribe with real card (small amount)
2. [ ] Cancel subscription
3. [ ] Verify message says "retain access until [date]"
4. [ ] Verify subscription shows `cancel_at_period_end: true` in Stripe
5. [ ] Verify access NOT lost immediately
6. [ ] Wait for period end (or manually expire in Stripe)
7. [ ] Verify access removed after period ends

---

#### [ ] 6.3 Test Auth Flow

- [ ] Sign up with real email
- [ ] Receive and verify confirmation email
- [ ] Sign in
- [ ] Sign out
- [ ] Password reset flow
- [ ] Verify auth callbacks redirect correctly

---

#### [ ] 6.4 Test Core Features

- [ ] Take photo of ingredient list
- [ ] OCR extraction works
- [ ] AI analysis displays results
- [ ] Premium features work
- [ ] Free tier limits enforced
- [ ] History saves correctly
- [ ] Real-time subscription updates work

---

### Phase 7: Monitoring Setup

#### [ ] 7.1 Set Up Production Monitoring

**Supabase:**
- [ ] Edge Function logs being captured
- [ ] Database logs enabled
- [ ] Set up alerts for errors

**Stripe:**
- [ ] Email notifications enabled
- [ ] Webhook monitoring active
- [ ] Failed payment alerts set

**Analytics (Optional):**
- [ ] Crash reporting configured
- [ ] User analytics enabled
- [ ] Performance monitoring active

---

### Phase 8: Launch

#### [ ] 8.1 Submit to App Stores

**iOS:**
1. [ ] Upload build to App Store Connect
2. [ ] Complete all metadata
3. [ ] Submit for review
4. [ ] Respond to any review questions

**Android:**
1. [ ] Upload build to Google Play Console
2. [ ] Complete all metadata
3. [ ] Submit for review

---

#### [ ] 8.2 Verify Production Environment

**After submission, before going live:**

- [ ] All environment variables correct
- [ ] Stripe in live mode
- [ ] Webhook endpoints configured
- [ ] API keys are production keys
- [ ] `STRIPE_CANCEL_MODE` deleted or set to `end-of-period`
- [ ] URLs point to production
- [ ] Database ready
- [ ] Monitoring active

---

#### [ ] 8.3 Launch Day Checklist

**When app goes live:**

- [ ] Monitor Edge Function logs
- [ ] Monitor Stripe Dashboard
- [ ] Monitor app store reviews
- [ ] Test core flows immediately
- [ ] Have support email ready
- [ ] Be ready for user feedback

---

## 📊 Configuration Summary

### TestFlight vs Production

| Item | TestFlight ✅ | Production (To Do) |
|------|--------------|-------------------|
| Stripe Keys | `pk_test_...` | `pk_live_...` |
| Cancellation Mode | `immediate` | Unset (or `end-of-period`) |
| App URL | `exp://localhost:8081` | `https://yourapp.com` |
| API Keys | Test/Dev | Production |
| Webhook Secret | Test | Live |
| Mock Data | May be on | Off |
| Environment Variables | Secure ✅ | Secure ✅ |
| Logging | Production-ready ✅ | Production-ready ✅ |
| Webhook Security | Enforced ✅ | Enforced ✅ |

---

## 🔥 Quick Reference

### Supabase Dashboard
- **Project:** https://supabase.com/dashboard/project/vuiaqdkbpkbcvyrzpmzv
- **Functions:** https://supabase.com/dashboard/project/vuiaqdkbpkbcvyrzpmzv/functions
- **Secrets:** https://supabase.com/dashboard/project/vuiaqdkbpkbcvyrzpmzv/settings/functions

### Stripe Dashboard
- **Live Mode:** https://dashboard.stripe.com
- **API Keys:** https://dashboard.stripe.com/apikeys
- **Webhooks:** https://dashboard.stripe.com/webhooks

### GitHub
- **Repo:** https://github.com/BarnNorth/Health-Freak

---

## 🎯 Final Steps Summary

**Before you launch, complete these 4 main things:**

1. **[ ] Stripe → Live Mode**
   - Switch all keys to live
   - Delete/update `STRIPE_CANCEL_MODE`
   - Configure webhook

2. **[ ] Environment Variables**
   - Update `EXPO_PUBLIC_APP_URL`
   - Verify all production keys

3. **[ ] Build & Test**
   - Build for production
   - Test with real payment
   - Test cancellation

4. **[ ] Submit & Monitor**
   - Submit to stores
   - Set up monitoring
   - Be ready for launch

---

## ✅ You're Almost There!

**Completed:** 90%
- ✅ Security hardened
- ✅ Environment configuration ready
- ✅ TestFlight configured and tested
- ✅ Code production-ready

**Remaining:** 10%
- 🎯 Switch to live Stripe keys
- 🎯 Update environment variables
- 🎯 Build and submit
- 🎯 Launch! 🚀

---

## 📞 Need Help?

- **TestFlight Checklist:** [TESTFLIGHT_CHECKLIST.md](./TESTFLIGHT_CHECKLIST.md)
- **Security Docs:** [SECURITY.md](./SECURITY.md)
- **Stripe Support:** https://support.stripe.com
- **Supabase Docs:** https://supabase.com/docs

**Good luck with your launch! 🎉**

