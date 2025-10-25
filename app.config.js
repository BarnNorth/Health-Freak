export default {
  expo: {
    name: "Health Freak",
    slug: "health-freak",
    version: "1.0.0",
    sdkVersion: "54.0.0",
    orientation: "portrait",
    icon: "./assets/AppIcons v2/appstore.png",
    scheme: "healthfreak",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      bundleIdentifier: process.env.APP_VARIANT === 'development' 
        ? 'com.tommymulder.healthfreak' 
        : 'com.healthfreak.app',
      buildNumber: "8",
      supportsTablet: true,
      associatedDomains: [
        "applinks:vuiaqdkbpkbcvyrzpmzv.supabase.co"
      ],
      infoPlist: {
        "NSCameraUsageDescription": "This app needs camera access to scan ingredient labels on food products.",
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    android: {
      package: process.env.APP_VARIANT === 'development' 
        ? 'com.tommymulder.healthfreak' 
        : 'com.healthfreak.app',
      versionCode: 1,
      permissions: [
        "CAMERA"
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "vuiaqdkbpkbcvyrzpmzv.supabase.co",
              pathPrefix: "/auth/v1/verify"
            }
          ],
          category: [
            "BROWSABLE",
            "DEFAULT"
          ]
        }
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
      openaiModel: "gpt-4o-mini",
      openaiMaxTokens: 300,
      ocrEnabled: true,
      ocrFallbackToMock: false,
      ocrMaxImageSize: 1200,
      ocrPreprocessingEnabled: true,
      router: {},
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
