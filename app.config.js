import 'dotenv/config';

// Get APP_VARIANT from environment, default to 'production'
const APP_VARIANT = process.env.APP_VARIANT || 'production';

// Configuration based on variant
const variantConfig = {
  development: {
    name: "Health Freak (Dev)",
    bundleIdentifier: 'com.tommymulder.healthfreak',
    scheme: "healthfreak-dev",
    revenueCatKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_DEV
  },
  preview: {
    name: "Health Freak (Preview)",
    bundleIdentifier: 'com.healthfreak.app.preview',
    scheme: "healthfreak-preview",
    revenueCatKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY
  },
  production: {
    name: "Health Freak",
    bundleIdentifier: 'com.healthfreak.app',
    scheme: "healthfreak",
    revenueCatKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY
  }
};

const config = variantConfig[APP_VARIANT] || variantConfig.production;

export default {
  expo: {
    name: config.name,
    slug: "health-freak",
    version: "1.0.1",
    sdkVersion: "54.0.0",
    orientation: "portrait",
    icon: "./assets/AppIcons v2/appstore.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    scheme: config.scheme,
    ios: {
      bundleIdentifier: config.bundleIdentifier,
      buildNumber: "17",
      supportsTablet: false,
      associatedDomains: [
        "applinks:healthfreak.io"
      ],
      infoPlist: {
        "NSCameraUsageDescription": "This app needs camera access to scan ingredient labels on food products.",
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    android: {
      package: config.bundleIdentifier,
      versionCode: 1,
      permissions: [
        "CAMERA"
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/AppIcons v2/playstore.png",
        backgroundColor: "#FFFFFF"
      }
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-web-browser"
    ],
    assetBundlePatterns: [
      "assets/fonts/*"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      googleCloudProjectId: "v3-purescannerai",
      googleCloudCredentialsPath: {},
      openaiEnabled: true,
      openaiModel: "gpt-5-mini",
      openaiMaxTokens: 128000,
      ocrEnabled: true,
      ocrFallbackToMock: false,
      ocrMaxImageSize: 1200,
      ocrPreprocessingEnabled: true,
      router: {},
      revenueCatKey: config.revenueCatKey,
      eas: {
        projectId: "eb1c7f5f-1d6a-408d-9eba-9acf7dbfd788"
      }
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    updates: {
      url: "https://u.expo.dev/eb1c7f5f-1d6a-408d-9eba-9acf7dbfd788"
    }
  }
};
