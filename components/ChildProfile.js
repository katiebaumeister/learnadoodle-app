import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
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
import MaterialsTab from './child/tabs/MaterialsTab';
import StudentSettings from './settings/StudentSettings';
import WebChildProgressTab from './child/tabs/WebChildProgressTab';
import WebChildStudentSettingsTab from './child/tabs/WebChildStudentSettingsTab';
import WebChildRecordsTab from './child/tabs/WebChildRecordsTab';
import WebChildAffirmationTab from './child/tabs/WebChildAffirmationTab';
import WebChildUpdatesTab from './child/tabs/WebChildUpdatesTab';
import WebChildGrowthTab from './child/tabs/WebChildGrowthTab';
import SkillsTab from './child/tabs/SkillsTab';
import LearnerProfileSettings from './LearnerProfileSettings';
import LearningBiography from './child/tabs/LearningBiography';
import MasteryGrowth from './child/tabs/MasteryGrowth';
import { ColorModeProvider } from '../contexts/ColorModeContext';
import ComprehensiveProfile from './profile/ComprehensiveProfile';

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
  onAddSyllabus,
  activeChildSection = 'affirmation',
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
      case 'affirmation':
        if (Platform.OS === 'web') {
          return (
            <WebChildAffirmationTab
              childId={child.id}
              childName={child.name || child.first_name || childName}
              familyId={familyId}
              onNavigate={onNavigate}
              activeChildSection={activeChildSection}
            />
          );
        }
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center' }}>
              Affirmation view coming soon for mobile
            </Text>
          </View>
        );
      case 'updates':
        if (Platform.OS === 'web') {
          return (
            <WebChildUpdatesTab
              childId={child.id}
              childName={child.name || child.first_name || childName}
              familyId={familyId}
              onNavigate={onNavigate}
            />
          );
        }
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center' }}>
              Updates view coming soon for mobile
            </Text>
          </View>
        );
      case 'growth':
        if (Platform.OS === 'web') {
          return (
            <WebChildGrowthTab
              childId={child.id}
              childName={child.name || child.first_name || childName}
              familyId={familyId}
              onNavigate={onNavigate}
            />
          );
        }
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center' }}>
              Growth view coming soon for mobile
            </Text>
          </View>
        );
      case 'schedule':
        return <ScheduleTab child={child} />;
      case 'assignments':
        return <AssignmentsTab child={child} familyId={familyId} />;
      case 'projects':
        return <ProjectsTab child={child} />;
      case 'syllabus':
        return <SyllabusTab child={child} familyId={familyId} onAddSyllabus={onAddSyllabus} />;
      case 'portfolio':
        return <PortfolioTab child={child} />;
      case 'progress':
        if (Platform.OS === 'web') {
          return <WebChildProgressTab childId={child.id} familyId={familyId} onNavigate={onNavigate} />;
        }
        // Mobile: placeholder for now - can create ProgressTab.js later if needed
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center' }}>
              Progress view coming soon for mobile
            </Text>
          </View>
        );
      case 'notes':
        return <NotesTab child={child} />;
      case 'materials':
        return <MaterialsTab child={child} familyId={familyId} />;
      case 'skills':
        return <SkillsTab child={child} />;
      case 'records':
        if (Platform.OS === 'web') {
          return (
            <WebChildRecordsTab
              childId={child.id}
              familyId={familyId}
              childName={child.name || child.first_name || childName}
              onNavigate={onNavigate}
            />
          );
        }
        // Mobile: show a simplified view or redirect
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center' }}>
              Records view coming soon for mobile
            </Text>
          </View>
        );
      case 'learning-biography':
        return <LearningBiography childId={child.id} childName={child.name || child.first_name || childName} />;
      case 'mastery-growth':
        return <MasteryGrowth childId={child.id} />;
      case 'complete-profile':
        if (Platform.OS === 'web') {
          return <ComprehensiveProfile childId={child.id} familyId={familyId} />;
        }
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center' }}>
              Complete profile view available on web
            </Text>
          </View>
        );
      case 'student-settings':
        if (Platform.OS === 'web') {
          return <WebChildStudentSettingsTab childId={child.id} childName={child.name || child.first_name || childName} familyId={familyId} />;
        }
        return <StudentSettings childId={child.id} childName={child.name || child.first_name || childName} />;
      case 'learner-profile':
        return <LearnerProfileSettings childId={child.id} childName={child.name || child.first_name || childName} familyId={familyId} />;
      case 'overview':
      default:
        // Default to affirmation tab instead of overview
        if (Platform.OS === 'web') {
          return (
            <WebChildAffirmationTab
              childId={child.id}
              childName={child.name || child.first_name || childName}
              familyId={familyId}
              onNavigate={onNavigate}
            />
          );
        }
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center' }}>
              Affirmation view coming soon for mobile
            </Text>
          </View>
        );
    }
  };

  return (
    <ColorModeProvider childId={childId}>
      <View style={styles.container}>
        {/* Tab Content */}
        {renderTabContent()}
      </View>
    </ColorModeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
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
});
