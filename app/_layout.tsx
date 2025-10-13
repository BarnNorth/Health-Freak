import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts as useCustomFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/colors';
import { View, ActivityIndicator } from 'react-native';

function RootLayoutNav() {
  const { user, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;

    const inAuthGroup = segments[0] === 'auth' || segments[0] === 'email-confirmation';
    const inCallbackGroup = segments[0] === 'auth' && segments[1] === 'callback';

    // IMPORTANT: Allow callback route to complete its authentication flow
    // The callback handler will navigate to the correct screen after establishing the session
    if (inCallbackGroup) {
      console.log('[LAYOUT] In callback route - skipping automatic redirects');
      return;
    }

    // Redirect logic for non-callback routes
    if (!user && !inAuthGroup) {
      // Redirect to auth if not authenticated
      console.log('[LAYOUT] No user, not in auth group - redirecting to /auth');
      router.replace('/auth');
    } else if (user && inAuthGroup) {
      // Redirect to main app if authenticated
      console.log('[LAYOUT] User authenticated, in auth group - redirecting to /(tabs)');
      router.replace('/(tabs)');
    }
  }, [user, initializing, segments]);

  // Show loading spinner while initializing
  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.cleanGreen} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="email-confirmation" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="results" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
      <Stack.Screen name="subscription-success" options={{ headerShown: false }} />
      <Stack.Screen name="subscription-cancel" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  useFrameworkReady();
  
  // Load custom fonts
  const [customFontsLoaded] = useCustomFonts({
    'KarmaFuture-Regular': require('../assets/fonts/karma.future-regular.otf'),
    'TerminalGrotesque': require('../assets/fonts/terminal-grotesque.ttf'),
  });

  if (!customFontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
        <StatusBar 
          style="dark" 
          backgroundColor={COLORS.background}
        />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
