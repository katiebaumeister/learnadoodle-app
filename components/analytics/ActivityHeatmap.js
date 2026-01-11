/**
 * Activity Heatmap Component
 * Shows activity intensity over time (GitHub-style contribution graph)
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Calendar, Clock } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

export default function ActivityHeatmap({ childId, familyId, daysBack = 90 }) {
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    if (childId && familyId) {
      loadActivityData();
    }
  }, [childId, familyId, daysBack]);

  const loadActivityData = async () => {
    setLoading(true);
    setError(null);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // Get events grouped by day
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('start_ts, minutes, status')
        .eq('child_id', childId)
        .eq('family_id', familyId)
        .gte('start_ts', startDate.toISOString())
        .lte('start_ts', endDate.toISOString());

      if (eventsError) throw eventsError;

      // Group by date and calculate activity level
      const activityMap = {};
      events?.forEach(event => {
        const date = new Date(event.start_ts).toISOString().split('T')[0];
        if (!activityMap[date]) {
          activityMap[date] = { minutes: 0, count: 0, completed: 0 };
        }
        activityMap[date].minutes += event.minutes || 0;
        activityMap[date].count += 1;
        if (event.status === 'done') {
          activityMap[date].completed += 1;
        }
      });

      // Generate all days in range
      const days = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const activity = activityMap[dateStr] || { minutes: 0, count: 0, completed: 0 };
        days.push({
          date: dateStr,
          ...activity,
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      setHeatmapData(days);
    } catch (err) {
      setError(err.message || 'Failed to load activity data');
    } finally {
      setLoading(false);
    }
  };

  const getActivityLevel = (day) => {
    if (day.minutes === 0) return 0;
    // Normalize to 4 levels based on minutes
    const maxMinutes = Math.max(...heatmapData.map(d => d.minutes), 1);
    const ratio = day.minutes / maxMinutes;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  const getActivityColor = (level) => {
    const colors = {
      0: '#f3f4f6', // No activity
      1: '#dbeafe', // Light
      2: '#93c5fd', // Medium
      3: '#60a5fa', // High
      4: '#3b82f6', // Very high
    };
    return colors[level] || colors[0];
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading activity data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // Group by weeks for display
  const weeks = [];
  for (let i = 0; i < heatmapData.length; i += 7) {
    weeks.push(heatmapData.slice(i, i + 7));
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.heatmapContainer}>
          {/* Day labels */}
          <View style={styles.dayLabels}>
            {['Mon', 'Wed', 'Fri', 'Sun'].map((day, idx) => (
              <Text key={idx} style={styles.dayLabel}>{day}</Text>
            ))}
          </View>

          {/* Weeks */}
          <View style={styles.weeksContainer}>
            {weeks.map((week, weekIdx) => (
              <View key={weekIdx} style={styles.week}>
                {week.map((day, dayIdx) => {
                  const level = getActivityLevel(day);
                  const isSelected = selectedDay?.date === day.date;
                  
                  return (
                    <TouchableOpacity
                      key={dayIdx}
                      style={[
                        styles.day,
                        { backgroundColor: getActivityColor(level) },
                        isSelected && styles.daySelected,
                      ]}
                      onPress={() => setSelectedDay(day)}
                      {...(Platform.OS === 'web' && {
                        title: `${formatDate(day.date)}: ${day.minutes} min, ${day.count} events`,
                      })}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendLabel}>Less</Text>
        <View style={styles.legendColors}>
          {[0, 1, 2, 3, 4].map(level => (
            <View
              key={level}
              style={[
                styles.legendColor,
                { backgroundColor: getActivityColor(level) },
              ]}
            />
          ))}
        </View>
        <Text style={styles.legendLabel}>More</Text>
      </View>

      {/* Selected day info */}
      {selectedDay && (
        <View style={styles.selectedDayInfo}>
          <Text style={styles.selectedDayDate}>{formatDate(selectedDay.date)}</Text>
          <View style={styles.selectedDayStats}>
            <View style={styles.stat}>
              <Clock size={14} color={colors.muted || '#6b7280'} />
              <Text style={styles.statText}>{selectedDay.minutes} minutes</Text>
            </View>
            <View style={styles.stat}>
              <Calendar size={14} color={colors.muted || '#6b7280'} />
              <Text style={styles.statText}>{selectedDay.count} events</Text>
            </View>
            {selectedDay.completed > 0 && (
              <View style={styles.stat}>
                <Text style={styles.statText}>{selectedDay.completed} completed</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
  },
  heatmapContainer: {
    flexDirection: 'row',
  },
  dayLabels: {
    marginRight: 8,
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  dayLabel: {
    fontSize: 11,
    color: colors.muted || '#6b7280',
    height: 12,
    marginBottom: 2,
  },
  weeksContainer: {
    flexDirection: 'row',
    gap: 3,
  },
  week: {
    flexDirection: 'column',
    gap: 3,
  },
  day: {
    width: 12,
    height: 12,
    borderRadius: 2,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s',
      ':hover': {
        transform: 'scale(1.2)',
      },
    }),
  },
  daySelected: {
    borderWidth: 2,
    borderColor: colors.accent || '#3b82f6',
    transform: [{ scale: 1.3 }],
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  legendLabel: {
    fontSize: 11,
    color: colors.muted || '#6b7280',
  },
  legendColors: {
    flexDirection: 'row',
    gap: 3,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  selectedDayInfo: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  selectedDayDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 8,
  },
  selectedDayStats: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
});

