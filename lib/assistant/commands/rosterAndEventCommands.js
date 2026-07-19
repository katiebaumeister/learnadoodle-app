import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { formatDisplayDate, requireHouseholdMatch, requireString } from './commandUtils.js';

registerCommand({
  type: DOODLE_COMMAND_TYPES.SUBJECT_CREATE,
  auditLabel: 'Create subject via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.SUBJECT_CREATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const name = requireString(command.name, 'Subject name');
    if (!name.ok) return name;
    const child = requireString(command.childId, 'Student');
    if (!child.ok) return child;
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showLearning === false) {
      return { ok: false, error: 'Learning areas are not enabled for this household.' };
    }
    if (caps.canManageSubjects === false && ctx.userRole !== 'parent') {
      return { ok: false, error: 'You do not have permission to add subjects.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Subject', value: command.name },
      { label: 'Student', value: command.childName || command.childId },
    ];
  },

  async execute(command) {
    const { executeAddSubjectChat } = await import('../familyRosterChatActions.js');
    const result = await executeAddSubjectChat(
      command.householdId,
      command.childId,
      command.name,
    );
    if (!result?.success) {
      return { ok: false, message: result?.error || 'Could not add subject.', error: 'execution' };
    }
    return {
      ok: true,
      message: `Added subject “${command.name}”.`,
      affectedRecords: [{
        label: command.name,
        href: '/learning',
        entityType: 'subject',
      }],
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.SUBJECT_RENAME,
  auditLabel: 'Rename subject via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.SUBJECT_RENAME) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const id = requireString(command.subjectId, 'Subject');
    if (!id.ok) return id;
    const name = requireString(command.newName, 'New name');
    if (!name.ok) return name;
    return { ok: true };
  },

  authorize(command, ctx) {
    if (ctx.userRole === 'child') {
      return { ok: false, error: 'You do not have permission to rename subjects.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Current', value: command.currentName || command.subjectId },
      { label: 'New name', value: command.newName },
    ];
  },

  async execute(command) {
    const { executeUpdateSubjectChat } = await import('../familyRosterChatActions.js');
    const result = await executeUpdateSubjectChat(
      command.householdId,
      command.subjectId,
      command.newName,
    );
    if (!result?.success) {
      return { ok: false, message: result?.error || 'Could not rename subject.', error: 'execution' };
    }
    return {
      ok: true,
      message: `Renamed subject to “${command.newName}”.`,
      affectedRecords: [{
        label: command.newName,
        href: `/learning?subject=${command.subjectId}`,
        entityType: 'subject',
        entityId: String(command.subjectId),
      }],
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.CHILD_CREATE,
  auditLabel: 'Create child via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.CHILD_CREATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const name = requireString(command.name, 'Name');
    if (!name.ok) return name;
    return { ok: true };
  },

  authorize(command, ctx) {
    if (ctx.userRole !== 'parent') {
      return { ok: false, error: 'Only parents can add children.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    const fields = [{ label: 'Name', value: command.name }];
    if (command.gradeLabel) fields.push({ label: 'Grade', value: command.gradeLabel });
    return fields;
  },

  async execute(command) {
    const { addChild } = await import('../../apiClient.js');
    const result = await addChild({
      family_id: command.householdId,
      name: command.name,
      grade_label: command.gradeLabel || null,
    });
    if (result?.error) {
      return {
        ok: false,
        message: result.error?.message || result.error || 'Could not add child.',
        error: 'execution',
      };
    }
    const created = result?.data || result;
    const id = created?.id || created?.child?.id;
    return {
      ok: true,
      message: `Added learner “${command.name}”.`,
      affectedRecords: [{
        label: command.name,
        href: id ? `/?child=${id}` : '/',
        entityType: 'child',
        entityId: id ? String(id) : undefined,
      }],
      resultData: { childId: id || null },
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.EVENT_UPDATE,
  auditLabel: 'Edit event via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.EVENT_UPDATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const id = requireString(command.eventId, 'Event');
    if (!id.ok) return id;
    if (!command.updates || typeof command.updates !== 'object') {
      return { ok: false, error: 'Updates are required' };
    }
    return { ok: true };
  },

  authorize(_command, _ctx, caps = {}) {
    if (caps.canManageEvents === false) {
      return { ok: false, error: 'You do not have permission to edit events.' };
    }
    return { ok: true };
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Event', value: command.eventTitle || command.eventId },
    ];
    const u = command.updates || {};
    if (u.title) fields.push({ label: 'New title', value: u.title });
    if (u.start_ts) fields.push({ label: 'New start', value: formatDisplayDate(u.start_ts) });
    if (u.event_type) fields.push({ label: 'Type', value: u.event_type });
    return fields;
  },

  async execute(command, ctx) {
    const { executeChatUpdateEvent } = await import('../eventChatActions.js');
    const result = await executeChatUpdateEvent(
      command.eventId,
      command.updates,
      false,
      ctx.householdId,
    );
    if (!result?.success) {
      return { ok: false, message: result?.error || 'Could not update event.', error: 'execution' };
    }
    return {
      ok: true,
      message: `Updated “${command.eventTitle || 'event'}”.`,
      affectedRecords: [{
        label: command.updates?.title || command.eventTitle || 'Event',
        href: `/planner?event=${command.eventId}`,
        entityType: 'event',
        entityId: String(command.eventId),
      }],
      undoToken: `event:${command.eventId}`,
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE,
  auditLabel: 'Create learning day via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const subject = requireString(command.subjectId, 'Subject');
    if (!subject.ok) return subject;
    if (!Array.isArray(command.childIds) || !command.childIds.length) {
      return { ok: false, error: 'At least one student is required' };
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showLearning === false) {
      return { ok: false, error: 'Learning areas are not enabled for this household.' };
    }
    if (caps.canManageEvents === false) {
      return { ok: false, error: 'You do not have permission to create learning days.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    if (command.date && Number.isNaN(new Date(command.date).getTime())) {
      return { ok: false, error: 'Invalid date.' };
    }
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Subject', value: command.subjectName || command.subjectId },
      { label: 'When', value: command.date ? formatDisplayDate(command.date) : 'Today' },
      { label: 'Type', value: 'One-off learning event' },
    ];
    if (command.createLesson) {
      fields.push({ label: 'Lesson', value: command.lessonTitle || command.title || 'New lesson' });
    }
    if (command.attachmentId || command.fileName) {
      fields.push({ label: 'Material', value: command.fileName || 'Attached file' });
    }
    if (command.childIds?.length) {
      fields.push({ label: 'Students', value: `${command.childIds.length} selected` });
    }
    return fields;
  },

  async execute(command, ctx) {
    const { saveLesson } = await import('../../create/saveEventHelpers.js');
    const { notifyEventPatched } = await import('./uiNotify.js');
    try {
      const date = command.date
        ? (/^\d{4}-\d{2}-\d{2}$/.test(String(command.date))
          ? new Date(`${command.date}T12:00:00`)
          : new Date(command.date))
        : new Date();
      const lessonTitle = command.lessonTitle || command.title || 'New lesson';
      let materialId = null;
      let curriculumLessonId = null;
      let unitTitle = null;

      // 1) Upload attached file → Materials library
      if (command.attachmentId) {
        const { takeDoodleAttachment, holdDoodleAttachment } = await import('./attachmentHold.js');
        const { supabase } = await import('../../supabase.js');
        const { createFileMaterial, linkMaterialToChild } = await import('../../services/materialsClient.js');
        const file = takeDoodleAttachment(command.attachmentId);
        if (!file) {
          return {
            ok: false,
            message: 'Attachment expired. Re-attach the file and try again.',
            error: 'execution',
          };
        }
        try {
          const safeFileName = String(command.fileName || file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = `${command.householdId}/${crypto.randomUUID()}_${safeFileName}`;
          const { error: uploadError } = await supabase.storage
            .from('evidence')
            .upload(filePath, file, {
              upsert: false,
              contentType: file.type || command.mime || 'application/octet-stream',
              metadata: { family_id: command.householdId },
            });
          if (uploadError) {
            holdDoodleAttachment(command.attachmentId, file);
            return { ok: false, message: uploadError.message || 'Upload failed.', error: 'execution' };
          }
          const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath);
          const material = await createFileMaterial({
            familyId: command.householdId,
            storagePath: filePath,
            title: command.fileName || file.name || lessonTitle,
            mime: file.type || command.mime || 'application/octet-stream',
            bytes: file.size || command.bytes || 0,
            subjectId: command.subjectId || null,
            url: urlData?.publicUrl || null,
          });
          materialId = material?.id || null;
          if (!materialId) {
            holdDoodleAttachment(command.attachmentId, file);
            return { ok: false, message: 'Could not create material record.', error: 'execution' };
          }
          if (command.childIds?.[0]) {
            try {
              await linkMaterialToChild(materialId, command.childIds[0], command.householdId, 'planned');
            } catch (_) {
              // non-fatal
            }
          }
        } catch (err) {
          holdDoodleAttachment(command.attachmentId, file);
          throw err;
        }
      }

      // 2) Optional new curriculum lesson (Subjects → Classwork)
      // Use commit-manual-draft's lesson_ids — never event-structure ids (those are not
      // curriculum_lessons rows and violate events_curriculum_lesson_id_fkey).
      if (command.createLesson) {
        try {
          const {
            fetchSubjectCurriculumEventsStructure,
            invalidateSubjectCurriculumStructureCache,
          } = await import('../../services/curriculumClient.js');
          const {
            addUnitToSubjectCurriculum,
            addLessonToSubjectCurriculum,
          } = await import('../../subjectClassworkLessonActions.js');
          const { isPersistedCurriculumId } = await import('../../curriculumIds.js');

          invalidateSubjectCurriculumStructureCache(
            command.householdId,
            command.subjectId,
            ctx?.schoolYearId || null,
          );
          const structure = await fetchSubjectCurriculumEventsStructure(
            command.householdId,
            command.subjectId,
            ctx?.schoolYearId || null,
          );
          const units = structure?.data?.units || [];
          let commitData = null;
          if (!units.length) {
            commitData = await addUnitToSubjectCurriculum({
              familyId: command.householdId,
              subjectId: command.subjectId,
              subjectName: command.subjectName,
              units: [],
              lessonTitle,
            });
            unitTitle = 'Unit 1';
          } else {
            const unitId = units[0]?.id || units[0]?.unit_id || 'idx-0';
            unitTitle = units[0]?.title || units[0]?.name || 'Unit';
            commitData = await addLessonToSubjectCurriculum({
              familyId: command.householdId,
              subjectId: command.subjectId,
              subjectName: command.subjectName,
              units,
              unitId,
              lessonTitle,
            });
          }
          invalidateSubjectCurriculumStructureCache(
            command.householdId,
            command.subjectId,
            ctx?.schoolYearId || null,
          );
          const lessonIds = Array.isArray(commitData?.lesson_ids) ? commitData.lesson_ids : [];
          const lastId = lessonIds.length ? String(lessonIds[lessonIds.length - 1]) : null;
          if (lastId && isPersistedCurriculumId(lastId)) {
            curriculumLessonId = lastId;
          }
        } catch (_) {
          // Curriculum APIs can fail offline; still create the one-off day + material.
          curriculumLessonId = null;
        }
      }

      // 3) One-off learning day on the chosen date
      let saved;
      try {
        saved = await saveLesson({
          familyId: command.householdId,
          title: command.title || lessonTitle,
          childIds: command.childIds,
          subjectId: command.subjectId,
          scheduleMode: 'unscheduled',
          date,
          lessonLabel: lessonTitle,
          unitTitle: unitTitle || '',
          curriculumLessonId,
          materialIds: materialId ? [materialId] : [],
        });
      } catch (saveErr) {
        // If a stale/invalid curriculum id slipped through, create the day without the FK.
        const msg = String(saveErr?.message || '');
        if (curriculumLessonId && /curriculum_lesson_id/i.test(msg)) {
          curriculumLessonId = null;
          saved = await saveLesson({
            familyId: command.householdId,
            title: command.title || lessonTitle,
            childIds: command.childIds,
            subjectId: command.subjectId,
            scheduleMode: 'unscheduled',
            date,
            lessonLabel: lessonTitle,
            unitTitle: unitTitle || '',
            curriculumLessonId: null,
            materialIds: materialId ? [materialId] : [],
          });
        } else {
          throw saveErr;
        }
      }
      const id = saved?.id || saved?.event?.id;

      if (id && materialId) {
        try {
          const { updateEvent } = await import('../../services/plannerClientWithOffline.js');
          await updateEvent(id, {
            material_id: materialId,
            materials_attachment_ids: [materialId],
          }, command.householdId);
        } catch (_) {
          // materials_attachment_ids may already be set via RPC
        }
      }

      if (id && curriculumLessonId) {
        try {
          const { linkLessonToEvent } = await import('../../subjectLessonLinking.js');
          await linkLessonToEvent({
            eventId: id,
            familyId: command.householdId,
            lessonId: curriculumLessonId,
            unitTitle,
            lessonTitle,
          });
        } catch (_) {
          // non-fatal
        }
      }

      if (id) {
        notifyEventPatched({
          id: String(id),
          title: command.title || lessonTitle,
          start_ts: saved?.start_ts,
          end_ts: saved?.end_ts,
          subject_id: command.subjectId,
          event_type: 'Lesson',
          material_id: materialId,
          materials_attachment_ids: materialId ? [materialId] : [],
          curriculum_lesson_id: curriculumLessonId,
          lesson: lessonTitle,
          date_local: command.date || null,
        });
      }

      if (typeof window !== 'undefined') {
        if (materialId) {
          window.dispatchEvent(new CustomEvent('materialUpdated', {
            detail: { materialId, familyId: command.householdId },
          }));
          window.dispatchEvent(new CustomEvent('refreshMaterials', {
            detail: { familyId: command.householdId },
          }));
        }
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshSubjectDetail', {
          detail: { subjectId: command.subjectId },
        }));
        window.dispatchEvent(new CustomEvent('refreshCalendar', {
          detail: { skipCacheClear: true },
        }));
        window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
      }

      const bits = [`Created one-off learning event for ${command.subjectName || 'subject'}`];
      if (command.date) bits.push(`on ${formatDisplayDate(command.date)}`);
      if (materialId) bits.push('with material attached');
      return {
        ok: true,
        message: `${bits.join(' ')}.`,
        affectedRecords: [
          ...(id
            ? [{
              label: command.title || lessonTitle,
              href: `/planner?event=${id}`,
              entityType: 'event',
              entityId: String(id),
            }]
            : []),
          ...(materialId
            ? [{
              label: command.fileName || 'Material',
              href: '/subjects?tab=materials',
              entityType: 'material',
              entityId: String(materialId),
            }]
            : []),
          {
            label: command.subjectName || 'Subject',
            href: `/learning?subject=${command.subjectId}`,
            entityType: 'subject',
            entityId: String(command.subjectId),
          },
        ],
        resultData: { eventId: id || null, materialId, curriculumLessonId },
      };
    } catch (err) {
      return {
        ok: false,
        message: err?.message || 'Could not create learning day.',
        error: 'execution',
      };
    }
  },
});
