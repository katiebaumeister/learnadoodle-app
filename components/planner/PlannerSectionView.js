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
  Sparkles,
} from 'lucide-react';
import { MAIN_NAV_ICONS, MAIN_NAV_PAGE_ICON_COLOR, MAIN_NAV_PAGE_ICON_SIZE } from '../layout/mainNavIcons';
import PlannerSummaryCards from './PlannerSummaryCards';
import PlannerCalendarToolbar from './PlannerCalendarToolbar';
import PlannerRightRail from './PlannerRightRail';
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
  weekEventCount = null,
  weekAssignmentCount = null,
  calendarContent = null,
  selectedCalendarChildren = null,
  onSelectedCalendarChildrenChange,
  selectedEventTypes = null,
  onSelectedEventTypesChange,
  onTabChange,
  onOpenAskAI,
}) {
  const parsed = useMemo(() => parsePlannerSection(section), [section]);
  const [conflictLabel, setConflictLabel] = useState(null);
  const [showSmartActionsMenu, setShowSmartActionsMenu] = useState(false);
  const fixGapContainerRef = useRef(null);
  const smartActionsButtonRef = useRef(null);

  const scrollToFixGap = useCallback(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const byId = document.getElementById(FIX_GAP_CONTAINER_ID);
      if (byId) {
        byId.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    fixGapContainerRef.current?.measure?.((x, y, width, height, pageX, pageY) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && Number.isFinite(pageY)) {
        window.scrollTo({ top: Math.max(0, pageY - 24), behavior: 'smooth' });
      }
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = () => scrollToFixGap();
    window.addEventListener('plannerScrollToFixGap', handler);
    return () => window.removeEventListener('plannerScrollToFixGap', handler);
  }, [scrollToFixGap]);

  useEffect(() => {
    if (String(section || '').trim().toLowerCase() !== 'plan-health') return;
    const timer = setTimeout(() => scrollToFixGap(), 120);
    return () => clearTimeout(timer);
  }, [section, scrollToFixGap]);

  useEffect(() => {
    if (parsed.view === 'planning-preferences') {
      onTabChange?.('settings', 'planner-settings');
    }
  }, [parsed.view, onTabChange]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const refresh = () => {
      const active = window.__ldActiveConflictBanner;
      if (active?.visible) {
        setConflictLabel(active.eventTitle || '1 conflict');
      } else {
        setConflictLabel(null);
      }
    };
    refresh();
    window.addEventListener('plannerDragConflictActive', refresh);
    window.addEventListener('plannerDragConflictResolved', refresh);
    window.addEventListener('clearConflictBanner', refresh);
    return () => {
      window.removeEventListener('plannerDragConflictActive', refresh);
      window.removeEventListener('plannerDragConflictResolved', refresh);
      window.removeEventListener('clearConflictBanner', refresh);
    };
  }, []);

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

  const handleOpenAskAI = useCallback(() => {
    if (onOpenAskAI) {
      onOpenAskAI();
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openDoodleSearchModal'));
    }
  }, [onOpenAskAI]);

  const renderContent = () => {
    if (parsed.view === 'planning-preferences') {
      return null;
    }

    return (
      <View style={styles.pageContent}>
        <PlannerSummaryCards
          planHealth={preloadedPlanHealth}
          conflictLabel={conflictLabel}
          onViewDetails={scrollToFixGap}
          onFixGap={scrollToFixGap}
          onResolveConflict={() => navigateSection('calendar')}
        />
        <View style={styles.calendarLayout}>
          <View style={styles.calendarMain}>
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
          <PlannerRightRail
            weekEventCount={weekEventCount}
            weekAssignmentCount={weekAssignmentCount}
            onViewWeek={() => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'board' }));
              }
            }}
            onOpenAskAI={handleOpenAskAI}
          />
        </View>
        <View
          ref={fixGapContainerRef}
          style={styles.fixGapSection}
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
      </View>
    );
  };

  const PageIcon = MAIN_NAV_ICONS.planner;

  return (
    <View style={styles.shell}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
                <Text style={styles.smartActionsText}>Smart Actions</Text>
                <ChevronDown size={14} color="#6B7280" />
              </TouchableOpacity>
              <PlannerSmartActionsMenu
                visible={showSmartActionsMenu}
                triggerRef={smartActionsButtonRef}
                onClose={() => setShowSmartActionsMenu(false)}
              />
            </View>
          </View>
        </View>
        {renderContent()}
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
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
  },
  smartActionsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  fixGapSection: {
    width: '100%',
    marginTop: 16,
  },
  pageContent: {
    ...familyStyles.pageContent,
    paddingTop: 0,
  },
  calendarLayout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
  },
  calendarMain: {
    flex: 1,
    minWidth: 0,
  },
  calendarCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    minHeight: 420,
  },
  calendarBody: {
    flex: 1,
    minHeight: 360,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && { minWidth: 0 }),
  },
});
