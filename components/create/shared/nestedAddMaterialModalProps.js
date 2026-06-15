import { NESTED_OVER_PARENT_MODAL_Z } from '../../hooks/useModalStackElevation';

/**
 * Shared AddMaterialModal props when opened from assignment / event create modals
 * so the nested sheet matches the Materials library modal (children, subjects, defaults).
 */
export function nestedAddMaterialModalProps({
  familyId,
  familyMembers = [],
  subjectId = null,
  assigneeIds = [],
  subjects = [],
}) {
  const childIds = Array.isArray(assigneeIds)
    ? assigneeIds.filter((id) => id != null && String(id).trim() !== '')
    : [];

  return {
    familyId,
    children: familyMembers,
    defaultSubjectId: subjectId || null,
    defaultChildIds: childIds,
    allSubjects: Array.isArray(subjects) ? subjects : [],
    stackZIndex: NESTED_OVER_PARENT_MODAL_Z,
  };
}
