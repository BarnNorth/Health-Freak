# Health Freak - AI-Powered Ingredient Scanner

An intelligent food ingredient analysis app that uses AI to classify ingredients as generally clean or potentially toxic.

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
   EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY=AIzaSy-your-actual-google-key
   
   # Database & Auth
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   
   # Subscriptions (optional)
   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-key
   ```

3. **Verify `.env` is in `.gitignore`** (already configured)

### Getting API Keys

- **OpenAI API Key:** https://platform.openai.com/api-keys
- **Google Cloud Vision API Key:** https://console.cloud.google.com/apis/credentials
- **Supabase Credentials:** https://app.supabase.com/project/_/settings/api
- **Stripe Keys:** https://dashboard.stripe.com/apikeys

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables** (see above)

3. **Run migrations** (if using Supabase):
   ```bash
   # Apply database migrations
   # (Follow Supabase documentation)
   ```

4. **Pre-cache common ingredients** (optional but recommended):
   ```bash
   npm run precache
   ```
   This reduces API costs by 80-90% by pre-analyzing 290 common ingredients.

5. **Start the development server:**
   ```bash
   npm start
   ```

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

## 🛡️ Security Best Practices

### ✅ DO:
- Store API keys in `.env` file
- Use environment variables (`process.env.EXPO_PUBLIC_*`)
- Keep `.env` in `.gitignore`
- Use `.env.example` for documentation
- Rotate API keys regularly

### ❌ DON'T:
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

## 🏗️ Project Structure

```
├── app/                    # Expo Router screens
├── components/             # Reusable UI components
├── constants/              # Colors, typography
├── contexts/               # React contexts (Auth, etc.)
├── data/                   # Static data (common ingredients)
├── docs/                   # Documentation
├── lib/                    # Core libraries (config, database, supabase)
├── scripts/                # Utility scripts (pre-caching, etc.)
├── services/               # Business logic (AI, OCR, feedback, etc.)
└── supabase/migrations/    # Database migrations
```

## 🔧 Configuration

Configuration is split between:

### `app.json` - Non-sensitive settings:
- Feature flags (`openaiEnabled`, `ocrEnabled`)
- Model settings (`openaiModel`, `openaiMaxTokens`)
- Image processing settings

### `.env` - Sensitive API keys:
- `EXPO_PUBLIC_OPENAI_API_KEY`
- `EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 📚 Additional Documentation

- **AI Implementation:** `docs/AI_IMPLEMENTATION_SUMMARY.md`
- **OCR Setup:** `docs/OCR_SETUP.md`
- **Design System:** `docs/design-system.md`
- **Production Changes:** `docs/PRODUCTION_CHANGES.md`

## 🤝 Contributing

When contributing:
1. Never commit `.env` files
2. Update `.env.example` if adding new environment variables
3. Use the `redactApiKey()` function when logging sensitive data
4. Test with environment variables, not hardcoded keys

## 📄 License

[Your license here]

## 🆘 Troubleshooting

### "API key not configured" error
- Verify `.env` file exists
- Check environment variable names (must start with `EXPO_PUBLIC_`)
- Restart the development server after changing `.env`

### "OpenAI API key test failed"
- Verify your OpenAI API key is valid
- Check for extra spaces or quotes in `.env`
- Ensure you have credits in your OpenAI account

### "Vision API error"
- Verify Google Cloud Vision API is enabled
- Check API key permissions
- Ensure billing is enabled in Google Cloud Console
