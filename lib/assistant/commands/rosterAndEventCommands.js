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
    const childIds = Array.isArray(command.childIds) ? command.childIds.filter(Boolean) : [];
    if (!childIds.length && !command.childId) {
      return { ok: false, error: 'At least one student is required' };
    }
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
    const fields = [
      { label: 'Subject', value: command.name },
      {
        label: 'Students',
        value: command.childNames || command.childName || `${(command.childIds || [command.childId]).filter(Boolean).length} selected`,
      },
    ];
    if (command.grade) fields.push({ label: 'Grade', value: String(command.grade) });
    if (command.gradingLabel) fields.push({ label: 'Grading', value: command.gradingLabel });
    if (command.schoolYear) fields.push({ label: 'School year', value: command.schoolYear });
    if (command.schoolTerm) fields.push({ label: 'Term', value: command.schoolTerm });
    if (command.syllabusTitle) fields.push({ label: 'Syllabus / lesson plan', value: command.syllabusTitle });
    if (command.schedule) {
      fields.push({ label: 'Schedule', value: 'Configured' });
    }
    return fields;
  },

  async execute(command) {
    const { supabase } = await import('../../supabase.js');
    const { DEFAULT_GRADING_SETTINGS } = await import('../../subjectGradingSettings.js');
    const { saveSubjectGradingSettings } = await import('../../services/subjectGradingSettingsClient.js');
    const { saveSubjectAttachmentLinks } = await import('../../services/subjectMaterialLinks.js');
    const {
      applySubjectScheduleToCalendar,
      APPLY_SCOPE_FULL_YEAR,
      APPLY_SCOPE_FORWARD,
    } = await import('../../subjectConfigureSchedule.js');

    const childIds = (Array.isArray(command.childIds) && command.childIds.length
      ? command.childIds
      : [command.childId]
    ).map(String).filter(Boolean);

    let grade = command.grade || null;
    if (!grade && childIds[0]) {
      const { data: ch } = await supabase
        .from('children')
        .select('grade')
        .eq('id', childIds[0])
        .eq('family_id', command.householdId)
        .maybeSingle();
      grade = ch?.grade || null;
    }

    const row = {
      family_id: command.householdId,
      name: String(command.name).trim(),
      child_id: childIds.join(';'),
      grade,
      school_year: command.schoolYear || null,
      school_term: command.schoolTerm || null,
      notes: null,
    };
    let { data, error } = await supabase.from('subject').insert(row).select('id, name, child_id, school_year, school_term, grade').single();
    if (error && error.code === '42703') {
      const minimal = {
        family_id: row.family_id,
        name: row.name,
        child_id: row.child_id,
        notes: null,
      };
      const retry = await supabase.from('subject').insert(minimal).select('id, name, child_id, school_year, school_term, grade').single();
      data = retry.data;
      error = retry.error;
    }
    if (error || !data?.id) {
      return {
        ok: false,
        message: error?.message || 'Could not add subject.',
        error: 'execution',
      };
    }

    const subjectId = String(data.id);
    if (command.gradingMethod) {
      try {
        await saveSubjectGradingSettings(subjectId, command.householdId, {
          ...DEFAULT_GRADING_SETTINGS,
          calculation_method: command.gradingMethod,
        });
      } catch (err) {
        return {
          ok: false,
          message: err?.message || 'Subject created, but grading settings failed.',
          error: 'execution',
        };
      }
    }

    if (command.syllabusMaterialId || command.lessonPlanMaterialId) {
      try {
        await saveSubjectAttachmentLinks({
          familyId: command.householdId,
          subjectId,
          syllabusMaterialId: command.syllabusMaterialId || null,
          lessonPlanMaterialId: command.lessonPlanMaterialId || null,
        });
      } catch (err) {
        return {
          ok: false,
          message: err?.message || 'Subject created, but attachment link failed.',
          error: 'execution',
        };
      }
    }

    if (command.schedule?.weekdays?.length) {
      try {
        await applySubjectScheduleToCalendar({
          familyId: command.householdId,
          subject: data,
          assignedChildIds: childIds,
          allChildIds: childIds,
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
          message: err?.message || 'Subject created, but schedule failed.',
          error: 'execution',
        };
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      window.dispatchEvent(new CustomEvent('refreshMaterials'));
    }

    return {
      ok: true,
      message: `Added subject “${command.name}”.`,
      affectedRecords: [{
        label: command.name,
        href: `/learning?subject=${subjectId}`,
        entityType: 'subject',
        entityId: subjectId,
      }],
      resultData: { subjectId },
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
  type: DOODLE_COMMAND_TYPES.EVENT_UPDATE,
  auditLabel: 'Edit event via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.EVENT_UPDATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const id = requireString(command.eventId, 'Event');
    if (!id.ok) return id;
    const form = command.form || null;
    const updates = command.updates || null;
    if (!form && (!updates || typeof updates !== 'object')) {
      return { ok: false, error: 'Updates are required' };
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.canManageEvents === false) {
      return { ok: false, error: 'You do not have permission to edit events.' };
    }
    if (command.householdId) return requireHouseholdMatch(command.householdId, ctx);
    return { ok: true };
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Event', value: command.eventTitle || command.eventId },
    ];
    const form = command.form || {};
    const u = command.updates || {};
    if (form.title || u.title) fields.push({ label: 'Title', value: form.title || u.title });
    if (form.dateLabel) fields.push({ label: 'Date', value: form.dateLabel });
    else if (u.start_ts) fields.push({ label: 'Start', value: formatDisplayDate(u.start_ts) });
    if (form.endDateLabel) fields.push({ label: 'End date', value: form.endDateLabel });
    if (form.startTimeHm || form.endTimeHm) {
      fields.push({
        label: 'Time',
        value: [form.startTimeHm, form.endTimeHm].filter(Boolean).join(' – '),
      });
    }
    if (form.location != null) fields.push({ label: 'Location', value: form.location || '(clear)' });
    if (form.notes != null) fields.push({ label: 'Notes', value: form.notes || '(clear)' });
    if (form.childNames) fields.push({ label: 'Family members', value: form.childNames });
    if (form.recurrenceLabel) fields.push({ label: 'Repeat', value: form.recurrenceLabel });
    if (form.clearMaterial) fields.push({ label: 'Attachment', value: 'Remove' });
    else if (form.fileName) fields.push({ label: 'Attachment', value: form.fileName });
    if (u.event_type) fields.push({ label: 'Type', value: u.event_type });
    return fields;
  },

  async execute(command, ctx) {
    const familyId = command.householdId || ctx.householdId;
    const form = command.form;

    if (form) {
      try {
        let materialIds = Array.isArray(form.materialIds) ? form.materialIds.filter(Boolean) : [];
        if (form.attachmentId) {
          const { takeDoodleAttachment, holdDoodleAttachment } = await import('./attachmentHold.js');
          const { supabase } = await import('../../supabase.js');
          const { createFileMaterial, linkMaterialToChild } = await import('../../services/materialsClient.js');
          const file = takeDoodleAttachment(form.attachmentId);
          if (!file) {
            return {
              ok: false,
              message: 'Attachment expired. Re-attach the file and try again.',
              error: 'execution',
            };
          }
          try {
            const safeFileName = String(form.fileName || file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = `${familyId}/${crypto.randomUUID()}_${safeFileName}`;
            const { error: uploadError } = await supabase.storage
              .from('evidence')
              .upload(filePath, file, {
                upsert: false,
                contentType: file.type || form.mime || 'application/octet-stream',
                metadata: { family_id: familyId },
              });
            if (uploadError) {
              holdDoodleAttachment(form.attachmentId, file);
              return { ok: false, message: uploadError.message || 'Upload failed.', error: 'execution' };
            }
            const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath);
            const material = await createFileMaterial({
              familyId,
              storagePath: filePath,
              title: form.fileName || file.name || command.eventTitle || 'Attachment',
              mime: file.type || form.mime || 'application/octet-stream',
              bytes: file.size || form.bytes || 0,
              subjectId: null,
              url: urlData?.publicUrl || null,
            });
            if (!material?.id) {
              holdDoodleAttachment(form.attachmentId, file);
              return { ok: false, message: 'Could not create material record.', error: 'execution' };
            }
            materialIds = [material.id];
            if (form.childIds?.[0]) {
              try {
                await linkMaterialToChild(material.id, form.childIds[0], familyId, 'planned');
              } catch (_) {
                // non-fatal
              }
            }
          } catch (err) {
            holdDoodleAttachment(form.attachmentId, file);
            throw err;
          }
        }
        if (form.clearMaterial) materialIds = [];

        const {
          updateCalendarEvent,
          updateCalendarEventSeries,
        } = await import('../../create/saveEventHelpers.js');
        const payload = {
          eventId: command.eventId,
          familyId,
          title: form.title,
          childIds: form.childIds,
          date: form.date instanceof Date ? form.date : new Date(form.date),
          startTime: form.startTimeLabel || form.startTimeHm || '',
          endTime: form.endTimeLabel || form.endTimeHm || '',
          endDate: form.endDate || null,
          location: form.location ?? '',
          notes: form.notes ?? '',
          materialIds,
          recurrenceRule: form.recurrenceRule !== undefined ? form.recurrenceRule : null,
        };
        if (command.editScope === 'series') {
          await updateCalendarEventSeries(payload);
        } else {
          await updateCalendarEvent(payload);
        }
      } catch (err) {
        return {
          ok: false,
          message: err?.message || 'Could not update event.',
          error: 'execution',
        };
      }
    } else {
      const { executeChatUpdateEvent } = await import('../eventChatActions.js');
      const result = await executeChatUpdateEvent(
        command.eventId,
        command.updates,
        false,
        familyId,
      );
      if (!result?.success) {
        return { ok: false, message: result?.error || 'Could not update event.', error: 'execution' };
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
    }
    return {
      ok: true,
      message: `Updated “${command.form?.title || command.eventTitle || 'event'}”.`,
      affectedRecords: [{
        label: command.form?.title || command.updates?.title || command.eventTitle || 'Event',
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
    const dateList = Array.isArray(command.dates) && command.dates.length
      ? command.dates
      : (command.date ? [command.date] : []);
    const whenLabel = dateList.length > 1
      ? dateList.map((d) => formatDisplayDate(d)).join(', ')
      : (dateList[0] ? formatDisplayDate(dateList[0]) : 'Today');
    const fields = [
      { label: 'Subject', value: command.subjectName || command.subjectId },
      { label: dateList.length > 1 ? 'Days' : 'When', value: whenLabel },
      {
        label: 'Type',
        value: dateList.length > 1
          ? `${dateList.length} one-off learning events`
          : 'One-off learning event',
      },
    ];
    if (command.startTimeHm) {
      fields.push({ label: 'Time', value: command.startTimeHm });
    }
    if (command.durationMinutes) {
      fields.push({ label: 'Duration', value: `${command.durationMinutes} min` });
    }
    if (command.description) {
      fields.push({ label: 'Session notes', value: command.description });
    }
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

      // 3) One-off learning day(s) on the chosen date(s)
      const dateList = (Array.isArray(command.dates) && command.dates.length
        ? command.dates
        : [command.date || toYmdSafe(new Date())]
      ).map((d) => String(d).slice(0, 10)).filter(Boolean);
      const createdIds = [];

      for (const dateYmd of dateList) {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)
          ? new Date(`${dateYmd}T12:00:00`)
          : new Date(dateYmd);
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

        // Optional Learning day modal fields on create: time, duration, session notes
        if (id && (command.startTimeHm || command.durationMinutes || command.description)) {
          try {
            const { updateEvent } = await import('../../services/plannerClientWithOffline.js');
            if (command.startTimeHm || command.durationMinutes) {
              const { applyLearningDayTimeOverride } = await import('../../learningDaySessionHelpers.js');
              await applyLearningDayTimeOverride({
                eventId: id,
                familyId: command.householdId,
                event: {
                  start_ts: saved?.start_ts,
                  end_ts: saved?.end_ts,
                  minutes: command.durationMinutes || 60,
                },
                startTimeHm: command.startTimeHm || '12:00',
                durationMinutes: command.durationMinutes || 60,
                sessionDateYmd: dateYmd,
              });
            }
            if (command.description) {
              await updateEvent(id, {
                description: String(command.description).trim() || null,
                is_flexible: false,
              }, command.householdId);
            } else if (command.startTimeHm || command.durationMinutes) {
              await updateEvent(id, { is_flexible: false }, command.householdId);
            }
          } catch (_) {
            // non-fatal — day still created
          }
        }

        if (id) {
          createdIds.push(String(id));
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
            date_local: dateYmd,
          });
        }
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
          detail: { forceInvalidate: true },
        }));
        window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
      }

      const id = createdIds[0] || null;
      const whenBits = dateList.length > 1
        ? `on ${dateList.map((d) => formatDisplayDate(d)).join(', ')}`
        : (dateList[0] ? `on ${formatDisplayDate(dateList[0])}` : '');
      const bits = [
        createdIds.length > 1
          ? `Created ${createdIds.length} learning days for ${command.subjectName || 'subject'}`
          : `Created one-off learning event for ${command.subjectName || 'subject'}`,
      ];
      if (whenBits) bits.push(whenBits);
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
        resultData: {
          eventId: id,
          eventIds: createdIds,
          materialId,
          curriculumLessonId,
          dates: dateList,
        },
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

function toYmdSafe(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}