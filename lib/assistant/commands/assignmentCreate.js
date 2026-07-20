import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';

function requireString(value, label) {
  const v = String(value || '').trim();
  if (!v) return { ok: false, error: `${label} is required` };
  return { ok: true, value: v };
}

registerCommand({
  type: DOODLE_COMMAND_TYPES.ASSIGNMENT_CREATE,
  auditLabel: 'Create assignment via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.ASSIGNMENT_CREATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    for (const [key, label] of [
      ['title', 'Title'],
      ['householdId', 'Household'],
      ['subjectId', 'Subject'],
    ]) {
      const check = requireString(command[key], label);
      if (!check.ok) return check;
    }
    if (!Array.isArray(command.childIds) || command.childIds.length === 0) {
      return { ok: false, error: 'At least one student is required' };
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showAssignments === false) {
      return { ok: false, error: 'Assignments are not enabled for this household.' };
    }
    if (caps.canManageEvents === false) {
      return { ok: false, error: 'You do not have permission to create assignments.' };
    }
    if (String(command.householdId) !== String(ctx.householdId)) {
      return { ok: false, error: 'Household mismatch.' };
    }
    return { ok: true };
  },

  async validate(command) {
    if (command.dueAt) {
      const due = new Date(command.dueAt);
      if (Number.isNaN(due.getTime())) {
        return { ok: false, error: 'Due date is invalid.' };
      }
    }
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Title', value: command.title, editable: true, fieldPath: 'title' },
      { label: 'Subject', value: command.subjectId, fieldPath: 'subjectId' },
      {
        label: 'Students',
        value: `${command.childIds.length} selected`,
        fieldPath: 'childIds',
      },
    ];
    if (command.dueAt) {
      const due = new Date(command.dueAt);
      fields.push({
        label: 'Due',
        value: Number.isNaN(due.getTime())
          ? command.dueAt
          : due.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
        editable: true,
        fieldPath: 'dueAt',
      });
    } else {
      fields.push({ label: 'Due', value: 'Not set', fieldPath: 'dueAt' });
    }
    if (command.pointsPossible != null) {
      fields.push({
        label: 'Points',
        value: String(command.pointsPossible),
        fieldPath: 'pointsPossible',
      });
    } else {
      fields.push({ label: 'Points', value: 'Not graded' });
    }
    if (command.instructions) {
      fields.push({ label: 'Instructions', value: command.instructions, fieldPath: 'instructions' });
    }
    if (command.attachmentId || command.fileName) {
      fields.push({ label: 'Attachment', value: command.fileName || 'Attached file' });
    }
    return fields;
  },

  async execute(command) {
    const { saveAssignment } = await import('../../create/saveEventHelpers.js');
    let materialIds = [];

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
          title: command.fileName || file.name || command.title || 'Attachment',
          mime: file.type || command.mime || 'application/octet-stream',
          bytes: file.size || command.bytes || 0,
          subjectId: command.subjectId || null,
          url: urlData?.publicUrl || null,
        });
        if (!material?.id) {
          holdDoodleAttachment(command.attachmentId, file);
          return { ok: false, message: 'Could not create material record.', error: 'execution' };
        }
        materialIds = [material.id];
        if (command.childIds?.[0]) {
          try {
            await linkMaterialToChild(material.id, command.childIds[0], command.householdId, 'planned');
          } catch (_) {
            // non-fatal
          }
        }
      } catch (err) {
        holdDoodleAttachment(command.attachmentId, file);
        return {
          ok: false,
          message: err?.message || 'Could not attach file to assignment.',
          error: 'execution',
        };
      }
    }

    const dueDate = command.dueAt ? new Date(command.dueAt) : null;
    const saved = await saveAssignment({
      familyId: command.householdId,
      title: command.title,
      childIds: command.childIds,
      subjectId: command.subjectId,
      instructions: command.instructions || '',
      dueDate,
      points: command.pointsPossible ?? null,
      gradingMode: command.pointsPossible != null ? 'points' : 'ungraded',
      materialIds,
      saveMode: 'assign',
    });

    const id = saved?.assignment?.id || saved?.event?.id || saved?.id;
    if (typeof window !== 'undefined') {
      if (materialIds[0]) {
        window.dispatchEvent(new CustomEvent('materialUpdated', {
          detail: { materialId: materialIds[0], familyId: command.householdId },
        }));
        window.dispatchEvent(new CustomEvent('refreshMaterials', {
          detail: { familyId: command.householdId },
        }));
      }
      window.dispatchEvent(new CustomEvent('refreshCalendar', {
        detail: { forceInvalidate: true },
      }));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
    }

    return {
      ok: true,
      message: materialIds.length
        ? `Created assignment “${command.title}” with attachment.`
        : `Created assignment “${command.title}”.`,
      affectedRecords: id
        ? [{
          label: command.title,
          href: `/learning?assignment=${id}`,
          entityType: 'assignment',
          entityId: String(id),
        }]
        : [],
      resultData: {
        assignmentId: id || null,
        eventId: saved?.event?.id || null,
        materialId: materialIds[0] || null,
      },
      undoToken: id ? `assignment:${id}` : undefined,
    };
  },
});
