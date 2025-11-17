/**
 * Curriculum Heatmap Component
 * Part of Phase 1 - Year-Round Intelligence Core (Chunk E)
 * Displays weekly subject minutes scheduled vs done
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Calendar, RefreshCw, TrendingUp } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getCurriculumHeatmap, checkFeatureFlags } from '../../lib/services/yearClient';

export default function CurriculumHeatmap({ familyId, startDate, endDate, onClose }) {
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);

  useEffect(() => {
    // Check feature flag
    checkFeatureFlags().then(flags => {
      setHeatmapEnabled(flags.heatmap);
      if (flags.heatmap && familyId && startDate && endDate) {
        loadHeatmapData();
      }
    }).catch(err => {
      console.error('[CurriculumHeatmap] Error checking feature flags:', err);
      setHeatmapEnabled(false);
    });
  }, [familyId, startDate, endDate]);

  const loadHeatmapData = async () => {
    if (!familyId || !startDate || !endDate) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await getCurriculumHeatmap(
        familyId,
        startDate,
        endDate
      );
      
      if (fetchError) {
        throw fetchError;
      }
      
      setHeatmapData(data || []);
    } catch (err) {
      console.error('[CurriculumHeatmap] Error loading heatmap:', err);
      setError(err.message || 'Failed to load heatmap data');
    } finally {
      setLoading(false);
    }
  };

  // Group data by week and pivot by subject
  const pivotData = () => {
    const weeksMap = new Map();
    
    heatmapData.forEach(row => {
      const weekKey = row.week_start;
      if (!weeksMap.has(weekKey)) {
        weeksMap.set(weekKey, {
          week_start: weekKey,
          subjects: {}
        });
      }
      
      const week = weeksMap.get(weekKey);
      week.subjects[row.subject] = {
        scheduled: Number(row.minutes_scheduled) || 0,
        done: Number(row.minutes_done) || 0
      };
    });
    
    return Array.from(weeksMap.values()).sort((a, b) => 
      new Date(a.week_start) - new Date(b.week_start)
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Calendar size={48} color={colors.muted} />
      <Text style={styles.emptyTitle}>No events yet</Text>
      <Text style={styles.emptyText}>
        Create a year plan to get started with scheduling.
      </Text>
    </View>
  );

  const renderHeatmap = () => {
    const pivoted = pivotData();
    
    if (pivoted.length === 0) {
      return renderEmptyState();
    }

    // Get all unique subjects
    const allSubjects = new Set();
    pivoted.forEach(week => {
      Object.keys(week.subjects).forEach(subject => {
        if (subject !== 'No events') {
          allSubjects.add(subject);
        }
      });
    });
    const subjectList = Array.from(allSubjects).sort();

    // Calculate max minutes for scaling
    let maxMinutes = 0;
    pivoted.forEach(week => {
      Object.values(week.subjects).forEach(subj => {
        maxMinutes = Math.max(maxMinutes, subj.scheduled, subj.done);
      });
    });

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.heatmapContainer}>
          {/* Header with subject names */}
          <View style={styles.headerRow}>
            <View style={styles.weekLabelColumn}>
              <Text style={styles.headerText}>Week</Text>
            </View>
            {subjectList.map(subject => (
              <View key={subject} style={styles.subjectColumn}>
                <Text style={styles.subjectHeader} numberOfLines={2}>
                  {subject}
                </Text>
              </View>
            ))}
          </View>

          {/* Data rows */}
          {pivoted.map((week, weekIndex) => {
            const weekStartDate = new Date(week.week_start);
            const weekLabel = `${weekStartDate.getMonth() + 1}/${weekStartDate.getDate()}`;
            
            return (
              <View key={week.week_start} style={styles.dataRow}>
                <View style={styles.weekLabelColumn}>
                  <Text style={styles.weekLabel}>{weekLabel}</Text>
                </View>
                {subjectList.map(subject => {
                  const subjData = week.subjects[subject] || { scheduled: 0, done: 0 };
                  const scheduledHeight = maxMinutes > 0 
                    ? Math.min((subjData.scheduled / maxMinutes) * 100, 100) 
                    : 0;
                  const doneHeight = maxMinutes > 0 
                    ? Math.min((subjData.done / maxMinutes) * 100, scheduledHeight) 
                    : 0;
                  
                  // Convert percentage to pixel height (assuming max bar height of 100px)
                  const maxBarHeight = 100;
                  const scheduledHeightPx = scheduledHeight > 0 ? (scheduledHeight / 100) * maxBarHeight : 0;
                  const doneHeightPx = doneHeight > 0 ? (doneHeight / 100) * maxBarHeight : 0;
                  
                  return (
                    <View key={subject} style={styles.subjectColumn}>
                      <View style={styles.barContainer}>
                        {scheduledHeightPx > 0 && (
                          <View 
                            style={[
                              styles.bar, 
                              styles.scheduledBar, 
                              { height: scheduledHeightPx }
                            ]} 
                          />
                        )}
                        {doneHeightPx > 0 && (
                          <View 
                            style={[
                              styles.bar, 
                              styles.doneBar, 
                              { height: doneHeightPx }
                            ]} 
                          />
                        )}
                      </View>
                      <Text style={styles.minutesLabel}>
                        {subjData.done > 0 ? `${Math.round(subjData.done)}` : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  if (!heatmapEnabled) {
    return null; // Don't render if feature flag is off
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TrendingUp size={20} color={colors.accent} />
          <Text style={styles.title}>Curriculum Heatmap</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={loadHeatmapData}
            disabled={loading}
            style={[styles.refreshButton, loading && styles.refreshing]}
          >
            <RefreshCw 
              size={16} 
              color={colors.accent}
            />
          </TouchableOpacity>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading && heatmapData.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Loading heatmap...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadHeatmapData} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, styles.doneBar]} />
              <Text style={styles.legendText}>Done</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, styles.scheduledBar]} />
              <Text style={styles.legendText}>Scheduled</Text>
            </View>
          </View>

          {renderHeatmap()}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  refreshButton: {
    padding: 4,
  },
  refreshing: {
    opacity: 0.5,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.text,
    lineHeight: 24,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 12,
    color: colors.muted,
  },
  heatmapContainer: {
    minWidth: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  dataRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  weekLabelColumn: {
    width: 60,
    paddingRight: 8,
    justifyContent: 'center',
  },
  weekLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  headerText: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '600',
  },
  subjectColumn: {
    width: 80,
    alignItems: 'center',
    marginRight: 4,
  },
  subjectHeader: {
    fontSize: 10,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  barContainer: {
    width: 40,
    height: 100,
    position: 'relative',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 30,
    position: 'absolute',
    bottom: 0,
    borderRadius: 2,
  },
  scheduledBar: {
    backgroundColor: colors.blueBold || '#3b82f6',
    opacity: 0.3,
  },
  doneBar: {
    backgroundColor: colors.greenBold || '#10b981',
    opacity: 1,
  },
  minutesLabel: {
    fontSize: 9,
    color: colors.text,
    marginTop: 2,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    flexDirection: 'row',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    marginBottom: 12,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  retryButtonText: {
    color: colors.accentContrast,
    fontSize: 14,
    fontWeight: '500',
  },
});

