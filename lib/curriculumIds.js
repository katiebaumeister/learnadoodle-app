/** True when value is a persisted DB uuid (curriculum_units / curriculum_lessons). */
export function isPersistedCurriculumId(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}
