import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { ArrowLeft, User } from 'lucide-react-native';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function DeveloperNoteScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.cleanGreen} />
        </TouchableOpacity>
        <Text style={styles.title}>Note from Developer</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Content */}
        <View style={styles.contentContainer}>
          <Text style={styles.contentText}>
            Hey! I'm BarnNorth, and I built Health Freak by myself from the ground up using AI.
            {'\n\n'}
            After 8 years working in tech, I found myself feeling a bit lost and disconnected from the work I was doing. But then I saw something that really piqued my interest: people on social media building their own apps with the help of AI. Not traditional developers, just regular people with ideas and determination.
            {'\n\n'}
            I thought, "Why not me?"
            {'\n\n'}
            This app actually started as my wife's idea. She's deeply into the crunchy lifestyle and is always trying to get me to eat better and use cleaner products. When she mentioned wanting an app like this, I told her I could build it. So Health Freak is really my attempt to make her lifestyle easier—and maybe it'll help other people too.
            {'\n\n'}
            I've spent many nights working on this for hours, learning how to vibecode and sort-of understanding how software engineering works. I'm no engineer, but this has been a great learning experience. It's also been one of the most fun personal projects I've ever taken on. It boosted my mood and genuinely made everything in my life better because I was finally working on something I cared about.
            {'\n\n'}
            Even if this is just a silly little app that probably won't amount to much, it's been an accomplishment for me. And honestly? That's enough.
            {'\n\n'}
            Thanks for being part of this journey with me. I hope you enjoy using Health Freak as much as I enjoyed building it.
            {'\n\n'}
            Sincerely, BarnNorth
            {'\n\n'}
            "Indecision kills more dreams than bad decisions." — Alex Hormozi
            {'\n\n'}
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
  contentContainer: {
    backgroundColor: COLORS.background,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  contentText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textSecondary,
    lineHeight: LINE_HEIGHTS.bodyMedium,
    fontFamily: FONTS.terminalGrotesque,
  },
});

