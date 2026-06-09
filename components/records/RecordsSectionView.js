import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  FileText,
  Filter,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  ClipboardList,
  CalendarCheck,
  ScrollText,
  FolderOpen,
  Award,
  Files,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import RecordsOverviewView from './RecordsOverviewView';
import RecordsPlaceholderView from './RecordsPlaceholderView';
import AttendanceView from '../planner/attendance/AttendanceView';
import RecordsDocumentsView from './RecordsDocumentsView';
import { parseRecordsSection, RECORDS_VISIBLE_TABS, RECORDS_DEFAULT_SECTION, formatYearRange } from './recordsSectionRouting';

const TAB_ICONS = {
  overview: LayoutDashboard,
  'progress-reports': ClipboardList,
  attendance: CalendarCheck,
  transcripts: ScrollText,
  portfolios: FolderOpen,
  achievements: Award,
  documents: Files,
};

function RecordsTabBar({ tabs, activeKey, onChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabScroll}
      contentContainerStyle={styles.tabBar}
    >
      {tabs.map((tab) => {
        const active = activeKey === tab.key;
        const Icon = TAB_ICONS[tab.key] || FileText;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, active && styles.tabBtnActive]}
            onPress={() => onChange?.(tab.key)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Icon size={15} color={active ? '#2563EB' : '#64748B'} />
            <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export default function RecordsSectionView({
  section = RECORDS_DEFAULT_SECTION,
  familyId,
  children = [],
  subjects = [],
  preloadedAcademicYears = null,
  userRole,
  accessibleChildren,
  viewingAsChildId = null,
  onTabChange,
}) {
  const parsed = useMemo(() => parseRecordsSection(section), [section]);
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

  const currentYear = useMemo(() => {
    if (!academicYears.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    return (
      academicYears.find((year) => {
        const start = year?.start_date ? String(year.start_date).slice(0, 10) : '';
        const end = year?.end_date ? String(year.end_date).slice(0, 10) : '';
        return start && end && today >= start && today <= end;
      }) || academicYears[0]
    );
  }, [academicYears]);

  const dateRangeLabel = currentYear
    ? formatYearRange(currentYear.start_date, currentYear.end_date)
    : 'This school year';

  const navigateSection = useCallback((nextSection) => {
    onTabChange?.('records', nextSection);
  }, [onTabChange]);

  const renderContent = () => {
    switch (parsed.view) {
      case 'progress-reports':
        return (
          <RecordsPlaceholderView
            title="Progress Reports"
            description="Term and year-end progress reports will appear here. Use Attendance for day-to-day logs in the meantime."
          />
        );
      case 'attendance':
        return (
          <View style={styles.embeddedPanel}>
            <AttendanceView familyId={familyId} children={children} />
          </View>
        );
      case 'transcripts':
        return (
          <RecordsPlaceholderView
            title="Transcripts"
            description="Transcript previews and credit summaries will appear here. Export tools are coming soon."
          />
        );
      case 'portfolios':
        return (
          <RecordsPlaceholderView
            title="Portfolios"
            description="Portfolio evidence and artifacts will appear here."
          />
        );
      case 'achievements':
        return (
          <RecordsPlaceholderView
            title="Achievements"
            description="Badges and milestones earned by your learners will appear here."
          />
        );
      case 'documents':
        return (
          <View style={styles.embeddedPanel}>
            <RecordsDocumentsView
              familyId={familyId}
              children={children}
              userRole={userRole}
              accessibleChildren={accessibleChildren}
              viewingAsChildId={viewingAsChildId}
            />
          </View>
        );
      case 'overview':
      default:
        return (
          <RecordsOverviewView
            familyId={familyId}
            subjects={subjects}
            academicYears={academicYears}
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
        <View style={styles.pageHeader}>
          <View style={styles.titleRow}>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.filterButton}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Filter size={14} color="#374151" />
                <Text style={styles.filterButtonText}>Filter</Text>
                <ChevronDown size={14} color="#6B7280" />
              </TouchableOpacity>
              <View style={styles.dateRangePill}>
                <CalendarDays size={14} color="#64748B" />
                <Text style={styles.dateRangeText}>{dateRangeLabel}</Text>
              </View>
            </View>
          </View>
          <RecordsTabBar
            tabs={RECORDS_VISIBLE_TABS}
            activeKey={parsed.view}
            onChange={navigateSection}
          />
        </View>

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
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterButton: {
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
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  dateRangePill: {
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
  dateRangeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    paddingHorizontal: 24,
    paddingTop: 20,
  },
});
