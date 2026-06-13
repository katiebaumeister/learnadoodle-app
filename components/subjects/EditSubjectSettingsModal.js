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
import { ChevronDown, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import { parseChildIds } from '../../lib/services/subjectsClient';
import AppModalShell from '../ui/AppModalShell';
import { ModalFooter } from '../ui/ModalFooter';
import Dropdown from '../ui/Dropdown';
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
import {
  APPLY_SCOPE_FULL_YEAR,
  APPLY_SCOPE_FORWARD,
  applySubjectScheduleToCalendar,
  buildInitialScheduleForm,
} from '../../lib/subjectConfigureSchedule';

const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const EDIT_SETTINGS_MAX_WIDTH = 880;

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
  const [showSchoolYearDropdown, setShowSchoolYearDropdown] = useState(false);
  const [schoolTerm, setSchoolTerm] = useState(getDefaultSchoolTerm());
  const [showSchoolTermDropdown, setShowSchoolTermDropdown] = useState(false);
  const [children, setChildren] = useState(propChildren || []);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');

  const [gradingDraft, setGradingDraft] = useState(() => parseSubjectGradingSettings(initialGradingSettings));

  const [weekdays, setWeekdays] = useState([1, 3, 5]);
  const [startTime, setStartTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [applyScope, setApplyScope] = useState(APPLY_SCOPE_FULL_YEAR);
  const [hasExistingBlock, setHasExistingBlock] = useState(false);

  const schoolYearTriggerRef = useRef(null);
  const schoolTermTriggerRef = useRef(null);
  const hasHydratedRef = useRef(false);

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
    setSubjectName(subject.name || '');
    setGrade(subject.grade || '');
    setSchoolYear(subject.school_year || getDefaultSchoolYear());
    setSchoolTerm(subject.school_term || getDefaultSchoolTerm());
    setGradingDraft(parseSubjectGradingSettings(initialGradingSettings ?? subject.grading_settings));
    const childIds = subject.child_id ? parseChildIds(subject.child_id) : [];
    setSelectedChildIds(childIds);

    const initialSchedule = buildInitialScheduleForm({
      subject,
      planData: subjectPlanData,
      academicYearId,
    });
    setWeekdays(initialSchedule.weekdays);
    setStartTime(initialSchedule.startTime);
    setDurationMinutes(String(initialSchedule.durationMinutes));
    setStartDate(initialSchedule.startDate);
    setEndDate(initialSchedule.endDate);
    setHasExistingBlock(!!initialSchedule.hasExistingBlock);
    setApplyScope(initialSchedule.hasExistingBlock ? APPLY_SCOPE_FORWARD : APPLY_SCOPE_FULL_YEAR);
    hasHydratedRef.current = true;
  }, [visible, subject, subjectPlanData, academicYearId, initialGradingSettings]);

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
    if (!weekdays.length) return 'Select at least one day.';
    if (!startDate || !endDate) return 'Pick start and end dates.';
    if (!Number(durationMinutes) || Number(durationMinutes) <= 0) return 'Duration must be at least 1 minute.';
    return null;
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

      toast.push(`"${subjectName.trim()}" settings saved`, 'success');
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

  const handleGenerateSchedule = async () => {
    const scheduleError = validateSchedule();
    if (scheduleError) {
      setValidationBanner(scheduleError);
      return;
    }
    setGeneratingSchedule(true);
    setValidationBanner('');
    try {
      const result = await applySubjectScheduleToCalendar({
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
        applyScope: hasExistingBlock ? applyScope : APPLY_SCOPE_FULL_YEAR,
      });
      toast.push(`Generated ${result?.created ?? 0} calendar events`, 'success');
      setHasExistingBlock(true);
      onSaved?.(subject);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: subject.id } }));
      }
    } catch (err) {
      setValidationBanner(err?.message || 'Failed to generate calendar events');
    } finally {
      setGeneratingSchedule(false);
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
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalWrap}>
            <AppModalShell
              title="Subject settings"
              onClose={onClose}
              disableShellScroll
              shellStyle={styles.settingsShell}
              titleRowStyle={styles.titleRow}
              contentContainerStyle={styles.contentContainer}
              bodyStyle={styles.shellBody}
              footer={(
                <ModalFooter
                  mode="edit"
                  primaryLabel={saving ? 'Saving…' : 'Save changes'}
                  destructiveLabel={deletingSubject ? 'Deleting…' : 'Delete subject'}
                  onCancel={onClose}
                  onDelete={() => setShowDeleteConfirm(true)}
                  onPrimary={handleSave}
                  accent="#9ECFFB"
                  disabled={saving || deletingSubject || generatingSchedule}
                  loading={saving || deletingSubject}
                />
              )}
            >
              {validationBanner ? (
                <View style={styles.validationBanner}>
                  <Text style={styles.validationBannerText}>{validationBanner}</Text>
                </View>
              ) : null}

              <ScrollView
                ref={formScrollRef}
                style={styles.formScroll}
                contentContainerStyle={styles.formScrollContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                <View
                  onLayout={(e) => {
                    sectionOffsetsRef.current.details = e.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.sectionTitle}>Details</Text>
                  <View style={styles.sectionPanel}>
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
                        <Text style={styles.loadingText}>Loading students…</Text>
                      ) : (
                        <View style={styles.chipRow}>
                          {children.map((child) => {
                            const isSelected = selectedChildIds.includes(child.id);
                            return (
                              <TouchableOpacity
                                key={child.id}
                                style={[styles.childChip, isSelected && styles.childChipSelected]}
                                onPress={() => {
                                  setSelectedChildIds((prev) =>
                                    isSelected
                                      ? prev.filter((id) => id !== child.id)
                                      : [...prev, child.id]
                                  );
                                }}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text style={[styles.childChipText, isSelected && styles.childChipTextSelected]}>
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
                      <View style={styles.gradeChipRow}>
                        {GRADE_OPTIONS.map((gradeOption) => (
                          <TouchableOpacity
                            key={gradeOption}
                            style={[styles.gradeChip, grade === gradeOption && styles.gradeChipSelected]}
                            onPress={() => setGrade(gradeOption)}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={[styles.gradeChipText, grade === gradeOption && styles.gradeChipTextSelected]}>
                              {gradeOption}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.stackedFields}>
                      <View style={styles.scopeField}>
                        <Text style={styles.fieldLabel}>School year</Text>
                        <TouchableOpacity
                          ref={schoolYearTriggerRef}
                          style={styles.dropdownButton}
                          onPress={() => {
                            setShowSchoolTermDropdown(false);
                            setShowSchoolYearDropdown((open) => !open);
                          }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.dropdownButtonText}>{schoolYear}</Text>
                          <ChevronDown size={18} color="#6b7280" />
                        </TouchableOpacity>
                        <Dropdown
                          visible={showSchoolYearDropdown}
                          triggerRef={schoolYearTriggerRef}
                          onClose={() => setShowSchoolYearDropdown(false)}
                          placement="bottom-start"
                          matchTriggerWidth
                          maxHeight={220}
                        >
                          {schoolYearOptions.map((opt) => (
                            <TouchableOpacity
                              key={opt}
                              style={[styles.dropdownOption, opt === schoolYear && styles.dropdownOptionSelected]}
                              onPress={() => {
                                setSchoolYear(opt);
                                setShowSchoolYearDropdown(false);
                              }}
                            >
                              <Text style={[styles.dropdownOptionText, opt === schoolYear && styles.dropdownOptionTextSelected]}>
                                {opt}
                              </Text>
                              {opt === schoolYear ? <CheckCircle size={16} color="#3b82f6" /> : null}
                            </TouchableOpacity>
                          ))}
                        </Dropdown>
                      </View>
                      <View style={styles.scopeField}>
                        <Text style={styles.fieldLabel}>Term</Text>
                        <TouchableOpacity
                          ref={schoolTermTriggerRef}
                          style={styles.dropdownButton}
                          onPress={() => {
                            setShowSchoolYearDropdown(false);
                            setShowSchoolTermDropdown((open) => !open);
                          }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.dropdownButtonText}>
                            {(TERM_OPTIONS.find((opt) => opt.id === schoolTerm) || TERM_OPTIONS[0]).label}
                          </Text>
                          <ChevronDown size={18} color="#6b7280" />
                        </TouchableOpacity>
                        <Dropdown
                          visible={showSchoolTermDropdown}
                          triggerRef={schoolTermTriggerRef}
                          onClose={() => setShowSchoolTermDropdown(false)}
                          placement="bottom-start"
                          matchTriggerWidth
                          maxHeight={220}
                        >
                          {TERM_OPTIONS.map((opt) => (
                            <TouchableOpacity
                              key={opt.id}
                              style={[styles.dropdownOption, opt.id === schoolTerm && styles.dropdownOptionSelected]}
                              onPress={() => {
                                setSchoolTerm(opt.id);
                                setShowSchoolTermDropdown(false);
                              }}
                            >
                              <Text style={[styles.dropdownOptionText, opt.id === schoolTerm && styles.dropdownOptionTextSelected]}>
                                {opt.label}
                              </Text>
                              {opt.id === schoolTerm ? <CheckCircle size={16} color="#3b82f6" /> : null}
                            </TouchableOpacity>
                          ))}
                        </Dropdown>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.sectionDivider} />

                <View
                  onLayout={(e) => {
                    sectionOffsetsRef.current.schedule = e.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.sectionTitle}>Schedule</Text>
                  <View style={styles.sectionPanel}>
                    <SubjectScheduleFields
                      embeddedInForm
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
                      hasExistingBlock={hasExistingBlock}
                      applyScope={applyScope}
                      onApplyScopeChange={setApplyScope}
                      showGenerateButton
                      onGenerate={handleGenerateSchedule}
                      generating={generatingSchedule}
                      generateDisabled={!weekdays.length || !startDate || !endDate}
                    />
                  </View>
                </View>

                <View style={styles.sectionDivider} />

                <View
                  onLayout={(e) => {
                    sectionOffsetsRef.current.grades = e.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.sectionTitle}>Grades</Text>
                  <View style={styles.sectionPanel}>
                    <SubjectGradingFields
                      draft={gradingDraft}
                      onUpdateDraft={updateGradingDraft}
                      onUpdateCategory={updateCategory}
                      onRemoveCategory={removeCategory}
                      onAddCategory={addCategory}
                    />
                  </View>
                </View>
              </ScrollView>
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrap: {
    width: '100%',
    maxWidth: EDIT_SETTINGS_MAX_WIDTH,
  },
  settingsShell: {
    height: Platform.OS === 'web' ? '88vh' : '88%',
    maxHeight: Platform.OS === 'web' ? 920 : undefined,
    minHeight: 520,
    borderRadius: 28,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)',
    }),
  },
  titleRow: {
    paddingTop: 18,
    paddingBottom: 10,
  },
  contentContainer: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 0,
  },
  shellBody: {
    flex: 1,
    minHeight: 0,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
    letterSpacing: -0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
    marginVertical: 22,
  },
  sectionPanel: {
    gap: 4,
  },
  validationBanner: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  validationBannerText: {
    fontSize: 13,
    color: '#B91C1C',
  },
  formScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
    }),
  },
  formScrollContent: {
    paddingBottom: 20,
  },
  formGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#FFFFFF',
  },
  childChipSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#9ECFFB',
  },
  childChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  childChipTextSelected: {
    color: '#0F172A',
    fontWeight: '600',
  },
  gradeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gradeChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  gradeChipSelected: {
    backgroundColor: '#F1F5F9',
    borderColor: '#64748B',
  },
  gradeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  gradeChipTextSelected: {
    color: '#0F172A',
  },
  stackedFields: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  scopeField: {
    flex: 1,
    minWidth: 180,
    marginBottom: 8,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
  },
  dropdownButtonText: {
    fontSize: 15,
    color: '#0F172A',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownOptionSelected: {
    backgroundColor: '#F8FAFC',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#334155',
  },
  dropdownOptionTextSelected: {
    fontWeight: '600',
    color: '#0F172A',
  },
  loadingText: {
    fontSize: 14,
    color: '#94A3B8',
  },
});
