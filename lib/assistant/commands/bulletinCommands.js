import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { requireHouseholdMatch, requireString } from './commandUtils.js';

function visibilityLabel(visibility) {
  if (visibility === 'self') return 'Only me';
  if (visibility === 'selected') return 'Selected members';
  return 'All members';
}

function boardLabel(command) {
  if (command.subjectName) return `${command.subjectName} bulletin`;
  if (command.subjectId) return 'Subject bulletin';
  return 'Home bulletin';
}

function notifyBulletinRefresh(familyId) {
  try {
    const { invalidateBulletinPostsCache } = require('../../bulletinBoardCache.js');
    invalidateBulletinPostsCache?.(familyId);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('refreshBulletinBoard', { detail: { familyId } }));
  }
}

function authorizeBulletinWrite(command, ctx, caps = {}) {
  if (ctx.userRole === 'child' && caps.canPostBulletin === false) {
    return { ok: false, error: 'You do not have permission to post on the bulletin.' };
  }
  // Match UI: parents create freely; tutors/children allowed if not explicitly blocked.
  return requireHouseholdMatch(command.householdId, ctx);
}

registerCommand({
  type: DOODLE_COMMAND_TYPES.BULLETIN_POST_CREATE,
  auditLabel: 'Create bulletin post via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.BULLETIN_POST_CREATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const body = requireString(command.body, 'Message');
    if (!body.ok) return body;
    const visibility = String(command.visibility || 'all');
    if (!['all', 'self', 'selected'].includes(visibility)) {
      return { ok: false, error: 'Invalid audience' };
    }
    if (visibility === 'selected') {
      const users = Array.isArray(command.audienceUserIds) ? command.audienceUserIds : [];
      const children = Array.isArray(command.audienceChildIds) ? command.audienceChildIds : [];
      if (!users.length && !children.length) {
        return { ok: false, error: 'Select at least one member to share with' };
      }
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    return authorizeBulletinWrite(command, ctx, caps);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    const rows = [
      { label: 'Board', value: boardLabel(command) },
      { label: 'Share with', value: visibilityLabel(command.visibility) },
      { label: 'Message', value: String(command.body || '').slice(0, 160) },
    ];
    if (command.audienceLabel) {
      rows.splice(2, 0, { label: 'Members', value: command.audienceLabel });
    }
    if (Array.isArray(command.materialIds) && command.materialIds.length) {
      rows.push({ label: 'Attachments', value: `${command.materialIds.length} selected` });
    }
    return rows;
  },

  async execute(command) {
    const { createBulletinPost } = await import('../../services/bulletinClient.js');
    const { data, error } = await createBulletinPost({
      familyId: command.householdId,
      body: command.body,
      subjectId: command.subjectId || null,
      visibility: command.visibility || 'all',
      audienceUserIds: command.audienceUserIds || [],
      audienceChildIds: command.audienceChildIds || [],
      materialIds: command.materialIds || [],
      source: 'user',
    });
    if (error) {
      return {
        ok: false,
        message: error.message || 'Could not post announcement.',
        error: 'execution',
      };
    }
    notifyBulletinRefresh(command.householdId);
    return {
      ok: true,
      message: `Posted to ${boardLabel(command)}.`,
      affectedRecords: [{
        label: command.subjectId ? 'Open subject bulletin' : 'Open Home',
        href: command.subjectId ? `/learning?subject=${command.subjectId}` : '/',
        entityType: 'bulletin_post',
        entityId: data?.id ? String(data.id) : undefined,
      }],
      resultData: { postId: data?.id || null },
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.BULLETIN_POST_UPDATE,
  auditLabel: 'Update bulletin post via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.BULLETIN_POST_UPDATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const post = requireString(command.postId, 'Post');
    if (!post.ok) return post;
    return requireString(command.body, 'Message');
  },

  authorize(command, ctx, caps = {}) {
    return authorizeBulletinWrite(command, ctx, caps);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    const rows = [
      { label: 'Post', value: command.postPreview || 'Your announcement' },
      { label: 'Board', value: boardLabel(command) },
      { label: 'Share with', value: visibilityLabel(command.visibility) },
      { label: 'Message', value: String(command.body || '').slice(0, 160) },
    ];
    if (command.audienceLabel) {
      rows.splice(3, 0, { label: 'Members', value: command.audienceLabel });
    }
    return rows;
  },

  async execute(command) {
    const { updateBulletinPost } = await import('../../services/bulletinClient.js');
    const patch = {
      postId: command.postId,
      body: command.body,
      subjectId: command.subjectId || null,
      visibility: command.visibility || 'all',
      audienceUserIds: command.audienceUserIds || [],
      audienceChildIds: command.audienceChildIds || [],
    };
    if (Array.isArray(command.materialIds)) {
      patch.materialIds = command.materialIds;
    }
    const { data, error } = await updateBulletinPost(patch);
    if (error) {
      return {
        ok: false,
        message: error.message || 'Could not update announcement. You can only edit posts you created.',
        error: 'execution',
      };
    }
    notifyBulletinRefresh(command.householdId);
    return {
      ok: true,
      message: 'Updated your announcement.',
      affectedRecords: [{
        label: command.subjectId ? 'Open subject bulletin' : 'Open Home',
        href: command.subjectId ? `/learning?subject=${command.subjectId}` : '/',
        entityType: 'bulletin_post',
        entityId: data?.id ? String(data.id) : String(command.postId),
      }],
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.BULLETIN_POST_DELETE,
  auditLabel: 'Delete bulletin post via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.BULLETIN_POST_DELETE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    return requireString(command.postId, 'Post');
  },

  authorize(command, ctx, caps = {}) {
    return authorizeBulletinWrite(command, ctx, caps);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Post', value: command.postPreview || 'Your announcement' },
      { label: 'Action', value: 'Delete announcement' },
    ];
  },

  async execute(command) {
    const { supabase } = await import('../../supabase.js');
    const { deleteBulletinPost } = await import('../../services/bulletinClient.js');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return { ok: false, message: 'Not signed in.', error: 'unauthorized' };
    }

    const { data: row, error: loadError } = await supabase
      .from('family_bulletin_posts')
      .select('id, author_user_id, source, family_id')
      .eq('id', command.postId)
      .maybeSingle();
    if (loadError || !row) {
      return { ok: false, message: 'That announcement could not be found.', error: 'execution' };
    }
    if (String(row.family_id) !== String(command.householdId)) {
      return { ok: false, message: 'Household mismatch.', error: 'unauthorized' };
    }
    if (row.source === 'learnadoodle') {
      return { ok: false, message: 'System announcements cannot be deleted.', error: 'unauthorized' };
    }
    // Match UI: only the author deletes their own posts from chat.
    if (String(row.author_user_id) !== String(user.id)) {
      return {
        ok: false,
        message: 'You can only delete announcements you posted.',
        error: 'unauthorized',
      };
    }

    const { error } = await deleteBulletinPost(command.postId);
    if (error) {
      return {
        ok: false,
        message: error.message || 'Could not delete announcement.',
        error: 'execution',
      };
    }
    notifyBulletinRefresh(command.householdId);
    return {
      ok: true,
      message: 'Deleted your announcement.',
      affectedRecords: [{
        label: 'Open Home',
        href: '/',
        entityType: 'bulletin_post',
      }],
    };
  },
});
