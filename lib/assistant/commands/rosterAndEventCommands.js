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
    return [
      { label: 'Subject', value: command.subjectName || command.subjectId },
      { label: 'Students', value: `${command.childIds.length} selected` },
      { label: 'Date', value: command.date ? formatDisplayDate(command.date) : 'Unscheduled / today' },
      { label: 'Title', value: command.title || 'Learning day' },
    ];
  },

  async execute(command) {
    const { saveLesson } = await import('../../create/saveEventHelpers.js');
    try {
      const date = command.date ? new Date(command.date) : new Date();
      const saved = await saveLesson({
        familyId: command.householdId,
        title: command.title || 'Learning day',
        childIds: command.childIds,
        subjectId: command.subjectId,
        scheduleMode: 'unscheduled',
        date,
      });
      const id = saved?.id || saved?.event?.id;
      return {
        ok: true,
        message: `Created learning day for ${command.subjectName || 'subject'}.`,
        affectedRecords: id
          ? [{
            label: command.title || 'Learning day',
            href: `/planner?event=${id}`,
            entityType: 'event',
            entityId: String(id),
          }]
          : [{ label: 'Open Planner', href: '/planner', entityType: 'event' }],
        resultData: { eventId: id || null },
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
