import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Plus, ChevronLeft, ChevronRight, Users, CalendarDays } from 'lucide-react';
import SubjectOverviewCard from '../subjects/SubjectOverviewCard';
import { colors } from '../../theme/colors';

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
  onEditSubject,
  searchPreviewSectionId = null,
  subjectDetailCache = {},
  searchPreviewTokens = [],
  onSearchPreviewMaterialPress,
  isSearchResultCompact = false,
  selectedSchoolYear = null,
  onShiftSchoolYear,
  onJumpToCurrentSchoolYear,
  onEditSchoolYear,
  onEditFamily,
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
            </View>
          </View>
        ) : null}
        {(onEditFamily || onEditSchoolYear || (canManageSubjects && onAddSubject)) ? (
          <View style={styles.headerActions}>
            {onEditFamily ? (
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={onEditFamily}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Edit Family"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Users size={18} color="#334155" strokeWidth={2.25} />
                <Text style={styles.headerActionButtonText}>Edit Family</Text>
              </TouchableOpacity>
            ) : null}
            {onEditSchoolYear ? (
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={onEditSchoolYear}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Edit School Year"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <CalendarDays size={18} color="#334155" strokeWidth={2.25} />
                <Text style={styles.headerActionButtonText}>Edit School Year</Text>
              </TouchableOpacity>
            ) : null}
            {canManageSubjects && onAddSubject ? (
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={onAddSubject}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add subject"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Plus size={18} color="#334155" strokeWidth={2.25} />
                <Text style={styles.headerActionButtonText}>Add subject</Text>
              </TouchableOpacity>
            ) : null}
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
              onEditSubject={onEditSubject}
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
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 16,
    flexWrap: 'wrap',
    paddingBottom: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    marginLeft: 'auto',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  headerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  headerActionButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(15,23,42,0.85)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    width: '100%',
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
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
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
