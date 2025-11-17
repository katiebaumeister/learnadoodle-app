import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Target, Star, Plus } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { GoalCard, AddGoalCard } from './GoalCard';

export default function GoalsList({ goals = [], progressBySubject = {}, onAITopOff, onEdit, onAdd }) {
  const isEmpty = goals.length === 0;

  return (
    <View style={styles.container}>
      {isEmpty ? (
        <View style={styles.emptyCard}>
          <Star size={48} color={colors.muted} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>No goals yet</Text>
          <Text style={styles.emptyDescription}>
            Set weekly learning goals to track progress and stay on target.
          </Text>
          {onAdd && (
            <TouchableOpacity style={styles.emptyButton} onPress={onAdd}>
              <Plus size={16} color={colors.accentContrast} />
              <Text style={styles.emptyButtonText}>Add first goal</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.grid}>
          {goals.map((goal) => (
            <GoalCard
              key={goal.goal_id || goal.id}
              goal={goal}
              progress={progressBySubject[goal.subject_id]}
              onAITopOff={onAITopOff}
              onEdit={onEdit}
            />
          ))}
          <AddGoalCard onAdd={onAdd} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    gap: 12,
    ...shadows.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
});
