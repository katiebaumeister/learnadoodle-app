import { supabase } from '../supabase';
import { deriveRoleFromTags, DOCUMENT_ROLES } from '../docs/roles';

export function materialEligibleForSyllabusPicker(material) {
  const role = deriveRoleFromTags(material?.tags);
  return role == null || role === DOCUMENT_ROLES.SYLLABUS;
}

export function materialEligibleForLessonPicker(material) {
  const role = deriveRoleFromTags(material?.tags);
  return role == null || role === DOCUMENT_ROLES.LESSON_PLAN;
}

export async function loadSubjectAttachmentIds(subjectId, familyId) {
  if (!subjectId || !familyId) {
    return { syllabusMaterialId: null, lessonPlanMaterialId: null };
  }

  const { data, error } = await supabase
    .from('materials')
    .select('id, tags')
    .eq('subject_id', subjectId)
    .eq('family_id', familyId)
    .is('deleted_at', null);

  if (error) throw error;

  let syllabusMaterialId = null;
  let lessonPlanMaterialId = null;

  for (const row of data || []) {
    const role = deriveRoleFromTags(row.tags);
    if (role === DOCUMENT_ROLES.SYLLABUS) {
      syllabusMaterialId = row.id;
    } else if (role === DOCUMENT_ROLES.LESSON_PLAN) {
      lessonPlanMaterialId = row.id;
    }
  }

  return { syllabusMaterialId, lessonPlanMaterialId };
}

export async function saveSubjectAttachmentLinks({
  familyId,
  subjectId,
  syllabusMaterialId,
  lessonPlanMaterialId,
}) {
  if (!familyId || !subjectId) return;

  const pickIds = [syllabusMaterialId, lessonPlanMaterialId].filter(Boolean);
  const uniquePickIds = [...new Set(pickIds.map(String))];

  const { data: linkedRows, error: linkedErr } = await supabase
    .from('materials')
    .select('id, tags')
    .eq('subject_id', subjectId)
    .eq('family_id', familyId)
    .is('deleted_at', null);

  if (linkedErr) throw linkedErr;

  const toClear = (linkedRows || [])
    .filter((row) => {
      const role = deriveRoleFromTags(row.tags);
      return role === DOCUMENT_ROLES.SYLLABUS || role === DOCUMENT_ROLES.LESSON_PLAN;
    })
    .map((row) => row.id);

  if (toClear.length) {
    const { error: clearErr } = await supabase
      .from('materials')
      .update({ subject_id: null })
      .in('id', toClear);
    if (clearErr) throw clearErr;
  }

  if (uniquePickIds.length > 0) {
    const { error: materialUpdateError } = await supabase
      .from('materials')
      .update({ subject_id: subjectId })
      .in('id', uniquePickIds);

    if (materialUpdateError) throw materialUpdateError;
  }
}
