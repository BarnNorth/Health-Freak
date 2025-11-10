import Constants from 'expo-constants';

// Global type declaration for development mode
declare var __DEV__: boolean;

/**
 * Redact sensitive values for logging
 */
function redactApiKey(key?: string): string {
  if (!key) return 'NOT SET';
  if (key.length < 8) return '***REDACTED***';
  return `${key.substring(0, 4)}...***REDACTED***`;
}

export interface AppConfig {
  openai: {
    apiKey?: string;
    enabled: boolean;
    model: string;
    maxTokens: number;
  };
  ocr: {
    enabled: boolean;
    maxImageSize: number;
    preprocessingEnabled: boolean;
  };
}

export const config: AppConfig = {
  openai: {
    // OpenAI API calls now use Supabase Edge Function (secure server-side)
    // No client-side API key needed
    apiKey: undefined, // Removed client-side API key for security
    enabled: Constants.expoConfig?.extra?.openaiEnabled !== false,
    model: Constants.expoConfig?.extra?.openaiModel || 'gpt-5-nano',
    maxTokens: Constants.expoConfig?.extra?.openaiMaxTokens || 128000,
  },
  ocr: {
    enabled: Constants.expoConfig?.extra?.ocrEnabled !== false,
    maxImageSize: Constants.expoConfig?.extra?.ocrMaxImageSize || 1200,
    preprocessingEnabled: Constants.expoConfig?.extra?.ocrPreprocessingEnabled !== false,
  },
};

// Debug configuration loading (development only)
if (__DEV__) {
  console.log('🔧 Configuration Debug:', {
    expoConfig: Constants.expoConfig?.extra,
    openaiEnabled: Constants.expoConfig?.extra?.openaiEnabled,
    openaiApiKey: config.openai.apiKey ? redactApiKey(config.openai.apiKey) : 'NOT SET',
    finalConfig: {
      openaiEnabled: config.openai.enabled,
      openaiApiKey: config.openai.apiKey ? redactApiKey(config.openai.apiKey) : 'NOT SET',
      ocrEnabled: config.ocr.enabled,
      openaiModel: config.openai.model
    }
  });

  // Removed - API key is now stored securely in Supabase Edge Function
  console.log('✅ OpenAI API: Using secure Supabase Edge Function (no client-side API key needed)');
}

// OpenAI API calls now use secure Supabase Edge Function

// Google Cloud Vision has been completely removed - using GPT-5 nano instead

/**
 * Redirect URL configuration for auth callbacks and payment redirects
 * Uses universal links (https://healthfreak.io) only
 */
export const redirectConfig = {
  authCallback: function() {
    return 'https://healthfreak.io/auth/callback';
  },
  
  subscriptionSuccess: function() {
    return 'https://healthfreak.io/subscription-success';
  },
  
  subscriptionCancel: function() {
    return 'https://healthfreak.io/subscription-cancel';
  },
};

// Debug redirect configuration (development only)
if (__DEV__) {
  console.log('🔗 Redirect Configuration (Universal Links Only):', {
    authCallback: redirectConfig.authCallback(),
    subscriptionSuccess: redirectConfig.subscriptionSuccess(),
    subscriptionCancel: redirectConfig.subscriptionCancel(),
  });
}
