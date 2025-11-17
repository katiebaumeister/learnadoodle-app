import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ChevronLeft, Edit, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { colors, shadows } from '../theme/colors';
import { checkFeatureFlags } from '../lib/services/yearClient';
import { compareToSyllabusWeek, getWeekStart } from '../lib/apiClient';
import OverviewTab from './child/tabs/OverviewTab';
import ScheduleTab from './child/tabs/ScheduleTab';
import AssignmentsTab from './child/tabs/AssignmentsTab';
import ProjectsTab from './child/tabs/ProjectsTab';
import SyllabusTab from './child/tabs/SyllabusTab';
import PortfolioTab from './child/tabs/PortfolioTab';
import NotesTab from './child/tabs/NotesTab';

function useChildProfile(childId, weekStart) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!childId) return;
      setLoading(true);

      const { data: res, error } = await supabase.rpc('get_child_profile', {
        _child_id: childId,
        _week_start: weekStart.toISOString().slice(0, 10),
      });

      if (error) {
        console.error('get_child_profile error:', error);
        setLoading(false);
        return;
      }
      if (!active) return;
      setData(res);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [childId, weekStart.toISOString()]);

  return { data, loading };
}

export default function ChildProfile({ 
  childId, 
  childName,
  familyId,
  onAITopOff, 
  onEditGoal, 
  onAddGoal,
  onEditInfo,
  onAISummary,
  onOpenPlanner,
  onDeleted,
  onBack,
  onNavigate,
  onPlanYear,
  activeChildSection = 'overview',
}) {
  const [yearPlansEnabled, setYearPlansEnabled] = useState(false);

  useEffect(() => {
    checkFeatureFlags().then(flags => {
      console.log('[ChildProfile] Year plans enabled:', flags.yearPlans);
      setYearPlansEnabled(flags.yearPlans);
    }).catch(err => {
      console.error('[ChildProfile] Error checking feature flags:', err);
      // Default to false if check fails (safer)
      setYearPlansEnabled(false);
    });
  }, []);

  const [weekStart, setWeekStart] = useState(() => {
    const monday = new Date();
    const d = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - d);
    return monday;
  });
  const [pacingData, setPacingData] = useState([]);

  const { data, loading } = useChildProfile(childId, weekStart);

  // Load pacing data
  useEffect(() => {
    if (familyId && childId && weekStart) {
      loadPacingData();
    }
  }, [familyId, childId, weekStart]);

  const loadPacingData = async () => {
    try {
      const weekStartDate = getWeekStart(weekStart);
      const { data, error } = await compareToSyllabusWeek({
        familyId,
        childId,
        weekStart: weekStartDate,
      });
      if (!error && data) {
        setPacingData(data);
      }
    } catch (err) {
      console.error('Error loading pacing data:', err);
    }
  };


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No profile data available</Text>
      </View>
    );
  }

  const child = data.child || { id: childId, name: childName, first_name: childName };
  const weekLabel = weekStart.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric' 
  });

  const renderTabContent = () => {
    switch (activeChildSection) {
      case 'schedule':
        return <ScheduleTab child={child} />;
      case 'assignments':
        return <AssignmentsTab child={child} />;
      case 'projects':
        return <ProjectsTab child={child} />;
      case 'syllabus':
        return <SyllabusTab child={child} />;
      case 'portfolio':
        return <PortfolioTab child={child} />;
      case 'notes':
        return <NotesTab child={child} />;
      case 'overview':
      default:
        return (
          <OverviewTab
            child={child}
            data={data}
            weekStart={weekStart}
            setWeekStart={setWeekStart}
            pacingData={pacingData}
            onAITopOff={onAITopOff}
            onEditGoal={onEditGoal}
            onAddGoal={onAddGoal}
            onOpenPlanner={onOpenPlanner}
            onPlanYear={onPlanYear}
            yearPlansEnabled={yearPlansEnabled}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <ChevronLeft size={20} color={colors.muted} />
          <Text style={styles.backText}>Back to Children</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(child.name || child.first_name || childName || 'C').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.title}>{child.name || child.first_name || childName}</Text>
              {activeChildSection === 'overview' && (
                <Text style={styles.subtitle}>Week of {weekLabel}</Text>
              )}
            </View>
            </View>
          <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={onEditInfo}
          >
            <Edit size={16} color={colors.text} />
            <Text style={styles.headerButtonText}>Edit info</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={onAISummary}
          >
            <Sparkles size={16} color={colors.text} />
            <Text style={styles.headerButtonText}>AI Summary</Text>
          </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tab Content */}
      {renderTabContent()}
    </View>
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
    backgroundColor: colors.bgSubtle,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
  },
  emptyText: {
    padding: 24,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  backText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.blueBold,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  headerButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
});
