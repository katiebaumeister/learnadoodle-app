import { Platform } from 'react-native';
import { designTokens, getSubjectAccent } from './designTokens';
import { useColorMode } from '../contexts/ColorModeContext';

/**
 * Backwards-compatible color exports while leaning on the new design tokens.
 * Now supports color mode context for sensory-friendly modes.
 */

// Default colors (fallback when context not available)
const defaultColors = {
  bg: designTokens.colors.paper,
  bgSubtle: '#f8f9ff',
  panel: '#f6f8ff',
  card: designTokens.colors.paper,
  border: 'rgba(15, 23, 42, 0.08)',
  text: designTokens.colors.ink,
  muted: 'rgba(15, 23, 42, 0.65)',
  accent: designTokens.accents.core,
  accentContrast: '#ffffff',
  background: designTokens.colors.paper,
  textSecondary: 'rgba(15, 23, 42, 0.65)',
  error: '#e2556a',
  white: '#ffffff',
  indigo: designTokens.accents.math,
  green: designTokens.accents.science,
  blue: designTokens.accents.core,
  orange: '#f08a24',
  red: '#e2556a',
  purple: designTokens.accents.reading,
  redSoft: '#fde2e4',
  redBold: '#e2556a',
  orangeSoft: '#ffe7d1',
  orangeBold: '#f08a24',
  yellowSoft: '#fff6cc',
  yellowBold: '#c5a100',
  greenSoft: '#e4f5e7',
  greenBold: designTokens.accents.science,
  blueSoft: designTokens.softAccents.core,
  blueBold: designTokens.accents.core,
  indigoSoft: designTokens.softAccents.math,
  indigoBold: designTokens.accents.math,
  violetSoft: designTokens.softAccents.reading,
  violetBold: designTokens.accents.reading,
  radiusMd: 12,
  radiusLg: designTokens.radius,
};

// Hook version that uses color mode context
export function useColors() {
  try {
    const { colors: modeColors } = useColorMode();
    return {
      ...defaultColors,
      bg: modeColors.background || defaultColors.bg,
      bgSubtle: modeColors.bgSubtle || defaultColors.bgSubtle,
      panel: modeColors.panel || defaultColors.panel,
      card: modeColors.card || defaultColors.card,
      border: modeColors.border || defaultColors.border,
      text: modeColors.text || defaultColors.text,
      muted: modeColors.muted || defaultColors.muted,
      accent: modeColors.accent || defaultColors.accent,
      background: modeColors.background || defaultColors.background,
    };
  } catch {
    // Context not available, return defaults
    return defaultColors;
  }
}

// Static export for backwards compatibility (uses defaults)
export const colors = defaultColors;

const shadowDefinitions = {
  sm: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 0,
    elevation: 1,
    boxShadow: '0 1px 0 rgba(16,24,40,.04)',
  },
  md: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
    boxShadow: '0 1px 2px rgba(16,24,40,.06), 0 1px 1px rgba(16,24,40,.04)',
  },
  lg: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
    boxShadow: '0 2px 4px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.06)',
  },
  large: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    boxShadow: '0 4px 8px rgba(16,24,40,.1), 0 2px 4px rgba(16,24,40,.08)',
  },
};

// Helper function to get platform-appropriate shadow styles
export function getShadow(level = 'md') {
  const shadow = shadowDefinitions[level] || shadowDefinitions.md;
  return Platform.OS === 'web'
    ? { boxShadow: shadow.boxShadow }
    : {
        shadowColor: shadow.shadowColor,
        shadowOffset: shadow.shadowOffset,
        shadowOpacity: shadow.shadowOpacity,
        shadowRadius: shadow.shadowRadius,
        elevation: shadow.elevation,
      };
}

// Legacy export for backwards compatibility (deprecated - use getShadow instead)
export const shadows = {
  sm: shadowDefinitions.sm,
  md: shadowDefinitions.md,
  lg: shadowDefinitions.lg,
  large: shadowDefinitions.large,
};

export const rainbow = {
  red: { soft: '#fde2e4', bold: '#e2556a' },
  orange: { soft: '#ffe7d1', bold: '#f08a24' },
  yellow: { soft: '#fff6cc', bold: '#c5a100' },
  green: { soft: '#ecfdf3', bold: designTokens.accents.science },
  blue: { soft: designTokens.softAccents.core, bold: designTokens.accents.core },
  indigo: { soft: designTokens.softAccents.math, bold: designTokens.accents.math },
  violet: { soft: designTokens.softAccents.reading, bold: designTokens.accents.reading },
};

// Helper to get category color compatible with legacy callers.
export function getCategoryColor(category) {
  const accent = getSubjectAccent(category);
  return {
    soft: accent.soft,
    bold: accent.bold,
  };
}

