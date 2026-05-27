/**
 * Build a chronological list of help messages the learner sent (for "what did I ask?" UI).
 * Prefers structured help_message_log; falls back to parsing description blocks.
 */

/**
 * Normalize sender role from help-log entries.
 * Handles legacy/misclassified rows where sender_role may be incorrect.
 * @param {any} entry
 * @returns {'parent'|'child'|'unknown'}
 */
export function inferHelpSenderRole(entry) {
  const senderRoleRaw = String(entry?.sender_role || '').trim().toLowerCase();
  const reason = String(entry?.reason || '').trim().toLowerCase();
  const body = String(entry?.body || entry?.message || entry?.note || '').trim();
  const bodyLower = body.toLowerCase();

  if (senderRoleRaw === 'child' || senderRoleRaw === 'student') return 'child';
  if (senderRoleRaw === 'parent') {
    // Some older rows were logged as parent despite child-origin help markers.
    if ((reason && reason !== 'sent_assignment') || bodyLower.includes('[help from student')) {
      return 'child';
    }
    return 'parent';
  }
  if (reason === 'sent_assignment' || body === '[Sent assignment]') return 'parent';
  if (reason) return 'child';
  if (bodyLower.includes('[help from student')) return 'child';
  return 'unknown';
}

function parseDescriptionHelpBlocks(description) {
  if (!description || typeof description !== 'string') return [];
  const text = description.trim();
  if (!text.includes('[Help from student —')) return [];

  const parts = text
    .split(/(?=\[Help from student —)/)
    .filter((p) => p.trim().startsWith('[Help from student'));
  const out = [];
  for (const part of parts) {
    const m = part.match(/^\[Help from student — ([^\]]+)\]\s*\n?([\s\S]*)$/s);
    if (m) {
      out.push({
        id: `desc-${out.length}`,
        reason: m[1].trim(),
        note: (m[2] || '').trim(),
        at: null,
      });
    }
  }
  return out;
}

/**
 * @param {object|null} assignment — row with description, help_message_log, updated_at
 * @returns {{ id: string, reason: string, note: string, at: string|null }[]}
 */
export function getChildHelpMessageHistory(assignment) {
  if (!assignment) return [];

  const log = assignment.help_message_log;
  if (Array.isArray(log) && log.length > 0) {
    const childRows = log
      .filter(
        (m) =>
          m &&
          typeof m === 'object' &&
          inferHelpSenderRole(m) === 'child'
      )
      .map((m, i) => ({
        id: m.id != null ? String(m.id) : `log-${i}`,
        reason:
          (m.reason && String(m.reason).trim()) ||
          extractReasonFromHeader(m.body) ||
          'Help request',
        note: stripHelpHeader(m.body || ''),
        at: m.created_at ? String(m.created_at) : null,
      }))
      .sort((a, b) => {
        const ta = a.at ? new Date(a.at).getTime() : 0;
        const tb = b.at ? new Date(b.at).getTime() : 0;
        return ta - tb;
      });
    if (childRows.length > 0) return childRows;
  }

  const parsed = parseDescriptionHelpBlocks(assignment.description || '');
  if (parsed.length === 0) return [];

  const fallbackAt = assignment.updated_at ? String(assignment.updated_at) : null;
  return parsed.map((p, i) => ({
    ...p,
    /** Description-only rows lack per-message time; show last-updated on the most recent block only */
    at: i === parsed.length - 1 ? fallbackAt : null,
  }));
}

function extractReasonFromHeader(body) {
  if (!body || typeof body !== 'string') return '';
  const m = body.match(/\[Help from student — ([^\]]+)\]/);
  return m ? m[1].trim() : '';
}

function stripHelpHeader(body) {
  if (!body || typeof body !== 'string') return body || '';
  return body.replace(/^\[Help from student — [^\]]+\]\s*\n?/, '').trim();
}

/**
 * Assignment description often embeds `[Help from student — …]` blocks. For submission review UI,
 * show only the non–help-request body (not child help threads).
 */
export function descriptionWithoutChildHelpBlocks(description) {
  if (!description || typeof description !== 'string') return '';
  const parts = description.split(/(?=\[Help from student —)/);
  const kept = parts.filter((p) => !p.trim().startsWith('[Help from student'));
  return kept.join('\n').trim();
}

export function formatHelpMessageAt(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}
