/**
 * AppContainer Component
 * Standardized container for page content with max-width and consistent padding
 * 
 * Usage:
 * <AppContainer>
 *   <YourContent />
 * </AppContainer>
 * 
 * Props:
 * - fullWidth: boolean - Remove max-width constraint
 * - noPadding: boolean - Remove horizontal padding
 * - paddingVertical: number - Custom vertical padding (default: 24)
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { colors } from '../../theme/colors';

export default function AppContainer({ 
  children, 
  fullWidth = false,
  noPadding = false,
  paddingVertical = 24, // py-6
}) {
  return (
    <View style={[
      styles.container,
      fullWidth && styles.fullWidth,
      noPadding && styles.noPadding,
      { paddingVertical },
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 1280, // max-w-screen-xl
    marginHorizontal: 'auto',
    paddingHorizontal: 24, // px-6
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  fullWidth: {
    maxWidth: '100%',
  },
  noPadding: {
    paddingHorizontal: 0,
  },
});

