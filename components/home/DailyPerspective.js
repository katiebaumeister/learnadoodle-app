import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Sparkles } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function DailyPerspective({ learning = [] }) {
  const [perspective, setPerspective] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    generatePerspective();
  }, [learning]);

  const generatePerspective = () => {
    setLoading(true);
    try {
      // Calculate schedule density
      const eventCount = learning.length;
      const totalMinutes = learning.reduce((sum, event) => {
        const start = new Date(event.start_ts || event.start_local);
        const end = new Date(event.end_ts || event.end_local);
        return sum + (end - start) / (1000 * 60);
      }, 0);

      const density = eventCount > 0 ? totalMinutes / (eventCount * 60) : 0;
      
      // Generate perspective based on schedule density
      let line = '';
      if (eventCount === 0) {
        line = "Today is a good day for slow learning and noticing small wins.";
      } else if (density < 1.5) {
        line = "Today is a good day for slow learning and noticing small wins.";
      } else if (density < 3) {
        line = "Today is a good day for steady progress and focused attention.";
      } else {
        line = "Today is a good day for pacing yourself and celebrating each step.";
      }

      setPerspective(line);
    } catch (err) {
      console.error('[DailyPerspective] Error:', err);
      setPerspective("Today is a good day for slow learning and noticing small wins.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Sparkles size={16} color={colors.violetBold} />
            <Text style={styles.title}>Daily perspective</Text>
          </View>
        </View>
        <ActivityIndicator size="small" color={colors.muted} />
      </View>
    );
  }

  if (!perspective) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Sparkles size={16} color={colors.violetBold} />
          <Text style={styles.title}>Daily perspective</Text>
        </View>
      </View>
      <Text style={styles.insightText}>{perspective}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    ...shadows.md,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(240, 230, 255, 0.25)', // violetSoft with 25% opacity
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: -16,
    marginTop: -16,
    borderTopLeftRadius: colors.radiusLg,
    borderTopRightRadius: colors.radiusLg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  insightText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
  },
});

