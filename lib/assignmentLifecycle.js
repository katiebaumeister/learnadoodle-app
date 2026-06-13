/**
 * Assignment lifecycle status model:
 * Draft → Assigned → In progress → Submitted → Reviewed
 *                          ↑          ↓
 *                    Sent back ← Needs revision
 */

export const ASSIGNMENT_STATUS = {
  DRAFT: 'draft',
  ASSIGNED: 'assigned',
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  REVIEWED: 'reviewed',
  ACCEPTED: 'accepted',
};

export const REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  NEEDS_REVISION: 'needs_revision',
  REJECTED: 'rejected',
};

export const ACTIVITY_TYPE = {
  ASSIGNED: 'assigned',
  SUBMITTED: 'submitted',
  QUESTION: 'question',
  RETURNED: 'returned',
  COMPLETED: 'completed',
  COMMENT: 'comment',
};

/** Normalize legacy not_started to assigned for display. */
export function normalizeAssignmentStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'not_started') return ASSIGNMENT_STATUS.ASSIGNED;
  return s || ASSIGNMENT_STATUS.ASSIGNED;
}

export function assignmentIsDraft(assignment) {
  return normalizeAssignmentStatus(assignment?.status) === ASSIGNMENT_STATUS.DRAFT;
}

export function assignmentIsAssigned(assignment) {
  const s = normalizeAssignmentStatus(assignment?.status);
  return s === ASSIGNMENT_STATUS.ASSIGNED;
}

export function assignmentIsInProgressLifecycle(assignment) {
  if (!assignment) return false;
  const review = String(assignment.review_status || '').trim().toLowerCase();
  if (review === REVIEW_STATUS.NEEDS_REVISION || review === REVIEW_STATUS.REJECTED) return true;
  const s = normalizeAssignmentStatus(assignment.status);
  if (s === ASSIGNMENT_STATUS.IN_PROGRESS) return true;
  return Number(assignment.progress_percent) > 0;
}

export function assignmentIsSubmittedLifecycle(assignment) {
  if (!assignment) return false;
  const s = normalizeAssignmentStatus(assignment.status);
  return s === ASSIGNMENT_STATUS.SUBMITTED || Boolean(assignment.submitted_at);
}

export function assignmentIsReviewedLifecycle(assignment) {
  if (!assignment) return false;
  const review = String(assignment.review_status || '').trim().toLowerCase();
  const s = normalizeAssignmentStatus(assignment.status);
  return (
    review === REVIEW_STATUS.APPROVED
    || s === ASSIGNMENT_STATUS.REVIEWED
    || s === ASSIGNMENT_STATUS.ACCEPTED
  );
}

export function assignmentNeedsRevision(assignment) {
  const review = String(assignment?.review_status || '').trim().toLowerCase();
  return review === REVIEW_STATUS.NEEDS_REVISION || review === REVIEW_STATUS.REJECTED;
}

export function assignmentAwaitingReview(assignment) {
  if (!assignment || assignmentNeedsRevision(assignment) || assignmentIsReviewedLifecycle(assignment)) {
    return false;
  }
  return assignmentIsSubmittedLifecycle(assignment);
}

/** Unified lifecycle label for parent and student UI. */
export function getAssignmentLifecycleLabel(assignment) {
  if (!assignment) return 'Assigned';
  if (assignmentIsDraft(assignment)) return 'Draft';
  if (assignmentNeedsRevision(assignment)) return 'Needs revision';
  if (assignmentIsReviewedLifecycle(assignment)) {
    if (assignment.grade_display || assignment.grade_value != null) return 'Reviewed';
    return 'Complete';
  }
  if (assignmentAwaitingReview(assignment)) return 'Submitted';
  if (assignmentIsInProgressLifecycle(assignment)) return 'In progress';
  return 'Assigned';
}

/** Parse comment_log JSON array. */
export function parseAssignmentCommentLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const body = String(entry.body || '').trim();
      if (!body) return null;
      return {
        id: String(entry.id || `comment_${index}`),
        senderRole: String(entry.sender_role || 'unknown'),
        authorId: entry.author_id || null,
        body,
        createdAt: entry.created_at || null,
      };
    })
    .filter(Boolean);
}

/** Build activity summary strings for subject bulletin. */
export function buildActivitySummary({ activityType, childName, assignmentTitle }) {
  const child = String(childName || 'Student').trim();
  const title = String(assignmentTitle || 'assignment').trim();
  switch (activityType) {
    case ACTIVITY_TYPE.SUBMITTED:
      return `${child} submitted ${title}`;
    case ACTIVITY_TYPE.QUESTION:
      return `${child} asked a question on ${title}`;
    case ACTIVITY_TYPE.RETURNED:
      return `${title} returned for revision`;
    case ACTIVITY_TYPE.COMPLETED:
      return `${title} completed`;
    case ACTIVITY_TYPE.ASSIGNED:
      return `${title} assigned to ${child}`;
    case ACTIVITY_TYPE.COMMENT:
      return `New comment on ${title}`;
    default:
      return `${title} updated`;
  }
}
