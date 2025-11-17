import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { GripVertical, Trash2, Edit, Check, X, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

function DayChip({ code }) {
  return (
    <View style={styles.dayChip}>
      <Text style={styles.dayChipText}>{code}</Text>
    </View>
  );
}

export default function RuleCard({ rule, index, onSave, onDelete, onBump }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(rule);

  const getTone = () => {
    if (rule.type === 'availability_teach') return { bg: colors.greenSoft, text: colors.greenBold, label: 'Teach' };
    if (rule.type === 'availability_off') return { bg: colors.redSoft, text: colors.redBold, label: 'Off' };
    return { bg: colors.blueSoft, text: colors.blueBold, label: 'Default' };
  };

  const tone = getTone();

  // Parse days from RRULE
  const getDays = () => {
    if (!rule.days) return [];
    const daysStr = rule.days.includes('RRULE') 
      ? rule.days.replace(/^.*BYDAY=/, '').split(';')[0]
      : rule.days;
    return daysStr.split(',').filter(Boolean);
  };

  const days = getDays();

  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        {/* Drag Handle */}
        <View style={styles.dragHandle}>
          <GripVertical size={16} color={colors.border} />
        </View>

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={[styles.badge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.badgeText, { color: tone.text }]}>
                {tone.label}
              </Text>
            </View>
            <Text style={styles.priorityText}>Priority {rule.priority}</Text>
          </View>

          {/* Body */}
          {!edit ? (
            <View style={styles.ruleDisplay}>
              <View style={styles.daysRow}>
                {days.map((d) => <DayChip key={d} code={d} />)}
              </View>
              <View style={styles.timeRow}>
                <Clock size={14} color={colors.muted} />
                <Text style={styles.timeText}>
                  {rule.start?.slice(0, 5)}–{rule.end?.slice(0, 5)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.editForm}>
              <TextInput
                style={styles.input}
                value={draft.days}
                onChangeText={(text) => setDraft({ ...draft, days: text.toUpperCase() })}
                placeholder="MO,TU,WE"
              />
              <View style={styles.timeInputs}>
                <TextInput
                  style={styles.timeInput}
                  value={draft.start}
                  onChangeText={(text) => setDraft({ ...draft, start: text })}
                  placeholder="09:00"
                />
                <Text style={styles.timeSeparator}>–</Text>
                <TextInput
                  style={styles.timeInput}
                  value={draft.end}
                  onChangeText={(text) => setDraft({ ...draft, end: text })}
                  placeholder="15:00"
                />
              </View>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {!edit ? (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onBump(rule.id, 'up')}
              >
                <ChevronUp size={14} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onBump(rule.id, 'down')}
              >
                <ChevronDown size={14} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setDraft(rule);
                  setEdit(true);
                }}
              >
                <Edit size={14} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => onDelete(rule.id)}
              >
                <Trash2 size={14} color={colors.redBold} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={async () => {
                  await onSave({ id: draft.id, ...draft });
                  setEdit(false);
                }}
              >
                <Check size={14} color={colors.greenBold} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setEdit(false)}
              >
                <X size={14} color={colors.redBold} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    ...shadows.md,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  dragHandle: {
    paddingTop: 4,
  },
  mainContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  priorityText: {
    fontSize: 11,
    color: colors.muted,
  },
  ruleDisplay: {
    gap: 8,
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  dayChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dayChipText: {
    fontSize: 11,
    color: colors.text,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: 13,
    color: colors.text,
  },
  editForm: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
  },
  timeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
  },
  timeSeparator: {
    fontSize: 13,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  deleteButton: {
    borderColor: colors.redSoft,
    backgroundColor: colors.redSoft,
  },
});
