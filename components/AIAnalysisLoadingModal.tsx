import React, { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, ScrollView, SafeAreaView, Animated } from 'react-native';
import { COLORS } from '../constants/colors';
import { FONTS, FONT_SIZES } from '../constants/typography';

export interface AIThought {
  message: string;
  emoji: string;
  timestamp: number;
  type: string;
}

interface Props {
  visible: boolean;
  thoughts: AIThought[];
  progress: number;
  ingredientCount: number;
}

export function AIAnalysisLoadingModal({ visible, thoughts, progress, ingredientCount }: Props) {
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (thoughts.length > 0) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  }, [thoughts.length]);

  return (
    <Modal visible={visible} animationType="fade">
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 24 }}>
          <Text style={{ fontSize: FONT_SIZES.titleXL, fontWeight: '600', color: COLORS.textPrimary, fontFamily: FONTS.karmaFuture, textAlign: 'center' }}>
            🧪 AI Analysis Lab
          </Text>
          <Text style={{ fontSize: FONT_SIZES.bodyMedium, color: COLORS.textSecondary, fontFamily: FONTS.terminalGrotesque, marginTop: 8, textAlign: 'center' }}>
            Analyzing {ingredientCount} ingredient{ingredientCount !== 1 ? 's' : ''}...
          </Text>
        </View>
        
        <View style={{ paddingHorizontal: 20, marginBottom: 32 }}>
          <View style={{ height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <View style={{ height: '100%', width: `${Math.min(progress, 100)}%`, backgroundColor: COLORS.cleanGreen, borderRadius: 4 }} />
          </View>
          <Text style={{ fontSize: FONT_SIZES.bodySmall, color: COLORS.textSecondary, fontFamily: FONTS.terminalGrotesque, textAlign: 'center' }}>
            {Math.round(progress)}%
          </Text>
        </View>
        
        <ScrollView ref={scrollViewRef} style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
          {thoughts.map((thought, idx) => (
            <Animated.View key={`${thought.timestamp}-${idx}`} style={{
              flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(74, 124, 89, 0.05)',
              padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border,
              opacity: idx === thoughts.length - 1 ? fadeAnim : 1
            }}>
              <Text style={{ fontSize: 24, marginRight: 12 }}>{thought.emoji}</Text>
              <Text style={{ flex: 1, fontSize: FONT_SIZES.bodyMedium, color: COLORS.textPrimary, fontFamily: FONTS.terminalGrotesque }}>
                {thought.message}
              </Text>
            </Animated.View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

