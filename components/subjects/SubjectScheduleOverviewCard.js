import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';

export default function SubjectScheduleOverviewCard({
  scheduleDays,
  scheduleTimeLine,
  progressCompleted = 0,
  progressScheduled = 0,
  progressNotScheduled = 0,
  progressTotal = 0,
  upcomingSessions = [],
  onUpcomingPress = null,
}) {
  const hasSchedule = Boolean(scheduleDays);
  const hasCurriculum = Number.isFinite(progressTotal) && progressTotal > 0;

  return (
    <View style={styles.card}>
      <View style={styles.scheduleBlock}>
        <Text style={styles.sectionLabel}>Schedule</Text>
        {hasSchedule ? (
          <>
            <Text style={styles.scheduleDays}>{scheduleDays}</Text>
            {scheduleTimeLine ? <Text style={styles.scheduleTime}>{scheduleTimeLine}</Text> : null}
          </>
        ) : (
          <Text style={styles.emptyText}>No recurring schedule yet</Text>
        )}
      </View>

      {hasCurriculum ? (
        <View style={styles.progressBlock}>
          <Text style={styles.sectionLabel}>Curriculum</Text>
          <Text style={styles.progressHeadline}>
            {`Progress: ${progressCompleted} / ${progressTotal} completed`}
          </Text>
          <View style={styles.progressStats}>
            <Text style={styles.progressStat}>{`${progressTotal} lessons total`}</Text>
            <Text style={styles.progressStat}>{`${progressCompleted} completed`}</Text>
            <Text style={styles.progressStat}>{`${progressScheduled} scheduled`}</Text>
            <Text style={styles.progressStat}>{`${progressNotScheduled} not scheduled`}</Text>
          </View>
          {progressScheduled > 0 ? (
            <Text style={styles.progressMeta}>{`Scheduled: ${progressScheduled} upcoming`}</Text>
          ) : null}
        </View>
      ) : null}

      {upcomingSessions.length > 0 ? (
        <View style={styles.upcomingBlock}>
          <Text style={styles.sectionLabel}>Upcoming</Text>
          {upcomingSessions.map(({ key, dateLabel, title, needsLesson, event }) => {
            const RowWrapper = onUpcomingPress ? TouchableOpacity : View;
            return (
              <RowWrapper
                key={key}
                style={styles.upcomingRow}
                onPress={onUpcomingPress ? () => onUpcomingPress(event) : undefined}
                accessibilityRole={onUpcomingPress ? 'button' : undefined}
                accessibilityLabel={`${dateLabel} ${title}`}
                {...(Platform.OS === 'web' && onUpcomingPress ? { cursor: 'pointer' } : {})}
              >
                <Text style={styles.upcomingDate}>{dateLabel}</Text>
                <Text style={[styles.upcomingTitle, needsLesson && styles.upcomingTitleMuted]} numberOfLines={1}>
                  {title}
                </Text>
              </RowWrapper>
            );
          })}
        </View>
      ) : hasSchedule ? (
        <View style={styles.upcomingBlock}>
          <Text style={styles.sectionLabel}>Upcoming</Text>
          <Text style={styles.emptyText}>No upcoming sessions on the calendar yet.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    padding: 16,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  scheduleBlock: {
    marginBottom: 16,
  },
  scheduleDays: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  scheduleTime: {
    fontSize: 15,
    color: '#475569',
    marginTop: 4,
  },
  progressBlock: {
    marginBottom: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
  },
  progressHeadline: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  progressStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  progressStat: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    backgroundColor: '#F8FAFC',
    borderRadius: 9999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  progressMeta: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },
  upcomingBlock: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  upcomingDate: {
    width: 52,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  upcomingTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  upcomingTitleMuted: {
    color: '#64748B',
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
  },
});
