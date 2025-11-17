import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles, Plus } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export function GoalCard({ goal, progress, onAITopOff, onEdit }) {
  const sched = Math.round(progress?.scheduled_min ?? 0);
  const done = Math.round(progress?.done_min ?? 0);
  const target = goal.minutes_per_week || 0;
  const scheduledPct = Math.min(100, target > 0 ? Math.round((sched / target) * 100) : 0);
  const donePct = Math.min(100, target > 0 ? Math.round((done / target) * 100) : 0);

  return (
    <View style={styles.card}>
      <Text style={styles.subjectName}>{goal.subject_name || goal.subject_id}</Text>
      
      {/* Divider */}
      <View style={styles.divider} />
      
      {/* Target */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Target</Text>
        <Text style={styles.sectionValue}>
          {target} min/week
          {goal.cadence?.type && ` · ${goal.cadence.type}`}
        </Text>
      </View>

      {/* Scheduled */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Scheduled</Text>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${scheduledPct}%`, backgroundColor: colors.blueSoft }]} />
          </View>
          <Text style={styles.progressValue}>{sched}/{target}</Text>
        </View>
      </View>

      {/* Done */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Done</Text>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${donePct}%`, backgroundColor: colors.greenBold }]} />
          </View>
          <Text style={styles.progressValue}>{done}/{target}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onAITopOff?.(goal)}
        >
          <Sparkles size={14} color={colors.violetBold} />
          <Text style={styles.actionButtonText}>AI top-off</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onEdit?.(goal)}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function AddGoalCard({ onAdd }) {
  return (
    <TouchableOpacity style={styles.addCard} onPress={onAdd}>
      <Plus size={16} color={colors.muted} />
      <Text style={styles.addCardText}>Add goal</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    maxWidth: '48%',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  section: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.panel,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    minWidth: 50,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 12,
    color: colors.violetBold,
    fontWeight: '500',
  },
  addCard: {
    flex: 1,
    minWidth: '45%',
    maxWidth: '48%',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 200,
    ...shadows.md,
  },
  addCardText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
});
