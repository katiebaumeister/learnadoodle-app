import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Settings, ChevronLeft } from 'lucide-react';
import FamilyPanel from '../settings/FamilyPanel';
import FamilyChildView from './FamilyChildView';
import FamilyAcademicYearsView from './FamilyAcademicYearsView';
import FamilyLearningPreferencesView from './FamilyLearningPreferencesView';
import {
  buildChildSectionKey,
  FAMILY_CHILD_TABS,
  getChildDisplayName,
  parseFamilySection,
} from './familySectionRouting';
import { useOptionalFamilyUserControls } from '../../contexts/FamilyUserControlsContext';

const SUB_VIEW_TITLES = {
  'learning-preferences': 'Learning Preferences',
  'academic-years': 'Academic Years',
  'academic-year': 'Academic Year',
};

function FamilyTabBar({ tabs, activeKey, onChange }) {
  return (
    <View style={styles.tabBar}>
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
    </View>
  );
}

function FamilyMembersPanel({
  user,
  family,
  familyId,
  onFamilyUpdate,
  profile,
  fullSubjects,
  userRole,
  viewingAsChildId,
  onViewAsChild,
  onExitChildView,
}) {
  return (
    <FamilyPanel
      user={user}
      family={family}
      familyId={familyId}
      onFamilyUpdate={onFamilyUpdate}
      profile={profile}
      preloadedSubjects={fullSubjects}
      userRole={userRole}
      initialSection="members"
      hideInternalSidebar
      viewingAsChildId={viewingAsChildId}
      onViewAsChild={onViewAsChild}
      onExitChildView={onExitChildView}
    />
  );
}

export default function FamilySectionView({
  section = 'members',
  familyId,
  children = [],
  family,
  user,
  profile,
  fullSubjects = [],
  preloadedPlannerSettings = null,
  preloadedAcademicYears = null,
  userRole,
  onFamilyUpdate,
  onTabChange,
  onEditChild,
  onViewAsChild,
  onExitChildView,
  viewingAsChildId = null,
}) {
  const familyUserControls = useOptionalFamilyUserControls();
  const parsed = useMemo(() => parseFamilySection(section), [section]);

  const selectedChild = useMemo(() => {
    if (parsed.view !== 'child' || !parsed.childId) return null;
    return children.find((child) => String(child.id) === String(parsed.childId)) || null;
  }, [children, parsed.childId, parsed.view]);

  const navigateSection = useCallback((nextSection) => {
    onTabChange?.('family', nextSection);
  }, [onTabChange]);

  const handleChildTabChange = useCallback((tabKey) => {
    if (!parsed.childId) return;
    navigateSection(buildChildSectionKey(parsed.childId, tabKey));
  }, [navigateSection, parsed.childId]);

  const handleOpenSettings = useCallback(() => {
    onTabChange?.('settings', 'profile');
  }, [onTabChange]);

  const handleNavigateLearning = useCallback(() => {
    onTabChange?.('subjects', 'subjects');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({}, '', '/subjects');
    }
  }, [onTabChange]);

  const readOnlyPreferences =
    familyUserControls.isRestrictedViewer && !familyUserControls.allowed('planning_preferences');

  const isChildView = parsed.view === 'child' && selectedChild;
  const isSubView = !isChildView && parsed.view !== 'members';
  const subViewTitle = SUB_VIEW_TITLES[parsed.view] || 'Family';

  const renderContent = () => {
    if (parsed.view === 'child' && selectedChild) {
      return (
        <FamilyChildView
          child={selectedChild}
          familyId={familyId}
          activeTab={parsed.childTab || 'overview'}
          onTabChange={handleChildTabChange}
          onEditChild={onEditChild}
          onViewAsChild={onViewAsChild}
          onNavigateLearning={handleNavigateLearning}
          hideHeader
        />
      );
    }

    switch (parsed.view) {
      case 'learning-preferences':
        return (
          <FamilyLearningPreferencesView
            familyId={familyId}
            preloadedPlannerSettings={preloadedPlannerSettings}
            readOnly={readOnlyPreferences}
          />
        );
      case 'academic-years':
      case 'academic-year':
        return (
          <FamilyAcademicYearsView
            familyId={familyId}
            section={parsed.view}
            selectedYearId={parsed.yearId}
            onSelectYear={navigateSection}
            onBackToList={() => navigateSection('academic-years')}
            preloadedPlannerSettings={preloadedPlannerSettings}
          />
        );
      case 'members':
      default:
        return (
          <FamilyMembersPanel
            user={user}
            family={family}
            familyId={familyId}
            onFamilyUpdate={onFamilyUpdate}
            profile={profile}
            fullSubjects={fullSubjects}
            userRole={userRole}
            viewingAsChildId={viewingAsChildId}
            onViewAsChild={onViewAsChild}
            onExitChildView={onExitChildView}
          />
        );
    }
  };

  return (
    <View style={styles.shell}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isChildView ? (
          <View style={styles.pageHeader}>
            <TouchableOpacity
              style={styles.backRow}
              onPress={() => navigateSection('members')}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <ChevronLeft size={18} color="#2563EB" />
              <Text style={styles.backText}>Family</Text>
            </TouchableOpacity>
            <Text style={styles.childTitle}>{getChildDisplayName(selectedChild)}</Text>
            <FamilyTabBar
              tabs={FAMILY_CHILD_TABS}
              activeKey={parsed.childTab || 'overview'}
              onChange={handleChildTabChange}
            />
          </View>
        ) : isSubView ? (
          <View style={styles.pageHeader}>
            <TouchableOpacity
              style={styles.backRow}
              onPress={() => navigateSection('members')}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <ChevronLeft size={18} color="#2563EB" />
              <Text style={styles.backText}>Family</Text>
            </TouchableOpacity>
            <Text style={styles.childTitle}>{subViewTitle}</Text>
          </View>
        ) : (
          <View style={styles.pageHeader}>
            <View style={styles.titleRow}>
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={handleOpenSettings}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Settings size={15} color="#374151" />
                <Text style={styles.settingsButtonText}>Family Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.content}>{renderContent()}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  pageHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 0,
    backgroundColor: '#FFFFFF',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    marginBottom: 0,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
  },
  settingsButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 8,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  childTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabBar: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 4,
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
});
