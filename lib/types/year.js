/**
 * Type definitions for Year Planning features
 * Part of Phase 1 - Year-Round Intelligence Core
 */

/**
 * @typedef {Object} SubjectTarget
 * @property {string} key - Subject key/identifier
 * @property {number} targetMinPerWeek - Target minutes per week (0-10080)
 */

/**
 * @typedef {Object} PlanChild
 * @property {string} childId - Child UUID
 * @property {SubjectTarget[]} subjects - Array of subject targets
 * @property {Record<string, number>} [hoursPerWeek] - Optional hours per week by subject key
 */

/**
 * @typedef {Object} BreakPeriod
 * @property {string} start - Start date (YYYY-MM-DD)
 * @property {string} end - End date (YYYY-MM-DD)
 * @property {string} [label] - Optional label for the break
 */

/**
 * @typedef {Object} CreateYearPlanInput
 * @property {string} familyId - Family UUID
 * @property {'current'|'next'|'custom'} scope - Plan scope
 * @property {string} startDate - Start date (YYYY-MM-DD)
 * @property {string} endDate - End date (YYYY-MM-DD)
 * @property {BreakPeriod[]} breaks - Array of break periods
 * @property {PlanChild[]} children - Array of children with their subjects
 */

/**
 * @typedef {Object} YearPlanOut
 * @property {string} id - Year plan UUID
 * @property {string} familyId - Family UUID
 * @property {string} scope - Plan scope
 * @property {string} startDate - Start date (YYYY-MM-DD)
 * @property {string} endDate - End date (YYYY-MM-DD)
 * @property {number} totalWeeks - Total weeks in plan
 * @property {string} createdAt - Creation timestamp
 */

/**
 * @typedef {Object} HeatmapRow
 * @property {string} week_start - Week start date (YYYY-MM-DD)
 * @property {string} subject - Subject name
 * @property {number} minutes_scheduled - Minutes scheduled for this week/subject
 * @property {number} minutes_done - Minutes completed for this week/subject
 */

/**
 * @typedef {Object} RebalanceMove
 * @property {string} eventId - Event UUID
 * @property {string} currentStart - Current start timestamp (ISO 8601)
 * @property {string} proposedStart - Proposed start timestamp (ISO 8601)
 * @property {string} reason - Reason for the move
 */

/**
 * @typedef {Object} RebalanceOut
 * @property {boolean} ok - Whether the rebalance succeeded
 * @property {RebalanceMove[]} moves - Array of proposed moves
 * @property {number} count - Number of moves
 * @property {string} [error] - Error message if ok is false
 */

/**
 * @typedef {Object} PrefillResponse
 * @property {SubjectTarget[]} subjects - Prefilled subjects from last year
 * @property {Record<string, number>} hoursPerWeek - Prefilled hours per week
 */

export const YearPlanScope = {
  CURRENT: 'current',
  NEXT: 'next',
  CUSTOM: 'custom'
};

