import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { getModeTokens } from '../../theme/pastelDesignTokens';
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
 * Modular Card component with rounded geometry and soft shadows
 * Supports sensory modes and hover interactions
 */
export function Card({
  children,
  onPress,
  variant = 'default',
  padding = 'lg',
  style,
  ...props
}) {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  const isPressable = !!onPress;
  const Component = isPressable ? TouchableOpacity : View;
  
  const cardStyles = [
    styles.card,
    {
      backgroundColor: tokens.card,
      borderRadius: variant === 'floating' ? 20 : 16,
      borderWidth: mode === 'contrast' ? 2 : 1,
      borderColor: tokens.border,
      ...(variant === 'floating' && (Platform.OS === 'web'
        ? { boxShadow: tokens.shadow.floating }
        : {
            shadowColor: mode === 'contrast' ? tokens.border : 'transparent',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: mode === 'contrast' ? 1 : 0.1,
            shadowRadius: 12,
            elevation: 8,
          })),
      ...(variant === 'default' && (Platform.OS === 'web'
        ? { boxShadow: tokens.shadow.card, transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }
        : {
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 2,
          })),
      padding: padding === 'lg' ? 20 : padding === 'md' ? 16 : padding === 'sm' ? 12 : padding,
    },
    style,
  ];
  
  // Hover styles for web
  const hoverStyle = Platform.OS === 'web' && isPressable
    ? {
        ':hover': {
          ...Platform.select({
            web: {
              boxShadow: tokens.shadow.cardHover,
              transform: 'translateY(-2px)',
            },
          }),
        },
      }
    : {};
  
  return (
    <Component
      style={cardStyles}
      onPress={onPress}
      activeOpacity={isPressable ? 0.7 : 1}
      {...(Platform.OS === 'web' ? { style: [cardStyles, hoverStyle] } : {})}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * Card variant with pastel background
 */
export function PastelCard({
  color = 'lavender',
  children,
  ...props
}) {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  return (
    <Card
      style={{
        backgroundColor: tokens.pastels[color] || tokens.pastels.lavender,
      }}
      {...props}
    >
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
