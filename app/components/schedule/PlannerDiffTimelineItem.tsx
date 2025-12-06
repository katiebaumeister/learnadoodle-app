/**
 * PlannerDiffTimelineItem
 * Individual timeline item showing old event → new event with reason
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowRight, BookOpen } from 'lucide-react';
import { DiffItem, DiffReason } from '../../state/usePlannerDiffStore';

interface PlannerDiffTimelineItemProps {
  diff: DiffItem;
  subjectName?: string;
  childName?: string;
}

const REASON_COLORS: Record<DiffReason, { bg: string; text: string; border: string }> = {
  blackout: { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
  override: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  catch_up: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
  priority: { bg: '#F3E8FF', text: '#6B21A8', border: '#D8B4FE' },
  theme: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  cognitive_load: { bg: '#FDF4FF', text: '#86198F', border: '#F3E8FF' },
};

const REASON_LABELS: Record<DiffReason, string> = {
  blackout: 'Blackout Period',
  override: 'Schedule Override',
  catch_up: 'Catch-Up Mode',
  priority: 'Priority Reschedule',
  theme: 'Day Theme',
  cognitive_load: 'Cognitive Load',
};

const formatTime = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
};

const formatDate = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString.split('T')[0];
  }
};

export default function PlannerDiffTimelineItem({ 
  diff, 
  subjectName, 
  childName 
}: PlannerDiffTimelineItemProps) {
  const reasonStyle = REASON_COLORS[diff.reason] || REASON_COLORS.priority;
  const reasonLabel = REASON_LABELS[diff.reason] || diff.reason;

  const oldDate = formatDate(diff.old_event.start_ts);
  const oldTime = formatTime(diff.old_event.start_ts);
  const newDate = formatDate(diff.new_event.start_ts);
  const newTime = formatTime(diff.new_event.start_ts);

  const isSameDate = oldDate === newDate;

  return (
    <View style={styles.container}>
      {/* Subject Icon */}
      <View style={[styles.iconContainer, { backgroundColor: reasonStyle.bg }]}>
        <BookOpen size={16} color={reasonStyle.text} />
      </View>

      {/* Timeline Content */}
      <View style={styles.timelineContent}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>
            {diff.title}
          </Text>
          <View style={[styles.reasonChip, { backgroundColor: reasonStyle.bg, borderColor: reasonStyle.border }]}>
            <Text style={[styles.reasonText, { color: reasonStyle.text }]}>
              {reasonLabel}
            </Text>
          </View>
        </View>

        {/* Subject/Child Info */}
        {(subjectName || childName) && (
          <Text style={styles.meta}>
            {subjectName && childName ? `${subjectName} • ${childName}` : subjectName || childName}
          </Text>
        )}

        {/* Timeline: Old → New */}
        <View style={styles.timelineRow}>
          {/* Old Event */}
          <View style={styles.eventBlock}>
            <Text style={styles.eventLabel}>From</Text>
            <Text style={styles.eventDate}>{oldDate}</Text>
            <Text style={styles.eventTime}>{oldTime}</Text>
          </View>

          {/* Arrow */}
          <View style={styles.arrowContainer}>
            <ArrowRight size={20} color="#6B7280" />
          </View>

          {/* New Event */}
          <View style={styles.eventBlock}>
            <Text style={styles.eventLabel}>To</Text>
            {!isSameDate && (
              <Text style={styles.eventDate}>{newDate}</Text>
            )}
            <Text style={[styles.eventTime, styles.newTime]}>
              {newTime}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    minHeight: 100,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  reasonChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  reasonText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  meta: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eventBlock: {
    flex: 1,
    padding: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  eventLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  eventTime: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  newTime: {
    color: '#059669',
    fontWeight: '600',
  },
  arrowContainer: {
    padding: 4,
  },
});

