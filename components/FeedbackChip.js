import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MessageSquare } from 'lucide-react';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../theme/pastelDesignTokens';

export default function FeedbackChip() {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);

  // Always show in sidebar footer (no scroll detection needed)
  const isVisible = true;

  const handlePress = () => {
    if (Platform.OS === 'web') {
      window.open('https://learnadoodle.com/contact', '_blank');
    }
  };

  if (!isVisible) return null;

  return (
    <>
      <View style={styles.chipContainer}>
        <TouchableOpacity
          style={[
            styles.chip,
            {
              backgroundColor: tokens.surface,
              borderColor: tokens.border,
              shadowColor: tokens.text,
            },
          ]}
          onPress={handlePress}
          onMouseEnter={(e) => {
            if (Platform.OS === 'web') {
              e.currentTarget.style.transform = 'scale(1.02)';
            }
          }}
          onMouseLeave={(e) => {
            if (Platform.OS === 'web') {
              e.currentTarget.style.transform = 'scale(1)';
            }
          }}
        >
          <MessageSquare size={16} color={tokens.accent} />
          <Text style={[styles.chipText, { color: tokens.text }]}>Give Feedback</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  chipContainer: {
    width: '100%',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          transition: 'transform 200ms ease, box-shadow 200ms ease',
          cursor: 'pointer',
        }
      : {
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        }
    ),
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

