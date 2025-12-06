/**
 * Term-Level Forecasting Dashboard
 * Shows expected progress, coverage, and bottlenecks for academic terms
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Calendar, TrendingUp, AlertTriangle, CheckCircle, BarChart3, Target, Clock } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { compareToSyllabusWeek, getCapacity } from '../../lib/apiClient';
import { getWeekStart } from '../../lib/apiClient';

export default function TermForecastingDashboard({ 
  familyId, 
  yearPlanId = null,
  selectedTermId = null,
  children = [],
  selectedChildIds = null 
}) {
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [bottlenecks, setBottlenecks] = useState([]);

  useEffect(() => {
    if (familyId) {
      loadTerms();
    }
  }, [familyId, yearPlanId]);

  useEffect(() => {
    if (selectedTerm) {
      loadForecastData();
    }
  }, [selectedTerm, familyId, selectedChildIds]);

  const loadTerms = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('year_plan_terms')
        .select('*')
        .order('start_date', { ascending: true });

      if (yearPlanId) {
        query = query.eq('year_plan_id', yearPlanId);
      } else {
        // Get terms from all year plans for this family
        const { data: yearPlans } = await supabase
          .from('year_plans')
          .select('id')
          .eq('family_id', familyId);
        
        if (yearPlans && yearPlans.length > 0) {
          query = query.in('year_plan_id', yearPlans.map(p => p.id));
        } else {
          setTerms([]);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      setTerms(data || []);
      
      // Set selected term
      if (selectedTermId) {
        const term = data?.find(t => t.id === selectedTermId);
        setSelectedTerm(term || data?.[0] || null);
      } else {
        // Select current term or first term
        const now = new Date();
        const currentTerm = data?.find(t => {
          const start = new Date(t.start_date);
          const end = new Date(t.end_date);
          return now >= start && now <= end;
        });
        setSelectedTerm(currentTerm || data?.[0] || null);
      }
    } catch (error) {
      console.error('Error loading terms:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadForecastData = async () => {
    if (!selectedTerm) return;

    try {
      setLoading(true);

      const termStart = new Date(selectedTerm.start_date);
      const termEnd = new Date(selectedTerm.end_date);
      const today = new Date();
      
      // Calculate term progress (days elapsed / total days)
      const totalDays = Math.ceil((termEnd - termStart) / (1000 * 60 * 60 * 24));
      const daysElapsed = Math.max(0, Math.min(totalDays, Math.ceil((today - termStart) / (1000 * 60 * 60 * 24))));
      const expectedProgress = (daysElapsed / totalDays) * 100;

      // Load events for this term
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, child_id, subject_id, start_ts, end_ts, status, minutes, title')
        .eq('family_id', familyId)
        .gte('start_ts', termStart.toISOString())
        .lte('start_ts', termEnd.toISOString())
        .in('status', ['scheduled', 'in_progress', 'done']);

      if (eventsError) throw eventsError;

      // Filter by selected children if provided
      const filteredEvents = selectedChildIds && selectedChildIds.length > 0
        ? events.filter(e => selectedChildIds.includes(e.child_id))
        : events;

      // Calculate actual progress metrics
      const totalMinutes = filteredEvents.reduce((sum, e) => sum + (e.minutes || 0), 0);
      const completedMinutes = filteredEvents
        .filter(e => e.status === 'done')
        .reduce((sum, e) => sum + (e.minutes || 0), 0);
      
      // Group by subject
      const subjectProgress = {};
      filteredEvents.forEach(event => {
        const subjectId = event.subject_id || 'unknown';
        if (!subjectProgress[subjectId]) {
          subjectProgress[subjectId] = {
            total: 0,
            completed: 0,
            scheduled: 0,
            events: []
          };
        }
        subjectProgress[subjectId].total += event.minutes || 0;
        if (event.status === 'done') {
          subjectProgress[subjectId].completed += event.minutes || 0;
        } else {
          subjectProgress[subjectId].scheduled += event.minutes || 0;
        }
        subjectProgress[subjectId].events.push(event);
      });

      // Load subject names
      const subjectIds = Object.keys(subjectProgress).filter(id => id !== 'unknown');
      const { data: subjects } = await supabase
        .from('subject')
        .select('id, name')
        .in('id', subjectIds);

      const subjectMap = {};
      subjects?.forEach(s => { subjectMap[s.id] = s.name; });

      // Calculate coverage (subjects with activity)
      const subjectsWithActivity = Object.keys(subjectProgress).length;
      const totalSubjects = subjects?.length || 0;
      const coveragePercent = totalSubjects > 0 ? (subjectsWithActivity / totalSubjects) * 100 : 0;

      // Identify bottlenecks (subjects significantly behind)
      const detectedBottlenecks = [];
      Object.entries(subjectProgress).forEach(([subjectId, data]) => {
        const subjectName = subjectMap[subjectId] || 'Unknown Subject';
        const completionRate = data.total > 0 ? (data.completed / data.total) * 100 : 0;
        
        // Bottleneck if completion rate is significantly below expected progress
        if (completionRate < expectedProgress - 20) {
          detectedBottlenecks.push({
            subjectId,
            subjectName,
            completionRate,
            expectedProgress,
            gap: expectedProgress - completionRate,
            scheduledMinutes: data.scheduled,
            completedMinutes: data.completed
          });
        }
      });

      // Sort bottlenecks by gap (largest first)
      detectedBottlenecks.sort((a, b) => b.gap - a.gap);

      // Load current week pace data
      const weekStart = getWeekStart(new Date());
      let paceData = null;
      try {
        const childIds = selectedChildIds && selectedChildIds.length > 0 
          ? selectedChildIds 
          : children.map(c => c.id);
        
        if (childIds.length > 0) {
          const paceResult = await compareToSyllabusWeek({ 
            familyId, 
            childId: childIds[0], // Use first child for pace calculation
            weekStart 
          });
          
          if (paceResult.data && paceResult.data.length > 0) {
            const total = paceResult.data.reduce((sum, item) => {
              const expected = item.expected_weekly_minutes || 0;
              const done = item.done_minutes || 0;
              return sum + (expected > 0 ? (done / expected) * 100 : 100);
            }, 0);
            paceData = paceResult.data.length > 0 ? total / paceResult.data.length : 0;
          }
        }
      } catch (err) {
        console.warn('Error loading pace data:', err);
      }

      setForecastData({
        termProgress: {
          expected: expectedProgress,
          actual: totalMinutes > 0 ? (completedMinutes / totalMinutes) * 100 : 0,
          daysElapsed,
          totalDays
        },
        coverage: {
          percent: coveragePercent,
          subjectsWithActivity,
          totalSubjects
        },
        subjectProgress: Object.entries(subjectProgress).map(([subjectId, data]) => ({
          subjectId,
          subjectName: subjectMap[subjectId] || 'Unknown Subject',
          totalMinutes: data.total,
          completedMinutes: data.completed,
          scheduledMinutes: data.scheduled,
          completionRate: data.total > 0 ? (data.completed / data.total) * 100 : 0
        })),
        pace: paceData,
        totalMinutes,
        completedMinutes
      });

      setBottlenecks(detectedBottlenecks);
    } catch (error) {
      console.error('Error loading forecast data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading && !forecastData) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading forecasting data...</Text>
      </View>
    );
  }

  if (!selectedTerm) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No terms found. Create a year plan with terms to see forecasting.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Term Selector */}
      <View style={styles.termSelector}>
        <Calendar size={20} color={colors.primary} />
        <View style={styles.termSelectorContent}>
          <Text style={styles.termSelectorLabel}>Current Term</Text>
          <Text style={styles.termSelectorValue}>{selectedTerm.term_name}</Text>
          <Text style={styles.termSelectorDates}>
            {formatDate(selectedTerm.start_date)} - {formatDate(selectedTerm.end_date)}
          </Text>
        </View>
        {terms.length > 1 && (
          <TouchableOpacity style={styles.termDropdown}>
            <Text style={styles.termDropdownText}>Change Term</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress Overview */}
      {forecastData && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Progress Overview</Text>
            </View>
            
            <View style={styles.progressCard}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Expected Progress</Text>
                <Text style={styles.progressValue}>
                  {Math.round(forecastData.termProgress.expected)}%
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { width: `${forecastData.termProgress.expected}%`, backgroundColor: colors.blueBold }
                  ]} 
                />
              </View>
              
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Actual Progress</Text>
                <Text style={[
                  styles.progressValue,
                  forecastData.termProgress.actual < forecastData.termProgress.expected - 10 
                    ? { color: colors.redBold }
                    : forecastData.termProgress.actual > forecastData.termProgress.expected + 10
                    ? { color: colors.greenBold }
                    : {}
                ]}>
                  {Math.round(forecastData.termProgress.actual)}%
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: `${forecastData.termProgress.actual}%`,
                      backgroundColor: forecastData.termProgress.actual < forecastData.termProgress.expected - 10
                        ? colors.redBold
                        : colors.greenBold
                    }
                  ]} 
                />
              </View>

              <View style={styles.progressMeta}>
                <Text style={styles.progressMetaText}>
                  {forecastData.termProgress.daysElapsed} of {forecastData.termProgress.totalDays} days elapsed
                </Text>
                <Text style={styles.progressMetaText}>
                  {Math.round(forecastData.completedMinutes / 60)}h completed
                </Text>
              </View>
            </View>
          </View>

          {/* Coverage Analysis */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Target size={20} color={colors.greenBold} />
              <Text style={styles.sectionTitle}>Coverage Analysis</Text>
            </View>
            
            <View style={styles.coverageCard}>
              <View style={styles.coverageHeader}>
                <Text style={styles.coverageValue}>
                  {Math.round(forecastData.coverage.percent)}%
                </Text>
                <Text style={styles.coverageLabel}>Subject Coverage</Text>
              </View>
              <View style={styles.coverageDetails}>
                <Text style={styles.coverageDetailText}>
                  {forecastData.coverage.subjectsWithActivity} of {forecastData.coverage.totalSubjects} subjects have scheduled activity
                </Text>
              </View>
            </View>

            {/* Subject Progress List */}
            <View style={styles.subjectList}>
              {forecastData.subjectProgress.map((subject) => (
                <View key={subject.subjectId} style={styles.subjectCard}>
                  <View style={styles.subjectHeader}>
                    <Text style={styles.subjectName}>{subject.subjectName}</Text>
                    <Text style={styles.subjectCompletion}>
                      {Math.round(subject.completionRate)}%
                    </Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressBarFill, 
                        { 
                          width: `${subject.completionRate}%`,
                          backgroundColor: subject.completionRate < forecastData.termProgress.expected - 20
                            ? colors.redBold
                            : colors.primary
                        }
                      ]} 
                    />
                  </View>
                  <View style={styles.subjectMeta}>
                    <Text style={styles.subjectMetaText}>
                      {Math.round(subject.completedMinutes / 60)}h completed
                    </Text>
                    <Text style={styles.subjectMetaText}>
                      {Math.round(subject.scheduledMinutes / 60)}h scheduled
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Bottlenecks */}
          {bottlenecks.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <AlertTriangle size={20} color={colors.orangeBold} />
                <Text style={styles.sectionTitle}>Bottlenecks</Text>
              </View>
              
              {bottlenecks.map((bottleneck, idx) => (
                <View key={idx} style={styles.bottleneckCard}>
                  <View style={styles.bottleneckHeader}>
                    <AlertTriangle size={16} color={colors.orangeBold} />
                    <Text style={styles.bottleneckSubject}>{bottleneck.subjectName}</Text>
                  </View>
                  <Text style={styles.bottleneckText}>
                    {Math.round(bottleneck.gap)}% behind expected progress
                  </Text>
                  <View style={styles.bottleneckDetails}>
                    <Text style={styles.bottleneckDetailText}>
                      Expected: {Math.round(bottleneck.expectedProgress)}%
                    </Text>
                    <Text style={styles.bottleneckDetailText}>
                      Actual: {Math.round(bottleneck.completionRate)}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Pace Indicator */}
          {forecastData.pace !== null && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Clock size={20} color={colors.blueBold} />
                <Text style={styles.sectionTitle}>Current Week Pace</Text>
              </View>
              
              <View style={styles.paceCard}>
                <Text style={styles.paceValue}>
                  {Math.round(forecastData.pace)}%
                </Text>
                <Text style={styles.paceLabel}>
                  of expected weekly minutes completed this week
                </Text>
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    padding: 40,
  },
  termSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  termSelectorContent: {
    flex: 1,
  },
  termSelectorLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  termSelectorValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  termSelectorDates: {
    fontSize: 12,
    color: colors.muted,
  },
  termDropdown: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  termDropdownText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  progressCard: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  progressValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 4,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  progressMetaText: {
    fontSize: 12,
    color: colors.muted,
  },
  coverageCard: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  coverageHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  coverageValue: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.greenBold,
    marginBottom: 4,
  },
  coverageLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  coverageDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  coverageDetailText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  subjectList: {
    gap: 12,
  },
  subjectCard: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  subjectCompletion: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  subjectMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  subjectMetaText: {
    fontSize: 11,
    color: colors.muted,
  },
  bottleneckCard: {
    backgroundColor: colors.orangeSoft,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.orangeBold,
  },
  bottleneckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  bottleneckSubject: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.orangeBold,
  },
  bottleneckText: {
    fontSize: 12,
    color: colors.text,
    marginBottom: 4,
  },
  bottleneckDetails: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  bottleneckDetailText: {
    fontSize: 11,
    color: colors.muted,
  },
  paceCard: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  paceValue: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.blueBold,
    marginBottom: 4,
  },
  paceLabel: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
});

