import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { requireHouseholdMatch, requireString } from './commandUtils.js';

registerCommand({
  type: DOODLE_COMMAND_TYPES.MATERIAL_CREATE_LINK,
  auditLabel: 'Add material link via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.MATERIAL_CREATE_LINK) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const url = requireString(command.providerUrl, 'URL');
    if (!url.ok) return url;
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showMaterials === false || caps.canViewLibrary === false) {
      return { ok: false, error: 'Materials are not available for this account.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    try {
      // eslint-disable-next-line no-new
      new URL(command.providerUrl);
    } catch {
      return { ok: false, error: 'URL looks invalid.' };
    }
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Title', value: command.title || 'Link' },
      { label: 'URL', value: command.providerUrl },
    ];
    if (command.childIds?.length) {
      fields.push({ label: 'Learner', value: `${command.childIds.length} selected` });
    }
    if (command.subjectId) {
      fields.push({ label: 'Subject', value: command.subjectName || command.subjectId });
    }
    return fields;
  },

  async execute(command) {
    const { executeCreateLinkMaterialChat } = await import('../materialChatActions.js');
    const result = await executeCreateLinkMaterialChat(command.householdId, {
      title: command.title || 'Link',
      providerUrl: command.providerUrl,
      childId: command.childIds?.[0] || null,
      subjectId: command.subjectId || null,
    });
    if (!result?.success) {
      return { ok: false, message: result?.error || 'Could not add material.', error: 'execution' };
    }
    return {
      ok: true,
      message: result.userMessage || `Added “${command.title || 'Link'}” to materials.`,
      affectedRecords: result.materialId
        ? [{
          label: command.title || 'Material',
          href: '/subjects?tab=materials',
          entityType: 'material',
          entityId: String(result.materialId),
        }]
        : [{ label: 'Open Materials', href: '/subjects?tab=materials', entityType: 'material' }],
      resultData: { materialId: result.materialId || null },
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.MATERIAL_CREATE_FILE,
  auditLabel: 'Upload material file via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.MATERIAL_CREATE_FILE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const att = requireString(command.attachmentId, 'Attachment');
    if (!att.ok) return att;
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showMaterials === false || caps.canViewLibrary === false) {
      return { ok: false, error: 'Materials are not available for this account.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    const { peekDoodleAttachment } = await import('./attachmentHold.js');
    if (!peekDoodleAttachment(command.attachmentId)) {
      return { ok: false, error: 'Attachment expired. Re-attach the file and try again.' };
    }
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'File', value: command.fileName || 'Attachment' },
      { label: 'Type', value: command.mimeLabel || command.mime || 'File' },
    ];
    if (command.bytes) {
      const kb = Math.max(1, Math.round(Number(command.bytes) / 1024));
      fields.push({ label: 'Size', value: kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB` });
    }
    if (command.subjectId || command.subjectName) {
      fields.push({ label: 'Subject', value: command.subjectName || command.subjectId });
    }
    if (command.documentRole === 'syllabus') {
      fields.push({ label: 'Attachment', value: 'Syllabus' });
    } else if (command.documentRole === 'lesson_plan') {
      fields.push({ label: 'Attachment', value: 'Lesson plan' });
    }
    if (command.childIds?.length) {
      fields.push({ label: 'Learner', value: `${command.childIds.length} selected` });
    }
    return fields;
  },

  async execute(command) {
    const { takeDoodleAttachment, holdDoodleAttachment } = await import('./attachmentHold.js');
    const file = takeDoodleAttachment(command.attachmentId);
    if (!file) {
      return {
        ok: false,
        message: 'Attachment expired. Re-attach the file and try again.',
        error: 'execution',
      };
    }

    try {
      const { supabase } = await import('../../supabase.js');
      const { createFileMaterial, linkMaterialToChild } = await import('../../services/materialsClient.js');
      const { roleToUploadTags, DOCUMENT_ROLES } = await import('../../docs/roles.js');

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
      const tags = command.documentRole
        ? roleToUploadTags(command.documentRole)
        : [];
      const material = await createFileMaterial({
        familyId: command.householdId,
        storagePath: filePath,
        title: command.title || command.fileName || file.name || 'Attachment',
        mime: file.type || command.mime || 'application/octet-stream',
        bytes: file.size || command.bytes || 0,
        subjectId: command.subjectId || null,
        tags,
        url: urlData?.publicUrl || null,
      });

      if (!material?.id) {
        holdDoodleAttachment(command.attachmentId, file);
        return { ok: false, message: 'Could not create material record.', error: 'execution' };
      }

      if (command.childIds?.length) {
        try {
          await Promise.all(
            command.childIds.map((childId) =>
              linkMaterialToChild(material.id, childId, command.householdId, 'planned')
            )
          );
        } catch (_) {
          // non-fatal
        }
      }

      if (command.linkAsSubjectAttachment && command.subjectId) {
        try {
          const {
            loadSubjectAttachmentIds,
            saveSubjectAttachmentLinks,
          } = await import('../../services/subjectMaterialLinks.js');
          const existing = await loadSubjectAttachmentIds(
            String(command.subjectId),
            command.householdId,
          );
          const isSyllabus = command.documentRole === DOCUMENT_ROLES.SYLLABUS
            || command.documentRole === 'syllabus';
          await saveSubjectAttachmentLinks({
            familyId: command.householdId,
            subjectId: String(command.subjectId),
            syllabusMaterialId: isSyllabus
              ? String(material.id)
              : (existing.syllabusMaterialId || null),
            lessonPlanMaterialId: isSyllabus
              ? (existing.lessonPlanMaterialId || null)
              : String(material.id),
          });
        } catch (_) {
          // Material is saved with subject_id; picker link is best-effort.
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('materialUpdated', {
          detail: { materialId: material.id, familyId: command.householdId },
        }));
        window.dispatchEvent(new CustomEvent('refreshMaterials', {
          detail: { familyId: command.householdId },
        }));
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        if (command.subjectId) {
          window.dispatchEvent(new CustomEvent('refreshSubjectDetail', {
            detail: { subjectId: String(command.subjectId) },
          }));
        }
      }

      const subjectBit = command.subjectName ? ` for ${command.subjectName}` : '';
      const roleBit = command.documentRole === 'syllabus'
        ? ' as syllabus'
        : (command.documentRole === 'lesson_plan' ? ' as lesson plan' : '');
      return {
        ok: true,
        message: `Added “${command.title || command.fileName || 'file'}” to Materials${subjectBit}${roleBit}.`,
        affectedRecords: [
          {
            label: command.title || command.fileName || 'Material',
            href: '/subjects?tab=materials',
            entityType: 'material',
            entityId: String(material.id),
          },
          ...(command.subjectId ? [{
            label: command.subjectName || 'Subject',
            href: `/learning?subject=${command.subjectId}`,
            entityType: 'subject',
            entityId: String(command.subjectId),
          }] : []),
        ],
        resultData: { materialId: material.id, subjectId: command.subjectId || null },
      };
    } catch (err) {
      holdDoodleAttachment(command.attachmentId, file);
      return {
        ok: false,
        message: err?.message || 'Could not save that file to Materials.',
        error: 'execution',
      };
    }
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.MATERIAL_RENAME,
  auditLabel: 'Rename material via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.MATERIAL_RENAME) {
      return { ok: false, error: 'Wrong command type' };
    }
    const id = requireString(command.materialId, 'Material');
    if (!id.ok) return id;
    const title = requireString(command.newTitle, 'New title');
    if (!title.ok) return title;
    return { ok: true };
  },

  authorize(_command, ctx, caps = {}) {
    if (caps.showMaterials === false) {
      return { ok: false, error: 'Materials are not available for this household.' };
    }
    if (ctx.userRole === 'child' && caps.canManageMaterials === false) {
      return { ok: false, error: 'You do not have permission to rename materials.' };
    }
    return { ok: true };
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Current', value: command.currentTitle || command.materialId },
      { label: 'New title', value: command.newTitle },
    ];
  },

  async execute(command) {
    const { executeRenameMaterialChat } = await import('../materialChatActions.js');
    const result = await executeRenameMaterialChat(command.materialId, command.newTitle);
    if (!result?.success) {
      return { ok: false, message: result?.error || 'Could not rename material.', error: 'execution' };
    }
    return {
      ok: true,
      message: `Renamed material to “${command.newTitle}”.`,
      affectedRecords: [{
        label: command.newTitle,
        href: '/subjects?tab=materials',
        entityType: 'material',
        entityId: String(command.materialId),
      }],
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.MATERIAL_ARCHIVE,
  auditLabel: 'Archive material via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.MATERIAL_ARCHIVE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const id = requireString(command.materialId, 'Material');
    if (!id.ok) return id;
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showMaterials === false) {
      return { ok: false, error: 'Materials are not available for this household.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Material', value: command.title || command.materialId },
      { label: 'Action', value: 'Archive (can restore from Materials trash)' },
    ];
  },

  async execute(command) {
    const { executeArchiveMaterialChat } = await import('../materialChatActions.js');
    const result = await executeArchiveMaterialChat(command.householdId, command.materialId);
    if (!result?.success) {
      return { ok: false, message: result?.error || 'Could not archive material.', error: 'execution' };
    }
    return {
      ok: true,
      message: `Archived “${command.title || 'material'}”.`,
      affectedRecords: [{
        label: 'Open Materials',
        href: '/subjects?tab=materials',
        entityType: 'material',
        entityId: String(command.materialId),
      }],
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.MATERIAL_ARCHIVE_ALL,
  auditLabel: 'Archive all materials via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.MATERIAL_ARCHIVE_ALL) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showMaterials === false || caps.canViewLibrary === false) {
      return { ok: false, error: 'Materials are not available for this account.' };
    }
    if (ctx.userRole === 'child') {
      return { ok: false, error: 'Only parents and tutors can delete all materials.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    const count = Number(command.count) || (command.materialIds || []).length || 0;
    const titles = Array.isArray(command.titles) ? command.titles : [];
    const fields = [
      { label: 'Count', value: String(count) },
      { label: 'Action', value: 'Archive all (can restore from Materials trash)' },
    ];
    if (titles.length) {
      const more = Number(command.moreCount) > 0 ? ` (+${command.moreCount} more)` : '';
      fields.push({ label: 'Items', value: `${titles.join(', ')}${more}` });
    }
    return fields;
  },

  async execute(command) {
    const { executeArchiveAllMaterialsChat } = await import('../materialChatActions.js');
    const result = await executeArchiveAllMaterialsChat(
      command.householdId,
      command.materialIds || [],
    );
    if (!result?.success) {
      return { ok: false, message: result?.error || 'Could not delete materials.', error: 'execution' };
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshMaterials', {
        detail: { familyId: command.householdId },
      }));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
    }
    return {
      ok: true,
      message: result.userMessage || `Removed ${result.archived || 0} materials.`,
      affectedRecords: [{
        label: 'Open Materials',
        href: '/subjects?tab=materials',
        entityType: 'material',
      }],
      resultData: { archived: result.archived || 0 },
    };
  },
});
