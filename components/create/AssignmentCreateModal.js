/**
 * Assignment create modal — type-first layout with conditional fields.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput } from 'react-native';
import { useToast } from '../Toast';
import CreateModalShell from './shared/CreateModalShell';
import InstructionsEditor from './shared/InstructionsEditor';
import AssignmentResourceFields from './shared/AssignmentResourceFields';
import { materialIdsFromSelection } from './shared/EventAttachmentsField';
import FamilyMemberPicker, { resolveDefaultAssigneeIds } from './shared/FamilyMemberPicker';
import SubjectSelectField from './shared/SubjectSelectField';
import { SingleDateField } from './shared/ScheduleDateFields';
import { ChipOptionGroup } from './shared/assignmentFormParts';
import AssignmentCreateFooter from './assignment/AssignmentCreateFooter';
import AssignmentReleaseDateModal from './assignment/AssignmentReleaseDateModal';
import {
  ASSIGNMENT_TYPES,
  getAssignmentTypeLayout,
} from './assignment/assignmentTypeLayout';
import QuizQuestionsEditor from '../events/QuizQuestionsEditor';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import AddMaterialModal from '../materials/AddMaterialModal';
import { createModalStyles as styles, PLACEHOLDER, CREATE_ASSIGNMENT_MODAL_MAX_WIDTH } from './shared/createModalStyles';
import { useSubjectsForAssignees } from './shared/useSubjectsForAssignees';
import { saveAssignment } from '../../lib/create/saveEventHelpers';
import {
  defaultWorkSpec,
  defaultSubmissionMethodsForAssignmentType,
  normalizeQuizQuestions,
} from '../../lib/workEventHelpers';

const QUESTION_RESPONSE_TYPES = [
  { id: 'short_answer', label: 'Short answer' },
  { id: 'discussion', label: 'Discussion' },
];

function assignmentTypeToEventType(assignmentType) {
  if (assignmentType === 'Project') return 'Project';
  if (assignmentType === 'Exam') return 'Exam';
  return 'Assignment';
}

function eventTypeToDefaultAssignmentType(eventType) {
  const t = String(eventType || '').trim();
  if (t === 'Project') return 'Project';
  if (t === 'Exam') return 'Exam';
  return 'Assignment';
}

function buildDefaultWorkSpec(assignmentType) {
  const eventType = assignmentTypeToEventType(assignmentType);
  const base = {
    ...defaultWorkSpec(eventType),
    require_final_deliverable: true,
    submission_methods: defaultSubmissionMethodsForAssignmentType(assignmentType),
    question_response_type: 'short_answer',
    allow_student_replies: true,
    allow_editing: true,
    auto_grade: true,
    presentation_required: false,
    exam_open_book: true,
    exam_time_limit_minutes: '',
  };
  if (assignmentType === 'Quiz') {
    base.quiz_questions = normalizeQuizQuestions(base).length > 0
      ? base.quiz_questions
      : [{ id: `q_${Date.now().toString(36)}`, prompt: '' }];
  }
  return base;
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
  defaultEventType = null,
  requireParentApprovalDefault = false,
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [assignmentType, setAssignmentType] = useState('Assignment');
  const [workSpec, setWorkSpec] = useState(() => buildDefaultWorkSpec('Assignment'));
  const [materialId, setMaterialId] = useState(null);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [subjectId, setSubjectId] = useState(null);
  const [unitTitle, setUnitTitle] = useState('');
  const [curriculumLessonId, setCurriculumLessonId] = useState(null);
  const [lessonLabel, setLessonLabel] = useState('');
  const [availableDate, setAvailableDate] = useState(null);
  const [dueDate, setDueDate] = useState(null);
  const [milestoneDueDate, setMilestoneDueDate] = useState(null);
  const [points, setPoints] = useState('100');
  const [rubricId, setRubricId] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showReleaseDateModal, setShowReleaseDateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');
  const [errors, setErrors] = useState({});

  const layout = useMemo(() => getAssignmentTypeLayout(assignmentType), [assignmentType]);
  const subjects = useSubjectsForAssignees(familyId, assigneeIds, defaultSubjectId);

  useEffect(() => {
    if (!visible) return;
    const initialType = eventTypeToDefaultAssignmentType(defaultEventType);
    setTitle(defaultTitle || '');
    setInstructions('');
    setAssignmentType(initialType);
    setWorkSpec(buildDefaultWorkSpec(initialType));
    setMaterialId(defaultMaterialId || null);
    setAssigneeIds(resolveDefaultAssigneeIds({ defaultChildIds, defaultChildId, familyMembers }));
    setSubjectId(defaultSubjectId || null);
    setUnitTitle('');
    setCurriculumLessonId(null);
    setLessonLabel('');
    const baseDate = defaultDate ? new Date(defaultDate) : null;
    setAvailableDate(baseDate);
    setDueDate(baseDate);
    setMilestoneDueDate(null);
    setPoints('100');
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
    defaultEventType,
    requireParentApprovalDefault,
    familyMembers,
  ]);

  useEffect(() => {
    setWorkSpec((prev) => ({
      ...buildDefaultWorkSpec(assignmentType),
      instructions: prev.instructions || '',
    }));
  }, [assignmentType]);

  const validate = useCallback((mode = 'assign') => {
    const next = {};
    if (!title.trim()) next.title = 'Title is required';
    if (!subjectId) next.subject = 'Subject is required';
    if (mode !== 'draft' && assigneeIds.length === 0) {
      next.assignee = 'Select at least one student';
    }
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    setValidationBanner(ok ? '' : 'Please complete required fields before saving.');
    return ok;
  }, [title, subjectId, assigneeIds]);

  const buildSavePayload = useCallback((saveMode, releaseDate = null) => ({
    familyId,
    title,
    childIds: assigneeIds,
    subjectId,
    instructions,
    assignmentType,
    workSpecInput: {
      ...workSpec,
      instructions,
      rubric_id: rubricId || null,
      points_possible: Number(points) || null,
    },
    availableDate: saveMode === 'schedule' ? releaseDate : availableDate,
    dueDate,
    gradingMode: 'points',
    materialIds: materialIdsFromSelection(materialId),
    allowResubmission: false,
    requireParentApproval: !!requireParentApprovalDefault,
    unitTitle,
    curriculumLessonId,
    lessonLabel,
    rubricId,
    points: Number(points) || null,
    milestoneDueDate,
    saveMode,
    releaseDate,
  }), [
    familyId,
    title,
    assigneeIds,
    subjectId,
    instructions,
    assignmentType,
    workSpec,
    rubricId,
    points,
    availableDate,
    dueDate,
    requireParentApprovalDefault,
    unitTitle,
    curriculumLessonId,
    lessonLabel,
    materialId,
    milestoneDueDate,
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

  const handleSaveDraft = useCallback(async () => {
    if (!validate('draft')) return;
    await persistAssignment('draft');
  }, [validate, persistAssignment]);

  const handleSchedule = useCallback(() => {
    if (!validate('schedule')) return;
    setShowReleaseDateModal(true);
  }, [validate]);

  const handleReleaseDateConfirm = useCallback(async (releaseDate) => {
    setShowReleaseDateModal(false);
    await persistAssignment('schedule', releaseDate);
  }, [persistAssignment]);

  const canSaveDraft = !!title.trim() && !!subjectId;
  const canAssign = canSaveDraft && assigneeIds.length > 0;

  const datePickerValue = useMemo(() => dueDate, [dueDate]);

  if (!visible) return null;

  const { primary } = layout;

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <CreateModalShell
          title="Assignment"
          onClose={onClose}
          validationBanner={validationBanner}
          maxWidth={CREATE_ASSIGNMENT_MODAL_MAX_WIDTH}
          footer={(
            <AssignmentCreateFooter
              onSchedule={handleSchedule}
              onSaveDraft={handleSaveDraft}
              onAssign={handleAssign}
              saving={submitting}
              assignDisabled={!canAssign}
              scheduleDisabled={!canAssign}
              draftDisabled={!canSaveDraft}
              onBlockedAction={() => validate('assign')}
            />
          )}
        >
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
              autoFocus
            />
            {errors.title ? <Text style={styles.errorTextSmall}>{errors.title}</Text> : null}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Type</Text>
            <ChipOptionGroup
              options={ASSIGNMENT_TYPES}
              value={assignmentType}
              onChange={setAssignmentType}
            />
          </View>

          {primary.instructions ? (
            <InstructionsEditor
              value={instructions}
              onChangeText={setInstructions}
              label={primary.instructionsLabel}
              placeholder={primary.instructionsPlaceholder}
            />
          ) : null}

          {primary.responseType ? (
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Response type</Text>
              <ChipOptionGroup
                options={QUESTION_RESPONSE_TYPES}
                value={workSpec.question_response_type || 'short_answer'}
                onChange={(id) => setWorkSpec((prev) => ({ ...prev, question_response_type: id }))}
              />
            </View>
          ) : null}

          {primary.quizBuilder ? (
            <View style={styles.formGroup}>
              <QuizQuestionsEditor workSpec={workSpec} onChange={setWorkSpec} />
            </View>
          ) : null}

          {primary.resources && familyId ? (
            <AssignmentResourceFields
              familyId={familyId}
              materialId={materialId}
              onMaterialChange={setMaterialId}
              onAddMaterial={() => setShowAddMaterial(true)}
            />
          ) : null}

          {primary.subject ? (
            <SubjectSelectField
              subjects={subjects}
              subjectId={subjectId}
              onSubjectChange={setSubjectId}
              label="Subject"
              required
              error={errors.subject}
            />
          ) : null}

          {primary.children ? (
            <FamilyMemberPicker
              familyMembers={familyMembers}
              selectedIds={assigneeIds}
              onChange={setAssigneeIds}
              label="Children"
              error={errors.assignee}
            />
          ) : null}

          {primary.dueDate ? (
            <SingleDateField
              label="Due date"
              date={dueDate}
              onDateChange={setDueDate}
              onOpenDatePicker={() => setDatePickerTarget('due')}
              compact
            />
          ) : null}

          {primary.points ? (
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Points</Text>
              <TextInput
                value={String(points ?? '')}
                onChangeText={(text) => setPoints(text.replace(/[^\d]/g, ''))}
                placeholder="100"
                placeholderTextColor={PLACEHOLDER}
                keyboardType="numeric"
                style={styles.fieldInput}
              />
            </View>
          ) : null}
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
          familyId={familyId}
          onClose={() => setShowAddMaterial(false)}
          onSaved={(material) => {
            if (material?.id) setMaterialId(material.id);
            setShowAddMaterial(false);
          }}
        />
      ) : null}
    </>
  );
}
