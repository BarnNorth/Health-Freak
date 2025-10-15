import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Info, ArrowLeft, Crown, Zap, ThumbsUp, ThumbsDown } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { showPremiumUpgradePrompt, getIngredientCounts } from '@/services/subscription';
import { submitIngredientFeedback, getBatchIngredientAccuracy } from '@/services/feedback';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

interface AnalysisResult {
  overallVerdict: 'CLEAN' | 'TOXIC';
  ingredients?: Array<{
    name: string;
    status: 'generally_clean' | 'potentially_toxic';
    educational_note: string;
    communityAccuracy?: number;
    totalFeedback?: number;
    confidence?: number;
  }>;
  totalIngredients: number;
  toxicCount: number;
  cleanCount: number;
  productName?: string;
}

export default function ResultsScreen() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set());
  const [loadingAccuracy, setLoadingAccuracy] = useState(false);
  const { user } = useAuth();
  const { resultId } = useLocalSearchParams<{ resultId: string }>();
  
  // Get data from global temp storage
  const cachedData = global.tempResults?.[resultId];
  const results = cachedData?.results;
  const extractedTextData = cachedData?.extractedText;

  useEffect(() => {
    // Cleanup temp storage when component unmounts
    return () => { 
      if (resultId) delete global.tempResults?.[resultId]; 
    };
  }, [resultId]);

  useEffect(() => {
    if (results && extractedTextData) {
      setAnalysisResult(results);
      setExtractedText(extractedTextData);
      
      // Load community accuracy data for ingredients
      if (results.ingredients && results.ingredients.length > 0) {
        loadCommunityAccuracy(results.ingredients.map((i: any) => i.name));
      }
    }
  }, [results, extractedTextData]);

  // Load community accuracy data for ingredients
  const loadCommunityAccuracy = async (ingredientNames: string[]) => {
    try {
      setLoadingAccuracy(true);
      const accuracyMap = await getBatchIngredientAccuracy(ingredientNames);
      
      // Update analysis result with community accuracy data
      setAnalysisResult(prev => {
        if (!prev || !prev.ingredients) return prev;
        
        return {
          ...prev,
          ingredients: prev.ingredients.map(ingredient => {
            const normalizedName = ingredient.name.toLowerCase().trim();
            const accuracy = accuracyMap.get(normalizedName);
            
            return {
              ...ingredient,
              communityAccuracy: accuracy?.accuracy,
              totalFeedback: accuracy?.totalFeedback
            };
          })
        };
      });
    } catch (error) {
      console.error('Error loading community accuracy:', error);
    } finally {
      setLoadingAccuracy(false);
    }
  };

  // Handle user feedback submission
  const handleFeedback = async (
    ingredientName: string,
    ingredientStatus: 'generally_clean' | 'potentially_toxic',
    isCorrect: boolean,
    confidence: number = 0.5
  ) => {
    // Prevent duplicate feedback submissions
    if (feedbackSubmitted.has(ingredientName)) {
      Alert.alert('Already Submitted', 'You have already provided feedback for this ingredient.');
      return;
    }

    try {
      const userFeedback = isCorrect
        ? 'correct'
        : ingredientStatus === 'generally_clean'
        ? 'should_be_toxic'
        : 'should_be_clean';

      await submitIngredientFeedback(
        ingredientName,
        ingredientStatus,
        userFeedback,
        confidence,
        analysisResult?.productName
      );

      // Mark as submitted
      setFeedbackSubmitted(prev => new Set(prev).add(ingredientName));

      // Reload community accuracy
      if (analysisResult?.ingredients) {
        await loadCommunityAccuracy(analysisResult.ingredients.map(i => i.name));
      }

      Alert.alert('Thank you!', 'Your feedback helps improve our accuracy.');
    } catch (error) {
      console.error('Feedback error:', error);
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    }
  };

  const isPremium = user?.subscription_status === 'premium';

  if (!results || !analysisResult) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Info size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyTitle}>Results not found</Text>
          <Text style={styles.emptyText}>
            Take a photo of an ingredient list to see your educational analysis.
          </Text>
          <TouchableOpacity style={styles.cameraButton} onPress={() => router.push('/')}>
            <Text style={styles.cameraButtonText}>Open Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const cleanIngredients = analysisResult.ingredients?.filter(r => r.status === 'generally_clean') || [];
  const toxicIngredients = analysisResult.ingredients?.filter(r => r.status === 'potentially_toxic') || [];
  
  // All ingredients in original OCR order (no separation by clean/toxic)
  const allIngredients = analysisResult.ingredients || [];
  return (
    <SafeAreaView style={styles.container}>
      {/* Bold Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color={COLORS.cleanGreen} />
        </TouchableOpacity>
        <Text style={styles.title}>Health Freak</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Main Content - ScrollView for long ingredient lists */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* Dramatic Verdict Card */}
        <View style={[
          styles.verdictContainer,
          analysisResult.overallVerdict === 'CLEAN' ? styles.cleanVerdict : styles.toxicVerdict
        ]}>
          <View style={styles.verdictHeader}>
            {analysisResult.overallVerdict === 'CLEAN' ? (
              <CheckCircle size={48} color={COLORS.cleanGreen} />
            ) : (
              <AlertTriangle size={48} color={COLORS.toxicRed} />
            )}
            <Text style={[
              styles.verdictText,
              analysisResult.overallVerdict === 'CLEAN' ? styles.cleanVerdictText : styles.toxicVerdictText
            ]}>
              {analysisResult.overallVerdict}
            </Text>
          </View>
          
          <Text style={styles.verdictSummary}>
            {analysisResult.totalIngredients} ingredients
          </Text>
        </View>

        {/* Unified Premium Upgrade Card */}
        {!isPremium && (
          <View style={styles.unifiedUpgradeCard}>
            <View style={styles.upgradeHeader}>
              <Crown size={24} color={COLORS.accentYellow} />
              <Text style={styles.upgradeTitle}>🔥 Upgrade to Premium</Text>
            </View>
            
            <View style={styles.upgradeBenefits}>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitText}>♾️ Unlimited scans forever</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitText}>💾 Scan history saved</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitText}>🔍 See which ingredients to avoid</Text>
              </View>
            </View>
            
            <TouchableOpacity style={styles.unifiedUpgradeButton} onPress={showPremiumUpgradePrompt}>
              <Text style={styles.unifiedUpgradeButtonText}>💵 Upgrade to Premium 💵{'\n'}$10/month</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Premium Features - Individual Ingredient Cards */}
        {isPremium && analysisResult.ingredients && (
          <View style={styles.premiumContent}>
            {/* Ingredient Summary */}
            <View style={styles.ingredientSummary}>
              <View style={styles.summaryRow}>
                <CheckCircle size={16} color={COLORS.cleanGreen} />
                <Text style={styles.summaryText}>Clean: {cleanIngredients.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <AlertTriangle size={16} color={COLORS.toxicRed} />
                <Text style={styles.summaryText}>Toxic: {toxicIngredients.length}</Text>
              </View>
            </View>

            {/* All Ingredients in Original OCR Order */}
            {allIngredients.length > 0 && (
              <View style={styles.ingredientSection}>
                {allIngredients.map((ingredient, index) => (
                  <View key={index} style={[
                    styles.ingredientCard, 
                    ingredient.status === 'generally_clean' ? styles.cleanCard : styles.toxicCard
                  ]}>
                    <Text style={styles.ingredientName}>{ingredient.name}</Text>
                    <Text style={styles.ingredientNote}>{ingredient.educational_note}</Text>
                    
                    {/* Feedback section */}
                    {user && (
                      <View style={styles.feedbackSection}>
                        <Text style={styles.feedbackQuestion}>Is this accurate?</Text>
                        <View style={styles.feedbackButtons}>
                          <TouchableOpacity 
                            style={[
                              styles.feedbackButton,
                              feedbackSubmitted.has(ingredient.name) && styles.feedbackButtonDisabled
                            ]}
                            onPress={() => handleFeedback(ingredient.name, ingredient.status, true, ingredient.confidence)}
                            disabled={feedbackSubmitted.has(ingredient.name)}
                          >
                            <ThumbsUp size={14} color={COLORS.white} />
                            <Text style={styles.feedbackButtonText}>Yes</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[
                              styles.feedbackButton,
                              feedbackSubmitted.has(ingredient.name) && styles.feedbackButtonDisabled
                            ]}
                            onPress={() => handleFeedback(ingredient.name, ingredient.status, false, ingredient.confidence)}
                            disabled={feedbackSubmitted.has(ingredient.name)}
                          >
                            <ThumbsDown size={14} color={COLORS.white} />
                            <Text style={styles.feedbackButtonText}>No</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                    
                    {/* Show community accuracy if available */}
                    {ingredient.communityAccuracy !== undefined && ingredient.totalFeedback && ingredient.totalFeedback > 0 && (
                      <View style={styles.communityAccuracySection}>
                        <Text style={styles.communityAccuracyText}>
                          📊 {ingredient.communityAccuracy}% community agreement ({ingredient.totalFeedback} {ingredient.totalFeedback === 1 ? 'vote' : 'votes'})
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}


        {/* Compact Disclaimer */}
        <View style={styles.compactDisclaimer}>
          <Text style={styles.compactDisclaimerText}>
            📚 Educational only - not medical advice. Consult healthcare providers for dietary decisions.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.analyzeAnotherButton} onPress={() => router.push('/')}>
            <Text style={styles.analyzeAnotherText}>Analyze Another Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backToHistoryButton} onPress={() => router.push('/history')}>
            <Text style={styles.backToHistoryText}>Back to History</Text>
          </TouchableOpacity>
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
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    color: COLORS.textSecondary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleLarge,
  },
  placeholder: {
    width: 40,
  },
  verdictContainer: {
    marginTop: 16,
    padding: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  cleanVerdict: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.cleanGreen,
  },
  toxicVerdict: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.toxicRed,
  },
  verdictHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  verdictText: {
    fontSize: 32,
    fontWeight: '400',
    marginTop: 12,
    textAlign: 'center',
    fontFamily: FONTS.karmaFuture,
    lineHeight: 36,
  },
  cleanVerdictText: {
    color: COLORS.cleanGreen,
  },
  toxicVerdictText: {
    color: COLORS.toxicRed,
  },
  verdictSummary: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
  },
  unifiedUpgradeCard: {
    backgroundColor: COLORS.accentYellow,
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  upgradeTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginLeft: 8,
    flex: 1,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  upgradeBenefits: {
    marginBottom: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  benefitText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  unifiedUpgradeButton: {
    backgroundColor: COLORS.cleanGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  unifiedUpgradeButtonText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
    textAlign: 'center',
  },
  premiumContent: {
    marginTop: 12,
  },
  ingredientSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    marginLeft: 6,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
  },
  ingredientSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.cleanGreen,
    marginLeft: 10,
    flex: 1,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  toxicTitle: {
    color: COLORS.toxicRed,
  },
  badge: {
    backgroundColor: COLORS.cleanGreen,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  toxicBadge: {
    backgroundColor: COLORS.toxicRed,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  ingredientCard: {
    backgroundColor: COLORS.background,
    padding: 18,
    marginBottom: 10,
    borderRadius: 4,
    borderWidth: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  cleanCard: {
    borderColor: COLORS.cleanGreen,
    backgroundColor: COLORS.cleanGreen,
  },
  toxicCard: {
    borderColor: COLORS.toxicRed,
    backgroundColor: COLORS.toxicRed,
  },
  ingredientName: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: '400',
    color: COLORS.white,
    marginBottom: 10,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
  },
  ingredientNote: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.white,
    lineHeight: LINE_HEIGHTS.bodySmall,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
  },
  feedbackSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  feedbackQuestion: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.white,
    marginBottom: 8,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
    opacity: 0.9,
  },
  feedbackButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    gap: 4,
  },
  feedbackButtonDisabled: {
    opacity: 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  feedbackButtonText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.white,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
    fontWeight: '400',
  },
  communityAccuracySection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  communityAccuracyText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.white,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
    opacity: 0.8,
  },
  compactDisclaimer: {
    backgroundColor: COLORS.background,
    padding: 8,
    borderRadius: 6,
    marginTop: 12,
  },
  compactDisclaimerText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.bodyLarge,
    fontFamily: FONTS.terminalGrotesque,
  },
  extractedSection: {
    backgroundColor: COLORS.background,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  extractedTitle: {
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 8,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  extractedText: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textSecondary,
    lineHeight: LINE_HEIGHTS.bodyLarge,
    fontFamily: FONTS.terminalGrotesque,
  },
  educationalNote: {
    backgroundColor: COLORS.background,
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  educationalTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 8,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  educationalText: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textSecondary,
    lineHeight: LINE_HEIGHTS.bodyLarge,
    fontFamily: FONTS.terminalGrotesque,
  },
  bottomDisclaimer: {
    backgroundColor: COLORS.background,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  bottomDisclaimerText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.bodyMedium,
    fontFamily: FONTS.terminalGrotesque,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.titleMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleMedium,
  },
  emptyText: {
    fontSize: FONT_SIZES.titleSmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: LINE_HEIGHTS.titleSmall,
    fontFamily: FONTS.terminalGrotesque,
  },
  cameraButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  cameraButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  actionButtons: {
    marginTop: 16,
    marginBottom: 16,
    gap: 12,
  },
  analyzeAnotherButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingVertical: 16,
    borderRadius: 2,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  analyzeAnotherText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  backToHistoryButton: {
    backgroundColor: COLORS.background,
    paddingVertical: 16,
    borderRadius: 2,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  backToHistoryText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
});