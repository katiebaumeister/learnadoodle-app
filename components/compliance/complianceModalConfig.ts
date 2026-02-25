/**
 * Config for compliance requirement modals. Each key maps to requirement id from state requirements seed.
 */

export type FieldType = 'text' | 'date' | 'select' | 'number' | 'toggle' | 'textarea';

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  helperText?: string;
  options?: { value: string; label: string }[];
  conditionalKey?: string; // show only when this key is truthy
  conditionalValue?: unknown;
}

export interface ConfigSection {
  id: string;
  title: string;
  summary?: string; // e.g. "X of Y school days logged"
  fields?: ConfigField[];
}

export interface ComplianceModalConfig {
  description: string;
  sections: ConfigSection[];
  quickLinks?: { label: string; handlerKey: string }[];
}

const SELECT_PORTFOLIO_CADENCE = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

const SELECT_PORTFOLIO_STATUS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'reviewed', label: 'Reviewed' },
];

const SELECT_HOURS_METHOD = [
  { value: 'instructional', label: 'Instructional hours' },
  { value: 'any_learning', label: 'Any learning time' },
  { value: 'subject_based', label: 'Subject-based' },
];

const SELECT_EVALUATION_TYPE = [
  { value: 'standardized_test', label: 'Standardized test' },
  { value: 'portfolio_review', label: 'Portfolio review' },
  { value: 'teacher_evaluation', label: 'Teacher evaluation' },
  { value: 'other', label: 'Other' },
];

const SELECT_QUARTER = [
  { value: 'Q1', label: 'Q1' },
  { value: 'Q2', label: 'Q2' },
  { value: 'Q3', label: 'Q3' },
  { value: 'Q4', label: 'Q4' },
];

const SELECT_ASSESSMENT_TYPE = [
  { value: 'narrative', label: 'Narrative' },
  { value: 'rubric', label: 'Rubric' },
  { value: 'test', label: 'Test' },
  { value: 'other', label: 'Other' },
];

const SELECT_PLAN_SCOPE = [
  { value: 'full_year', label: 'Full year' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'monthly', label: 'Monthly' },
];

const SELECT_CURRICULUM_STATUS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'updated', label: 'Updated' },
];

/** Attendance uses custom content in the modal (Planner is source of truth); only notes are editable. */
export const COMPLIANCE_MODAL_CONFIG: Record<string, ComplianceModalConfig> = {
  attendance: {
    description: 'Attendance is recorded in the Planner using instructional events. Use the Attendance view to mark days and events.',
    sections: [],
    quickLinks: [],
  },

  notice: {
    description: 'Notice of intent submission and tracking.',
    sections: [
      {
        id: 'submission',
        title: 'Submission',
        fields: [
          { key: 'due_date', label: 'Due date', type: 'date' },
          { key: 'submitted', label: 'Submitted?', type: 'toggle' },
          { key: 'submission_date', label: 'Submission date', type: 'date', conditionalKey: 'submitted', conditionalValue: true },
          { key: 'submitted_to', label: 'Submitted to', type: 'text', placeholder: 'e.g. OSSE, county superintendent' },
          { key: 'confirmation_id', label: 'Confirmation / receipt id', type: 'text', placeholder: 'Optional' },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
        ],
      },
    ],
    quickLinks: [{ label: 'Upload proof', handlerKey: 'upload_proof' }],
  },

  portfolio: {
    description: 'Portfolio of student work or portfolio review requirements.',
    sections: [
      {
        id: 'review',
        title: 'Portfolio',
        fields: [
          { key: 'portfolio_cadence', label: 'Portfolio cadence', type: 'select', options: SELECT_PORTFOLIO_CADENCE },
          { key: 'reviewer', label: 'Reviewer', type: 'text', placeholder: 'Name or role' },
          { key: 'review_date', label: 'Review date', type: 'date' },
          { key: 'status', label: 'Status', type: 'select', options: SELECT_PORTFOLIO_STATUS },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
        ],
      },
    ],
    quickLinks: [{ label: 'Add artifact', handlerKey: 'add_artifact' }],
  },

  hours: {
    description: 'Minimum hours or days per year as required by your state.',
    sections: [
      {
        id: 'hours_summary',
        title: 'Hours',
        summary: 'Hours logged so far · Remaining',
        fields: [
          { key: 'required_hours', label: 'Required hours', type: 'number', placeholder: 'e.g. 900' },
          { key: 'hours_counted_method', label: 'Hours counted method', type: 'select', options: SELECT_HOURS_METHOD },
          { key: 'include_self_paced', label: 'Include self-paced work', type: 'toggle' },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
        ],
      },
    ],
  },

  testing: {
    description: 'Standardized testing or annual evaluation requirements.',
    sections: [
      {
        id: 'evaluation',
        title: 'Evaluation',
        fields: [
          { key: 'evaluation_type', label: 'Evaluation type', type: 'select', options: SELECT_EVALUATION_TYPE },
          { key: 'window_start', label: 'Window start', type: 'date' },
          { key: 'window_end', label: 'Window end', type: 'date' },
          { key: 'completed', label: 'Completed?', type: 'toggle' },
          { key: 'completion_date', label: 'Completion date', type: 'date', conditionalKey: 'completed', conditionalValue: true },
          { key: 'outcome_summary', label: 'Outcome / score summary', type: 'text', placeholder: 'Optional' },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
        ],
      },
    ],
    quickLinks: [{ label: 'Upload results', handlerKey: 'upload_results' }],
  },

  quarterly_reports: {
    description: 'Quarterly reporting requirements.',
    sections: [
      {
        id: 'report',
        title: 'Quarterly report',
        fields: [
          { key: 'quarter', label: 'Quarter', type: 'select', options: SELECT_QUARTER },
          { key: 'due_date', label: 'Due date', type: 'date' },
          { key: 'submitted', label: 'Submitted?', type: 'toggle' },
          { key: 'submission_date', label: 'Submission date', type: 'date', conditionalKey: 'submitted', conditionalValue: true },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
        ],
      },
    ],
    quickLinks: [{ label: 'Generate report', handlerKey: 'generate_report' }],
  },

  annual_assessment: {
    description: 'Annual assessment requirements.',
    sections: [
      {
        id: 'assessment',
        title: 'Annual assessment',
        fields: [
          { key: 'assessment_type', label: 'Assessment type', type: 'select', options: SELECT_ASSESSMENT_TYPE },
          { key: 'due_date', label: 'Due date', type: 'date' },
          { key: 'completed', label: 'Completed?', type: 'toggle' },
          { key: 'completion_date', label: 'Completion date', type: 'date', conditionalKey: 'completed', conditionalValue: true },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
        ],
      },
    ],
    quickLinks: [{ label: 'Generate summary', handlerKey: 'generate_summary' }],
  },

  curriculum: {
    description: 'Curriculum plan submission or documentation.',
    sections: [
      {
        id: 'plan',
        title: 'Curriculum plan',
        fields: [
          { key: 'plan_scope', label: 'Plan scope', type: 'select', options: SELECT_PLAN_SCOPE },
          { key: 'created_date', label: 'Created date', type: 'date' },
          { key: 'reviewed_date', label: 'Reviewed date', type: 'date' },
          { key: 'status', label: 'Status', type: 'select', options: SELECT_CURRICULUM_STATUS },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
        ],
      },
    ],
    quickLinks: [{ label: 'Open curriculum builder', handlerKey: 'open_curriculum_builder' }],
  },
};

export type RequirementKey = keyof typeof COMPLIANCE_MODAL_CONFIG;
