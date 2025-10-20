import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { ChevronLeft, CreditCard, Calendar, Zap, Settings, AlertCircle } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionInfo, cancelSubscription, SubscriptionInfo } from '@/services/subscription';
import { openAppleSubscriptions } from '@/utils/deeplinks';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function ManageSubscriptionScreen() {
  const { user, refreshUserProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    loadSubscriptionInfo();
  }, [user]);

  const loadSubscriptionInfo = async () => {
    if (!user) {
      router.back();
      return;
    }

    try {
      setLoading(true);
      const info = await getSubscriptionInfo(user.id);
      
      if (!info || !info.isActive) {
        Alert.alert(
          'No Active Subscription',
          'You do not have an active subscription.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }
      
      setSubscriptionInfo(info);
    } catch (error) {
      console.error('[MANAGE_SUB] Error loading subscription:', error);
      Alert.alert(
        'Error',
        'Failed to load subscription information. Please try again.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;

    Alert.alert(
      'Cancel Subscription?',
      'Your subscription will remain active until the end of your billing period. Are you sure you want to cancel?',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancelling(true);
              const result = await cancelSubscription(user.id);
              
              if (result.success && !result.instructions) {
                Alert.alert(
                  'Subscription Cancelled',
                  'Your subscription has been cancelled and will remain active until the end of your billing period.',
                  [{ 
                    text: 'OK', 
                    onPress: () => {
                      refreshUserProfile();
                      router.back();
                    }
                  }]
                );
              } else if (!result.success) {
                Alert.alert('Error', result.error || 'Failed to cancel subscription');
              }
            } catch (error) {
              console.error('[MANAGE_SUB] Error cancelling subscription:', error);
              Alert.alert('Error', 'Failed to cancel subscription. Please try again.');
            } finally {
              setCancelling(false);
            }
          }
        }
      ]
    );
  };

  const handleManageAppleSubscription = async () => {
    const opened = await openAppleSubscriptions();
    if (!opened) {
      // Instructions are shown automatically by the utility
      console.log('[MANAGE_SUB] Deep link failed, showing manual instructions');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Subscription</Text>
          <View style={styles.backButton} />
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.cleanGreen} />
          <Text style={styles.loadingText}>Loading subscription info...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!subscriptionInfo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Subscription</Text>
          <View style={styles.backButton} />
        </View>
        
        <View style={styles.emptyContainer}>
          <AlertCircle size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>No active subscription found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isStripe = subscriptionInfo.paymentMethod === 'stripe';
  const renewalDateStr = subscriptionInfo.renewalDate 
    ? new Date(subscriptionInfo.renewalDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'Not available';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Subscription</Text>
          <View style={styles.backButton} />
        </View>

        {/* Subscription Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.planHeader}>
            <Zap size={24} color={COLORS.cleanGreen} />
            <Text style={styles.planTitle}>Premium Monthly</Text>
          </View>

          <Text style={styles.priceText}>$10/month</Text>

          <View style={styles.detailsSection}>
            {/* Payment Method */}
            <View style={styles.detailRow}>
              <CreditCard size={20} color={COLORS.textSecondary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Payment Method</Text>
                <Text style={styles.detailValue}>
                  {isStripe ? '💳 Stripe' : '🍎 Apple In-App Purchase'}
                </Text>
              </View>
            </View>

            {/* Renewal Date */}
            <View style={styles.detailRow}>
              <Calendar size={20} color={COLORS.textSecondary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>
                  {subscriptionInfo.cancelsAtPeriodEnd ? 'Expires On' : 'Renews On'}
                </Text>
                <Text style={styles.detailValue}>{renewalDateStr}</Text>
              </View>
            </View>

            {/* Status */}
            <View style={styles.statusRow}>
              <View style={[
                styles.statusBadge, 
                subscriptionInfo.cancelsAtPeriodEnd ? styles.cancellingBadge : styles.activeBadge
              ]}>
                <Text style={[
                  styles.statusText,
                  subscriptionInfo.cancelsAtPeriodEnd ? styles.cancellingText : styles.activeText
                ]}>
                  {subscriptionInfo.cancelsAtPeriodEnd ? '⚠️ Cancelling' : '✅ Active'}
                </Text>
              </View>
            </View>

            {subscriptionInfo.cancelsAtPeriodEnd && (
              <View style={styles.warningBox}>
                <AlertCircle size={16} color={COLORS.accentYellow} />
                <Text style={styles.warningText}>
                  Your subscription will end on {renewalDateStr}. You can continue using premium features until then.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {isStripe ? (
            // Stripe: Show cancel button
            !subscriptionInfo.cancelsAtPeriodEnd && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.cancelButton]} 
                onPress={handleCancelSubscription}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color={COLORS.toxicRed} />
                ) : (
                  <>
                    <AlertCircle size={20} color={COLORS.toxicRed} />
                    <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
                  </>
                )}
              </TouchableOpacity>
            )
          ) : (
            // Apple IAP: Show Settings button
            <TouchableOpacity 
              style={[styles.actionButton, styles.settingsButton]} 
              onPress={handleManageAppleSubscription}
            >
              <Settings size={20} color={COLORS.cleanGreen} />
              <Text style={styles.settingsButtonText}>Manage in iPhone Settings</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Educational Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            {isStripe ? (
              'Cancelling your subscription will stop future billing. You can continue using premium features until the end of your current billing period.'
            ) : (
              'Apple subscriptions are managed through your iPhone Settings. You can cancel or modify your subscription there at any time.'
            )}
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
    lineHeight: LINE_HEIGHTS.titleMedium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textSecondary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  detailsCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 24,
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
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  planTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginLeft: 8,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  priceText: {
    fontSize: FONT_SIZES.titleMedium,
    fontWeight: '400',
    color: COLORS.cleanGreen,
    marginBottom: 20,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleMedium,
  },
  detailsSection: {
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  detailValue: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textPrimary,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  statusRow: {
    marginTop: 8,
  },
  statusBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 2,
    alignSelf: 'flex-start',
  },
  activeBadge: {
    backgroundColor: COLORS.cleanGreen + '20',
    borderColor: COLORS.cleanGreen,
  },
  cancellingBadge: {
    backgroundColor: COLORS.accentYellow + '20',
    borderColor: COLORS.accentYellow,
  },
  statusText: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  activeText: {
    color: COLORS.cleanGreen,
  },
  cancellingText: {
    color: COLORS.textPrimary,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.accentYellow + '20',
    padding: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.accentYellow,
    marginTop: 8,
  },
  warningText: {
    flex: 1,
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  actionsContainer: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  cancelButton: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.toxicRed,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    color: COLORS.toxicRed,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  settingsButton: {
    backgroundColor: COLORS.cleanGreen,
    borderColor: COLORS.border,
  },
  settingsButtonText: {
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    color: COLORS.background,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  disclaimer: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  disclaimerText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
});

