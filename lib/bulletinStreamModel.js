/**
 * Unified bulletin stream model — chronological feed of typed classroom cards.
 */

import { ACTIVITY_TYPE } from './assignmentLifecycle';
import { normalizeSubjectGettingStartedBulletinBody } from './subjectGettingStartedBulletin';

export const STREAM_CARD_TYPE = {
  ASSIGNMENT_POSTED: 'assignment_posted',
  SUBMISSION: 'submission',
  FEEDBACK: 'feedback',
  QUESTION: 'question',
  ANNOUNCEMENT: 'announcement',
  LESSON_COMPLETE: 'lesson_complete',
};

const CARD_COPY = {
  [STREAM_CARD_TYPE.ASSIGNMENT_POSTED]: {
    label: 'New Assignment',
    actionHint: 'Open assignment',
  },
  [STREAM_CARD_TYPE.SUBMISSION]: {
    label: 'Submission',
    actionHint: 'Review submission',
  },
  [STREAM_CARD_TYPE.FEEDBACK]: {
    label: 'Feedback returned',
    actionHint: 'See comments',
  },
  [STREAM_CARD_TYPE.QUESTION]: {
    label: 'Question',
    actionHint: 'Open discussion',
  },
  [STREAM_CARD_TYPE.ANNOUNCEMENT]: {
    label: 'Announcement',
    actionHint: null,
  },
  [STREAM_CARD_TYPE.LESSON_COMPLETE]: {
    label: 'Lesson Completed',
    actionHint: null,
  },
};

export function formatRelativeStreamMeta(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return 'Just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function resolveActivityCardType(activityType, summary = '') {
  const text = String(summary || '');
  switch (activityType) {
    case ACTIVITY_TYPE.ASSIGNED:
      return STREAM_CARD_TYPE.ASSIGNMENT_POSTED;
    case ACTIVITY_TYPE.SUBMITTED:
      return STREAM_CARD_TYPE.SUBMISSION;
    case ACTIVITY_TYPE.RETURNED:
      return STREAM_CARD_TYPE.FEEDBACK;
    case ACTIVITY_TYPE.COMPLETED:
      return /lesson/i.test(text)
        ? STREAM_CARD_TYPE.LESSON_COMPLETE
        : STREAM_CARD_TYPE.FEEDBACK;
    case ACTIVITY_TYPE.QUESTION:
      return STREAM_CARD_TYPE.QUESTION;
    case ACTIVITY_TYPE.COMMENT:
      return STREAM_CARD_TYPE.FEEDBACK;
    default:
      return STREAM_CARD_TYPE.ANNOUNCEMENT;
  }
}

function firstLine(text) {
  const line = String(text || '').split('\n').map((l) => l.trim()).find(Boolean);
  return line || '';
}

/** Map assignment activity row to a stream card descriptor. */
export function activityToStreamCard(item, { subjectName = null } = {}) {
  const cardType = resolveActivityCardType(item?.activityType, item?.summary);
  const copy = CARD_COPY[cardType] || CARD_COPY[STREAM_CARD_TYPE.ANNOUNCEMENT];
  const title = String(item?.assignmentTitle || 'Assignment').trim();
  const child = String(item?.childFirstName || 'Student').trim();
  const when = formatRelativeStreamMeta(item?.createdAt);

  let meta = when;
  let excerpt = null;

  if (cardType === STREAM_CARD_TYPE.ASSIGNMENT_POSTED) {
    meta = when ? `Posted ${when}` : 'Recently posted';
  } else if (cardType === STREAM_CARD_TYPE.SUBMISSION) {
    meta = when ? `${child} submitted · ${when}` : `${child} submitted`;
  } else if (cardType === STREAM_CARD_TYPE.QUESTION) {
    meta = `${child} asked a question`;
    excerpt = String(item?.summary || '').replace(/^.*asked a question on\s+/i, '').trim() || null;
    if (excerpt && excerpt === title) excerpt = null;
  } else if (cardType === STREAM_CARD_TYPE.FEEDBACK) {
    meta = when ? `Returned ${when}` : 'Recently returned';
  } else if (cardType === STREAM_CARD_TYPE.LESSON_COMPLETE) {
    meta = when ? `Completed ${when}` : 'Recently completed';
  }

  return {
    kind: 'activity',
    id: `activity-${item.id}`,
    cardType,
    label: copy.label,
    title: cardType === STREAM_CARD_TYPE.SUBMISSION ? title : title,
    meta,
    excerpt,
    subjectName,
    subjectId: item?.subjectId ? String(item.subjectId) : null,
    createdAt: item.createdAt,
    actionHint: copy.actionHint,
    clickable: Boolean(item?.assignmentId),
    payload: item,
  };
}

/** Map bulletin post to announcement stream card. */
export function postToStreamCard(post, { subjectName = null, authorName = 'Parent' } = {}) {
  const isSystem = post?.source === 'learnadoodle';
  const rawBody = String(post?.body || '');
  const body = post?.systemKind === 'subject_getting_started'
    ? normalizeSubjectGettingStartedBulletinBody(rawBody)
    : rawBody;
  const hasFormattedBullets = isSystem && body.includes('•');

  if (hasFormattedBullets) {
    const welcomeSubject = subjectName || (() => {
      const match = body.match(/Welcome to\s+([^!]+)/i);
      return match ? match[1].trim() : null;
    })();
    return {
      kind: 'post',
      id: `post-${post.id}`,
      cardType: STREAM_CARD_TYPE.ANNOUNCEMENT,
      label: post.systemKind === 'subject_getting_started' ? 'Welcome' : 'Announcement',
      title: welcomeSubject ? `Welcome to ${welcomeSubject}` : firstLine(body).replace(/!.*/, '').trim(),
      meta: formatRelativeStreamMeta(post.createdAt),
      excerpt: null,
      fullBody: body,
      showFormattedBody: true,
      subjectName: welcomeSubject || subjectName,
      subjectId: post?.subjectId ? String(post.subjectId) : null,
      createdAt: post.createdAt,
      actionHint: null,
      clickable: true,
      payload: post,
    };
  }

  const taggedSubject = subjectName || null;
  const bodyPreview = firstLine(body);
  const authorDisplayName = isSystem ? 'Learnadoodle' : authorName;
  const title = taggedSubject ? `${taggedSubject} Note` : (isSystem ? 'Learnadoodle' : `${authorName} posted`);

  return {
    kind: 'post',
    id: `post-${post.id}`,
    cardType: STREAM_CARD_TYPE.ANNOUNCEMENT,
    label: isSystem ? 'Welcome' : 'Announcement',
    title,
    meta: formatRelativeStreamMeta(post?.createdAt),
    excerpt: bodyPreview || null,
    authorDisplayName,
    fullBody: null,
    showFormattedBody: false,
    subjectName: taggedSubject,
    subjectId: post?.subjectId ? String(post.subjectId) : null,
    createdAt: post.createdAt,
    actionHint: null,
    clickable: true,
    payload: post,
  };
}

/** Compact home-feed preview lines (subject page uses full card body). */
export function buildStreamPreviewDisplay(entry, { showSubjectName = false } = {}) {
  const when = formatRelativeStreamMeta(entry?.createdAt);
  const subject = showSubjectName && entry?.subjectName ? entry.subjectName : null;

  if (entry?.cardType === STREAM_CARD_TYPE.ASSIGNMENT_POSTED) {
    return {
      label: null,
      title: entry.title,
      subtitle: null,
      meta: subject && when ? `${subject} • ${when}` : (when || entry.meta),
    };
  }

  if (entry?.kind === 'post' && entry.showFormattedBody) {
    return {
      label: entry.label,
      title: entry.subjectName || entry.title,
      subtitle: entry.title && entry.subjectName && entry.title !== entry.subjectName
        ? entry.title
        : null,
      meta: when,
    };
  }

  if (
    entry?.kind === 'post'
    && entry?.cardType === STREAM_CARD_TYPE.ANNOUNCEMENT
    && entry?.excerpt
  ) {
    const who = entry.authorDisplayName || 'Someone';
    const subtitle = entry.subjectName
      ? `${who} posted in ${entry.subjectName}`
      : `${who} posted an announcement`;
    return {
      label: null,
      title: entry.excerpt,
      subtitle,
      meta: when,
    };
  }

  if (entry?.cardType === STREAM_CARD_TYPE.QUESTION) {
    return {
      label: 'New Comment',
      title: subject || entry.title,
      subtitle: entry.meta || null,
      meta: when,
    };
  }

  return {
    label: entry?.label,
    title: entry?.title,
    subtitle: entry?.excerpt || null,
    meta: subject && when ? `${subject} • ${when}` : (when || entry?.meta),
  };
}

/** Merge posts + activity into newest-first stream entries. */
export function mergeBulletinStreamItems({
  posts = [],
  activityItems = [],
  subjectById = new Map(),
  profileMap = new Map(),
  displayNameForUser = () => 'Parent',
  filterSubjectId = null,
}) {
  const entries = [
    ...posts.map((post) => {
      const subjectName = filterSubjectId
        ? null
        : (post.subjectId ? subjectById.get(String(post.subjectId)) : null);
      const authorName = post.source === 'learnadoodle'
        ? 'Learnadoodle'
        : displayNameForUser(profileMap, post.authorUserId);
      return postToStreamCard(post, { subjectName, authorName });
    }),
    ...activityItems.map((item) => {
      const subjectName = filterSubjectId
        ? null
        : (item.subjectId ? subjectById.get(String(item.subjectId)) : null);
      return activityToStreamCard(item, { subjectName });
    }),
  ];

  entries.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });

  return entries;
}
