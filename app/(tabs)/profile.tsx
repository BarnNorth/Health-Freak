import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Alert, TouchableWithoutFeedback, Platform } from 'react-native';
import { User, Crown, FileText, Shield, LogOut, CreditCard, RefreshCw, Film } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import Purchases from 'react-native-purchases';
import { useAuth } from '@/contexts/AuthContext';
import { showCancelSubscriptionPrompt } from '@/services/subscriptionModals';
import { getPaymentMethod } from '@/lib/database';
import { PaymentMethodModal } from '@/components/PaymentMethodModal';
import { getSubscriptionInfo, isPremiumActive, SubscriptionInfo } from '@/services/subscription';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';
import { resetIntroLocally } from '@/services/introStorage';
import { supabase } from '@/lib/supabase';
import { triggerIntro } from '@/services/introTrigger';

export default function ProfileScreen() {
  const { user, signOut, initializing, refreshUserProfile } = useAuth();
  const hasRefreshedRef = useRef(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const debugPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refresh profile once when tab is focused (prevent infinite loops)
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id && !initializing && !hasRefreshedRef.current) {
        hasRefreshedRef.current = true;
        refreshUserProfile();
        loadSubscriptionInfo();
        
        // Reset the flag after 5 seconds to allow future refreshes
        setTimeout(() => {
          hasRefreshedRef.current = false;
        }, 5000);
      }
    }, [user?.id, initializing])
  );

  // Listen for RevenueCat subscription updates (real-time UI refresh)
  useEffect(() => {
    // Only set up listener on iOS where RevenueCat is available
    if (Platform.OS !== 'ios' || !user?.id) return;

    console.log('🔔 [Profile] Setting up RevenueCat customer info listener');

    // This listener fires whenever RevenueCat syncs with Apple servers
    const customerInfoListener = Purchases.addCustomerInfoUpdateListener((customerInfo) => {
      console.log('🔔 [Profile] RevenueCat customer info updated from Apple');
      console.log('📊 [Profile] Active subscriptions:', customerInfo.activeSubscriptions);
      console.log('📊 [Profile] Active entitlements:', Object.keys(customerInfo.entitlements.active));
      
      // Reload subscription info to update UI
      loadSubscriptionInfo();
    });

    // Cleanup listener when component unmounts or user changes
    return () => {
      console.log('🧹 [Profile] Cleaning up RevenueCat listener');
      if (customerInfoListener && typeof customerInfoListener.remove === 'function') {
        customerInfoListener.remove();
      }
    };
  }, [user?.id]);

  // Load subscription information using unified service
  const loadSubscriptionInfo = async () => {
    if (!user) return;
    
    try {
      const [premiumStatus, subInfo] = await Promise.all([
        isPremiumActive(user.id),  // Uses cache efficiently
        getSubscriptionInfo(user.id)
      ]);
      
      setIsPremium(premiumStatus);
      setSubscriptionInfo(subInfo);
    } catch (error) {
      console.error('[PROFILE] Error loading subscription info:', error);
      setIsPremium(false);
      setSubscriptionInfo(null);
    }
  };


  if (initializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Loading...</Text>
          <Text style={styles.emptyText}>
            If this takes too long, try refreshing the app.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <User size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyText}>
            Please sign in to access your profile and account settings.
          </Text>
          <TouchableOpacity style={styles.signInButton} onPress={() => router.push('/auth')}>
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleUpgradeClick = () => {
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = async () => {
    await refreshUserProfile();
  };

  // Debug gesture handlers (development only)
  const handleDebugPressIn = () => {
    if (!__DEV__) return;
    
    debugPressTimeout.current = setTimeout(() => {
      router.push('/debug-subscription' as any);
    }, 3000); // 3 second long press
  };

  const handleDebugPressOut = () => {
    if (debugPressTimeout.current) {
      clearTimeout(debugPressTimeout.current);
      debugPressTimeout.current = null;
    }
  };

  const handleReplayIntro = async () => {
    try {
      if (!user?.id) return;
      
      // Reset database flag
      const { error } = await supabase
        .from('users')
        .update({ onboarding_completed: false })
        .eq('id', user.id);
      
      if (error) throw error;
      
      // Reset local cache
      await resetIntroLocally();
      
      // Trigger intro immediately
      triggerIntro();
    } catch (error) {
      console.error('Error resetting intro:', error);
      Alert.alert('Error', 'Failed to reset intro. Please try again.');
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          onPress: () => {
            signOut();
          }, 
          style: 'destructive' 
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Bold Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Health Freak</Text>
        </View>

        {/* User Info */}
        <View style={styles.userCard}>
          <View style={styles.userInfo}>
            <View style={styles.avatarContainer}>
              <User size={32} color={COLORS.cleanGreen} />
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.userEmail} numberOfLines={1} ellipsizeMode="tail">{user.email}</Text>
              <View style={styles.statusContainer}>
                {isPremium ? (
                  <Text style={styles.premiumStatus}>👑 Premium Member</Text>
                ) : (
                  <Text style={styles.freeStatus}>⚡ Free Account{'\n'}{Math.min(user.total_scans_used, 10)} of 10 scans used</Text>
                )}
              </View>
            </View>
            <TouchableOpacity 
              style={styles.refreshButton} 
              onPress={refreshUserProfile}
            >
              <RefreshCw size={16} color={COLORS.cleanGreen} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Free Tier Upgrade Section */}
        {!isPremium && (
          <View style={styles.upgradeCard}>
            <View style={styles.upgradeHeader}>
              <Text style={styles.upgradeTitle}>🔥 Upgrade to Premium</Text>
            </View>
            
            <Text style={styles.upgradeDescription}>
              Upgrade for unlimited access to all premium features!
            </Text>
            
            <View style={styles.benefitsContainer}>
              <Text style={styles.benefitTitle}>Premium Benefits:</Text>
              <Text style={styles.benefit}>• ♾️ Unlimited scans forever</Text>
              <Text style={styles.benefit}>• 💾 Scan history saved</Text>
              <Text style={styles.benefit}>• 🔍 Search and filter your history</Text>
            </View>
            
            <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgradeClick}>
              <Text style={styles.upgradeButtonText}>💵 Upgrade to Premium 💵{'\n'}$10/month</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {isPremium && (
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => router.push('/manage-subscription' as any)}
            >
              <CreditCard size={20} color={COLORS.cleanGreen} />
              <Text style={styles.menuText}>Manage Subscription</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/terms')}>
            <FileText size={20} color={COLORS.textSecondary} />
            <Text style={styles.menuText}>Terms of Service</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/privacy')}>
            <Shield size={20} color={COLORS.textSecondary} />
            <Text style={styles.menuText}>Privacy Policy</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleReplayIntro}>
            <Film size={20} color={COLORS.textSecondary} />
            <Text style={styles.menuText}>Replay Intro Story</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color={COLORS.toxicRed} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* App Version (with secret debug gesture in dev mode) */}
        <TouchableWithoutFeedback 
          onPressIn={handleDebugPressIn}
          onPressOut={handleDebugPressOut}
        >
          <View style={styles.versionContainer}>
            <Text style={styles.versionText}>
              Health Freak v1.0.0
            </Text>
          </View>
        </TouchableWithoutFeedback>
      </ScrollView>

      {/* Payment Method Modal */}
      <PaymentMethodModal
        visible={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={handlePaymentSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: FONT_SIZES.titleXL,
    fontWeight: '400',
    color: COLORS.textSecondary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleXL,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.titleSmall,
    color: COLORS.textSecondary,
    fontWeight: '400',
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  userCard: {
    backgroundColor: COLORS.background,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  userInfo: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'center',
  },
  refreshButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: COLORS.background,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.cleanGreen,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userDetails: {
    flex: 1,
  },
  userEmail: {
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 4,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumStatus: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  freeStatus: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  subscriptionCard: {
    backgroundColor: COLORS.accentYellow,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  subscriptionTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginLeft: 8,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  subscriptionDescription: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    marginBottom: 16,
    lineHeight: LINE_HEIGHTS.bodyMedium,
    fontFamily: FONTS.terminalGrotesque,
  },
  // Free Tier Upgrade Card
  upgradeCard: {
    backgroundColor: COLORS.accentYellow,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  upgradeTitle: {
    fontSize: FONT_SIZES.titleMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleMedium,
    includeFontPadding: false,
  },
  upgradeDescription: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textSecondary,
    marginBottom: 16,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  benefitsContainer: {
    marginBottom: 20,
  },
  benefitTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 8,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  benefit: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    fontWeight: '400',
    marginBottom: 6,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  // Premium Status Card
  premiumCard: {
    backgroundColor: COLORS.cleanGreen,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  premiumTitleBox: {
    backgroundColor: COLORS.accentYellow,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  premiumTitle: {
    fontSize: 22,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: 28,
    includeFontPadding: false,
    textAlign: 'center',
    paddingTop: 2,
  },
  premiumDescription: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textSecondary,
    marginBottom: 16,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  premiumInfo: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  premiumLabel: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textSecondary,
    fontFamily: FONTS.terminalGrotesque,
    marginBottom: 4,
    fontWeight: '700',
  },
  premiumValue: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    fontWeight: '400',
  },
  premiumFeatures: {
    marginBottom: 0,
  },
  premiumFeature: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    fontWeight: '400',
    marginBottom: 6,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  upgradeButton: {
    backgroundColor: COLORS.cleanGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  upgradeButtonText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
    textAlign: 'center',
  },
  menuContainer: {
    backgroundColor: COLORS.background,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    marginLeft: 12,
    flex: 1,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  cancelMenuText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.toxicRed,
    marginLeft: 12,
    flex: 1,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  menuArrow: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textSecondary,
  },
  legalDisclaimer: {
    backgroundColor: COLORS.accentYellow,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  legalTitle: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  legalText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    lineHeight: LINE_HEIGHTS.bodyMedium,
    fontFamily: FONTS.terminalGrotesque,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.background,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: COLORS.toxicRed,
    marginBottom: 32,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  signOutText: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.toxicRed,
    fontWeight: '400',
    marginLeft: 8,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  versionContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  versionText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.bodyMedium,
    fontFamily: FONTS.terminalGrotesque,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.titleMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleMedium,
  },
  emptyText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: LINE_HEIGHTS.bodyMedium,
    fontFamily: FONTS.terminalGrotesque,
  },
  signInButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  signInButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
});