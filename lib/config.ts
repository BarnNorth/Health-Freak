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
    // API keys ONLY from environment variables (never from app.json)
    apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
    enabled: Constants.expoConfig?.extra?.openaiEnabled !== false,
    model: Constants.expoConfig?.extra?.openaiModel || 'gpt-4o-mini',
    maxTokens: Constants.expoConfig?.extra?.openaiMaxTokens || 300,
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

  // Debug API key format (redacted for security)
  if (config.openai.apiKey) {
    const key = config.openai.apiKey;
    console.log('🔑 OpenAI API Key Debug:', {
      length: key.length,
      redactedKey: redactApiKey(key),
      format: key.startsWith('sk-') ? 'VALID FORMAT' : 'INVALID FORMAT',
      hasSpaces: key.includes(' '),
      hasNewlines: key.includes('\n'),
      hasQuotes: key.includes('"') || key.includes("'")
    });
  }
}

// Always warn about missing API keys (critical for functionality)
if (!config.openai.apiKey) {
  console.error('❌ OpenAI API Key: NOT FOUND (set EXPO_PUBLIC_OPENAI_API_KEY environment variable)');
}

// Google Cloud Vision has been completely removed - using GPT-4 Vision instead

/**
 * Redirect URL configuration for auth callbacks and payment redirects
 * Automatically switches between development and production based on EXPO_PUBLIC_APP_URL
 */
export const redirectConfig = {
  // Base URL for the app - defaults to localhost for development
  baseUrl: process.env.EXPO_PUBLIC_APP_URL || 'exp://localhost:8081',
  
  // Subscription redirect URLs
  subscriptionSuccess: function() {
    const base = this.baseUrl;
    
    // Custom scheme (healthfreak://) should use simple format without /--/
    if (base.startsWith('healthfreak://') || base.startsWith('healthfreak:')) {
      return 'healthfreak://subscription-success';
    }
    
    // Clean any trailing slash from baseUrl before appending path
    const cleanBase = base.replace(/\/$/, '');
    return `${cleanBase}/subscription-success`;
  },
  
  subscriptionCancel: function() {
    const base = this.baseUrl;
    
    // Custom scheme (healthfreak://) should use simple format without /--/
    if (base.startsWith('healthfreak://') || base.startsWith('healthfreak:')) {
      return 'healthfreak://subscription-cancel';
    }
    
    // Clean any trailing slash from baseUrl before appending path
    const cleanBase = base.replace(/\/$/, '');
    return `${cleanBase}/subscription-cancel`;
  },
  
  // Auth callback URL
  authCallback: function() {
    const base = this.baseUrl;
    
    // Custom scheme (healthfreak://) should use simple format without /--/
    if (base.startsWith('healthfreak://') || base.startsWith('healthfreak:')) {
      return 'healthfreak://auth/callback';
    }
    
    // The /--/ prefix is only for Expo development scheme (exp://)
    if (base.startsWith('exp://')) {
      return `${base}/--/auth/callback`;
    }
    
    // Clean any trailing slash from baseUrl before appending path
    const cleanBase = base.replace(/\/$/, '');
    return `${cleanBase}/auth/callback`;
  },
};

// Debug redirect configuration (development only)
if (__DEV__) {
  console.log('🔗 Redirect Configuration:', {
    baseUrl: redirectConfig.baseUrl,
    subscriptionSuccess: redirectConfig.subscriptionSuccess(),
    subscriptionCancel: redirectConfig.subscriptionCancel(),
    authCallback: redirectConfig.authCallback(),
  });
}
