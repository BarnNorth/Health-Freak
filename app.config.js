import 'dotenv/config';

export default {
  expo: {
    name: "Health Freak",
    slug: "health-freak",
    version: "1.0.0",
    sdkVersion: "54.0.0",
    orientation: "portrait",
    icon: "./assets/AppIcons v2/appstore.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    scheme: "healthfreak",
    ios: {
      bundleIdentifier: 'com.healthfreak.app',
      buildNumber: "15",
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
      package: 'com.healthfreak.app',
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
      openaiModel: "gpt-5-nano",
      openaiMaxTokens: 128000,
      ocrEnabled: true,
      ocrFallbackToMock: false,
      ocrMaxImageSize: 1200,
      ocrPreprocessingEnabled: true,
      router: {},
      stripePriceId: process.env.STRIPE_PRICE_ID ?? 'REPLACE_WITH_STRIPE_PRICE_ID',
      stripeTestPriceId: process.env.STRIPE_TEST_PRICE_ID ?? 'REPLACE_WITH_STRIPE_TEST_PRICE_ID',
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
