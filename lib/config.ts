import Constants from 'expo-constants';

/**
 * Redact sensitive values for logging
 */
function redactApiKey(key?: string): string {
  if (!key) return 'NOT SET';
  if (key.length < 8) return '***REDACTED***';
  return `${key.substring(0, 4)}...***REDACTED***`;
}

export interface AppConfig {
  googleCloud: {
    projectId?: string;
    apiKey?: string;
    credentialsPath?: string;
  };
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
  googleCloud: {
    projectId: Constants.expoConfig?.extra?.googleCloudProjectId || process.env.EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_ID,
    // API keys ONLY from environment variables (never from app.json)
    apiKey: process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY,
    credentialsPath: Constants.expoConfig?.extra?.googleCloudCredentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },
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

// Debug configuration loading (with API keys redacted for security)
console.log('🔧 Configuration Debug:', {
  expoConfig: Constants.expoConfig?.extra,
  openaiEnabled: Constants.expoConfig?.extra?.openaiEnabled,
  openaiApiKey: config.openai.apiKey ? redactApiKey(config.openai.apiKey) : 'NOT SET',
  finalConfig: {
    openaiEnabled: config.openai.enabled,
    openaiApiKey: config.openai.apiKey ? redactApiKey(config.openai.apiKey) : 'NOT SET',
    ocrEnabled: config.ocr.enabled,
    ocrApiKey: config.googleCloud.apiKey ? redactApiKey(config.googleCloud.apiKey) : 'NOT SET'
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
} else {
  console.log('❌ OpenAI API Key: NOT FOUND (set EXPO_PUBLIC_OPENAI_API_KEY environment variable)');
}

// Warn if Google Cloud API key is missing
if (!config.googleCloud.apiKey) {
  console.log('❌ Google Cloud API Key: NOT FOUND (set EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY environment variable)');
}

export function isGoogleCloudConfigured(): boolean {
  return !!(config.googleCloud.projectId || config.googleCloud.apiKey || config.googleCloud.credentialsPath);
}

export function getGoogleCloudConfig() {
  if (!isGoogleCloudConfigured()) {
    throw new Error('Google Cloud Vision API is not configured. Please set EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY environment variable.');
  }
  
  return {
    projectId: config.googleCloud.projectId,
    apiKey: config.googleCloud.apiKey,
    credentialsPath: config.googleCloud.credentialsPath,
  };
}
