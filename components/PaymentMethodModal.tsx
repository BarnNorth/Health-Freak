import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import Svg, { Path, Rect, Polygon } from 'react-native-svg';
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
                <Svg width={32} height={32} viewBox="0 0 20.3125 26.3379" style={styles.appleIcon}>
                  <Rect height="26.3379" opacity="0" width="20.3125" x="0" y="0"/>
                  <Path 
                    d="M14.7363 6.03516C12.8516 6.03516 11.3281 7.17773 10.3418 7.17773C9.29688 7.17773 7.92969 6.03516 6.28906 6.03516C3.18359 6.03516 0.0292969 8.67188 0.0292969 13.5156C0.0292969 16.543 1.19141 19.7266 2.63672 21.7773C3.87695 23.5156 4.95117 24.9219 6.51367 24.9219C8.05664 24.9219 8.73047 23.9258 10.6445 23.9258C12.5977 23.9258 13.0273 24.9219 14.7363 24.9219C16.4258 24.9219 17.5488 23.3789 18.6133 21.8457C19.8047 20.0977 20.3027 18.3887 20.3125 18.3105C20.2148 18.2715 16.9824 16.9531 16.9824 13.2617C16.9824 10.0586 19.5312 8.62305 19.668 8.51562C17.998 6.10352 15.4395 6.03516 14.7363 6.03516ZM13.8477 3.99414C14.6191 3.05664 15.166 1.78711 15.166 0.498047C15.166 0.322266 15.1562 0.146484 15.1172 0C13.8672 0.0488281 12.3535 0.839844 11.4551 1.9043C10.7422 2.70508 10.0879 3.99414 10.0879 5.2832C10.0879 5.46875 10.1172 5.66406 10.1367 5.73242C10.2148 5.74219 10.3418 5.76172 10.4688 5.76172C11.6016 5.76172 13.0176 5.00977 13.8477 3.99414Z" 
                    fill={COLORS.textPrimary} 
                    fillOpacity="0.85"
                  />
                </Svg>
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>Subscribe with Apple</Text>
                  <Text style={styles.buttonSubtitle}>Billed through App Store</Text>
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
              <CreditCard size={32} color={COLORS.textPrimary} style={styles.creditCardIcon} />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Subscribe with Stripe</Text>
                <View style={styles.stripeBadgeContainer}>
                  <Svg width={120} height={27} viewBox="0 0 150 34" style={styles.stripeBadge}>
                    <Path 
                      d="M146,0H3.73A3.73,3.73,0,0,0,0,3.73V30.27A3.73,3.73,0,0,0,3.73,34H146a4,4,0,0,0,4-4V4A4,4,0,0,0,146,0Zm3,30a3,3,0,0,1-3,3H3.73A2.74,2.74,0,0,1,1,30.27V3.73A2.74,2.74,0,0,1,3.73,1H146a3,3,0,0,1,3,3Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M17.07,11.24h-4.3V22h1.92V17.84h2.38c2.4,0,3.9-1.16,3.9-3.3S19.47,11.24,17.07,11.24Zm-.1,5H14.69v-3.3H17c1.38,0,2.11.59,2.11,1.65S18.35,16.19,17,16.19Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M25.1,14a3.77,3.77,0,0,0-3.8,4.09,3.81,3.81,0,1,0,7.59,0A3.76,3.76,0,0,0,25.1,14Zm0,6.67c-1.22,0-2-1-2-2.58s.76-2.58,2-2.58,2,1,2,2.58S26.31,20.66,25.1,20.66Z" 
                      fill="#635bff"
                    />
                    <Polygon 
                      points="36.78 19.35 35.37 14.13 33.89 14.13 32.49 19.35 31.07 14.13 29.22 14.13 31.59 22.01 33.15 22.01 34.59 16.85 36.03 22.01 37.59 22.01 39.96 14.13 38.18 14.13 36.78 19.35" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M44,14a3.83,3.83,0,0,0-3.75,4.09,3.79,3.79,0,0,0,3.83,4.09A3.47,3.47,0,0,0,47.49,20L46,19.38a1.78,1.78,0,0,1-1.83,1.26A2.12,2.12,0,0,1,42,18.47h5.52v-.6C47.54,15.71,46.32,14,44,14Zm-1.93,3.13A1.92,1.92,0,0,1,44,15.5a1.56,1.56,0,0,1,1.69,1.62Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M50.69,15.3V14.13h-1.8V22h1.8V17.87a1.89,1.89,0,0,1,2-2,4.68,4.68,0,0,1,.66,0v-1.8c-.14,0-.3,0-.51,0A2.29,2.29,0,0,0,50.69,15.3Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M57.48,14a3.83,3.83,0,0,0-3.75,4.09,3.79,3.79,0,0,0,3.83,4.09A3.47,3.47,0,0,0,60.93,20l-1.54-.59a1.78,1.78,0,0,1-1.83,1.26,2.12,2.12,0,0,1-2.1-2.17H61v-.6C61,15.71,59.76,14,57.48,14Zm-1.93,3.13a1.92,1.92,0,0,1,1.92-1.62,1.56,1.56,0,0,1,1.69,1.62Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M67.56,15a2.85,2.85,0,0,0-2.26-1c-2.21,0-3.47,1.85-3.47,4.09s1.26,4.09,3.47,4.09a2.82,2.82,0,0,0,2.26-1V22h1.8V11.24h-1.8Zm0,3.35a2,2,0,0,1-2,2.28c-1.31,0-2-1-2-2.52s.7-2.52,2-2.52c1.11,0,2,.81,2,2.29Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M79.31,14A2.88,2.88,0,0,0,77,15V11.24h-1.8V22H77v-.83a2.86,2.86,0,0,0,2.27,1c2.2,0,3.46-1.86,3.46-4.09S81.51,14,79.31,14ZM79,20.6a2,2,0,0,1-2-2.28v-.47c0-1.48.84-2.29,2-2.29,1.3,0,2,1,2,2.52S80.25,20.6,79,20.6Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M86.93,19.66,85,14.13H83.1L86,21.72l-.3.74a1,1,0,0,1-1.14.79,4.12,4.12,0,0,1-.6,0v1.51a4.62,4.62,0,0,0,.73.05,2.67,2.67,0,0,0,2.78-2l3.24-8.62H88.82Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M125,12.43a3,3,0,0,0-2.13.87l-.14-.69h-2.39V25.53l2.72-.59V21.81a3,3,0,0,0,1.93.7c1.94,0,3.72-1.59,3.72-5.11C128.71,14.18,126.91,12.43,125,12.43Zm-.65,7.63a1.61,1.61,0,0,1-1.28-.52l0-4.11a1.64,1.64,0,0,1,1.3-.55c1,0,1.68,1.13,1.68,2.58S125.36,20.06,124.35,20.06Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M133.73,12.43c-2.62,0-4.21,2.26-4.21,5.11,0,3.37,1.88,5.08,4.56,5.08a6.12,6.12,0,0,0,3-.73V19.64a5.79,5.79,0,0,1-2.7.62c-1.08,0-2-.39-2.14-1.7h5.38c0-.15,0-.74,0-1C137.71,14.69,136.35,12.43,133.73,12.43Zm-1.47,4.07c0-1.26.77-1.79,1.45-1.79s1.4.53,1.4,1.79Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M113,13.36l-.17-.82h-2.32v9.71h2.68V15.67a1.87,1.87,0,0,1,2.05-.58V12.54A1.8,1.8,0,0,0,113,13.36Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M99.46,15.46c0-.44.36-.61.93-.61a5.9,5.9,0,0,1,2.7.72V12.94a7,7,0,0,0-2.7-.51c-2.21,0-3.68,1.18-3.68,3.16,0,3.1,4.14,2.6,4.14,3.93,0,.52-.44.69-1,.69a6.78,6.78,0,0,1-3-.9V22a7.38,7.38,0,0,0,3,.64c2.26,0,3.82-1.15,3.82-3.16C103.62,16.12,99.46,16.72,99.46,15.46Z" 
                      fill="#635bff"
                    />
                    <Path 
                      d="M107.28,10.24l-2.65.58v8.93a2.77,2.77,0,0,0,2.82,2.87,4.16,4.16,0,0,0,1.91-.37V20c-.35.15-2.06.66-2.06-1V15h2.06V12.66h-2.06Z" 
                      fill="#635bff"
                    />
                    <Polygon 
                      points="116.25 11.7 118.98 11.13 118.98 8.97 116.25 9.54 116.25 11.7" 
                      fill="#635bff"
                    />
                    <Rect x="116.25" y="12.61" width="2.73" height="9.64" fill="#635bff"/>
                  </Svg>
                </View>
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
            <Text style={styles.priceText}>$6.99/month • Cancel anytime</Text>
            
            {/* Legal Links - Required for Apple App Store Compliance */}
            <View style={styles.legalLinks}>
              <Text style={styles.legalText}>By subscribing, you agree to our </Text>
              <TouchableOpacity 
                onPress={() => Linking.openURL('https://healthfreak.io/terms.html')}
              >
                <Text style={styles.linkText}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={styles.legalText}> and </Text>
              <TouchableOpacity 
                onPress={() => Linking.openURL('https://healthfreak.io/privacy.html')}
              >
                <Text style={styles.linkText}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
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
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
  },
  stripeButton: {
    backgroundColor: COLORS.background,
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
    marginRight: 16,
  },
  creditCardIcon: {
    marginRight: 16,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  buttonSubtitle: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 14,
    color: COLORS.textSecondary,
    opacity: 0.9,
  },
  successIcon: {
    fontSize: 24,
    color: COLORS.textPrimary,
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
  stripeBadgeContainer: {
    marginTop: 4,
  },
  stripeBadge: {
    opacity: 0.9,
  },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  legalText: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  linkText: {
    fontFamily: FONTS.terminalGrotesque,
    fontSize: 11,
    color: COLORS.cleanGreen,
    textDecorationLine: 'underline',
    lineHeight: 16,
  },
});

