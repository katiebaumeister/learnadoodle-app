import React from 'react';
import EventAttachmentsField from '../../create/shared/EventAttachmentsField';
import { SectionHeading } from '../../create/shared/assignmentFormParts';

export default function SubjectAttachmentsFields({
  familyId,
  syllabusMaterialId,
  lessonPlanMaterialId,
  onSyllabusChange,
  onLessonPlanChange,
  onAddSyllabus,
}) {
  if (!familyId) return null;

  // Combined into one picker: "Syllabus or lesson plan". We hold the selection in
  // the syllabus slot and clear the lesson slot; the link layer re-categorizes by
  // the material's own type when reloading, so either kind round-trips correctly.
  const selectedMaterialId = syllabusMaterialId || lessonPlanMaterialId || null;

  return (
    <>
      <SectionHeading>Attachments</SectionHeading>
      <EventAttachmentsField
        familyId={familyId}
        selectedMaterialId={selectedMaterialId}
        onMaterialChange={(materialId) => {
          onSyllabusChange?.(materialId || null);
          onLessonPlanChange?.(null);
        }}
        onAddNew={onAddSyllabus}
        label="Syllabus or lesson plan"
        placeholder="Select syllabus or lesson plan…"
      />
    </>
  );
}
