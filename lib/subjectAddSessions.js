import { Platform } from 'react-native';
import { fixTargetGap } from './services/academicYearClient';
import { findAcademicYearPlanForSubject } from './subjectPlanSlotLines';
import { autoAssignLessonsToUnlinkedEvents } from './subjectLessonLinking';

function getClientTimezone() {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && typeof tz === 'string') return tz.trim();
    }
  } catch (_) {}
  return 'America/New_York';
}

export function formatGapClosedSummary(sessionsAdded, lessonsLinked) {
  const count = Math.max(0, Number(sessionsAdded) || 0);
  const linked = Math.max(0, Number(lessonsLinked) || 0);
  const sessionLabel = `${count} session${count === 1 ? '' : 's'} added`;
  const lessonLabel = linked > 0
    ? `, ${linked} lesson${linked === 1 ? '' : 's'} linked`
    : '';
  return `${sessionLabel}${lessonLabel}.`;
}

/** @deprecated Use formatGapClosedSummary */
export function formatAddSessionsSummary(sessionsAdded, lessonsLinked) {
  return `Add sessions: ${formatGapClosedSummary(sessionsAdded, lessonsLinked)}`;
}

export function buildGapSlotHintLines(dryRunPreview = null, maxLines = 3) {
  const rawSlots = Array.isArray(dryRunPreview?.selectedAssignments)
    ? dryRunPreview.selectedAssignments
    : (Array.isArray(dryRunPreview?.debugSelectedSlots) ? dryRunPreview.debugSelectedSlots : []);
  if (!rawSlots.length) return [];
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const seen = new Set();
  const lines = [];
  rawSlots.forEach((slot) => {
    const dayKey = String(slot?.date || '').slice(0, 10);
    const start = String(slot?.start_time || '').slice(0, 5) || '09:00';
    const key = `${dayKey}|${start}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || seen.has(key)) return;
    seen.add(key);
    const d = new Date(`${dayKey}T12:00:00`);
    const weekday = Number.isNaN(d.getTime()) ? '' : (weekdayLabels[d.getDay()] || '');
    const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    lines.push(`- ${weekday ? `${weekday} ` : ''}${dateLabel} at ${start}`);
  });
  return lines.slice(0, maxLines);
}

export function getGapPreviewCounts(dryRunPreview, gapDays, targetKind = 'days') {
  const requestedGap = Math.max(
    0,
    Number(
      dryRunPreview?.requestedGap
      ?? dryRunPreview?.beforeGapDays
      ?? dryRunPreview?.debugDaysNeeded
      ?? gapDays
    ),
  );
  const sessionsToAdd = Math.max(
    0,
    Number(dryRunPreview?.assignedCount ?? dryRunPreview?.createdEvents ?? 0),
  );
  return {
    requestedGap,
    sessionsToAdd,
    noCapacity: sessionsToAdd <= 0,
    targetKind,
  };
}

async function resolveGapContext({
  familyId,
  subjectId,
  academicYearId: initialAcademicYearId = null,
  attendanceTargetProgress = null,
  planRange = null,
}) {
  const sid = String(subjectId || '').trim();
  if (!familyId || !sid) {
    throw new Error('Missing family or subject context.');
  }
  if (!attendanceTargetProgress || attendanceTargetProgress.met) {
    throw new Error('No attendance gap to fill for this subject.');
  }

  const targetKind = attendanceTargetProgress.mode === 'hours' ? 'hours' : 'days';
  const gapDays = targetKind === 'days'
    ? Math.max(0, Number(attendanceTargetProgress.projectedRemainingDays ?? attendanceTargetProgress.remaining) || 0)
    : Math.max(0, Number(attendanceTargetProgress.remaining) || 0);
  if (gapDays <= 0) {
    throw new Error('No attendance gap to fill for this subject.');
  }

  let academicYearId = String(initialAcademicYearId || '').trim();
  if (!academicYearId) {
    const fetched = await findAcademicYearPlanForSubject(familyId, sid);
    academicYearId = String(fetched?.academicYearId || fetched?.id || '').trim();
  }
  if (!academicYearId) {
    throw new Error('No saved plan found. Create a plan first.');
  }

  const targetDays = Number(attendanceTargetProgress.target);
  const projectedDays = targetKind === 'days'
    ? Number(attendanceTargetProgress.projectedDays ?? attendanceTargetProgress.attendedDays ?? 0)
    : Number(attendanceTargetProgress.actual ?? 0);
  const rangeStartYmd = String(planRange?.startYmd || planRange?.start_date || '').slice(0, 10);
  const rangeEndYmd = String(planRange?.endYmd || planRange?.end_date || '').slice(0, 10);

  const payloadBase = {
    academic_year_id: academicYearId,
    scope: 'per_subject',
    subject_id: sid,
    ...(rangeStartYmd ? { range_start_ymd: rangeStartYmd } : {}),
    ...(rangeEndYmd ? { range_end_ymd: rangeEndYmd } : {}),
    ...(targetKind === 'hours'
      ? {
        visible_projected_hours: projectedDays,
        visible_gap_hours: gapDays,
      }
      : {
        visible_projected_days: projectedDays,
        visible_gap_days: gapDays,
      }),
    target_kind: targetKind,
    target_value: targetDays,
    mode: 'fill_to_zero',
    strict_range: true,
    enforce_conflict_checks: true,
    timezone: getClientTimezone(),
  };

  return {
    sid,
    academicYearId,
    targetKind,
    gapDays,
    targetDays,
    projectedDays,
    payloadBase,
  };
}

export async function previewSubjectGapFix({
  familyId,
  subjectId,
  academicYearId = null,
  attendanceTargetProgress = null,
  planRange = null,
}) {
  const context = await resolveGapContext({
    familyId,
    subjectId,
    academicYearId,
    attendanceTargetProgress,
    planRange,
  });
  const { data: dryRunPreview, error } = await fixTargetGap({
    ...context.payloadBase,
    dry_run: true,
  });
  if (error) throw error;
  const counts = getGapPreviewCounts(dryRunPreview, context.gapDays, context.targetKind);
  return {
    ...context,
    dryRunPreview,
    ...counts,
  };
}

function dispatchRefreshEvents() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('refreshSubjects'));
  window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
  window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
}

export async function executeSubjectGapFix({
  familyId,
  subjectId,
  payloadBase,
  subjectEvents = [],
  units = [],
}) {
  const sid = String(subjectId || '').trim();
  const { data: fixResult, error: fixError } = await fixTargetGap({
    ...payloadBase,
    dry_run: false,
  });
  if (fixError) throw fixError;
  if (fixResult?.success === false) {
    throw new Error(String(fixResult?.message || 'Could not add sessions for this subject.'));
  }

  const sessionsAdded = Math.max(
    0,
    Number(
      fixResult?.successfulInsertCount
      ?? fixResult?.insertedCount
      ?? fixResult?.createdEvents
      ?? 0,
    ),
  );
  if (sessionsAdded <= 0) {
    const targetKind = payloadBase?.target_kind === 'hours' ? 'hours' : 'days';
    const afterGap = targetKind === 'hours'
      ? Number(fixResult?.afterGapHours ?? 0)
      : Number(fixResult?.afterGapDays ?? 0);
    throw new Error(
      String(
        fixResult?.message
        || `No sessions were added. Still ${afterGap} ${targetKind === 'hours' ? 'hours' : 'days'} short.`,
      ),
    );
  }

  let lessonsLinked = 0;
  try {
    const { assigned } = await autoAssignLessonsToUnlinkedEvents({
      familyId,
      subjectId: sid,
      subjectEvents,
      units,
      limit: Math.max(sessionsAdded, 12),
    });
    lessonsLinked = Math.max(0, Number(assigned) || 0);
  } catch (_) {}

  dispatchRefreshEvents();

  return {
    sessionsAdded,
    lessonsLinked,
    summary: formatGapClosedSummary(sessionsAdded, lessonsLinked),
    fixResult,
  };
}

export async function runSubjectAddSessions({
  familyId,
  subjectId,
  subjectName = '',
  academicYearId: initialAcademicYearId = null,
  attendanceTargetProgress = null,
  planRange = null,
  units = [],
  subjectEvents = [],
  skipConfirm = false,
}) {
  const preview = await previewSubjectGapFix({
    familyId,
    subjectId,
    academicYearId: initialAcademicYearId,
    attendanceTargetProgress,
    planRange,
  });

  if (preview.noCapacity) {
    const unit = preview.targetKind === 'hours' ? 'hours' : 'days';
    return {
      cancelled: true,
      noCapacity: true,
      message: `No open learning windows left. Still ${Math.round(preview.gapDays)} ${unit} short.`,
    };
  }

  if (!skipConfirm) {
    const unit = preview.targetKind === 'hours' ? 'hour' : 'day';
    const units = preview.targetKind === 'hours' ? 'hours' : 'days';
    const message = [
      `Add ${preview.sessionsToAdd} learning session${preview.sessionsToAdd === 1 ? '' : 's'} for ${subjectName || 'this subject'}?`,
      '',
      `You are projected ${Math.round(preview.requestedGap)} ${unit}${Math.round(preview.requestedGap) === 1 ? '' : 's'} short of your year target.`,
      'Unscheduled curriculum lessons will be linked to new sessions when possible.',
    ].join('\n');
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(message)) {
        return { cancelled: true };
      }
    }
  }

  return executeSubjectGapFix({
    familyId,
    subjectId,
    payloadBase: preview.payloadBase,
    subjectEvents,
    units,
  });
}
