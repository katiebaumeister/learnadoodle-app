export function requireString(value, label) {
  const v = String(value || '').trim();
  if (!v) return { ok: false, error: `${label} is required` };
  return { ok: true, value: v };
}

export function requireHouseholdMatch(commandHouseholdId, ctx) {
  if (String(commandHouseholdId) !== String(ctx?.householdId)) {
    return { ok: false, error: 'Household mismatch.' };
  }
  return { ok: true };
}

export function newIdempotencyKey(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function toYmd(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return dateLike;
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDisplayDate(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return String(dateLike || '—');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDisplayDateTime(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return String(dateLike || '—');
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
