# Production Changes Required

## 🚨 CRITICAL: Security & Configuration

### 1. Remove Hardcoded API Keys from `app.json`

**Current (Testing - INSECURE):**
```json
{
  "expo": {
    "extra": {
      "googleCloudApiKey": "AIza...***REDACTED***",
      "openaiApiKey": "sk-proj-...***REDACTED***"
    }
  }
}
```

**Production (SECURE):**
```json
{
  "expo": {
    "extra": {
      "googleCloudProjectId": "your-production-project-id",
      "openaiEnabled": true,
      "openaiModel": "gpt-4o-mini",
      "openaiMaxTokens": 300,
      "ocrEnabled": true,
      "ocrMaxImageSize": 1200,
      "ocrPreprocessingEnabled": true
    }
  }
}
```

**Action Required:**
- Move API keys to environment variables or secure configuration
- Use `EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY` and `EXPO_PUBLIC_OPENAI_API_KEY`
- Never commit API keys to version control

### 2. Fix Hardcoded Development URLs

**Files to Update:**
- `services/stripe.ts` (lines 60-61)
- `contexts/AuthContext.tsx` (line 207)

**Current (Testing):**
```typescript
successUrl: 'exp://192.168.1.36:8081/--/subscription-success',
cancelUrl: 'exp://192.168.1.36:8081/--/subscription-cancel',
emailRedirectTo: 'exp://192.168.1.36:8081/--/auth/callback',
```

**Production:**
```typescript
successUrl: 'https://yourapp.com/subscription-success',
cancelUrl: 'https://yourapp.com/subscription-cancel',
emailRedirectTo: 'https://yourapp.com/auth/callback',
```

### 3. Remove Testing Mode from Webhook

**File: `supabase/functions/stripe-webhook/index.ts`**

**Current (Testing - INSECURE):**
```typescript
// TEMPORARILY: Skip signature verification for testing
console.log('TEMPORARILY SKIPPING SIGNATURE VERIFICATION FOR TESTING');
try {
  event = JSON.parse(body) as Stripe.Event;
} catch (parseError) {
  return new Response(`Failed to parse webhook body: ${parseError}`, { status: 400 });
}
```

**Production (SECURE):**
```typescript
// Remove the entire try-catch block and keep only:
event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
```

### 4. Disable Mock Data Fallback

**File: `app.json`**

**Current (Testing):**
```json
"ocrFallbackToMock": true
```

**Production:**
```json
"ocrFallbackToMock": false
```

## 🔄 Subscription Behavior Changes

### 5. Cancel Subscription Function

**File: `supabase/functions/stripe-cancel-subscription/index.ts`**

**Current (Testing):**
```typescript
// Cancel the subscription immediately (for testing - change back to cancel_at_period_end: true for production)
const cancelledSubscription = await stripe.subscriptions.cancel(subscription.id);
```

**Production:**
```typescript
// Cancel the subscription at the end of the current period
const cancelledSubscription = await stripe.subscriptions.update(subscription.id, {
  cancel_at_period_end: true,
});
```

### 6. User-Facing Messages

**File: `services/subscription.ts`**

**Current (Testing):**
```typescript
'Are you sure you want to cancel your premium subscription? You will lose access to premium features immediately (testing mode).'
'Your subscription has been cancelled immediately. You will lose premium access right away (testing mode).'
```

**Production:**
```typescript
'Are you sure you want to cancel your premium subscription? You will lose access to premium features at the end of your current billing period.'
'Your subscription has been cancelled. You will retain premium access until the end of your current billing period.'
```

## 🧹 Code Cleanup

### 7. Remove Debug Logging

**Files to clean up excessive console.log statements:**
- `contexts/AuthContext.tsx` (19 console.log statements)
- `services/aiAnalysis.ts` (test functions)
- `lib/database.ts` (test functions)

**Action:** Remove or reduce to essential error logging only.

### 8. Remove Test Functions

**Files with test functions to remove:**
- `services/aiAnalysis.ts`: `testOpenAIAPIKey()`, `testAIAnalysis()`
- `services/photoAnalysis.ts`: `testOCR()`
- `lib/database.ts`: `testDatabaseConnection()`

## 🚀 Deployment Checklist

### Before Deploying:

1. **✅ Remove all hardcoded API keys** from `app.json`
2. **✅ Update all hardcoded URLs** to production domains
3. **✅ Remove webhook signature bypass** in `stripe-webhook/index.ts`
4. **✅ Disable mock data fallback** (`ocrFallbackToMock: false`)
5. **✅ Change subscription cancellation** to end-of-period
6. **✅ Update user-facing messages** to remove "testing mode"
7. **✅ Remove debug logging** and test functions
8. **✅ Set up environment variables** for API keys
9. **✅ Configure production domains** in Supabase Dashboard
10. **✅ Test all functionality** in staging environment

### Deploy Commands:

```bash
# Deploy updated Edge Functions
npx supabase functions deploy stripe-cancel-subscription
npx supabase functions deploy stripe-webhook

# Build and deploy app
expo build:ios
expo build:android
```

## 🔒 Security Reminders

- **Never commit API keys** to version control
- **Use environment variables** for sensitive configuration
- **Enable webhook signature verification** in production
- **Use HTTPS URLs** for all redirects and callbacks
- **Test webhook security** before going live
