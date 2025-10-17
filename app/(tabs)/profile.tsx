import React, { useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { User, Crown, FileText, Shield, Settings, LogOut, CreditCard, RefreshCw } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { startPremiumSubscription } from '@/services/stripe';
import { showCancelSubscriptionPrompt } from '@/services/subscription';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function ProfileScreen() {
  const { user, signOut, initializing, refreshUserProfile } = useAuth();
  const hasRefreshedRef = useRef(false);

  // Refresh profile once when tab is focused (prevent infinite loops)
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id && !initializing && !hasRefreshedRef.current) {
        hasRefreshedRef.current = true;
        refreshUserProfile();
        
        // Reset the flag after 5 seconds to allow future refreshes
        setTimeout(() => {
          hasRefreshedRef.current = false;
        }, 5000);
      }
    }, [user?.id, initializing])
  );


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

  const handleSubscribe = async () => {
    try {
      await startPremiumSubscription();
    } catch (error) {
      console.error('❌ Subscription checkout failed:', error);
      Alert.alert(
        'Checkout Failed',
        'Unable to start the subscription process. Please try again.',
        [{ text: 'OK' }]
      );
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
                {user.subscription_status === 'premium' ? (
                  <Text style={styles.premiumStatus}>👑 Premium Member</Text>
                ) : (
                  <Text style={styles.freeStatus}>⚡ Free Account{'\n'}{Math.min(user.total_scans_used, 5)} of 5 scans used</Text>
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
        {user.subscription_status === 'free' && (
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
            
            <TouchableOpacity style={styles.upgradeButton} onPress={handleSubscribe}>
              <Text style={styles.upgradeButtonText}>💵 Upgrade to Premium 💵{'\n'}$10/month</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Premium Status Section */}
        {user.subscription_status === 'premium' && (
          <View style={styles.premiumCard}>
            <View style={styles.premiumTitleBox}>
              <Text style={styles.premiumTitle}>🤑 Membership Benefits</Text>
            </View>
            
            <View style={styles.premiumFeatures}>
              <Text style={styles.premiumFeature}>✅ Unlimited ingredient scans</Text>
              <Text style={styles.premiumFeature}>✅ Full scan history saved</Text>
              <Text style={styles.premiumFeature}>✅ Search and export features</Text>
            </View>
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {user.subscription_status === 'premium' && (
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={showCancelSubscriptionPrompt}
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

          <TouchableOpacity style={styles.menuItem} onPress={() => {
            Alert.alert('Privacy Policy', 'Privacy policy page coming soon!', [{ text: 'OK' }]);
          }}>
            <Shield size={20} color={COLORS.textSecondary} />
            <Text style={styles.menuText}>Privacy Policy</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => {
            Alert.alert('App Settings', 'Settings page coming soon!', [{ text: 'OK' }]);
          }}>
            <Settings size={20} color={COLORS.textSecondary} />
            <Text style={styles.menuText}>App Settings</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Legal Disclaimer */}
        <View style={styles.legalDisclaimer}>
          <Text style={styles.legalTitle}>Important Legal Notice</Text>
          <Text style={styles.legalText}>
            This app provides educational information only. It is not intended as medical, 
            health, or nutritional advice. Always consult qualified healthcare professionals 
            for dietary decisions and health concerns.
          </Text>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color={COLORS.toxicRed} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>
            Health Freak v1.0.0{'\n'}
            Educational purposes only
          </Text>
        </View>
      </ScrollView>
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