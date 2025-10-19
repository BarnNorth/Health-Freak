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
- **AI & OCR:** OpenAI (GPT-4o-mini + GPT-3.5-turbo)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Payments:** Stripe
- **Language:** TypeScript

## 📋 Prerequisites

- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Studio
- Active API accounts:
  - [OpenAI](https://platform.openai.com/)
  - [Supabase](https://supabase.com/)
  - [Stripe](https://stripe.com/) (for subscriptions)

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

5. **Pre-cache common ingredients** (optional but recommended):
   ```bash
   npm run precache
   ```
   This reduces API costs by 80-90% by pre-analyzing 290 common ingredients.

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
   # Required API Keys
   EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-your-actual-openai-key
   
   # Database & Auth
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   
   # Subscriptions (optional)
   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-key
   ```

3. **Verify `.env` is in `.gitignore`** (already configured)

### Getting API Keys

- **OpenAI API Key:** https://platform.openai.com/api-keys
- **Supabase Credentials:** https://app.supabase.com/project/_/settings/api
- **Stripe Keys:** https://dashboard.stripe.com/apikeys

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

### Pre-Caching Common Ingredients

Pre-cache the 290 most common food ingredients to dramatically reduce API costs:

```bash
# One-time setup (~10 minutes, ~$0.90 cost)
npm run precache

# Check cache status anytime
npm run precache:check

# Re-run every 6 months to refresh
npm run precache
```

**Savings:**
- Without cache: $0.45 per user
- With cache: $0.045 per user
- **90% cost reduction!**

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

# Pre-cache ingredients
npm run precache

# Check cache status
npm run precache:check

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

**Two-Model Architecture:**
- **OCR Model:** GPT-4o-mini (vision) for text extraction from photos
- **Analysis Model:** GPT-3.5-turbo for ingredient classification (10x faster)
- **Pipeline:** OCR → Parse → Database Check → AI Analysis → Cache → Verdict
- **Classification:** Conservative approach - when in doubt, mark as potentially toxic
- **Caching:** Hybrid system reduces API costs by 80-90%

**How it works:**
1. Extract text from photo using GPT-4o-mini (vision)
2. Parse ingredients from extracted text
3. Check database for known ingredients (fast)
4. Use GPT-3.5-turbo for unknown ingredients (~1-3 seconds)
5. Cache results for future use
6. Apply "any toxic = product toxic" rule

**Cost optimization:**
- Pre-cache 290 common ingredients (~$0.90 one-time)
- Use cheaper GPT-3.5-turbo for text analysis
- Batch processing for multiple ingredients
- Smart caching avoids repeat analysis
- Reduces cost from $0.45 to $0.045 per user

### OCR Implementation

**GPT-4o-mini (Vision Model):**
- **Multimodal AI** for extracting text from food label images
- **Intelligent parsing** with context awareness
- **High accuracy** for ingredient lists and curved packaging
- **Built-in validation** and cleaning

**Processing pipeline:**
1. Capture photo with camera
2. Preprocess: enhance, resize, optimize
3. OCR: extract text via GPT-4o-mini (vision)
4. Parse: AI identifies and separates ingredients
5. Analyze: GPT-3.5-turbo classifies each ingredient
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
- Stripe signature verification enforced
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
- `stripe_subscriptions` - Subscription tracking

**Tier Enforcement:**
- Free: 5 scans, no history (database enforced)
- Premium: Unlimited scans, full history saved
- RLS policies prevent unauthorized access
- Triggers enforce constraints

## 📚 Additional Documentation

- **Setup Guide:** [SETUP_GUIDE.md](SETUP_GUIDE.md) - Complete API setup
- **Design System:** [design-system.md](design-system.md) - UI/UX guidelines
- **Database Schema:** [TIER_SYSTEM_DATABASE_SCHEMA.md](TIER_SYSTEM_DATABASE_SCHEMA.md) - DB structure
- **Production Checklist:** [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) - Launch guide
- **TestFlight Checklist:** [TESTFLIGHT_CHECKLIST.md](TESTFLIGHT_CHECKLIST.md) - Beta testing

## 📄 License

[Your license here]

---

**Need help?** Open an issue or reach out to the team.

