import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Sparkles, Lightbulb, Calendar, BookOpen, TrendingUp, Heart, Zap } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

const badgeColors = {
  'TIP': { bg: colors.violetSoft, text: colors.violetBold, icon: Sparkles },
  'INSIGHT': { bg: colors.blueSoft, text: colors.blueBold, icon: Lightbulb },
  'ROUTINE': { bg: colors.orangeSoft, text: colors.orangeBold, icon: Calendar },
  'DEVELOPMENT': { bg: colors.greenSoft, text: colors.greenBold, icon: TrendingUp },
  'REFLECTION': { bg: colors.yellowSoft, text: colors.yellowBold, icon: Heart },
  'PLANNER': { bg: colors.blueSoft, text: colors.blueBold, icon: BookOpen },
};

export default function TodayCard({ 
  tip,
  currentDate = new Date(),
  isHero = false // Make first card (perspective) the hero
}) {
  const dateKey = `todayCard:${tip?.id || 'default'}:${currentDate.toISOString().split('T')[0]}`;
  
  const [dismissed, setDismissed] = useState(() => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(dateKey);
        return saved === 'true';
      }
      return false;
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setDismissed(true);
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(dateKey, 'true');
      }
    } catch {}
  };

  if (dismissed || !tip) {
    return null;
  }

  const badgeConfig = badgeColors[tip.badge] || badgeColors['TIP'];
  const Icon = badgeConfig.icon;

  return (
    <View style={styles.container}>
      <View style={[styles.card, isHero && styles.heroCard]}>
        <View style={styles.content}>
          <View style={styles.leftSection}>
            <View style={[styles.iconStamp, { backgroundColor: badgeConfig.bg }]}>
            <Icon size={12} color={badgeConfig.text} />
            </View>
            <View style={styles.textSection}>
              <Text style={styles.title}>{tip.title}</Text>
              {tip.bodyLines && tip.bodyLines.length > 0 && (
                <Text style={styles.bodyText} numberOfLines={2}>
                  {tip.bodyLines.join(' ')}
            </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.dismissButton}
          >
            <Text style={styles.dismissText}>×</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
    flex: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    ...shadows.sm,
  },
  heroCard: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...shadows.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconStamp: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textSection: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  bodyText: {
    fontSize: 12,
    color: '#475569', // slate-600
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dismissButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    flexShrink: 0,
  },
  dismissText: {
    fontSize: 18,
    color: colors.muted,
    lineHeight: 18,
  },
});

