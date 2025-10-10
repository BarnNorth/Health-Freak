import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.text}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: COLORS.background,
  },
  text: {
    fontSize: FONT_SIZES.titleSmall,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.cleanGreen,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
});
