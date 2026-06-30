import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Plus, ChevronLeft, ChevronRight, Users, CalendarDays, Calendar } from 'lucide-react';
import SubjectOverviewCard from '../subjects/SubjectOverviewCard';
import { colors } from '../../theme/colors';

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
  onConfigureSchedule,
  onEditUnits,
  onNewAssignment,
  getUnitsEditorLabelForSubject,
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
  yearHeaderLabel = null,
  editSchoolYearLabel = 'Edit School Year',
  isHomeschoolExperience = true,
  showOpenPlannerAction = false,
  emptyTitle = 'No subjects yet',
  emptyText = 'Create subjects to organize learning.',
  emptyPrimaryAction = 'add_subject',
  emptySecondaryAction = null,
  previousYearAccessibilityLabel = 'Previous school year',
  nextYearAccessibilityLabel = 'Next school year',
  currentYearAccessibilityLabel = 'Return to current school year',
}) {
  const resolvedYearHeaderLabel = yearHeaderLabel || (selectedSchoolYear ? `${selectedSchoolYear} School Year` : null);
  const showEmptyPrimaryPlanner = emptyPrimaryAction === 'planner' && typeof onNavigateToPlanner === 'function';
  const showEmptyPrimaryAddSubject = emptyPrimaryAction === 'add_subject' && canManageSubjects && onAddSubject;
  const showEmptySecondaryAddSubject = emptySecondaryAction === 'add_subject' && canManageSubjects && onAddSubject;

  const renderEditSchoolYearButton = onEditSchoolYear ? (
    <TouchableOpacity
      style={styles.headerActionButton}
      onPress={onEditSchoolYear}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={editSchoolYearLabel}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <CalendarDays size={18} color="#334155" strokeWidth={2.25} />
      <Text style={styles.headerActionButtonText}>{editSchoolYearLabel}</Text>
    </TouchableOpacity>
  ) : null;

  const renderEditFamilyButton = onEditFamily ? (
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
  ) : null;

  const renderAddSubjectButton = (canManageSubjects && onAddSubject) ? (
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
  ) : null;

  const renderOpenPlannerButton = (showOpenPlannerAction && onNavigateToPlanner) ? (
    <TouchableOpacity
      style={styles.headerActionButton}
      onPress={() => onNavigateToPlanner()}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Open Planner"
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <Calendar size={18} color="#334155" strokeWidth={2.25} />
      <Text style={styles.headerActionButtonText}>Open Planner</Text>
    </TouchableOpacity>
  ) : null;
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
                accessibilityLabel={previousYearAccessibilityLabel}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <ChevronLeft size={16} color="rgba(15,23,42,0.4)" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.yearNavBtn}
                onPress={() => onShiftSchoolYear?.(1)}
                accessibilityRole="button"
                accessibilityLabel={nextYearAccessibilityLabel}
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
                accessibilityLabel={currentYearAccessibilityLabel}
                {...(Platform.OS === 'web' && { cursor: isAtCurrentSchoolYear ? 'default' : 'pointer' })}
              >
                <Text style={styles.yearNavTitle}>{resolvedYearHeaderLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {(isHomeschoolExperience
          ? (onEditFamily || onEditSchoolYear || (canManageSubjects && onAddSubject))
          : (canManageSubjects && onAddSubject)) ? (
          <View style={styles.headerActions}>
            {isHomeschoolExperience ? (
              <>
                {renderEditSchoolYearButton}
                {renderEditFamilyButton}
                {renderAddSubjectButton}
              </>
            ) : (
              renderAddSubjectButton
            )}
          </View>
        ) : null}
      </View>

      {filterContent ? <View style={styles.filtersPanel}>{filterContent}</View> : null}

      {subjects.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyText}>{emptyText}</Text>
          {showEmptyPrimaryPlanner ? (
            <TouchableOpacity
              style={[styles.addBtn, styles.emptyBtn]}
              onPress={() => onNavigateToPlanner()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Open Planner"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Calendar size={16} color={BRAND_SKY_BLUE_TEXT} strokeWidth={2.25} />
              <Text style={styles.addBtnText}>Open Planner</Text>
            </TouchableOpacity>
          ) : null}
          {showEmptyPrimaryAddSubject ? (
            <TouchableOpacity
              style={[styles.addBtn, styles.emptyBtn, showEmptyPrimaryPlanner && styles.emptyBtnSecondary]}
              onPress={onAddSubject}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add subject"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={16} color={BRAND_SKY_BLUE_TEXT} strokeWidth={2.25} />
              <Text style={styles.addBtnText}>Add subject</Text>
            </TouchableOpacity>
          ) : null}
          {showEmptySecondaryAddSubject && emptyPrimaryAction !== 'add_subject' ? (
            <TouchableOpacity
              style={[styles.addBtn, styles.emptyBtnSecondary]}
              onPress={onAddSubject}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add subject"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={16} color={BRAND_SKY_BLUE_TEXT} strokeWidth={2.25} />
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
              onConfigureSchedule={onConfigureSchedule}
              onEditUnits={onEditUnits}
              onNewAssignment={onNewAssignment}
              unitsEditorLabel={
                typeof getUnitsEditorLabelForSubject === 'function'
                  ? getUnitsEditorLabelForSubject(subject.id)
                  : 'Edit units'
              }
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
    paddingTop: 12,
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
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9ED3FF',
    backgroundColor: '#F8FCFF',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
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
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyBtn: {
    marginTop: 20,
  },
  emptyBtnSecondary: {
    marginTop: 12,
  },
});
