import { getPlannerEventCategory, getPlannerCategoryMeta } from './plannerEventCategories';
import { resolveEventSubjectName } from './plannerEventSubject';
import { getPlannerLearningDayLessonTitle } from './plannerLearningDayChip';
import {
  formatLearningDayDateLabel,
  formatLearningDayTimeLabel,
  resolveLearningDayDurationMinutes,
  resolveLearningDaySubjectName,
} from './learningDayModalNavigation';
import { parseWorkSpec } from '../workEventHelpers';
import { studentResponseTypeLabel } from '../studentResponseTypes';
import { isWorkAssignmentEditEvent } from '../create/eventOpenRouting';
import { RECURRENCE_WEEKDAY_OPTIONS } from '../create/saveEventHelpers';
import {
  formatEventChipTimeLabel,
  isTimelessUntimedEvent,
  resolveEventDateValue,
} from '../../components/planner/plannerListTableUtils';
import { getEventChildIdsForDisplay } from '../utils/eventChildIds';

function parseRecurrenceRule(ruleRaw) {
  if (!ruleRaw) return null;
  if (typeof ruleRaw === 'object' && !Array.isArray(ruleRaw)) return ruleRaw;
  if (typeof ruleRaw === 'string') {
    try {
      return JSON.parse(ruleRaw);
    } catch (_) {
      return null;
    }
  }
  return null;
}

function formatRecurrenceSummary(event) {
  const rule = parseRecurrenceRule(event?.recurrence_rule);
  if (!rule) return 'Does not repeat';
  const freq = String(rule.frequency || rule.freq || 'weekly').toLowerCase();
  const freqLabel = freq === 'daily' ? 'Daily' : freq === 'monthly' ? 'Monthly' : 'Weekly';
  const byweekday = rule.byweekday || rule.byWeekday || [];
  if (freq === 'weekly' && Array.isArray(byweekday) && byweekday.length > 0) {
    const labels = byweekday
      .map((token) => {
        const upper = String(token).toUpperCase();
        return RECURRENCE_WEEKDAY_OPTIONS.find((opt) => opt.rrule === upper)?.label;
      })
      .filter(Boolean);
    if (labels.length > 0) return `${freqLabel} · ${labels.join(', ')}`;
  }
  return freqLabel;
}

function formatEventDateLabel(event) {
  const raw = resolveEventDateValue(event);
  if (!raw) return 'Date not set';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'Date not set';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatScheduleLine(event) {
  if (event?.all_day === true || event?.allDay === true) return 'All day';
  if (isTimelessUntimedEvent(event)) return 'No time set';
  const timeLabel = formatEventChipTimeLabel(event);
  return timeLabel || formatLearningDayTimeLabel(event) || 'No time set';
}

function resolveChildNames(childIds, children = []) {
  const ids = (childIds || []).map(String).filter(Boolean);
  if (ids.length === 0) return '';
  const names = ids.map((id) => {
    const child = (children || []).find((row) => String(row?.id) === id);
    return String(child?.first_name || child?.name || '').trim();
  }).filter(Boolean);
  return names.join(' · ');
}

function truncateText(text, max = 280) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max).trim()}…`;
}

function attachmentCount(event) {
  const ids = event?.materials_attachment_ids;
  if (Array.isArray(ids) && ids.length > 0) return ids.length;
  if (event?.material_id) return 1;
  return 0;
}

function resolveUnitTitle(event) {
  const meta = event?.curriculum_metadata && typeof event.curriculum_metadata === 'object'
    ? event.curriculum_metadata
    : {};
  return String(meta?.unit_title || event?.unit || '').trim();
}

function resolveLessonTitle(event) {
  const fromMeta = getPlannerLearningDayLessonTitle(event);
  if (fromMeta) return fromMeta;
  return String(event?.lesson || '').trim();
}

function summaryRow(label, value, { omitIfEmpty = false } = {}) {
  const text = String(value || '').trim();
  if (omitIfEmpty && !text) return null;
  return { label, value: text || '—' };
}

export function resolvePlannerItemCategory(event) {
  if (!event) return 'Event';
  if (isWorkAssignmentEditEvent(event?.event_type || event?.type)) return 'Assignment';
  return getPlannerEventCategory(event);
}

export function shouldSkipPlannerItemSummary(detail = {}) {
  if (detail.skipSummary) return true;
  if (detail.openConflictResolution) return true;
  if (detail.editScope === 'series') return true;
  return false;
}

/**
 * Build read-only summary fields for planner item detail modal.
 */
export function buildPlannerItemSummaryModel({
  event,
  assignment = null,
  category = null,
  children = [],
  subjects = [],
}) {
  const resolvedCategory = category || resolvePlannerItemCategory(event);
  const categoryMeta = getPlannerCategoryMeta(resolvedCategory);
  const childIds = getEventChildIdsForDisplay(event, children);
  const childNames = resolveChildNames(childIds, children);

  if (resolvedCategory === 'Learning day') {
    const subjectName = resolveLearningDaySubjectName(event, subjects);
    const duration = resolveLearningDayDurationMinutes(event);
    const unitTitle = resolveUnitTitle(event);
    const lessonTitle = resolveLessonTitle(event);
    const notes = truncateText(event?.description || '');
    const attachCount = attachmentCount(event);

    const rows = [
      summaryRow('When', `${formatLearningDayDateLabel(event)} · ${formatLearningDayTimeLabel(event) || 'No time'}${duration ? ` · ${duration} min` : ''}`),
      summaryRow('Children', childNames, { omitIfEmpty: true }),
      summaryRow('Unit', unitTitle || 'No unit'),
      summaryRow('Lesson', lessonTitle || 'No lesson linked'),
      summaryRow('Session notes', notes, { omitIfEmpty: true }),
      summaryRow('Attachments', attachCount > 0 ? `${attachCount} attached` : null, { omitIfEmpty: true }),
    ].filter(Boolean);

    return {
      category: resolvedCategory,
      categoryLabel: categoryMeta.label,
      accent: categoryMeta.chipText,
      accentSoft: categoryMeta.color,
      headline: subjectName,
      subheadline: childNames || null,
      rows,
      notesPreview: notes || null,
    };
  }

  if (resolvedCategory === 'Assignment') {
    const workSpec = parseWorkSpec(event?.work_spec, event?.event_type || 'Assignment');
    const subjectName = resolveEventSubjectName(event) || (
      event?.subject_id
        ? String((subjects || []).find((s) => String(s?.id) === String(event.subject_id))?.name || '').trim()
        : ''
    );
    const pointsRaw = assignment?.points ?? assignment?.max_points ?? workSpec?.points ?? '';
    const points = pointsRaw != null && String(pointsRaw).trim() !== '' ? String(pointsRaw).trim() : '';
    const responseType = workSpec?.student_response_type
      ? studentResponseTypeLabel(workSpec.student_response_type)
      : '';
    const unitTitle = resolveUnitTitle(event);
    const lessonTitle = resolveLessonTitle(event);
    const attachCount = attachmentCount(event);

    const rows = [
      summaryRow('Subject', subjectName || 'No subject'),
      summaryRow('Children', childNames, { omitIfEmpty: true }),
      summaryRow('Due date', formatEventDateLabel(event)),
      summaryRow('Unit', unitTitle || 'No unit'),
      summaryRow('Lesson', lessonTitle || 'No lesson linked'),
      summaryRow('Student response', responseType, { omitIfEmpty: true }),
      summaryRow('Points', points, { omitIfEmpty: true }),
      summaryRow('Attachments', attachCount > 0 ? `${attachCount} attached` : null, { omitIfEmpty: true }),
    ].filter(Boolean);

    return {
      category: resolvedCategory,
      categoryLabel: categoryMeta.label,
      accent: categoryMeta.chipText,
      accentSoft: categoryMeta.color,
      headline: String(event?.title || assignment?.title || '').trim() || 'Assignment',
      subheadline: subjectName || null,
      rows,
      notesPreview: null,
    };
  }

  const location = String(event?.location || event?.place || '').trim();
  const notes = truncateText(event?.description || '');
  const attachCount = attachmentCount(event);
  const recurrence = formatRecurrenceSummary(event);

  const rows = [
    summaryRow('When', `${formatEventDateLabel(event)} · ${formatScheduleLine(event)}`),
    summaryRow('Children', childNames, { omitIfEmpty: true }),
    summaryRow('Location', location, { omitIfEmpty: true }),
    summaryRow('Repeats', recurrence),
    summaryRow('Attachments', attachCount > 0 ? `${attachCount} attached` : null, { omitIfEmpty: true }),
  ].filter(Boolean);

  return {
    category: resolvedCategory,
    categoryLabel: categoryMeta.label,
    accent: categoryMeta.chipText,
    accentSoft: categoryMeta.color,
    headline: String(event?.title || '').trim() || 'Event',
    subheadline: childNames || null,
    rows,
    notesPreview: notes || null,
  };
}
