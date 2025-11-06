import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { FONTS, FONT_SIZES, LINE_HEIGHTS } from '@/constants/typography';

interface IngredientSourcesProps {
  sources: Array<{
    title: string;
    url: string;
    type: string;
  }>;
  ingredientName: string;
}

/**
 * Helper function to get friendly labels for source types
 */
function getSourceTypeLabel(type: string): string {
  switch (type) {
    case 'research':
      return 'Research Study';
    case 'database':
      return 'Safety Database';
    case 'regulatory':
      return 'Regulatory Body';
    case 'other':
      return 'Source';
    default:
      return 'Source';
  }
}

export function IngredientSources({ sources, ingredientName }: IngredientSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Return null if no sources or empty array
  if (!sources || sources.length === 0) {
    return null;
  }

  const handleSourcePress = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  return (
    <View style={styles.container}>
      {/* Collapsible Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.headerText}>
          View Sources ({sources.length})
        </Text>
        {isExpanded ? (
          <ChevronUp size={14} color={COLORS.white} />
        ) : (
          <ChevronDown size={14} color={COLORS.white} />
        )}
      </TouchableOpacity>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={styles.content}>
          <Text style={styles.disclaimer}>
            Information about {ingredientName} is based on the following sources:
          </Text>

          {sources.map((source, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.sourceItem,
                index === sources.length - 1 && styles.sourceItemLast
              ]}
              onPress={() => handleSourcePress(source.url)}
              activeOpacity={0.7}
            >
              <ExternalLink size={14} color={COLORS.white} />
              <View style={styles.sourceContent}>
                <Text style={styles.sourceTitle} numberOfLines={2}>
                  {source.title}
                </Text>
                <Text style={styles.sourceType}>
                  {getSourceTypeLabel(source.type)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    gap: 4,
  },
  headerText: {
    fontSize: FONT_SIZES.bodySmall,
    fontFamily: FONTS.terminalGrotesque,
    color: COLORS.white,
    lineHeight: LINE_HEIGHTS.bodySmall,
    fontWeight: '400',
  },
  content: {
    marginTop: 8,
    paddingTop: 8,
  },
  disclaimer: {
    fontSize: FONT_SIZES.bodySmall,
    fontFamily: FONTS.terminalGrotesque,
    color: COLORS.white,
    lineHeight: LINE_HEIGHTS.bodySmall,
    marginBottom: 12,
    fontWeight: '400',
    opacity: 0.9,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 8,
    gap: 4,
  },
  sourceItemLast: {
    marginBottom: 0,
  },
  sourceContent: {
    flex: 1,
  },
  sourceTitle: {
    flex: 1,
    fontSize: FONT_SIZES.bodySmall,
    fontFamily: FONTS.terminalGrotesque,
    color: COLORS.white,
    lineHeight: LINE_HEIGHTS.bodySmall,
    textDecorationLine: 'underline',
    fontWeight: '400',
  },
  sourceType: {
    fontSize: FONT_SIZES.bodyTiny,
    fontFamily: FONTS.terminalGrotesque,
    color: COLORS.white,
    lineHeight: LINE_HEIGHTS.bodyTiny,
    marginTop: 2,
    fontWeight: '400',
    opacity: 0.8,
  },
});
