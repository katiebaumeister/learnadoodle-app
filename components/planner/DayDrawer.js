import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Calendar, Clock, Plus, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';

function useDayView(date, childIds, familyId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!familyId) return;
      setLoading(true);
      
      const { data: res, error } = await supabase.rpc('get_day_view', {
        _family_id: familyId,
        _date: date.toISOString().slice(0, 10),
        _child_ids: childIds || null
      });

      if (error) {
        console.error('get_day_view error', error);
        setLoading(false);
        return;
      }
      if (!active) return;
      setData(res);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [date.toDateString(), JSON.stringify(childIds || []), familyId]);

  return { data, loading };
}

export default function DayDrawer({ date, childIds, familyId, onAddActivity, onAIPlanDay }) {
  const { data, loading } = useDayView(date, childIds, familyId);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const events = data.events || [];
  const avail = data.availability || [];
  const overrides = data.overrides || [];

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Calendar size={16} color={colors.text} />
          <Text style={styles.headerTitle}>
            {date.toLocaleDateString(undefined, { 
              weekday: 'long', 
              month: 'short', 
              day: 'numeric' 
            })}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => onAddActivity?.(date)}
          >
            <Plus size={14} color={colors.accentContrast} />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.aiButton}
            onPress={() => onAIPlanDay?.(date)}
          >
            <Sparkles size={14} color={colors.accent} />
            <Text style={styles.aiButtonText}>AI plan day</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Availability Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Availability</Text>
        {avail.map((a, idx) => {
          const status = a.day_status || 'unknown';
          const statusConfig = {
            teach: { bg: colors.greenSoft, text: colors.greenBold, label: 'Teach' },
            partial: { bg: colors.yellowSoft, text: colors.yellowBold, label: 'Partial' },
            off: { bg: colors.panel, text: colors.muted, label: 'Off' },
            unknown: { bg: colors.panel, text: colors.muted, label: 'Unknown' }
          };
          const config = statusConfig[status] || statusConfig.unknown;
          const windows = a.windows || [];

          return (
            <View 
              key={idx} 
              style={[
                styles.availCard,
                { backgroundColor: config.bg, borderColor: config.text }
              ]}
            >
              <Text style={[styles.availStatus, { color: config.text }]}>
                {config.label}
              </Text>
              {windows.length > 0 && (
                <Text style={[styles.availWindows, { color: config.text }]}>
                  {windows.map(w => `${w.start}–${w.end}`).join('  ·  ')}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Overrides */}
      {overrides.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overrides</Text>
          {overrides.map((o, idx) => (
            <View key={idx} style={styles.overrideCard}>
              <Text style={styles.overrideKind}>{o.override_kind}</Text>
              <Text style={styles.overrideTime}>
                {o.start_time}–{o.end_time}
              </Text>
              {o.notes && (
                <Text style={styles.overrideNotes}>{o.notes}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Today's Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        {events.length > 0 ? (
          events.map((e) => (
            <TouchableOpacity 
              key={e.id} 
              style={styles.eventCard}
              onPress={() => console.log('Open event:', e)}
            >
              <View style={styles.eventContent}>
                <Text style={styles.eventTitle}>
                  {e.subject || e.title}
                </Text>
                <View style={styles.eventMeta}>
                  <Clock size={14} color={colors.muted} />
                  <Text style={styles.eventTime}>
                    {new Date(e.start_ts).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}–{new Date(e.end_ts).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </Text>
                </View>
                {e.description && (
                  <Text style={styles.eventLocation}>{e.description}</Text>
                )}
              </View>
              <Text style={styles.eventAction}>Open</Text>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptySchedule}>
            <Text style={styles.emptyScheduleText}>
              No items scheduled — try AI planner
            </Text>
          </View>
        )}
      </View>

      {/* Scheduled Minutes */}
      {data.scheduled_minutes_today && data.scheduled_minutes_today.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Minutes Today</Text>
          {data.scheduled_minutes_today.map((m, idx) => (
            <View key={idx} style={styles.minutesCard}>
              <Text style={styles.minutesText}>
                {Math.round(m.scheduled_min)} min scheduled
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
  },
  emptyText: {
    padding: 16,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  header: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.accent,
  },
  section: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  availCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 4,
  },
  availStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  availWindows: {
    fontSize: 11,
  },
  overrideCard: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  overrideKind: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  overrideTime: {
    fontSize: 11,
    color: colors.muted,
  },
  overrideNotes: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  eventCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    ...shadows.sm,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  eventTime: {
    fontSize: 12,
    color: colors.muted,
  },
  eventLocation: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
  },
  eventAction: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
  emptySchedule: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyScheduleText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  minutesCard: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  minutesText: {
    fontSize: 12,
    color: colors.text,
  },
});
