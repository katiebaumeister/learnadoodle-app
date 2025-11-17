import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '../../../theme/colors';

export default function ScheduleTab({ child }) {
  // TODO: replace with real fetch (Supabase / API)
  const mockWeek = [
    {
      dayLabel: "Monday",
      dateLabel: "Nov 17",
      sessions: [
        {
          id: "1",
          title: "Reading – Chapter 2",
          subject: "Reading",
          time: "9:00–9:30 AM",
          status: "scheduled",
        },
      ],
    },
    {
      dayLabel: "Tuesday",
      dateLabel: "Nov 18",
      sessions: [],
    },
    {
      dayLabel: "Wednesday",
      dateLabel: "Nov 19",
      sessions: [
        {
          id: "2",
          title: "Math practice",
          subject: "Math",
          time: "10:00–10:45 AM",
          status: "done",
        },
      ],
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule for {child.first_name}</Text>
        <View style={styles.weekToggle}>
          <TouchableOpacity style={styles.weekToggleActive}>
            <Text style={styles.weekToggleActiveText}>This week</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.weekToggleButton}>
            <Text style={styles.weekToggleText}>Next week</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.daysGrid}>
        {mockWeek.map((day) => (
          <View key={day.dayLabel} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <View>
                <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                <Text style={styles.dateLabel}>{day.dateLabel}</Text>
              </View>
              {day.sessions.length > 0 && (
                <View style={styles.sessionCount}>
                  <Text style={styles.sessionCountText}>
                    {day.sessions.length} session{day.sessions.length > 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>

            {day.sessions.length === 0 ? (
              <Text style={styles.emptyText}>
                Nothing scheduled yet—this is a good place for a 20-min block in a favorite subject.
              </Text>
            ) : (
              <View style={styles.sessionsList}>
                {day.sessions.map((s) => (
                  <View key={s.id} style={styles.sessionItem}>
                    <View style={styles.sessionContent}>
                      <Text style={styles.sessionTitle}>{s.title}</Text>
                      <Text style={styles.sessionMeta}>
                        {s.subject} • {s.time}
                      </Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      s.status === "done" ? styles.statusDone : styles.statusScheduled
                    ]}>
                      <Text style={[
                        styles.statusText,
                        s.status === "done" ? styles.statusDoneText : styles.statusScheduledText
                      ]}>
                        {s.status === "done" ? "Done" : "Scheduled"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  weekToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
    borderRadius: 999,
    padding: 2,
  },
  weekToggleActive: {
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  weekToggleActiveText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  weekToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  weekToggleText: {
    fontSize: 12,
    color: colors.muted,
  },
  daysGrid: {
    padding: 16,
    gap: 12,
  },
  dayCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  dateLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  sessionCount: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sessionCountText: {
    fontSize: 11,
    color: colors.muted,
  },
  emptyText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
  },
  sessionsList: {
    gap: 8,
    marginTop: 8,
  },
  sessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    padding: 12,
  },
  sessionContent: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  sessionMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusDone: {
    backgroundColor: '#D1FAE5',
  },
  statusScheduled: {
    backgroundColor: '#DBEAFE',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  statusDoneText: {
    color: '#065F46',
  },
  statusScheduledText: {
    color: '#1E40AF',
  },
});

