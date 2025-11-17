import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock, Flame, BookOpen } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function WeeklySummary({ summary, goals, streak = 0 }) {
  const totalMinutes = summary?.done_minutes || 0;
  
  // Find most active subject
  const mostActiveSubject = goals?.reduce((max, g) => 
    (g.done_min || 0) > (max?.done_min || 0) ? g : max, null
  );

  const hasData = totalMinutes > 0 || streak > 0 || mostActiveSubject;

  if (!hasData) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Weekly Snapshot</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Your week starts here! Once sessions are completed, the summary will appear.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Weekly Snapshot</Text>
      <View style={styles.cardsRow}>
        <View style={styles.card}>
          <Clock size={20} color={colors.greenBold} />
          <Text style={styles.cardValue}>{totalMinutes}</Text>
          <Text style={styles.cardLabel}>Minutes completed</Text>
        </View>
        <View style={styles.card}>
          <Flame size={20} color={colors.orangeBold} />
          <Text style={styles.cardValue}>{streak}</Text>
          <Text style={styles.cardLabel}>Best streak</Text>
        </View>
        <View style={styles.card}>
          <BookOpen size={20} color={colors.violetBold} />
          <Text style={styles.cardValue} numberOfLines={1}>
            {mostActiveSubject?.subject || mostActiveSubject?.subject_id || '—'}
          </Text>
          <Text style={styles.cardLabel}>Most active subject</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    ...shadows.sm,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  cardLabel: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
});

