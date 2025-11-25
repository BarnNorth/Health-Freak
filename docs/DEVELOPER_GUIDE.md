# Developer Guide

Complete technical documentation for setting up and developing Health Freak.

## 📖 Table of Contents

- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Security & API Keys](#-security--api-keys)
- [Configuration](#-configuration)
- [Cost Optimization](#-cost-optimization)
- [Project Structure](#-project-structure)
- [Development Commands](#-development-commands)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)

## 🛠️ Tech Stack

- **Frontend:** React Native + Expo
- **AI & OCR:** OpenAI (GPT-5 nano)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Payments:** RevenueCat (Apple IAP)
- **Language:** TypeScript

## 📋 Prerequisites

- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Studio
- Active API accounts:
  - [OpenAI](https://platform.openai.com/)
  - [Supabase](https://supabase.com/)
  - [RevenueCat](https://www.revenuecat.com/) (for Apple IAP)

## 🚀 Quick Start

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd "Health Freak"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables** (see [Security & API Keys](#-security--api-keys))

4. **Run migrations** (if using Supabase):
   ```bash
   # Apply database migrations
   npm run migrate
   ```

5. **Start developing!** The app is ready to use. Ingredient cache will build automatically as you scan products.

6. **Start the development server:**
   ```bash
   npm start
   ```

## 🔐 Security & API Keys

**IMPORTANT:** This project uses environment variables for API keys. **NEVER commit API keys to version control!**

### Setup Environment Variables

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Add your API keys to `.env`:**
   ```bash
   # OpenAI API Key (Secure - Server-side only)
   # The OpenAI API key is stored in Supabase Edge Function secrets
   # Set it using: supabase secrets set OPENAI_API_KEY=sk-proj-your-key
   # No client-side EXPO_PUBLIC_OPENAI_API_KEY needed
   
   # Database & Auth
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   
   # Subscriptions (Apple IAP via RevenueCat)
   EXPO_PUBLIC_REVENUECAT_API_KEY=appl_your-revenuecat-api-key
   ```

3. **Verify `.env` is in `.gitignore`** (already configured)

### Getting API Keys

- **OpenAI API Key:** https://platform.openai.com/api-keys
- **Supabase Credentials:** https://app.supabase.com/project/_/settings/api
- **RevenueCat Keys:** https://app.revenuecat.com/projects/[your-project]/settings/api-keys

### Security Best Practices

#### ✅ DO:
- Store API keys in `.env` file
- Use environment variables (`process.env.EXPO_PUBLIC_*`)
- Keep `.env` in `.gitignore`
- Use `.env.example` for documentation
- Rotate API keys regularly

#### ❌ DON'T:
- Commit `.env` files
- Hardcode API keys in source code
- Share API keys in chat/email
- Log full API keys to console
- Store keys in `app.json`

### API Key Redaction

All console.log statements automatically redact API keys:
```typescript
// Logs: "sk-proj...***REDACTED***"
console.log('API Key:', redactApiKey(apiKey));
```

## 🔧 Configuration

Configuration is split between:

### `app.json` - Non-sensitive settings:
- Feature flags (`openaiEnabled`, `ocrEnabled`)
- Model settings (`openaiModel`, `openaiMaxTokens`)
- Image processing settings

### `.env` - Sensitive API keys:
- `EXPO_PUBLIC_OPENAI_API_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 📊 Cost Optimization

### Ingredient Caching

The app automatically caches ingredient analyses to reduce API costs:

- **Automatic caching:** Every ingredient analyzed is cached in Supabase for 180 days
- **Instant lookups:** Cached ingredients return instantly without API calls
- **Growing coverage:** Cache builds organically as you use the app
- **Cost savings:** Typical 80-90% reduction in API costs after initial testing

**No manual pre-caching needed** - just use the app normally and the cache grows!

## 🏗️ Project Structure

```
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation screens
│   ├── auth/              # Authentication screens
│   └── _layout.tsx        # Root layout
├── components/            # Reusable UI components
├── constants/             # Colors, typography
├── contexts/              # React contexts (Auth, etc.)
├── data/                  # Static data (common ingredients)
├── docs/                  # Documentation
├── lib/                   # Core libraries (config, database, supabase)
├── scripts/               # Utility scripts (pre-caching, etc.)
├── services/              # Business logic (AI, OCR, feedback, etc.)
└── supabase/migrations/   # Database migrations
```

## 🔨 Development Commands

```bash
# Start development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Type checking
npm run type-check

# Lint code
npm run lint

# Run database migrations
npm run migrate

# Run database audit
npm run db:audit
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run OCR tests specifically
npm test -- services/__tests__/ocr.test.ts

# Watch mode
npm test -- --watch
```

## 🚀 Deployment

### TestFlight (iOS)

```bash
# Build for iOS
eas build --platform ios

# Submit to TestFlight
eas submit --platform ios
```

### Google Play (Android)

```bash
# Build for Android
eas build --platform android

# Submit to Play Store
eas submit --platform android
```

See [TESTFLIGHT_CHECKLIST.md](TESTFLIGHT_CHECKLIST.md) for detailed deployment steps.

## 🆘 Troubleshooting

### "API key not configured" error
- Verify `.env` file exists
- Check environment variable names (must start with `EXPO_PUBLIC_`)
- Restart the development server after changing `.env`

### "OpenAI API key test failed"
- Verify your OpenAI API key is valid
- Check for extra spaces or quotes in `.env`
- Ensure you have credits in your OpenAI account

### "OpenAI API error"
- Verify OpenAI API key is valid
- Check you have credits in OpenAI account
- Ensure billing is enabled in OpenAI account

### Build Issues
- Clear cache: `expo start -c`
- Delete node_modules: `rm -rf node_modules && npm install`
- Reset Expo: `expo prebuild --clean`

### Supabase Connection Issues
- Verify your Supabase URL and anon key
- Check if your Supabase project is active
- Ensure RLS (Row Level Security) policies are correctly configured

## 🤝 Contributing

When contributing:

1. Never commit `.env` files
2. Update `.env.example` if adding new environment variables
3. Use the `redactApiKey()` function when logging sensitive data
4. Test with environment variables, not hardcoded keys
5. Follow the existing code style and patterns
6. Write tests for new features
7. Update documentation as needed

## 🤖 Key Implementation Details

### AI Analysis System

**Unified GPT-5 nano Pipeline:**
- **Single multimodal model:** GPT-5 nano handles OCR, parsing, and ingredient classification.
- **Pipeline:** Capture → GPT-5 nano OCR/analysis → Database Check → Cache → Verdict
- **Classification:** Strict precautionary stance—unknown or ambiguous ingredients default to "potentially toxic."
- **Caching:** Hybrid system reduces repeat calls by ~80-90%.

**How it works:**
1. GPT-5 nano extracts text and normalizes the ingredient list from the photo.
2. Parsed ingredients are compared against the Supabase cache for instant hits.
3. Uncached ingredients are classified with GPT-5 nano in either single or batched requests.
4. Results are cached with a 180-day TTL and combined into a product verdict ("any toxic = product toxic").

**Cost optimization:**
- Automatic caching of every analyzed ingredient
- Batch requests through GPT-5 nano for new ingredients
- Smart caching avoids repeat analysis
- Typical operating cost: a few tenths of a cent per scan after cache warm-up

### OCR Implementation

**GPT-5 nano Vision Flow:**
- **Multimodal AI** that reads ingredient panels directly from photos.
- **Intelligent parsing** to preserve sub-ingredients, percentages, and minor-label markers.
- **High accuracy** on curved packaging and low-light images with minimal preprocessing.
- **Built-in validation** and cleaning before downstream analysis.

**Processing pipeline:**
1. Capture photo with camera
2. Preprocess: enhance, resize, optimize
3. OCR & analysis: GPT-5 nano extracts text and classifies ingredients in one pass
4. Parse: AI identifies and separates ingredients, preserving context markers
5. Cache: Ingredient decisions stored for future lookups
6. Clean: normalize and format ingredient names

**Error handling:**
- Three-tier fallback: Real OCR → Mock data → Manual input
- Clear error messages with actionable suggestions
- Visual indicators when mock data is used

### Authentication System

**Email/password with PKCE flow:**
- **AsyncStorage** for session persistence
- **Auto token refresh** via AppState listener
- **detectSessionInUrl: true** for deep link handling
- Non-blocking profile loading for fast auth

**Flow:**
1. User signs up with email/password
2. Confirmation email sent
3. User clicks link (opens in browser)
4. Redirects to app with auth code
5. Code exchanged for session (<1 second)
6. Profile loads in background
7. User sees home screen

**Performance:**
- Auth: <1 second
- Profile load: ~80-200ms
- Total signup: <5 seconds

### Security Implementation

**API Key Management:**
- All keys in environment variables (never in code)
- Keys redacted in logs (only first 4 chars shown)
- `.env` in `.gitignore`
- No fallback to insecure sources

**Webhook Security:**
- RevenueCat webhook verification enforced
- No bypass mechanisms
- Invalid signatures rejected

**Best Practices:**
- Separation of concerns (config vs. secrets)
- Defense in depth (multiple protection layers)
- Fail secure (clear errors if keys missing)

### Database Architecture

**Key Tables:**
- `users` - User profiles and subscription status
- `scans` - Premium-only scan history (RLS enforced)
- `ingredients_cache` - AI results cache (180-day expiry)
- Subscription tracking via `users` table (Apple IAP only)

**Tier Enforcement:**
- Free: 10 scans with full analysis, history saved (database enforced)
- Premium: Unlimited scans, full history saved
- RLS policies prevent unauthorized access
- Triggers enforce constraints

### Subscription System Architecture

**Apple In-App Purchase System:**

Health Freak uses Apple In-App Purchase exclusively via RevenueCat:

```
┌─────────────────────────────────────────────────┐
│           Application Layer                      │
│  (Profile, Camera, History screens)             │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│     Unified Subscription Service                 │
│     (services/subscription.ts)                   │
│                                                   │
│  • isPremiumActive()                             │
│  • getSubscriptionInfo()                         │
│  • purchasePremiumSubscription()                 │
│  • 5-minute caching layer                        │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
          ┌──────────────────┐
          │   RevenueCat     │
          │   Service        │
          │   (Apple IAP)    │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │   App Store       │
          │   StoreKit        │
          └──────────────────┘
                    ▼
         ┌─────────────────────┐
         │   Supabase Database  │
         │   (users table)      │
         │                      │
         │  • subscription_status │
         │  • payment_method     │
         │  • apple_* fields     │
         │  • apple_* fields     │
         └─────────────────────┘
```

**Key Components:**

1. **Unified Service** (`services/subscription.ts`)
   - Single interface for all subscription operations
   - Abstracts away payment provider differences
   - Caches subscription status for 5 minutes (reduces API calls)
   - Defaults to `false` on errors (fail-safe)

2. **Provider Service**
   - `services/revenueCat.ts` - Apple IAP operations via RevenueCat SDK
   - Handles authentication, API calls, and error handling

3. **Database Schema** (`users` table)
   - `subscription_status`: 'free' | 'premium'
   - `payment_method`: 'apple_iap' | null
   - `apple_original_transaction_id`, `revenuecat_customer_id` (Apple users)
   - Legacy Stripe fields remain for historical data but are not updated

**Webhook Synchronization:**

RevenueCat sends webhook events to keep database in sync:

**RevenueCat Webhooks** (`supabase/functions/revenuecat-webhook/`)
- `INITIAL_PURCHASE` → Set premium status, store transaction ID
- `RENEWAL` → Update subscription timestamp
- `CANCELLATION` → Mark for cancellation at period end
- `EXPIRATION` → Remove premium status

**Usage in Application:**

```typescript
// Check if user has premium access
const isPremium = await isPremiumActive(userId);

// Get detailed subscription info
const subInfo = await getSubscriptionInfo(userId);
// Returns: { isActive, paymentMethod, renewalDate, cancelsAtPeriodEnd }

// Start new subscription (Apple IAP only)
const result = await startSubscriptionPurchase();

// Cancel subscription (provider-specific handling)
const cancelResult = await cancelSubscription(userId);
```

**Caching Strategy:**
- Premium status cached for 5 minutes per user
- Cache cleared immediately on purchase/cancellation
- Reduces API calls by ~90%
- Cache key: `premium_${userId}_${timestamp}`

**Subscription Restoration:**

On app launch (`app/_layout.tsx`):
1. Check if user is authenticated
2. For Apple IAP users: Call RevenueCat `restorePurchases()`
3. Update local state with results

This ensures users keep access after reinstalling the app, switching devices, or updating the app.

**Purchase Flow:**

Users tap "Upgrade to Premium" and purchase directly via Apple IAP:
- Direct purchase call using `useIAPPurchase` hook
- No payment method selection needed
- Platform-aware (iOS only - shows appropriate message on other platforms)
- Handles loading states and errors

**Subscription Management:**
- **Apple users:** Directed to iPhone Settings (per Apple requirements)
- Deep linking attempted to Settings → Subscriptions
- Fallback instructions if deep link fails

## 📚 Additional Documentation

- **Setup Guide:** [SETUP_GUIDE.md](SETUP_GUIDE.md) - Complete API setup
- **Design System:** [design-system.md](design-system.md) - UI/UX guidelines
- **Database Schema:** [TIER_SYSTEM_DATABASE_SCHEMA.md](TIER_SYSTEM_DATABASE_SCHEMA.md) - DB structure
- **Production Checklist:** [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) - Launch guide
- **TestFlight Checklist:** [TESTFLIGHT_CHECKLIST.md](TESTFLIGHT_CHECKLIST.md) - Beta testing
- **IAP Testing Guide:** [IAP_TESTING_GUIDE.md](IAP_TESTING_GUIDE.md) - Apple in-app purchase testing
- **IAP Test Checklist:** [IAP_TEST_CHECKLIST.md](IAP_TEST_CHECKLIST.md) - IAP verification checklist
- **Revenue Tracking:** [REVENUE_TRACKING.md](REVENUE_TRACKING.md) - Multi-provider revenue analytics
- **App Store Notes:** [APP_STORE_SUBMISSION_NOTES.md](APP_STORE_SUBMISSION_NOTES.md) - Submission documentation

## 📄 License

[Your license here]

---

**Need help?** Open an issue or reach out to the team.

