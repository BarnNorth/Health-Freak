import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { ArrowLeft, Shield } from 'lucide-react-native';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.cleanGreen} />
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Important Notice */}
        <View style={styles.noticeContainer}>
          <Text style={styles.noticeText}>
            🛡️ Your privacy matters to us. This policy explains how we collect, use, and protect your data.
          </Text>
        </View>

        {/* Privacy Content */}
        <View style={styles.contentContainer}>
          <Text style={styles.sectionTitle}>1. Information We Collect</Text>
          <Text style={styles.sectionText}>
            We collect the following information to provide and improve our services:
            {'\n'}• Camera permission for real-time scanning of ingredient labels on food products
            {'\n'}• User account information (email address for authentication via Supabase)
            {'\n'}• Scan history and ingredient analysis results
            {'\n'}• Subscription status and payment information (processed via Stripe)
            {'\n'}• Device information and app usage data for improving functionality
          </Text>

          <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
          <Text style={styles.sectionText}>
            Your information is used exclusively to provide and enhance our services:
            {'\n'}• Analyze ingredient photos in real-time using OpenAI API (photos retained for up to 30 days, then permanently deleted)
            {'\n'}• Store your scan history and analysis results in Supabase database
            {'\n'}• Process subscription payments securely through Stripe
            {'\n'}• Authenticate your account and maintain your session
            {'\n'}• Improve app functionality and user experience
          </Text>

          <Text style={styles.sectionTitle}>3. Third-Party Services and Data Sharing</Text>
          <Text style={styles.sectionText}>
            We use trusted third-party services to operate our app:
            {'\n'}• OpenAI: Ingredient photo analysis and classification. Images are processed and retained for up to 30 days for security and abuse prevention, then permanently deleted. OpenAI does not use your data to train their models.
            {'\n'}• Supabase: Secure data storage, authentication, and database services
            {'\n'}• Stripe: Payment processing for premium subscriptions
            {'\n\n'}Important: We do not sell your personal information to third parties. Your data is shared only with these essential service providers to deliver app functionality.
          </Text>

          <Text style={styles.sectionTitle}>4. Data Storage and Security</Text>
          <Text style={styles.sectionText}>
            We implement industry-standard security measures to protect your data:
            {'\n'}• Your data is stored securely in Supabase cloud infrastructure
            {'\n'}• Industry-standard encryption for data transmission
            {'\n'}• Secure authentication practices
            {'\n'}• Access controls to ensure only you can view your scan history
            {'\n\n'}While we take security seriously, no method of transmission over the internet is 100% secure. We continuously work to protect your information.
          </Text>

          <Text style={styles.sectionTitle}>5. Your Data Rights</Text>
          <Text style={styles.sectionText}>
            You have full control over your personal data:
            {'\n'}• Access your data: View all your scan history in the app
            {'\n'}• Delete your data: Request account deletion by contacting support
            {'\n'}• Export your data: Request a copy of your data
            {'\n'}• Cancel subscription: Manage in app settings at any time
            {'\n\n'}To exercise these rights, contact us at healthfreak.ai@gmail.com
          </Text>

          <Text style={styles.sectionTitle}>6. Photo and Camera Usage</Text>
          <Text style={styles.sectionText}>
            Your camera is used solely for ingredient label scanning:
            {'\n'}• Camera is used only for real-time ingredient label scanning
            {'\n'}• Photos are not stored in our systems
            {'\n'}• You control when the camera is activated
            {'\n'}• No access to your device's photo library
            {'\n\n'}Images are sent to OpenAI for analysis and retained for up to 30 days for security and abuse prevention, then permanently deleted. We do not retain copies of your photos.
          </Text>

          <Text style={styles.sectionTitle}>7. Data Retention</Text>
          <Text style={styles.sectionText}>
            We retain your data according to the following policies:
            {'\n'}• Premium users: Scan history retained indefinitely while subscription is active
            {'\n'}• Free tier users: Analysis data older than 365 days may be automatically deleted as part of our data retention policy
            {'\n'}• Deleted accounts: All personal data removed within 30 days
            {'\n'}• Legal compliance: Some data may be retained as required by law
            {'\n\n'}You can request account deletion at any time by contacting support.
          </Text>

          <Text style={styles.sectionTitle}>8. Children's Privacy</Text>
          <Text style={styles.sectionText}>
            This app is not intended for use by children under 13 years of age. We do not knowingly collect information from children under 13. If we discover that we have collected personal information from a child under 13, we will delete that information immediately. If you believe we have collected information from a child under 13, please contact us at healthfreak.ai@gmail.com. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately at healthfreak.ai@gmail.com and we will delete such information from our systems.
          </Text>

          <Text style={styles.sectionTitle}>9. Changes to This Privacy Policy</Text>
          <Text style={styles.sectionText}>
            We may update this privacy policy periodically to reflect changes in our practices or legal requirements:
            {'\n'}• We may update this policy periodically
            {'\n'}• Significant changes will be notified via email or in-app notification
            {'\n'}• Continued use after changes constitutes acceptance
            {'\n\n'}We encourage you to review this policy regularly to stay informed about how we protect your information.
          </Text>

          <Text style={styles.sectionTitle}>10. Contact Us</Text>
          <Text style={styles.sectionText}>
            If you have questions, concerns, or requests regarding this privacy policy or your personal data, please contact us:
            {'\n\n'}Email: healthfreak.ai@gmail.com
            {'\n\n'}For privacy concerns, data requests, or questions about this policy, we will respond to your inquiry as soon as possible.
          </Text>

          <Text style={styles.sectionTitle}>11. California Privacy Rights</Text>
          <Text style={styles.sectionText}>
            If you are a California resident, you have specific rights under the California Consumer Privacy Act (CCPA):
            {'\n'}• Right to Know: Request information about the personal data we have collected about you in the past 12 months
            {'\n'}• Right to Delete: Request deletion of your personal data, subject to certain exceptions
            {'\n'}• Right to Opt-Out: Opt-out of the sale of your personal data (note: we do not sell your personal data)
            {'\n'}• Right to Non-Discrimination: Exercise your privacy rights without receiving discriminatory treatment
            {'\n\n'}To exercise any of these rights, please email us at healthfreak.ai@gmail.com with "California Privacy Request" in the subject line. We will respond to your request within 45 days as required by law.
          </Text>
        </View>

        {/* Bottom Notice */}
        <View style={styles.bottomNotice}>
          <Text style={styles.bottomNoticeText}>
            Last updated: October 18, 2025
            {'\n\n'}Your privacy and data security are important to us. 
            If you have any concerns, please don't hesitate to reach out.
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

