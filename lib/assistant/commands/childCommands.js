import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { requireHouseholdMatch, requireString } from './commandUtils.js';

function parentOnly(ctx, action = 'manage children') {
  if (ctx.userRole !== 'parent') {
    return { ok: false, error: `Only parents can ${action}.` };
  }
  return { ok: true };
}

/** Keep Settings → Family and WebLayout children in sync after Doodle roster changes. */
function notifyFamilyChildrenChanged(detail = {}) {
  if (typeof window === 'undefined') return;
  try {
    // Bust family-members API cache so Settings doesn't keep the pre-add list.
    import('../../apiClient.js').then((mod) => {
      try { mod.clearFamilyMembersCache?.(); } catch (_) { /* ignore */ }
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent('refreshChildren', { detail }));
    window.dispatchEvent(new CustomEvent('refreshFamily', { detail }));
  } catch (_) {
    // ignore
  }
}

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
    if (command.age == null && !command.gradeLabel) {
      return { ok: false, error: 'Age or grade is required' };
    }
    return { ok: true };
  },

  authorize(command, ctx) {
    const role = parentOnly(ctx, 'add children');
    if (!role.ok) return role;
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    if (command.age != null) {
      const age = Number(command.age);
      if (!Number.isInteger(age) || age < 3 || age > 20) {
        return { ok: false, error: 'Age must be between 3 and 20.' };
      }
    }
    return { ok: true };
  },

  preview(command) {
    const fields = [{ label: 'Name', value: command.name }];
    if (command.age != null) fields.push({ label: 'Age', value: String(command.age) });
    if (command.gradeLabel) fields.push({ label: 'Grade', value: command.gradeLabel });
    if (command.avatar) fields.push({ label: 'Avatar', value: command.avatar });
    if (Array.isArray(command.interests) && command.interests.length) {
      fields.push({ label: 'Interests', value: command.interests.join(', ') });
    }
    if (command.notes) fields.push({ label: 'Notes', value: command.notes });
    return fields;
  },

  async execute(command) {
    const { addChild } = await import('../../apiClient.js');
    const payload = {
      family_id: command.householdId,
      name: command.name,
      grade_label: command.gradeLabel || null,
      age: command.age != null ? Number(command.age) : undefined,
      avatar_url: command.avatar || undefined,
      interests: Array.isArray(command.interests) ? command.interests : undefined,
    };
    if (command.notes) {
      payload.support_notes = command.notes;
    }
    const result = await addChild(payload);
    if (result?.error) {
      return {
        ok: false,
        message: result.error?.message || result.error || 'Could not add child.',
        error: 'execution',
      };
    }
    const created = result?.data || result;
    const id = created?.id || created?.child?.id;
    notifyFamilyChildrenChanged({
      reason: 'child.create',
      childId: id ? String(id) : null,
      familyId: command.householdId,
    });
    return {
      ok: true,
      message: `Added learner “${command.name}”.`,
      affectedRecords: [{
        label: command.name,
        href: id ? `/?child=${id}` : '/settings',
        entityType: 'child',
        entityId: id ? String(id) : undefined,
      }],
      resultData: { childId: id || null },
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.CHILD_UPDATE,
  auditLabel: 'Update child via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.CHILD_UPDATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const child = requireString(command.childId, 'Child');
    if (!child.ok) return child;
    if (!command.patch || typeof command.patch !== 'object' || !Object.keys(command.patch).length) {
      return { ok: false, error: 'Nothing to update' };
    }
    return { ok: true };
  },

  authorize(command, ctx) {
    const role = parentOnly(ctx, 'edit children');
    if (!role.ok) return role;
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    if (command.patch?.age != null) {
      const age = Number(command.patch.age);
      if (!Number.isInteger(age) || age < 3 || age > 20) {
        return { ok: false, error: 'Age must be between 3 and 20.' };
      }
    }
    return { ok: true };
  },

  preview(command) {
    const rows = [{ label: 'Child', value: command.childName || 'Learner' }];
    const patch = command.patch || {};
    if (patch.first_name) rows.push({ label: 'Name', value: patch.first_name });
    if (patch.age != null) rows.push({ label: 'Age', value: String(patch.age) });
    if (patch.grade != null) rows.push({ label: 'Grade', value: String(patch.grade) });
    if (patch.avatar) rows.push({ label: 'Avatar', value: patch.avatar });
    if (Array.isArray(patch.interests)) {
      rows.push({ label: 'Interests', value: patch.interests.join(', ') || '(clear)' });
    }
    if (patch.notes != null) rows.push({ label: 'Notes', value: patch.notes || '(clear)' });
    return rows;
  },

  async execute(command) {
    const { executeUpdateChildChat } = await import('../familyRosterChatActions.js');
    const result = await executeUpdateChildChat(
      command.householdId,
      command.childId,
      command.patch || {},
    );
    if (!result?.success) {
      return {
        ok: false,
        message: result?.error || 'Could not update child.',
        error: 'execution',
      };
    }
    notifyFamilyChildrenChanged({
      reason: 'child.update',
      childId: String(command.childId),
      familyId: command.householdId,
    });
    return {
      ok: true,
      message: `Updated “${command.childName || 'learner'}”.`,
      affectedRecords: [{
        label: command.childName || 'Open family',
        href: '/settings',
        entityType: 'child',
        entityId: String(command.childId),
      }],
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.CHILD_DELETE,
  auditLabel: 'Delete child via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.CHILD_DELETE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const child = requireString(command.childId, 'Child');
    if (!child.ok) return child;
    return requireString(command.confirmName, 'Confirm name');
  },

  authorize(command, ctx) {
    const role = parentOnly(ctx, 'delete children');
    if (!role.ok) return role;
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    const expected = String(command.childName || '').trim().toLowerCase();
    const got = String(command.confirmName || '').trim().toLowerCase();
    if (expected && got && expected !== got) {
      return { ok: false, error: 'Confirmation name must match the learner’s name exactly.' };
    }
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Child', value: command.childName || 'Learner' },
      { label: 'Action', value: 'Permanently delete student' },
      { label: 'Confirm as', value: command.confirmName || '—' },
    ];
  },

  async execute(command) {
    const { permanentDeleteChild } = await import('../../apiClient.js');
    const result = await permanentDeleteChild({
      childId: command.childId,
      confirmName: command.confirmName,
    });
    if (result?.error) {
      return {
        ok: false,
        message: result.error?.message || result.error || 'Could not delete child.',
        error: 'execution',
      };
    }
    notifyFamilyChildrenChanged({
      reason: 'child.delete',
      childId: String(command.childId),
      familyId: command.householdId,
    });
    return {
      ok: true,
      message: `Permanently removed “${command.childName || command.confirmName}”.`,
      affectedRecords: [{
        label: 'Open family',
        href: '/settings',
        entityType: 'child',
      }],
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.CHILD_INVITE,
  auditLabel: 'Invite child via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.CHILD_INVITE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const child = requireString(command.childId, 'Child');
    if (!child.ok) return child;
    const email = requireString(command.email, 'Email');
    if (!email.ok) return email;
    return { ok: true };
  },

  authorize(command, ctx) {
    const role = parentOnly(ctx, 'invite children');
    if (!role.ok) return role;
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    const email = String(command.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Enter a valid email address.' };
    }
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Child', value: command.childName || 'Learner' },
      { label: 'Invite email', value: command.email },
      { label: 'Action', value: 'Send login invite' },
    ];
  },

  async execute(command) {
    const { inviteTutor } = await import('../../apiClient.js');
    const { DEFAULT_CHILD_PROFILE } = await import('../../permissions/userPermissionProfiles.js');
    const result = await inviteTutor({
      email: String(command.email).trim(),
      role: 'child',
      child_ids: [command.childId],
      child_permission_profile: DEFAULT_CHILD_PROFILE,
    });
    if (result?.error) {
      return {
        ok: false,
        message: result.error?.message || result.error || 'Could not send invite.',
        error: 'execution',
      };
    }
    notifyFamilyChildrenChanged({
      reason: 'child.invite',
      childId: String(command.childId),
      familyId: command.householdId,
    });
    return {
      ok: true,
      message: `Invite sent to ${command.email} for “${command.childName || 'learner'}”.`,
      affectedRecords: [{
        label: 'Open family',
        href: '/settings',
        entityType: 'child',
        entityId: String(command.childId),
      }],
    };
  },
});
