# TestFlight Deployment Checklist

## 🧪 Getting Ready for TestFlight

This checklist covers everything you need to configure for TestFlight testing. TestFlight uses **test mode** configurations that allow for faster testing iterations.

---

## ✅ Configuration Completed

### 1. Environment-Based URLs ✅
**Status:** Configured and ready

The app now uses `EXPO_PUBLIC_APP_URL` for all redirects:
- Auth callbacks
- Subscription success/cancel URLs

**For TestFlight:**
```bash
# In your .env file:
EXPO_PUBLIC_APP_URL=exp://localhost:8081
# Or use your local IP for testing on device:
# EXPO_PUBLIC_APP_URL=exp://192.168.1.36:8081
```

### 2. API Keys in Environment Variables ✅
**Status:** Secured

All API keys are now in environment variables (never in code):
```bash
# Required in .env file:
EXPO_PUBLIC_OPENAI_API_KEY=sk-your-test-key-here
EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY=your-test-key-here
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-key
```

### 3. Webhook Security ✅
**Status:** Enforced

Webhook signature verification is active - only genuine Stripe webhooks accepted.

### 4. Production-Ready Logging ✅
**Status:** Cleaned up

Excessive debug logs removed, only essential logs remain with `[AUTH]` prefix.

---

## ⚙️ TestFlight-Specific Configuration

### 1. Stripe Test Mode
**Required:** Use Stripe **test keys** for TestFlight

**Set these in your .env:**
```bash
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key_here
```

**Set these in Supabase Edge Function Secrets:**
- `STRIPE_SECRET_KEY` = `sk_test_your_test_secret_key`
- `STRIPE_WEBHOOK_SECRET` = `whsec_your_test_webhook_secret`

### 2. Immediate Subscription Cancellation (Test Mode)
**Required:** For fast testing iterations

**In Supabase Dashboard:**

1. Go to: https://supabase.com/dashboard/project/vuiaqdkbpkbcvyrzpmzv/settings/functions
2. Navigate to **"Secrets"** tab
3. Add new secret:
   - **Name:** `STRIPE_CANCEL_MODE`
   - **Value:** `immediate`

**What this does:**
- ✅ Subscriptions cancel immediately (not at period end)
- ✅ Allows quick testing of cancel → re-subscribe flow
- ✅ Users see message: *"This is test mode behavior"*

### 3. Mock Data Fallback (Optional)
**Optional:** Enable if you want to test without real API calls

**In app.json:**
```json
{
  "expo": {
    "extra": {
      "ocrFallbackToMock": true
    }
  }
}
```

**Use case:** Testing UI without consuming API credits

---

## 🧪 Testing Checklist

Before submitting to TestFlight:

### Authentication Flow
- [ ] Sign up with new account
- [ ] Verify email confirmation works
- [ ] Sign in with existing account
- [ ] Sign out and verify session cleared
- [ ] Test password reset flow

### OCR & Analysis
- [ ] Take photo of ingredient list
- [ ] Verify OCR extracts text correctly
- [ ] Verify AI analysis shows results
- [ ] Test with both clean and toxic products
- [ ] Verify free tier limits work (3 scans/month)

### Subscription Flow (Critical for TestFlight)
- [ ] Upgrade to premium from free tier
- [ ] Verify Stripe checkout opens
- [ ] Complete test payment (use test card: 4242 4242 4242 4242)
- [ ] Verify premium status updates immediately
- [ ] Test unlimited scans with premium
- [ ] **Cancel subscription**
- [ ] Verify immediate cancellation (test mode)
- [ ] Verify can re-subscribe immediately
- [ ] Test subscription status updates in real-time

### Premium Features
- [ ] Verify detailed ingredient analysis (premium only)
- [ ] Verify unlimited scans work
- [ ] Test history view with multiple scans
- [ ] Verify premium badge shows in profile

### Edge Cases
- [ ] Test with poor quality photos
- [ ] Test with non-ingredient images
- [ ] Test offline behavior
- [ ] Test app restart maintains auth state
- [ ] Test concurrent scans (if applicable)

---

## 🔍 Stripe Test Cards

Use these for testing subscriptions in TestFlight:

| Card Number | Scenario | CVC | Date |
|-------------|----------|-----|------|
| 4242 4242 4242 4242 | Success | Any 3 digits | Any future date |
| 4000 0000 0000 0002 | Declined | Any 3 digits | Any future date |
| 4000 0027 6000 3184 | Requires 3D Secure | Any 3 digits | Any future date |

**More test cards:** https://stripe.com/docs/testing#cards

---

## 📱 TestFlight Submission

### 1. Build for TestFlight
```bash
# Update version in app.json
# Then build:
eas build --platform ios --profile preview

# Or for Android:
eas build --platform android --profile preview
```

### 2. Upload to TestFlight
- Upload via App Store Connect
- Add test notes about what to test
- Distribute to internal testers first

### 3. Test Notes Template
```
Version X.X.X - TestFlight Build

NEW FEATURES:
- Premium subscriptions with Stripe
- Unlimited ingredient scanning for premium users
- Real-time subscription status updates

TESTING FOCUS:
- Test subscription flow (use test card 4242 4242 4242 4242)
- Subscription cancellation is IMMEDIATE in test mode
- Verify ingredient analysis accuracy
- Test with various product labels

KNOWN TEST MODE BEHAVIORS:
- Subscription cancels immediately (production will cancel at period end)
- Using Stripe test mode (no real charges)
- Local development URLs (will be production URLs in release)
```

---

## 🚨 Common TestFlight Issues

### Issue: "Subscription didn't update"
**Solution:** Check Supabase webhook logs - may need to trigger manual sync

### Issue: "Can't take photos"
**Solution:** Check camera permissions in device settings

### Issue: "Stripe checkout doesn't open"
**Solution:** Verify STRIPE_PUBLISHABLE_KEY is set in .env and is test key (pk_test_...)

### Issue: "Cancellation says 'end of period' but should be immediate"
**Solution:** Verify `STRIPE_CANCEL_MODE=immediate` is set in Supabase Edge Function secrets

---

## 📊 TestFlight vs Production

| Feature | TestFlight | Production |
|---------|-----------|------------|
| Stripe Keys | `pk_test_...` | `pk_live_...` |
| Cancellation | Immediate | End of period |
| API Keys | Test keys | Production keys |
| URLs | `exp://localhost:8081` | `https://yourapp.com` |
| Webhook Secret | Test webhook secret | Live webhook secret |
| User Messages | Shows "test mode" note | Production messages |

---

## ✅ Ready for TestFlight When:

- [x] All environment variables configured
- [x] Stripe test keys added
- [x] `STRIPE_CANCEL_MODE=immediate` set in Supabase
- [ ] App built with EAS/Xcode
- [ ] Uploaded to App Store Connect
- [ ] Internal testing completed
- [ ] Test notes added for testers

---

## 🎯 Next Step: Production

Once TestFlight testing is complete and you're ready for production, see: [PRODUCTION_CHANGES.md](./PRODUCTION_CHANGES.md)

**Key production changes:**
- Remove/unset `STRIPE_CANCEL_MODE` (or set to `end-of-period`)
- Switch to live Stripe keys
- Update `EXPO_PUBLIC_APP_URL` to production domain
- Deploy to App Store

