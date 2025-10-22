import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { CheckCircle, ArrowLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { clearSubscriptionCache } from '@/services/subscription';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function SubscriptionSuccessScreen() {
  const { refreshUserProfile } = useAuth();
  const hasRefreshedRef = React.useRef(false);

  useEffect(() => {
    // Only run once per component lifecycle
    if (hasRefreshedRef.current) {
      return;
    }
    hasRefreshedRef.current = true;

    // Clear subscription cache and refresh profile immediately
    const refreshSubscriptionStatus = async () => {
      if (__DEV__) {
        console.log('🎉 [SUBSCRIPTION_SUCCESS] Clearing cache and refreshing profile');
      }
      
      // Clear the subscription cache so next check gets fresh status
      clearSubscriptionCache();
      
      // Force refresh user profile to get updated subscription_status from database
      await refreshUserProfile();
      
      if (__DEV__) {
        console.log('✅ [SUBSCRIPTION_SUCCESS] Profile refreshed, user should now be premium');
      }
    };
    
    refreshSubscriptionStatus();

    // Auto-redirect to profile after 3 seconds
    const timer = setTimeout(() => {
      router.replace('/(tabs)/profile');
    }, 3000);

    return () => clearTimeout(timer);
  }, []); // Empty dependency array - only run once

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <CheckCircle size={80} color={COLORS.cleanGreen} />
        <Text style={styles.title}>Welcome to Premium!</Text>
        <Text style={styles.subtitle}>
          Your subscription is now active. You can enjoy all premium features including:
        </Text>
        
        <View style={styles.featuresList}>
          <Text style={styles.feature}>• Detailed ingredient explanations</Text>
          <Text style={styles.feature}>• Health impact information</Text>
          <Text style={styles.feature}>• Alternative product suggestions</Text>
          <Text style={styles.feature}>• Unlimited scan history</Text>
          <Text style={styles.feature}>• Export functionality</Text>
        </View>

        <Text style={styles.redirectText}>
          Redirecting to your profile in 3 seconds...
        </Text>

        <TouchableOpacity 
          style={styles.backButton} 
          onPress={async () => {
            // Only refresh if it hasn't been done yet
            if (!hasRefreshedRef.current) {
              clearSubscriptionCache();
              await refreshUserProfile();
              hasRefreshedRef.current = true;
            }
            router.replace('/(tabs)/profile');
          }}
        >
          <ArrowLeft size={20} color={COLORS.white} />
          <Text style={styles.backButtonText}>Go to Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: FONT_SIZES.titleLarge,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginTop: 24,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleLarge,
  },
  subtitle: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: LINE_HEIGHTS.bodyMedium,
    fontFamily: FONTS.terminalGrotesque,
  },
  featuresList: {
    alignSelf: 'stretch',
    marginBottom: 32,
  },
  feature: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'left',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  redirectText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentBlue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  backButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
});
