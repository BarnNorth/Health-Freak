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
      
      const { params, errorCode } = QueryParams.getQueryParams(url);
      
      if (errorCode) {
        setError(`Authentication error: ${errorCode}`);
        return;
      }

      const { access_token, refresh_token, code } = params;

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
          
          // Small delay to ensure session is fully established
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Navigate to auth group to trigger layout's navigation logic
          router.replace('/auth');
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
          
          // Small delay to ensure session is fully established
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Navigate to auth group to trigger layout's navigation logic
          router.replace('/auth');
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
      
      // Small delay to ensure session is fully established
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Navigate to auth group to trigger layout's navigation logic
      router.replace('/auth');
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
            <ArrowLeft color={COLORS.text} size={24} />
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
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
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
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.xl,
    color: COLORS.text,
    marginTop: 24,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.xl,
    color: COLORS.alertRed,
    marginBottom: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.relaxed,
  },
  retryButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  retryButtonText: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZES.md,
    color: COLORS.background,
  },
});
