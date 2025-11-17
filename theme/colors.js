import { designTokens, getSubjectAccent } from './designTokens';

/**
 * Backwards-compatible color exports while leaning on the new design tokens.
 */

export const colors = {
  bg: designTokens.colors.paper,
  bgSubtle: '#f8f9ff',
  panel: '#f6f8ff',
  card: designTokens.colors.paper,
  border: 'rgba(15, 23, 42, 0.08)',
  text: designTokens.colors.ink,
  muted: 'rgba(15, 23, 42, 0.65)',
  accent: designTokens.accents.core,
  accentContrast: '#ffffff',
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

export const shadows = {
  sm: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 0,
    elevation: 1,
    // Web compatibility
    boxShadow: '0 1px 0 rgba(16,24,40,.04)',
  },
  md: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
    // Web compatibility
    boxShadow: '0 1px 2px rgba(16,24,40,.06), 0 1px 1px rgba(16,24,40,.04)',
  },
  lg: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
    // Web compatibility
    boxShadow: '0 2px 4px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.06)',
  },
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

