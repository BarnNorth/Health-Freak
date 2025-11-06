import React, { useRef, useEffect, useState } from 'react';
import { Modal, View, Text, SafeAreaView, Dimensions } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withSequence, 
  withTiming,
  withRepeat,
  interpolateColor,
  SlideInLeft,
  FadeOut
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants/colors';
import { FONTS, FONT_SIZES } from '../constants/typography';

export interface AIThought {
  message: string;
  emoji: string;
  timestamp: number;
  type: string;
  isToxic?: boolean;
  isComplete?: boolean;
}

interface Props {
  visible: boolean;
  thoughts: AIThought[];
  ingredientCount: number;
  cleanCount: number;
  toxicCount: number;
}

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  angle: number;
  rotation: number;
}

// Pulsing emoji component
function PulsingEmoji({ emoji }: { emoji: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.15, { duration: 1500 }),
      -1,
      true
    );
    opacity.value = withRepeat(
      withTiming(1, { duration: 1500 }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Text style={{ fontSize: 120, marginBottom: 16 }}>{emoji}</Text>
    </Animated.View>
  );
}

// Thought cloud component for single thought display (retro game style)
function ThoughtCloudBubble({ thought }: { thought: AIThought }) {
  const shakeX = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  const hapticTriggered = useRef(false);

  useEffect(() => {
    // Main cloud bounce in animation
    scale.value = withSpring(1, { damping: 15, stiffness: 120, overshootClamping: true });
    opacity.value = withTiming(1, { duration: 200 });

    // Shake if toxic
    if (thought.isToxic && !hapticTriggered.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      hapticTriggered.current = true;
      
      setTimeout(() => {
        shakeX.value = withSequence(
          withTiming(-8, { duration: 50 }),
          withTiming(8, { duration: 50 }),
          withTiming(-4, { duration: 50 }),
          withTiming(4, { duration: 50 }),
          withTiming(0, { duration: 50 })
        );
      }, 300);
    }
  }, [thought.isToxic]);

  const cloudStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: shakeX.value }
    ],
    opacity: opacity.value,
  }));

  // Determine background color based on type and toxic status
  const getBackgroundColor = () => {
    if (thought.isToxic) return 'rgba(231, 76, 60, 0.2)'; // red tint
    if (thought.type === 'parsing' || thought.type === 'ocr') return 'rgba(93, 173, 226, 0.15)'; // blue tint
    return 'rgba(107, 191, 71, 0.15)'; // green tint
  };

  const getBorderColor = () => {
    if (thought.isToxic) return COLORS.toxicRed;
    if (thought.type === 'parsing' || thought.type === 'ocr') return COLORS.accentBlue;
    return COLORS.cleanGreen;
  };

  return (
    <View
      style={{
        alignItems: 'center',
        marginHorizontal: 20,
        marginTop: 20,
      }}
    >
      {/* Main thought cloud */}
      <Animated.View
        style={[
          cloudStyle,
          {
            width: '100%',
            backgroundColor: getBackgroundColor(),
            paddingVertical: 20,
            paddingHorizontal: 24,
            borderRadius: 20,
            borderWidth: 3,
            borderColor: getBorderColor(),
            alignItems: 'center',
          }
        ]}
      >
        <Text style={{ fontSize: 56, marginBottom: 12 }}>{thought.emoji}</Text>
        <Text style={{ 
          fontSize: FONT_SIZES.bodyLarge, 
          color: COLORS.textPrimary, 
          fontFamily: FONTS.terminalGrotesque,
          textAlign: 'center',
          fontWeight: '600',
        }}>
          {thought.message}
        </Text>
      </Animated.View>
    </View>
  );
}

// Spinning emoji loader
function RotatingArrowsLoader({ isComplete }: { isComplete: boolean }) {
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 3000 }),
      -1,
      false
    );
  }, []);

  useEffect(() => {
    if (isComplete) {
      opacity.value = withTiming(0, { duration: 500 });
    } else {
      opacity.value = withTiming(1, { duration: 300 });
    }
  }, [isComplete]);

  const emojiStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ alignItems: 'center', marginBottom: 32, height: 120, justifyContent: 'center' }}>
      <Animated.Text style={[{ fontSize: 64 }, emojiStyle]}>
        ⏳
      </Animated.Text>
      <Text style={{ 
        fontSize: FONT_SIZES.bodyMedium, 
        color: COLORS.textSecondary, 
        fontFamily: FONTS.terminalGrotesque,
        textAlign: 'center',
        marginTop: 16
      }}>
        Analyzing ingredients...
      </Text>
    </View>
  );
}

// Confetti particle component
function ConfettiParticle({ particle }: { particle: ConfettiParticle }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const radians = (particle.angle * Math.PI) / 180;
    const distance = 150 + Math.random() * 100;
    
    translateX.value = withSpring(Math.cos(radians) * distance, { damping: 10, stiffness: 50 });
    translateY.value = withSpring(Math.sin(radians) * distance - 100, { damping: 10, stiffness: 50 });
    rotate.value = withSpring(particle.rotation, { damping: 8, stiffness: 40 });
    opacity.value = withTiming(0, { duration: 1500 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          position: 'absolute',
          width: particle.size,
          height: particle.size,
          borderRadius: particle.size / 2,
          backgroundColor: particle.color,
          left: particle.x,
          top: particle.y,
        }
      ]}
    />
  );
}

export function AIAnalysisLoadingModal({ 
  visible, 
  thoughts, 
  ingredientCount, 
  cleanCount, 
  toxicCount 
}: Props) {
  const [confettiParticles, setConfettiParticles] = useState<ConfettiParticle[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState({ cleanCount: 0, toxicCount: 0 });
  const { width: screenWidth } = Dimensions.get('window');

  // Determine animation state
  const isComplete = thoughts.some(t => t.isComplete);
  const hasToxicIngredients = thoughts.some(t => t.isToxic);
  const isCleanResult = isComplete && !hasToxicIngredients;

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setShowSummary(false);
      setConfettiParticles([]);
      setSummaryData({ cleanCount: 0, toxicCount: 0 });
    }
  }, [visible]);

  // Trigger confetti on clean completion
  useEffect(() => {
    if (isCleanResult && confettiParticles.length === 0) {
      const centerX = screenWidth / 2;
      const centerY = 200;
      
      const particles: ConfettiParticle[] = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: centerX - 5,
        y: centerY - 5,
        size: 8 + Math.random() * 8,
        color: [COLORS.cleanGreen, COLORS.accentYellow, COLORS.accentBlue][Math.floor(Math.random() * 3)],
        angle: (360 / 20) * i + (Math.random() * 30 - 15),
        rotation: Math.random() * 720,
      }));
      
      setConfettiParticles(particles);
      
      // Clear confetti after animation
      setTimeout(() => setConfettiParticles([]), 2000);
    }
  }, [isCleanResult]);

  // Show summary after completion (only if we have actual thoughts)
  useEffect(() => {
    // Reset summary if not complete
    if (!isComplete) {
      setShowSummary(false);
      return;
    }
    
    if (isComplete && !showSummary && thoughts.length > 1 && visible) {
      setSummaryData({ cleanCount, toxicCount }); // Use props directly
      setShowSummary(true);
      
      // Trigger haptic if toxic found
      if (hasToxicIngredients) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    }
  }, [isComplete, visible, thoughts.length, hasToxicIngredients, cleanCount, toxicCount]);


  // Context-aware emoji display
  const getEmojiDisplay = () => {
    if (isComplete) {
      return hasToxicIngredients ? '⚠️' : '✨';
    }
    return '🧪';
  };

  return (
    <Modal visible={visible} animationType="fade">
      <LinearGradient
        colors={[COLORS.background, '#e8f5dc']}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {/* Confetti particles */}
          {confettiParticles.map(particle => (
            <ConfettiParticle key={particle.id} particle={particle} />
          ))}

          <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 24 }}>
            {/* Pulsing Emoji */}
            <PulsingEmoji emoji={getEmojiDisplay()} />
            
            <Text style={{ 
              fontSize: FONT_SIZES.titleXL, 
              fontWeight: '600', 
              color: COLORS.textPrimary, 
              fontFamily: FONTS.karmaFuture, 
              textAlign: 'center' 
            }}>
              AI Analysis Lab
            </Text>
          </View>
          
          {/* Rotating Arrows Loader */}
          {!showSummary && <RotatingArrowsLoader isComplete={isComplete} />}
          
          {/* Single Thought Bubble - Shows only latest thought */}
          <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 40 }}>
            {(() => {
              const currentThought = thoughts[thoughts.length - 1];
              
              // Show summary if complete, otherwise show current thought
              if (showSummary) {
                return (
                  <Animated.View
                    entering={SlideInLeft.springify().damping(15).stiffness(100).delay(200)}
                    style={{
                      backgroundColor: isCleanResult ? 'rgba(107, 191, 71, 0.2)' : 'rgba(231, 76, 60, 0.2)',
                      padding: 24,
                      borderRadius: 16,
                      marginHorizontal: 20,
                      borderWidth: 3,
                      borderColor: isCleanResult ? COLORS.cleanGreen : COLORS.toxicRed,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      fontSize: 64,
                      marginBottom: 12,
                    }}>
                      {isCleanResult ? '✨' : '⚠️'}
                    </Text>
                    <Text style={{
                      fontSize: FONT_SIZES.titleMedium,
                      fontFamily: FONTS.karmaFuture,
                      color: COLORS.textPrimary,
                      textAlign: 'center',
                      marginBottom: 12,
                    }}>
                      {isCleanResult ? 'Analysis Complete!' : 'Analysis Complete'}
                    </Text>
                    <Text style={{
                      fontSize: FONT_SIZES.bodyLarge,
                      fontFamily: FONTS.terminalGrotesque,
                      color: COLORS.textPrimary,
                      textAlign: 'center',
                      fontWeight: '600',
                    }}>
                      ✅ {summaryData.cleanCount} Clean | ⚠️ {summaryData.toxicCount} Toxic
                    </Text>
                  </Animated.View>
                );
              } else if (currentThought) {
                return (
                  <ThoughtCloudBubble 
                    key={currentThought.timestamp}
                    thought={currentThought}
                  />
                );
              }
              return null;
            })()}
          </View>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}
