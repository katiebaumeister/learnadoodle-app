import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { formatDisplayDate, requireHouseholdMatch, requireString } from './commandUtils.js';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatWeekdays(weekdays = []) {
  return [...weekdays]
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join(', ');
}

registerCommand({
  type: DOODLE_COMMAND_TYPES.SUBJECT_UPDATE,
  auditLabel: 'Update subject settings via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.SUBJECT_UPDATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const id = requireString(command.subjectId, 'Subject');
    if (!id.ok) return id;
    const hasPatch = command.patch && Object.keys(command.patch).length > 0;
    const hasSchedule = Boolean(command.schedule?.weekdays?.length);
    const hasAttach = command.syllabusMaterialId !== undefined
      || command.lessonPlanMaterialId !== undefined
      || command.clearAttachments === true;
    if (!hasPatch && !hasSchedule && !hasAttach) {
      return { ok: false, error: 'Nothing to update' };
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showLearning === false) {
      return { ok: false, error: 'Learning areas are not enabled for this household.' };
    }
    if (caps.canManageSubjects === false && ctx.userRole !== 'parent') {
      return { ok: false, error: 'You do not have permission to edit subjects.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    if (command.schedule) {
      const { weekdays, startDate, endDate, durationMinutes } = command.schedule;
      if (!Array.isArray(weekdays) || weekdays.length === 0) {
        return { ok: false, error: 'Select at least one day.' };
      }
      if (!startDate || !endDate) {
        return { ok: false, error: 'Schedule needs start and end dates.' };
      }
      if (startDate > endDate) {
        return { ok: false, error: 'End date must be on or after start date.' };
      }
      const duration = Number(durationMinutes);
      if (!Number.isFinite(duration) || duration <= 0) {
        return { ok: false, error: 'Duration must be a positive number of minutes.' };
      }
    }
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Subject', value: command.subjectName || command.subjectId },
    ];
    const patch = command.patch || {};
    if (patch.name) fields.push({ label: 'Name', value: patch.name });
    if (patch.grade != null && patch.grade !== '') {
      fields.push({ label: 'Grade', value: String(patch.grade) });
    }
    if (Array.isArray(patch.childIds)) {
      fields.push({
        label: 'Students',
        value: command.childNames || `${patch.childIds.length} selected`,
      });
    }
    if (patch.schoolYear) fields.push({ label: 'School year', value: patch.schoolYear });
    if (patch.schoolTerm) fields.push({ label: 'Term', value: patch.schoolTerm });
    if (patch.gradingLabel || patch.gradingMethod) {
      fields.push({ label: 'Grading', value: patch.gradingLabel || patch.gradingMethod });
    }
    if (command.syllabusTitle || command.syllabusMaterialId) {
      fields.push({
        label: 'Syllabus / lesson plan',
        value: command.syllabusTitle || 'Attached',
      });
    }
    if (command.clearAttachments) {
      fields.push({ label: 'Attachments', value: 'Clear syllabus / lesson plan' });
    }
    if (command.schedule) {
      fields.push({ label: 'Days', value: formatWeekdays(command.schedule.weekdays) || '—' });
      if (command.schedule.startTime) {
        fields.push({ label: 'Time', value: command.schedule.startTimeLabel || command.schedule.startTime });
      }
      if (command.schedule.durationMinutes) {
        fields.push({ label: 'Duration', value: `${command.schedule.durationMinutes} min` });
      }
      if (command.schedule.startDate && command.schedule.endDate) {
        fields.push({
          label: 'Dates',
          value: `${formatDisplayDate(command.schedule.startDate)} – ${formatDisplayDate(command.schedule.endDate)}`,
        });
      }
    }
    return fields;
  },

  async execute(command) {
    const { supabase } = await import('../../supabase.js');
    const { parseChildIds } = await import('../../services/subjectsClient.js');
    const { DEFAULT_GRADING_SETTINGS } = await import('../../subjectGradingSettings.js');
    const { saveSubjectGradingSettings } = await import('../../services/subjectGradingSettingsClient.js');
    const { saveSubjectAttachmentLinks } = await import('../../services/subjectMaterialLinks.js');
    const {
      applySubjectScheduleToCalendar,
      APPLY_SCOPE_FORWARD,
      APPLY_SCOPE_FULL_YEAR,
    } = await import('../../subjectConfigureSchedule.js');

    const subjectId = String(command.subjectId);
    const familyId = String(command.householdId);
    const patch = command.patch || {};
    const updates = {};

    if (patch.name) updates.name = String(patch.name).trim();
    if (patch.grade != null) updates.grade = patch.grade === '' ? null : String(patch.grade);
    if (Array.isArray(patch.childIds)) {
      updates.child_id = patch.childIds.map(String).join(';');
    }
    if (patch.schoolYear != null) updates.school_year = patch.schoolYear || null;
    if (patch.schoolTerm != null) updates.school_term = patch.schoolTerm || null;

    if (Object.keys(updates).length) {
      const { error } = await supabase
        .from('subject')
        .update(updates)
        .eq('id', subjectId)
        .eq('family_id', familyId);
      if (error) {
        return { ok: false, message: error.message || 'Could not update subject.', error: 'execution' };
      }
    }

    if (patch.gradingMethod) {
      try {
        await saveSubjectGradingSettings(subjectId, familyId, {
          ...DEFAULT_GRADING_SETTINGS,
          calculation_method: patch.gradingMethod,
        });
      } catch (err) {
        return {
          ok: false,
          message: err?.message || 'Could not update grading method.',
          error: 'execution',
        };
      }
    }

    if (
      command.clearAttachments
      || command.syllabusMaterialId !== undefined
      || command.lessonPlanMaterialId !== undefined
    ) {
      try {
        await saveSubjectAttachmentLinks({
          familyId,
          subjectId,
          syllabusMaterialId: command.clearAttachments ? null : (command.syllabusMaterialId || null),
          lessonPlanMaterialId: command.clearAttachments ? null : (command.lessonPlanMaterialId || null),
        });
      } catch (err) {
        return {
          ok: false,
          message: err?.message || 'Could not update subject attachments.',
          error: 'execution',
        };
      }
    }

    if (command.schedule?.weekdays?.length) {
      const { data: subjectRow, error: subjectError } = await supabase
        .from('subject')
        .select('id, name, child_id, school_year, school_term, grade')
        .eq('id', subjectId)
        .eq('family_id', familyId)
        .maybeSingle();
      if (subjectError || !subjectRow) {
        return {
          ok: false,
          message: subjectError?.message || 'Subject not found.',
          error: 'execution',
        };
      }

      const assignedChildIds = Array.isArray(patch.childIds) && patch.childIds.length
        ? patch.childIds.map(String)
        : parseChildIds(subjectRow.child_id);

      try {
        await applySubjectScheduleToCalendar({
          familyId,
          subject: subjectRow,
          assignedChildIds,
          allChildIds: assignedChildIds,
          weekdays: command.schedule.weekdays,
          startTime: command.schedule.startTime,
          durationMinutes: command.schedule.durationMinutes,
          startDate: command.schedule.startDate,
          endDate: command.schedule.endDate,
          academicYearId: command.schedule.academicYearId || null,
          applyScope: command.schedule.applyScope === 'forward'
            ? APPLY_SCOPE_FORWARD
            : APPLY_SCOPE_FULL_YEAR,
        });
      } catch (err) {
        return {
          ok: false,
          message: err?.message || 'Could not update subject schedule.',
          error: 'execution',
        };
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      window.dispatchEvent(new CustomEvent('refreshMaterials'));
    }

    const label = command.subjectName || patch.name || 'Subject';
    return {
      ok: true,
      message: command.schedule
        ? `Updated “${label}” schedule${patch.name || patch.grade != null || patch.childIds ? ' and details' : ''}.`
        : `Updated “${label}”.`,
      affectedRecords: [{
        label,
        href: `/learning?subject=${subjectId}`,
        entityType: 'subject',
        entityId: subjectId,
      }],
    };
  },
});
