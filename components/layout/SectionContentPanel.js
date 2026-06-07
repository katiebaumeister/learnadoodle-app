import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import PlannerSettingsContent from '../settings/PlannerSettingsContent';
import PlanHealthBanner from '../planner/PlanHealthBanner';
import PlanHealthConflicts from '../planner/PlanHealthConflicts';
import SubjectsPlanBuilder from '../subjects/SubjectsPlanBuilder';
import AttendanceView from '../planner/attendance/AttendanceView';
import MaterialsLibrary from '../materials/MaterialsLibrary';
import FamilyPanel from '../settings/FamilyPanel';
import SubjectsPage from '../subjects/SubjectsPage';
import AssignmentsListScreen from '../learning/AssignmentsListScreen';
import SubmissionsListScreen from '../learning/SubmissionsListScreen';
import GradesListScreen from '../learning/GradesListScreen';
import LearningLogListScreen from '../learning/LearningLogListScreen';
import { FAMILY_SECTION_TO_PANEL } from './sectionNavConfig';

function PlaceholderPanel({ title, description }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderBody}>{description}</Text>
    </View>
  );
}

export default function SectionContentPanel({
  tab,
  section,
  familyId,
  children = [],
  family,
  user,
  profile,
  session,
  userRole,
  accessibleChildren,
  preloadedPlanHealth,
  preloadedPlannerSettings = null,
  onFamilyUpdate,
  subjectsOverviewCache,
  subjectDetailCache,
  onSubjectsOverviewUpdate,
  onSubjectDetailUpdate,
  onTabChange,
  fullSubjects,
  materialsCache,
  onMaterialsUpdate,
  subjectsCallbacks = {},
  viewingAsChildId = null,
  onViewAsChild = null,
  onExitChildView = null,
}) {
  const subjectsScreenMode =
    section === 'subjects' && (tab === 'learning' || tab === 'subjects')
      ? 'catalog'
      : 'records';

  if (tab === 'planner') {
    if (section === 'plan-health') {
      return (
        <View style={styles.planHealthContainer}>
          <View style={styles.planHealthHeader}>
            <Text style={styles.pageTitle}>Plan health</Text>
            <PlanHealthBanner familyId={familyId} visible initialHealth={preloadedPlanHealth} />
          </View>
          <SubjectsPlanBuilder
            familyId={familyId}
            planningMode={family?.default_planning_mode ?? null}
            children={children}
            visibleSubjects={fullSubjects || []}
            allSubjects={fullSubjects || []}
            onOpenPlannerSettings={() => onTabChange?.('planner', 'planning-preferences')}
            homeSections="subjectDays"
            gapSectionFooter={(
              <PlanHealthConflicts onOpenCalendar={() => onTabChange?.('planner', 'calendar')} />
            )}
          />
        </View>
      );
    }
    if (section === 'planning-preferences') {
      return (
        <View style={styles.plannerSettingsContainer}>
          <PlannerSettingsContent
            familyId={familyId}
            initialData={preloadedPlannerSettings}
          />
        </View>
      );
    }
    return null;
  }

  if (tab === 'subjects' || tab === 'learning') {
    if (section === 'materials') {
      return (
        <MaterialsLibrary
          familyId={familyId}
          children={children}
          preloadedSubjects={fullSubjects || []}
          preloadedMaterials={materialsCache}
          sessionOverride={session || null}
          currentChildId={session?.child_id || null}
          viewerRole={userRole ?? null}
          onMaterialsUpdate={onMaterialsUpdate}
        />
      );
    }
    if (section === 'submissions') {
      return (
        <SubmissionsListScreen
          familyId={familyId}
          children={children || []}
          subjects={fullSubjects || subjectsOverviewCache || []}
          userRole={userRole}
          accessibleChildren={accessibleChildren}
          viewingAsChildId={viewingAsChildId}
        />
      );
    }
    if (section === 'assignments') {
      return (
        <AssignmentsListScreen
          familyId={familyId}
          children={children || []}
          subjects={fullSubjects || subjectsOverviewCache || []}
          userRole={userRole}
          accessibleChildren={accessibleChildren}
          viewingAsChildId={viewingAsChildId}
        />
      );
    }
    if (section === 'grades') {
      return (
        <GradesListScreen
          familyId={familyId}
          children={children || []}
          subjects={fullSubjects || subjectsOverviewCache || []}
          userRole={userRole}
          accessibleChildren={accessibleChildren}
          viewingAsChildId={viewingAsChildId}
        />
      );
    }
    const forcedModeFilter = section === 'learning-log' ? 'progress' : 'view';
    return (
      <SubjectsPage
        familyId={familyId}
        planningMode={family?.default_planning_mode || null}
        children={children || []}
        preloadedSubjects={subjectsOverviewCache}
        preloadedSubjectDetailCache={subjectDetailCache}
        onSubjectsUpdate={onSubjectsOverviewUpdate}
        onSubjectDetailUpdate={onSubjectDetailUpdate}
        userRole={userRole}
        accessibleChildren={accessibleChildren}
        screenMode={subjectsScreenMode}
        hideModeSegments
        forcedModeFilter={forcedModeFilter}
        learningSection={section}
        onTabChange={onTabChange}
        {...subjectsCallbacks}
      />
    );
  }

  if (tab === 'records') {
    if (section === 'attendance') {
      return (
        <AttendanceView
          familyId={familyId}
          children={children}
        />
      );
    }
    if (section === 'learning-log') {
      return (
        <LearningLogListScreen
          familyId={familyId}
          children={children || []}
          userRole={userRole}
          accessibleChildren={accessibleChildren}
          viewingAsChildId={viewingAsChildId}
        />
      );
    }
    if (section === 'exports') {
      return (
        <PlaceholderPanel
          title="Exports"
          description="Export attendance, grades, and learning records. Full export tools are coming soon."
        />
      );
    }
    return null;
  }

  if (tab === 'family') {
    const panelSection = FAMILY_SECTION_TO_PANEL[section] || 'members';
    return (
      <FamilyPanel
        user={user}
        family={family}
        familyId={familyId}
        onFamilyUpdate={onFamilyUpdate}
        profile={profile}
        preloadedSubjects={fullSubjects || []}
        userRole={userRole}
        initialSection={panelSection}
        hideInternalSidebar
        viewingAsChildId={viewingAsChildId}
        onViewAsChild={onViewAsChild}
        onExitChildView={onExitChildView}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  plannerSettingsContainer: {
    flex: 1,
    minHeight: 0,
    padding: 24,
  },
  planHealthContainer: {
    flex: 1,
    minHeight: 0,
  },
  planHealthHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
    gap: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  placeholder: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  placeholderBody: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 20,
  },
});
