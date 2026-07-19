/**
 * Natural-language → action_preview / clarification for bulletin announcements.
 */
import { DOODLE_COMMAND_TYPES, DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { getCommand } from './registry.js';
import { newIdempotencyKey } from './commandUtils.js';
import {
  findSubjectMentionedInMessage,
  resolveChildByName,
  resolveSubjectByName,
} from './entityResolve.js';

/** Local copy of subjectsClient.parseChildIds (avoid importing supabase via that module in tests). */
function parseChildIds(childIdString) {
  if (Array.isArray(childIdString)) {
    return childIdString.map(String).map((id) => id.trim()).filter(Boolean);
  }
  if (!childIdString || String(childIdString).trim() === '') return [];
  return String(childIdString).split(';').map((id) => id.trim()).filter(Boolean);
}

function withClarificationMeta(response, meta) {
  if (response.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

function previewSnippet(body, max = 72) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Announcement';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function isBulletinPostDeleteIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(delete|remove)\b/.test(lower)) return false;
  if (/\b(assignment|event|subject|child|learner|student|day\s*off|learning\s*day|material)\b/.test(lower)) {
    return false;
  }
  return /\b(announcement|bulletin(\s+post)?|post\s+on\s+(the\s+)?bulletin)\b/.test(lower)
    || (/\b(delete|remove)\b/.test(lower) && /\bmy\s+(last\s+)?post\b/.test(lower));
}

export function isBulletinPostUpdateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (isBulletinPostDeleteIntent(message)) return false;
  if (!/\b(edit|update|change|rewrite)\b/.test(lower)) return false;
  if (/\b(assignment|event|subject|child|learner|student|day\s*off|learning\s*day)\b/.test(lower)) {
    return false;
  }
  return /\b(announcement|bulletin(\s+post)?|post)\b/.test(lower);
}

export function isBulletinPostCreateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (isBulletinPostDeleteIntent(message) || isBulletinPostUpdateIntent(message)) return false;
  if (/\b(assignment|event|material|subject|child|learner|student|day\s*off|learning\s*day)\b/.test(lower)) {
    return false;
  }
  if (/\b(post|share|announce|create|add)\b/.test(lower) && /\bannouncement\b/.test(lower)) {
    return true;
  }
  if (/\b(post|share|announce)\b/.test(lower) && /\bbulletin\b/.test(lower)) {
    return true;
  }
  if (/\bannounce\b/.test(lower) && /\bthat\b/.test(lower)) return true;
  return false;
}

function parseBulletinBody(message, overrides = {}) {
  if (overrides.body) return String(overrides.body).trim();
  const raw = String(message || '').trim();

  const quoted = raw.match(/["“]([^"”]+)["”]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  // Prefer text after the last colon when the lead-in mentions announcement/bulletin/post.
  const colonIdx = raw.lastIndexOf(':');
  if (colonIdx >= 0) {
    const before = raw.slice(0, colonIdx).toLowerCase();
    const after = raw.slice(colonIdx + 1).trim();
    if (after && /\b(announcement|bulletin|message|post|announce)\b/.test(before)) {
      return after;
    }
  }

  const announceThat = raw.match(/\bannounce\s+that\s+(.+)$/i);
  if (announceThat?.[1]?.trim()) return announceThat[1].trim();

  const postThat = raw.match(
    /\b(?:post|share)\s+(?:an?\s+)?(?:announcement|bulletin\s+post)\s+(?:on\s+(?:the\s+)?(?:home|subject)\s+bulletin\s+)?(?:that\s+)?(.+)$/i,
  );
  if (postThat?.[1]?.trim()) {
    let body = postThat[1].trim();
    body = body
      .replace(/^(?:to|on)\s+(?:the\s+)?(?:home\s+)?bulletin\s+/i, '')
      .replace(/^(?:to|on)\s+[A-Za-z][\w' -]{1,40}\s+bulletin\s+/i, '')
      .replace(/^(?:for|with)\s+(?:everyone|all\s+members|all\s+in\s+class|only\s+me|selected)\s+/i, '')
      .replace(/^(?:for|with)\s+[A-Za-z][\w'-]*(?:\s*(?:,|and|&)\s*[A-Za-z][\w'-]*)*\s+/i, '')
      .replace(/^called\s+/i, '')
      .replace(/^saying\s+/i, '')
      .trim();
    // Drop trailing audience / board phrases
    body = body
      .replace(/\s+for\s+(?:everyone|all\s+members|all\s+in\s+class|only\s+me)\s*$/i, '')
      .replace(/\s+on\s+(?:the\s+)?(?:home\s+)?bulletin\s*$/i, '')
      .replace(/\s+on\s+[A-Za-z][\w' -]{1,40}\s+bulletin\s*$/i, '')
      .trim();
    if (body && !/^(?:to|on|for|with)\b/i.test(body) && body.length > 2) return body;
  }

  const saying = raw.match(/\b(?:saying|that\s+says)\s+(.+)$/i);
  if (saying?.[1]?.trim()) return saying[1].trim();

  return null;
}

function parseVisibilityHint(message, overrides = {}) {
  if (overrides.visibility) return String(overrides.visibility);
  const lower = String(message || '').toLowerCase();
  if (/\b(only\s+me|just\s+me|private|myself)\b/.test(lower)) return 'self';
  if (/\b(all\s+in\s+class|entire\s+class|whole\s+class)\b/.test(lower)) return 'class_all';
  // Prefer explicit audience phrases so body text like “Hello everyone” does not force all.
  if (
    /\b(?:for|with|to|share\s+with)\s+(?:everyone|all\s+members|all\s+family|the\s+whole\s+family)\b/.test(lower)
    || /\b(all\s+members|all\s+family|whole\s+family)\b/.test(lower)
  ) {
    return 'all';
  }
  if (/\b(selected|specific\s+members?)\b/.test(lower)) return 'selected';
  if (
    /\b(?:for|with)\s+[A-Za-z]/.test(lower)
    && !/\b(?:for|with)\s+(?:everyone|all\s+members|only\s+me|the\s+home|the\s+bulletin)\b/.test(lower)
  ) {
    // Named people often imply selected — confirmed when children resolve.
    // (Do not treat “to say …” as an audience cue.)
    return 'selected_maybe';
  }
  return null;
}

function collectNamedChildren(message, roster, overrides = {}) {
  if (Array.isArray(overrides.audienceChildIds) && overrides.audienceChildIds.length) {
    const ids = overrides.audienceChildIds.map(String);
    const labels = ids.map((id) => {
      const child = (roster.children || []).find((c) => String(c.id) === id);
      return child?.first_name || child?.name || 'Learner';
    });
    return { ok: true, childIds: ids, labels };
  }

  const lower = String(message || '').toLowerCase();
  const names = [];
  const forMatch = message.match(
    /\b(?:for|with)\s+((?:[A-Za-z][\w'-]*)(?:\s*(?:,|and|&)\s*[A-Za-z][\w'-]*)*)/i,
  );
  if (forMatch?.[1]) {
    const chunk = forMatch[1];
    if (!/^(everyone|all|only|selected|home|the|subject|bulletin)/i.test(chunk.trim())) {
      for (const part of chunk.split(/\s*(?:,|and|&)\s*/i)) {
        const name = part.trim();
        if (
          name
          && !/^(everyone|all|members?|me|myself|class|family|bulletin|home|subject|say|announcement)$/i.test(name)
        ) {
          names.push(name);
        }
      }
    }
  }

  // Also pick child names mentioned anywhere when “selected” was explicit.
  if (!names.length && (/\bselected\b/.test(lower) || /\bspecific\b/.test(lower))) {
    for (const child of roster.children || []) {
      const first = String(child.first_name || child.name || '').trim();
      if (first.length >= 2 && lower.includes(first.toLowerCase())) names.push(first);
    }
  }

  if (!names.length) return { ok: true, childIds: [], labels: [] };

  const childIds = [];
  const labels = [];
  for (const name of names) {
    const resolved = resolveChildByName(name, roster.children);
    if (resolved.clarification) {
      return { ok: false, clarification: resolved.clarification };
    }
    if (!resolved.ok) {
      return {
        ok: false,
        clarification: {
          type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
          message: `I couldn’t find a learner named “${name}”. Who should see this announcement?`,
          options: (roster.children || []).map((c) => ({
            id: String(c.id),
            label: c.first_name || c.name || 'Learner',
            value: String(c.id),
            field: 'childId',
          })),
        },
      };
    }
    const id = String(resolved.child.id);
    if (!childIds.includes(id)) {
      childIds.push(id);
      labels.push(resolved.child.first_name || resolved.child.name || 'Learner');
    }
  }
  return { ok: true, childIds, labels };
}

function resolveBoard(message, ctx, roster, overrides = {}) {
  if (overrides.subjectId === null || overrides.board === 'home') {
    return { ok: true, subjectId: null, subjectName: null };
  }
  if (overrides.subjectId) {
    const subject = (roster.subjects || []).find((s) => String(s.id) === String(overrides.subjectId));
    return {
      ok: true,
      subjectId: String(overrides.subjectId),
      subjectName: subject?.name || subject?.title || overrides.subjectName || null,
    };
  }

  const lower = String(message || '').toLowerCase();
  if (/\b(home\s+bulletin|family\s+bulletin|main\s+bulletin)\b/.test(lower)
    || (/\bhome\b/.test(lower) && /\bbulletin\b/.test(lower))) {
    return { ok: true, subjectId: null, subjectName: null };
  }

  const mentioned = findSubjectMentionedInMessage(message, roster.subjects || []);
  if (mentioned.ok) {
    return {
      ok: true,
      subjectId: String(mentioned.subject.id),
      subjectName: mentioned.subject.name || mentioned.subject.title || null,
    };
  }

  const onSubject = message.match(
    /\b(?:on|to|in)\s+(?:the\s+)?([A-Za-z][\w' -]{1,40}?)\s+bulletin\b/i,
  );
  if (onSubject?.[1]) {
    const name = onSubject[1].trim();
    if (!/^(home|family|main|subject)$/i.test(name)) {
      const resolved = resolveSubjectByName(name, roster.subjects);
      if (resolved.clarification) {
        return { ok: false, clarification: resolved.clarification };
      }
      if (resolved.ok) {
        return {
          ok: true,
          subjectId: String(resolved.subject.id),
          subjectName: resolved.subject.name || resolved.subject.title || null,
        };
      }
    }
  }

  if (ctx.selectedSubjectId) {
    const subject = (roster.subjects || []).find((s) => String(s.id) === String(ctx.selectedSubjectId));
    return {
      ok: true,
      subjectId: String(ctx.selectedSubjectId),
      subjectName: subject?.name || subject?.title || null,
    };
  }

  return { ok: true, subjectId: null, subjectName: null };
}

function subjectAssignedChildIds(subject) {
  if (!subject) return [];
  return parseChildIds(subject.child_id ?? subject.childIds ?? subject.child_ids).map(String);
}

function buildAudience({
  message,
  roster,
  overrides,
  subjectId,
  subject,
}) {
  const hint = parseVisibilityHint(message, overrides);
  const named = collectNamedChildren(message, roster, overrides);
  if (!named.ok) {
    return { ok: false, clarification: named.clarification };
  }

  if (hint === 'self' || overrides.visibility === 'self') {
    return {
      ok: true,
      visibility: 'self',
      audienceUserIds: [],
      audienceChildIds: [],
      audienceLabel: null,
    };
  }

  if (hint === 'class_all' || (subjectId && hint === 'all')) {
    const assigned = subjectAssignedChildIds(subject);
    if (subjectId && assigned.length) {
      return {
        ok: true,
        visibility: 'selected',
        audienceUserIds: [],
        audienceChildIds: assigned,
        audienceLabel: 'All in class',
      };
    }
    // Home board “all” / subject with no assigned students → family-wide all
    return {
      ok: true,
      visibility: 'all',
      audienceUserIds: [],
      audienceChildIds: [],
      audienceLabel: null,
    };
  }

  if (hint === 'all' || (!hint && !named.childIds.length && overrides.visibility !== 'selected')) {
    return {
      ok: true,
      visibility: 'all',
      audienceUserIds: [],
      audienceChildIds: [],
      audienceLabel: null,
    };
  }

  if (named.childIds.length) {
    return {
      ok: true,
      visibility: 'selected',
      audienceUserIds: overrides.audienceUserIds || [],
      audienceChildIds: named.childIds,
      audienceLabel: named.labels.join(', '),
    };
  }

  if (hint === 'selected' || hint === 'selected_maybe' || overrides.visibility === 'selected') {
    return {
      ok: false,
      clarification: {
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Who should see this announcement?',
        options: (roster.children || []).map((c) => ({
          id: String(c.id),
          label: c.first_name || c.name || 'Learner',
          value: String(c.id),
          field: 'childId',
        })),
      },
    };
  }

  return {
    ok: true,
    visibility: 'all',
    audienceUserIds: [],
    audienceChildIds: [],
    audienceLabel: null,
  };
}

async function fetchMyBulletinPosts(familyId, userId, { subjectId = undefined, query = '' } = {}) {
  const { supabase } = await import('../../supabase.js');
  let q = supabase
    .from('family_bulletin_posts')
    .select('id, body, subject_id, visibility, audience_user_ids, audience_child_ids, source, created_at')
    .eq('family_id', familyId)
    .eq('author_user_id', userId)
    .neq('source', 'learnadoodle')
    .order('created_at', { ascending: false })
    .limit(40);

  if (subjectId === null) q = q.is('subject_id', null);
  else if (subjectId) q = q.eq('subject_id', subjectId);

  const { data, error } = await q;
  if (error) return { posts: [], error };
  let posts = data || [];
  const needle = String(query || '').trim().toLowerCase();
  if (needle) {
    const filtered = posts.filter((p) => String(p.body || '').toLowerCase().includes(needle));
    if (filtered.length) posts = filtered;
  }
  return { posts, error: null };
}

function postQueryFromMessage(message) {
  const about = message.match(
    /\b(?:about|called|titled|saying|that\s+says|with)\s+["']?([^"'\n.]{3,80})["']?/i,
  );
  if (about?.[1]) return about[1].trim();
  const quoted = message.match(/["“]([^"”]{3,80})["”]/);
  if (quoted?.[1]) return quoted[1].trim();
  return '';
}

function postOptions(posts, field = 'postId') {
  return posts.slice(0, 8).map((p) => ({
    id: String(p.id),
    label: previewSnippet(p.body),
    value: String(p.id),
    field,
  }));
}

export async function prepareBulletinPostCreate(message, ctx, roster, overrides = {}) {
  const board = resolveBoard(message, ctx, roster, overrides);
  if (!board.ok) {
    return withClarificationMeta(assertDoodleResponse(board.clarification), {
      intent: 'bulletin.post.create',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const subject = board.subjectId
    ? (roster.subjects || []).find((s) => String(s.id) === String(board.subjectId))
    : null;

  const body = parseBulletinBody(message, overrides);
  if (!body) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What should the announcement say?',
    }), {
      intent: 'bulletin.post.create',
      field: 'body',
      originalMessage: message,
      draft: {
        ...overrides,
        subjectId: board.subjectId,
        subjectName: board.subjectName,
        board: board.subjectId ? 'subject' : 'home',
      },
    });
  }

  const audience = buildAudience({
    message,
    roster,
    overrides,
    subjectId: board.subjectId,
    subject,
  });
  if (!audience.ok) {
    return withClarificationMeta(assertDoodleResponse(audience.clarification), {
      intent: 'bulletin.post.create',
      field: 'childId',
      originalMessage: message,
      draft: {
        ...overrides,
        body,
        subjectId: board.subjectId,
        subjectName: board.subjectName,
        visibility: 'selected',
      },
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.BULLETIN_POST_CREATE,
    householdId: ctx.householdId,
    body,
    subjectId: board.subjectId,
    subjectName: board.subjectName,
    visibility: audience.visibility,
    audienceUserIds: audience.audienceUserIds,
    audienceChildIds: audience.audienceChildIds,
    audienceLabel: audience.audienceLabel,
    materialIds: overrides.materialIds || [],
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.BULLETIN_POST_CREATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Post announcement',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Post',
    idempotencyKey: newIdempotencyKey('bulletin'),
  });
}

export async function prepareBulletinPostUpdate(message, ctx, roster, overrides = {}) {
  const body = parseBulletinBody(message, overrides)
    || (overrides.body ? String(overrides.body).trim() : null);

  // Prefer “change … to say …” for new body when editing
  let nextBody = body;
  const toMatch = message.match(/\b(?:to\s+say|saying)\s+["']?(.+?)["']?\s*$/i)
    || message.match(/\bto\s+["']([^"']+)["']\s*$/i);
  if (!overrides.body && toMatch?.[1] && /\b(edit|update|change|rewrite)\b/i.test(message)) {
    const candidate = toMatch[1].trim();
    if (candidate.length > 2 && !/^my\s+(announcement|post|bulletin)/i.test(candidate)) {
      nextBody = candidate;
    }
  }

  let postId = overrides.postId || null;
  let existing = overrides.existingPost || null;

  if (!postId) {
    const board = resolveBoard(message, ctx, roster, overrides);
    const query = postQueryFromMessage(message);
    const { posts, error } = await fetchMyBulletinPosts(ctx.householdId, ctx.userId, {
      subjectId: board.ok ? board.subjectId : undefined,
      query,
    });
    if (error) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: error.message || 'Could not load your announcements.',
      });
    }
    if (!posts.length) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ANSWER,
        message: 'I couldn’t find an announcement you posted to edit.',
      });
    }
    if (posts.length > 1 && !query) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which of your announcements should I edit?',
        options: postOptions(posts),
      }), {
        intent: 'bulletin.post.update',
        field: 'postId',
        originalMessage: message,
        draft: { ...overrides, body: nextBody || undefined },
      });
    }
    if (posts.length > 1 && query) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: `I found a few announcements matching “${query}”. Which one?`,
        options: postOptions(posts),
      }), {
        intent: 'bulletin.post.update',
        field: 'postId',
        originalMessage: message,
        draft: { ...overrides, body: nextBody || undefined },
      });
    }
    existing = posts[0];
    postId = String(existing.id);
  }

  if (!existing && postId) {
    const { posts } = await fetchMyBulletinPosts(ctx.householdId, ctx.userId);
    existing = posts.find((p) => String(p.id) === String(postId)) || null;
  }

  if (!nextBody) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What should the updated announcement say?',
    }), {
      intent: 'bulletin.post.update',
      field: 'body',
      originalMessage: message,
      draft: { ...overrides, postId, existingPost: existing },
    });
  }

  const board = resolveBoard(message, ctx, roster, {
    ...overrides,
    subjectId: overrides.subjectId !== undefined
      ? overrides.subjectId
      : (existing?.subject_id ?? undefined),
  });
  const subject = board.subjectId
    ? (roster.subjects || []).find((s) => String(s.id) === String(board.subjectId))
    : null;

  const audienceOverrides = {
    ...overrides,
    visibility: overrides.visibility
      || (parseVisibilityHint(message) && parseVisibilityHint(message) !== 'selected_maybe'
        ? parseVisibilityHint(message)
        : existing?.visibility),
    audienceChildIds: overrides.audienceChildIds
      || (parseVisibilityHint(message) ? undefined : existing?.audience_child_ids),
    audienceUserIds: overrides.audienceUserIds
      || (parseVisibilityHint(message) ? undefined : existing?.audience_user_ids),
  };

  // If message doesn't mention audience, keep existing audience as-is.
  let audience;
  if (!parseVisibilityHint(message) && !collectNamedChildren(message, roster, {}).childIds.length
    && existing) {
    audience = {
      ok: true,
      visibility: existing.visibility || 'all',
      audienceUserIds: existing.audience_user_ids || [],
      audienceChildIds: existing.audience_child_ids || [],
      audienceLabel: null,
    };
  } else {
    audience = buildAudience({
      message,
      roster,
      overrides: audienceOverrides,
      subjectId: board.ok ? board.subjectId : existing?.subject_id,
      subject,
    });
  }

  if (!audience.ok) {
    return withClarificationMeta(assertDoodleResponse(audience.clarification), {
      intent: 'bulletin.post.update',
      field: 'childId',
      originalMessage: message,
      draft: {
        ...overrides,
        postId,
        body: nextBody,
        existingPost: existing,
        visibility: 'selected',
      },
    });
  }

  const subjectId = board.ok
    ? board.subjectId
    : (existing?.subject_id || null);
  const subjectName = board.ok
    ? board.subjectName
    : null;

  const command = {
    type: DOODLE_COMMAND_TYPES.BULLETIN_POST_UPDATE,
    householdId: ctx.householdId,
    postId: String(postId),
    postPreview: previewSnippet(existing?.body || nextBody),
    body: nextBody,
    subjectId,
    subjectName,
    visibility: audience.visibility,
    audienceUserIds: audience.audienceUserIds,
    audienceChildIds: audience.audienceChildIds,
    audienceLabel: audience.audienceLabel,
  };
  if (Array.isArray(overrides.materialIds)) {
    command.materialIds = overrides.materialIds;
  }
  const handler = getCommand(DOODLE_COMMAND_TYPES.BULLETIN_POST_UPDATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Update announcement',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Save',
    idempotencyKey: newIdempotencyKey('bulletin_upd'),
  });
}

export async function prepareBulletinPostDelete(message, ctx, roster, overrides = {}) {
  let postId = overrides.postId || null;
  let existing = overrides.existingPost || null;

  if (!postId) {
    const board = resolveBoard(message, ctx, roster, overrides);
    const query = postQueryFromMessage(message);
    const wantsLast = /\b(last|latest|most\s+recent)\b/i.test(message);
    const { posts, error } = await fetchMyBulletinPosts(ctx.householdId, ctx.userId, {
      subjectId: board.ok && (query || wantsLast || board.subjectId || board.subjectId === null)
        ? board.subjectId
        : undefined,
      query,
    });
    if (error) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: error.message || 'Could not load your announcements.',
      });
    }
    if (!posts.length) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ANSWER,
        message: 'I couldn’t find an announcement you posted to delete.',
      });
    }
    if (posts.length === 1 || wantsLast) {
      existing = posts[0];
      postId = String(existing.id);
    } else {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: query
          ? `I found a few announcements matching “${query}”. Which should I delete?`
          : 'Which of your announcements should I delete?',
        options: postOptions(posts),
      }), {
        intent: 'bulletin.post.delete',
        field: 'postId',
        originalMessage: message,
        draft: { ...overrides },
      });
    }
  }

  if (!existing && postId) {
    const { posts } = await fetchMyBulletinPosts(ctx.householdId, ctx.userId);
    existing = posts.find((p) => String(p.id) === String(postId)) || null;
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.BULLETIN_POST_DELETE,
    householdId: ctx.householdId,
    postId: String(postId),
    postPreview: previewSnippet(existing?.body || 'Your announcement'),
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.BULLETIN_POST_DELETE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Delete announcement',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Delete',
    idempotencyKey: newIdempotencyKey('bulletin_del'),
  });
}

export function continueBulletinClarification(pendingClarification, message, option, ctx, roster) {
  if (!pendingClarification?.intent?.startsWith('bulletin.post.')) return null;
  const draft = { ...(pendingClarification.draft || {}) };
  const field = option?.field || pendingClarification.field;
  const value = option?.value || message;

  if (field === 'subjectId') {
    const resolved = resolveSubjectByName(option?.label || value, roster.subjects);
    if (resolved.ok) {
      draft.subjectId = String(resolved.subject.id);
      draft.subjectName = resolved.subject.name || resolved.subject.title;
    } else if (option?.value) {
      draft.subjectId = String(option.value);
    } else return null;
  } else if (field === 'childId') {
    const resolved = resolveChildByName(option?.label || value, roster.children);
    if (resolved.ok) {
      draft.audienceChildIds = [String(resolved.child.id)];
      draft.visibility = 'selected';
    } else if (option?.value) {
      draft.audienceChildIds = [String(option.value)];
      draft.visibility = 'selected';
    } else return null;
  } else if (field === 'body') {
    draft.body = String(value || '').trim();
  } else if (field === 'postId') {
    draft.postId = String(option?.value || value);
  } else if (field === 'visibility') {
    const raw = String(option?.value || value || '').toLowerCase();
    if (['all', 'self', 'selected', 'class_all'].includes(raw)) draft.visibility = raw;
  }

  switch (pendingClarification.intent) {
    case 'bulletin.post.create':
      return prepareBulletinPostCreate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'bulletin.post.update':
      return prepareBulletinPostUpdate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'bulletin.post.delete':
      return prepareBulletinPostDelete(pendingClarification.originalMessage, ctx, roster, draft);
    default:
      return null;
  }
}
