/**
 * Stardew Valley-Inspired Pixel Art Color Palette
 * 
 * A fun, vibrant color scheme inspired by farm games and nature.
 * Used consistently throughout the entire app for a cohesive pixel art aesthetic.
 */

export const COLORS = {
  // PRIMARY COLORS
  background: '#f0f8e8',        // light mint green - unified background
  textPrimary: '#2d5016',       // dark forest green - main text
  textSecondary: '#4a7c59',     // medium forest green - headings
  border: '#4a7c59',            // forest green - all borders
  
  // ACCENT COLORS
  cleanGreen: '#6bbf47',        // vibrant grass green - healthy/positive
  toxicRed: '#e74c3c',          // warm red - warnings/toxic
  accentBlue: '#5dade2',        // sky blue - interactive elements
  accentYellow: '#f7dc6f',      // golden yellow - highlights/CTAs
  
  // UTILITY COLORS
  white: '#ffffff',             // pure white - for icons on dark backgrounds
  black: '#000000',             // pure black - for camera background
  gray: '#a0a0a0',              // gray - disabled states
  shadow: '#4a7c59',            // forest green - shadows for depth
} as const;

// Type for autocomplete support
export type ColorKey = keyof typeof COLORS;

