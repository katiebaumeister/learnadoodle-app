import React, { useState } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius, materials } from '../theme/pastelDesignTokens';

/**
 * Geist-inspired Card component with hover states and material presets
 * 
 * @param {string} variant - Material variant: 'base', 'small', 'medium', 'large', 'tooltip', 'menu', 'modal', 'fullscreen'
 * @param {boolean} hoverable - Enable hover effects
 * @param {React.ReactNode} children - Card content
 * @param {object} style - Additional styles
 * @param {function} onPress - Press handler (makes card clickable)
 */
export default function GeistCard({
  variant = 'base',
  hoverable = true,
  children,
  style,
  onPress,
  ...props
}) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [isHovered, setIsHovered] = useState(false);

  const material = materials[variant] || materials.base;
  const isFloating = ['tooltip', 'menu', 'modal', 'fullscreen'].includes(variant);

  const cardStyles = {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: material.radius,
    ...(Platform.OS === 'web' && material.shadow
      ? {
          boxShadow: isHovered && hoverable && variant !== 'base'
            ? (isFloating ? '0 6px 16px rgba(0, 0, 0, 0.16)' : '0 4px 12px rgba(0, 0, 0, 0.12)')
            : (isFloating ? '0 4px 12px rgba(0, 0, 0, 0.12)' : '0 2px 8px rgba(0, 0, 0, 0.08)'),
        }
      : material.shadow
      ? {
          shadowColor: tokens.text,
          shadowOffset: { width: 0, height: isFloating ? 4 : 2 },
          shadowOpacity: isFloating ? 0.12 : 0.08,
          shadowRadius: isFloating ? 12 : 8,
          elevation: isFloating ? 8 : 4,
        }
      : {}
    ),
    ...(isHovered && hoverable && variant !== 'base' && Platform.OS !== 'web' && {
      shadowOffset: { width: 0, height: isFloating ? 6 : 4 },
      shadowOpacity: isFloating ? 0.16 : 0.12,
      shadowRadius: isFloating ? 16 : 12,
      elevation: isFloating ? 12 : 6,
      backgroundColor: tokens.bgSubtle,
    }),
    ...(isHovered && hoverable && variant !== 'base' && Platform.OS === 'web' && {
      backgroundColor: tokens.bgSubtle,
    }),
    ...(Platform.OS === 'web' && {
      transition: 'all 200ms ease',
    }),
  };

  const content = (
    <View
      style={[styles.card, cardStyles, style]}
      onMouseEnter={() => {
        if (Platform.OS === 'web' && hoverable) {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => {
        if (Platform.OS === 'web') {
          setIsHovered(false);
        }
      }}
      {...props}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={styles.touchable}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.xl,
    borderWidth: 1,
  },
  touchable: {
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
});

