import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowRight, Sparkles } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function DailyInsights({ 
  primary,
  child_insight,
  emotional,
  cta = "View weekly story",
  onViewFull,
  // Legacy support for bullets array
  bullets = [],
}) {
  // Support new Insight Engine format
  const primaryText = primary || (bullets.length > 0 ? bullets[0] : null);
  const secondaryText = child_insight || emotional || (bullets.length > 1 ? bullets[1] : null);
  
  if (!primaryText && bullets.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.contentRow}>
        <View style={styles.iconContainer}>
          <Sparkles size={16} color={colors.violetBold} />
      </View>
      
        <View style={styles.textContent}>
          <Text style={styles.primaryText}>{primaryText}</Text>
          {secondaryText && (
            <Text style={styles.secondaryText}>{secondaryText}</Text>
          )}
      </View>

      {onViewFull && (
        <TouchableOpacity
          style={styles.viewLink}
          onPress={onViewFull}
        >
            <Text style={styles.viewLinkText}>{cta}</Text>
          <ArrowRight size={12} color={colors.accent} />
        </TouchableOpacity>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F7F2FF', // Soft lavender background
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 1.5, // Slight shadow/border-bottom for separation
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...shadows.sm,
    marginTop: 0,
    marginBottom: 24,
    width: '100%',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContent: {
    flex: 1,
    gap: 4,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 20,
  },
  secondaryText: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  viewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  viewLinkText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
});
