import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X, CreditCard } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES } from '@/constants/typography';
import { useIAPPurchase } from '@/hooks/useIAPPurchase';
import { startPremiumSubscription } from '@/services/stripe';

interface PaymentMethodModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PaymentMethodModal({ visible, onClose, onSuccess }: PaymentMethodModalProps) {
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  
  const {
    isLoading: iapLoading,
    error: iapError,
    isSuccess: iapSuccess,
    purchaseSubscription,
  } = useIAPPurchase();

  const handleApplePurchase = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStripeError(null);
    await purchaseSubscription();
    
    // Auto-close after success
    if (iapSuccess) {
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    }
  };

  const handleStripePurchase = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStripeError(null);
    setStripeLoading(true);
    
    try {
      await startPremiumSubscription();
      // Stripe opens browser, so we close modal immediately
      onClose();
    } catch (error) {
      console.error('Stripe checkout error:', error);
      setStripeError(error instanceof Error ? error.message : 'Failed to start checkout');
    } finally {
      setStripeLoading(false);
    }
  };

  const handleClose = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const isAnyLoading = iapLoading || stripeLoading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      accessibilityLabel="Payment method selection modal"
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Choose Payment Method</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityLabel="Close modal"
              accessibilityRole="button"
            >
              <X size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Apple In-App Purchase Button */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[
                styles.paymentButton,
                styles.appleButton,
                isAnyLoading && styles.buttonDisabled,
              ]}
              onPress={handleApplePurchase}
              disabled={isAnyLoading}
              accessibilityLabel="Subscribe via App Store"
              accessibilityRole="button"
            >
              <View style={styles.buttonContent}>
                <Text style={styles.appleIcon}>🍎</Text>
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>App Store</Text>
                  <Text style={styles.buttonSubtitle}>Subscribe via Apple</Text>
                </View>
              </View>
              {iapLoading && <ActivityIndicator color={COLORS.white} />}
              {iapSuccess && <Text style={styles.successIcon}>✓</Text>}
            </TouchableOpacity>
          )}

          {iapError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{iapError}</Text>
            </View>
          )}

          {/* Web Payment Button */}
          <TouchableOpacity
            style={[
              styles.paymentButton,
              styles.stripeButton,
              isAnyLoading && styles.buttonDisabled,
            ]}
            onPress={handleStripePurchase}
            disabled={isAnyLoading}
            accessibilityLabel="Subscribe via credit card"
            accessibilityRole="button"
          >
            <View style={styles.buttonContent}>
              <CreditCard size={32} color={COLORS.white} />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Credit Card</Text>
                <Text style={styles.buttonSubtitle}>Subscribe via web</Text>
              </View>
            </View>
            {stripeLoading && <ActivityIndicator color={COLORS.white} />}
          </TouchableOpacity>

          {stripeError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{stripeError}</Text>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {Platform.OS === 'ios' 
                ? '🍎 App Store: Managed through Apple. Easy cancellation anytime.\n💳 Credit Card: Managed via Stripe. Cancel anytime online.'
                : '💳 Subscribe securely via Stripe. Cancel anytime online.'}
            </Text>
            <Text style={styles.priceText}>$10/month • Cancel anytime</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: COLORS.border,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 16,
    minHeight: 80,
  },
  appleButton: {
    backgroundColor: COLORS.textPrimary,
    borderColor: COLORS.textSecondary,
  },
  stripeButton: {
    backgroundColor: COLORS.cleanGreen,
    borderColor: COLORS.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  appleIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  buttonSubtitle: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 14,
    color: COLORS.white,
    opacity: 0.9,
  },
  successIcon: {
    fontSize: 24,
    color: COLORS.white,
  },
  errorContainer: {
    backgroundColor: '#ffe8e8',
    borderWidth: 2,
    borderColor: COLORS.toxicRed,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 14,
    color: COLORS.toxicRed,
    textAlign: 'center',
  },
  footer: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
  },
  footerText: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  priceText: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
});

