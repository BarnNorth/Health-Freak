import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, Linking, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Mail, ArrowLeft, RefreshCw, CheckCircle } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function EmailConfirmationScreen() {
  const [email, setEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { email: emailParam } = useLocalSearchParams();
  const { resendConfirmation } = useAuth();

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam as string);
    }
  }, [emailParam]);

  useEffect(() => {
    // Start cooldown timer
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    if (!email) {
      Alert.alert('Error', 'Email address not found');
      return;
    }

    setIsResending(true);
    try {
      await resendConfirmation(email);
      Alert.alert('Success', 'Confirmation email sent! Please check your inbox.');
      setResendCooldown(60); // 60 second cooldown
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resend confirmation email');
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToSignUp = () => {
    router.back();
  };

  const handleOpenEmailApp = async () => {
    try {
      // Try multiple approaches to open email app
      const emailApps = [
        // iOS Mail app
        'message://',
        // Gmail app
        'googlegmail://',
        // Outlook app
        'ms-outlook://',
        // Generic mailto (works on both platforms)
        `mailto:${email}`,
      ];

      let opened = false;
      
      for (const appUrl of emailApps) {
        try {
          const canOpen = await Linking.canOpenURL(appUrl);
          if (canOpen) {
            await Linking.openURL(appUrl);
            opened = true;
            break;
          }
        } catch (error) {
          // Continue to next app
          continue;
        }
      }

      if (!opened) {
        // If no email app could be opened, show instructions
        Alert.alert(
          'Open Email App',
          'Please open your email app manually to check for the confirmation email.',
          [
            { text: 'OK', style: 'default' },
            { text: 'Resend Email', onPress: handleResendEmail }
          ]
        );
      }
    } catch (error) {
      console.error('Error opening email app:', error);
      Alert.alert(
        'Error',
        'Could not open email app. Please check your email manually.',
        [
          { text: 'OK', style: 'default' },
          { text: 'Resend Email', onPress: handleResendEmail }
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackToSignUp}>
          <ArrowLeft size={24} color={COLORS.cleanGreen} />
        </TouchableOpacity>
        <Text style={styles.title}>Verify Your Email</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Mail size={64} color={COLORS.cleanGreen} />
        </View>

        {/* Main Message */}
        <Text style={styles.mainTitle}>Check Your Email</Text>
        <Text style={styles.subtitle}>
          We've sent a confirmation link to:
        </Text>
        <Text style={styles.emailText}>{email}</Text>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>Next Steps:</Text>
          <View style={styles.instructionItem}>
            <CheckCircle size={16} color={COLORS.cleanGreen} />
            <Text style={styles.instructionText}>Check your email inbox</Text>
          </View>
          <View style={styles.instructionItem}>
            <CheckCircle size={16} color={COLORS.cleanGreen} />
            <Text style={styles.instructionText}>Look in spam/junk folder if not found</Text>
          </View>
          <View style={styles.instructionItem}>
            <CheckCircle size={16} color={COLORS.cleanGreen} />
            <Text style={styles.instructionText}>Click the confirmation link</Text>
          </View>
          <View style={styles.instructionItem}>
            <CheckCircle size={16} color={COLORS.cleanGreen} />
            <Text style={styles.instructionText}>Return to the app to sign in</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleOpenEmailApp}>
            <Mail size={20} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>Open Email App</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.secondaryButton, (isResending || resendCooldown > 0) && styles.secondaryButtonDisabled]} 
            onPress={handleResendEmail}
            disabled={isResending || resendCooldown > 0}
          >
            <RefreshCw size={16} color={resendCooldown > 0 ? COLORS.gray : COLORS.cleanGreen} />
            <Text style={[styles.secondaryButtonText, resendCooldown > 0 && styles.secondaryButtonTextDisabled]}>
              {isResending 
                ? 'Sending...' 
                : resendCooldown > 0 
                  ? `Resend in ${resendCooldown}s` 
                  : 'Resend Email'
              }
            </Text>
          </TouchableOpacity>
        </View>

        {/* Help Text */}
        <View style={styles.helpContainer}>
          <Text style={styles.helpText}>
            Didn't receive the email? Check your spam folder or try resending.
          </Text>
          <Text style={styles.helpText}>
            Make sure you entered the correct email address.
          </Text>
        </View>
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
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  mainTitle: {
    fontSize: FONT_SIZES.titleMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleMedium,
  },
  subtitle: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  emailText: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    color: COLORS.cleanGreen,
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  instructionsContainer: {
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginBottom: 32,
    width: '100%',
  },
  instructionsTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructionText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    marginLeft: 12,
    flex: 1,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: COLORS.cleanGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    marginLeft: 8,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.cleanGreen,
  },
  secondaryButtonDisabled: {
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.cleanGreen,
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    marginLeft: 6,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  secondaryButtonTextDisabled: {
    color: COLORS.gray,
  },
  helpContainer: {
    backgroundColor: COLORS.accentYellow,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    width: '100%',
  },
  helpText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.bodyMedium,
    marginBottom: 4,
    fontFamily: FONTS.terminalGrotesque,
  },
});
