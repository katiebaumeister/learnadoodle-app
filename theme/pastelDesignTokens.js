/**
 * Enhanced design tokens for the pastel operating-system aesthetic
 * Supports sensory modes: pastel, low-stimuli, high-contrast
 */

export const sensoryModes = {
  pastel: {
    name: 'Pastel Mode',
    description: 'Soft gradients and gentle colors create a calming, supportive visual experience.',
    tokens: {
      // Backgrounds
      bg: '#FAF9F7',
      bgCanvas: '#1A1A1A', // Dark speckled background (like OS)
      bgSubtle: '#F5F4F2',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      
      // Text
      text: '#2D2D2D',
      textSecondary: '#6B6B6B',
      textMuted: '#9B9B9B',
      
      // Borders & Dividers
      border: '#E8E6E3',
      divider: 'rgba(232, 230, 227, 0.6)',
      
      // Accents (soft pastels)
      accent: '#8B7CF6',
      accentSoft: '#F5F3FF',
      
      // Pastel palette
      pastels: {
        lavender: '#F5F3FF',
        mint: '#F0FDF4',
        peach: '#FFF5F5',
        sky: '#F0F9FF',
        rose: '#FFF1F2',
        yellow: '#FEFCE8',
        cream: '#FEFCF8',
      },
      
      // Shadows (Geist-inspired materials)
      shadow: {
        // Surface shadows
        base: '0 1px 2px rgba(0, 0, 0, 0.04)',
        small: '0 1px 3px rgba(0, 0, 0, 0.06)',
        medium: '0 2px 8px rgba(0, 0, 0, 0.08)',
        large: '0 4px 16px rgba(0, 0, 0, 0.1)',
        // Floating shadows
        tooltip: '0 4px 12px rgba(0, 0, 0, 0.08)',
        menu: '0 8px 24px rgba(0, 0, 0, 0.12)',
        modal: '0 12px 32px rgba(0, 0, 0, 0.16)',
        fullscreen: '0 16px 48px rgba(0, 0, 0, 0.2)',
        // Card shadows
        card: '0 2px 12px rgba(139, 124, 246, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
        cardHover: '0 4px 20px rgba(139, 124, 246, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06)',
        floating: '0 8px 24px rgba(139, 124, 246, 0.1), 0 4px 8px rgba(0, 0, 0, 0.04)',
        // Focus ring
        focusRing: '0 0 0 3px rgba(139, 124, 246, 0.15)',
      },
      
      // Icon colors (monochrome)
      icon: '#2D2D2D',
      iconMuted: '#9B9B9B',
    },
  },
  low: {
    name: 'Low-Stimuli Mode',
    description: 'Simplified interface with reduced visual elements and muted tones for focused comfort.',
    tokens: {
      bg: '#F5F5F5',
      bgCanvas: '#1A1A1A',
      bgSubtle: '#F0F0F0',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      
      text: '#1A1A1A',
      textSecondary: '#666666',
      textMuted: '#9B9B9B',
      
      border: '#D0D0D0',
      divider: '#E0E0E0',
      
      accent: '#4A4A4A',
      accentSoft: '#E8E8E8',
      
      pastels: {
        lavender: '#F0F0F0',
        mint: '#F0F0F0',
        peach: '#F0F0F0',
        sky: '#F0F0F0',
        rose: '#F0F0F0',
        yellow: '#F0F0F0',
        cream: '#F0F0F0',
      },
      
      shadow: {
        base: 'none',
        small: 'none',
        medium: 'none',
        large: 'none',
        tooltip: 'none',
        menu: 'none',
        modal: 'none',
        fullscreen: 'none',
        card: 'none',
        cardHover: '0 1px 2px rgba(0, 0, 0, 0.04)',
        floating: 'none',
        focusRing: '0 0 0 2px rgba(74, 74, 74, 0.2)',
      },
      
      icon: '#1A1A1A',
      iconMuted: '#9B9B9B',
    },
  },
  contrast: {
    name: 'High-Contrast Mode',
    description: 'Bold black and white design ensures maximum readability and clarity.',
    tokens: {
      bg: '#FFFFFF',
      bgCanvas: '#000000',
      bgSubtle: '#FFFFFF',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      
      text: '#000000',
      textSecondary: '#333333',
      textMuted: '#666666',
      
      border: '#000000',
      divider: '#000000',
      
      accent: '#000000',
      accentSoft: '#F0F0F0',
      
      pastels: {
        lavender: '#FFFFFF',
        mint: '#FFFFFF',
        peach: '#FFFFFF',
        sky: '#FFFFFF',
        rose: '#FFFFFF',
        yellow: '#FFFFFF',
        cream: '#FFFFFF',
      },
      
      shadow: {
        base: '0 0 0 1px #000000',
        small: '0 0 0 1px #000000',
        medium: '0 0 0 2px #000000',
        large: '0 0 0 2px #000000',
        tooltip: '0 0 0 2px #000000',
        menu: '0 0 0 2px #000000',
        modal: '0 0 0 3px #000000',
        fullscreen: '0 0 0 3px #000000',
        card: '0 0 0 2px #000000',
        cardHover: '0 0 0 3px #000000',
        floating: '0 0 0 2px #000000',
        focusRing: '0 0 0 3px #000000',
      },
      
      icon: '#000000',
      iconMuted: '#333333',
    },
  },
};

// Typography
export const typography = {
  fonts: {
    display: '"Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", "Droid Sans Mono", monospace',
  },
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 30,
    '3xl': 36,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// Spacing scale (Geist-inspired: 4, 8, 12, 16, 20, 24, 32, 40)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
};

// Border radius (Geist-inspired: 6, 10, 12, 16, 20, 28)
export const radius = {
  xs: 6,
  sm: 6,
  md: 10,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 28,
  full: 9999,
};

// Animation durations (respects reduced motion)
export const animations = {
  fast: 150,
  normal: 250,
  slow: 400,
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  },
};

// Z-index scale
export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
};

// Breakpoints for responsive design
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

// Default mode
export const defaultMode = 'pastel';

// Helper to get current mode tokens
export function getModeTokens(mode = defaultMode) {
  return sensoryModes[mode]?.tokens || sensoryModes[defaultMode].tokens;
}

// Geist-inspired Materials (surface presets)
export const materials = {
  // Surface materials (on the page)
  base: {
    radius: radius.sm, // 6px
    shadow: 'none',
    description: 'Everyday use. Radius 6px.',
  },
  small: {
    radius: radius.sm, // 6px
    shadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    description: 'Slightly raised. Radius 6px.',
  },
  medium: {
    radius: radius.lg, // 12px
    shadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    description: 'Further raised. Radius 12px.',
  },
  large: {
    radius: radius.lg, // 12px
    shadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
    description: 'Further raised. Radius 12px.',
  },
  // Floating materials (above the page)
  tooltip: {
    radius: radius.sm, // 6px
    shadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    description: 'Lightest shadow. Corner 6px.',
  },
  menu: {
    radius: radius.lg, // 12px
    shadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
    description: 'Lift from page. Radius 12px.',
  },
  modal: {
    radius: radius.lg, // 12px
    shadow: '0 12px 32px rgba(0, 0, 0, 0.16)',
    description: 'Further lift. Radius 12px.',
  },
  fullscreen: {
    radius: radius.xl, // 16px
    shadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
    description: 'Biggest lift. Radius 16px.',
  },
};
