import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, SafeAreaView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from '@/lib/supabase';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function AuthCallbackScreen() {
  const hasProcessed = useRef(false);
  const [showRetry, setShowRetry] = useState(false);
  const params = useLocalSearchParams();
  
  console.log('🔄 AuthCallbackScreen mounted');
  console.log('📋 Route params:', params);

  useEffect(() => {
    if (hasProcessed.current) {
      console.log('Callback already processed, skipping');
      return;
    }

    const createSessionFromParams = async (params: any) => {
      console.log('🚀 Creating session from params:', params);
      
      try {
        console.log('📋 Processing params:', params);
        
        // Check for error first
        if (params.error) {
          console.error('Error from params:', params.error);
          router.replace('/auth?error=' + encodeURIComponent(params.error));
          return;
        }

        // For PKCE flow, we get a 'code' parameter
        const { code, access_token, refresh_token } = params;

        if (code) {
          console.log('🔐 Found PKCE code, exchanging for session...');
          console.log('Code value:', code);
          
          try {
            console.log('⏱️ Starting exchangeCodeForSession call (15 second timeout)...');
            
            // Create a 15-second timeout promise
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Exchange timeout after 15 seconds')), 15000);
            });
            
            // Race the exchange against the timeout
            const result = await Promise.race([
              supabase.auth.exchangeCodeForSession(String(code)),
              timeoutPromise
            ]);
            
            const { data, error } = result as any;
            
            console.log('📦 Exchange completed');
            
            if (error) {
              console.error('❌ Code exchange error:', error.message);
              router.replace('/auth?error=' + encodeURIComponent(error.message));
              return;
            }

            if (data?.session) {
              console.log('✅ Session created via PKCE!');
              console.log('👤 User:', data.session.user.email);
              console.log('⏳ Waiting 1000ms for AuthContext...');
              await new Promise(resolve => setTimeout(resolve, 1000));
              console.log('🚀 Navigating to /(tabs)');
              router.replace('/(tabs)');
              return;
            } else {
              console.log('⚠️ Exchange succeeded but no session');
              setShowRetry(true);
              return;
            }
          } catch (error: any) {
            console.error('💥 Exception during PKCE exchange:', error.message);
            setShowRetry(true);
            return;
          }
        }

        // For non-PKCE flow (direct tokens)
        if (access_token && refresh_token) {
          console.log('🔑 Found tokens, setting session...');
          console.log('Access token present:', !!access_token);
          console.log('Access token type:', typeof access_token);
          console.log('Access token length:', String(access_token).length);
          console.log('Refresh token present:', !!refresh_token);
          console.log('Refresh token type:', typeof refresh_token);
          console.log('Refresh token length:', String(refresh_token).length);
          
          try {
            console.log('⏱️ Starting setSession call...');
            
            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('SetSession timeout after 8 seconds')), 8000);
            });
            
            // Race the session set against the timeout
            const sessionResult = await Promise.race([
              supabase.auth.setSession({
                access_token: String(access_token),
                refresh_token: String(refresh_token),
              }),
              timeoutPromise
            ]).catch(err => {
              console.error('💥 Promise.race caught error:', err);
              return { data: null, error: err };
            });

            console.log('📦 Session result received');
            console.log('Has data:', !!sessionResult.data);
            console.log('Has error:', !!sessionResult.error);
            console.log('Has session:', !!sessionResult.data?.session);

            const { data, error } = sessionResult;

            if (error) {
              console.error('❌ Set session error:', error);
              console.error('Error message:', error.message);
              console.error('Error name:', error.name);
              console.error('Full error:', JSON.stringify(error, null, 2));
              router.replace('/auth?error=' + encodeURIComponent(error.message));
              return;
            }

            if (data?.session) {
              console.log('✅ Session created via tokens!');
              console.log('👤 User:', data.session.user?.email);
              console.log('🔑 Access token length:', data.session.access_token?.length);
              console.log('🕒 Session expires at:', data.session.expires_at);
              console.log('⏳ Waiting 500ms for AuthContext...');
              await new Promise(resolve => setTimeout(resolve, 500));
              console.log('🚀 About to navigate to /(tabs)');
              router.replace('/(tabs)');
              console.log('✅ Navigation command issued');
              return;
            } else {
              console.log('⚠️ Token session set completed but no session returned');
              console.log('Data object:', JSON.stringify(data, null, 2));
              setShowRetry(true);
              return;
            }
          } catch (error) {
            console.error('💥 Caught exception during token session set:');
            console.error('Error type:', error?.constructor?.name);
            console.error('Error message:', error?.message);
            console.error('Error stack:', error?.stack);
            console.error('Full error:', JSON.stringify(error, null, 2));
            setShowRetry(true);
            return;
          }
        }

        console.log('⚠️ No valid auth parameters found in URL');
        console.log('Available params:', Object.keys(params));
        setShowRetry(true);
        
      } catch (error) {
        console.error('💥 Exception in createSessionFromUrl:', error);
        console.error('Exception details:', JSON.stringify(error, null, 2));
        router.replace('/auth?error=session_creation_failed');
      }
    };

    const createSessionFromUrl = async (url: string) => {
      console.log('🚀 Creating session from URL:', url);
      
      try {
        const { params: urlParams, errorCode } = QueryParams.getQueryParams(url);
        
        console.log('📋 Parsed URL params:', urlParams);
        console.log('❌ Error code:', errorCode);
        
        if (errorCode) {
          console.error('Error from URL:', errorCode);
          router.replace('/auth?error=' + encodeURIComponent(errorCode));
          return;
        }

        // Process the URL params the same way
        await createSessionFromParams(urlParams);
        
      } catch (error) {
        console.error('💥 Exception in createSessionFromUrl:', error);
        console.error('Exception details:', JSON.stringify(error, null, 2));
        router.replace('/auth?error=session_creation_failed');
      }
    };

    // Handle the callback
    const handleCallback = async () => {
      hasProcessed.current = true;
      
      console.log('🔍 Processing auth callback...');
      
      // Method 1: Use route params directly (most reliable for Expo Router)
      if (params && Object.keys(params).length > 0) {
        console.log('✅ Using route params directly');
        await createSessionFromParams(params);
        return;
      }
      
      // Method 2: Fallback to Linking API
      console.log('🔍 Route params empty, trying Linking API...');
      
      // Try to get the URL that opened the app
      let url = await Linking.getInitialURL();
      console.log('🔗 Initial URL:', url);
      
      if (url) {
        await createSessionFromUrl(url);
        return;
      }
      
      // Method 3: Listen for URL events (for when app is already running)
      console.log('🔍 Setting up URL listener...');
      const urlListener = Linking.addEventListener('url', (event) => {
        console.log('📨 URL event received:', event.url);
        if (event.url && event.url.includes('auth/callback')) {
          urlListener?.remove();
          createSessionFromUrl(event.url);
        }
      });
      
      // Give it a moment to receive URL events
      setTimeout(() => {
        console.log('⚠️ No URL received after waiting');
        urlListener?.remove();
        setShowRetry(true);
      }, 3000);
    };

    handleCallback();
  }, []);

  // Timeout fallback - if we've processed the callback but nothing happens after 20 seconds
  useEffect(() => {
    if (!hasProcessed.current) return;
    
    const timeout = setTimeout(() => {
      if (!hasProcessed.current) {
        console.log('⏰ Auth callback timeout - showing retry option');
        setShowRetry(true);
      }
    }, 20000); // 20 seconds to give exchange time to complete

    return () => clearTimeout(timeout);
  }, [hasProcessed.current]);

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
