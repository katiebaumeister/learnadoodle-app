import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Clock, BookOpen, Sparkles } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function NextUpTile({ nextEvent, onOpenSyllabus, onAIPlan }) {
  if (!nextEvent || !nextEvent.id) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContent}>
          <Clock size={20} color={colors.muted} />
          <Text style={styles.emptyText}>Nothing next. AI plan day</Text>
        </View>
        <TouchableOpacity 
          style={styles.aiButton}
          onPress={onAIPlan}
        >
          <Sparkles size={14} color={colors.accentContrast} />
          <Text style={styles.aiButtonText}>AI Plan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const minutesUntil = Math.round(nextEvent.minutes_until);
  const timeLabel = minutesUntil < 1 
    ? 'Starting now' 
    : minutesUntil < 60 
      ? `in ${minutesUntil}m` 
      : `in ${Math.round(minutesUntil / 60)}h`;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconBadge}>
          <Clock size={16} color={colors.blueBold} />
        </View>
        <View style={styles.info}>
          <Text style={styles.label}>Next up {timeLabel}</Text>
          <Text style={styles.title}>
            {nextEvent.subject || nextEvent.title} ({nextEvent.child_name})
          </Text>
          <Text style={styles.meta}>
            {nextEvent.start_local}–{nextEvent.end_local}
          </Text>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.startButton}
        onPress={() => onOpenSyllabus?.(nextEvent)}
      >
        <BookOpen size={14} color={colors.accentContrast} />
        <Text style={styles.startButtonText}>Open syllabus</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.blueSoft,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.blueBold,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    ...shadows.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.blueBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
  },
  startButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  emptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
  },
  aiButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentContrast,
  },
});
