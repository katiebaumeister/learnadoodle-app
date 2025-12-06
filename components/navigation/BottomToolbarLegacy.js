import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Icon } from '../design-system/Icon';
import { getModeTokens } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { spacing, radius } from '../../theme/pastelDesignTokens';

// Fallback if context not available
function useSensoryModeSafe() {
  try {
    return useSensoryMode();
  } catch {
    return { mode: 'pastel' };
  }
}

const tabs = [
  { name: 'home', label: 'Home', route: '/' },
  { name: 'planner', label: 'Planner', route: '/planner' },
  { name: 'intelligence', label: 'Intelligence', route: '/intelligence' },
  { name: 'records', label: 'Records', route: '/records' },
  { name: 'profile', label: 'Profile', route: '/profile' },
];

export function BottomToolbar({ currentRoute = '/', onNavigate }) {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  // Normalize pathname for matching (remove trailing slash)
  const currentPath = currentRoute?.replace(/\/$/, '') || '/';
  
  const handleTabPress = (route) => {
    if (currentPath !== route && onNavigate) {
      onNavigate(route);
    }
  };
  
  return (
    <View
      style={[
        styles.toolbar,
        {
          backgroundColor: tokens.card,
          borderTopWidth: mode === 'contrast' ? 2 : 1,
          borderTopColor: tokens.border,
          ...Platform.select({
            web: {
              boxShadow: '0 -2px 12px rgba(0, 0, 0, 0.04)',
            },
            default: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 8,
            },
          }),
        },
      ]}
    >
      {tabs.map((tab) => {
        const isActive = currentPath === tab.route;
        
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => handleTabPress(tab.route)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.iconContainer,
                isActive && {
                  backgroundColor: tokens.accentSoft,
                  borderRadius: radius.md,
                  padding: spacing.xs,
                },
              ]}
            >
              <Icon
                name={tab.name}
                size={24}
                color={isActive ? tokens.accent : tokens.iconMuted}
              />
            </View>
            <Text
              style={[
                styles.label,
                {
                  color: isActive ? tokens.accent : tokens.textMuted,
                  fontWeight: isActive ? '600' : '400',
                },
              ]}
            >
              {tab.label.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    ...Platform.select({
      web: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
      },
      default: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
      },
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
