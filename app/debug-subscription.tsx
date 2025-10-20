import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { ChevronLeft, RefreshCw, Trash2, Download, Database, CreditCard, Apple, Server } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionInfo, isPremiumActive, clearSubscriptionCache } from '@/services/subscription';
import { getCustomerInfo, restorePurchases, getRevenueCatConfig, isRevenueCatConfigured } from '@/services/revenueCat';
import { getUserProfile } from '@/lib/database';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES } from '@/constants/typography';

/**
 * Debug Subscription Screen
 * 
 * Development-only screen for debugging subscription state.
 * Only accessible in __DEV__ builds via secret gesture in Profile screen.
 */
export default function DebugSubscriptionScreen() {
  const { user, refreshUserProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Subscription data
  const [dbUser, setDbUser] = useState<any>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);
  const [premiumStatus, setPremiumStatus] = useState<boolean>(false);
  const [revenueCatInfo, setRevenueCatInfo] = useState<any>(null);
  const [environment, setEnvironment] = useState<string>('unknown');

  // Only render in development
  if (!__DEV__) {
    router.back();
    return null;
  }

  useEffect(() => {
    loadAllDebugInfo();
  }, [user]);

  const loadAllDebugInfo = async () => {
    if (!user) {
      router.back();
      return;
    }

    try {
      setLoading(true);
      
      // Load all debug information in parallel
      const [userProfile, subInfo, isPremium, rcConfig] = await Promise.all([
        getUserProfile(user.id),
        getSubscriptionInfo(user.id).catch(() => null),
        isPremiumActive(user.id, true).catch(() => false),
        Promise.resolve(getRevenueCatConfig())
      ]);

      setDbUser(userProfile);
      setSubscriptionInfo(subInfo);
      setPremiumStatus(isPremium);
      
      // Get RevenueCat customer info (iOS only)
      if (Platform.OS === 'ios' && isRevenueCatConfigured()) {
        try {
          const customerInfo = await getCustomerInfo();
          setRevenueCatInfo(customerInfo);
        } catch (error) {
          console.error('[DEBUG] Failed to get RevenueCat info:', error);
          setRevenueCatInfo(null);
        }
      }

      // Determine environment
      const env = Platform.OS === 'ios' 
        ? (__DEV__ ? 'iOS Sandbox' : 'iOS Production')
        : 'Android/Web';
      setEnvironment(env);

    } catch (error) {
      console.error('[DEBUG] Error loading debug info:', error);
      Alert.alert('Error', 'Failed to load debug information');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllDebugInfo();
    setRefreshing(false);
  };

  const handleRestorePurchases = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS Only', 'Purchase restoration is only available on iOS');
      return;
    }

    try {
      const result = await restorePurchases();
      if (result.success) {
        const activeCount = result.customerInfo?.activeSubscriptions?.length || 0;
        Alert.alert('Success', `Restored ${activeCount} active subscription(s)`);
        await handleRefresh();
      } else {
        Alert.alert('No Purchases', 'No purchases found to restore');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to restore purchases');
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear Cache?',
      'This will clear the subscription status cache. The app will re-fetch subscription status on next check.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearSubscriptionCache();
            Alert.alert('Cache Cleared', 'Subscription cache has been cleared');
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Debug Subscription</Text>
          <View style={styles.backButton} />
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.cleanGreen} />
          <Text style={styles.loadingText}>Loading debug info...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Debug Subscription</Text>
          <TouchableOpacity style={styles.backButton} onPress={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={COLORS.cleanGreen} />
            ) : (
              <RefreshCw size={24} color={COLORS.cleanGreen} />
            )}
          </TouchableOpacity>
        </View>

        {/* Warning Banner */}
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            🧪 Development Mode Only - This screen is hidden in production builds
          </Text>
        </View>

        {/* Environment Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Server size={20} color={COLORS.cleanGreen} />
            <Text style={styles.sectionTitle}>Environment</Text>
          </View>
          <View style={styles.infoCard}>
            <InfoRow label="Platform" value={Platform.OS} />
            <InfoRow label="Environment" value={environment} />
            <InfoRow label="Build Type" value={__DEV__ ? 'Development' : 'Production'} />
            <InfoRow label="RevenueCat Configured" value={isRevenueCatConfigured() ? 'Yes' : 'No'} />
          </View>
        </View>

        {/* Unified Subscription Status */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <CreditCard size={20} color={COLORS.cleanGreen} />
            <Text style={styles.sectionTitle}>Unified Subscription Service</Text>
          </View>
          <View style={styles.infoCard}>
            <InfoRow label="Premium Active" value={premiumStatus ? 'YES ✅' : 'NO ❌'} valueColor={premiumStatus ? COLORS.cleanGreen : COLORS.toxicRed} />
            {subscriptionInfo && (
              <>
                <InfoRow label="Payment Method" value={subscriptionInfo.paymentMethod || 'None'} />
                <InfoRow 
                  label="Renewal Date" 
                  value={subscriptionInfo.renewalDate ? new Date(subscriptionInfo.renewalDate).toLocaleString() : 'N/A'} 
                />
                <InfoRow 
                  label="Cancels at Period End" 
                  value={subscriptionInfo.cancelsAtPeriodEnd ? 'Yes' : 'No'} 
                />
              </>
            )}
          </View>
        </View>

        {/* Database User Record */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Database size={20} color={COLORS.cleanGreen} />
            <Text style={styles.sectionTitle}>Database (Supabase)</Text>
          </View>
          <View style={styles.infoCard}>
            {dbUser ? (
              <>
                <InfoRow label="Email" value={dbUser.email} />
                <InfoRow label="Subscription Status" value={dbUser.subscription_status} />
                <InfoRow label="Payment Method" value={dbUser.payment_method || 'Not set'} />
                <InfoRow label="Total Scans Used" value={String(dbUser.total_scans_used)} />
                <InfoRow label="Stripe Customer ID" value={dbUser.stripe_customer_id || 'N/A'} />
                <InfoRow label="Stripe Subscription ID" value={dbUser.stripe_subscription_id || 'N/A'} />
                <InfoRow label="Apple Transaction ID" value={dbUser.apple_original_transaction_id || 'N/A'} />
                <InfoRow label="RevenueCat Customer ID" value={dbUser.revenuecat_customer_id || 'N/A'} />
                <InfoRow label="Updated At" value={new Date(dbUser.updated_at).toLocaleString()} />
              </>
            ) : (
              <Text style={styles.noDataText}>No user data loaded</Text>
            )}
          </View>
        </View>

        {/* RevenueCat Info (iOS Only) */}
        {Platform.OS === 'ios' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Apple size={20} color={COLORS.cleanGreen} />
              <Text style={styles.sectionTitle}>RevenueCat (iOS)</Text>
            </View>
            <View style={styles.infoCard}>
              {revenueCatInfo ? (
                <>
                  <InfoRow label="Customer ID" value={revenueCatInfo.originalAppUserId || 'N/A'} />
                  <InfoRow 
                    label="Active Entitlements" 
                    value={Object.keys(revenueCatInfo.entitlements?.active || {}).join(', ') || 'None'} 
                  />
                  <InfoRow 
                    label="All Purchases" 
                    value={Object.keys(revenueCatInfo.allPurchasedProductIdentifiers || {}).join(', ') || 'None'} 
                  />
                  <InfoRow 
                    label="Latest Expiration" 
                    value={revenueCatInfo.latestExpirationDate ? new Date(revenueCatInfo.latestExpirationDate).toLocaleString() : 'N/A'} 
                  />
                </>
              ) : (
                <Text style={styles.noDataText}>
                  {isRevenueCatConfigured() ? 'No RevenueCat customer info available' : 'RevenueCat not configured'}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Debug Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Actions</Text>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleRefresh}>
            <RefreshCw size={20} color={COLORS.cleanGreen} />
            <Text style={styles.actionButtonText}>Refresh All Data</Text>
          </TouchableOpacity>

          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.actionButton} onPress={handleRestorePurchases}>
              <Download size={20} color={COLORS.cleanGreen} />
              <Text style={styles.actionButtonText}>Restore Purchases (iOS)</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.actionButton, styles.dangerButton]} onPress={handleClearCache}>
            <Trash2 size={20} color={COLORS.toxicRed} />
            <Text style={[styles.actionButtonText, styles.dangerText]}>Clear Subscription Cache</Text>
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>How to Use This Screen</Text>
          <Text style={styles.instructionsText}>
            • Use "Refresh All Data" to reload subscription status from all sources{'\n'}
            • Use "Restore Purchases" to manually trigger iOS purchase restoration{'\n'}
            • Use "Clear Cache" to force re-fetch on next subscription check{'\n'}
            • This screen is automatically hidden in production builds
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Helper component for displaying info rows
function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]} selectable>
        {value}
      </Text>
    </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.titleMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textSecondary,
    fontFamily: FONTS.terminalGrotesque,
  },
  warningBanner: {
    backgroundColor: COLORS.accentYellow,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
  },
  warningText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    textAlign: 'center',
    fontFamily: FONTS.terminalGrotesque,
    fontWeight: '400',
  },
  section: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
  },
  infoCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '40',
    gap: 12,
  },
  infoLabel: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    fontFamily: 'Courier',
    flex: 1,
  },
  infoValue: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    fontFamily: 'Courier',
    flex: 2,
    textAlign: 'right',
  },
  noDataText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
    fontFamily: FONTS.terminalGrotesque,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.cleanGreen,
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    color: COLORS.cleanGreen,
    fontFamily: FONTS.terminalGrotesque,
  },
  dangerButton: {
    borderColor: COLORS.toxicRed,
  },
  dangerText: {
    color: COLORS.toxicRed,
  },
  instructionsCard: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    backgroundColor: COLORS.white + '80',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  instructionsTitle: {
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 8,
    fontFamily: FONTS.karmaFuture,
  },
  instructionsText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    lineHeight: 20,
    fontFamily: FONTS.terminalGrotesque,
  },
});

