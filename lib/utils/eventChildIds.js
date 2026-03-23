/**
 * Resolve which child IDs an event applies to for UI (chips, filters).
 * Empty explicit assignment → treat as whole family (all non-archived children).
 */
export function getEventChildIdsForDisplay(event, familyChildren = []) {
  const ids = [];
  if (event?.child_id != null && event.child_id !== '') {
    ids.push(event.child_id);
  }
  if (Array.isArray(event?.child_ids) && event.child_ids.length > 0) {
    ids.push(...event.child_ids.filter((id) => id != null && id !== ''));
  }
  const explicit = [...new Set(ids)];
  if (explicit.length > 0) {
    return explicit;
  }
  return (familyChildren || [])
    .filter((c) => c && c.id != null && !c.archived)
    .map((c) => c.id);
}
