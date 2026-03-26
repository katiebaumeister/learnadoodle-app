/** Whether an assignment row links to the given calendar event (jsonb array or plain array from API). */
export function assignmentRowLinksEventId(row, eventId) {
  if (!row || eventId == null) return false;
  const want = String(eventId);
  const raw = row.linked_event_ids;
  if (raw == null) return false;
  if (Array.isArray(raw)) return raw.some((x) => String(x) === want);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.some((x) => String(x) === want);
    } catch {
      return false;
    }
  }
  return false;
}
