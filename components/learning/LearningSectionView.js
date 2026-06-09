import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { resolveSection } from '../layout/sectionNavConfig';
import MaterialsLibrary from '../materials/MaterialsLibrary';
import SubjectsPage from '../subjects/SubjectsPage';
import AssignmentsListScreen from './AssignmentsListScreen';
import SubmissionsListScreen from './SubmissionsListScreen';
import GradesListScreen from './GradesListScreen';
import { useOptionalFamilyUserControls } from '../../contexts/FamilyUserControlsContext';

export default function LearningSectionView({
  tab = 'subjects',
  section = 'subjects',
  familyId,
  children = [],
  family,
  session,
  userRole,
  accessibleChildren,
  subjectsOverviewCache,
  subjectDetailCache,
  onSubjectsOverviewUpdate,
  onSubjectDetailUpdate,
  onTabChange,
  fullSubjects = [],
  materialsCache,
  onMaterialsUpdate,
  subjectsCallbacks = {},
  viewingAsChildId = null,
}) {
  const familyUserControls = useOptionalFamilyUserControls();
  const effectivePermissions = familyUserControls?.effectivePermissions;

  const activeSection = useMemo(() => {
    const resolved = resolveSection(tab, section) || 'subjects';
    if (resolved === 'materials' && effectivePermissions?.canViewLibrary === false) {
      return 'subjects';
    }
    return resolved;
  }, [tab, section, effectivePermissions?.canViewLibrary]);

  const subjectsList =
    (subjectsOverviewCache && subjectsOverviewCache.length > 0)
      ? subjectsOverviewCache
      : fullSubjects;

  const renderContent = () => {
    switch (activeSection) {
      case 'materials':
        return (
          <View style={styles.embeddedPanel}>
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
          </View>
        );
      case 'assignments':
        return (
          <View style={styles.embeddedPanel}>
            <AssignmentsListScreen
              familyId={familyId}
              children={children}
              subjects={subjectsList}
              userRole={userRole}
              accessibleChildren={accessibleChildren}
              viewingAsChildId={viewingAsChildId}
            />
          </View>
        );
      case 'submissions':
        return (
          <View style={styles.embeddedPanel}>
            <SubmissionsListScreen
              familyId={familyId}
              children={children}
              subjects={subjectsList}
              userRole={userRole}
              accessibleChildren={accessibleChildren}
              viewingAsChildId={viewingAsChildId}
            />
          </View>
        );
      case 'grades':
        return (
          <View style={styles.embeddedPanel}>
            <GradesListScreen
              familyId={familyId}
              children={children}
              subjects={subjectsList}
              userRole={userRole}
              accessibleChildren={accessibleChildren}
              viewingAsChildId={viewingAsChildId}
            />
          </View>
        );
      case 'subjects':
      default:
        return (
          <SubjectsPage
            familyId={familyId}
            planningMode={family?.default_planning_mode || null}
            children={children}
            preloadedSubjects={subjectsOverviewCache}
            preloadedSubjectDetailCache={subjectDetailCache}
            onSubjectsUpdate={onSubjectsOverviewUpdate}
            onSubjectDetailUpdate={onSubjectDetailUpdate}
            userRole={userRole}
            accessibleChildren={accessibleChildren}
            screenMode="catalog"
            hideModeSegments
            forcedModeFilter="view"
            learningSection={activeSection}
            onTabChange={onTabChange}
            {...subjectsCallbacks}
          />
        );
    }
  };

  return (
    <View style={styles.shell}>
      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }),
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  embeddedPanel: {
    flex: 1,
    minHeight: 0,
  },
});
