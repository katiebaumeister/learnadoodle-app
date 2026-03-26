/**
 * Parse the student's reason from assignment help flow (description or help_message_log).
 */
export function extractStudentHelpReason(assignment) {
  if (!assignment) return 'Help requested';
  const log = assignment.help_message_log;
  if (log && Array.isArray(log) && log.length > 0) {
    const last = log[log.length - 1];
    if (last && typeof last === 'object') {
      if (last.reason && String(last.reason).trim()) return String(last.reason).trim();
      if (last.body && String(last.body).trim()) return String(last.body).trim().slice(0, 120);
    }
  }
  const desc = assignment.description || '';
  const m = desc.match(/\[Help from student — ([^\]]+)\]/);
  if (m) return m[1].trim();
  return 'Help requested';
}

export function formatDueShort(dueDateStr) {
  if (!dueDateStr) return '';
  const d = new Date(dueDateStr);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (t.getTime() === today.getTime()) return 'Due today';
  if (t.getTime() === tomorrow.getTime()) return 'Due tomorrow';
  return `Due ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}
