import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { User, Mail, Lock, ArrowLeft } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { signIn, signUp, loading } = useAuth();
  const { error } = useLocalSearchParams();

  // Handle callback errors
  useEffect(() => {
    if (error) {
      const errorMessage = decodeURIComponent(error as string);
      Alert.alert(
        'Authentication Error',
        errorMessage,
        [{ text: 'OK' }]
      );
    }
  }, [error]);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    try {
      if (isSignUp) {
        await signUp(email, password);
        // Navigate to email confirmation screen instead of showing alert
        router.push({
          pathname: '/email-confirmation',
          params: { email: email }
        });
      } else {
        await signIn(email, password);
        router.replace('/');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Authentication failed');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.cleanGreen} />
        </TouchableOpacity>
        <Text style={styles.title}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <User size={48} color={COLORS.cleanGreen} />
        </View>

        <Text style={styles.subtitle}>
          {isSignUp ? 'Join our educational community' : 'Welcome back'}
        </Text>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Mail size={20} color={COLORS.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={COLORS.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Lock size={20} color={COLORS.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={COLORS.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {isSignUp && (
            <View style={styles.inputContainer}>
              <Lock size={20} color={COLORS.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="Confirm password"
                placeholderTextColor={COLORS.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.authButton, loading && styles.authButtonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            <Text style={styles.authButtonText}>
              {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsSignUp(!isSignUp)}
          >
            <Text style={styles.switchButtonText}>
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            By creating an account, you agree to our Terms of Service and acknowledge that this app provides educational information only, not medical advice.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    fontSize: FONT_SIZES.titleXL,
    fontWeight: '400',
    color: COLORS.textPrimary,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleXL,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  subtitle: {
    fontSize: FONT_SIZES.titleSmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: FONTS.karmaFuture,
    lineHeight: LINE_HEIGHTS.titleSmall,
  },
  form: {
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textPrimary,
    marginLeft: 12,
    fontFamily: FONTS.terminalGrotesque,
  },
  authButton: {
    backgroundColor: COLORS.cleanGreen,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  authButtonDisabled: {
    backgroundColor: COLORS.gray,
  },
  authButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyLarge,
  },
  switchButton: {
    alignItems: 'center',
    marginTop: 16,
  },
  switchButtonText: {
    color: COLORS.cleanGreen,
    fontSize: FONT_SIZES.bodyMedium,
    fontWeight: '400',
    fontFamily: FONTS.terminalGrotesque,
    lineHeight: LINE_HEIGHTS.bodyMedium,
  },
  disclaimer: {
    backgroundColor: COLORS.accentYellow,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  disclaimerText: {
    fontSize: FONT_SIZES.bodyMedium,
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.bodyMedium,
    fontFamily: FONTS.terminalGrotesque,
  },
});