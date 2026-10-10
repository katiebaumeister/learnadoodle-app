/**
 * Phase 4 — cross-subject themed project week → confirmable BATCH learning days.
 */

import { DOODLE_COMMAND_TYPES, DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { newIdempotencyKey } from './commandUtils.js';
import { resolveChildByName } from './entityResolve.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';
import { getCommand } from './registry.js';

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

function toLocalYmd(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekMonday(from = new Date()) {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toLocalYmd(d);
}

function addDaysYmd(ymd, delta) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return toLocalYmd(d);
}

/** “ocean-themed week” / “project week about space” / “cross-subject project” */
export function isThemeProjectWeekIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|explain)\b/.test(lower)) return false;
  return (
    /\b(project\s+week|themed\s+week|theme\s+week|cross[- ]subject)\b/.test(lower)
    || (/\b(ocean|space|farm|forest|community|weather|ancient|medieval)\b/.test(lower)
      && /\b(week|project|theme|across\s+subjects?)\b/.test(lower))
    || /\b(plan|build|create|make)\b/.test(lower)
      && /\b(themed|theme)\b/.test(lower)
      && /\b(week|project)\b/.test(lower)
  );
}

export function extractThemeFromMessage(message) {
  const quoted = String(message || '').match(/["']([^"']{2,40})["']/);
  if (quoted) return quoted[1].trim();
  const about = String(message || '').match(
    /\b(?:about|on|theme(?:d)?(?:\s+week)?(?:\s+of)?|project\s+week(?:\s+on)?)\s+([A-Za-z][A-Za-z0-9 &/-]{1,40}?)(?:\s+for\s|\s+week\b|\s*$|[.?!])/i,
  );
  if (about) {
    const t = about[1].trim().replace(/-themed$/i, '').replace(/\s+themed$/i, '');
    if (!/^(a|an|the|week|project|cross)$/i.test(t)) return t;
  }
  const hyphen = String(message || '').match(/\b([A-Za-z][A-Za-z0-9-]{1,30})-themed\b/i);
  if (hyphen) return hyphen[1].replace(/-/g, ' ');
  const known = String(message || '').match(
    /\b(ocean|space|farm|forest|community|weather|dinosaurs?|ancient\s+egypt|medieval)\b/i,
  );
  if (known) return known[1];
  return null;
}

/**
 * Build Mon–Fri (or up to N subjects) learning_day.create commands for a theme.
 */
export function buildThemeWeekCommands({
  theme,
  subjects = [],
  childIds = [],
  householdId,
  weekStartYmd,
} = {}) {
  const start = weekStartYmd || startOfWeekMonday(new Date());
  const picked = (subjects || []).slice(0, 5);
  const commands = [];
  const preview = [];
  picked.forEach((subject, index) => {
    const date = addDaysYmd(start, index); // Mon..Fri
    const subjectName = subject.name || subject.title || 'Subject';
    const title = `${theme} — ${subjectName}`;
    const command = {
      type: DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE,
      householdId,
      subjectId: String(subject.id),
      subjectName,
      childIds: childIds.map(String),
      date,
      dates: [date],
      title,
      createLesson: true,
      lessonTitle: title,
      description: `Cross-subject project week: explore “${theme}” in ${subjectName}.`,
    };
    commands.push(command);
    const handler = getCommand(DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE);
    const fields = handler?.preview ? handler.preview(command) : [];
    preview.push({
      title,
      description: fields.map((f) => `${f.label}: ${f.value}`).join(' · ') || date,
      commandIndex: index,
    });
  });
  return { commands, preview, weekStartYmd: start };
}

export async function prepareThemeProjectWeek(
  message,
  ctx,
  roster = {},
  overrides = {},
  opts = {},
) {
  let theme = overrides.theme || extractThemeFromMessage(message);
  if (!theme) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What theme should this project week use?',
      options: ['Ocean', 'Space', 'Forest', 'Community', 'Weather'].map((t) => ({
        id: t.toLowerCase(),
        label: t,
        value: t,
        field: 'theme',
      })),
    }), {
      intent: 'project.theme_week',
      field: 'theme',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  let childIds = overrides.childIds || ctx?.selectedChildIds || [];
  const forMatch = String(message || '').match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if ((!childIds || !childIds.length) && forMatch) {
    const resolved = resolveChildByName(forMatch[1], roster.children || []);
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'project.theme_week',
        field: 'childId',
        originalMessage: message,
        draft: { ...overrides, theme },
      });
    }
    if (resolved.ok) childIds = [String(resolved.child.id)];
  }
  if (!childIds.length && (roster.children || []).length === 1) {
    childIds = [String(roster.children[0].id)];
  }
  if (!childIds.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student is this project week for?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'project.theme_week',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, theme },
    });
  }

  const subjects = (roster.subjects || []).slice(0, 5);
  if (!subjects.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: 'Add at least one subject first, then ask me to plan a themed project week.',
      links: [{ label: 'Open Learning', href: '/learning' }],
    });
  }

  let weekStart = overrides.weekStartYmd || null;
  if (!weekStart) {
    const { resolveFlexibleDay } = await import('./intentPreparers.js');
    if (/\bthis\s+week\b/i.test(message)) weekStart = startOfWeekMonday(new Date());
    else if (/\bnext\s+week\b/i.test(message)) {
      weekStart = addDaysYmd(startOfWeekMonday(new Date()), 7);
    } else {
      const ymd = resolveFlexibleDay(message, new Date());
      if (ymd && /\b(monday|week)\b/i.test(message)) weekStart = startOfWeekMonday(new Date(`${ymd}T12:00:00`));
    }
  }
  if (!weekStart) weekStart = addDaysYmd(startOfWeekMonday(new Date()), 7); // default next week

  const { commands, preview } = buildThemeWeekCommands({
    theme,
    subjects,
    childIds,
    householdId: ctx?.householdId,
    weekStartYmd: weekStart,
  });

  meterDoodleAiUsage({
    familyId: ctx?.householdId,
    conversationId: opts.conversationId || null,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-theme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: { reason: 'theme_project_week', theme, count: commands.length },
  }).catch(() => {});

  const child = (roster.children || []).find((c) => String(c.id) === String(childIds[0]));
  const who = child?.first_name || child?.name || 'your learner';

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.BATCH_ACTION_PREVIEW,
    message: `“${theme}” project week for ${who} — ${commands.length} learning days (one subject/day starting ${weekStart}). Confirm to create — nothing is saved yet.`,
    commands,
    preview,
    confirmationLabel: `Create ${commands.length} learning days`,
    idempotencyKey: newIdempotencyKey('themeweek'),
  });
}
