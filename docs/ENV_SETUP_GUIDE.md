# Environment Variables Setup Guide

This guide explains how to set up and manage environment variables for the Health Freak app using EAS (Expo Application Services).

## Overview

Environment variables in EAS allow you to securely manage configuration values across different environments (development, preview, production) without exposing sensitive data in your codebase.

## Security Model

### Visibility Levels

EAS supports three visibility levels for environment variables:

| Visibility | Description | Use Case |
|------------|-------------|----------|
| **Secret** | Not readable outside EAS servers | API keys, tokens, private keys |
| **Sensitive** | Obfuscated in logs, readable in CLI | Service tokens, webhook secrets |
| **Plain** | Visible everywhere | Public URLs, configuration flags |

### Client vs Server Variables

- **`EXPO_PUBLIC_*`** variables are embedded in your app bundle and are public
- **Non-public** variables are only available on EAS servers during builds
- **Supabase Edge Functions** use their own environment variables (separate from EAS)

## Required Environment Variables

### New Variables (Create These)

#### `OPENAI_API_KEY` (Secret)
- **Purpose**: OpenAI API key for the Supabase Edge Function
- **Visibility**: Secret
- **Environments**: development, preview, production
- **Value**: Your OpenAI API key (starts with `sk-`)

```bash
# Create for all environments
eas env:create --name OPENAI_API_KEY --value "sk-your-key-here" --environment development --visibility secret
eas env:create --name OPENAI_API_KEY --value "sk-your-key-here" --environment preview --visibility secret
eas env:create --name OPENAI_API_KEY --value "sk-your-key-here" --environment production --visibility secret
```

### Existing Variables (Verify These)

These should already be configured in your EAS project:

#### Server-Side Secrets
- `SUPABASE_SERVICE_ROLE_KEY` (Secret)
- `REVENUECAT_WEBHOOK_AUTH_TOKEN` (Secret)
- `OPENAI_API_KEY` (Secret) - Stored in Supabase Edge Function secrets

#### Client-Side Public Variables
- `EXPO_PUBLIC_SUPABASE_URL` (Plain)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Plain)
- `EXPO_PUBLIC_APP_URL` (Plain) - Already set in eas.json
- `EXPO_PUBLIC_REVENUECAT_API_KEY` (Plain) - Public SDK key

## Setup Instructions

### 1. Prerequisites

Ensure you have:
- EAS CLI installed: `npm install -g @expo/eas-cli`
- Logged in to EAS: `eas login`
- Access to your EAS project

### 2. Run the Setup Script

```bash
# Make the script executable
chmod +x scripts/setup-env-vars.sh

# Run the interactive setup
./scripts/setup-env-vars.sh
```

### 3. Manual Setup (Alternative)

If you prefer to set up manually:

```bash
# 1. List existing variables
eas env:list

# 2. Create OPENAI_API_KEY for each environment
eas env:create --name OPENAI_API_KEY --value "your-openai-key" --environment development --visibility secret
eas env:create --name OPENAI_API_KEY --value "your-openai-key" --environment preview --visibility secret
eas env:create --name OPENAI_API_KEY --value "your-openai-key" --environment production --visibility secret

# 3. Verify RevenueCat key visibility (should be Plain, not Secret)
eas env:update --name EXPO_PUBLIC_REVENUECAT_API_KEY --visibility plain
```

### 4. Supabase Edge Function Configuration

After creating the EAS environment variables, add the OpenAI API key to your Supabase Edge Function:

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions**
3. Find the `openai-proxy` function
4. Add `OPENAI_API_KEY` to the function's environment variables
5. Deploy the function: `supabase functions deploy openai-proxy`

## Environment-Specific Configuration

### Development Environment
- Used for development builds
- Should have all variables set
- Can use test/development API keys

### Preview Environment
- Used for internal testing
- Should mirror production configuration
- Can use staging API keys

### Production Environment
- Used for App Store builds
- Must use production API keys
- Highest security requirements

## Local Development

### Using EAS Environment Variables Locally

```bash
# Pull environment variables for local development
eas env:pull --environment development

# This creates a .env file with your development variables
```

### Environment File Structure

The pulled `.env` file will contain:
```bash
# Supabase configuration
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App configuration
EXPO_PUBLIC_APP_URL=exp://localhost:8081
EXPO_PUBLIC_REVENUECAT_API_KEY=your-revenuecat-key

# Note: OPENAI_API_KEY is not included as it's server-side only
```

## Verification

### Check Environment Variables

```bash
# List all variables
eas env:list

# List variables for specific environment
eas env:list --environment production

# Check specific variable
eas env:get OPENAI_API_KEY --environment development
```

### Test Your Setup

1. **Deploy Edge Function**:
   ```bash
   supabase functions deploy openai-proxy
   ```

2. **Test Development Build**:
   ```bash
   eas build --platform ios --profile development
   ```

3. **Test Production Build**:
   ```bash
   eas build --platform ios --profile production
   ```

## Troubleshooting

### Common Issues

#### "Environment variable not found"
- Ensure the variable exists in the correct environment
- Check the variable name spelling
- Verify you're using the correct environment in your build

#### "Authentication error"
- Check that `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set correctly
- Verify the user is authenticated in the app

#### "OpenAI API error"
- Ensure `OPENAI_API_KEY` is set in both EAS and Supabase Edge Function
- Check that the API key is valid and has sufficient credits
- Verify the Edge Function is deployed correctly

#### "Rate limit exceeded"
- The Edge Function includes rate limiting (10 requests per minute per user)
- This is normal behavior for security

### Debug Commands

```bash
# Check EAS CLI version
eas --version

# Check login status
eas whoami

# Check project configuration
eas project:info

# View build logs
eas build:list
eas build:view [build-id]
```

## Security Best Practices

### Do's
- ✅ Use Secret visibility for API keys and tokens
- ✅ Use different API keys for different environments
- ✅ Regularly rotate your API keys
- ✅ Monitor your API usage and costs
- ✅ Keep your EAS CLI updated

### Don'ts
- ❌ Never commit `.env` files to version control
- ❌ Don't use production API keys in development
- ❌ Don't expose secret variables in client code
- ❌ Don't hardcode API keys in your source code
- ❌ Don't share API keys in plain text

## Migration Checklist

- [ ] Run `eas env:list` to audit existing variables
- [ ] Create `OPENAI_API_KEY` for all environments
- [ ] Verify `EXPO_PUBLIC_REVENUECAT_API_KEY` visibility is Plain
- [ ] Add `OPENAI_API_KEY` to Supabase Edge Function
- [ ] Deploy Edge Function: `supabase functions deploy openai-proxy`
- [ ] Test development build
- [ ] Test production build
- [ ] Remove old `.env` files from local development
- [ ] Update team documentation

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the EAS documentation: https://docs.expo.dev/eas/
3. Check the Supabase Edge Functions documentation
4. Contact your development team

## Related Documentation

- [EAS Environment Variables](https://docs.expo.dev/eas/environment-variables/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [RevenueCat SDK Integration](https://docs.revenuecat.com/docs)
