import { Tabs } from 'expo-router';
import { Camera, FileSearch, History, User } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.cleanGreen,
        tabBarInactiveTintColor: COLORS.border,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopWidth: 2,
          borderTopColor: COLORS.border,
          paddingTop: 8,
          paddingBottom: 8,
          height: 80,
          shadowColor: COLORS.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: FONT_SIZES.bodyMedium,
          fontWeight: '400',
          marginTop: 4,
          fontFamily: FONTS.terminalGrotesque,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Camera',
          tabBarIcon: ({ size, color }) => (
            <Camera size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ size, color }) => (
            <History size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ size, color }) => (
            <User size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}