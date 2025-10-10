import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { XCircle, ArrowLeft, CreditCard } from 'lucide-react-native';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function SubscriptionCancelScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <XCircle size={80} color={COLORS.toxicRed} />
        <Text style={styles.title}>Subscription Cancelled</Text>
        <Text style={styles.subtitle}>
          No worries! You can upgrade to Premium anytime to unlock advanced features.
        </Text>
        
        <View style={styles.featuresList}>
          <Text style={styles.feature}>• Detailed ingredient explanations</Text>
          <Text style={styles.feature}>• Health impact information</Text>
          <Text style={styles.feature}>• Alternative product suggestions</Text>
          <Text style={styles.feature}>• Unlimited scan history</Text>
          <Text style={styles.feature}>• Export functionality</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.tryAgainButton} 
            onPress={() => router.replace('/(tabs)/profile')}
          >
            <CreditCard size={20} color={COLORS.white} />
            <Text style={styles.tryAgainButtonText}>Try Again</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.replace('/(tabs)/profile')}
          >
            <ArrowLeft size={20} color={COLORS.textSecondary} />
            <Text style={styles.backButtonText}>Back to Profile</Text>
          </TouchableOpacity>
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
  buttonContainer: {
    gap: 16,
    alignSelf: 'stretch',
  },
  tryAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accentBlue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  tryAgainButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  backButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
});
