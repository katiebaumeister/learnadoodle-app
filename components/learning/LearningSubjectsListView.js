import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { BookOpen, Search, SlidersHorizontal, Sparkles, Wrench, CalendarDays, Plus, X } from 'lucide-react';
import { colors } from '../../theme/colors';
import LearningSubjectRow from './LearningSubjectRow';

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
  const [showFilters, setShowFilters] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderLeft}>
          <View style={styles.pageIconWrap}>
            <BookOpen size={22} color="#3B82F6" strokeWidth={2} />
          </View>
          <View style={styles.pageTitleWrap}>
            <Text style={styles.pageTitle}>Learning</Text>
          </View>
        </View>
        <View style={styles.pageHeaderActions}>
          <TouchableOpacity
            style={[styles.filterBtn, showFilters && styles.filterBtnActive]}
            onPress={() => setShowFilters((prev) => !prev)}
            accessibilityRole="button"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <SlidersHorizontal size={16} color={showFilters ? '#2563EB' : '#64748B'} />
            <Text style={[styles.filterBtnText, showFilters && styles.filterBtnTextActive]}>Filter</Text>
          </TouchableOpacity>
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

      {showFilters && filterContent ? (
        <View style={styles.filtersPanel}>{filterContent}</View>
      ) : null}

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
            <Sparkles size={18} color="#2563EB" />
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    flex: 1,
    minWidth: 260,
  },
  pageIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitleWrap: {
    flex: 1,
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
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  filterBtnActive: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  filterBtnTextActive: {
    color: '#2563EB',
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
    backgroundColor: '#2563EB',
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  filtersPanel: {
    paddingBottom: 4,
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
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
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
    color: '#1E3A8A',
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
