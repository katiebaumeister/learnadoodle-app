/**
 * NextRecommendedActionRow
 * 
 * Single row component showing the next recommended action.
 * Only appears when there's a relevant action to show.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Play, FileText, ChevronRight } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function NextRecommendedActionRow({
  actionType, // 'resume' | 'review'
  title,
  subtitle,
  onPress,
}) {
  if (!actionType || !title) {
    return null;
  }

  const Icon = actionType === 'resume' ? Play : FileText;
  const actionLabel = actionType === 'resume' ? 'Resume:' : 'Review:';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <View style={styles.content}>
        <Icon size={14} color={colors.textSecondary} />
        <Text style={styles.label}>{actionLabel}</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
      </View>
      <ChevronRight size={14} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    marginTop: 12,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.border,
      },
    }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  title: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
