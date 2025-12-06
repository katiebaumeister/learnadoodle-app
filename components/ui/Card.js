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
  variant = 'default', // 'default' | 'elevated' | 'outlined' | 'flat'
  padding = 'base', // 'sm' | 'base' | 'lg' | 'xl'
  onPress,
  style,
  ...props
}) {
  const Component = onPress ? TouchableOpacity : View;
  
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
      {...props}
    >
      {children}
    </Component>
  );
}

const paddingValues = {
  sm: 12,   // p-3
  base: 16, // p-4
  lg: 20,   // p-5
  xl: 24,   // p-6
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12, // rounded-xl
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
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

