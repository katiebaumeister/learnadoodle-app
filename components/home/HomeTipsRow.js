import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Sparkles, MessageCircle } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

const tagColors = {
  'Tip': { bg: colors.violetSoft, text: colors.violetBold },
  'Connection': { bg: colors.blueSoft, text: colors.blueBold },
  'Planner': { bg: colors.blueSoft, text: colors.blueBold },
};

export default function HomeTipsRow({ 
  dailyPerspective,
  dailyNudge,
  currentDate = new Date()
}) {
  const dateKey = `homeTips:${currentDate.toISOString().split('T')[0]}`;
  
  const [dismissed, setDismissed] = useState(() => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(dateKey);
        return saved ? new Set(JSON.parse(saved)) : new Set();
      }
      return new Set();
    } catch {
      return new Set();
    }
  });

  const handleDismiss = (tipId) => {
    setDismissed(prev => {
      const next = new Set([...prev, tipId]);
      try {
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          localStorage.setItem(dateKey, JSON.stringify([...next]));
        }
      } catch {}
      return next;
    });
  };

  const tips = [];
  
  if (dailyPerspective && !dismissed.has('perspective')) {
    tips.push({
      id: 'perspective',
      tag: 'Tip',
      icon: 'sparkles',
      title: 'Daily perspective',
      body: dailyPerspective,
    });
  }
  
  if (dailyNudge && !dismissed.has('nudge')) {
    tips.push({
      id: 'nudge',
      tag: 'Connection',
      icon: 'message-circle',
      title: dailyNudge.split('.')[0] || 'Daily nudge',
      body: dailyNudge,
    });
  }

  if (tips.length === 0) {
    return null;
  }

  const iconMap = {
    'sparkles': Sparkles,
    'message-circle': MessageCircle,
  };

  return (
    <View style={styles.container}>
      {tips.map((tip) => {
        const Icon = iconMap[tip.icon] || Sparkles;
        const tagColor = tagColors[tip.tag] || tagColors.Tip;

        return (
          <View key={tip.id} style={styles.tipCard}>
            <View style={styles.tipHeader}>
              <View style={[styles.tag, { backgroundColor: tagColor.bg }]}>
                <Icon size={12} color={tagColor.text} />
                <Text style={[styles.tagText, { color: tagColor.text }]}>
                  {tip.tag}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDismiss(tip.id)}
                style={styles.dismissButton}
              >
                <Text style={styles.dismissText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>{tip.title}</Text>
              <Text style={styles.tipBody}>{tip.body}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  tipCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
  },
  tipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dismissButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  dismissText: {
    fontSize: 20,
    color: colors.muted,
    lineHeight: 20,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  tipBody: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
});

