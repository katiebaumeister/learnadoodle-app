export function resolveEventSubjectId(event) {
  if (!event) return null;
  const raw = event.subject_id || event.subjectId || event?.data?.subject_id;
  return raw != null ? String(raw).trim() : null;
}

export function resolveEventSubjectName(event) {
  if (!event) return null;
  const name = event.subject_name || event.subjectName || event.subject || event?.data?.subject_name;
  return name != null ? String(name).trim() : null;
}
