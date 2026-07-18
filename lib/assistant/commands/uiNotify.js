/**
 * Broadcast planner UI patches after Doodle (or other non-UI) mutations.
 * Mirrors the CustomEvents used by planner/home checkmark handlers.
 */

export function notifyEventAttendancePatched(eventId, status = 'done', options = {}) {
  if (typeof window === 'undefined' || !eventId) return;
  const id = String(eventId).trim();
  if (!id) return;
  const normalized = String(status || 'done').trim().toLowerCase();
  const nextStatus =
    normalized === 'completed' || normalized === 'present' || normalized === 'done'
      ? 'done'
      : 'scheduled';

  window.dispatchEvent(
    new CustomEvent('eventAttendancePatched', {
      detail: { eventId: id, status: nextStatus },
    }),
  );

  if (options.refresh === false) return;

  // Soft refresh so secondary views stay warm without wiping optimistic state
  window.dispatchEvent(
    new CustomEvent('refreshCalendar', {
      detail: { skipCacheClear: true },
    }),
  );
  window.dispatchEvent(new CustomEvent('refreshSubjects'));
}

export function notifyEventPatched(patch) {
  if (typeof window === 'undefined' || !patch) return;
  window.dispatchEvent(new CustomEvent('eventPatched', { detail: { patch } }));
  window.dispatchEvent(
    new CustomEvent('refreshCalendar', {
      detail: { skipCacheClear: true },
    }),
  );
}
