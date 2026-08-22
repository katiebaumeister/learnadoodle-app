/**
 * Assignment create modal — content + student response layout.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, ScrollView } from 'react-native';
import { useToast } from '../Toast';
import CreateModalShell from './shared/CreateModalShell';
import InstructionsEditor from './shared/InstructionsEditor';
import AssignmentResourceFields from './shared/AssignmentResourceFields';
import FamilyMemberPicker, { resolveDefaultAssigneeIds } from './shared/FamilyMemberPicker';
import SubjectSelectField from './shared/SubjectSelectField';
import ClassworkPlacementFields from './shared/ClassworkPlacementFields';
import { SingleDateField } from './shared/ScheduleDateFields';
import { SectionHeading } from './shared/assignmentFormParts';
import AssignmentCreateFooter from './assignment/AssignmentCreateFooter';
import AssignmentReleaseDateModal from './assignment/AssignmentReleaseDateModal';
import StudentResponseSection from './assignment/StudentResponseSection';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import AddMaterialModal from '../materials/AddMaterialModal';
import { nestedAddMaterialModalProps } from './shared/nestedAddMaterialModalProps';
import { createModalStyles as styles, PLACEHOLDER, CREATE_ASSIGNMENT_MODAL_MAX_WIDTH } from './shared/createModalStyles';
import { useFamilySubjects } from './shared/useSubjectsForAssignees';
import { saveAssignment } from '../../lib/create/saveEventHelpers';
import {
  filterMembersForSubject,
  findSubjectById,
  pruneAssigneesForSubject,
  validateSubjectAssigneeCombo,
} from '../../lib/create/assignmentAssigneeHelpers';
import { defaultWorkSpec } from '../../lib/workEventHelpers';
import {
  buildWorkSpecForStudentResponseType,
  parseStudentResponseType,
  studentResponseTypeShowsExtraEditor,
  STUDENT_RESPONSE_NO_RESPONSE,
} from '../../lib/studentResponseTypes';

function buildDefaultWorkSpec() {
  return buildWorkSpecForStudentResponseType(STUDENT_RESPONSE_NO_RESPONSE, {
    ...defaultWorkSpec('Assignment'),
    allow_student_replies: true,
    allow_editing: true,
    auto_grade: true,
    presentation_required: false,
    exam_open_book: true,
    exam_time_limit_minutes: '',
  });
}

export default function AssignmentCreateModal({
  visible,
  onClose,
  onCreated,
  familyId,
  familyMembers = [],
  defaultDate = null,
  defaultChildId = null,
  defaultChildIds = null,
  defaultSubjectId = null,
  defaultTitle = null,
  defaultMaterialId = null,
  defaultEventType: _defaultEventType = null,
  defaultLinkedLearningDayEventId = null,
  defaultCurriculumLessonId = null,
  requireParentApprovalDefault = false,
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [workSpec, setWorkSpec] = useState(() => buildDefaultWorkSpec());
  const [materialIds, setMaterialIds] = useState([]);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [subjectId, setSubjectId] = useState(null);
  const [unitId, setUnitId] = useState(null);
  const [unitTitle, setUnitTitle] = useState('');
  const [curriculumLessonId, setCurriculumLessonId] = useState(null);
  const [lessonLabel, setLessonLabel] = useState('');
  const [availableDate, setAvailableDate] = useState(null);
  const [dueDate, setDueDate] = useState(null);
  const [milestoneDueDate, setMilestoneDueDate] = useState(null);
  const [points, setPoints] = useState('');
  const [rubricId, setRubricId] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showReleaseDateModal, setShowReleaseDateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');
  const [errors, setErrors] = useState({});

  const subjects = useFamilySubjects(familyId, { pinnedSubjectId: defaultSubjectId });
  const selectedSubject = useMemo(
    () => findSubjectById(subjects, subjectId),
    [subjects, subjectId],
  );
  const eligibleMembers = useMemo(
    () => filterMembersForSubject(familyMembers, selectedSubject, { includeIds: assigneeIds }),
    [familyMembers, selectedSubject, assigneeIds],
  );
  const wasVisibleRef = useRef(false);
  const contentScrollRef = useRef(null);

  const scrollContentPanelDown = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const scroller = contentScrollRef.current;
        if (!scroller) return;
        if (typeof scroller.scrollToEnd === 'function') {
          scroller.scrollToEnd({ animated: true });
          return;
        }
        if (typeof scroller.scrollTo === 'function') {
          scroller.scrollTo({ y: 10000, animated: true });
        }
      }, 180);
    });
  }, []);

  useEffect(() => {
    if (!studentResponseTypeShowsExtraEditor(workSpec?.student_response_type)) return;
    scrollContentPanelDown();
  }, [workSpec?.student_response_type, scrollContentPanelDown]);

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      return;
    }
    if (wasVisibleRef.current) return;
    wasVisibleRef.current = true;

    setTitle(defaultTitle || '');
    setInstructions('');
    setWorkSpec(buildDefaultWorkSpec());
    setMaterialIds(defaultMaterialId ? [defaultMaterialId] : []);
    setAssigneeIds(resolveDefaultAssigneeIds({ defaultChildIds, defaultChildId, familyMembers }));
    setSubjectId(defaultSubjectId || null);
    setUnitId(null);
    setUnitTitle('');
    setCurriculumLessonId(defaultCurriculumLessonId || null);
    setLessonLabel('');
    const baseDate = defaultDate ? new Date(defaultDate) : null;
    setAvailableDate(baseDate);
    setDueDate(baseDate);
    setMilestoneDueDate(null);
    setPoints('');
    setRubricId(null);
    setShowReleaseDateModal(false);
    setValidationBanner('');
    setErrors({});
  }, [
    visible,
    defaultDate,
    defaultChildId,
    defaultChildIds,
    defaultSubjectId,
    defaultTitle,
    defaultMaterialId,
    defaultCurriculumLessonId,
    requireParentApprovalDefault,
    familyMembers,
  ]);

  useEffect(() => {
    if (!subjectId || subjects.length === 0) return;
    const subject = findSubjectById(subjects, subjectId);
    if (!subject) return;
    setAssigneeIds((prev) => pruneAssigneesForSubject(prev, subject));
  }, [subjectId, subjects]);

  useEffect(() => {
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      if (next.title && title.trim()) {
        delete next.title;
        changed = true;
      }
      if (next.studentResponse && parseStudentResponseType(workSpec?.student_response_type)) {
        delete next.studentResponse;
        changed = true;
      }
      const combo = validateSubjectAssigneeCombo(subjectId, assigneeIds, subjects);
      if (next.assignee && combo.ok) {
        delete next.assignee;
        changed = true;
      }
      if (!changed) return prev;
      if (Object.keys(next).length === 0) {
        setValidationBanner('');
      }
      return next;
    });
  }, [title, subjectId, workSpec?.student_response_type, assigneeIds, subjects]);

  const validate = useCallback((mode = 'assign') => {
    const next = {};
    if (!title.trim()) next.title = 'Title is required';
    if (!parseStudentResponseType(workSpec?.student_response_type)) {
      next.studentResponse = 'Select how students should respond';
    }
    const combo = validateSubjectAssigneeCombo(subjectId, assigneeIds, subjects);
    if (!combo.ok) next.assignee = combo.message;
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    setValidationBanner(ok ? '' : 'Please complete required fields before saving.');
    return ok;
  }, [title, subjectId, assigneeIds, workSpec?.student_response_type, subjects]);

  const buildSavePayload = useCallback((saveMode, releaseDate = null) => ({
    familyId,
    title,
    childIds: assigneeIds,
    subjectId,
    instructions,
    assignmentType: 'Assignment',
    workSpecInput: {
      ...workSpec,
      instructions,
      rubric_id: rubricId || null,
      points_possible: Number(points) || null,
    },
    availableDate: saveMode === 'schedule' ? releaseDate : availableDate,
    dueDate,
    gradingMode: 'points',
    materialIds,
    allowResubmission: false,
    requireParentApproval: !!requireParentApprovalDefault,
    unitId,
    unitTitle,
    curriculumLessonId,
    lessonLabel,
    rubricId,
    points: Number(points) || null,
    milestoneDueDate,
    saveMode,
    releaseDate,
    linkedLearningDayEventId: defaultLinkedLearningDayEventId || null,
  }), [
    familyId,
    title,
    assigneeIds,
    subjectId,
    instructions,
    workSpec,
    rubricId,
    points,
    availableDate,
    dueDate,
    requireParentApprovalDefault,
    unitId,
    unitTitle,
    curriculumLessonId,
    lessonLabel,
    materialIds,
    milestoneDueDate,
    defaultLinkedLearningDayEventId,
  ]);

  const persistAssignment = useCallback(async (saveMode, releaseDate = null) => {
    setSubmitting(true);
    try {
      const event = await saveAssignment(buildSavePayload(saveMode, releaseDate));
      if (saveMode === 'draft') {
        toast.push('Draft saved to subject', 'success');
      } else if (saveMode === 'schedule') {
        toast.push('Assignment scheduled', 'success');
      } else {
        toast.push('Assignment assigned', 'success');
      }
      onCreated?.(event);
      onClose?.();
    } catch (err) {
      toast.push(err?.message || 'Failed to save assignment', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [buildSavePayload, onCreated, onClose, toast]);

  const handleAssign = useCallback(async () => {
    if (!validate('assign')) return;
    await persistAssignment('assign');
  }, [validate, persistAssignment]);

  const handleSchedule = useCallback(() => {
    if (!validate('schedule')) return;
    setShowReleaseDateModal(true);
  }, [validate]);

  const handleReleaseDateConfirm = useCallback(async (releaseDate) => {
    setShowReleaseDateModal(false);
    await persistAssignment('schedule', releaseDate);
  }, [persistAssignment]);

  const canSaveDraft = !!title.trim()
    && !!parseStudentResponseType(workSpec?.student_response_type);
  const canAssign = canSaveDraft;

  const datePickerValue = useMemo(() => dueDate, [dueDate]);

  if (!visible) return null;

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <CreateModalShell
          title="Assignment"
          onClose={onClose}
          validationBanner={validationBanner}
          maxWidth={CREATE_ASSIGNMENT_MODAL_MAX_WIDTH}
          shellStyle={styles.assignmentModalShell}
          bodyStyle={styles.assignmentModalBody}
          disableShellScroll
          footer={(
            <AssignmentCreateFooter
              onCancel={onClose}
              onSchedule={handleSchedule}
              onAssign={handleAssign}
              saving={submitting}
              assignDisabled={!canAssign}
              scheduleDisabled={!canAssign}
              onBlockedAction={() => validate('assign')}
            />
          )}
        >
          <View style={styles.assignmentFormRow}>
            <View style={styles.assignmentFormColumnMain}>
              <View style={styles.assignmentContentPanelMain}>
                <ScrollView
                  ref={contentScrollRef}
                  style={styles.assignmentContentPanelScroll}
                  contentContainerStyle={styles.assignmentContentPanelScrollInner}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  <SectionHeading>Content</SectionHeading>

                  <View style={styles.formGroup}>
                    <Text style={styles.fieldLabel}>
                      Title<Text style={styles.required}> *</Text>
                    </Text>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder="Assignment name"
                      placeholderTextColor={PLACEHOLDER}
                      style={[styles.fieldInput, errors.title && styles.fieldInputError]}
                    />
                    {errors.title ? <Text style={styles.errorTextSmall}>{errors.title}</Text> : null}
                  </View>

                  <InstructionsEditor
                    value={instructions}
                    onChangeText={setInstructions}
                    label="Instructions"
                    placeholder="Add instructions for students…"
                    textAreaStyle={styles.assignmentInstructionsArea}
                  />

                  <View style={styles.assignmentPanelFormGroup}>
                    <StudentResponseSection
                      workSpec={workSpec}
                      onChange={setWorkSpec}
                      error={errors.studentResponse}
                    />
                  </View>
                </ScrollView>
              </View>

              {familyId ? (
                <View style={styles.assignmentAttachPanel}>
                  <SectionHeading>Attach</SectionHeading>
                  <AssignmentResourceFields
                      familyId={familyId}
                      materialIds={materialIds}
                      onMaterialIdsChange={setMaterialIds}
                      onAddMaterial={() => setShowAddMaterial(true)}
                      hideLabel
                    />
                </View>
              ) : null}
            </View>

            <View style={styles.assignmentFormColumnSide}>
              <View style={styles.assignmentSidePanel}>
                <SectionHeading>Assignees</SectionHeading>

                <View style={styles.assignmentSideFields}>
                  <SubjectSelectField
                    subjects={subjects}
                    subjectId={subjectId}
                    onSubjectChange={(nextSubjectId) => {
                      const nextSubject = findSubjectById(subjects, nextSubjectId);
                      setSubjectId(nextSubjectId);
                      setAssigneeIds((prev) => pruneAssigneesForSubject(prev, nextSubject));
                      setUnitId(null);
                      setUnitTitle('');
                      setCurriculumLessonId(null);
                      setLessonLabel('');
                    }}
                    label="Subject"
                    allowEmpty
                    error={errors.subject}
                  />

                  <FamilyMemberPicker
                    familyMembers={eligibleMembers}
                    selectedIds={assigneeIds}
                    onChange={setAssigneeIds}
                    label="Children"
                    required={false}
                    error={errors.assignee}
                  />

                  <ClassworkPlacementFields
                    familyId={familyId}
                    subjectId={subjectId}
                    unitId={unitId}
                    unitTitle={unitTitle}
                    curriculumLessonId={curriculumLessonId}
                    lessonLabel={lessonLabel}
                    onUnitChange={({ unitId: nextUnitId, unitTitle: nextUnitTitle }) => {
                      setUnitId(nextUnitId || null);
                      setUnitTitle(nextUnitTitle || '');
                    }}
                    onLessonChange={({ curriculumLessonId: nextLessonId, lessonLabel: nextLessonLabel }) => {
                      setCurriculumLessonId(nextLessonId || null);
                      setLessonLabel(nextLessonLabel || '');
                    }}
                  />

                  <SingleDateField
                    label="Due date"
                    date={dueDate}
                    onDateChange={setDueDate}
                    onOpenDatePicker={() => setDatePickerTarget('due')}
                  />

                  <View style={styles.assignmentPanelFormGroup}>
                    <Text style={styles.fieldLabel}>Points</Text>
                    <TextInput
                      value={String(points ?? '')}
                      onChangeText={(text) => setPoints(text.replace(/[^\d]/g, ''))}
                      placeholder="Optional"
                      placeholderTextColor={PLACEHOLDER}
                      keyboardType="numeric"
                      style={styles.fieldInput}
                    />
                    <Text style={styles.fieldHint}>
                      To use a different grading method, go to this subject's settings.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </CreateModalShell>
      </Modal>

      <AssignmentReleaseDateModal
        visible={showReleaseDateModal}
        onClose={() => setShowReleaseDateModal(false)}
        selectedDate={availableDate || dueDate}
        onConfirm={handleReleaseDateConfirm}
      />

      <AppCalendarDatePickerModal
        visible={!!datePickerTarget}
        onClose={() => setDatePickerTarget(null)}
        selectedDate={datePickerValue || new Date()}
        onSelectDate={(d) => {
          setDueDate(d);
          setDatePickerTarget(null);
        }}
      />

      {showAddMaterial ? (
        <AddMaterialModal
          visible
          {...nestedAddMaterialModalProps({
            familyId,
            familyMembers,
            subjectId,
            assigneeIds,
            subjects,
          })}
          onClose={() => setShowAddMaterial(false)}
          onSaved={(material) => {
            if (material?.id) {
              setMaterialIds((prev) => {
                const nextId = String(material.id);
                if (prev.some((id) => String(id) === nextId)) return prev;
                return [...prev, nextId];
              });
            }
            setShowAddMaterial(false);
          }}
        />
      ) : null}
    </>
  );
}
