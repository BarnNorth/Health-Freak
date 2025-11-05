import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { ChevronLeft, CreditCard, Calendar, Zap, AlertCircle } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionInfo, cancelSubscription, SubscriptionInfo } from '@/services/subscription';
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


  const handleCancelSubscription = async (instant: boolean = false) => {
    if (!user) return;

    const message = instant
      ? '⚡ DEV MODE: This will cancel your subscription IMMEDIATELY and you will lose premium access right away. Perfect for testing the checkout flow again.'
      : 'Your subscription will remain active until the end of your billing period. Are you sure you want to cancel?';

    const buttonText = instant ? '⚡ Cancel Instantly (DEV)' : 'Cancel Subscription';

    Alert.alert(
      'Cancel Subscription?',
      message,
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: buttonText,
          style: 'destructive',
          onPress: async () => {
            try {
              setCancelling(true);
              const result = await cancelSubscription(user.id, instant);
              
              if (result.success && !result.instructions) {
                const successMessage = instant
                  ? '⚡ Your subscription has been cancelled immediately. You are now a free user and can test the checkout flow again!'
                  : 'Your subscription has been cancelled and will remain active until the end of your billing period.';
                
                Alert.alert(
                  'Subscription Cancelled',
                  successMessage,
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

  // Fix 6: Defensive check for invalid state (active subscription with no payment method)
  if (subscriptionInfo.isActive && !subscriptionInfo.paymentMethod) {
    console.error('[MANAGE_SUB] Invalid state: active subscription with no payment method');
    Alert.alert(
      'Subscription Error',
      'There is an issue with your subscription data. Please try refreshing or contact support@healthfreak.io.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.cleanGreen} />
        </View>
      </SafeAreaView>
    );
  }

  // Fix 4: Explicit null check for payment method
  if (!subscriptionInfo.paymentMethod) {
    Alert.alert(
      'Subscription Error',
      'Unable to determine payment method. Please contact support@healthfreak.io.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.cleanGreen} />
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

          <View style={styles.detailRow}>
            <View style={styles.iconPlaceholder} />
            <View style={styles.detailContent}>
              <Text style={styles.priceText}>$10/month</Text>
            </View>
          </View>

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
            // Stripe: Show cancel button(s)
            !subscriptionInfo.cancelsAtPeriodEnd && (
              <>
                {/* Normal cancellation */}
                <TouchableOpacity 
                  style={[styles.actionButton, styles.cancelButton]} 
                  onPress={() => handleCancelSubscription(false)}
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
                
                {/* DEV ONLY: Instant cancellation */}
                {__DEV__ && (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.devCancelButton]} 
                    onPress={() => handleCancelSubscription(true)}
                    disabled={cancelling}
                  >
                    {cancelling ? (
                      <ActivityIndicator size="small" color={COLORS.accentYellow} />
                    ) : (
                      <>
                        <AlertCircle size={20} color={COLORS.accentYellow} />
                        <Text style={styles.devCancelButtonText}>⚡ DEV: Cancel Instantly</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

              </>
            )
          ) : null}
        </View>

        {/* Educational Disclaimer */}
        <View style={styles.disclaimer}>
          {isStripe ? (
            <Text style={styles.disclaimerText}>
              Cancelling your subscription will stop future billing. You can continue using premium features until the end of your current billing period.
            </Text>
          ) : (
            <>
              <Text style={styles.disclaimerTitle}>How to Cancel</Text>
              <Text style={styles.disclaimerInstructionsText}>
                1. Open the Settings app{'\n'}
                2. Tap your name at the top{'\n'}
                3. Tap Subscriptions{'\n'}
                4. Tap Health Freak{'\n'}
                5. Tap Cancel Subscription
              </Text>
            </>
          )}
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
    fontSize: FONT_SIZES.titleLarge,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleLarge,
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
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    marginLeft: 8,
    marginBottom: 4,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  priceText: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textPrimary,
    fontWeight: '400',
    marginBottom: 20,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  detailsSection: {
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconPlaceholder: {
    width: 20,
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
    gap: 12,
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
  devCancelButton: {
    backgroundColor: COLORS.accentYellow,
    borderColor: COLORS.border,
  },
  devCancelButtonText: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
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
  disclaimerTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 12,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
    textAlign: 'center',
  },
  disclaimerText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  disclaimerInstructionsText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'left',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
});

