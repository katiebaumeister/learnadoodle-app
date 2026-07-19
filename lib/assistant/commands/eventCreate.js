import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { formatDisplayDate } from './commandUtils.js';

function requireString(value, label) {
  const v = String(value || '').trim();
  if (!v) return { ok: false, error: `${label} is required` };
  return { ok: true, value: v };
}

registerCommand({
  type: DOODLE_COMMAND_TYPES.EVENT_CREATE,
  auditLabel: 'Create calendar event via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.EVENT_CREATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const title = requireString(command.title, 'Title');
    if (!title.ok) return title;
    const householdId = requireString(command.householdId, 'Household');
    if (!householdId.ok) return householdId;
    const startAt = requireString(command.startAt, 'Start date/time');
    if (!startAt.ok) return startAt;
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.canManageEvents === false) {
      return { ok: false, error: 'You do not have permission to create events.' };
    }
    if (ctx?.userRole === 'child' && caps.canManageEvents !== true) {
      return { ok: false, error: 'Creating events is not enabled for this account.' };
    }
    if (String(command.householdId) !== String(ctx.householdId)) {
      return { ok: false, error: 'Household mismatch.' };
    }
    return { ok: true };
  },

  async validate(command) {
    const start = new Date(command.startAt);
    if (Number.isNaN(start.getTime())) {
      return { ok: false, error: 'Start date is invalid.' };
    }
    if (command.endAt) {
      const end = new Date(command.endAt);
      if (Number.isNaN(end.getTime())) {
        return { ok: false, error: 'End date is invalid.' };
      }
      if (end.getTime() < start.getTime()) {
        return { ok: false, error: 'End must be after start.' };
      }
    }
    return { ok: true };
  },

  preview(command, ctx) {
    const start = new Date(command.startAt);
    const fields = [
      { label: 'Title', value: command.title, editable: true, fieldPath: 'title' },
      {
        label: 'Start',
        value: command.dateLabel
          || (Number.isNaN(start.getTime())
            ? command.startAt
            : start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: command.startTimeHm ? 'short' : undefined })),
        editable: true,
        fieldPath: 'startAt',
      },
    ];
    if (command.endDateLabel || command.endAt) {
      fields.push({
        label: 'End',
        value: command.endDateLabel || formatDisplayDate(command.endAt),
      });
    }
    if (command.startTimeHm || command.endTimeHm) {
      fields.push({
        label: 'Time',
        value: [command.startTimeHm, command.endTimeHm].filter(Boolean).join(' – ') || 'All day',
      });
    } else if (command.allDay !== false && !command.startTimeHm) {
      fields.push({ label: 'Time', value: 'All day / untimed' });
    }
    if (command.location) fields.push({ label: 'Location', value: command.location });
    if (command.description) fields.push({ label: 'Notes', value: command.description });
    if (command.recurrenceLabel) fields.push({ label: 'Repeat', value: command.recurrenceLabel });
    if (command.fileName || command.attachmentId) {
      fields.push({ label: 'Attachment', value: command.fileName || 'Attached file' });
    }
    if (command.childIds?.length) {
      fields.push({
        label: 'Family members',
        value: command.childNames || `${command.childIds.length} selected`,
        fieldPath: 'childIds',
      });
    } else if (ctx.selectedChildIds?.length) {
      fields.push({
        label: 'Family members',
        value: 'From current context',
        fieldPath: 'childIds',
      });
    }
    return fields;
  },

  async execute(command, ctx) {
    const { saveCalendarEvent } = await import('../../create/saveEventHelpers.js');
    const start = new Date(command.startAt);
    const childIds = command.childIds?.length
      ? command.childIds
      : (ctx.selectedChildIds || []);

    let materialIds = Array.isArray(command.materialIds) ? command.materialIds.filter(Boolean) : [];
    if (command.attachmentId && !materialIds.length) {
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
          title: command.fileName || file.name || command.title,
          mime: file.type || command.mime || 'application/octet-stream',
          bytes: file.size || command.bytes || 0,
          subjectId: null,
          url: urlData?.publicUrl || null,
        });
        if (!material?.id) {
          holdDoodleAttachment(command.attachmentId, file);
          return { ok: false, message: 'Could not create material record.', error: 'execution' };
        }
        materialIds = [material.id];
        if (childIds[0]) {
          try {
            await linkMaterialToChild(material.id, childIds[0], command.householdId, 'planned');
          } catch (_) {
            // non-fatal
          }
        }
      } catch (err) {
        holdDoodleAttachment(command.attachmentId, file);
        throw err;
      }
    }

    const hasTimes = Boolean(command.startTimeHm || command.endTimeHm);
    const endDate = command.endAt
      ? new Date(command.endAt)
      : null;

    const event = await saveCalendarEvent({
      familyId: command.householdId,
      title: command.title,
      childIds,
      date: start,
      startTime: command.startTimeHm || '',
      endTime: command.endTimeHm || '',
      allDay: hasTimes ? false : (command.allDay !== false),
      endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
      location: command.location || '',
      notes: command.description || '',
      materialIds,
      subjectId: command.subjectId || null,
      recurrenceRule: command.recurrenceRule || null,
    });

    const id = event?.id || event?.event_id;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
    }
    return {
      ok: true,
      message: `Created “${command.title}”.`,
      affectedRecords: id
        ? [{ label: command.title, href: `/planner?event=${id}`, entityType: 'event', entityId: String(id) }]
        : [],
      resultData: { eventId: id || null },
      undoToken: id ? `event:${id}` : undefined,
    };
  },
});
