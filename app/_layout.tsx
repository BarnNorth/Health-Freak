import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts as useCustomFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/colors';
import { View, ActivityIndicator } from 'react-native';
import { configureRevenueCat, restorePurchases, logEnvironmentInfo } from '@/services/revenueCat';
import { isPremiumActive } from '@/services/subscription';
import { Platform } from 'react-native';
import { IntroStory } from '@/components/IntroStory';
import { markOnboardingComplete } from '@/lib/database';
import { hasSeenIntroLocally, markIntroAsSeenLocally, resetIntroLocally } from '@/services/introStorage';
import { registerIntroTrigger, unregisterIntroTrigger } from '@/services/introTrigger';

function RootLayoutNav() {
  const { user, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const revenueCatInitialized = useRef(false);
  const subscriptionRestored = useRef(false);
  const [showIntro, setShowIntro] = useState(false);
  const introChecked = useRef(false);
  const isReplayMode = useRef(false);

  // Register intro trigger so it can be called from anywhere
  useEffect(() => {
    const handleTrigger = async () => {
      // Reset local cache
      await resetIntroLocally();
      // Reset the checked flag so intro can show again
      introChecked.current = false;
      // Mark as replay mode so completion doesn't mark onboarding as done
      isReplayMode.current = true;
      // Small delay to ensure state is ready
      setTimeout(() => {
        setShowIntro(true);
      }, 100);
    };

    registerIntroTrigger(handleTrigger);
    
    return () => {
      unregisterIntroTrigger();
    };
  }, []);

  // Initialize RevenueCat when user is authenticated
  useEffect(() => {
    if (initializing || !user || revenueCatInitialized.current) {
      return;
    }

    // Initialize RevenueCat with user ID
    const initializeRevenueCat = async () => {
      try {
        if (__DEV__) {
          console.log('🚀 [LAYOUT] Initializing RevenueCat for user:', user.id);
        }
        await configureRevenueCat(user.id);
        revenueCatInitialized.current = true;
        
        // Log environment info in development
        if (__DEV__) {
          logEnvironmentInfo();
        }
      } catch (error) {
        // Log error but don't block app - user can still use free tier
        console.error('❌ [LAYOUT] Failed to initialize RevenueCat:', error);
      }
    };

    initializeRevenueCat();
  }, [user, initializing]);

  // Restore subscription status when user is authenticated and RevenueCat is initialized
  useEffect(() => {
    if (initializing || !user || !revenueCatInitialized.current || subscriptionRestored.current) {
      return;
    }

    const restoreSubscription = async () => {
      try {
        if (__DEV__) {
          console.log('🔄 [LAYOUT] Restoring subscription status for user:', user.id);
        }
        
        // For iOS users, restore purchases from RevenueCat
        if (Platform.OS === 'ios') {
          const restoreResult = await restorePurchases();
          if (restoreResult.success) {
            console.log('✅ [LAYOUT] Purchases restored successfully');
          }
        }
        
        // Check current subscription status
        const isPremium = await isPremiumActive(user.id, true); // force refresh
        
        subscriptionRestored.current = true;
        
        if (__DEV__) {
          console.log('✅ [LAYOUT] Subscription restoration completed. Premium status:', isPremium);
        }
      } catch (error) {
        console.error('❌ [LAYOUT] Subscription restoration failed:', error);
        subscriptionRestored.current = true; // Mark as completed even on error to avoid retries
      }
    };

    restoreSubscription();
  }, [user, initializing, revenueCatInitialized.current]);

  // Check if user needs to see intro (first time after signup + email confirmation)
  useEffect(() => {
    if (initializing || !user || introChecked.current) {
      return;
    }

    const checkIntroStatus = async () => {
      try {
        // First check AsyncStorage for fast response
        const seenLocally = await hasSeenIntroLocally();
        
        if (seenLocally) {
          introChecked.current = true;
          return;
        }
        
        // Check database for authoritative status
        // Show intro if onboarding NOT completed
        const needsIntro = user.onboarding_completed === false;
        
        if (needsIntro) {
          console.log('[LAYOUT] New user detected - showing intro');
          setShowIntro(true);
        } else {
          // Mark as seen locally to avoid future checks
          await markIntroAsSeenLocally();
        }
        
        introChecked.current = true;
      } catch (error) {
        console.error('[LAYOUT] Error checking intro status:', error);
        introChecked.current = true;
      }
    };

    checkIntroStatus();
  }, [user, initializing]);

  const handleIntroComplete = async () => {
    try {
      // Mark that intro check has been completed to prevent re-checking
      introChecked.current = true;
      
      // Only mark onboarding complete if this is the first time (not replay mode)
      if (user?.id && !isReplayMode.current) {
        // Mark in database (authoritative)
        await markOnboardingComplete(user.id);
        
        // Mark in AsyncStorage (cache)
        await markIntroAsSeenLocally();
        
        // Refresh user profile to get updated onboarding_completed status
        // This is handled by AuthContext's real-time subscription
      } else if (isReplayMode.current) {
        // In replay mode, just mark as seen locally so it doesn't auto-show again
        await markIntroAsSeenLocally();
      }
    } catch (error) {
      console.error('[LAYOUT] Error marking intro complete:', error);
    } finally {
      // Reset replay mode flag
      isReplayMode.current = false;
      // Hide intro first
      setShowIntro(false);
      // Small delay to ensure intro is hidden before navigation
      setTimeout(() => {
        // Navigate to camera screen (main tab)
        router.replace('/(tabs)');
      }, 100);
    }
  };

  useEffect(() => {
    if (initializing) return;

    // CRITICAL: Wait for intro check to complete before any navigation
    if (!introChecked.current) {
      console.log('[LAYOUT] Waiting for intro check to complete before navigation');
      return;
    }

    // CRITICAL: Don't redirect if intro is showing
    if (showIntro) {
      console.log('[LAYOUT] Intro is showing - blocking all navigation redirects');
      return;
    }

    const inAuthGroup = segments[0] === 'auth' || segments[0] === 'email-confirmation';
    const inCallbackGroup = segments[0] === 'auth' && segments[1] === 'callback';

    // IMPORTANT: Allow callback route to complete its authentication flow
    if (inCallbackGroup) {
      console.log('[LAYOUT] In callback route - skipping automatic redirects');
      return;
    }

    // Redirect logic for non-callback routes
    if (!user && !inAuthGroup) {
      console.log('[LAYOUT] No user, not in auth group - redirecting to /auth');
      router.replace('/auth');
    } else if (user && inAuthGroup) {
      console.log('[LAYOUT] User authenticated, in auth group - redirecting to /(tabs)');
      router.replace('/(tabs)');
    }
  }, [user, initializing, segments, showIntro]);

  // Show loading spinner while initializing
  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.cleanGreen} />
      </View>
    );
  }

  return (
    <>
      {showIntro && (
        <IntroStory 
          visible={showIntro} 
          onComplete={handleIntroComplete} 
        />
      )}
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
    </>
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
