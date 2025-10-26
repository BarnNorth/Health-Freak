/**
 * Typography System
 * 
 * A consistent typography hierarchy for the entire app:
 * - Headers/Titles: Karma Future (custom font)
 * - Body/Buttons: Terminal Grotesque (monospaced terminal font)
 */

export const FONTS = {
  // Headers/Titles - Karma Future
  karmaFuture: 'KarmaFuture-Regular',
  
  // Body/Buttons - Terminal Grotesque
  terminalGrotesque: 'TerminalGrotesque',
} as const;

export const FONT_SIZES = {
  // Karma Future sizes (Headers/Titles)
  titleXL: 48,      // Main app title
  titleLarge: 36,   // Screen headers
  titleMedium: 24,  // Section headers
  titleSmall: 20,   // Subsection headers
  
  // Terminal Grotesque sizes (Body/Buttons)
  bodyLarge: 25,    // Large body text (was 20px, +25%)
  bodyMedium: 21,   // Standard body text, large buttons (was 17px, +25%)
  bodySmall: 18,    // Small body text, standard buttons (was 14px, +25%)
  bodyTiny: 14,     // Tiny text, labels (was 11px, +25%)
  bodyMicro: 10,    // Very small text (was 8px, +25%)
} as const;

export const LINE_HEIGHTS = {
  // Karma Future line heights
  titleXL: 52,
  titleLarge: 40,
  titleMedium: 28,
  titleSmall: 24,
  
  // Terminal Grotesque line heights
  bodyLarge: 31,    // was 25px, +25%
  bodyMedium: 28,   // was 22px, +25%
  bodySmall: 25,    // was 20px, +25%
  bodyTiny: 21,     // was 17px, +25%
  bodyMicro: 14,    // was 11px, +25%
} as const;

// Type definitions for autocomplete support
export type FontKey = keyof typeof FONTS;
export type FontSize = keyof typeof FONT_SIZES;
export type LineHeight = keyof typeof LINE_HEIGHTS;

