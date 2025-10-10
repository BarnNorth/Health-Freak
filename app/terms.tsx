import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { ArrowLeft, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={COLORS.cleanGreen} />
          </TouchableOpacity>
          <Text style={styles.title}>Terms of Service</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Important Notice */}
        <View style={styles.noticeContainer}>
          <Text style={styles.noticeText}>
            ⚖️ Please read these terms carefully. By using this app, you agree to these terms.
          </Text>
        </View>

        {/* Terms Content */}
        <View style={styles.contentContainer}>
          <Text style={styles.sectionTitle}>1. Educational Purpose Only</Text>
          <Text style={styles.sectionText}>
            This application is designed exclusively for educational purposes. The information provided 
            about ingredients is based on general research and educational opinions, not medical or 
            health advice. We make no medical claims or recommendations.
          </Text>

          <Text style={styles.sectionTitle}>2. Not Medical Advice</Text>
          <Text style={styles.sectionText}>
            The ingredient classifications and information provided by this app are NOT medical advice, 
            health advice, or nutritional guidance. Always consult qualified healthcare professionals, 
            registered dietitians, or medical doctors for:
            {'\n'}• Dietary decisions
            {'\n'}• Health concerns
            {'\n'}• Food allergies or sensitivities
            {'\n'}• Medical conditions requiring specific diets
          </Text>

          <Text style={styles.sectionTitle}>3. User Responsibility</Text>
          <Text style={styles.sectionText}>
            By using this app, you acknowledge and agree that:
            {'\n'}• You are responsible for all dietary decisions
            {'\n'}• You will not rely on this app for medical guidance
            {'\n'}• You understand individual dietary needs vary significantly
            {'\n'}• You will consult healthcare providers for personalized advice
          </Text>

          <Text style={styles.sectionTitle}>4. Classification Meanings</Text>
          <Text style={styles.sectionText}>
            Our ingredient classifications are educational opinions only:
            {'\n'}• "Generally Clean" indicates ingredients widely accepted as safe
            {'\n'}• "Potentially Toxic" indicates possible concerns based on research
            {'\n'}• Neither classification represents definitive health claims
            {'\n'}• Individual responses to ingredients may vary
          </Text>

          <Text style={styles.sectionTitle}>5. Subscription Terms</Text>
          <Text style={styles.sectionText}>
            Free users receive 5 analyses per month. Premium subscription ($9.99/month) provides:
            {'\n'}• Unlimited analyses
            {'\n'}• Complete analysis history
            {'\n'}• Priority support
            {'\n'}• Ad-free experience
            {'\n\n'}Subscriptions auto-renew monthly unless cancelled. Cancel anytime in your account settings.
          </Text>

          <Text style={styles.sectionTitle}>6. Data Privacy</Text>
          <Text style={styles.sectionText}>
            We collect minimal data necessary for app functionality. Photos are processed for OCR 
            text extraction but not stored permanently. Analysis history is stored securely and 
            associated with your account. See our Privacy Policy for complete details.
          </Text>

          <Text style={styles.sectionTitle}>7. Disclaimers and Limitations</Text>
          <Text style={styles.sectionText}>
            This app is provided "as is" without warranties. We disclaim liability for:
            {'\n'}• Accuracy of ingredient information
            {'\n'}• Decisions made based on app content
            {'\n'}• Health outcomes related to dietary choices
            {'\n'}• Technical issues or service interruptions
          </Text>

          <Text style={styles.sectionTitle}>8. Acceptance of Terms</Text>
          <Text style={styles.sectionText}>
            Continued use of this app constitutes acceptance of these terms. We may update these 
            terms periodically, and continued use implies acceptance of any changes.
          </Text>

          <Text style={styles.sectionTitle}>9. Contact Information</Text>
          <Text style={styles.sectionText}>
            Questions about these terms? Contact us at support@ingredientanalyzer.com
          </Text>
        </View>

        {/* Bottom Notice */}
        <View style={styles.bottomNotice}>
          <Text style={styles.bottomNoticeText}>
            Last updated: January 24, 2025
            {'\n\n'}Remember: This app provides educational information only. 
            Always consult healthcare professionals for dietary and health decisions.
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
    padding: 8,
  },
  title: {
    fontSize: FONT_SIZES.titleLarge,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleLarge,
  },
  placeholder: {
    width: 40,
  },
  noticeContainer: {
    backgroundColor: COLORS.accentYellow,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  noticeText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
    textAlign: 'center',
  },
  contentContainer: {
    backgroundColor: COLORS.background,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.titleMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginTop: 20,
    marginBottom: 12,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleMedium,
  },
  sectionText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: LINE_HEIGHTS.bodySmall,
    marginBottom: 8,
    fontFamily: FONTS.terminalGrotesque,
  },
  bottomNotice: {
    backgroundColor: COLORS.background,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  bottomNoticeText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.bodySmall,
    fontFamily: FONTS.terminalGrotesque,
  },
});