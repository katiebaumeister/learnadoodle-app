import React from 'react';
import EventAttachmentsField from './EventAttachmentsField';

export default function AssignmentResourceFields({
  familyId,
  materialId,
  onMaterialChange,
  onAddMaterial,
}) {
  if (!familyId) return null;

  return (
    <EventAttachmentsField
      familyId={familyId}
      selectedMaterialId={materialId}
      onMaterialChange={onMaterialChange}
      onAddNew={onAddMaterial}
      label="Attachment"
    />
  );
}
