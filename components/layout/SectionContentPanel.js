import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import FamilySectionView from '../family/FamilySectionView';
import RecordsSectionView from '../records/RecordsSectionView';
import LearningSectionView from '../learning/LearningSectionView';

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
  if (tab === 'planner') {
    return null;
  }

  if (tab === 'subjects' || tab === 'learning') {
    return (
      <LearningSectionView
        tab={tab}
        section={section}
        familyId={familyId}
        children={children || []}
        family={family}
        user={user}
        profile={profile}
        session={session}
        userRole={userRole}
        accessibleChildren={accessibleChildren}
        subjectsOverviewCache={subjectsOverviewCache}
        subjectDetailCache={subjectDetailCache}
        onSubjectsOverviewUpdate={onSubjectsOverviewUpdate}
        onSubjectDetailUpdate={onSubjectDetailUpdate}
        onTabChange={onTabChange}
        fullSubjects={fullSubjects || []}
        materialsCache={materialsCache}
        onMaterialsUpdate={onMaterialsUpdate}
        subjectsCallbacks={subjectsCallbacks}
        viewingAsChildId={viewingAsChildId}
        onViewAsChild={onViewAsChild}
        onExitChildView={onExitChildView}
        onEditChild={onEditChild}
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
