import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, SafeAreaView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const hasProcessed = useRef(false);
  const [showRetry, setShowRetry] = useState(false);
  
  // Log all parameters to debug
  console.log('Callback params received:', params);

  useEffect(() => {
    const handleAuthCallback = async () => {
      // Prevent duplicate processing
      if (hasProcessed.current) {
        console.log('Callback already processed, skipping');
        return;
      }
      hasProcessed.current = true;
      try {
        // Check if we have the required parameters
        const { access_token, refresh_token, type, token_hash, code, error, error_description } = params;
        
        // Handle error cases first
        if (error) {
          console.error('Auth error from callback:', error, error_description);
          router.replace('/auth?error=' + encodeURIComponent(error_description || error));
          return;
        }

        // Handle PKCE flow with authorization code
        if (code) {
          console.log('Exchanging authorization code for session');
          console.log('Code value:', code);
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(code as string);
          
          if (error) {
            console.error('Error exchanging code for session:', error);
            router.replace('/auth?error=' + encodeURIComponent(error.message));
            return;
          }
          
          if (data.session) {
            console.log('Code exchange successful, navigating to app');
            // Small delay to ensure AuthContext updates
            await new Promise(resolve => setTimeout(resolve, 500));
            router.replace('/(tabs)');
            return;
          } else {
            console.log('Code exchange completed but no session returned');
            setShowRetry(true);
          }
        }

        // For email confirmation, we might get different parameter names
        if (access_token && refresh_token) {
          console.log('Setting session with tokens');
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: access_token as string,
            refresh_token: refresh_token as string,
          });

          if (sessionError) {
            console.error('Error setting session:', sessionError);
            router.replace('/auth?error=session_failed');
            return;
          }

          console.log('Session set successfully, navigating to app');
          // Small delay to ensure AuthContext updates
          await new Promise(resolve => setTimeout(resolve, 500));
          router.replace('/(tabs)');
          return;
        }

        // Try to get the current session (in case the URL handling already processed it)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (session && !sessionError) {
          console.log('Found existing session, navigating to app');
          // Small delay to ensure AuthContext updates
          await new Promise(resolve => setTimeout(resolve, 500));
          router.replace('/(tabs)');
          return;
        }

        // If we have a token_hash, try to exchange it for a session
        if (token_hash) {
          console.log('Exchanging token hash for session');
          const { data, error: exchangeError } = await supabase.auth.verifyOtp({
            token_hash: token_hash as string,
            type: 'email'
          });

          if (exchangeError) {
            console.error('Error exchanging token:', exchangeError);
            router.replace('/auth?error=token_exchange_failed');
            return;
          }

          if (data.session) {
            console.log('Token exchange successful, navigating to app');
            // Small delay to ensure AuthContext updates
            await new Promise(resolve => setTimeout(resolve, 500));
            router.replace('/(tabs)');
            return;
          }
        }

        // If we get here, something went wrong
        console.error('No valid authentication method found. Params:', params);
        setShowRetry(true);
        
      } catch (error) {
        console.error('Auth callback error:', error);
        setShowRetry(true);
      }
    };

    handleAuthCallback();
  }, [params]);

  const handleRetry = () => {
    console.log('User clicked Try Auto Sign-In - redirecting to sign in screen');
    router.replace('/auth');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.replace('/auth')}>
          <ArrowLeft size={24} color={COLORS.cleanGreen} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Email Confirmation</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.content}>
        {!showRetry ? (
          <>
            <ActivityIndicator size="large" color={COLORS.cleanGreen} />
            <Text style={styles.title}>Confirming your email...</Text>
            <Text style={styles.subtitle}>Please wait while we verify your account.</Text>
            
            {/* Back button for loading state */}
            <TouchableOpacity style={styles.loadingBackButton} onPress={() => router.replace('/auth')}>
              <Text style={styles.loadingBackButtonText}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Email Confirmed!</Text>
            <Text style={styles.subtitle}>Your email has been confirmed. You can now sign in to your account.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Try Auto Sign-In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/auth')}>
              <Text style={styles.backButtonText}>Sign In Manually</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerBackButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  headerPlaceholder: {
    width: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: FONT_SIZES.titleMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleMedium,
  },
  subtitle: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.bodyMedium,
    marginBottom: 32,
    fontFamily: FONTS.terminalGrotesque,
  },
  loadingBackButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  loadingBackButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    textAlign: 'center',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  retryButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    textAlign: 'center',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  backButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    textAlign: 'center',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
});
