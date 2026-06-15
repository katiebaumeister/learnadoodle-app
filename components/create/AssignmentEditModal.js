/**
 * Assignment edit modal — mirrors create modal with delete + view submissions.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useToast } from '../Toast';
import CreateModalShell from './shared/CreateModalShell';
import InstructionsEditor from './shared/InstructionsEditor';
import AssignmentResourceFields from './shared/AssignmentResourceFields';
import FamilyMemberPicker, { resolveDefaultAssigneeIds } from './shared/FamilyMemberPicker';
import SubjectSelectField from './shared/SubjectSelectField';
import ClassworkPlacementFields from './shared/ClassworkPlacementFields';
import { SingleDateField } from './shared/ScheduleDateFields';
import { SectionHeading } from './shared/assignmentFormParts';
import { Users } from 'lucide-react';
import { ModalFooter } from '../ui/ModalFooter';
import AssignmentSubmissionsModal from './AssignmentSubmissionsModal';
import StudentResponseSection from './assignment/StudentResponseSection';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import AddMaterialModal from '../materials/AddMaterialModal';
import { nestedAddMaterialModalProps } from './shared/nestedAddMaterialModalProps';
import { createModalStyles as styles, PLACEHOLDER, CREATE_ASSIGNMENT_MODAL_MAX_WIDTH } from './shared/createModalStyles';
import { useFamilySubjects } from './shared/useSubjectsForAssignees';
import {
  filterMembersForSubject,
  findSubjectById,
  pruneAssigneesForSubject,
  validateSubjectAssigneeCombo,
} from '../../lib/create/assignmentAssigneeHelpers';
import { defaultWorkSpec } from '../../lib/workEventHelpers';
import { parseStudentResponseType } from '../../lib/studentResponseTypes';
import {
  assignmentEditFormFromEvent,
  createPlannerEventForAssignment,
  deleteAssignmentAndEvent,
  fetchEventForAssignmentEdit,
  resolveLinkedEventIdFromAssignment,
  updateAssignmentFromEditForm,
} from '../../lib/create/assignmentEditHelpers';

function buildDefaultWorkSpec() {
  return {
    ...defaultWorkSpec('Assignment'),
    student_response_type: null,
    quiz_questions: [],
    require_final_deliverable: false,
    allow_student_replies: true,
    allow_editing: true,
    auto_grade: true,
    presentation_required: false,
    exam_open_book: true,
    exam_time_limit_minutes: '',
    submission_methods: {
      text: false,
      file: false,
      photo: false,
      link: false,
      quiz: false,
      parent_checkoff: false,
    },
  };
}

export default function AssignmentEditModal({
  visible,
  onClose,
  onSaved,
  onDeleted,
  familyId,
  familyMembers = [],
  assignment = null,
  linkedEvent = null,
  initialView = 'edit',
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [eventRow, setEventRow] = useState(linkedEvent);
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
  const [dueDate, setDueDate] = useState(null);
  const [points, setPoints] = useState('');
  const [rubricId, setRubricId] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showSubmissions, setShowSubmissions] = useState(initialView === 'submissions');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');
  const [errors, setErrors] = useState({});

  const subjects = useFamilySubjects(familyId);
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
  const eventId = eventRow?.id || resolveLinkedEventIdFromAssignment(assignment);

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
    if (!parseStudentResponseType(workSpec?.student_response_type)) return;
    scrollContentPanelDown();
  }, [workSpec?.student_response_type, scrollContentPanelDown]);

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      setShowSubmissions(false);
      return;
    }
    if (wasVisibleRef.current) return;
    wasVisibleRef.current = true;
    setShowSubmissions(initialView === 'submissions');

    let cancelled = false;
    const hydrate = async () => {
      setLoading(true);
      try {
        let loadedEvent = linkedEvent;
        const resolvedEventId = loadedEvent?.id || resolveLinkedEventIdFromAssignment(assignment);
        if (resolvedEventId) {
          const fetched = await fetchEventForAssignmentEdit(resolvedEventId);
          if (fetched) loadedEvent = fetched;
        }
        if (cancelled) return;
        setEventRow(loadedEvent);

        const form = assignmentEditFormFromEvent(loadedEvent, assignment);
        setTitle(form.title || assignment?.title || '');
        setInstructions(form.instructions || assignment?.description || '');
        setWorkSpec({
          ...buildDefaultWorkSpec(),
          ...form.workSpec,
          student_response_type: form.workSpec?.student_response_type || null,
        });
        setMaterialIds(form.materialIds || []);
        setAssigneeIds(
          form.assigneeIds.length > 0
            ? form.assigneeIds
            : resolveDefaultAssigneeIds({
              defaultChildId: assignment?.child_id || null,
              familyMembers,
            }),
        );
        setSubjectId(form.subjectId || assignment?.related_subject || null);
        setUnitId(form.unitId);
        setUnitTitle(form.unitTitle);
        setCurriculumLessonId(form.curriculumLessonId);
        setLessonLabel(form.lessonLabel);
        setDueDate(form.dueDate || (assignment?.due_date ? new Date(`${String(assignment.due_date).slice(0, 10)}T12:00:00`) : null));
        setPoints(form.points || '');
        setRubricId(form.rubricId);
        setValidationBanner('');
        setErrors({});
      } catch (err) {
        if (!cancelled) {
          toast.push(err?.message || 'Could not load assignment', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [visible, assignment, linkedEvent, initialView, familyMembers, toast]);

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

  const validate = useCallback(() => {
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

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      let resolvedEventId = eventId;
      let resolvedEvent = eventRow;
      if (!resolvedEventId && assignment?.id) {
        if (!dueDate) {
          toast.push('Add a due date to show this assignment on the planner', 'error');
          return;
        }
        resolvedEvent = await createPlannerEventForAssignment({
          familyId,
          assignment,
          title,
          childIds: assigneeIds,
          subjectId,
          instructions,
          workSpecInput: workSpec,
          dueDate,
          unitTitle,
          curriculumLessonId,
          lessonLabel,
        });
        resolvedEventId = resolvedEvent?.id;
        setEventRow(resolvedEvent);
      }
      if (!resolvedEventId) {
        toast.push('Could not save assignment', 'error');
        return;
      }
      const updated = await updateAssignmentFromEditForm({
        eventId: resolvedEventId,
        familyId,
        title,
        childIds: assigneeIds,
        subjectId,
        instructions,
        workSpecInput: workSpec,
        dueDate,
        materialIds,
        points: Number(points) || null,
        rubricId,
        unitId,
        unitTitle,
        curriculumLessonId,
        lessonLabel,
        assignment,
      });
      toast.push('Assignment updated', 'success');
      onSaved?.(updated);
      onClose?.();
    } catch (err) {
      toast.push(err?.message || 'Failed to save assignment', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [
    validate,
    eventId,
    eventRow,
    familyId,
    title,
    assigneeIds,
    subjectId,
    instructions,
    workSpec,
    dueDate,
    materialIds,
    points,
    rubricId,
    unitId,
    unitTitle,
    curriculumLessonId,
    lessonLabel,
    assignment,
    onSaved,
    onClose,
    toast,
  ]);

  const confirmDelete = useCallback(() => {
    if (!eventId || deleting) return;
    const runDelete = async () => {
      setDeleting(true);
      try {
        await deleteAssignmentAndEvent({
          eventId,
          familyId,
          subjectId,
        });
        toast.push('Assignment deleted', 'success');
        onDeleted?.(eventId);
        onClose?.();
      } catch (err) {
        toast.push(err?.message || 'Failed to delete assignment', 'error');
      } finally {
        setDeleting(false);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete this assignment? Students will no longer see it.')) {
        runDelete();
      }
      return;
    }
    Alert.alert(
      'Delete assignment',
      'Delete this assignment? Students will no longer see it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: runDelete },
      ],
    );
  }, [eventId, deleting, familyId, subjectId, onDeleted, onClose, toast]);

  const handleReviewed = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
      window.dispatchEvent(new CustomEvent('refreshRightRail'));
      window.dispatchEvent(new CustomEvent('refreshCalendar'));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
    }
  }, []);

  const canSave = !!title.trim()
    && !!parseStudentResponseType(workSpec?.student_response_type);
  const datePickerValue = useMemo(() => dueDate, [dueDate]);

  if (!visible) return null;

  if (initialView === 'submissions' && showSubmissions) {
    return (
      <AssignmentSubmissionsModal
        visible
        onClose={onClose}
        onReviewed={handleReviewed}
        familyId={familyId}
        familyMembers={familyMembers}
        linkedEvent={eventRow}
        assignment={assignment}
        eventId={eventId}
      />
    );
  }

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
            <ModalFooter
              mode="edit"
              primaryLabel={submitting ? 'Saving…' : 'Save changes'}
              destructiveLabel="Delete assignment"
              onCancel={onClose}
              onDelete={confirmDelete}
              onPrimary={handleSave}
              onBlockedPrimary={() => validate()}
              secondaryActions={[
                {
                  key: 'view-submissions',
                  label: 'View submissions',
                  icon: Users,
                  onPress: () => setShowSubmissions(true),
                },
              ]}
              accent="#9ECFFB"
              disabled={submitting || deleting}
              visuallyDisabled={!canSave}
              loading={submitting || deleting}
            />
          )}
        >
          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#9ECFFB" />
            </View>
          ) : (
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
                    <Text style={styles.fieldHint}>
                      Due date places this assignment on your planner.
                    </Text>

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
          )}
        </CreateModalShell>
      </Modal>

      {showSubmissions ? (
        <AssignmentSubmissionsModal
          visible
          onClose={() => setShowSubmissions(false)}
          onReviewed={handleReviewed}
          familyId={familyId}
          familyMembers={familyMembers}
          linkedEvent={eventRow}
          assignment={assignment}
          eventId={eventId}
        />
      ) : null}

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
