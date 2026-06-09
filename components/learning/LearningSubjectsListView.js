import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Plus, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import SubjectOverviewCard from '../subjects/SubjectOverviewCard';

const BRAND_SKY_BLUE = '#81C1E1';
const BRAND_SKY_BLUE_TEXT = '#5AAEF2';

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
  onEditSchoolYear,
  isAtCurrentSchoolYear = false,
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
            <View style={styles.yearNavTitleGroup}>
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
              {onEditSchoolYear ? (
                <TouchableOpacity
                  style={styles.yearNavEditBtn}
                  onPress={onEditSchoolYear}
                  accessibilityRole="button"
                  accessibilityLabel="Edit school year"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Pencil size={14} color="#64748B" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {filterContent ? <View style={styles.filtersPanel}>{filterContent}</View> : null}

      {subjects.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyText}>{emptyText}</Text>
          {canManageSubjects ? (
            <TouchableOpacity style={[styles.addBtn, styles.emptyBtn]} onPress={onAddSubject}>
              <Plus size={16} color={BRAND_SKY_BLUE_TEXT} />
              <Text style={styles.addBtnText}>Add subject</Text>
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
    gap: 16,
    flexWrap: 'wrap',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BRAND_SKY_BLUE,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_SKY_BLUE_TEXT,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  yearNavTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yearNavEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
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
  },
});
