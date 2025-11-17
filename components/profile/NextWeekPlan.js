import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function NextWeekPlan({ childId, weekStart, onOpenPlanner }) {
  const nextWeek = addDays(new Date(weekStart), 7);
  const nextWeekLabel = nextWeek.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Next week's plan</Text>
      <Text style={styles.subtitle}>
        Preview and top-off next week based on current goals.
      </Text>
      
      <TouchableOpacity 
        style={styles.button}
        onPress={() => onOpenPlanner?.({ childId, weekStart: nextWeek.toISOString().slice(0, 10) })}
      >
        <Sparkles size={16} color={colors.accentContrast} />
        <Text style={styles.buttonText}>Open AI Planner Preview</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
});
