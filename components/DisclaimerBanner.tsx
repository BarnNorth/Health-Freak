import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TriangleAlert as AlertTriangle } from 'lucide-react-native';

interface DisclaimerBannerProps {
  variant?: 'warning' | 'info';
  text?: string;
}

export function DisclaimerBanner({ 
  variant = 'warning', 
  text = '📚 Educational information only - not medical or health advice. Individual dietary needs vary - consult healthcare providers.'
}: DisclaimerBannerProps) {
  return (
    <View style={[
      styles.container,
      variant === 'warning' ? styles.warningContainer : styles.infoContainer
    ]}>
      <AlertTriangle 
        size={16} 
        color={variant === 'warning' ? '#f59e0b' : '#3b82f6'} 
      />
      <Text style={[
        styles.text,
        variant === 'warning' ? styles.warningText : styles.infoText
      ]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  warningContainer: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  infoContainer: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
  warningText: {
    color: '#92400e',
  },
  infoText: {
    color: '#1e40af',
  },
});