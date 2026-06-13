import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { MAIN_NAV_ICONS, MAIN_NAV_PAGE_ICON_COLOR, MAIN_NAV_PAGE_ICON_SIZE } from '../layout/mainNavIcons';
import PlannerCalendarToolbar from './PlannerCalendarToolbar';
import PlanHealthConflicts from './PlanHealthConflicts';
import PlannerSmartActionsMenu from './PlannerSmartActionsMenu';
import SubjectsPlanBuilder from '../subjects/SubjectsPlanBuilder';
import { parsePlannerSection } from './plannerSectionRouting';
import { familyStyles } from '../family/familyDesignTokens';

const FIX_GAP_CONTAINER_ID = 'planner-fix-gap-container';

export default function PlannerSectionView({
  section = 'calendar',
  familyId,
  children = [],
  family,
  fullSubjects = [],
  preloadedPlanHealth = null,
  plannerDate,
  plannerView = 'board',
  onPlannerDateChange,
  calendarContent = null,
  selectedCalendarChildren = null,
  onSelectedCalendarChildrenChange,
  selectedEventTypes = null,
  onSelectedEventTypesChange,
  onTabChange,
  onOpenAskAI,
}) {
  const parsed = useMemo(() => parsePlannerSection(section), [section]);
  const [showSmartActionsMenu, setShowSmartActionsMenu] = useState(false);
  const [showPlanningEngine, setShowPlanningEngine] = useState(false);
  const planningEngineRef = useRef(null);
  const smartActionsButtonRef = useRef(null);

  const scrollToPlanningEngine = useCallback(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const byId = document.getElementById(FIX_GAP_CONTAINER_ID);
      if (byId) {
        byId.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    planningEngineRef.current?.measure?.((x, y, width, height, pageX, pageY) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && Number.isFinite(pageY)) {
        window.scrollTo({ top: Math.max(0, pageY - 24), behavior: 'smooth' });
      }
    });
  }, []);

  const openPlanningEngine = useCallback(() => {
    setShowPlanningEngine(true);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scrollToPlanningEngine());
      });
    }
  }, [scrollToPlanningEngine]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = () => openPlanningEngine();
    window.addEventListener('plannerScrollToFixGap', handler);
    return () => window.removeEventListener('plannerScrollToFixGap', handler);
  }, [openPlanningEngine]);

  useEffect(() => {
    if (String(section || '').trim().toLowerCase() !== 'plan-health') return;
    setShowPlanningEngine(true);
    const timer = setTimeout(() => scrollToPlanningEngine(), 120);
    return () => clearTimeout(timer);
  }, [section, scrollToPlanningEngine]);

  useEffect(() => {
    if (parsed.view === 'planning-preferences') {
      onTabChange?.('settings', 'planner-settings');
    }
  }, [parsed.view, onTabChange]);

  const navigateSection = useCallback((nextSection) => {
    onTabChange?.('planner', nextSection);
  }, [onTabChange]);

  const openPlanWeek = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openPlanWeekModal'));
    }
  }, []);

  const openSmartActions = useCallback(() => {
    setShowSmartActionsMenu((open) => !open);
  }, []);

  const planningEnginePanel = (
    <View
      ref={planningEngineRef}
      style={styles.planningEngineContainer}
      {...(Platform.OS === 'web' && { nativeID: FIX_GAP_CONTAINER_ID })}
    >
      <SubjectsPlanBuilder
        familyId={familyId}
        planningMode={family?.default_planning_mode ?? null}
        children={children}
        visibleSubjects={fullSubjects || []}
        allSubjects={fullSubjects || []}
        onOpenPlannerSettings={() => onTabChange?.('settings', 'planner-settings')}
        homeSections="subjectDays"
        gapSectionFooter={(
          <PlanHealthConflicts onOpenCalendar={() => navigateSection('calendar')} />
        )}
      />
    </View>
  );

  const calendarBlock = (
    <View style={styles.pageContent}>
      <View style={styles.calendarLayout}>
        <View style={styles.calendarCard}>
          <PlannerCalendarToolbar
            anchorDate={plannerDate}
            viewMode={plannerView}
            onDateChange={onPlannerDateChange}
            children={children}
            selectedChildIds={selectedCalendarChildren}
            onSelectedChildIdsChange={onSelectedCalendarChildrenChange}
            selectedEventTypes={selectedEventTypes}
            onSelectedEventTypesChange={onSelectedEventTypesChange}
          />
          <View style={styles.calendarBody}>{calendarContent}</View>
        </View>
      </View>
    </View>
  );

  const renderContent = () => {
    if (parsed.view === 'planning-preferences') {
      return null;
    }

    if (showPlanningEngine) {
      return (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View style={styles.planningEngineWrap}>{planningEnginePanel}</View>
          {calendarBlock}
        </ScrollView>
      );
    }

    return calendarBlock;
  };

  const PageIcon = MAIN_NAV_ICONS.planner;

  return (
    <View style={styles.shell}>
      <View style={styles.pageHeader}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <View style={styles.titleLine}>
              <PageIcon size={MAIN_NAV_PAGE_ICON_SIZE} color={MAIN_NAV_PAGE_ICON_COLOR} strokeWidth={2} />
              <Text style={styles.pageTitle}>Planner</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.planWeekBtn}
              onPress={openPlanWeek}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Sparkles size={14} color="#2563EB" />
              <Text style={styles.planWeekText}>Plan Week</Text>
            </TouchableOpacity>
            <TouchableOpacity
              ref={smartActionsButtonRef}
              style={styles.smartActionsBtn}
              onPress={openSmartActions}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Sparkles size={16} color="rgba(15,23,42,0.85)" strokeWidth={2.25} />
              <Text style={styles.smartActionsText}>Smart Actions</Text>
              {showSmartActionsMenu ? (
                <ChevronUp size={16} color="rgba(15,23,42,0.7)" />
              ) : (
                <ChevronDown size={16} color="rgba(15,23,42,0.7)" />
              )}
            </TouchableOpacity>
            <PlannerSmartActionsMenu
              visible={showSmartActionsMenu}
              triggerRef={smartActionsButtonRef}
              onClose={() => setShowSmartActionsMenu(false)}
            />
          </View>
        </View>
      </View>
      <View style={styles.pageBody}>{renderContent()}</View>
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
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  pageBody: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  pageHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 0,
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 0,
    flexWrap: 'wrap',
  },
  titleBlock: {
    flex: 1,
    minWidth: 260,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  planWeekBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
  },
  planWeekText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  smartActionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  smartActionsText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(15,23,42,0.85)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planningEngineContainer: {
    width: '100%',
  },
  planningEngineWrap: {
    width: '100%',
    marginBottom: 16,
  },
  pageContent: {
    ...familyStyles.pageContent,
    paddingTop: 0,
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  calendarLayout: {
    width: '100%',
    flex: 1,
    minHeight: 0,
  },
  calendarCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    flex: 1,
    minHeight: 480,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  calendarBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && { minWidth: 0, display: 'flex', flexDirection: 'column' }),
  },
});
