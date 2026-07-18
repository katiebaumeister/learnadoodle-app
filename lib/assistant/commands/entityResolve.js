import { DOODLE_RESPONSE_TYPES } from './types.js';

export function resolveChildByName(name, children = []) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return { ok: false };
  const matches = (children || []).filter((c) => {
    const first = String(c.first_name || c.name || '').trim().toLowerCase();
    const full = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
    return first === needle || full === needle || first.startsWith(needle);
  });
  if (matches.length === 1) return { ok: true, child: matches[0] };
  if (matches.length > 1) {
    return {
      ok: false,
      clarification: {
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: `Which student did you mean by “${name}”?`,
        options: matches.map((c) => ({
          id: String(c.id),
          label: c.first_name || c.name || 'Student',
          value: String(c.id),
          field: 'childId',
        })),
      },
    };
  }
  return { ok: false };
}

export function resolveSubjectByName(name, subjects = []) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return { ok: false };
  const exact = (subjects || []).filter((s) => {
    const title = String(s.name || s.title || '').trim().toLowerCase();
    return title === needle;
  });
  const matches = exact.length
    ? exact
    : (subjects || []).filter((s) => {
      const title = String(s.name || s.title || '').trim().toLowerCase();
      return title.includes(needle);
    });
  if (matches.length === 1) return { ok: true, subject: matches[0] };
  if (matches.length > 1) {
    return {
      ok: false,
      clarification: {
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: `There are multiple subjects matching “${name}”. Choose one:`,
        options: matches.slice(0, 8).map((s) => ({
          id: String(s.id),
          label: s.name || s.title || 'Subject',
          value: String(s.id),
          field: 'subjectId',
        })),
      },
    };
  }
  return { ok: false };
}
