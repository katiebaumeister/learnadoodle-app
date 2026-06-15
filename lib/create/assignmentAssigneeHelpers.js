import { parseChildIds } from '../services/subjectsClient';

/** Child IDs linked to a subject; null means all family children. */
export function subjectChildIds(subject) {
  if (!subject) return null;
  const ids = parseChildIds(subject.child_id || '');
  return ids.length > 0 ? ids.map(String) : null;
}

export function findSubjectById(subjects, subjectId) {
  if (!subjectId) return null;
  return (subjects || []).find((row) => String(row.id) === String(subjectId)) || null;
}

export function isChildEligibleForSubject(childId, subject) {
  if (!subject || childId == null || childId === '') return true;
  const allowed = subjectChildIds(subject);
  if (allowed === null) return true;
  return allowed.includes(String(childId));
}

export function filterMembersForSubject(members, subject, { includeIds = [] } = {}) {
  const list = Array.isArray(members) ? members : [];
  if (!subject) return list;
  const allowed = subjectChildIds(subject);
  if (allowed === null) return list;
  const allowedSet = new Set(allowed);
  const includeSet = new Set((includeIds || []).map(String));
  return list.filter(
    (member) => allowedSet.has(String(member.id)) || includeSet.has(String(member.id)),
  );
}

export function pruneAssigneesForSubject(assigneeIds, subject) {
  if (!subject || !Array.isArray(assigneeIds)) return assigneeIds || [];
  const allowed = subjectChildIds(subject);
  if (allowed === null) return assigneeIds;
  const allowedSet = new Set(allowed);
  return assigneeIds.filter((id) => allowedSet.has(String(id)));
}

export function validateSubjectAssigneeCombo(subjectId, assigneeIds, subjects) {
  if (!subjectId || !Array.isArray(assigneeIds) || assigneeIds.length === 0) {
    return { ok: true };
  }
  const subject = findSubjectById(subjects, subjectId);
  if (!subject) return { ok: true };
  const allowed = subjectChildIds(subject);
  if (allowed === null) return { ok: true };
  const invalid = assigneeIds.filter((id) => !allowed.includes(String(id)));
  if (invalid.length === 0) return { ok: true };
  return {
    ok: false,
    message: 'Select only students enrolled in this subject',
  };
}
