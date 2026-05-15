import { PLANNER_FAQ } from '../planner/plannerFaqContent';

/**
 * Single source of truth for Family Help + public FAQ page sections.
 * Keep answers parent-facing and operationally clear.
 */
export const FAMILY_FAQ_SECTIONS = [
  {
    id: 'about',
    title: 'About Learnadoodle',
    questions: [
      {
        id: 'about-1',
        q: 'What is Learnadoodle?',
        a: 'Learnadoodle is a family learning operations platform that helps parents organize planning, scheduling, materials, progress tracking, and records in one place. It is designed for homeschooling, afterschool support, pods, tutoring, and other flexible learning routines.',
      },
      {
        id: 'about-2',
        q: 'Who is Learnadoodle for?',
        a: 'Learnadoodle is built for parent-led learning teams, including caregivers, tutors, and learners. It supports early learners through teens, and can also support older independent learners with parent-defined permissions.',
      },
      {
        id: 'about-3',
        q: 'Can kids use Learnadoodle too?',
        a: 'Yes. Children can use learner accounts with parent-selected access levels, from guided support to greater independence. To adjust access: open Family Members, select the child, choose Edit Child, then update the Permission level in the account settings.',
      },
    ],
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    questions: [
      {
        id: 'gs-1',
        q: 'How do I begin with Learnadoodle?',
        a: 'A clear setup sequence is: (1) go to Family Members and add each child, (2) go to Subjects and create core subjects, (3) open Planner and add your first week of events, (4) open Subjects > Schedule to set recurring cadence and learner metrics, and (5) open Family > Planning Preferences to set family-wide defaults such as learning days and date ranges.',
      },
      {
        id: 'gs-2',
        q: 'Do I need a curriculum before using Learnadoodle?',
        a: 'No. Many families start with a lightweight plan: a few subjects, a few events, and a basic weekly rhythm. You can add curriculum details, materials, and structure gradually as your routine and goals become clearer.',
      },
      {
        id: 'gs-3',
        q: 'How do I manage multiple children with different schedules?',
        a: 'Set each child up individually, then layer in shared items where needed. A practical flow is: assign subjects per child, schedule child-specific events in Planner, use shared events for combined activities, and refine each learner\'s cadence in Subjects > Schedule. This preserves learner-specific attendance and progress while still allowing family-level planning.',
      },
      {
        id: 'gs-4',
        q: 'Where do I go in the app for common tasks?',
        a: 'Use Home for daily status and quick review, Planner for creating and editing events, Subjects for curriculum structure and schedule settings, Library for storing and reusing materials, Family Members for invites and permissions, and Family > Planning Preferences for family-wide scheduling rules that may be buried from day-to-day planning screens.',
      },
    ],
  },
  {
    id: 'planner',
    title: 'Planner & Calendar',
    questions: PLANNER_FAQ,
  },
  {
    id: 'user-controls',
    title: 'User Controls & Permissions',
    questions: [
      {
        id: 'uc-1',
        q: 'What are User Controls?',
        a: 'User Controls are permission levels for child and tutor accounts that determine what each person can view or edit. They are managed per account in Family Members, so you can tailor access by person rather than applying one global setting.',
      },
      {
        id: 'uc-2',
        q: 'Where do I change a child or tutor permission level?',
        a: 'From Family Members: (1) open the child or tutor profile, (2) choose Edit Child or Edit Tutor, (3) locate the Account section, and (4) update the Permission level. Save your changes, then confirm access by reopening the profile. You can update permissions anytime as responsibilities change.',
      },
      {
        id: 'uc-3',
        q: 'What does each child permission level do?',
        a: 'Child levels generally move from Guided to Standard to Independent. As levels increase, learners can do more planning and self-management tasks. Parent-owned areas such as account, billing, and core family administration remain protected.',
      },
      {
        id: 'uc-4',
        q: 'What does each tutor permission level do?',
        a: 'Tutor levels typically progress from Viewer to Teaching to Lead Tutor. Higher levels allow broader management of assigned learner planning and coursework, while account ownership, billing, and family administration stay parent-controlled.',
      },
      {
        id: 'uc-5',
        q: 'Can pending tutor invites have a name and permission level?',
        a: 'Yes. During invite setup you can choose shared children, assign a permission level, and add the tutor\'s name before sending. If anything changes later, open Family Members, select the tutor, choose Edit Tutor, and update assignments or permissions.',
      },
    ],
  },
  {
    id: 'subjects',
    title: 'Subjects & Materials',
    questions: [
      {
        id: 'sub-1',
        q: 'What is a subject?',
        a: 'A subject is the main container for learning work (for example Math, Science, or Writing). It connects events, materials, cadence, and progress signals so planning and records stay aligned for each learner.',
      },
      {
        id: 'sub-2',
        q: 'Can materials be shared across subjects or children?',
        a: 'Yes. You can reuse the same material across multiple subjects and learners when appropriate. This helps maintain one reliable source instead of duplicating files in several places.',
      },
      {
        id: 'sub-3',
        q: 'What types of materials can I upload?',
        a: 'You can upload practical learning resources such as lesson plans, readings, assignments, syllabi, assessments, and reference documents. A common workflow is to upload to Library first, then attach those materials to relevant subjects and events.',
      },
    ],
  },
  {
    id: 'records',
    title: 'Records, Progress & Attendance',
    questions: [
      {
        id: 'rec-1',
        q: 'Do I need to keep attendance or records?',
        a: 'If your state, school, co-op, or program requires documentation, keeping records is important. Learnadoodle tracks learner-level attendance and event history so families can maintain consistent records without rebuilding logs manually.',
      },
      {
        id: 'rec-2',
        q: 'How do I track progress?',
        a: 'Use this flow for clarity: (1) mark event completion and attendance in Planner, (2) review learner cadence and progress indicators in Subjects > Schedule, and (3) attach notes or materials so records include meaningful context, not only completion status.',
      },
      {
        id: 'rec-3',
        q: 'Can I export reports?',
        a: 'Yes. Learnadoodle supports summary-style reporting for attendance, subject coverage, activities, and learner progress. Families commonly use these reports for internal review, tutor collaboration, and documentation needs.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & Data',
    questions: [
      {
        id: 'acc-1',
        q: 'Who owns my data?',
        a: 'You do. Your family\'s plans, materials, and records remain under your account ownership. You can manage, export, or remove data through account management workflows.',
      },
      {
        id: 'acc-2',
        q: 'Is my data private and secure?',
        a: 'Yes. Learnadoodle is built around private family workspaces with role-based access controls. Access is limited to authorized members in your family context based on the permissions you set.',
      },
    ],
  },
];
