import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts as useCustomFonts } from 'expo-font';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/colors';

export default function RootLayout() {
  useFrameworkReady();
  
  // Load custom fonts
  const [customFontsLoaded] = useCustomFonts({
    'KarmaFuture-Regular': require('../assets/fonts/karma.future-regular.otf'),
    'TerminalGrotesque': require('../assets/fonts/terminal-grotesque.ttf'),
  });

  if (!customFontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar 
        style="dark" 
        backgroundColor={COLORS.background}
      />
    </AuthProvider>
  );
}
