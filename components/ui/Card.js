/**
 * Card Component
 * Standardized card with consistent styling
 * 
 * Usage:
 * <Card>
 *   <Text>Card content</Text>
 * </Card>
 * 
 * <Card variant="elevated" padding="lg">
 *   <Text>Elevated card with large padding</Text>
 * </Card>
 */
import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { colors, shadows } from '../../theme/colors';

export default function Card({ 
  children, 
  variant = 'default', // 'default' | 'elevated' | 'outlined' | 'flat' | 'glass'
  padding = 'base', // 'sm' | 'base' | 'lg' | 'xl'
  onPress,
  style,
  ...props
}) {
  const Component = onPress ? TouchableOpacity : View;
  const cardClassName = Platform.OS === 'web' && variant === 'glass' ? 'glass' : undefined;
  
  return (
    <Component
      style={[
        styles.card,
        styles[variant],
        styles[`padding${padding.charAt(0).toUpperCase() + padding.slice(1)}`],
        style,
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      {...(Platform.OS === 'web' && cardClassName ? { className: cardClassName } : {})}
      {...props}
    >
      {children}
    </Component>
  );
}

// Strict spacing scale: 4, 8, 12, 16, 24, 32, 40
const paddingValues = {
  sm: 12,   // --spacing-md (12px)
  base: 16, // --layout-card-padding (16px)
  lg: 20,   // --layout-card-padding-large (20px)
  xl: 24,   // --spacing-lg (24px)
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 24, // --radius-lg (24px) for glass cards
    borderWidth: 1, // Hairline border
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
    }),
  },
  glass: {
    // On web, .glass class handles styling
    ...(Platform.OS === 'web' ? {} : {
      backgroundColor: 'rgba(255,255,255,.72)',
      borderColor: 'rgba(17,24,39,.08)',
    }),
  },
  default: {
    ...shadows.sm,
  },
  elevated: {
    ...shadows.md,
    borderColor: 'transparent',
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      boxShadow: 'none',
    }),
  },
  flat: {
    borderWidth: 0,
    ...(Platform.OS === 'web' && {
      boxShadow: 'none',
    }),
  },
  paddingSm: {
    padding: paddingValues.sm,
  },
  paddingBase: {
    padding: paddingValues.base,
  },
  paddingLg: {
    padding: paddingValues.lg,
  },
  paddingXl: {
    padding: paddingValues.xl,
  },
});

