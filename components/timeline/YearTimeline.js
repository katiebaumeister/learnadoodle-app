/**
 * Year Timeline Component
 * "Look back on the year" - Comprehensive timeline of past learning
 */
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, BookOpen, Award, Upload, Clock } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

export default function YearTimeline({ familyId, childId = null, year = null }) {
  const [selectedYear, setSelectedYear] = useState(year || new Date().getFullYear());
  const [timelineData, setTimelineData] = useState([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    loadTimelineData();
  }, [familyId, childId, selectedYear]);

  const loadTimelineData = async () => {
    setLoading(true);
    try {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      // Fetch all timeline items in parallel
      const [eventsResult, attendanceResult, uploadsResult, gradesResult] = await Promise.all([
        // Completed events
        supabase
          .from('events')
          .select('id, title, start_ts, child_id, subject, status')
          .eq('family_id', familyId)
          .eq('status', 'done')
          .gte('start_ts', startDate)
          .lte('start_ts', endDate)
          .order('start_ts', { ascending: false }),
        
        // Attendance records
        supabase
          .from('attendance_records')
          .select('id, day_date, minutes, status, child_id')
          .eq('family_id', familyId)
          .gte('day_date', startDate)
          .lte('day_date', endDate)
          .order('day_date', { ascending: false }),
        
        // Portfolio uploads
        supabase
          .from('uploads')
          .select('id, title, caption, created_at, child_id')
          .eq('family_id', familyId)
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .order('created_at', { ascending: false }),
        
        // Grades
        supabase
          .from('grades')
          .select('id, grade, created_at, child_id, subject_id')
          .eq('family_id', familyId)
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .order('created_at', { ascending: false }),
      ]);

      const items = [];

      // Process events
      if (eventsResult.data) {
        eventsResult.data.forEach(event => {
          if (!childId || event.child_id === childId) {
            items.push({
              id: `event-${event.id}`,
              type: 'event',
              date: new Date(event.start_ts),
              title: event.title || event.subject || 'Learning session',
              subtitle: event.subject,
              icon: BookOpen,
              color: '#8B7CF6',
            });
          }
        });
      }

      // Process attendance
      if (attendanceResult.data) {
        attendanceResult.data.forEach(record => {
          if (!childId || record.child_id === childId) {
            items.push({
              id: `attendance-${record.id}`,
              type: 'attendance',
              date: new Date(record.day_date),
              title: `${record.minutes} minutes`,
              subtitle: record.status === 'present' ? 'Present' : 'Partial',
              icon: Clock,
              color: record.status === 'present' ? '#86EFAC' : '#FDE047',
            });
          }
        });
      }

      // Process uploads
      if (uploadsResult.data) {
        uploadsResult.data.forEach(upload => {
          if (!childId || upload.child_id === childId) {
            items.push({
              id: `upload-${upload.id}`,
              type: 'upload',
              date: new Date(upload.created_at),
              title: upload.title || upload.caption || 'Portfolio item',
              subtitle: 'Portfolio',
              icon: Upload,
              color: '#7DD3FC',
            });
          }
        });
      }

      // Process grades
      if (gradesResult.data) {
        gradesResult.data.forEach(grade => {
          if (!childId || grade.child_id === childId) {
            items.push({
              id: `grade-${grade.id}`,
              type: 'grade',
              date: new Date(grade.created_at),
              title: `Grade: ${grade.grade || 'Recorded'}`,
              subtitle: 'Assessment',
              icon: Award,
              color: '#C084FC',
            });
          }
        });
      }

      // Sort by date descending
      items.sort((a, b) => b.date - a.date);
      setTimelineData(items);
    } catch (error) {
      console.error('Error loading timeline data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group by month
  const groupedByMonth = useMemo(() => {
    const groups = {};
    timelineData.forEach(item => {
      const monthKey = item.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(item);
    });
    return groups;
  }, [timelineData]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <View style={styles.container}>
      {/* Year Selector */}
      <View style={styles.yearSelector}>
        <TouchableOpacity
          onPress={() => setSelectedYear(selectedYear - 1)}
          style={styles.yearButton}
        >
          <ChevronLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.yearText}>{selectedYear}</Text>
        <TouchableOpacity
          onPress={() => setSelectedYear(selectedYear + 1)}
          style={styles.yearButton}
          disabled={selectedYear >= currentYear}
        >
          <ChevronRight size={20} color={selectedYear >= currentYear ? colors.muted : colors.text} />
        </TouchableOpacity>
      </View>

      {/* Timeline */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading timeline...</Text>
        </View>
      ) : timelineData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Calendar size={48} color={colors.muted} />
          <Text style={styles.emptyText}>No learning activities for {selectedYear}</Text>
          <Text style={styles.emptySubtext}>Complete lessons to see your timeline</Text>
        </View>
      ) : (
        <ScrollView style={styles.timelineContainer} showsVerticalScrollIndicator={false}>
          {Object.entries(groupedByMonth).map(([monthKey, items]) => (
            <View key={monthKey} style={styles.monthGroup}>
              <View style={styles.monthHeader}>
                <Text style={styles.monthTitle}>{monthKey}</Text>
                <Text style={styles.monthCount}>{items.length} activities</Text>
              </View>
              <View style={styles.timeline}>
                {items.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <View key={item.id} style={styles.timelineItem}>
                      <View style={[styles.timelineDot, { backgroundColor: item.color }]}>
                        <Icon size={12} color="#FFFFFF" />
                      </View>
                      {index < items.length - 1 && <View style={styles.timelineLine} />}
                      <View style={styles.timelineContent}>
                        <Text style={styles.itemDate}>
                          {item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                        <Text style={styles.itemTitle}>{item.title}</Text>
                        {item.subtitle && (
                          <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  yearSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 16,
  },
  yearButton: {
    padding: 8,
  },
  yearText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    minWidth: 80,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.muted,
  },
  timelineContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  monthGroup: {
    marginBottom: 32,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  monthCount: {
    fontSize: 12,
    color: colors.muted,
  },
  timeline: {
    paddingLeft: 12,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
    position: 'relative',
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    ...shadows.sm,
  },
  timelineLine: {
    position: 'absolute',
    left: 23,
    top: 24,
    width: 2,
    height: '100%',
    backgroundColor: colors.border,
  },
  timelineContent: {
    flex: 1,
    paddingTop: 2,
  },
  itemDate: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 12,
    color: colors.muted,
  },
});

