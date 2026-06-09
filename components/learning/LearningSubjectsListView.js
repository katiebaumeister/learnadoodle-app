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
import { Search, Sparkles, Wrench, CalendarDays, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { colors } from '../../theme/colors';
import SubjectOverviewCard from '../subjects/SubjectOverviewCard';

const BRAND_SKY_BLUE = '#81C1E1';
const BRAND_SKY_BLUE_FAINT = 'rgba(129, 193, 225, 0.18)';

export default function LearningSubjectsListView({
  subjects = [],
  children = [],
  searchQuery = '',
  onSearchChange,
  onSearchSubmit,
  onSubjectPress,
  onAddSubject,
  canManageSubjects = false,
  filterContent = null,
  selectedChildFilter = null,
  onNeedsHelpPress,
  onNavigateToPlanner,
  onAddSyllabus,
  onAddMaterial,
  onAddEvent,
  searchPreviewSectionId = null,
  subjectDetailCache = {},
  searchPreviewTokens = [],
  onSearchPreviewMaterialPress,
  isSearchResultCompact = false,
  selectedSchoolYear = null,
  onShiftSchoolYear,
  onJumpToCurrentSchoolYear,
  isAtCurrentSchoolYear = false,
  onFixGap,
  onPlanWeek,
  emptyTitle = 'No subjects yet',
  emptyText = 'Create subjects to organize learning.',
}) {
  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        {selectedSchoolYear ? (
          <View style={styles.yearNavRow}>
            <View style={styles.yearNavChevrons}>
              <TouchableOpacity
                style={styles.yearNavBtn}
                onPress={() => onShiftSchoolYear?.(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous school year"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <ChevronLeft size={16} color="rgba(15,23,42,0.4)" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.yearNavBtn}
                onPress={() => onShiftSchoolYear?.(1)}
                accessibilityRole="button"
                accessibilityLabel="Next school year"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <ChevronRight size={16} color="rgba(15,23,42,0.4)" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[
                styles.yearNavTitleButton,
                isAtCurrentSchoolYear && styles.yearNavTitleButtonDisabled,
              ]}
              onPress={onJumpToCurrentSchoolYear}
              disabled={isAtCurrentSchoolYear}
              accessibilityRole="button"
              accessibilityLabel="Return to current school year"
              {...(Platform.OS === 'web' && { cursor: isAtCurrentSchoolYear ? 'default' : 'pointer' })}
            >
              <Text style={styles.yearNavTitle}>{selectedSchoolYear} School Year</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.pageHeaderSpacer} />
        )}
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

      {filterContent ? <View style={styles.filtersPanel}>{filterContent}</View> : null}

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
        <ScrollView
          style={styles.subjectsScroll}
          contentContainerStyle={styles.subjectsScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {subjects.filter((subject) => subject?.id).map((subject) => (
            <SubjectOverviewCard
              key={subject.id}
              subject={subject}
              children={children}
              selectedChildFilter={selectedChildFilter}
              onCardClick={onSubjectPress}
              onNeedsHelpPress={onNeedsHelpPress}
              onNavigateToPlanner={onNavigateToPlanner}
              onAddSyllabus={onAddSyllabus}
              onAddEvent={onAddEvent}
              onAddMaterial={onAddMaterial}
              searchPreviewSectionId={searchPreviewSectionId}
              searchPreviewData={subjectDetailCache[subject.id] || null}
              searchPreviewTokens={searchPreviewTokens}
              onSearchPreviewMaterialPress={onSearchPreviewMaterialPress}
              isSearchResultCompact={isSearchResultCompact}
            />
          ))}
        </ScrollView>
      )}

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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  pageHeaderSpacer: {
    flex: 1,
    minWidth: 0,
  },
  pageHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    marginLeft: 'auto',
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
  filtersPanel: {
    paddingBottom: 4,
  },
  yearNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  yearNavChevrons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yearNavBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearNavTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearNavTitleButton: {
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearNavTitleButtonDisabled: {
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  subjectsScroll: {
    flex: 1,
    minHeight: 0,
  },
  subjectsScrollContent: {
    paddingBottom: 8,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
    }),
  },
  emptyWrap: {
    flex: 1,
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
