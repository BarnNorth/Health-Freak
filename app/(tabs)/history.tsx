import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, RefreshControl } from 'react-native';
import { FileSearch, Calendar, ChevronRight, Trash2, CircleCheck, TriangleAlert, Info, Crown, Zap } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getUserAnalyses, deleteAnalysis } from '@/lib/database';
import { showPremiumUpgradePrompt } from '@/services/subscription';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

interface AnalysisHistory {
  id: string;
  created_at: string;
  extractedText: string;
  results: any[];
}

export default function HistoryScreen() {
  const [history, setHistory] = useState<AnalysisHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [latestResult, setLatestResult] = useState<any>(null);
  const { user } = useAuth();
  const { results: resultsParam, extractedText: extractedTextParam } = useLocalSearchParams();

  useEffect(() => {
    if (user) {
      loadHistory();
    }
  }, [user]);

  useEffect(() => {
    if (resultsParam && extractedTextParam) {
      try {
        const parsedResults = JSON.parse(resultsParam as string);
        setLatestResult({
          results: parsedResults,
          extractedText: extractedTextParam as string,
          isLatest: true
        });
      } catch (error) {
        console.error('Error parsing latest results:', error);
      }
    }
  }, [resultsParam, extractedTextParam]);

  const loadHistory = async (isRefresh = false) => {
    if (!user) return;
    
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      const analyses = await getUserAnalyses(user.id);
      const formattedHistory = analyses.map(analysis => ({
        id: analysis.id,
        created_at: analysis.created_at,
        extractedText: analysis.extracted_text,
        results: analysis.results_json || { overallVerdict: 'CLEAN', totalIngredients: 0, toxicCount: 0, cleanCount: 0 }
      }));
      setHistory(formattedHistory);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadHistory(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleDeleteAnalysis = async (id: string) => {
    if (!user) return;
    
    try {
      const success = await deleteAnalysis(user.id, id);
      if (success) {
        setHistory(prev => prev.filter(item => item.id !== id));
      }
    } catch (error) {
      console.error('Error deleting analysis:', error);
    }
  };

  const getResultCounts = (results: any) => {
    if (Array.isArray(results)) {
      // Legacy format - convert to new format
      const cleanCount = results.filter(r => r.status === 'generally_clean').length;
      const toxicCount = results.filter(r => r.status === 'potentially_toxic').length;
      return { cleanCount, toxicCount, overallVerdict: toxicCount > 0 ? 'TOXIC' : 'CLEAN' };
    }
    // New format
    return {
      cleanCount: results.cleanCount || 0,
      toxicCount: results.toxicCount || 0,
      overallVerdict: results.overallVerdict || 'CLEAN'
    };
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <FileSearch size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyText}>
            Please sign in to view your analysis history.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (history.length === 0 && !latestResult) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <FileSearch size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyTitle}>No Analysis History</Text>
          <Text style={styles.emptyText}>
            Your ingredient analyses will appear here for easy reference.
          </Text>
          <TouchableOpacity style={styles.cameraButton} onPress={() => router.push('/')}>
            <Text style={styles.cameraButtonText}>Start Analyzing</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.cleanGreen}
            colors={[COLORS.cleanGreen]}
          />
        }
      >
        {/* Bold Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Health Freak</Text>
          <Text style={styles.subtitle}>Your ingredient analyses</Text>
        </View>

        {/* Latest Result Section */}
        {latestResult && (
          <View style={styles.latestResultSection}>
            <View style={styles.latestResultHeader}>
              <Text style={styles.latestResultTitle}>Latest Analysis</Text>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            </View>
            
            <View style={styles.latestResultCard}>
              <View style={styles.latestResultContent}>
                <Text style={styles.latestResultText} numberOfLines={2}>
                  {latestResult.extractedText}
                </Text>
                
                <View style={styles.latestResultVerdict}>
                  {(() => {
                    const { cleanCount, toxicCount, overallVerdict } = getResultCounts(latestResult.results);
                    return (
                      <View style={styles.verdictContainer}>
                        {overallVerdict === 'CLEAN' ? (
                          <CircleCheck size={20} color={COLORS.cleanGreen} />
                        ) : (
                          <TriangleAlert size={20} color={COLORS.toxicRed} />
                        )}
                        <Text style={[
                          styles.verdictText,
                          overallVerdict === 'CLEAN' ? styles.cleanVerdictText : styles.toxicVerdictText
                        ]}>
                          {overallVerdict}
                        </Text>
                        {user?.subscription_status === 'premium' && (
                          <Text style={styles.verdictCount}>
                            {cleanCount} clean, {toxicCount} toxic
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                </View>

                {/* Free User Upgrade Prompt */}
                {!user || user.subscription_status !== 'premium' && latestResult.results.overallVerdict === 'TOXIC' && (
                  <View style={styles.upgradePrompt}>
                    <View style={styles.upgradeHeader}>
                      <Crown size={14} color={COLORS.accentYellow} />
                      <Text style={styles.upgradeTitle}>See which ingredients are toxic?</Text>
                    </View>
                    <TouchableOpacity style={styles.upgradeButton} onPress={showPremiumUpgradePrompt}>
                      <Zap size={16} color={COLORS.white} />
                      <Text style={styles.upgradeButtonText}>⚡ Try Premium - $10/month</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              
              <TouchableOpacity 
                style={styles.viewLatestButton}
                onPress={() => router.push({
                  pathname: '/results',
                  params: { 
                    results: JSON.stringify(latestResult.results),
                    extractedText: latestResult.extractedText
                  }
                })}
              >
                <Text style={styles.viewLatestButtonText}>View Full Results</Text>
                <ChevronRight size={16} color={COLORS.cleanGreen} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Premium Notice */}
        {user?.subscription_status !== 'premium' && (
          <View style={styles.premiumNotice}>
            <Text style={styles.premiumNoticeText}>
              📈 Showing last 10 analyses. Upgrade to Premium for unlimited history, search, and export features
            </Text>
          </View>
        )}

        {/* History List */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historySectionTitle}>Previous Analyses</Text>
            <View style={styles.historyContainer}>
              {history.map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <View style={styles.dateContainer}>
                  <Calendar size={16} color={COLORS.textSecondary} />
                  <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
                </View>
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => handleDeleteAnalysis(item.id)}
                >
                  <Trash2 size={16} color={COLORS.toxicRed} />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.extractedText} numberOfLines={2}>
                {item.extractedText}
              </Text>
              
              <View style={styles.resultsContainer}>
                {(() => {
                  const { cleanCount, toxicCount, overallVerdict } = getResultCounts(item.results);
                  return (
                    <>
                      <View style={styles.resultBadge}>
                        <View style={[styles.statusDot, overallVerdict === 'CLEAN' ? styles.cleanDot : styles.toxicDot]} />
                        <Text style={styles.resultText}>Product is {overallVerdict}</Text>
                      </View>
                      {user?.subscription_status === 'premium' && (
                        <View style={styles.ingredientCounts}>
                          <Text style={styles.resultText}>{cleanCount} clean, {toxicCount} toxic</Text>
                        </View>
                      )}
                    </>
                  );
                })()}
              </View>
              
              <TouchableOpacity 
                style={styles.viewButton}
                onPress={() => router.push({
                  pathname: '/results',
                  params: { 
                    results: JSON.stringify(item.results),
                    extractedText: item.extractedText
                  }
                })}
              >
                <Text style={styles.viewButtonText}>View Details</Text>
                <ChevronRight size={16} color={COLORS.cleanGreen} />
              </TouchableOpacity>
            </View>
              ))}
            </View>
          </View>
        )}

        {/* Educational Note & Disclaimer */}
        <View style={styles.educationalNote}>
          <Text style={styles.educationalTitle}>About Your History</Text>
          <Text style={styles.educationalText}>
            📚 For educational reference only. Not medical advice.
            {'\n\n'}
            {user?.subscription_status === 'premium' ? 
              '♾️ You have unlimited analysis history.' :
              '📊 Free accounts show last 10 analyses. Upgrade to Premium for unlimited history.'
            }
            {'\n\n'}🏥 Always consult healthcare professionals for dietary decisions.
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
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: FONT_SIZES.titleLarge,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleLarge,
  },
  subtitle: {
    fontSize: FONT_SIZES.titleSmall,
    color: COLORS.textSecondary,
    fontWeight: '400',
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  disclaimerContainer: {
    backgroundColor: COLORS.accentYellow,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  premiumNotice: {
    backgroundColor: COLORS.accentBlue,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  premiumNoticeText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    textAlign: 'center',
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  disclaimerText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    textAlign: 'center',
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  historyContainer: {
    marginHorizontal: 16,
  },
  historyCard: {
    backgroundColor: COLORS.background,
    padding: 16,
    marginBottom: 12,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 19,
    color: COLORS.textSecondary,
    marginLeft: 6,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: 23,
  },
  deleteButton: {
    padding: 4,
  },
  extractedText: {
    fontSize: 19,
    color: COLORS.textPrimary,
    marginBottom: 12,
    lineHeight: 23,
    fontFamily: FONTS.terminalGrotesque,
  },
  resultsContainer: {
    marginBottom: 12,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ingredientCounts: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  cleanDot: {
    backgroundColor: COLORS.cleanGreen,
  },
  toxicDot: {
    backgroundColor: COLORS.toxicRed,
  },
  resultText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: 21,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
    marginTop: 8,
  },
  viewButtonText: {
    fontSize: 19,
    color: COLORS.cleanGreen,
    fontWeight: '400',
    marginRight: 4,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: 23,
  },
  educationalNote: {
    backgroundColor: COLORS.accentYellow,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 4,
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
    color: COLORS.textPrimary,
    lineHeight: LINE_HEIGHTS.bodyLarge,
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
    color: COLORS.textSecondary,
    marginTop: 16,
    marginBottom: 8,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleMedium,
  },
  emptyText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: LINE_HEIGHTS.bodySmall,
    fontFamily: FONTS.terminalGrotesque,
  },
  cameraButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 32,
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
  cameraButtonText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  latestResultSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  latestResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  latestResultTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  newBadge: {
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  newBadgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  latestResultCard: {
    backgroundColor: COLORS.background,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  latestResultContent: {
    padding: 16,
  },
  latestResultText: {
    fontSize: 19,
    color: COLORS.textPrimary,
    marginBottom: 12,
    lineHeight: 23,
    fontFamily: FONTS.terminalGrotesque,
  },
  latestResultVerdict: {
    marginBottom: 12,
  },
  verdictContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verdictText: {
    fontSize: 19,
    fontWeight: '400',
    marginLeft: 8,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: 23,
  },
  cleanVerdictText: {
    color: COLORS.cleanGreen,
  },
  toxicVerdictText: {
    color: COLORS.toxicRed,
  },
  verdictCount: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginLeft: 8,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: 21,
  },
  upgradePrompt: {
    backgroundColor: COLORS.accentYellow,
    padding: 10,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginLeft: 4,
    flex: 1,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: 21,
  },
  upgradeButton: {
    backgroundColor: COLORS.accentYellow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  upgradeButtonText: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: '400',
    marginLeft: 6,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: 23,
  },
  viewLatestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: COLORS.cleanGreen,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
  },
  viewLatestButtonText: {
    fontSize: 19,
    color: COLORS.cleanGreen,
    fontWeight: '400',
    marginRight: 4,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: 23,
  },
  historySection: {
    marginHorizontal: 16,
  },
  historySectionTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 12,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
});