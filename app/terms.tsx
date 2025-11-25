import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Linking } from 'react-native';
import { ArrowLeft, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.cleanGreen} />
        </TouchableOpacity>
        <Text style={styles.title}>Terms of Service</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Important Notice */}
        <View style={styles.noticeContainer}>
          <Text style={styles.noticeText}>
            ⚖️ Please read these terms carefully. By using this app, you agree to these terms.
          </Text>
        </View>

        {/* Terms Content */}
        <View style={styles.contentContainer}>
          <Text style={styles.sectionTitle}>1. Educational Purpose - Not Medical Advice</Text>
          <Text style={styles.sectionText}>
            This application is designed exclusively for educational purposes. The information provided 
            about ingredients is based on general research and educational opinions, not medical or 
            health advice. We make no medical claims or recommendations.
            {'\n\n'}The ingredient classifications and information provided by this app are NOT medical advice, 
            health advice, or nutritional guidance. Always consult qualified healthcare professionals, 
            registered dietitians, or medical doctors for dietary decisions, health concerns, food allergies 
            or sensitivities, and medical conditions requiring specific diets.
            {'\n\n'}By using this app, you acknowledge and agree that you are responsible for all dietary decisions, 
            you will not rely on this app for medical guidance, you understand individual dietary needs vary 
            significantly, and you will consult healthcare providers for personalized advice.
            {'\n\n'}We may modify or discontinue features of this app at any time. Continued use after changes 
            constitutes acceptance of those changes.
          </Text>

          <Text style={styles.sectionTitle}>2. Classification Meanings</Text>
          <Text style={styles.sectionText}>
            Our ingredient classifications are educational opinions only. In the app interface, we display simplified labels 'Clean' and 'Toxic' for clarity. These correspond to our full classifications: 'Clean' means 'Generally Clean' (ingredients widely accepted as safe), and 'Toxic' means 'Potentially Toxic' (ingredients that may have concerns based on research). Neither classification represents definitive health claims, and individual responses to ingredients may vary.
          </Text>

          <Text style={styles.sectionTitle}>3. Subscription Terms</Text>
          <Text style={styles.sectionText}>
            Free Tier (No payment required):
            {'\n'}• 10 total scans (lifetime limit)
            {'\n'}• Full ingredient analysis for all scans
            {'\n'}• Complete toxicity assessment
            {'\n'}• Scan history saved and accessible
            {'\n'}• All premium features during your 10 scans
            {'\n\n'}Premium Subscription ($4.99/month):
            {'\n'}• Unlimited analyses
            {'\n'}• Complete analysis history
            {'\n'}• Ad-free experience
            {'\n\n'}Payment Method: Premium subscriptions are processed via Apple In-App Purchase (managed through your Apple ID).
            {'\n\n'}Subscriptions auto-renew monthly unless cancelled. Cancel anytime through iPhone Settings → [Your Name] → Subscriptions → Health Freak → Cancel Subscription. 
          </Text>

          <Text style={styles.sectionTitle}>4. Privacy and Data Protection</Text>
          <Text style={styles.sectionText}>
            Our collection, use, and protection of your personal information is governed by our Privacy Policy. 
            Please review our Privacy Policy to understand how we handle your data. By using this app, you 
            also agree to our Privacy Policy.
          </Text>

          <Text style={styles.sectionTitle}>5. Refund Policy</Text>
          <Text style={styles.sectionText}>
            Premium subscriptions are billed monthly at $4.99. You may cancel your subscription at any time 
            through iPhone Settings → [Your Name] → Subscriptions → Health Freak → Cancel Subscription. 
            You will retain premium access until the end of your current billing period.
            {'\n\n'}All refund requests must be made directly through Apple via reportaproblem.apple.com 
            or through iPhone Settings → Apple ID → Subscriptions. We cannot process refunds for Apple IAP subscriptions directly.
          </Text>

          <Text style={styles.sectionTitle}>6. Disclaimers and Limitations</Text>
          <Text style={styles.sectionText}>
            This app is provided "as is" without warranties. We disclaim liability for:
            {'\n'}• Accuracy of ingredient information
            {'\n'}• Decisions made based on app content
            {'\n'}• Health outcomes related to dietary choices
            {'\n'}• Technical issues or service interruptions
          </Text>

          <Text style={styles.sectionTitle}>7. Acceptance of Terms</Text>
          <Text style={styles.sectionText}>
            By using this app, you agree to these Terms of Service. We may update these terms periodically, and continued use implies acceptance of changes.
          </Text>

          <Text style={styles.sectionTitle}>8. Governing Law and Contact</Text>
          <Text style={styles.sectionText}>
            These Terms are governed by California law. Disputes shall be resolved in California courts.
            {'\n\n'}For questions about these terms, contact us at support@healthfreak.io
          </Text>
        </View>

        {/* Bottom Notice */}
        <View style={styles.bottomNotice}>
          <Text style={styles.bottomNoticeText}>
            Last updated: November 24, 2025
            {'\n'}Effective Date: November 24, 2025
            {'\n\n'}Full Terms of Service available at:
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://healthfreak.io/terms.html')}>
            <Text style={styles.linkText}>https://healthfreak.io/terms.html</Text>
          </TouchableOpacity>
          <Text style={styles.bottomNoticeText}>
            {'\n'}Remember: This app provides educational information only. 
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
  linkText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.cleanGreen,
    textAlign: 'center',
    textDecorationLine: 'underline',
    lineHeight: LINE_HEIGHTS.bodySmall,
    fontFamily: FONTS.terminalGrotesque,
  },
});