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
# OpenAI API key is stored in Supabase Edge Function secrets
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-key
```

### 3. Webhook Security ✅
**Status:** Enforced

Webhook authorization verification is active - only genuine RevenueCat webhooks accepted.

### 4. Production-Ready Logging ✅
**Status:** Cleaned up

Excessive debug logs removed, only essential logs remain with `[AUTH]` prefix.

---

## ⚙️ TestFlight-Specific Configuration

**Note:** Stripe integration has been removed. The app now uses Apple In-App Purchase exclusively via RevenueCat.

### 1. RevenueCat Sandbox Mode
**Required:** Use RevenueCat **sandbox API key** for TestFlight

**Set this in your .env:**
```bash
EXPO_PUBLIC_REVENUECAT_API_KEY=appl_your_sandbox_key_here
```

**Verify in RevenueCat Dashboard:**
- Use sandbox API key (starts with `appl_`)
- Test with Apple sandbox accounts
- Webhook configured for test events

### 2. Mock Data Fallback (Optional)
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
- [ ] Complete Apple IAP purchase with sandbox account
- [ ] Verify premium status updates immediately
- [ ] Test unlimited scans with premium
- [ ] **Cancel subscription** (via iPhone Settings)
- [ ] Verify cancellation status updates
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

## 🔍 Apple Sandbox Testing

Use Apple sandbox test accounts for testing subscriptions in TestFlight:

**Setup:**
1. Create sandbox test accounts in App Store Connect
2. Sign out of your Apple ID in Settings → App Store
3. When prompted during purchase, sign in with sandbox account
4. Purchases are free in sandbox mode

**More info:** https://developer.apple.com/apple-pay/sandbox-testing/

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
- Premium subscriptions with Apple In-App Purchase
- Unlimited ingredient scanning for premium users
- Real-time subscription status updates

TESTING FOCUS:
- Test subscription flow (use Apple sandbox account)
- Verify subscription cancellation via iPhone Settings
- Verify ingredient analysis accuracy
- Test with various product labels

KNOWN TEST MODE BEHAVIORS:
- Using Apple sandbox accounts (no real charges)
- Local development URLs (will be production URLs in release)
```

---

## 🚨 Common TestFlight Issues

### Issue: "Subscription didn't update"
**Solution:** Check Supabase webhook logs - may need to trigger manual sync

### Issue: "Can't take photos"
**Solution:** Check camera permissions in device settings

### Issue: "Apple IAP purchase doesn't complete"
**Solution:** Verify you're signed out of your Apple ID and using a sandbox test account

### Issue: "Subscription status doesn't update"
**Solution:** Check RevenueCat webhook logs in Supabase - may need to trigger manual sync

---

## 📊 TestFlight vs Production

| Feature | TestFlight | Production |
|---------|-----------|------------|
| RevenueCat Keys | Sandbox key (`appl_...`) | Production key (`appl_...`) |
| Apple Accounts | Sandbox test accounts | Real Apple IDs |
| API Keys | Test keys | Production keys |
| URLs | `exp://localhost:8081` | `https://yourapp.com` |
| Webhook Secret | Test webhook secret | Production webhook secret |
| User Messages | Sandbox mode | Production messages |

---

## ✅ Ready for TestFlight When:

- [x] All environment variables configured
- [x] RevenueCat sandbox API key added
- [x] Apple sandbox test accounts created
- [ ] App built with EAS/Xcode
- [ ] Uploaded to App Store Connect
- [ ] Internal testing completed
- [ ] Test notes added for testers

---

## 🎯 Next Step: Production

Once TestFlight testing is complete and you're ready for production, see: [PRODUCTION_CHANGES.md](./PRODUCTION_CHANGES.md)

**Key production changes:**
- Switch to production RevenueCat API key
- Update `EXPO_PUBLIC_APP_URL` to production domain
- Deploy to App Store

