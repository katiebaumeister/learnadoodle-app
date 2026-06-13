import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity } from 'react-native';
import { Settings2 } from 'lucide-react';
import { ModalSectionCard } from '../../ui/ModalSectionCard';
import FamilyMemberPicker from '../shared/FamilyMemberPicker';
import SubjectSelectField from '../shared/SubjectSelectField';
import { SingleDateField } from '../shared/ScheduleDateFields';
import RubricSelectField from '../shared/RubricSelectField';
import { CheckboxRow } from '../shared/assignmentFormParts';
import { createModalStyles as styles, PLACEHOLDER } from '../shared/createModalStyles';
import { fetchSubjectCurriculumEventsStructure } from '../../../lib/services/curriculumClient';

function OptionChip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.dropdownOption, active && styles.dropdownOptionActive]}>
      <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AssignmentMoreOptionsSection({
  expanded,
  onExpandedChange,
  layout,
  familyId,
  subjects,
  subjectId,
  onSubjectChange,
  subjectError,
  familyMembers,
  assigneeIds,
  onAssigneeChange,
  assigneeError,
  rubricId,
  onRubricChange,
  enabled = true,
  unitTitle,
  onUnitTitleChange,
  curriculumLessonId,
  onCurriculumLessonChange,
  lessonLabel,
  onLessonLabelChange,
  availableDate,
  onAvailableDateChange,
  onOpenAvailableDatePicker,
  workSpec,
  onWorkSpecChange,
  milestoneDueDate,
  onMilestoneDueDateChange,
  onOpenMilestoneDatePicker,
}) {
  const [curriculumUnits, setCurriculumUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const { more } = layout;
  const patch = (partial) => onWorkSpecChange?.({ ...workSpec, ...partial });

  useEffect(() => {
    if (!familyId || !subjectId || !more.unit) {
      setCurriculumUnits([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingUnits(true);
      try {
        const { data, error } = await fetchSubjectCurriculumEventsStructure(familyId, subjectId, null);
        if (cancelled) return;
        setCurriculumUnits(error ? [] : (Array.isArray(data?.units) ? data.units : []));
      } finally {
        if (!cancelled) setLoadingUnits(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, subjectId, more.unit]);

  const unitLessons = useMemo(() => {
    const unit = curriculumUnits.find((u) => String(u?.title || '').trim() === String(unitTitle || '').trim());
    return Array.isArray(unit?.lessons) ? unit.lessons : [];
  }, [curriculumUnits, unitTitle]);

  return (
    <ModalSectionCard
      Icon={Settings2}
      title="More options"
      subtitle="Unit and other advanced settings"
      expanded={expanded}
      onPress={() => onExpandedChange?.(!expanded)}
      accent="#64748B"
      variant="simple"
    >
      <View style={styles.accordionContent}>
        {more.subject ? (
          <SubjectSelectField
            subjects={subjects}
            subjectId={subjectId}
            onSubjectChange={onSubjectChange}
            label="Subject"
            required
            error={subjectError}
          />
        ) : null}

        {more.children ? (
          <FamilyMemberPicker
            familyMembers={familyMembers}
            selectedIds={assigneeIds}
            onChange={onAssigneeChange}
            label="Children"
            error={assigneeError}
          />
        ) : null}

        {more.rubric && familyId ? (
          <RubricSelectField
            familyId={familyId}
            rubricId={rubricId}
            onRubricChange={onRubricChange}
            enabled={enabled}
          />
        ) : null}

        {more.unit && subjectId ? (
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Unit</Text>
            {loadingUnits ? (
              <Text style={{ fontSize: 13, color: '#6b7280' }}>Loading units…</Text>
            ) : curriculumUnits.length === 0 ? (
              <Text style={{ fontSize: 13, color: '#6b7280' }}>No units in curriculum yet</Text>
            ) : (
              <View style={styles.modeChipRow}>
                <OptionChip
                  label="None"
                  active={!unitTitle}
                  onPress={() => {
                    onUnitTitleChange?.('');
                    onCurriculumLessonChange?.(null);
                    onLessonLabelChange?.('');
                  }}
                />
                {curriculumUnits.map((unit) => {
                  const label = String(unit?.title || '').trim() || 'Untitled unit';
                  return (
                    <OptionChip
                      key={label}
                      label={label}
                      active={unitTitle === label}
                      onPress={() => {
                        onUnitTitleChange?.(label);
                        onCurriculumLessonChange?.(null);
                        onLessonLabelChange?.('');
                      }}
                    />
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {more.lesson && unitTitle && unitLessons.length > 0 ? (
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Lesson</Text>
            <View style={styles.modeChipRow}>
              <OptionChip
                label="None"
                active={!curriculumLessonId}
                onPress={() => {
                  onCurriculumLessonChange?.(null);
                  onLessonLabelChange?.('');
                }}
              />
              {unitLessons.map((lesson) => {
                const label = String(lesson?.title || '').trim();
                if (!label) return null;
                return (
                  <OptionChip
                    key={String(lesson?.id || label)}
                    label={label}
                    active={String(curriculumLessonId) === String(lesson?.id)}
                    onPress={() => {
                      onCurriculumLessonChange?.(lesson?.id || null);
                      onLessonLabelChange?.(label);
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {more.availabilityDate ? (
          <SingleDateField
            label="Available on"
            date={availableDate}
            onDateChange={onAvailableDateChange}
            onOpenDatePicker={onOpenAvailableDatePicker}
          />
        ) : null}

        {more.questionSettings ? (
          <View style={styles.formGroup}>
            <CheckboxRow
              label="Allow student replies"
              checked={workSpec?.allow_student_replies !== false}
              onChange={(value) => patch({ allow_student_replies: value })}
            />
            <CheckboxRow
              label="Allow editing"
              checked={workSpec?.allow_editing !== false}
              onChange={(value) => patch({ allow_editing: value })}
            />
          </View>
        ) : null}

        {more.quizSettings ? (
          <View style={[styles.inlineSwitchRow, styles.formGroup]}>
            <Text style={styles.fieldLabel}>Auto-grade</Text>
            <Switch
              value={workSpec?.auto_grade !== false}
              onValueChange={(value) => patch({ auto_grade: value })}
            />
          </View>
        ) : null}

        {more.projectSettings ? (
          <>
            <SingleDateField
              label="Milestone due date"
              date={milestoneDueDate}
              onDateChange={onMilestoneDueDateChange}
              onOpenDatePicker={onOpenMilestoneDatePicker}
            />
            <View style={[styles.inlineSwitchRow, styles.formGroup]}>
              <Text style={styles.fieldLabel}>Presentation required</Text>
              <Switch
                value={!!workSpec?.presentation_required}
                onValueChange={(value) => patch({ presentation_required: value })}
              />
            </View>
          </>
        ) : null}

        {more.examSettings ? (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Time limit (minutes)</Text>
              <TextInput
                value={String(workSpec?.exam_time_limit_minutes ?? '')}
                onChangeText={(text) => patch({ exam_time_limit_minutes: text.replace(/[^\d]/g, '') })}
                placeholder="Optional"
                placeholderTextColor={PLACEHOLDER}
                keyboardType="numeric"
                style={styles.fieldInput}
              />
            </View>
            <View style={[styles.inlineSwitchRow, styles.formGroup]}>
              <Text style={styles.fieldLabel}>Open book</Text>
              <Switch
                value={workSpec?.exam_open_book !== false}
                onValueChange={(value) => patch({ exam_open_book: value })}
              />
            </View>
          </>
        ) : null}
      </View>
    </ModalSectionCard>
  );
}
