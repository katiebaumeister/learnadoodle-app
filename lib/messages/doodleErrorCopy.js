/**
 * Keep raw Postgres / API errors out of the Messages UI.
 */

export function sanitizeDoodlePreviewText(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (/invalid input syntax for type uuid/i.test(t)) {
    return "Couldn't update the learning day";
  }
  if (/could not update|failed to update.*learning day/i.test(t)) {
    return "Couldn't update the learning day";
  }
  if (/permission denied|row-level security|jwt|auth/i.test(t) && t.length > 40) {
    return 'Something went wrong. Try again.';
  }
  if (/^[a-z_ ]+:/i.test(t) && /syntax|constraint|violat|null value/i.test(t)) {
    return 'Something went wrong. Try again.';
  }
  return t.slice(0, 80);
}

/**
 * @returns {{ message: string, actionLabel?: string, actionKind?: 'retry'|'choose_day' }}
 */
export function humanizeDoodleError(error) {
  const raw = String(error || '').trim();
  if (!raw) {
    return { message: 'Something went wrong. Please try again.', actionLabel: 'Retry', actionKind: 'retry' };
  }
  if (/invalid input syntax for type uuid/i.test(raw)) {
    return {
      message: "I couldn't update that learning day. Try selecting the day again.",
      actionLabel: 'Choose day',
      actionKind: 'choose_day',
    };
  }
  if (/could not update|failed to update/i.test(raw) && /learning day/i.test(raw)) {
    return {
      message: "I couldn't update that learning day. Try selecting the day again.",
      actionLabel: 'Choose day',
      actionKind: 'choose_day',
    };
  }
  if (raw.length > 120 || /syntax|constraint|violat|postgres|PGRST/i.test(raw)) {
    return {
      message: 'Something went wrong. Please try again.',
      actionLabel: 'Retry',
      actionKind: 'retry',
    };
  }
  return { message: raw, actionLabel: 'Retry', actionKind: 'retry' };
}
