import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { formatDisplayDate, requireHouseholdMatch, requireString } from './commandUtils.js';

registerCommand({
  type: DOODLE_COMMAND_TYPES.LEARNING_DAY_UPDATE,
  auditLabel: 'Update learning day via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.LEARNING_DAY_UPDATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const event = requireString(command.eventId, 'Learning day');
    if (!event.ok) return event;
    const patch = command.patch || {};
    const hasChange = [
      'date', 'startTimeHm', 'durationMinutes', 'description',
      'unlinkLesson', 'curriculumLessonId', 'unitTitle', 'lessonTitle',
      'materialId', 'clearMaterial', 'attachmentId',
    ].some((key) => patch[key] != null && patch[key] !== '');
    if (!hasChange && patch.unlinkLesson !== true && patch.clearMaterial !== true) {
      return { ok: false, error: 'Nothing to update' };
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.canManageEvents === false && ctx.userRole !== 'parent') {
      return { ok: false, error: 'You do not have permission to edit learning days.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    const patch = command.patch || {};
    const fields = [
      { label: 'Learning day', value: command.eventTitle || command.eventId },
    ];
    if (patch.date) fields.push({ label: 'Date', value: formatDisplayDate(patch.date) });
    if (patch.startTimeHm || patch.startTimeLabel) {
      fields.push({ label: 'Time', value: patch.startTimeLabel || patch.startTimeHm });
    }
    if (patch.durationMinutes != null) {
      fields.push({ label: 'Duration', value: `${patch.durationMinutes} min` });
    }
    if (patch.description != null) {
      fields.push({
        label: 'Session notes',
        value: String(patch.description).trim() || '(clear notes)',
      });
    }
    if (patch.unlinkLesson) {
      fields.push({ label: 'Lesson', value: 'Unlink' });
    } else if (patch.lessonTitle || patch.curriculumLessonId) {
      fields.push({
        label: 'Lesson',
        value: patch.lessonTitle || patch.curriculumLessonId,
      });
    }
    if (patch.unitTitle) fields.push({ label: 'Unit', value: patch.unitTitle });
    if (patch.clearMaterial) {
      fields.push({ label: 'Attachment', value: 'Remove' });
    } else if (patch.fileName || patch.attachmentId || patch.materialId) {
      fields.push({ label: 'Attachment', value: patch.fileName || 'Attached file' });
    }
    return fields;
  },

  async execute(command) {
    const { updateEvent } = await import('../../services/plannerClientWithOffline.js');
    const {
      applyLearningDayTimeOverride,
      eventStartTimeHm,
    } = await import('../../learningDaySessionHelpers.js');
    const { linkLessonToEvent } = await import('../../subjectLessonLinking.js');
    const { resolveLearningDayDurationMinutes } = await import('../../planner/learningDayModalNavigation.js');
    const { supabase } = await import('../../supabase.js');

    const eventId = String(command.eventId);
    const familyId = String(command.householdId);
    const patch = command.patch || {};

    const { data: event, error: loadError } = await supabase
      .from('events')
      .select('id, title, start_ts, end_ts, description, material_id, materials_attachment_ids, curriculum_lesson_id, unit, lesson, curriculum_unit_title, is_flexible, minutes, subject_id, status')
      .eq('id', eventId)
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (loadError || !event) {
      return {
        ok: false,
        message: loadError?.message || 'Learning day not found.',
        error: 'execution',
      };
    }

    try {
      const timeTouched = patch.date || patch.startTimeHm || patch.durationMinutes != null;
      if (timeTouched) {
        await applyLearningDayTimeOverride({
          eventId,
          familyId,
          event,
          startTimeHm: patch.startTimeHm || eventStartTimeHm(event),
          durationMinutes: patch.durationMinutes != null
            ? patch.durationMinutes
            : resolveLearningDayDurationMinutes(event),
          sessionDateYmd: patch.date || null,
        });
      }

      if (patch.unlinkLesson) {
        const { error } = await updateEvent(eventId, {
          curriculum_lesson_id: null,
          curriculum_unit_title: null,
          unit: null,
          lesson: null,
          curriculum_metadata: {},
        }, familyId);
        if (error) throw error;
      } else if (patch.curriculumLessonId) {
        await linkLessonToEvent({
          eventId,
          familyId,
          lessonId: patch.curriculumLessonId,
          unitTitle: patch.unitTitle || null,
          lessonTitle: patch.lessonTitle || null,
        });
      } else if (patch.lessonTitle || patch.unitTitle) {
        const { error } = await updateEvent(eventId, {
          lesson: patch.lessonTitle != null ? String(patch.lessonTitle).trim() || null : undefined,
          unit: patch.unitTitle != null ? String(patch.unitTitle).trim() || null : undefined,
          curriculum_unit_title: patch.unitTitle != null
            ? String(patch.unitTitle).trim() || null
            : undefined,
          curriculum_metadata: patch.lessonTitle
            ? { lesson_label: String(patch.lessonTitle).trim() }
            : undefined,
        }, familyId);
        if (error) throw error;
      }

      let materialId = patch.materialId != null ? String(patch.materialId) : undefined;
      if (patch.attachmentId) {
        const { takeDoodleAttachment, holdDoodleAttachment } = await import('./attachmentHold.js');
        const { createFileMaterial, linkMaterialToChild } = await import('../../services/materialsClient.js');
        const file = takeDoodleAttachment(patch.attachmentId);
        if (!file) {
          return {
            ok: false,
            message: 'Attachment expired. Re-attach the file and try again.',
            error: 'execution',
          };
        }
        try {
          const safeFileName = String(patch.fileName || file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = `${familyId}/${crypto.randomUUID()}_${safeFileName}`;
          const { error: uploadError } = await supabase.storage
            .from('evidence')
            .upload(filePath, file, {
              upsert: false,
              contentType: file.type || patch.mime || 'application/octet-stream',
              metadata: { family_id: familyId },
            });
          if (uploadError) {
            holdDoodleAttachment(patch.attachmentId, file);
            return { ok: false, message: uploadError.message || 'Upload failed.', error: 'execution' };
          }
          const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath);
          const material = await createFileMaterial({
            familyId,
            storagePath: filePath,
            title: patch.fileName || file.name || 'Attachment',
            mime: file.type || patch.mime || 'application/octet-stream',
            bytes: file.size || patch.bytes || 0,
            subjectId: event.subject_id || null,
            url: urlData?.publicUrl || null,
          });
          materialId = material?.id || null;
          if (!materialId) {
            holdDoodleAttachment(patch.attachmentId, file);
            return { ok: false, message: 'Could not create material record.', error: 'execution' };
          }
          if (event.child_id) {
            try {
              await linkMaterialToChild(materialId, event.child_id, familyId, 'planned');
            } catch (_) {
              // non-fatal
            }
          }
        } catch (err) {
          holdDoodleAttachment(patch.attachmentId, file);
          throw err;
        }
      }

      const notesTouched = patch.description !== undefined;
      const materialTouched = patch.clearMaterial || materialId !== undefined;
      if (notesTouched || materialTouched || event.is_flexible) {
        const nextMaterialId = patch.clearMaterial
          ? null
          : (materialId !== undefined ? materialId : undefined);
        const updates = {};
        if (event.is_flexible) updates.is_flexible = false;
        if (notesTouched) updates.description = String(patch.description || '').trim() || null;
        if (materialTouched) {
          updates.material_id = nextMaterialId;
          updates.materials_attachment_ids = nextMaterialId ? [nextMaterialId] : null;
        }
        if (Object.keys(updates).length) {
          const { error } = await updateEvent(eventId, updates, familyId);
          if (error) throw error;
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipCacheClear: true } }));
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }

      return {
        ok: true,
        message: `Updated “${command.eventTitle || 'learning day'}”.`,
        affectedRecords: [{
          label: command.eventTitle || 'Open learning day',
          href: `/?event=${eventId}`,
          entityType: 'event',
          entityId: eventId,
        }],
      };
    } catch (err) {
      return {
        ok: false,
        message: err?.message || 'Could not update learning day.',
        error: 'execution',
      };
    }
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.LEARNING_DAY_DELETE,
  auditLabel: 'Delete learning day via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.LEARNING_DAY_DELETE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    return requireString(command.eventId, 'Learning day');
  },

  authorize(command, ctx, caps = {}) {
    if (caps.canManageEvents === false && ctx.userRole !== 'parent') {
      return { ok: false, error: 'You do not have permission to delete learning days.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Learning day', value: command.eventTitle || command.eventId },
      { label: 'When', value: command.whenLabel || '—' },
      { label: 'Action', value: 'Delete permanently from planner' },
    ];
  },

  async execute(command) {
    const { deleteEvent } = await import('../../services/plannerClientWithOffline.js');
    const eventId = String(command.eventId);
    const { error } = await deleteEvent(eventId, command.householdId);
    if (error) {
      return {
        ok: false,
        message: error.message || 'Could not delete learning day.',
        error: 'execution',
      };
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
    }
    return {
      ok: true,
      message: `Deleted “${command.eventTitle || 'learning day'}”.`,
      affectedRecords: [{
        label: 'Open Planner',
        href: '/?view=month',
        entityType: 'event',
      }],
    };
  },
});
