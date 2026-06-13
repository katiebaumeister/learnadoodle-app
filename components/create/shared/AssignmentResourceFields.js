import React from 'react';
import EventAttachmentsField from './EventAttachmentsField';

export default function AssignmentResourceFields({
  familyId,
  materialId,
  onMaterialChange,
  onAddMaterial,
  hideLabel = false,
}) {
  if (!familyId) return null;

  return (
    <EventAttachmentsField
      familyId={familyId}
      selectedMaterialId={materialId}
      onMaterialChange={onMaterialChange}
      onAddNew={onAddMaterial}
      label={hideLabel ? null : 'Attachment'}
    />
  );
}
