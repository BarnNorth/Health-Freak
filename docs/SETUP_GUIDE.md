# Setup Guide - Health Freak

Complete setup instructions for all API services and development environment.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [OpenAI Setup](#openai-setup)
- [Supabase Setup](#supabase-setup)
- [RevenueCat Setup](#revenuecat-setup)
- [Environment Variables](#environment-variables)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Studio
- Active accounts for:
  - [OpenAI](https://platform.openai.com/)
  - [Supabase](https://supabase.com/)
  - [RevenueCat](https://www.revenuecat.com/)

---

## OpenAI Setup

**Purpose:** AI-powered ingredient analysis and OCR text extraction

### Step 1: Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign in or create an account
3. Navigate to "API Keys" in the left sidebar
4. Click "Create new secret key"
5. Give it a name (e.g., "Health Freak - Development")
6. Copy the generated API key (starts with `sk-proj-` or `sk-`)
7. Store it securely - you'll need it for environment variables

### Step 2: Verify Account Setup

1. Check you have credits in your OpenAI account
2. Ensure billing is set up if required
3. Verify API access is enabled

### Model Configuration

The app now uses a **single OpenAI model** for all AI workflows:

**Unified Model: GPT-5 mini**
- **Purpose:** Powers both OCR (food label extraction) and ingredient analysis
- **Cost:** ~$0.05 per 1M input tokens / $0.40 per 1M output tokens
- **Speed:** Fast responses (often under 2 seconds per request)
- **Why:** Simplifies deployment while maintaining low cost and latency

**Optional:** You can configure the default model in `app.json`:
```json
{
  "expo": {
    "extra": {
      "openaiModel": "gpt-5-mini",
      "openaiMaxTokens": 128000
    }
  }
}
```

**Note:** All AI requests now use GPT-5 mini by default.

---

## Supabase Setup

**Purpose:** Database, authentication, and backend functions

### Step 1: Create Supabase Project

1. Go to [Supabase](https://supabase.com/)
2. Sign in with GitHub
3. Click "New Project"
4. Enter project details:
   - Name: "Health Freak"
   - Database Password: (generate strong password)
   - Region: (choose closest to users)
5. Click "Create new project"
6. Wait for setup to complete (~2 minutes)

### Step 2: Get API Credentials

1. Go to Settings → API
2. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Anon/Public Key** (starts with `eyJ...`)

### Step 3: Configure Authentication

1. Go to Authentication → Providers
2. Enable **Email** provider:
   - Toggle "Enable Email provider" ON
   - Enable "Confirm email" checkbox
   - Enable "Secure email change" checkbox
3. Configure **URL Configuration**:
   - Site URL: `healthfreak://`
   - Redirect URLs: `healthfreak://auth/callback`

### Step 4: Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Link your project
supabase link --project-ref your-project-ref

# Deploy functions
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy delete-user --no-verify-jwt
```

### Step 5: Run Database Migrations

```bash
# Apply all migrations
supabase db push

# Or run specific migration
supabase migration up
```

---

## RevenueCat Setup

**Purpose:** Apple in-app purchases (iOS subscriptions)

### Step 1: Create RevenueCat Account

1. Go to [RevenueCat](https://www.revenuecat.com/)
2. Sign up with your email or GitHub account
3. Verify your email address
4. Complete the onboarding wizard

### Step 2: Create a New Project

1. Click "Create new project"
2. Enter project details:
   - Name: "Health Freak"
   - Choose "iOS" as primary platform
3. Click "Create project"

### Step 3: Connect to App Store Connect

1. In RevenueCat Dashboard, go to Project Settings → App Store
2. Click "Connect to App Store Connect"
3. You'll need:
   - **App Store Connect API Key** - Create at [App Store Connect → Users and Access → Integrations → Keys](https://appstoreconnect.apple.com/access/integrations/api)
   - Key Name: "RevenueCat Integration"
   - Access: "Admin" or "App Manager"
   - Download the `.p8` key file and save the Key ID and Issuer ID
4. Upload the information to RevenueCat:
   - Issuer ID
   - Key ID
   - Upload the `.p8` file
5. Enter your **Bundle ID**: `com.healthfreak.app`
6. Click "Save"

### Step 4: Create Products and Entitlements

**Create Entitlement:**
1. Go to Entitlements → Create entitlement
2. Configure:
   - Identifier: `premium_access`
   - Display name: "Premium Access"
   - Description: "Unlimited scans and detailed ingredient analysis"
3. Click "Save"

**Create Product (iOS Subscription):**
1. First, create the subscription in [App Store Connect](https://appstoreconnect.apple.com/):
   - Go to Apps → Health Freak → In-App Purchases
   - Click "+" to add new subscription
   - Subscription Group: Create "Premium Membership"
   - Product ID: `healthfreak_premium_monthly`
   - Price: $9.99/month (or your pricing)
   - Subscription Duration: 1 month
   - Add localized names and descriptions
   - Submit for review

2. Back in RevenueCat Dashboard:
   - Go to Products → Create product
   - Product identifier: `healthfreak_premium_monthly` (must match App Store)
   - Display name: "Health Freak Premium"
   - Description: "Monthly premium subscription"
   - Select entitlement: `premium_access`
   - Click "Save"

### Step 5: Get API Keys

1. Go to Project Settings → API Keys
2. Copy the **Public app-specific API key** for iOS
   - Starts with `appl_` for Apple platform
3. Store it securely - you'll add it to `.env`

### Step 6: Configure Webhooks (Optional but Recommended)

To sync subscription status with Supabase:

1. Go to Project Settings → Integrations → Webhooks
2. Click "Add webhook"
3. Configure:
   - URL: Your Supabase function URL
     ```
     https://[your-project].supabase.co/functions/v1/revenuecat-webhook
     ```
   - Events: Select all subscription events:
     - Initial purchase
     - Renewal
     - Cancellation
     - Billing issue
     - Expiration
4. Copy the **Authorization header** value
5. Save the webhook

**Note:** The webhook handler is created in Steps 8-9 below.

### Step 7: Configure Environment Variable

Add your RevenueCat API key to `.env`:

```bash
EXPO_PUBLIC_REVENUECAT_API_KEY=appl_your_actual_api_key_here
```

### Step 7.5: Configure Dev Build RevenueCat (Optional)

For development builds with bundle ID `com.tommymulder.healthfreak`, you need a separate RevenueCat app:

**Create Dev RevenueCat App:**
1. In RevenueCat Dashboard, go to your project → Apps → + New App
2. Configure:
   - Platform: Apple App Store
   - Bundle ID: `com.tommymulder.healthfreak`
   - Name: "Health Freak (Dev)"
3. Get the dev API key from Project Settings → API Keys
4. Set as EAS secret:
   ```bash
   eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_API_KEY_DEV --value "appl_your_dev_key_here"
   ```

**Important Notes:**
- Dev builds will initialize RevenueCat SDK successfully with the dev API key
- Products won't load in dev builds unless you create products in App Store Connect for the dev bundle ID (not recommended)
- For actual purchase testing, use preview/production builds or StoreKit Configuration file
- The app automatically selects the correct API key based on the build variant

### Step 8: Deploy RevenueCat Webhook Function

Deploy the webhook handler to Supabase Edge Functions:

```bash
# Deploy the RevenueCat webhook handler
supabase functions deploy revenuecat-webhook --no-verify-jwt
```

**Note:** The `--no-verify-jwt` flag is required because RevenueCat uses custom authorization headers, not JWT tokens.

### Step 9: Configure Webhook in RevenueCat Dashboard

**Get Your Webhook URL:**

Your Supabase function URL will be:
```
https://[your-project-ref].supabase.co/functions/v1/revenuecat-webhook
```

Replace `[your-project-ref]` with your actual Supabase project reference (e.g., `vuiaqdkbpkbcvyrzpmzv`).

**Configure in RevenueCat:**

1. Go to **Project Settings** → **Integrations** → **Webhooks**
2. Click **"Add webhook"**
3. Enter your webhook URL above
4. Select these events:
   - ✅ **Initial Purchase** - First subscription
   - ✅ **Renewal** - Auto-renewal
   - ✅ **Cancellation** - User cancelled
   - ✅ **Expiration** - Subscription expired
   - ✅ **Billing Issue** - Payment failed
5. Click **"Save"**
6. **Copy the Authorization token** that RevenueCat generates

**Add Token to Supabase Secrets:**

```bash
# Option 1: Via Supabase CLI
supabase secrets set REVENUECAT_WEBHOOK_AUTH_TOKEN=your_token_here

# Option 2: Via Supabase Dashboard
# Go to: Functions → Secrets → Add Secret
# Name: REVENUECAT_WEBHOOK_AUTH_TOKEN
# Value: [paste token from RevenueCat]
```

**Test the Webhook:**

1. In RevenueCat Dashboard, go to the webhook you just created
2. Click **"Send test event"**
3. Select **"Initial Purchase"** event type
4. Click **"Send"**
5. Check the response - should see `{ "received": true }`
6. Verify in Supabase:
   - Go to **Functions** → **revenuecat-webhook** → **Logs**
   - Look for: `✅ Successfully processed INITIAL_PURCHASE`

---

## Environment Variables

### Step 1: Create .env File

```bash
# Copy template
cp .env.example .env

# Or create manually
touch .env
```

### Step 2: Add All Credentials

Create `.env` file with:

```bash
# ============================================
# AI Analysis & OCR (OpenAI)
# ============================================
# OpenAI API key is now stored securely in Supabase Edge Function
# No client-side API key needed

# ============================================
# Database & Authentication
# ============================================
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# ============================================
# Payments (Apple IAP via RevenueCat)
# ============================================
# RevenueCat - For iOS in-app purchases
EXPO_PUBLIC_REVENUECAT_API_KEY=appl_your-revenuecat-api-key

# ============================================
# App Configuration
# ============================================
EXPO_PUBLIC_APP_URL=exp://localhost:8081
```

### Step 3: Verify .gitignore

Ensure `.env` is in `.gitignore`:

```gitignore
# Environment variables
.env
.env*.local
```

**⚠️ NEVER commit .env files to version control!**

---

## Verification

### Test OpenAI Connection

```bash
# Start development server
npm start

# Take a photo of an ingredient list
# Check console for: "AI analysis successful"
```

### Test OCR

```bash
# Take a photo of ingredient list
# Check console for: "OCR extraction successful"
# Verify ingredient text is extracted correctly
```

### Test Database

```bash
# Sign up with new account
# Check Supabase Dashboard → Authentication → Users
# Verify user was created
```

### Test RevenueCat

```bash
# Test webhook:
# 1. Go to RevenueCat Dashboard → Webhooks
# 2. Click "Send test event" on your webhook
# 3. Select "Initial Purchase" event
# 4. Check Supabase → Functions → Logs for success message

# Test in app (requires TestFlight/production build):
# 1. Sign in to app
# 2. Check logs for "RevenueCat Configuration complete"
# 3. Tap "Upgrade to Premium" → Choose "App Store"
# 4. Complete purchase with Sandbox account
```

---

## Troubleshooting

### OpenAI Issues

**"API key not configured"**
- Verify `EXPO_PUBLIC_OPENAI_API_KEY` in `.env`
- Check key starts with `sk-proj-` or `sk-`
- Restart development server after adding key

**"OpenAI API call failed"**
- Verify API key is valid (not revoked)
- Check you have credits in OpenAI account
- Ensure billing is enabled

**"Rate limit exceeded"**
- You've hit OpenAI's rate limits
- Wait a few minutes and try again
- Consider upgrading OpenAI tier

### OCR Issues

**"OCR service not configured"**
- Verify `EXPO_PUBLIC_OPENAI_API_KEY` in `.env`
- Check key starts with `sk-proj-` or `sk-`
- Ensure OpenAI account has credits

**"OpenAI API error"**
- Check OpenAI API key is valid (not revoked)
- Verify you have sufficient credits
- Ensure billing is enabled in OpenAI account

**Poor OCR accuracy**
- Ensure good lighting when taking photos
- Keep camera steady (avoid blur)
- Make sure text is clearly visible
- Try different angles for curved surfaces
- Ensure ingredient list is in focus

### Supabase Issues

**"Authentication failed"**
- Verify `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Check Supabase project is active
- Ensure email provider is enabled

**"Database connection failed"**
- Verify RLS policies are configured
- Check migrations have been applied
- Ensure user has proper permissions

**"Edge function error"**
- Check function is deployed: `supabase functions list`
- Verify secrets are configured
- Check function logs in Supabase Dashboard

### RevenueCat Issues

**"RevenueCat API key not configured"**
- Verify `EXPO_PUBLIC_REVENUECAT_API_KEY` in `.env`
- Check key starts with `appl_` (for iOS)
- Restart development server after adding key

**"RevenueCat bundle ID mismatch in dev builds"**
- Dev builds use bundle ID `com.tommymulder.healthfreak` which doesn't match production `com.healthfreak.app`
- Create a separate RevenueCat app for dev bundle ID (see Step 7.5)
- Set `EXPO_PUBLIC_REVENUECAT_API_KEY_DEV` as EAS secret
- The app automatically uses the correct key based on build variant
- Note: Products won't load in dev builds without App Store Connect setup for dev bundle ID

**"Products not loading"**
- Ensure products are created in App Store Connect
- Verify product IDs match exactly in RevenueCat
- Check subscription is approved in App Store Connect
- Wait 2-4 hours after creating products for them to sync

**"Purchase not completing"**
- Ensure using Sandbox test account on iOS device
- Go to Settings → App Store → Sandbox Account
- Sign in with test account created in App Store Connect
- Never use production Apple ID for testing

**"Entitlement not activating"**
- Verify entitlement is linked to product in RevenueCat
- Check RevenueCat dashboard → Customer history
- Ensure webhook is configured correctly
- Test in Sandbox environment first

### General Issues

**"Environment variables not loading"**
- Restart development server: `npm start`
- Clear cache: `expo start -c`
- Verify `.env` file exists and has correct format

**"Build errors"**
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear Expo cache: `expo start -c`
- Check for TypeScript errors: `npm run type-check`

---

## Next Steps

After setup is complete:

1. **Run the app:**
   ```bash
   npm start
   ```

2. **Test core features:**
   - Sign up with a new account
   - Take a photo of ingredients
   - Verify OCR and AI analysis work
   - Test subscription flow

3. **Review documentation:**
   - [Developer Guide](DEVELOPER_GUIDE.md) - Architecture and development
   - [Production Checklist](PRODUCTION_CHECKLIST.md) - Going live
   - [TestFlight Checklist](TESTFLIGHT_CHECKLIST.md) - Beta testing

---

## Security Reminders

- ✅ Always use environment variables for API keys
- ✅ Keep `.env` in `.gitignore`
- ✅ Use test keys for development
- ✅ Rotate keys regularly
- ✅ Never share keys in chat/email
- ✅ Use separate keys for dev/staging/production

---

## Cost Summary

**Monthly costs for typical usage:**

| Service | Free Tier | Paid Tier | Typical Cost |
|---------|-----------|-----------|--------------|
| OpenAI (GPT-5 mini) | - | $0.0003-0.002/scan | $5-15/month |
| Supabase | 500MB DB, 2GB bandwidth | $25/month | $0-25/month |
| RevenueCat | Up to $2,500 MTR | 1% of revenue > $2,500 | $0-50/month |

**Total estimated cost:** $15-115/month depending on usage

**Notes:**
- RevenueCat MTR (Monthly Tracked Revenue) = gross subscription revenue before Apple's cut
- Apple takes 30% (or 15% after year 1 of subscription) before RevenueCat fees apply
- Example: $100 in subscriptions = $70 after Apple's cut, RevenueCat fee applies to the $100
- RevenueCat is free until you track $2,500/month in gross revenue

---

## Support Resources

- **OpenAI:** https://platform.openai.com/docs
- **Supabase:** https://supabase.com/docs
- **RevenueCat:** https://docs.revenuecat.com/

---

**Setup complete! You're ready to develop. 🚀**



