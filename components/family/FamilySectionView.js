import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Users, Settings, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import FamilyPanel from '../settings/FamilyPanel';
import FamilyOverviewView from './FamilyOverviewView';
import FamilyChildView from './FamilyChildView';
import FamilyAcademicYearsView from './FamilyAcademicYearsView';
import FamilyLearningPreferencesView from './FamilyLearningPreferencesView';
import {
  buildChildSectionKey,
  FAMILY_CHILD_TABS,
  FAMILY_MAIN_TABS,
  getChildDisplayName,
  parseFamilySection,
} from './familySectionRouting';
import { useOptionalFamilyUserControls } from '../../contexts/FamilyUserControlsContext';

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

export default function FamilySectionView({
  section = 'overview',
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
  const [academicYears, setAcademicYears] = useState([]);

  useEffect(() => {
    if (Array.isArray(preloadedAcademicYears) && preloadedAcademicYears.length > 0) {
      setAcademicYears(preloadedAcademicYears);
      return undefined;
    }
    let cancelled = false;
    const loadYears = async () => {
      if (!familyId) {
        setAcademicYears([]);
        return;
      }
      try {
        let result = await supabase
          .from('academic_years')
          .select('id, start_date, end_date, year_name')
          .eq('family_id', familyId)
          .order('start_date', { ascending: false })
          .limit(8);
        if (
          result?.error
          && String(result.error?.message || '').toLowerCase().includes('year_name')
        ) {
          result = await supabase
            .from('academic_years')
            .select('id, start_date, end_date')
            .eq('family_id', familyId)
            .order('start_date', { ascending: false })
            .limit(8);
        }
        if (!cancelled) setAcademicYears(result.data || []);
      } catch (_) {
        if (!cancelled) setAcademicYears([]);
      }
    };
    loadYears();
    return () => {
      cancelled = true;
    };
  }, [familyId, preloadedAcademicYears]);

  const selectedChild = useMemo(() => {
    if (parsed.view !== 'child' || !parsed.childId) return null;
    return children.find((child) => String(child.id) === String(parsed.childId)) || null;
  }, [children, parsed.childId, parsed.view]);

  const navigateSection = useCallback((nextSection) => {
    onTabChange?.('family', nextSection);
  }, [onTabChange]);

  const handleMainTabChange = useCallback((tabKey) => {
    navigateSection(tabKey);
  }, [navigateSection]);

  const handleSelectChild = useCallback((childId) => {
    navigateSection(buildChildSectionKey(childId, 'overview'));
  }, [navigateSection]);

  const handleChildTabChange = useCallback((tabKey) => {
    if (!parsed.childId) return;
    navigateSection(buildChildSectionKey(parsed.childId, tabKey));
  }, [navigateSection, parsed.childId]);

  const handleAddChild = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openAddChildModal'));
    }
  }, []);

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

  const mainTabKey = parsed.view === 'academic-year' ? 'academic-years' : parsed.view;

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
      case 'members':
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
            embeddedInFamily
            viewingAsChildId={viewingAsChildId}
            onViewAsChild={onViewAsChild}
            onExitChildView={onExitChildView}
          />
        );
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
      case 'overview':
      default:
        return (
          <FamilyOverviewView
            familyId={familyId}
            family={family}
            children={children}
            subjects={fullSubjects}
            academicYears={academicYears}
            preloadedPlannerSettings={preloadedPlannerSettings}
            onSelectChild={handleSelectChild}
            onAddChild={handleAddChild}
            onNavigateSection={navigateSection}
            onTabChange={onTabChange}
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
        {parsed.view === 'child' && selectedChild ? (
          <View style={styles.pageHeader}>
            <TouchableOpacity
              style={styles.backRow}
              onPress={() => navigateSection('overview')}
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
        ) : (
          <View style={styles.pageHeader}>
            <View style={styles.titleRow}>
              <View style={styles.titleBlock}>
                <View style={styles.titleLine}>
                  <Users size={22} color="#2563EB" />
                  <Text style={styles.pageTitle}>Family</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={handleOpenSettings}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Settings size={15} color="#374151" />
                <Text style={styles.settingsButtonText}>Family Settings</Text>
              </TouchableOpacity>
            </View>
            <FamilyTabBar
              tabs={FAMILY_MAIN_TABS}
              activeKey={mainTabKey}
              onChange={handleMainTabChange}
            />
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  titleBlock: {
    flex: 1,
    gap: 6,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
