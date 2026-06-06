import React from 'react';
import { View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import PlannerSettingsContent from '../settings/PlannerSettingsContent';
import PlanHealthBanner from '../planner/PlanHealthBanner';
import AttendanceView from '../planner/attendance/AttendanceView';
import MaterialsLibrary from '../materials/MaterialsLibrary';
import FamilyPanel from '../settings/FamilyPanel';
import SubjectsPage from '../subjects/SubjectsPage';
import RecordsPhase4 from '../records/RecordsPhase4';
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
  const subjectsScreenMode = tab === 'learning' ? 'catalog' : 'records';

  if (tab === 'planner') {
    if (section === 'plan-health') {
      return (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>Plan health</Text>
          <PlanHealthBanner familyId={familyId} visible initialHealth={preloadedPlanHealth} />
        </ScrollView>
      );
    }
    if (section === 'planning-preferences') {
      return (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>Planning preferences</Text>
          <PlannerSettingsContent familyId={familyId} />
        </ScrollView>
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
        <PlaceholderPanel
          title="Submissions"
          description="Review and respond to student submissions from the messages and learning log workflows."
        />
      );
    }
    const forcedModeFilter =
      section === 'assignments' || section === 'grades' || section === 'learning-log'
        ? 'progress'
        : 'view';
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
          screenMode="records"
          hideModeSegments
          forcedModeFilter="progress"
          learningSection="learning-log"
          onTabChange={onTabChange}
          {...subjectsCallbacks}
        />
      );
    }
    if (section === 'portfolio' || section === 'reports') {
      return <RecordsPhase4 familyId={familyId} />;
    }
    if (section === 'exports') {
      return (
        <PlaceholderPanel
          title="Exports"
          description="Export attendance, grades, transcripts, and portfolio documents. Full export tools are coming soon."
        />
      );
    }
    return (
      <PlaceholderPanel
        title="Transcript"
        description="Transcript builder is coming soon."
      />
    );
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 16,
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
