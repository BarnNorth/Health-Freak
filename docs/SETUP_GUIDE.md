# Setup Guide - Health Freak

Complete setup instructions for all API services and development environment.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [OpenAI Setup](#openai-setup)
- [Supabase Setup](#supabase-setup)
- [Stripe Setup](#stripe-setup)
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
  - [Stripe](https://stripe.com/)

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

The app uses **GPT-4 Vision (GPT-4o-mini)** for both OCR and ingredient analysis:

- **OCR Cost:** ~$0.001-0.003 per image scan
- **Analysis Cost:** ~$0.001-0.005 per ingredient analysis  
- **Speed:** ~2-5 seconds total per scan
- **Accuracy:** Excellent for both text extraction and ingredient classification

**Optional:** You can configure different models in `app.json`:
```json
{
  "expo": {
    "extra": {
      "openaiModel": "gpt-4o-mini",
      "openaiMaxTokens": 2000
    }
  }
}
```

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
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy stripe-checkout --no-verify-jwt
supabase functions deploy stripe-cancel-subscription --no-verify-jwt
```

### Step 5: Run Database Migrations

```bash
# Apply all migrations
supabase db push

# Or run specific migration
supabase migration up
```

---

## Stripe Setup

**Purpose:** Subscription payments and billing

### Step 1: Create Stripe Account

1. Go to [Stripe](https://stripe.com/)
2. Sign up or sign in
3. Complete account setup
4. Enable "Test mode" (toggle in top right)

### Step 2: Get API Keys

1. Go to Developers → API Keys
2. Copy these **test** keys:
   - **Publishable key** (starts with `pk_test_`)
   - **Secret key** (starts with `sk_test_`)

### Step 3: Create Subscription Product

1. Go to Products → Add product
2. Configure:
   - Name: "Health Freak Premium"
   - Description: "Unlimited scans and detailed analysis"
   - Pricing: Recurring
   - Price: $10 (or your price)
   - Billing period: Monthly
3. Click "Save product"
4. Copy the **Price ID** (starts with `price_`)

### Step 4: Configure Webhook

1. Go to Developers → Webhooks
2. Click "Add endpoint"
3. Configure:
   - Endpoint URL: Your Supabase function URL
     ```
     https://[your-project].supabase.co/functions/v1/stripe-webhook
     ```
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
4. Click "Add endpoint"
5. Copy the **Signing secret** (starts with `whsec_`)

### Step 5: Configure Supabase Secrets

1. Go to Supabase Dashboard → Functions → Secrets
2. Add these secrets:

| Secret Name | Value | Where to Get |
|------------|-------|--------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` | Stripe → API Keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe → Webhooks |
| `STRIPE_CANCEL_MODE` | `immediate` | Manual (TestFlight only) |

**Note:** `STRIPE_CANCEL_MODE=immediate` is for testing. Delete this for production.

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
# AI Analysis & OCR (OpenAI GPT-4 Vision)
# ============================================
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-your-actual-openai-key

# ============================================
# Database & Authentication
# ============================================
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# ============================================
# Payments (Stripe)
# ============================================
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-key

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
# Check console for: "GPT-4 Vision OCR successful"
# Verify ingredient text is extracted correctly
```

### Test Database

```bash
# Sign up with new account
# Check Supabase Dashboard → Authentication → Users
# Verify user was created
```

### Test Stripe

```bash
# In app: Click "Upgrade to Premium"
# Use test card: 4242 4242 4242 4242
# Check Stripe Dashboard → Payments
# Verify test payment appears
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

**"GPT-4 Vision API error"**
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

### Stripe Issues

**"Stripe checkout doesn't open"**
- Verify `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env`
- Ensure key starts with `pk_test_` (for testing)
- Check Stripe is in test mode

**"Webhook not receiving events"**
- Verify webhook URL is correct
- Check `STRIPE_WEBHOOK_SECRET` in Supabase
- Test webhook in Stripe Dashboard → Webhooks → Test

**"Subscription not updating"**
- Check Supabase edge function logs
- Verify webhook events are configured correctly
- Ensure database triggers are working

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
| OpenAI GPT-4 Vision | - | $0.002-0.008/scan | $10-30/month |
| Supabase | 500MB DB, 2GB bandwidth | $25/month | $0-25/month |
| Stripe | - | 2.9% + $0.30/transaction | Variable |

**Total estimated cost:** $10-55/month depending on usage

---

## Support Resources

- **OpenAI:** https://platform.openai.com/docs
- **Supabase:** https://supabase.com/docs
- **Stripe:** https://stripe.com/docs

---

**Setup complete! You're ready to develop. 🚀**



