/**
 * Email Verification Callback Handler
 * 
 * Handles the redirect after email confirmation.
 * Works with Supabase's PKCE flow for secure authentication.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, SafeAreaView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);
  const params = useLocalSearchParams();
  const url = Linking.useURL();

  useEffect(() => {
    handleAuthCallback();
  }, []);
  
  // Handle URL from deep link
  useEffect(() => {
    if (url) {
      processAuthUrl(url);
    }
  }, [url]);

  const processAuthUrl = async (url: string) => {
    try {
      const startTime = Date.now();
      
      // Validate we received a universal link
      if (!url.includes('healthfreak.io')) {
        console.warn('[CALLBACK] ⚠️ Received non-universal link:', url);
        setError('Invalid authentication link format');
        return;
      }
      
      console.log('[CALLBACK] Processing universal link:', url);
      
      const { params, errorCode } = QueryParams.getQueryParams(url);
      
      if (errorCode) {
        console.error('[CALLBACK] Error code in URL:', errorCode);
        setError(`Authentication error: ${errorCode}`);
        return;
      }

      const { access_token, refresh_token, code, token_hash, type, next } = params;
      
      console.log('[CALLBACK] Extracted params:', { 
        hasCode: !!code, 
        hasTokens: !!(access_token && refresh_token),
        hasTokenHash: !!token_hash,
        type,
        next
      });

      // Handle password recovery flow (with token_hash)
      if (token_hash && type === 'recovery') {
        console.log('[CALLBACK] Processing password recovery token');
        
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: String(token_hash),
          type: 'recovery',
        });
        
        if (verifyError) {
          console.error('[CALLBACK] Recovery verification failed:', verifyError);
          setError(`Password reset failed: ${verifyError.message}`);
          return;
        }
        
        if (data?.session) {
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`✅ Recovery auth completed in ${totalTime}s`);
          
          // Small delay to ensure session is fully established
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Navigate to password update screen
          console.log('[CALLBACK] Navigating to password update screen');
          router.replace('/account/update-password' as any);
          return;
        } else {
          console.error('[CALLBACK] Recovery verified but no session created');
          setError('Password reset verification succeeded but no session was created. Please try again.');
          return;
        }
      }

      // Handle PKCE flow (with code)
      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(String(code));
        
        if (exchangeError) {
          setError(`Authentication failed: ${exchangeError.message}`);
          return;
        }
        
        if (data?.session) {
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`✅ Auth completed in ${totalTime}s`);
          
          // Check if this is a password reset (recovery) flow
          // Check URL, type parameter, and redirect_to parameter
          const redirectTo = params.redirect_to;
          const hasRecoveryInRedirect = redirectTo?.includes('type=recovery');
          const isPasswordReset = url.includes('type=recovery') || 
                                 url.includes('recovery=true') || 
                                 type === 'recovery' ||
                                 hasRecoveryInRedirect;
          
          console.log('[CALLBACK] Recovery check:', { 
            isPasswordReset, 
            urlHasType: url.includes('type=recovery'),
            typeParam: type,
            redirectTo,
            hasRecoveryInRedirect
          });
          
          // Small delay to ensure session is fully established
          await new Promise(resolve => setTimeout(resolve, 100));
          
          if (isPasswordReset) {
            console.log('[CALLBACK] Navigating to password update screen');
            router.replace('/account/update-password' as any);
          } else {
            // Navigate to auth group to trigger layout's navigation logic
            router.replace('/auth');
          }
          return;
        }
      }

      // Handle implicit flow (with tokens)
      if (access_token && refresh_token) {
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: String(access_token),
          refresh_token: String(refresh_token),
        });

        if (sessionError) {
          setError(`Failed to create session: ${sessionError.message}`);
          return;
        }

        if (data?.session) {
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`✅ Auth completed in ${totalTime}s`);
          
          // Check if this is a password reset (recovery) flow
          const isPasswordReset = url.includes('type=recovery') || url.includes('recovery=true') || type === 'recovery';
          
          console.log('[CALLBACK] Recovery check:', { 
            isPasswordReset, 
            urlHasType: url.includes('type=recovery'),
            typeParam: type 
          });
          
          // Small delay to ensure session is fully established
          await new Promise(resolve => setTimeout(resolve, 100));
          
          if (isPasswordReset) {
            console.log('[CALLBACK] Navigating to password update screen');
            router.replace('/account/update-password' as any);
          } else {
            // Navigate to auth group to trigger layout's navigation logic
            router.replace('/auth');
          }
          return;
        }
      }

      setError('No valid authentication data received');
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(`Unexpected error: ${err.message}`);
    }
  };

  const handleAuthCallback = async () => {
    // Check if session already exists (Supabase may have handled it automatically)
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      console.log('✅ Session already exists');
      
      // Check if this is a password reset flow by checking URL
      const currentUrl = url || (await Linking.getInitialURL()) || '';
      const isPasswordReset = currentUrl.includes('type=recovery') || currentUrl.includes('recovery=true');
      
      // Small delay to ensure session is fully established
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (isPasswordReset) {
        // Navigate to password update screen
        router.replace('/account/update-password' as any);
      } else {
        // Navigate to auth group to trigger layout's navigation logic
        router.replace('/auth');
      }
      return;
    }
    
    // Check route params
    if (params.access_token || params.code) {
      const urlParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value) urlParams.append(key, String(value));
      });
      const url = `healthfreak://auth/callback?${urlParams.toString()}`;
      await processAuthUrl(url);
      return;
    }

    // Try getting URL from Linking
    const initialUrl = await Linking.getInitialURL();
    if (initialUrl && initialUrl.includes('auth/callback')) {
      await processAuthUrl(initialUrl);
      return;
    }

    // If nothing works after 5 seconds, show error
    setTimeout(() => {
      if (!error) {
        setError('Authentication link did not open correctly. Please try signing in.');
      }
    }, 5000);
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.replace('/auth')}
          >
            <ArrowLeft color={COLORS.textPrimary} size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Authentication Error</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <View style={styles.content}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={() => router.replace('/auth')}
          >
            <Text style={styles.retryButtonText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerPlaceholder} />
        <Text style={styles.headerTitle}>Email Confirmation</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.content}>
        <ActivityIndicator size="large" color={COLORS.cleanGreen} />
        <Text style={styles.title}>Confirming your email...</Text>
        <Text style={styles.subtitle}>Please wait a moment.</Text>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: FONTS.karmaFuture,
    fontSize: FONT_SIZES.titleMedium,
    color: COLORS.textPrimary,
  },
  headerPlaceholder: {
    width: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontFamily: FONTS.karmaFuture,
    fontSize: FONT_SIZES.titleMedium,
    color: COLORS.textPrimary,
    marginTop: 24,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: FONTS.karmaFuture,
    fontSize: FONT_SIZES.titleMedium,
    color: COLORS.toxicRed,
    marginBottom: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  retryButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  retryButtonText: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: 'bold',
    color: COLORS.white,
  },
});
