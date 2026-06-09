import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LEARNING_SECTIONS, resolveSection } from '../layout/sectionNavConfig';
import MaterialsLibrary from '../materials/MaterialsLibrary';
import SubjectsPage from '../subjects/SubjectsPage';
import AssignmentsListScreen from './AssignmentsListScreen';
import SubmissionsListScreen from './SubmissionsListScreen';
import GradesListScreen from './GradesListScreen';
import { useOptionalFamilyUserControls } from '../../contexts/FamilyUserControlsContext';

function LearningTabBar({ tabs, activeKey, onChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabScroll}
      contentContainerStyle={styles.tabBar}
    >
      {tabs.map((tab) => {
        const active = activeKey === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, active && styles.tabBtnActive]}
            onPress={() => onChange?.(tab.key)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export default function LearningSectionView({
  tab = 'subjects',
  section = 'subjects',
  familyId,
  children = [],
  family,
  user,
  profile,
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
  onViewAsChild = null,
  onExitChildView = null,
  onEditChild = null,
}) {
  const familyUserControls = useOptionalFamilyUserControls();
  const effectivePermissions = familyUserControls?.effectivePermissions;

  const visibleTabs = useMemo(() => {
    if (effectivePermissions?.canViewLibrary === false) {
      return LEARNING_SECTIONS.filter((item) => item.key !== 'materials');
    }
    return LEARNING_SECTIONS;
  }, [effectivePermissions?.canViewLibrary]);

  const activeSection = useMemo(() => {
    const resolved = resolveSection(tab, section) || 'subjects';
    if (visibleTabs.some((item) => item.key === resolved)) return resolved;
    return 'subjects';
  }, [tab, section, visibleTabs]);

  const navigateSection = useCallback((nextSection) => {
    onTabChange?.(tab, nextSection);
  }, [onTabChange, tab]);

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
      <View style={styles.pageHeader}>
        <LearningTabBar
          tabs={visibleTabs}
          activeKey={activeSection}
          onChange={navigateSection}
        />
      </View>
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
  pageHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 0,
    backgroundColor: '#FFFFFF',
  },
  tabScroll: {
    flexGrow: 0,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 24,
    paddingRight: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
  },
  tabBtn: {
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabBtnActive: {
    borderBottomColor: '#2563EB',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#2563EB',
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
