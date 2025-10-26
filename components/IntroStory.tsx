import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  SafeAreaView,
} from 'react-native';
import { X } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

const { width, height } = Dimensions.get('window');

// Scene configuration - pixel art images from assets/intro/
const SCENES = [
  {
    image: require('../assets/intro/scene1.jpeg'),
    text: "Meet Health Freak! Her family wasn't feeling their best because of bad ingredients...",
  },
  {
    image: require('../assets/intro/scene2.jpeg'),
    text: 'So she armed herself with a magnifying glass and knowledge',
  },
  {
    image: require('../assets/intro/scene3.jpeg'),
    text: 'She started learning how to identify ingredients at the store',
  },
  {
    image: require('../assets/intro/scene4.jpeg'),
    text: "Now her family is healthy and happy!",
  },
  {
    image: require('../assets/intro/scene5.jpeg'),
    text: "She still needs your help finding clean ingredients. Start scanning!",
  },
] as const;

interface IntroStoryProps {
  visible: boolean;
  onComplete: () => void;
}

export function IntroStory({ visible, onComplete }: IntroStoryProps) {
  const [currentScene, setCurrentScene] = useState(0);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Device classification and dynamic layout values
  const deviceSize = useMemo(() => {
    if (height < 700) return 'small';
    if (height < 850) return 'medium';
    return 'large';
  }, []);

  const layout = useMemo(() => ({
    imageFlex: deviceSize === 'small' ? 6 : 6.5,
    textFlex: deviceSize === 'small' ? 2.5 : 2.5,
    fontSize: deviceSize === 'small' ? FONT_SIZES.bodyMedium : FONT_SIZES.bodyLarge,
    lineHeight: deviceSize === 'small' ? LINE_HEIGHTS.bodyMedium : LINE_HEIGHTS.bodyLarge,
    spacing: deviceSize === 'small' ? 12 : 20,
    padding: deviceSize === 'small' ? 20 : 40,
    buttonPaddingVertical: deviceSize === 'small' ? 12 : 14,
    textSectionHeight: deviceSize === 'small' ? 150 : 
                       deviceSize === 'medium' ? 180 : 200,
  }), [deviceSize]);

  // Auto-advance to next scene (except last scene)
  useEffect(() => {
    if (!visible) return;

    // Clear any existing timer
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
    }

    // Don't auto-advance on last scene
    if (currentScene >= SCENES.length - 1) {
      return;
    }

    // Auto-advance after 5 seconds
    autoAdvanceTimer.current = setTimeout(() => {
      handleNext();
    }, 5000) as ReturnType<typeof setTimeout>;

    return () => {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }
    };
  }, [currentScene, visible]);

  // Reset to first scene when component becomes visible
  useEffect(() => {
    if (visible) {
      setCurrentScene(0);
      fadeAnim.setValue(1);
    }
  }, [visible]);

  const handleNext = () => {
    if (currentScene < SCENES.length - 1) {
      // Clear auto-advance timer
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }
      
      const nextScene = currentScene + 1;
      
      // Safety check - ensure next scene is valid
      if (nextScene >= SCENES.length) {
        console.error('[INTRO] Attempted to navigate to invalid scene:', nextScene);
        return;
      }
      
      // Smooth fade out, change scene, then fade in
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setCurrentScene(nextScene);
        // Longer delay to ensure image is loaded before fade in
        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        }, 100);
      });
    }
  };

  const handlePrevious = () => {
    if (currentScene > 0) {
      // Clear auto-advance timer
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }
      
      // Smooth fade out, change scene, then fade in
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setCurrentScene(prev => prev - 1);
        // Longer delay to ensure image is loaded before fade in
        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        }, 100);
      });
    }
  };

  const handleSkip = () => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
    }
    onComplete();
  };

  const handleComplete = () => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
    }
    onComplete();
  };

  if (!visible) return null;

  // Safety check - ensure currentScene is valid
  if (currentScene < 0 || currentScene >= SCENES.length) {
    console.error('[INTRO] Invalid scene index:', currentScene);
    onComplete();
    return null;
  }

  const isLastScene = currentScene === SCENES.length - 1;
  const scene = SCENES[currentScene];
  
  if (!scene) {
    console.error('[INTRO] Scene not found at index:', currentScene);
    onComplete();
    return null;
  }

  return (
    <>
      <StatusBar hidden />
      <SafeAreaView style={styles.container}>
        {/* Skip button */}
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <X size={24} color={COLORS.white} />
        </TouchableOpacity>

        {/* Scene content */}
        <View style={styles.content}>
          {/* Wrap both image and text in a single animated view for smooth transitions */}
          <Animated.View style={[styles.sceneContainer, { opacity: fadeAnim }]}>
            {/* Image */}
            <View style={[styles.imageContainer, { flex: layout.imageFlex }]}>
              <Image 
                source={scene.image} 
                style={styles.image} 
                resizeMode="contain"
                fadeDuration={300}
                onLoad={() => {
                  // Ensure image is fully loaded before showing
                }}
                onError={(error) => {
                  console.error('Error loading intro image:', error);
                  // If image fails to load, skip to next scene
                  if (currentScene < SCENES.length - 1) {
                    handleNext();
                  } else {
                    handleComplete();
                  }
                }}
              />
            </View>

            {/* Text section below image */}
            <View style={[styles.textSection, { paddingBottom: layout.padding, minHeight: layout.textSectionHeight }]}>
              <Text style={[styles.text, { fontSize: layout.fontSize, lineHeight: layout.lineHeight * 1.3, marginBottom: 20 }]}>{scene.text}</Text>

              {/* Pagination dots - only show on scenes 1-4 */}
              {!isLastScene && (
                <View style={styles.dotsContainer}>
                  {SCENES.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.dot,
                        index === currentScene && styles.dotActive,
                      ]}
                    />
                  ))}
                </View>
              )}

              {/* Final scene button or tap hint */}
              {isLastScene ? (
                <TouchableOpacity style={[styles.completeButton, { paddingVertical: layout.buttonPaddingVertical }]} onPress={handleComplete}>
                  <Text style={[styles.completeButtonText, { fontSize: layout.fontSize, lineHeight: layout.lineHeight }]}>Help Health Freak!</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.tapHint}>Tap to continue</Text>
              )}
            </View>
          </Animated.View>
        </View>

        {/* Tap areas for navigation - only show if not on last scene */}
        {!isLastScene && (
          <View style={styles.tapAreasContainer}>
            {/* Left tap area for going back */}
            {currentScene > 0 && (
              <TouchableOpacity
                style={styles.tapAreaLeft}
                activeOpacity={1}
                onPress={handlePrevious}
              />
            )}
            {/* Right tap area for going forward */}
            <TouchableOpacity
              style={styles.tapAreaRight}
              activeOpacity={1}
              onPress={handleNext}
            />
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  skipButton: {
    position: 'absolute',
    top: 10,
    right: 20,
    zIndex: 10000,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 20,
  },
  sceneContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  imageContainer: {
    width: width,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 0,
  },
  image: {
    width: width * 0.98,
    height: '100%',
  },
  textSection: {
    width: '100%',
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: {
    fontWeight: '400',
    color: COLORS.white,
    textAlign: 'center',
    fontFamily: FONTS.terminalGrotesque,
    flexWrap: 'wrap',
    width: '100%',
    flexShrink: 1,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.gray,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: COLORS.cleanGreen,
    width: 24,
  },
  tapHint: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.white,
    opacity: 0.7,
    fontFamily: FONTS.terminalGrotesque,
    marginTop: 0,
  },
  completeButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingHorizontal: 28,
    borderRadius: 8,
    zIndex: 10001,
    marginTop: 0,
  },
  completeButtonText: {
    fontWeight: 'bold',
    color: COLORS.white,
    fontFamily: FONTS.terminalGrotesque,
  },
  tapAreasContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    flexDirection: 'row',
  },
  tapAreaLeft: {
    flex: 1,
    height: '100%',
  },
  tapAreaRight: {
    flex: 1,
    height: '100%',
  },
});

