import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';
import { getWeekStart } from '../../../lib/apiClient';

export default function ScheduleTab({ child }) {
  const [weekData, setWeekData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));

  useEffect(() => {
    fetchWeekSchedule();
  }, [child.id, currentWeekStart]);

  const fetchWeekSchedule = async () => {
    if (!child?.id) return;
    
    try {
      setLoading(true);
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, start_ts, end_ts, status, subject_id')
        .eq('child_id', child.id)
        .gte('start_ts', currentWeekStart.toISOString())
        .lt('start_ts', weekEnd.toISOString())
        .order('start_ts', { ascending: true });

      if (error) throw error;

      // Fetch subject names separately
      const subjectIds = [...new Set((events || []).map(e => e.subject_id).filter(Boolean))];
      const subjectLookup = {};
      
      if (subjectIds.length > 0) {
        const { data: subjects } = await supabase
          .from('subject')
          .select('id, name')
          .in('id', subjectIds);
        
        (subjects || []).forEach(s => {
          subjectLookup[s.id] = s.name;
        });
      }

      // Group events by day
      const daysMap = new Map();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];
        const dayLabel = dayNames[date.getDay()];
        const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        
        daysMap.set(dateKey, {
          dayLabel,
          dateLabel,
          dateKey,
          sessions: []
        });
      }

      // Add events to their respective days
      (events || []).forEach(event => {
        const eventDate = new Date(event.start_ts);
        const dateKey = eventDate.toISOString().split('T')[0];
        const dayData = daysMap.get(dateKey);
        
        if (dayData) {
          const startTime = eventDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          const endTime = new Date(event.end_ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          
          dayData.sessions.push({
            id: event.id,
            title: event.title,
            subject: event.subject_id ? (subjectLookup[event.subject_id] || 'Unassigned') : 'Unassigned',
            time: `${startTime}–${endTime}`,
            status: event.status === 'done' ? 'done' : 'scheduled',
          });
        }
      });

      setWeekData(Array.from(daysMap.values()));
    } catch (error) {
      setWeekData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleWeekToggle = (isNextWeek) => {
    const newWeekStart = new Date(currentWeekStart);
    if (isNextWeek) {
      newWeekStart.setDate(newWeekStart.getDate() + 7);
    } else {
      newWeekStart.setDate(newWeekStart.getDate() - 7);
    }
    setCurrentWeekStart(getWeekStart(newWeekStart));
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule for {child.first_name}</Text>
        <View style={styles.weekToggle}>
          <TouchableOpacity 
            style={styles.weekToggleActive}
            onPress={() => handleWeekToggle(false)}
          >
            <Text style={styles.weekToggleActiveText}>This week</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.weekToggleButton}
            onPress={() => handleWeekToggle(true)}
          >
            <Text style={styles.weekToggleText}>Next week</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.daysGrid}>
        {weekData.map((day) => (
          <View key={day.dateKey} style={styles.dayCard}>
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

