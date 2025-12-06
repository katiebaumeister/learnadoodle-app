import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Clock, Sparkles } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function NextUpTile({ nextEvent, onOpenSyllabus, onAIPlan }) {
  if (!nextEvent || !nextEvent.id) {
    return (
      <TouchableOpacity 
        style={styles.container}
        onPress={onAIPlan}
        activeOpacity={0.7}
      >
        <Clock size={14} color={colors.muted} />
        <View style={styles.info}>
          <Text style={styles.emptyText}>Nothing next. AI plan day</Text>
        </View>
        <Sparkles size={12} color={colors.muted} />
        </TouchableOpacity>
    );
  }

  const minutesUntil = Math.round(nextEvent.minutes_until || 0);
  const hoursUntil = Math.floor(minutesUntil / 60);
  
  let timeLabel = '';
  if (minutesUntil < 1) {
    timeLabel = 'Starting now';
  } else if (hoursUntil > 0) {
    timeLabel = `in ${hoursUntil} hour${hoursUntil > 1 ? 's' : ''}`;
  } else {
    timeLabel = `in ${minutesUntil} minute${minutesUntil > 1 ? 's' : ''}`;
  }

  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={() => onOpenSyllabus?.(nextEvent)}
      activeOpacity={0.7}
    >
      <Clock size={14} color={colors.muted} />
        <View style={styles.info}>
            <Text style={styles.title}>
          {nextEvent.subject || nextEvent.title} • {nextEvent.start_local}–{nextEvent.end_local}
            </Text>
        <Text style={styles.label}>Next up {timeLabel}</Text>
      </View>
      </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 20, // Pill shape
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    marginTop: 0,
    alignSelf: 'flex-start', // Don't stretch full width
    borderWidth: 1,
    borderColor: colors.border,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 18,
  },
  label: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.muted,
    textTransform: 'lowercase',
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
  },
});
