import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useToast } from '../Toast';
import { supabase } from '../../lib/supabase';
import { parseChildIds } from '../../lib/services/subjectsClient';
import AppModalShell from '../ui/AppModalShell';
import { ModalFooter } from '../ui/ModalFooter';
import {
  createModalStyles as styles,
  SUBJECT_SETTINGS_MODAL_MAX_WIDTH,
} from '../create/shared/createModalStyles';
import { SectionHeading } from '../create/shared/assignmentFormParts';
import ConfirmDialog from '../ConfirmDialog';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import SubjectGradingFields from './subjectSettings/SubjectGradingFields';
import SubjectScheduleFields from './subjectSettings/SubjectScheduleFields';
import {
  deleteSubjectCascade,
  dispatchSubjectDeletedSideEffects,
} from '../../lib/services/deleteSubjectCascade';
import {
  parseSubjectGradingSettings,
  validateGradingSettings,
  createEmptyCategory,
} from '../../lib/subjectGradingSettings';
import { saveSubjectGradingSettings } from '../../lib/services/subjectGradingSettingsClient';
import { getPlanDefaultsFromSettings } from '../../lib/services/plannerSettingsClient';
import {
  APPLY_SCOPE_FULL_YEAR,
  applySubjectScheduleToCalendar,
  buildInitialScheduleForm,
  countSubjectScheduleEvents,
  getSubjectTermDateRange,
  isScheduleFormConfigured,
  removeSubjectScheduleFromCalendar,
  ymdToLocalDate,
} from '../../lib/subjectConfigureSchedule';

const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const TERM_OPTIONS = [
  { id: 'full_year', label: 'Full year' },
  { id: 'fall_term', label: 'Fall term' },
  { id: 'spring_term', label: 'Spring term' },
];

const formatSchoolYearLabel = (startYear) => `${startYear}/${String(startYear + 1).slice(-2)}`;

function getFallbackSchoolYearOptions() {
  const now = new Date();
  const currentStart = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 12 }, (_, idx) => formatSchoolYearLabel(currentStart + idx));
}

function getDefaultSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const startYear = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return formatSchoolYearLabel(startYear);
}

function getDefaultSchoolTerm() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 8 ? 'fall_term' : 'spring_term';
}

export default function EditSubjectSettingsModal({
  visible,
  onClose,
  onSaved,
  familyId,
  subject,
  children: propChildren = [],
  initialTab = 'details',
  subjectPlanData = null,
  academicYearId = null,
  assignedChildIds = [],
  allChildIds = [],
  initialGradingSettings = null,
}) {
  const toast = useToast();
  const formScrollRef = useRef(null);
  const sectionOffsetsRef = useRef({ details: 0, schedule: 0, grades: 0 });
  const [subjectName, setSubjectName] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [grade, setGrade] = useState('');
  const [schoolYear, setSchoolYear] = useState(getDefaultSchoolYear());
  const [schoolYearOptions] = useState(() => getFallbackSchoolYearOptions());
  const [schoolTerm, setSchoolTerm] = useState(getDefaultSchoolTerm());
  const [plannerSettings, setPlannerSettings] = useState(null);
  const [children, setChildren] = useState(propChildren || []);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');

  const [gradingDraft, setGradingDraft] = useState(() => parseSubjectGradingSettings(initialGradingSettings));

  const [weekdays, setWeekdays] = useState([]);
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [removingScheduleEvents, setRemovingScheduleEvents] = useState(false);
  const [showRemoveScheduleConfirm, setShowRemoveScheduleConfirm] = useState(false);
  const [hasScheduleEvents, setHasScheduleEvents] = useState(false);

  const hasHydratedRef = useRef(false);

  const applyTermDates = useCallback((year, term, settings) => {
    const range = getSubjectTermDateRange(year, term, settings);
    const start = ymdToLocalDate(range.start_date);
    const end = ymdToLocalDate(range.end_date);
    if (start) setStartDate(start);
    if (end) setEndDate(end);
  }, []);

  const handleSchoolYearChange = useCallback(async (year) => {
    setSchoolYear(year);
    let settings = plannerSettings;
    if (familyId) {
      try {
        const { settings: loaded } = await getPlanDefaultsFromSettings(familyId, year);
        settings = loaded || null;
        setPlannerSettings(settings);
      } catch (_) {
        settings = null;
        setPlannerSettings(null);
      }
    }
    applyTermDates(year, schoolTerm, settings);
  }, [familyId, schoolTerm, plannerSettings, applyTermDates]);

  const handleSchoolTermChange = useCallback((term) => {
    setSchoolTerm(term);
    applyTermDates(schoolYear, term, plannerSettings);
  }, [schoolYear, plannerSettings, applyTermDates]);

  const effectiveAssignedChildIds = useMemo(() => {
    if (assignedChildIds?.length) return assignedChildIds;
    return selectedChildIds;
  }, [assignedChildIds, selectedChildIds]);

  const effectiveAllChildIds = useMemo(() => {
    if (allChildIds?.length) return allChildIds;
    return (children || []).map((c) => c.id).filter(Boolean);
  }, [allChildIds, children]);

  useEffect(() => {
    if (!visible) {
      hasHydratedRef.current = false;
      return;
    }
    setValidationBanner('');
    setShowDeleteConfirm(false);
  }, [visible, subject?.id]);

  useEffect(() => {
    if (!visible || !initialTab || initialTab === 'details') return undefined;
    const timer = setTimeout(() => {
      const y = sectionOffsetsRef.current[initialTab];
      if (typeof y === 'number' && formScrollRef.current?.scrollTo) {
        formScrollRef.current.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [visible, initialTab, subject?.id]);

  useEffect(() => {
    if (!visible || !subject || hasHydratedRef.current) return;
    let cancelled = false;

    const hydrate = async () => {
      setSubjectName(subject.name || '');
      setGrade(subject.grade || '');
      const yearLabel = subject.school_year || getDefaultSchoolYear();
      const termId = subject.school_term || getDefaultSchoolTerm();
      setSchoolYear(yearLabel);
      setSchoolTerm(termId);
      setGradingDraft(parseSubjectGradingSettings(initialGradingSettings ?? subject.grading_settings));
      const childIds = subject.child_id ? parseChildIds(subject.child_id) : [];
      setSelectedChildIds(childIds);

      let loadedPlannerSettings = null;
      if (familyId) {
        try {
          const { settings } = await getPlanDefaultsFromSettings(familyId, yearLabel);
          if (!cancelled) {
            loadedPlannerSettings = settings || null;
            setPlannerSettings(loadedPlannerSettings);
          }
        } catch (_) {
          if (!cancelled) setPlannerSettings(null);
        }
      }

      const initialSchedule = buildInitialScheduleForm({
        subject,
        planData: subjectPlanData,
        academicYearId,
      });
      if (cancelled) return;
      setWeekdays(initialSchedule.weekdays);
      setStartTime(initialSchedule.startTime || '');
      setDurationMinutes(
        initialSchedule.durationMinutes === '' || initialSchedule.durationMinutes == null
          ? ''
          : String(initialSchedule.durationMinutes),
      );

      if (initialSchedule.startDate && initialSchedule.endDate) {
        setStartDate(initialSchedule.startDate);
        setEndDate(initialSchedule.endDate);
      } else {
        const range = getSubjectTermDateRange(yearLabel, termId, loadedPlannerSettings);
        setStartDate(ymdToLocalDate(range.start_date));
        setEndDate(ymdToLocalDate(range.end_date));
      }

      try {
        const eventCount = await countSubjectScheduleEvents({
          familyId,
          subjectId: subject.id,
          academicYearId: academicYearId || initialSchedule.academicYearId,
        });
        if (!cancelled) {
          setHasScheduleEvents(!!initialSchedule.hasExistingBlock || eventCount > 0);
        }
      } catch (_) {
        if (!cancelled) {
          setHasScheduleEvents(!!initialSchedule.hasExistingBlock);
        }
      }

      hasHydratedRef.current = true;
    };

    hydrate();
    return () => { cancelled = true; };
  }, [visible, subject, subjectPlanData, academicYearId, initialGradingSettings, familyId]);

  useEffect(() => {
    if (propChildren?.length) {
      setChildren(propChildren);
      return;
    }
    if (!visible || !familyId) return;
    let cancelled = false;
    (async () => {
      setLoadingChildren(true);
      try {
        const { data, error } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', familyId)
          .eq('archived', false);
        if (cancelled) return;
        if (error && (error.code === '42703' || error.message?.includes('archived'))) {
          const retry = await supabase.from('children').select('*').eq('family_id', familyId);
          if (!cancelled) setChildren(retry.data || []);
        } else if (!cancelled) {
          setChildren(data || []);
        }
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, propChildren]);

  const datePickerValue = useMemo(() => {
    if (datePickerTarget === 'end') return endDate;
    return startDate;
  }, [datePickerTarget, startDate, endDate]);

  const updateGradingDraft = useCallback((patch) => {
    setGradingDraft((prev) => ({ ...prev, ...patch }));
    setValidationBanner('');
  }, []);

  const updateCategory = useCallback((index, patch) => {
    setGradingDraft((prev) => {
      const categories = [...(prev.categories || [])];
      categories[index] = { ...categories[index], ...patch };
      return { ...prev, categories };
    });
    setValidationBanner('');
  }, []);

  const removeCategory = useCallback((index) => {
    setGradingDraft((prev) => ({
      ...prev,
      categories: (prev.categories || []).filter((_, i) => i !== index),
    }));
    setValidationBanner('');
  }, []);

  const addCategory = useCallback(() => {
    setGradingDraft((prev) => ({
      ...prev,
      categories: [...(prev.categories || []), createEmptyCategory()],
    }));
    setValidationBanner('');
  }, []);

  const validateDetails = () => {
    if (!subjectName.trim()) return 'Enter a subject name.';
    if (selectedChildIds.length === 0) return 'Select at least one student.';
    return null;
  };

  const validateSchedule = () => {
    if (!isScheduleFormConfigured({ weekdays, startTime, durationMinutes, startDate, endDate })) {
      return null;
    }
    if (!weekdays.length) return 'Select at least one day.';
    if (!String(startTime || '').trim()) return 'Enter a start time.';
    if (!startDate || !endDate) return 'Pick start and end dates.';
    if (!Number(durationMinutes) || Number(durationMinutes) <= 0) return 'Duration must be at least 1 minute.';
    return null;
  };

  const applyScheduleIfConfigured = async () => {
    if (!isScheduleFormConfigured({ weekdays, startTime, durationMinutes, startDate, endDate })) {
      return null;
    }
    const scheduleError = validateSchedule();
    if (scheduleError) throw new Error(scheduleError);
    return applySubjectScheduleToCalendar({
      familyId,
      subject: { ...subject, name: subjectName.trim() || subject.name },
      assignedChildIds: effectiveAssignedChildIds,
      allChildIds: effectiveAllChildIds,
      weekdays,
      startTime,
      durationMinutes: Number(durationMinutes),
      startDate,
      endDate,
      academicYearId,
      planData: subjectPlanData,
      applyScope: APPLY_SCOPE_FULL_YEAR,
    });
  };

  const handleSave = async () => {
    if (!subject?.id || !familyId || saving) return;
    const detailsError = validateDetails();
    if (detailsError) {
      setValidationBanner(detailsError);
      return;
    }
    const { ok, errors } = validateGradingSettings(gradingDraft);
    if (!ok) {
      setValidationBanner(errors[0]);
      return;
    }

    setSaving(true);
    setValidationBanner('');
    try {
      const childIdString = selectedChildIds.join(';');
      const { data, error } = await supabase
        .from('subject')
        .update({
          name: subjectName.trim(),
          child_id: childIdString,
          grade: grade || null,
          school_year: schoolYear || getDefaultSchoolYear(),
          school_term: schoolTerm || getDefaultSchoolTerm(),
        })
        .eq('id', subject.id)
        .eq('family_id', familyId)
        .select();

      if (error) throw error;

      await saveSubjectGradingSettings(subject.id, familyId, gradingDraft);

      const scheduleResult = await applyScheduleIfConfigured();
      if (scheduleResult) {
        setHasScheduleEvents(true);
      }

      toast.push(
        scheduleResult
          ? `"${subjectName.trim()}" saved and calendar updated`
          : `"${subjectName.trim()}" settings saved`,
        'success',
      );
      onSaved?.(data?.[0] || { ...subject, name: subjectName.trim() });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: subject.id } }));
        if (data?.[0]) {
          window.dispatchEvent(new CustomEvent('subjectRecordUpserted', { detail: { subject: data[0] } }));
        }
      }
      onClose?.();
    } catch (err) {
      setValidationBanner(err?.message || 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveScheduleEvents = async () => {
    if (!subject?.id || !familyId || removingScheduleEvents) return;
    setRemovingScheduleEvents(true);
    setValidationBanner('');
    try {
      await removeSubjectScheduleFromCalendar({
        familyId,
        subjectId: subject.id,
        academicYearId,
      });
      setHasScheduleEvents(false);
      setWeekdays([]);
      setStartTime('');
      setDurationMinutes('');
      setStartDate(null);
      setEndDate(null);
      toast.push('Removed scheduled calendar events for this subject', 'success');
      onSaved?.(subject);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: subject.id } }));
      }
    } catch (err) {
      setValidationBanner(err?.message || 'Could not remove calendar events.');
    } finally {
      setRemovingScheduleEvents(false);
      setShowRemoveScheduleConfirm(false);
    }
  };

  const handleDeleteSubject = async () => {
    if (!subject?.id || !familyId || deletingSubject) return;
    setDeletingSubject(true);
    try {
      const deletedName = subject.name || subjectName || 'Subject';
      const result = await deleteSubjectCascade(supabase, familyId, subject.id, deletedName);
      if (!result.ok) throw new Error(result.error || 'Delete failed');
      dispatchSubjectDeletedSideEffects(familyId);
      toast.push(`"${deletedName}" has been deleted.`, 'success');
      onClose?.();
    } catch (err) {
      setValidationBanner(err?.message || 'Could not delete subject.');
    } finally {
      setDeletingSubject(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!visible || !subject?.id) return null;

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={localStyles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={localStyles.modalWrap}>
            <AppModalShell
              title="Subject settings"
              onClose={onClose}
              disableShellScroll
              shellStyle={[styles.compactShell, styles.subjectSettingsModalShell]}
              titleRowStyle={styles.subjectSettingsTitleRow}
              contentContainerStyle={localStyles.bodyContent}
              bodyStyle={[styles.shellBody, styles.subjectSettingsModalBody]}
              footer={(
                <ModalFooter
                  mode="edit"
                  primaryLabel={saving ? 'Saving…' : 'Save changes'}
                  destructiveLabel={deletingSubject ? 'Deleting…' : 'Delete subject'}
                  onCancel={onClose}
                  onDelete={() => setShowDeleteConfirm(true)}
                  onPrimary={handleSave}
                  accent="#9ECFFB"
                  disabled={saving || deletingSubject || removingScheduleEvents}
                  loading={saving || deletingSubject}
                />
              )}
            >
              {validationBanner ? (
                <View style={styles.validationBannerContainer}>
                  <Text style={styles.validationBannerText}>{validationBanner}</Text>
                </View>
              ) : null}

              <View style={styles.assignmentFormRow}>
                <View style={styles.assignmentFormColumnMain}>
                  <View style={styles.assignmentContentPanel}>
                    <View
                      onLayout={(e) => {
                        sectionOffsetsRef.current.details = e.nativeEvent.layout.y;
                      }}
                    >
                      <SectionHeading>Details</SectionHeading>

                      <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>Subject name</Text>
                        <TextInput
                          style={styles.fieldInput}
                          value={subjectName}
                          onChangeText={setSubjectName}
                          placeholder="e.g., World History"
                          placeholderTextColor="#9ca3af"
                        />
                      </View>

                      <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>Students</Text>
                        {loadingChildren ? (
                          <Text style={localStyles.loadingText}>Loading students…</Text>
                        ) : (
                          <View style={styles.chipRow}>
                            {children.map((child) => {
                              const isSelected = selectedChildIds.includes(child.id);
                              return (
                                <TouchableOpacity
                                  key={child.id}
                                  style={[
                                    styles.dropdownOption,
                                    styles.assigneePill,
                                    isSelected && styles.dropdownOptionActive,
                                  ]}
                                  onPress={() => {
                                    setSelectedChildIds((prev) =>
                                      isSelected
                                        ? prev.filter((id) => id !== child.id)
                                        : [...prev, child.id]
                                    );
                                  }}
                                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                >
                                  <Text
                                    style={[
                                      styles.dropdownOptionText,
                                      styles.assigneePillText,
                                      isSelected && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
                                    ]}
                                  >
                                    {child.first_name || child.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>

                      <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>Grade level</Text>
                        <View style={styles.chipRow}>
                          {GRADE_OPTIONS.map((gradeOption) => {
                            const isSelected = grade === gradeOption;
                            return (
                              <TouchableOpacity
                                key={gradeOption}
                                style={[
                                  styles.dropdownOption,
                                  styles.assigneePill,
                                  isSelected && styles.dropdownOptionActive,
                                ]}
                                onPress={() => setGrade(gradeOption)}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text
                                  style={[
                                    styles.dropdownOptionText,
                                    styles.assigneePillText,
                                    isSelected && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
                                  ]}
                                >
                                  {gradeOption}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.assignmentAttachPanel, localStyles.gradingPanel]}>
                    <ScrollView
                      ref={formScrollRef}
                      style={localStyles.gradingPanelScroll}
                      contentContainerStyle={localStyles.gradingPanelScrollInner}
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      <View
                        onLayout={(e) => {
                          sectionOffsetsRef.current.grades = e.nativeEvent.layout.y;
                        }}
                      >
                        <SubjectGradingFields
                          draft={gradingDraft}
                          onUpdateDraft={updateGradingDraft}
                          onUpdateCategory={updateCategory}
                          onRemoveCategory={removeCategory}
                          onAddCategory={addCategory}
                        />
                      </View>
                    </ScrollView>
                  </View>
                </View>

                <View style={styles.assignmentFormColumnSide}>
                  <View
                    style={styles.subjectSettingsSidePanel}
                    onLayout={(e) => {
                      sectionOffsetsRef.current.schedule = e.nativeEvent.layout.y;
                    }}
                  >
                    <SectionHeading>Schedule</SectionHeading>
                    <ScrollView
                      style={styles.subjectSettingsSideFieldsScroll}
                      contentContainerStyle={styles.subjectSettingsSideFieldsScrollInner}
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      <SubjectScheduleFields
                        embeddedInForm
                        schoolYear={schoolYear}
                        schoolYearOptions={schoolYearOptions}
                        onSchoolYearChange={handleSchoolYearChange}
                        schoolTerm={schoolTerm}
                        termOptions={TERM_OPTIONS}
                        onSchoolTermChange={handleSchoolTermChange}
                        weekdays={weekdays}
                        onWeekdaysChange={setWeekdays}
                        startTime={startTime}
                        onStartTimeChange={setStartTime}
                        durationMinutes={durationMinutes}
                        onDurationMinutesChange={setDurationMinutes}
                        startDate={startDate}
                        onStartDateChange={setStartDate}
                        endDate={endDate}
                        onEndDateChange={setEndDate}
                        onOpenStartDatePicker={() => setDatePickerTarget('start')}
                        onOpenEndDatePicker={() => setDatePickerTarget('end')}
                        showRemoveEventsButton={hasScheduleEvents}
                        onRemoveAllEvents={() => setShowRemoveScheduleConfirm(true)}
                        removingEvents={removingScheduleEvents}
                      />
                    </ScrollView>
                  </View>
                </View>
              </View>
            </AppModalShell>
          </TouchableOpacity>
        </View>
      </Modal>

      <AppCalendarDatePickerModal
        visible={!!datePickerTarget}
        onClose={() => setDatePickerTarget(null)}
        selectedDate={datePickerValue || new Date()}
        onSelectDate={(d) => {
          if (datePickerTarget === 'end') setEndDate(d);
          else setStartDate(d);
          setDatePickerTarget(null);
        }}
      />

      <ConfirmDialog
        visible={showRemoveScheduleConfirm}
        title="Remove all scheduled events?"
        message="This removes plan-generated calendar events for this subject. Lessons you linked to curriculum are not deleted."
        confirmLabel={removingScheduleEvents ? 'Removing…' : 'Remove all events'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!removingScheduleEvents) setShowRemoveScheduleConfirm(false);
        }}
        onConfirm={handleRemoveScheduleEvents}
      />

      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Delete subject?"
        message="This will permanently delete this subject and related planning links. This cannot be undone."
        confirmLabel={deletingSubject ? 'Deleting…' : 'Delete subject'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!deletingSubject) setShowDeleteConfirm(false);
        }}
        onConfirm={handleDeleteSubject}
      />
    </>
  );
}

const localStyles = StyleSheet.create({
  overlay: styles.overlay,
  modalWrap: {
    ...styles.modalWrap,
    maxWidth: SUBJECT_SETTINGS_MODAL_MAX_WIDTH,
  },
  bodyContent: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 4,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  gradingPanel: {
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: 'stretch',
    paddingBottom: 12,
    overflow: 'hidden',
    maxHeight: 220,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  gradingPanelScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      overflowX: 'hidden',
    }),
  },
  gradingPanelScrollInner: {
    paddingBottom: 4,
  },
});
