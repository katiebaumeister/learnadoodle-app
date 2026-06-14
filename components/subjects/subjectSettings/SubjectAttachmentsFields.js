import React from 'react';
import EventAttachmentsField from '../../create/shared/EventAttachmentsField';
import { SectionHeading } from '../../create/shared/assignmentFormParts';
import {
  materialEligibleForSyllabusPicker,
  materialEligibleForLessonPicker,
} from '../../../lib/services/subjectMaterialLinks';

export default function SubjectAttachmentsFields({
  familyId,
  syllabusMaterialId,
  lessonPlanMaterialId,
  onSyllabusChange,
  onLessonPlanChange,
  onAddSyllabus,
  onAddLessonPlan,
}) {
  if (!familyId) return null;

  return (
    <>
      <SectionHeading>Attachments</SectionHeading>
      <EventAttachmentsField
        familyId={familyId}
        selectedMaterialId={syllabusMaterialId}
        onMaterialChange={onSyllabusChange}
        onAddNew={onAddSyllabus}
        label="Syllabus"
        placeholder="Select syllabus…"
        materialFilter={materialEligibleForSyllabusPicker}
      />
      <EventAttachmentsField
        familyId={familyId}
        selectedMaterialId={lessonPlanMaterialId}
        onMaterialChange={onLessonPlanChange}
        onAddNew={onAddLessonPlan}
        label="Lesson plan"
        placeholder="Select lesson plan…"
        materialFilter={materialEligibleForLessonPicker}
      />
    </>
  );
}
