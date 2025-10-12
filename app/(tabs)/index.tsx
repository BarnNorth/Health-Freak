import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, ActivityIndicator, TextInput, Modal, Image } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Camera, RotateCcw, Zap, Keyboard, X, Heart, Star, Search, Apple, Carrot, Leaf } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { incrementAnalysisCount, checkUserLimits } from '@/lib/database';
import { analyzeIngredients } from '@/services/ingredients';
import { saveAnalysis } from '@/lib/database';
import { analyzePhoto as analyzePhotoWithOCR, getOCRStatus } from '@/services/photoAnalysis';
import { testOpenAIAPIKey } from '@/services/aiAnalysis';
import { showScanLimitReachedModal } from '@/services/subscription';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function CameraScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [manualText, setManualText] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string>('');
  const [extractedText, setExtractedText] = useState<string>('');
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [canScan, setCanScan] = useState(true);
  const { user, initializing, refreshUserProfile } = useAuth();

  useEffect(() => {
    let isMounted = true;
    
    // Test OpenAI API key
    testOpenAIAPIKey().then(isValid => {
      if (isMounted) {
        if (isValid) {
          console.log('✅ OpenAI API key is working correctly');
        } else {
          console.log('❌ OpenAI API key test failed - check configuration');
        }
      }
    });
    
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Check scan limits for Free tier users
  useEffect(() => {
    async function checkLimits() {
      if (!user) return;

      // Premium users have unlimited scans
      if (user.subscription_status === 'premium') {
        setScansRemaining(null); // null = unlimited
        setCanScan(true);
        return;
      }

      // Free tier: Check database for current usage
      const limits = await checkUserLimits(user.id);
      setScansRemaining(limits.remaining);
      setCanScan(limits.canAnalyze);
      
      console.log('[SCANNER] Free tier limits:', {
        totalUsed: limits.totalUsed,
        remaining: limits.remaining,
        canScan: limits.canAnalyze
      });
    }

    checkLimits();
  }, [user, user?.total_scans_used]); // Re-check when user or their scan count changes

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Camera size={64} color={COLORS.cleanGreen} style={styles.cameraIcon} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera permission to photograph ingredient lists for analysis.
          </Text>
          <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
            <Text style={styles.grantButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  function openTextInput() {
    // Check if user has reached scan limit (Free tier only)
    if (!canScan) {
      showScanLimitReachedModal();
      return;
    }
    
    setShowTextInput(true);
  }

  async function takePicture() {
    try {
      // Check if user has reached scan limit (Free tier only)
      if (!canScan) {
        showScanLimitReachedModal();
        return;
      }

      setIsAnalyzing(true);
      setOcrProgress('Capturing photo...');
      
      if (!cameraRef.current) {
        throw new Error('Camera not ready');
      }
      
      // Capture photo from camera
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        skipProcessing: false,
      });
      
      setCapturedPhoto(photo.uri);
      
      // Show preview first
      setShowPreview(true);
      setIsAnalyzing(false);
      setOcrProgress('');
      
    } catch (error) {
      setIsAnalyzing(false);
      setOcrProgress('');
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    }
  }

  async function analyzePhotoFromImage() {
    if (!capturedPhoto) return;

    try {
      console.log('🔍 Starting photo analysis...');
      console.log('📸 Captured photo URI:', capturedPhoto);
      
      setIsAnalyzing(true);
      setOcrProgress('Analyzing photo...');
      
      // Use the new OCR service to analyze the photo
      const photoAnalysis = await analyzePhotoWithOCR(capturedPhoto, (progress) => {
        console.log('📊 OCR Progress:', progress);
        setOcrProgress(progress);
      });
      
      console.log('📝 OCR Analysis Result:', {
        success: photoAnalysis.success,
        extractedText: photoAnalysis.extractedText,
        confidence: photoAnalysis.confidence,
        error: photoAnalysis.error
      });
      
      if (!photoAnalysis.success) {
        console.error('❌ OCR Analysis Failed:', photoAnalysis.error);
        setIsAnalyzing(false);
        setOcrProgress('');
        Alert.alert(
          'Analysis Failed', 
          photoAnalysis.error || 'Could not extract text from the photo. Please try again with a clearer image.',
          [
            { text: 'Retake Photo', onPress: closePreview },
            { text: 'Manual Input', onPress: () => {
              closePreview();
              openTextInput();
            }}
          ]
        );
        return;
      }
      
      setExtractedText(photoAnalysis.extractedText);
      setOcrProgress('Processing ingredients...');
      
      console.log('🧪 Starting ingredient analysis...');
      console.log('📄 Text to analyze:', photoAnalysis.extractedText);
      
      // Analyze ingredients using the extracted text
      // Free users get basic analysis (overall verdict), premium users get detailed breakdown
      const isPremium = user?.subscription_status === 'premium';
      const results = await analyzeIngredients(photoAnalysis.extractedText, isPremium);
      
      console.log('🎯 Ingredient Analysis Results:', {
        overallVerdict: results.overallVerdict,
        totalIngredients: results.totalIngredients,
        toxicCount: results.toxicCount,
        cleanCount: results.cleanCount,
        ingredients: results.ingredients
      });
      
      // Increment scan count for all users (to track free tier limit)
      await incrementAnalysisCount(user!.id);
      
      // Refresh user profile to update scan count across app
      await refreshUserProfile();
      
      // Update scan counter UI for free users
      if (user?.subscription_status === 'free') {
        const updatedLimits = await checkUserLimits(user.id);
        setScansRemaining(updatedLimits.remaining);
        setCanScan(updatedLimits.canAnalyze);
      }
      
      // Save history only for premium users
      if (user?.subscription_status === 'premium') {
        console.log('💾 Saving analysis to database (Premium user)...');
        await saveAnalysis(user.id, photoAnalysis.extractedText, results);
      } else {
        console.log('ℹ️ Free tier - analysis not saved to history');
      }
      
      setOcrProgress('');
      setIsAnalyzing(false);
      
      console.log('✅ Analysis complete, navigating to results...');
      
      // Navigate to history with latest results
      router.push({
        pathname: '/history',
        params: { 
          results: JSON.stringify(results),
          extractedText: photoAnalysis.extractedText
        }
      });
      
    } catch (error) {
      console.error('💥 Analysis Error:', error);
      setIsAnalyzing(false);
      setOcrProgress('');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to analyze ingredients: ${errorMessage}`);
    } finally {
      setShowPreview(false);
      setCapturedPhoto(null);
    }
  }

  async function analyzePhoto(extractedText: string) {
    try {
      setIsAnalyzing(true);
      
      // Analyze ingredients
      // Free users get basic analysis (overall verdict), premium users get detailed breakdown
      const isPremium = user?.subscription_status === 'premium';
      const results = await analyzeIngredients(extractedText, isPremium);
      
      // Increment scan count for all users (to track free tier limit)
      await incrementAnalysisCount(user!.id);
      
      // Refresh user profile to update scan count across app
      await refreshUserProfile();
      
      // Update scan counter UI for free users
      if (user?.subscription_status === 'free') {
        const updatedLimits = await checkUserLimits(user.id);
        setScansRemaining(updatedLimits.remaining);
        setCanScan(updatedLimits.canAnalyze);
      }
      
      // Save history only for premium users
      if (user?.subscription_status === 'premium') {
        await saveAnalysis(user.id, extractedText, results);
      }
      
      // Navigate to history with latest results
      router.push({
        pathname: '/history',
        params: { 
          results: JSON.stringify(results),
          extractedText: extractedText
        }
      });
      
    } catch (error) {
      Alert.alert('Error', 'Failed to analyze ingredients. Please try again.');
    } finally {
      setIsAnalyzing(false);
      setShowPreview(false);
      setCapturedPhoto(null);
    }
  }

  async function analyzeManualText() {
    if (!manualText.trim()) {
      Alert.alert('Error', 'Please enter some ingredient text to analyze.');
      return;
    }

    setShowTextInput(false);
    await analyzePhoto(manualText);
    setManualText('');
  }

  function closePreview() {
    setShowPreview(false);
    setCapturedPhoto(null);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Text */}
      <View style={styles.header}>
        <Text style={styles.title}>Health Freak</Text>
        
        {/* Scan Counter - Free tier only */}
        {user?.subscription_status === 'free' && scansRemaining !== null && (
          <View style={styles.scanCounter}>
            <Text style={styles.scanCounterText}>
              {scansRemaining > 0 
                ? `⚡ ${scansRemaining} scan${scansRemaining !== 1 ? 's' : ''} remaining`
                : '🔒 Limit reached - Upgrade to continue'
              }
            </Text>
          </View>
        )}
        
        {/* Premium Badge */}
        {user?.subscription_status === 'premium' && (
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>👑 Unlimited Scans</Text>
          </View>
        )}
      </View>

      {/* Camera - Takes most of the screen */}
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} />
      </View>

      {/* Camera Controls - Fixed at bottom */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
          <RotateCcw size={24} color={COLORS.white} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.captureButton, isAnalyzing && styles.captureButtonDisabled]} 
          onPress={takePicture}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <Zap size={32} color={COLORS.textPrimary} />
          ) : (
            <Camera size={32} color={COLORS.textPrimary} />
          )}
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.textInputButton} onPress={openTextInput}>
          <Keyboard size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Analysis Status - Only show when analyzing */}
      {isAnalyzing && (
        <View style={styles.analyzingContainer}>
          <Text style={styles.analyzingText}>Analyzing ingredients...</Text>
        </View>
      )}

        {/* Manual Text Input Modal */}
        <Modal
          visible={showTextInput}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowTextInput(false)}>
                <X size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Enter Ingredients</Text>
              <View style={styles.placeholder} />
            </View>
            
            <View style={styles.modalContent}>
              <Text style={styles.inputLabel}>
                Type or paste ingredient list:
              </Text>
              <TextInput
                style={styles.textInput}
                multiline
                numberOfLines={8}
                value={manualText}
                onChangeText={setManualText}
                placeholder="Example: Organic cane sugar, high fructose corn syrup, natural flavors, sea salt..."
                placeholderTextColor={COLORS.textSecondary}
                textAlignVertical="top"
              />
              
              <TouchableOpacity onPress={analyzeManualText} style={styles.analyzeButtonContainer}>
                <Text style={styles.analyzeButton}>Analyze Ingredients</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>

        {/* Photo Preview Modal */}
        <Modal
          visible={showPreview}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closePreview}>
                <X size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Confirm Analysis</Text>
              <View style={styles.placeholder} />
            </View>
            
            <View style={styles.modalContent}>
              {capturedPhoto && (
                <Image source={{ uri: capturedPhoto }} style={styles.previewImage} />
              )}
              
              <Text style={styles.extractedTitle}>Extracted Text:</Text>
              <View style={styles.extractedTextContainer}>
                <Text style={styles.extractedText}>
                  {extractedText || 'Text will be extracted when you analyze the photo...'}
                </Text>
              </View>
              
              <View style={styles.previewDisclaimer}>
                <Text style={styles.previewDisclaimerText}>
                  📚 This analysis is for educational purposes only and does not constitute medical advice.
                </Text>
              </View>
              
              <View style={styles.previewButtons}>
                <TouchableOpacity 
                  style={styles.retakeButton} 
                  onPress={closePreview}
                >
                  <Text style={styles.retakeButtonText}>Retake Photo</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.confirmButton} 
                  onPress={analyzePhotoFromImage}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={COLORS.white} />
                      {ocrProgress ? (
                        <Text style={styles.progressText}>{ocrProgress}</Text>
                      ) : null}
                    </View>
                  ) : (
                    <Text style={styles.confirmButtonText}>Analyze Ingredients</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background, // warm cream
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 8,
    backgroundColor: COLORS.background, // single background
  },
  title: {
    fontSize: FONT_SIZES.titleXL,
    fontWeight: '400',
    color: COLORS.textSecondary,
    textAlign: 'center',
    textShadowColor: 'rgba(74, 124, 89, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleXL,
    width: '100%',
  },
  scanCounter: {
    backgroundColor: COLORS.accentYellow,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  scanCounterText: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  premiumBadge: {
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  premiumBadgeText: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  cameraContainer: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  camera: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 20,
    gap: 24,
    backgroundColor: COLORS.background,
  },
  flipButton: {
    width: 56,
    height: 56,
    borderRadius: 2,
    backgroundColor: COLORS.accentBlue,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  textInputButton: {
    width: 56,
    height: 56,
    borderRadius: 2,
    backgroundColor: COLORS.accentYellow,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 2,
    backgroundColor: COLORS.cleanGreen,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 4,
  },
  captureButtonDisabled: {
    backgroundColor: COLORS.gray,
    borderColor: COLORS.border,
  },
  placeholder: {
    width: 48,
  },
  analyzingContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  analyzingText: {
    fontSize: FONT_SIZES.bodyTiny,
    color: COLORS.textPrimary,
    fontWeight: '400',
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyTiny,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: COLORS.background,
  },
  cameraIcon: {
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(74, 124, 89, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  permissionText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: LINE_HEIGHTS.bodySmall,
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    fontFamily: FONTS.terminalGrotesque,
  },
  grantButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  grantButtonText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  modalTitle: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textSecondary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  analyzeButtonContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  analyzeButton: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    color: COLORS.cleanGreen,
    backgroundColor: COLORS.accentYellow,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  modalContent: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.background,
  },
  inputLabel: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 12,
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 12,
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    minHeight: 120,
    marginBottom: 16,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 4,
    marginBottom: 16,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  extractedTitle: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginBottom: 8,
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  extractedTextContainer: {
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  extractedText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    lineHeight: LINE_HEIGHTS.bodySmall,
    fontFamily: FONTS.terminalGrotesque,
  },
  previewDisclaimer: {
    backgroundColor: COLORS.accentYellow,
    padding: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.toxicRed,
    marginBottom: 24,
  },
  previewDisclaimerText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    textAlign: 'center',
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
  },
  previewButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    backgroundColor: COLORS.accentBlue,
    borderWidth: 2,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  retakeButtonText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
    textAlign: 'center',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: COLORS.cleanGreen,
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 3,
  },
  confirmButtonText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  progressText: {
    fontSize: FONT_SIZES.bodyMicro,
    color: COLORS.textPrimary,
    marginLeft: 8,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMicro,
  },
});