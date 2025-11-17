import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { CheckCircle, XCircle, Clock, Slash, Plus, BookOpen } from 'lucide-react';
import { colors, shadows, getCategoryColor } from '../../theme/colors';

function StatusIcon({ status }) {
  const size = 18;
  
  if (status === 'done') {
    return <CheckCircle size={size} color={colors.greenBold} />;
  }
  if (status === 'canceled') {
    return <XCircle size={size} color={colors.redBold} />;
  }
  if (status === 'skipped') {
    return <Slash size={size} color={colors.orangeBold} />;
  }
  // Upcoming
  return <Clock size={size} color={colors.blueBold} />;
}

function getSubjectIcon(subject) {
  // You can customize this based on subject
  return <BookOpen size={16} color={colors.violetBold} />;
}

export default function EventsTimeline({ events = [], onAddSession, onEventPress }) {
  const isEmpty = events.length === 0;

  // Check for overdue events
  const now = new Date();
  const overdueCount = events.filter(ev => {
    if (ev.status === 'done' || ev.status === 'canceled') return false;
    return new Date(ev.start_ts) < now;
  }).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>This Week's Timeline</Text>
        {overdueCount > 0 && (
          <View style={styles.overdueBadge}>
            <Text style={styles.overdueText}>! {overdueCount} overdue</Text>
          </View>
        )}
      </View>
      
      {isEmpty ? (
        <View style={styles.emptyState}>
          <Clock size={48} color={colors.muted} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>No sessions scheduled this week</Text>
          <Text style={styles.emptyDescription}>
            Add reading, math, or creative activities to build a balanced week.
          </Text>
          {onAddSession && (
            <TouchableOpacity style={styles.emptyButton} onPress={onAddSession}>
              <Plus size={16} color={colors.accentContrast} />
              <Text style={styles.emptyButtonText}>Add session</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.timeline} showsVerticalScrollIndicator={false}>
          {events.map((ev) => {
            const isOverdue = ev.status !== 'done' && ev.status !== 'canceled' && new Date(ev.start_ts) < now;
            const subjectColor = getCategoryColor(ev.subject);
            
            return (
              <TouchableOpacity
                key={ev.id}
                style={[styles.eventCard, isOverdue && styles.eventCardOverdue]}
                onPress={() => onEventPress?.(ev)}
                activeOpacity={0.7}
              >
                {/* Left: Subject Icon */}
                <View style={[styles.subjectIcon, { backgroundColor: subjectColor.soft }]}>
                  {getSubjectIcon(ev.subject)}
                </View>
                
                {/* Middle: Content */}
                <View style={styles.eventContent}>
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      {ev.title || ev.subject || 'Lesson'}
                    </Text>
                    <View style={styles.eventMetaRow}>
                      <Text style={styles.eventDate}>
                        {new Date(ev.start_ts).toLocaleDateString(undefined, { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </Text>
                      <Text style={styles.eventTime}>
                        {new Date(ev.start_ts).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </Text>
                    </View>
                  </View>
                </View>
                
                {/* Right: Duration Badge */}
                <View style={[styles.durationBadge, { backgroundColor: subjectColor.soft }]}>
                  <Text style={[styles.durationText, { color: subjectColor.bold }]}>
                    {ev.duration_min}m
                  </Text>
                </View>
                
                {/* Status Icon */}
                <StatusIcon status={ev.status} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  overdueBadge: {
    backgroundColor: colors.redSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  overdueText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.redBold,
  },
  timeline: {
    maxHeight: 400,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyDescription: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
    marginBottom: 8,
  },
  eventCardOverdue: {
    borderColor: colors.redBold,
    backgroundColor: colors.redSoft,
  },
  subjectIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventContent: {
    flex: 1,
  },
  eventHeader: {
    gap: 4,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventDate: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  eventTime: {
    fontSize: 12,
    color: colors.muted,
  },
  durationBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 50,
    alignItems: 'center',
  },
  durationText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
