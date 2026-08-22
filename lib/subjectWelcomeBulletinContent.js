/**
 * Role-aware copy for subject Bulletin Board welcome posts (rendered in UI, not stored per-role).
 */

export const SUBJECT_WELCOME_VIEWER_MODES = {
  PARENT: 'parent',
  CHILD: 'child',
  CHILD_SELF_MANAGED: 'child_self_managed',
  TUTOR: 'tutor',
};

export function resolveSubjectWelcomeViewerMode(session) {
  const isChild = session?.role_flags?.isChild === true;
  const isTutor = session?.role_flags?.isTutor === true;
  const isSelfManagedStudent =
    isChild &&
    session?.student_self_signup === true &&
    session?.child_linked_via_accepted_invite !== true;

  if (isSelfManagedStudent) return SUBJECT_WELCOME_VIEWER_MODES.CHILD_SELF_MANAGED;
  if (isChild) return SUBJECT_WELCOME_VIEWER_MODES.CHILD;
  if (isTutor) return SUBJECT_WELCOME_VIEWER_MODES.TUTOR;
  return SUBJECT_WELCOME_VIEWER_MODES.PARENT;
}

export function buildSubjectWelcomeIntro(subjectName, viewerMode) {
  const name = String(subjectName || '').trim() || 'this subject';
  switch (viewerMode) {
    case SUBJECT_WELCOME_VIEWER_MODES.CHILD:
      return `Welcome to ${name}! This is your Bulletin Board for ${name}.`;
    case SUBJECT_WELCOME_VIEWER_MODES.CHILD_SELF_MANAGED:
      return `Welcome to ${name}! This is your personal Bulletin Board for ${name}.`;
    case SUBJECT_WELCOME_VIEWER_MODES.TUTOR:
      return `Welcome to ${name}! This is the Bulletin Board for ${name}.`;
    default:
      return `Welcome to ${name}! This is the Bulletin Board for ${name}.`;
  }
}

export function buildSubjectWelcomeLeadIn(viewerMode) {
  switch (viewerMode) {
    case SUBJECT_WELCOME_VIEWER_MODES.CHILD_SELF_MANAGED:
      return 'You\'ll see content here as you post it — use this board to track and organize your own learning:';
    default:
      return 'This is where you can:';
  }
}

export const SUBJECT_WELCOME_USE_CASES_BY_MODE = {
  parent: [
    {
      key: 'plans',
      title: 'Share weekly plans and announcements',
      description: 'Keep everyone informed about what\'s coming up.',
    },
    {
      key: 'assignments',
      title: 'Share assignment instructions and reminders',
      description: 'Make expectations clear and deadlines easy to find.',
    },
    {
      key: 'milestones',
      title: 'Celebrate completed projects and milestones',
      description: 'Highlight progress and achievements together.',
    },
    {
      key: 'together',
      title: 'Keep everyone learning this subject on the same page',
      description: 'A shared space for students, parents, and tutors.',
    },
  ],
  child: [
    {
      key: 'plans',
      title: 'See what\'s coming up',
      description: 'Check weekly plans and announcements from your family.',
    },
    {
      key: 'assignments',
      title: 'Find assignment details',
      description: 'See instructions, due dates, and reminders in one place.',
    },
    {
      key: 'milestones',
      title: 'Celebrate your wins',
      description: 'Share and see progress and milestones for this subject.',
    },
    {
      key: 'together',
      title: 'Stay on the same page',
      description: 'Keep up with everyone learning this subject together.',
    },
  ],
  child_self_managed: [
    {
      key: 'notes',
      title: 'Post reminders and notes for yourself',
      description: 'Capture what you want to remember for this subject.',
    },
    {
      key: 'assignments',
      title: 'Keep assignment details together',
      description: 'Store instructions and deadlines you set for yourself.',
    },
    {
      key: 'milestones',
      title: 'Track milestones and progress',
      description: 'Celebrate what you\'ve finished and what\'s next.',
    },
    {
      key: 'resources',
      title: 'Attach files and links',
      description: 'Save materials that support your learning in one place.',
    },
  ],
  tutor: [
    {
      key: 'plans',
      title: 'Share plans and announcements',
      description: 'Keep students and families informed about what\'s coming up.',
    },
    {
      key: 'assignments',
      title: 'Post assignment instructions and reminders',
      description: 'Make expectations clear and deadlines easy to find.',
    },
    {
      key: 'milestones',
      title: 'Celebrate student progress',
      description: 'Highlight completed work and milestones with the class.',
    },
    {
      key: 'together',
      title: 'Keep everyone aligned on this subject',
      description: 'A shared space for students, parents, and tutors.',
    },
  ],
};

export function buildSubjectWelcomeTip(viewerMode) {
  switch (viewerMode) {
    case SUBJECT_WELCOME_VIEWER_MODES.CHILD:
      return 'Check here when your family shares plans, assignments, and updates for this subject.';
    case SUBJECT_WELCOME_VIEWER_MODES.CHILD_SELF_MANAGED:
      return 'Post announcements and notes here to organize your learning. Attach files, links, and images to any post.';
    case SUBJECT_WELCOME_VIEWER_MODES.TUTOR:
      return 'Attach files, links, and images to posts. Explore Smart Actions in the top right for planning and class tools.';
    default:
      return 'Attach files, links, and images to posts to support learning. Explore Smart Actions in the top right for more planning and class tools.';
  }
}
