/**
 * Insight Engine - Generates personalized daily insights
 * 
 * Architecture:
 * 1. Data Extractors → 2. Rules Engine → 3. Categorizer → 4. NL Generator → 5. UI Output
 */

/**
 * Insight Types
 */
export const INSIGHT_TYPES = {
  EMOTIONAL: 'emotional',
  TACTICAL: 'tactical',
  STRATEGIC: 'strategic',
};

/**
 * Insight Output Structure
 * @typedef {Object} InsightOutput
 * @property {string} primary - Main insight (1-3 lines)
 * @property {string} [child_insight] - Child-specific insight
 * @property {string} [emotional] - Emotional/supportive insight
 * @property {string} [cta] - Call-to-action text
 * @property {string} [type] - Insight type
 */

/**
 * Data Context for Insight Generation
 * @typedef {Object} InsightContext
 * @property {Array} todayEvents - Today's scheduled events
 * @property {number} eventCount - Number of events today
 * @property {number} totalMinutes - Total minutes scheduled
 * @property {number} eventDensity - Blocks per hour
 * @property {Array} gaps - Time gaps between events
 * @property {Array} upcomingDeadlines - Upcoming deadlines
 * @property {number} missedSessions - Count of missed sessions
 * @property {Array} lowCoverageSubjects - Subjects needing more coverage
 * @property {Array} children - Array of child objects
 * @property {Object} childPatterns - Per-child learning patterns
 * @property {Object} parentPatterns - Parent behavior patterns
 * @property {Object} emotionalIndicators - Emotional/mood indicators
 * @property {Object} systemContext - System-level context
 */

/**
 * Insight Rule Template
 * @typedef {Object} InsightRule
 * @property {string} id
 * @property {string} type - 'emotional' | 'tactical' | 'strategic'
 * @property {Function} condition - Returns boolean
 * @property {Function} generate - Returns string or null
 * @property {number} priority - Higher = more important
 * @property {boolean} [childSpecific] - If true, generates per-child insights
 */

/**
 * Daily Load Rules
 */
const dailyLoadRules = [
  {
    id: 'full-day-short-blocks',
    type: INSIGHT_TYPES.TACTICAL,
    priority: 8,
    condition: (ctx) => ctx.eventCount >= 4,
    generate: (ctx) => {
      const childCount = ctx.children.length;
      if (childCount === 1) {
        return `Today is a fuller day — shorter focused sessions will work best.`;
      }
      return `Today is a fuller day — shorter focused blocks will work best.`;
    },
  },
  {
    id: 'light-day-opportunity',
    type: INSIGHT_TYPES.EMOTIONAL,
    priority: 6,
    condition: (ctx) => ctx.eventCount <= 2 && ctx.totalMinutes < 120,
    generate: (ctx) => {
      return `Today is light — good opportunity for gentle review or exploration.`;
    },
  },
  {
    id: 'medium-day-balanced',
    type: INSIGHT_TYPES.TACTICAL,
    priority: 5,
    condition: (ctx) => ctx.eventCount === 3 && ctx.totalMinutes >= 120 && ctx.totalMinutes < 240,
    generate: (ctx) => {
      return `Today has a balanced load — you can mix focused work with lighter activities.`;
    },
  },
];

/**
 * Coverage Balance Rules
 */
const coverageBalanceRules = [
  {
    id: 'low-coverage-subject',
    type: INSIGHT_TYPES.STRATEGIC,
    priority: 9,
    childSpecific: true,
    condition: (ctx) => ctx.lowCoverageSubjects.length > 0,
    generate: (ctx) => {
      const lowCoverage = ctx.lowCoverageSubjects[0];
      const child = ctx.children.find(c => 
        ctx.childPatterns[c.id]?.struggleSubjects?.includes(lowCoverage.subject)
      );
      if (child) {
        const childName = child.first_name || child.name;
        return `${childName} is light on ${lowCoverage.subject} this week — even 10 minutes today will help.`;
      }
      return null;
    },
  },
];

/**
 * Momentum Rules
 */
const momentumRules = [
  {
    id: 'streak-momentum',
    type: INSIGHT_TYPES.EMOTIONAL,
    priority: 7,
    childSpecific: true,
    condition: (ctx) => {
      return Object.values(ctx.childPatterns).some(p => p.streak >= 3);
    },
    generate: (ctx) => {
      const childWithStreak = ctx.children.find(c => {
        const pattern = ctx.childPatterns[c.id];
        return pattern && pattern.streak >= 3;
      });
      if (childWithStreak) {
        const childName = childWithStreak.first_name || childWithStreak.name;
        return `${childName}'s on a roll — keep the rhythm with a simple block today.`;
      }
      return null;
    },
  },
  {
    id: 'streak-broken',
    type: INSIGHT_TYPES.EMOTIONAL,
    priority: 6,
    childSpecific: true,
    condition: (ctx) => {
      return Object.values(ctx.childPatterns).some(p => p.streak === 0 && p.attendanceReliability < 0.5);
    },
    generate: (ctx) => {
      return `No rush — just restart gently today.`;
    },
  },
];

/**
 * Struggle Detection Rules
 */
const struggleRules = [
  {
    id: 'missed-sessions-subject',
    type: INSIGHT_TYPES.TACTICAL,
    priority: 8,
    childSpecific: true,
    condition: (ctx) => ctx.missedSessions >= 2,
    generate: (ctx) => {
      // Find subject with most missed sessions
      const missedBySubject = {};
      const now = new Date();
      ctx.todayEvents.forEach(ev => {
        if (ev.status !== 'done' && ev.status !== 'canceled') {
          const eventStart = new Date(ev.start_ts || ev.start_local);
          if (eventStart < now) {
            const subject = ev.subject || ev.title || 'Learning';
            missedBySubject[subject] = (missedBySubject[subject] || 0) + 1;
          }
        }
      });
      
      const strugglingSubject = Object.entries(missedBySubject)
        .sort(([, a], [, b]) => b - a)[0]?.[0];
      
      if (strugglingSubject) {
        return `${strugglingSubject} has been harder this week — consider starting with an easy warm-up.`;
      }
      return null;
    },
  },
];

/**
 * Emotional Support Rules
 */
const emotionalRules = [
  {
    id: 'just-starting-win',
    type: INSIGHT_TYPES.EMOTIONAL,
    priority: 5,
    condition: (ctx) => ctx.eventCount === 0 || ctx.totalMinutes < 60,
    generate: () => {
      return `Just starting is a win.`;
    },
  },
  {
    id: 'flexibility-message',
    type: INSIGHT_TYPES.EMOTIONAL,
    priority: 4,
    condition: (ctx) => ctx.parentPatterns.rescheduleFrequency >= 2,
    generate: () => {
      return `It's fine if the plan shifts — flexibility is part of learning.`;
    },
  },
];

/**
 * All Rules Combined
 */
const allRules = [
  ...dailyLoadRules,
  ...coverageBalanceRules,
  ...momentumRules,
  ...struggleRules,
  ...emotionalRules,
];

/**
 * Score and rank insights
 */
function scoreInsights(insights) {
  return insights.map(insight => ({
    ...insight,
    score: insight.rule.priority,
  })).sort((a, b) => b.score - a.score);
}

/**
 * Generate insights from context
 */
export function generateInsights(context) {
  const generatedInsights = [];
  
  // Run all rules
  for (const rule of allRules) {
    if (rule.condition(context)) {
      if (rule.childSpecific) {
        // Generate per-child insights
        for (const child of context.children) {
          const childContext = {
            ...context,
            currentChild: child,
          };
          const text = rule.generate(childContext);
          if (text) {
            generatedInsights.push({
              rule,
              text,
              childId: child.id,
            });
          }
        }
      } else {
        // Generate general insight
        const text = rule.generate(context);
        if (text) {
          generatedInsights.push({
            rule,
            text,
          });
        }
      }
    }
  }
  
  // Score and rank
  const scored = scoreInsights(generatedInsights);
  
  // Pick top insight in each category
  const topByCategory = {
    [INSIGHT_TYPES.EMOTIONAL]: scored.find(i => i.rule.type === INSIGHT_TYPES.EMOTIONAL),
    [INSIGHT_TYPES.TACTICAL]: scored.find(i => i.rule.type === INSIGHT_TYPES.TACTICAL),
    [INSIGHT_TYPES.STRATEGIC]: scored.find(i => i.rule.type === INSIGHT_TYPES.STRATEGIC),
  };
  
  // Build output with all three layers
  const output = {
    primary: topByCategory[INSIGHT_TYPES.TACTICAL]?.text || 
             topByCategory[INSIGHT_TYPES.STRATEGIC]?.text || 
             topByCategory[INSIGHT_TYPES.EMOTIONAL]?.text || 
             'Today is a good day for learning.',
    emotional: topByCategory[INSIGHT_TYPES.EMOTIONAL]?.text,
    tactical: topByCategory[INSIGHT_TYPES.TACTICAL]?.text,
    strategic: topByCategory[INSIGHT_TYPES.STRATEGIC]?.text,
    cta: 'View weekly story',
  };
  
  // Add child-specific insight if available
  const childInsight = scored.find(i => i.childId && i.rule.type === INSIGHT_TYPES.STRATEGIC);
  if (childInsight) {
    output.child_insight = childInsight.text;
  }
  
  return output;
}

/**
 * Build context from home data
 */
export function buildInsightContext(homeData, date) {
  const todayEvents = homeData.learning || [];
  const eventCount = todayEvents.length;
  const totalMinutes = todayEvents.reduce((sum, ev) => {
    const start = new Date(ev.start_ts || ev.start_local);
    const end = new Date(ev.end_ts || ev.end_local);
    return sum + Math.round((end.getTime() - start.getTime()) / 60000);
  }, 0);
  
  // Calculate event density (blocks per hour)
  const hoursInDay = 16; // 8am to midnight
  const eventDensity = eventCount / hoursInDay;
  
  // Determine daily load
  let dailyLoad = 'light';
  if (eventCount === 0) {
    dailyLoad = 'light';
  } else if (totalMinutes < 120) {
    dailyLoad = 'light';
  } else if (totalMinutes < 240) {
    dailyLoad = 'medium';
  } else {
    dailyLoad = 'heavy';
  }
  
  // Build child patterns (simplified - would need more data)
  const childPatterns = {};
  (homeData.children || []).forEach((child) => {
    childPatterns[child.id] = {
      struggleSubjects: [],
      strongSubjects: [],
      paceVariance: 0,
      streak: 0,
      attendanceReliability: 0.8,
    };
  });
  
  // Calculate missed sessions
  const now = new Date();
  const missedSessions = todayEvents.filter((e) => {
    if (e.status === 'done' || e.status === 'canceled') return false;
    const eventStart = new Date(e.start_ts || e.start_local);
    return eventStart < now;
  }).length;
  
  return {
    todayEvents,
    eventCount,
    totalMinutes,
    eventDensity,
    gaps: [],
    upcomingDeadlines: [],
    missedSessions,
    lowCoverageSubjects: [],
    children: homeData.children || [],
    childPatterns,
    parentPatterns: {
      loggingFrequency: 0.8,
      lateBlocks: 0,
      overSchedulingTendency: 0,
      rescheduleFrequency: 0,
    },
    emotionalIndicators: {
      unfinishedTasks: 0,
    },
    systemContext: {
      dailyLoad,
    },
  };
}

