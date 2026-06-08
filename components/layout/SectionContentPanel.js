import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import FamilySectionView from '../family/FamilySectionView';
import RecordsSectionView from '../records/RecordsSectionView';
import SubjectsPage from '../subjects/SubjectsPage';

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
  preloadedAcademicYears = null,
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
  onEditChild = null,
}) {
  const subjectsScreenMode =
    section === 'subjects' && (tab === 'learning' || tab === 'subjects')
      ? 'catalog'
      : 'records';

  if (tab === 'planner') {
    return null;
  }

  if (tab === 'subjects' || tab === 'learning') {
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
        forcedModeFilter="view"
        learningSection="subjects"
        onTabChange={onTabChange}
        {...subjectsCallbacks}
      />
    );
  }

  if (tab === 'records') {
    return (
      <RecordsSectionView
        section={section}
        familyId={familyId}
        children={children || []}
        subjects={
          (subjectsOverviewCache && subjectsOverviewCache.length > 0)
            ? subjectsOverviewCache
            : (fullSubjects || [])
        }
        preloadedAcademicYears={preloadedAcademicYears}
        userRole={userRole}
        accessibleChildren={accessibleChildren}
        viewingAsChildId={viewingAsChildId}
        onTabChange={onTabChange}
      />
    );
  }

  if (tab === 'family') {
    return (
      <FamilySectionView
        section={section}
        familyId={familyId}
        children={children || []}
        family={family}
        user={user}
        profile={profile}
        fullSubjects={fullSubjects || []}
        preloadedPlannerSettings={preloadedPlannerSettings}
        preloadedAcademicYears={preloadedAcademicYears}
        userRole={userRole}
        onFamilyUpdate={onFamilyUpdate}
        onTabChange={onTabChange}
        onEditChild={onEditChild}
        viewingAsChildId={viewingAsChildId}
        onViewAsChild={onViewAsChild}
        onExitChildView={onExitChildView}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
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
