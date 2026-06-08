import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Search, Sparkles, Wrench, CalendarDays, Plus, X } from 'lucide-react';
import { MAIN_NAV_ICONS, MAIN_NAV_PAGE_ICON_COLOR, MAIN_NAV_PAGE_ICON_SIZE } from '../layout/mainNavIcons';
import { colors } from '../../theme/colors';
import LearningSubjectRow from './LearningSubjectRow';

const BRAND_SKY_BLUE = '#81C1E1';
const BRAND_SKY_BLUE_FAINT = 'rgba(129, 193, 225, 0.18)';

export default function LearningSubjectsListView({
  subjects = [],
  children = [],
  searchQuery = '',
  onSearchChange,
  onSearchSubmit,
  onSubjectPress,
  onViewSubject,
  onCreateEvent,
  onSendMessage,
  onEditSubject,
  onArchiveSubject,
  onAddSubject,
  canManageSubjects = false,
  filterContent = null,
  onFixGap,
  onPlanWeek,
  emptyTitle = 'No subjects yet',
  emptyText = 'Create subjects to organize learning.',
}) {
  const PageIcon = MAIN_NAV_ICONS.subjects;

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderLeft}>
          <View style={styles.titleLine}>
            <PageIcon size={MAIN_NAV_PAGE_ICON_SIZE} color={MAIN_NAV_PAGE_ICON_COLOR} strokeWidth={2} />
            <Text style={styles.pageTitle}>Learning</Text>
          </View>
        </View>
        <View style={styles.pageHeaderActions}>
          <View style={styles.searchWrap}>
            <Search size={16} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search subjects..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={onSearchChange}
              onSubmitEditing={onSearchSubmit}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => onSearchChange?.('')} hitSlop={8}>
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>
          {canManageSubjects ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={onAddSubject}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Add subject</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.subjectHeaderCell]}>Subject</Text>
          <Text style={[styles.tableHeaderCell, styles.progressHeaderCell]}>Progress</Text>
          <Text style={[styles.tableHeaderCell, styles.upcomingHeaderCell]}>Upcoming</Text>
          <Text style={[styles.tableHeaderCell, styles.attentionHeaderCell]}>Needs Attention</Text>
          <View style={styles.actionsHeaderCell} />
        </View>

        {subjects.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyText}>{emptyText}</Text>
            {canManageSubjects ? (
              <TouchableOpacity style={styles.emptyBtn} onPress={onAddSubject}>
                <Plus size={16} color="#2563EB" />
                <Text style={styles.emptyBtnText}>Add subject</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <ScrollView style={styles.tableBody} showsVerticalScrollIndicator={false}>
            {subjects.map((subject) => (
              <LearningSubjectRow
                key={subject.id}
                subject={subject}
                children={children}
                onPress={onSubjectPress}
                onViewSubject={onViewSubject}
                onCreateEvent={onCreateEvent}
                onSendMessage={onSendMessage}
                onEditSubject={onEditSubject}
                onArchiveSubject={onArchiveSubject}
                canManageSubjects={canManageSubjects}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.planningBanner}>
        <View style={styles.planningBannerLeft}>
          <View style={styles.planningIconWrap}>
            <Sparkles size={18} color="#0F172A" />
          </View>
          <Text style={styles.planningText}>
            Need help planning? Use Fix Gap to get back on track or Plan Week to organize upcoming lessons.
          </Text>
        </View>
        <View style={styles.planningActions}>
          <TouchableOpacity style={styles.planningBtn} onPress={onFixGap} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
            <Wrench size={15} color="#059669" />
            <Text style={styles.planningBtnText}>Fix Gap</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.planningBtn} onPress={onPlanWeek} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
            <CalendarDays size={15} color="#2563EB" />
            <Text style={styles.planningBtnText}>Plan Week</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 18,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 20,
    flexWrap: 'wrap',
  },
  pageHeaderLeft: {
    flex: 1,
    minWidth: 260,
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
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  pageHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 220,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: BRAND_SKY_BLUE,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '0.04em',
    }),
  },
  tableCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E8EDF3',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    minHeight: 280,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  subjectHeaderCell: { flex: 1.4 },
  progressHeaderCell: { flex: 1.1 },
  upcomingHeaderCell: { flex: 1.1 },
  attentionHeaderCell: { flex: 1 },
  actionsHeaderCell: { width: 36 },
  tableBody: {
    flex: 1,
  },
  emptyWrap: {
    padding: 48,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },
  planningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: BRAND_SKY_BLUE_FAINT,
    flexWrap: 'wrap',
  },
  planningBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 240,
  },
  planningIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
  },
  planningActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planningBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  planningBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
});
