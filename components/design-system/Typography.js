import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { typography, getModeTokens } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';

// Fallback if context not available
function useSensoryModeSafe() {
  try {
    return useSensoryMode();
  } catch {
    return { mode: 'pastel' };
  }
}

/**
 * Typography components with soft sans-serif and rounded mono fonts
 */
export function Heading({ children, level = 1, style, ...props }) {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  const sizes = {
    1: typography.sizes['3xl'],
    2: typography.sizes['2xl'],
    3: typography.sizes.xl,
    4: typography.sizes.lg,
    5: typography.sizes.md,
    6: typography.sizes.base,
  };
  
  const lineHeights = {
    1: typography.lineHeights.tight,
    2: typography.lineHeights.tight,
    3: typography.lineHeights.tight,
    4: typography.lineHeights.normal,
    5: typography.lineHeights.normal,
    6: typography.lineHeights.normal,
  };
  
  return (
    <Text
      style={[
        {
          fontFamily: typography.fonts.display,
          fontSize: sizes[level],
          lineHeight: sizes[level] * lineHeights[level],
          fontWeight: level <= 2 ? typography.weights.bold : typography.weights.semibold,
          color: tokens.text,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

export function Body({ children, size = 'base', muted = false, style, ...props }) {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  return (
    <Text
      style={[
        {
          fontFamily: typography.fonts.sans,
          fontSize: typography.sizes[size],
          lineHeight: typography.sizes[size] * typography.lineHeights.normal,
          fontWeight: typography.weights.regular,
          color: muted ? tokens.textMuted : tokens.text,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

export function Mono({ children, size = 'sm', style, ...props }) {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  return (
    <Text
      style={[
        {
          fontFamily: typography.fonts.mono,
          fontSize: typography.sizes[size],
          lineHeight: typography.sizes[size] * typography.lineHeights.normal,
          fontWeight: typography.weights.regular,
          color: tokens.text,
          letterSpacing: 0.3,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

export function Label({ children, size = 'sm', style, ...props }) {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  return (
    <Text
      style={[
        {
          fontFamily: typography.fonts.sans,
          fontSize: typography.sizes[size],
          lineHeight: typography.sizes[size] * typography.lineHeights.normal,
          fontWeight: typography.weights.medium,
          color: tokens.textSecondary,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}
