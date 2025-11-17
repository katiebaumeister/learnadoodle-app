import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight, Target, Lightbulb, AlertCircle, BookOpen } from 'lucide-react';
import { colors } from '../../../theme/colors';
import IdentityPanel from '../IdentityPanel';
import WeeklySummary from '../WeeklySummary';
import WeeklyMinutesCard from '../WeeklyMinutesCard';
import SubjectBreakdownCard from '../SubjectBreakdownCard';
import ProgressVsSyllabusCard from '../ProgressVsSyllabusCard';
import GoalsList from '../../goals/GoalsList';
import EventsTimeline from '../../profile/EventsTimeline';
import NextWeekPlan from '../../profile/NextWeekPlan';
import RecommendedActions from '../RecommendedActions';

export default function OverviewTab({
  child,
  data,
  weekStart,
  setWeekStart,
  pacingData,
  onAITopOff,
  onEditGoal,
  onAddGoal,
  onOpenPlanner,
  onPlanYear,
  yearPlansEnabled,
  onAddSession,
  onAddActivity,
  onAddSyllabus,
}) {
  const goals = data.goals || [];
  const events = data.events || [];
  const summary = data.summary || { 
    total_minutes: 0, 
    done_minutes: 0, 
    completion_pct: 0, 
    ai_comment: '' 
  };
  
  const progressBySubject = {};
  goals.forEach(g => {
    progressBySubject[g.subject_id] = {
      scheduled_min: g.scheduled_min || 0,
      done_min: g.done_min || 0
    };
  });

  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const weekEnd = addDays(weekStart, 6);

  // Calculate streak (placeholder - would need backend support)
  const streak = 0;

  // Check for missed sessions
  const now = new Date();
  const missedSessions = events.filter(ev => {
    if (ev.status === 'done' || ev.status === 'canceled') return false;
    return new Date(ev.start_ts) < now;
  }).length;

  // Check if syllabus is empty
  const hasSyllabus = pacingData && pacingData.length > 0;

  return (
    <ScrollView style={styles.container}>
      {/* Week Navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity 
          style={styles.weekNavButton}
          onPress={() => setWeekStart(addDays(weekStart, -7))}
        >
          <ChevronLeft size={16} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.weekNavButton}
          onPress={() => {
            const monday = new Date();
            const d = (monday.getDay() + 6) % 7;
            monday.setDate(monday.getDate() - d);
            setWeekStart(monday);
          }}
        >
          <Text style={styles.weekNavText}>This week</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.weekNavButton}
          onPress={() => setWeekStart(addDays(weekStart, 7))}
        >
          <ChevronRight size={16} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Identity Panel */}
      <View style={styles.section}>
        <IdentityPanel 
          child={child} 
          summary={summary} 
          goals={goals} 
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
      </View>

      {/* Weekly Summary */}
      <View style={styles.section}>
        <WeeklySummary summary={summary} goals={goals} streak={streak} />
      </View>

      {/* Contextual Helper Tips */}
      {summary.done_minutes === 0 && (
        <View style={styles.tipCard}>
          <Lightbulb size={16} color={colors.orangeBold} />
          <Text style={styles.tipText}>
            Start with a favorite subject — one small win creates momentum.
          </Text>
        </View>
      )}

      {missedSessions > 0 && (
        <View style={[styles.tipCard, styles.tipCardWarning]}>
          <AlertCircle size={16} color={colors.redBold} />
          <Text style={styles.tipText}>
            Missed {missedSessions} session{missedSessions > 1 ? 's' : ''}. Want AI to rebalance the week?
          </Text>
        </View>
      )}

      {!hasSyllabus && (
        <View style={styles.tipCard}>
          <BookOpen size={16} color={colors.blueBold} />
          <Text style={styles.tipText}>
            Add a syllabus to unlock progress tracking and pacing insights.
          </Text>
        </View>
      )}

      {/* Weekly Metrics Cards */}
      <View style={styles.section}>
        <View style={styles.cardsRow}>
          <WeeklyMinutesCard summary={summary} onAddSession={onAddSession} />
          <SubjectBreakdownCard goals={goals} onAddActivity={onAddActivity} />
        </View>
      </View>

      {/* Progress vs Syllabus */}
      <View style={styles.section}>
        <ProgressVsSyllabusCard 
          pacingData={pacingData} 
          weekStart={weekStart}
          onAddSyllabus={onAddSyllabus}
        />
      </View>

      {/* Goals Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Target size={18} color={colors.accent} />
          <Text style={styles.sectionTitle}>Goals & Weekly Progress</Text>
        </View>
        <GoalsList
          goals={goals}
          progressBySubject={progressBySubject}
          onAITopOff={(goal) => {
            const scheduled = progressBySubject[goal.subject_id]?.scheduled_min || 0;
            const needed = Math.max(0, goal.minutes_per_week - scheduled);
            onAITopOff?.({ 
              childId: child.id, 
              subject: goal.subject_id, 
              minutesNeeded: needed 
            });
          }}
          onEdit={onEditGoal}
          onAdd={onAddGoal}
        />
      </View>

      {/* Events Timeline */}
      <View style={styles.section}>
        <EventsTimeline 
          events={events} 
          onAddSession={onAddSession}
          onEventPress={(ev) => {
            // Could open event detail modal here
            console.log('Event pressed:', ev);
          }}
        />
      </View>

      {/* Next Week Plan */}
      <View style={styles.section}>
        <NextWeekPlan 
          childId={child.id}
          weekStart={weekStart.toISOString().slice(0, 10)}
          onOpenPlanner={onOpenPlanner}
        />
      </View>

      {/* Plan Year CTA */}
      {onPlanYear && yearPlansEnabled && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.planYearCTA}
            onPress={onPlanYear}
            activeOpacity={0.7}
          >
            <Target size={20} color={colors.accent} />
            <View style={styles.planYearCTAContent}>
              <Text style={styles.planYearCTATitle}>Plan the Year</Text>
              <Text style={styles.planYearCTADesc}>Create an annual plan with pacing and milestones</Text>
            </View>
            <ChevronRight size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Preferences Section */}
      {data.prefs && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Learning Preferences</Text>
          <View style={styles.prefsCard}>
            {data.prefs.morning_person !== null && (
              <Text style={styles.prefItem}>
                ⏰ {data.prefs.morning_person ? 'Morning person' : 'Afternoon person'}
              </Text>
            )}
            {data.prefs.focus_span_min && (
              <Text style={styles.prefItem}>
                🎯 Focus span: {data.prefs.focus_span_min} minutes
              </Text>
            )}
            {data.prefs.avoid_days && data.prefs.avoid_days.length > 0 && (
              <Text style={styles.prefItem}>
                📅 Avoid days: {data.prefs.avoid_days.map(d => 
                  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]
                ).join(', ')}
              </Text>
            )}
            {data.prefs.notes && (
              <Text style={styles.prefNotes}>{data.prefs.notes}</Text>
            )}
          </View>
        </View>
      )}

      {/* Recommended Actions */}
      <View style={styles.section}>
        <RecommendedActions
          goals={goals}
          summary={summary}
          onAddGoal={onAddGoal}
          onAITopOff={(goal) => {
            const scheduled = progressBySubject[goal.subject_id]?.scheduled_min || 0;
            const needed = Math.max(0, goal.minutes_per_week - scheduled);
            onAITopOff?.({ 
              childId: child.id, 
              subject: goal.subject_id, 
              minutesNeeded: needed 
            });
          }}
          onOpenPlanner={onOpenPlanner}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  weekNavButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  weekNavText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  section: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.yellowSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.yellowBold + '30',
  },
  tipCardWarning: {
    backgroundColor: colors.redSoft,
    borderColor: colors.redBold + '30',
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  prefsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  prefItem: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  prefNotes: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
    marginTop: 8,
  },
  planYearCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planYearCTAContent: {
    flex: 1,
    gap: 4,
  },
  planYearCTATitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  planYearCTADesc: {
    fontSize: 13,
    color: colors.muted,
  },
});

