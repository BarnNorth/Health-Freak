import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, ActivityIndicator, TextInput, Modal, Image, Animated, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';

// Global temporary storage for navigation optimization
declare global { var tempResults: Record<string, any>; }
if (!global.tempResults) global.tempResults = {};

function cleanupTempResults() {
  const cutoff = Date.now() - (5 * 60 * 1000); // 5 minutes
  Object.keys(global.tempResults).forEach(key => {
    if (parseInt(key.split('_')[1]) < cutoff) delete global.tempResults[key];
  });
}
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { PinchGestureHandler, TapGestureHandler, State } from 'react-native-gesture-handler';
import { Camera, RotateCcw, Zap, Keyboard as KeyboardIcon, X, Heart, Star, Search, Apple, Carrot, Leaf, Flashlight, FlashlightOff, ZoomIn, ZoomOut } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { incrementAnalysisCount, checkUserLimits } from '@/lib/database';
import { analyzeIngredients } from '@/services/ingredients';
import { saveAnalysis } from '@/lib/database';
import { analyzePhoto as analyzePhotoWithOCR, getOCRStatus } from '@/services/photoAnalysis';
import { testOpenAIAPIKey } from '@/services/aiAnalysis';
import { showScanLimitReachedModal, showPremiumUpgradePrompt } from '@/services/subscriptionModals';
import { isPremiumActive } from '@/services/subscription';
import { PaymentMethodModal } from '@/components/PaymentMethodModal';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';
import { AIAnalysisLoadingModal, AIThought } from '@/components/AIAnalysisLoadingModal';

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
  
  // New camera control states
  const [zoom, setZoom] = useState(0);
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [showZoomControls, setShowZoomControls] = useState(false);
  const baseZoom = useRef(0);
  const lastScale = useRef(1);
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [canScan, setCanScan] = useState(true);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isTabFocused, setIsTabFocused] = useState(true);
  const { user, initializing, refreshUserProfile } = useAuth();
  
  // AI Loading Modal state
  const [showAILoading, setShowAILoading] = useState(false);
  const [aiThoughts, setAiThoughts] = useState<AIThought[]>([]);
  const [aiProgress, setAiProgress] = useState(0);
  const [ingredientCount, setIngredientCount] = useState(0);
  
  const addAIThought = (thought: Omit<AIThought, 'timestamp'>) => {
    setAiThoughts(prev => [...prev, { ...thought, timestamp: Date.now() }]);
  };

  // Performance monitoring
  interface PerfMetrics { 
    captureStart: number; 
    captureEnd: number; 
    ocrStart: number; 
    ocrEnd: number; 
    aiStart: number; 
    aiEnd: number; 
    navigationStart: number; 
  }
  
  const perfMetricsRef = useRef<PerfMetrics>({ 
    captureStart: 0, 
    captureEnd: 0, 
    ocrStart: 0, 
    ocrEnd: 0, 
    aiStart: 0, 
    aiEnd: 0, 
    navigationStart: 0 
  });
  
  const updatePerfMetric = (key: keyof PerfMetrics) => {
    perfMetricsRef.current[key] = Date.now();
  };
  
  const logPerf = () => {
    const metrics = perfMetricsRef.current;
    const m = { 
      capture: metrics.captureEnd > 0 ? metrics.captureEnd - metrics.captureStart : 0,
      ocr: metrics.ocrEnd > 0 ? metrics.ocrEnd - metrics.ocrStart : 0,
      ai: metrics.aiEnd > 0 ? metrics.aiEnd - metrics.aiStart : 0,
      total: metrics.navigationStart > 0 ? metrics.navigationStart - metrics.captureStart : 0
    };
    return m;
  };

  // Track when tab is focused/unfocused to control camera
  useFocusEffect(
    React.useCallback(() => {
      setIsTabFocused(true);
      return () => {
        setIsTabFocused(false);
      };
    }, [])
  );

  useEffect(() => {
    let isMounted = true;
    
    // Test OpenAI API key only once on component mount
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
  }, []); // Remove [user] dependency - API key doesn't change when user changes

  // Check subscription status and scan limits
  useEffect(() => {
    async function checkSubscriptionAndLimits() {
      if (!user) return;

      try {
        // Check premium status using unified service
        const isPremium = await isPremiumActive(user.id);
        setIsPremiumUser(isPremium);

        if (isPremium) {
          // Premium users have unlimited scans
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
      } catch (error) {
        console.error('[SCANNER] Error checking subscription status:', error);
        // Default to free tier on error
        setIsPremiumUser(false);
        const limits = await checkUserLimits(user.id);
        setScansRemaining(limits.remaining);
        setCanScan(limits.canAnalyze);
      }
    }

    checkSubscriptionAndLimits();
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
            <Text style={styles.grantButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  // Zoom gesture handler
  const onPinchGestureEvent = (event: any) => {
    const scale = event.nativeEvent.scale;
    const newZoom = Math.max(0, Math.min(1, baseZoom.current + (scale - lastScale.current) * 0.5));
    setZoom(newZoom);
  };

  const onPinchHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.BEGAN) {
      baseZoom.current = zoom;
      lastScale.current = 1;
    } else if (event.nativeEvent.state === State.END) {
      lastScale.current = 1;
    }
  };

  // Tap to focus handler
  const onTapGestureEvent = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    
    // Clear focus point after 2 seconds
    setTimeout(() => {
      setFocusPoint(null);
    }, 2000);
  };

  // Zoom control functions
  const adjustZoom = (delta: number) => {
    const newZoom = Math.max(0, Math.min(1, zoom + delta));
    setZoom(newZoom);
  };

  // Flash toggle
  const toggleFlash = () => {
    setFlashMode(current => {
      switch (current) {
        case 'off': return 'on';
        case 'on': return 'auto';
        case 'auto': return 'off';
        default: return 'off';
      }
    });
  };

  // Handle subscription upgrade
  const handleSubscribe = () => {
    setShowPaymentModal(true);
  };

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

      // Reset all metrics for new capture
      perfMetricsRef.current = {
        captureStart: Date.now(),
        captureEnd: 0,
        ocrStart: 0,
        ocrEnd: 0,
        aiStart: 0,
        aiEnd: 0,
        navigationStart: 0
      };
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
      
      updatePerfMetric('captureEnd');
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
      
      // Show AI modal immediately and close preview
      setShowPreview(false);
      setShowAILoading(true);
      setAiThoughts([]);
      setAiProgress(0);
      setIngredientCount(0);
      
      // Add initial OCR thought
      addAIThought({ message: 'Scanning photo...', emoji: '📸', type: 'ocr' });
      
      setIsAnalyzing(true);
      setOcrProgress('Analyzing photo...');
      
      // Use the new OCR service to analyze the photo
      updatePerfMetric('ocrStart');
      const photoAnalysis = await analyzePhotoWithOCR(capturedPhoto, user?.id || 'anonymous', (progress) => {
        console.log('📊 OCR Progress:', progress);
        setOcrProgress(progress);
        // Add OCR progress thoughts to AI modal
        addAIThought({ message: progress, emoji: '🔍', type: 'ocr' });
      });
      updatePerfMetric('ocrEnd');
      
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
      
      setIsAnalyzing(false);
      
      addAIThought({ message: 'Reading ingredient list...', emoji: '👀', type: 'parsing' });
      
      // Analyze ingredients using the extracted text with progress callbacks
      // Free users get basic analysis (overall verdict), premium users get detailed breakdown
      updatePerfMetric('aiStart');
      const isPremium = user?.subscription_status === 'premium';
      let processedCount = 0;
      
      // PERFORMANCE FIX: Parse only once in analyzeIngredients, get count from results
      const results = await analyzeIngredients(photoAnalysis.extractedText, user?.id || 'anonymous', isPremium, (update) => {
        // Track overall progress across all batches
        if (update.type === 'classified') {
          processedCount++;
          // Use update.total instead of results.totalIngredients since results isn't available yet in callback
          setAiProgress(Math.min((update.current / (update.total || 1)) * 100, 100));
        }
        addAIThought({ message: update.message, emoji: update.emoji, type: update.type, isToxic: update.isToxic });
      });
      
      // Set ingredient count from results (parsing happens once in analyzeIngredients)
      setIngredientCount(results.totalIngredients);
      updatePerfMetric('aiEnd');
      
      console.log('🎯 Ingredient Analysis Results:', {
        overallVerdict: results.overallVerdict,
        totalIngredients: results.totalIngredients,
        toxicCount: results.toxicCount,
        cleanCount: results.cleanCount,
        ingredients: results.ingredients
      });
      
      // Ensure progress reaches 100%
      setAiProgress(100);
      
      // Add final AI thought
      addAIThought({
        message: results.overallVerdict === 'CLEAN' ? '🎉 Product is clean!' : '⚠️ Found concerns...',
        emoji: results.overallVerdict === 'CLEAN' ? '✨' : '🔍',
        type: 'complete',
        isComplete: true,
        isToxic: results.overallVerdict === 'TOXIC'
      });
      
      // Wait longer to show the final thought so users can see the verdict
      await new Promise(r => setTimeout(r, 2000));
      setShowAILoading(false);
      
      // Run database operations in background (non-blocking)
      Promise.allSettled([
        incrementAnalysisCount(user!.id),
        saveAnalysis(user!.id, photoAnalysis.extractedText, results),
        refreshUserProfile()
      ]).catch(e => console.error('Background DB operations failed:', e));

      // Optimistic UI updates for free users (no waiting for DB)
      if (!isPremiumUser) {
        setScansRemaining(prev => Math.max(0, (prev || 0) - 1));
        setCanScan(scansRemaining !== null ? scansRemaining > 1 : true);
      }
      
      console.log('✅ Analysis complete, navigating to results...');
      
      // Navigate to results screen with latest results
      updatePerfMetric('navigationStart');
      const resultId = `result_${Date.now()}`;
      cleanupTempResults();
      global.tempResults[resultId] = { results, extractedText: photoAnalysis.extractedText };
      router.push({
        pathname: '/results',
        params: { resultId }
      });
      
      // Log performance metrics
      logPerf();
      
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
      setShowTextInput(false);
      
      // Show AI modal immediately
      setShowAILoading(true);
      setAiThoughts([]);
      setAiProgress(0);
      
      addAIThought({ message: 'Reading ingredient list...', emoji: '👀', type: 'parsing' });
      
      // Analyze ingredients with progress callbacks
      // Free users get basic analysis (overall verdict), premium users get detailed breakdown
      const isPremium = user?.subscription_status === 'premium';
      let processedCount = 0;
      
      // PERFORMANCE FIX: Parse only once in analyzeIngredients, get count from results
      const results = await analyzeIngredients(extractedText, user?.id || 'anonymous', isPremium, (update) => {
        // Track overall progress across all batches
        if (update.type === 'classified') {
          processedCount++;
          setAiProgress(Math.min((processedCount / results.totalIngredients) * 100, 100));
        }
        addAIThought({ 
          message: update.message, 
          emoji: update.emoji, 
          type: update.type,
          isToxic: update.isToxic 
        });
      });
      
      // Set ingredient count from results (parsing happens once in analyzeIngredients)
      setIngredientCount(results.totalIngredients);
      
      // Ensure progress reaches 100%
      setAiProgress(100);
      
      // Add final AI thought
      addAIThought({
        message: results.overallVerdict === 'CLEAN' ? '🎉 Product is clean!' : '⚠️ Found concerns...',
        emoji: results.overallVerdict === 'CLEAN' ? '✨' : '🔍',
        type: 'complete',
        isComplete: true,
        isToxic: results.overallVerdict === 'TOXIC'
      });
      
      // Wait longer to show the final thought so users can see the verdict
      await new Promise(r => setTimeout(r, 2000));
      setShowAILoading(false);
      
      // Run database operations in background (non-blocking)
      Promise.allSettled([
        incrementAnalysisCount(user!.id),
        saveAnalysis(user!.id, extractedText, results),
        refreshUserProfile()
      ]).catch(e => console.error('Background DB operations failed:', e));

      // Optimistic UI updates for free users (no waiting for DB)
      if (!isPremiumUser) {
        setScansRemaining(prev => Math.max(0, (prev || 0) - 1));
        setCanScan(scansRemaining !== null ? scansRemaining > 1 : true);
      }
      
      // Navigate to results screen with latest results
      const resultId = `result_${Date.now()}`;
      cleanupTempResults();
      global.tempResults[resultId] = { results, extractedText: extractedText };
      router.push({
        pathname: '/results',
        params: { resultId }
      });
      
    } catch (error) {
      setShowAILoading(false);
      Alert.alert('Error', 'Failed to analyze ingredients. Please try again.');
    } finally {
      setIsAnalyzing(false);
      setShowTextInput(false);
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
        {!isPremiumUser && scansRemaining !== null && (
          <View style={styles.scanCounter}>
            <Text style={styles.scanCounterText}>
              {scansRemaining > 0 
                ? `📷 ${scansRemaining} scan${scansRemaining !== 1 ? 's' : ''} remaining`
                : '🔒 Scan limit reached'
              }
            </Text>
            {scansRemaining === 0 && (
              <TouchableOpacity 
                style={styles.upgradeButtonSmall} 
                onPress={handleSubscribe}
              >
                <Text style={styles.upgradeButtonSmallText}>Upgrade Now</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Camera - Takes most of the screen */}
      <View style={styles.cameraContainer}>
        {/* Only render camera when actively using it (tab focused, not analyzing, previewing, or entering text) */}
        {isTabFocused && !isAnalyzing && !showPreview && !showTextInput ? (
          <PinchGestureHandler
            onGestureEvent={onPinchGestureEvent}
            onHandlerStateChange={onPinchHandlerStateChange}
          >
            <TapGestureHandler onHandlerStateChange={onTapGestureEvent}>
              <View style={styles.cameraWrapper}>
                <CameraView 
                  ref={cameraRef} 
                  style={styles.camera} 
                  facing={facing}
                  zoom={zoom}
                  flash={flashMode}
                />
                
                {/* Focus indicator */}
                {focusPoint && (
                  <View 
                    style={[
                      styles.focusIndicator,
                      {
                        left: focusPoint.x - 30,
                        top: focusPoint.y - 30,
                      }
                    ]}
                  />
                )}
                
                {/* Zoom and Flash Controls Overlay */}
                <View style={styles.cameraOverlay}>
                  <View style={styles.zoomControls}>
                    <TouchableOpacity 
                      style={styles.zoomButton} 
                      onPress={() => adjustZoom(-0.2)}
                      disabled={zoom <= 0}
                    >
                      <ZoomOut size={20} color={COLORS.white} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.zoomButton} 
                      onPress={() => adjustZoom(0.2)}
                      disabled={zoom >= 1}
                    >
                      <ZoomIn size={20} color={COLORS.white} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.flashButton} 
                      onPress={toggleFlash}
                    >
                      {flashMode === 'off' && (
                        <View style={styles.flashButtonContent}>
                          <FlashlightOff size={20} color={COLORS.white} />
                          <Text style={styles.flashButtonText}>Off</Text>
                        </View>
                      )}
                      {flashMode === 'on' && (
                        <View style={styles.flashButtonContent}>
                          <Flashlight size={20} color={COLORS.accentYellow} />
                          <Text style={styles.flashButtonText}>On</Text>
                        </View>
                      )}
                      {flashMode === 'auto' && (
                        <View style={styles.flashButtonContent}>
                          <Flashlight size={20} color={COLORS.cleanGreen} />
                          <Text style={styles.flashButtonText}>Auto</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
                
              </View>
            </TapGestureHandler>
          </PinchGestureHandler>
        ) : (
          // Black placeholder when camera is not active
          <View style={[styles.camera, { backgroundColor: COLORS.black }]} />
        )}
      </View>


      {/* Zoom Slider (when expanded) */}
      {showZoomControls && (
        <View style={styles.zoomSliderContainer}>
          <Text style={styles.zoomLabel}>Zoom: {Math.round((zoom + 1) * 100)}%</Text>
          <View style={styles.zoomSliderTrack}>
            <View 
              style={[
                styles.zoomSliderThumb,
                { left: `${zoom * 100}%` }
              ]} 
            />
          </View>
        </View>
      )}


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
          <KeyboardIcon size={20} color={COLORS.textPrimary} />
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
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <SafeAreaView style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => {
                  Keyboard.dismiss();
                  setShowTextInput(false);
                }}>
                  <X size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Enter Ingredients</Text>
                <TouchableOpacity onPress={Keyboard.dismiss}>
                  <Text style={styles.doneButton}>Done</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView 
                style={styles.modalContent}
                keyboardShouldPersistTaps="handled"
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View>
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
                      returnKeyType="done"
                      blurOnSubmit={true}
                    />
                    
                    <TouchableOpacity onPress={analyzeManualText} style={styles.analyzeButtonContainer}>
                      <Text style={styles.analyzeButton}>Analyze Ingredients</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
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
                <Image 
                  source={{ uri: capturedPhoto }} 
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              )}
              
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
        
        {/* AI Analysis Loading Modal */}
        <AIAnalysisLoadingModal 
          visible={showAILoading} 
          thoughts={aiThoughts} 
          progress={aiProgress} 
          ingredientCount={ingredientCount} 
        />

        {/* Payment Method Modal */}
        <PaymentMethodModal
          visible={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            // Refresh subscription status after successful purchase
            refreshUserProfile();
          }}
        />
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
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 8,
    backgroundColor: COLORS.background,
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
    paddingVertical: 12,
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignSelf: 'stretch',
  },
  scanCounterText: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
    textAlign: 'center',
  },
  upgradeButtonSmall: {
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  upgradeButtonSmallText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodySmall,
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
    position: 'relative',
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
  focusIndicator: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: COLORS.accentYellow,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10,
  },
  zoomControls: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  zoomButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.white,
  },
  zoomSliderContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    borderRadius: 8,
  },
  zoomLabel: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    textAlign: 'center',
    marginBottom: 8,
  },
  zoomSliderTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    position: 'relative',
  },
  zoomSliderThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    backgroundColor: COLORS.accentYellow,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.white,
    transform: [{ translateX: -8 }],
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
  flashButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.white,
  },
  flashButtonContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  flashButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    textAlign: 'center',
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
  doneButton: {
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '600',
    color: COLORS.cleanGreen,
    fontFamily: FONTS.terminalGrotesque,
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
    height: 500,
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