import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ArrowRight } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { getWeekStart } from '../../lib/apiClient';

export default function WeeklySnapshot({ familyId, children = [], onViewFull }) {
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (familyId && children.length > 0) {
      loadProgress();
    } else {
      setLoading(false);
    }
  }, [familyId, children]);

  const loadProgress = async () => {
    setLoading(true);
    try {
      const weekStart = getWeekStart(new Date());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999); // End of day

      const progressData = {};
      
      for (const child of children) {
        try {
          // Count total scheduled events this week (scheduled + done)
          const { data: allEvents, error: allEventsError } = await supabase
            .from('events')
            .select('id, status')
            .eq('child_id', child.id)
            .gte('start_ts', weekStart.toISOString())
            .lte('start_ts', weekEnd.toISOString())
            .in('status', ['scheduled', 'done']);

          if (allEventsError) {
            progressData[child.id] = { completed: 0, total: 0 };
            continue;
          }

          const totalEvents = allEvents?.length || 0;
          
          // Count completed events
          const completedEvents = allEvents?.filter(e => e.status === 'done').length || 0;

          progressData[child.id] = {
            completed: completedEvents,
            total: totalEvents || 0,
          };
        } catch (err) {
          progressData[child.id] = { completed: 0, total: 0 };
        }
      }

      setProgress(progressData);
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Weekly Progress</Text>
        </View>
        <ActivityIndicator size="small" color={colors.muted} />
      </View>
    );
  }

  if (children.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={styles.title}>Weekly progress</Text>
          <View style={styles.progressRow}>
            {children.map((child, index) => {
              const p = progress[child.id] || { completed: 0, total: 0 };
              const name = child.first_name || child.name || 'Child';
              return (
                <React.Fragment key={child.id}>
                  <Text style={styles.progressText}>
                    {name}: {p.completed}/{p.total}
                  </Text>
                  {index < children.length - 1 && (
                    <Text style={styles.separator}> • </Text>
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </View>
        {onViewFull && (
          <TouchableOpacity 
            style={styles.viewLink}
            onPress={onViewFull}
          >
            <Text style={styles.viewLinkText}>View full insights</Text>
            <ArrowRight size={12} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: colors.muted,
  },
  separator: {
    fontSize: 12,
    color: colors.muted,
    marginHorizontal: 4,
  },
  viewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewLinkText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
});

