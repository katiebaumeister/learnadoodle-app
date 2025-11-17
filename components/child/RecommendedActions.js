import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Sparkles, Plus, Target, Calendar } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function RecommendedActions({ goals, summary, onAddGoal, onAITopOff, onOpenPlanner }) {
  const actions = [];

  // Find goals with 0 minutes done
  const goalsNeedingAttention = goals?.filter(g => (g.done_min || 0) === 0) || [];
  if (goalsNeedingAttention.length > 0) {
    const firstGoal = goalsNeedingAttention[0];
    actions.push({
      id: 'add-goal',
      icon: Plus,
      text: `Add a goal for ${firstGoal.subject_name || firstGoal.subject_id} (0 min done)`,
      onPress: () => onAddGoal?.(),
      color: colors.violetBold,
    });
  }

  // Check if AI top-off is needed
  const goalsNeedingTopOff = goals?.filter(g => {
    const scheduled = g.scheduled_min || 0;
    const target = g.minutes_per_week || 0;
    return scheduled < target * 0.8; // Less than 80% scheduled
  }) || [];
  if (goalsNeedingTopOff.length > 0) {
    const firstGoal = goalsNeedingTopOff[0];
    const needed = Math.max(0, (firstGoal.minutes_per_week || 0) - (firstGoal.scheduled_min || 0));
    actions.push({
      id: 'ai-topoff',
      icon: Sparkles,
      text: `Top-off ${firstGoal.subject_name || firstGoal.subject_id} — ${needed} min needed`,
      onPress: () => onAITopOff?.(firstGoal),
      color: colors.violetBold,
    });
  }

  // Suggest creating next week's plan
  if (onOpenPlanner) {
    actions.push({
      id: 'next-week',
      icon: Calendar,
      text: "Create next week's plan",
      onPress: () => onOpenPlanner?.(),
      color: colors.blueBold,
    });
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Sparkles size={16} color={colors.violetBold} />
        <Text style={styles.title}>Recommended Actions</Text>
      </View>
      <ScrollView style={styles.actionsList} showsVerticalScrollIndicator={false}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <TouchableOpacity
              key={action.id}
              style={styles.actionItem}
              onPress={action.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${action.color}15` }]}>
                <Icon size={14} color={action.color} />
              </View>
              <Text style={styles.actionText}>{action.text}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
    maxHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  actionsList: {
    gap: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
});

