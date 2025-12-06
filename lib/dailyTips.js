// Daily Tips System
// Categories: perspective, coaching, learning_quality, routine, development, reflection, feature

export const tipTemplates = [
  // ---------- Perspective ----------
  {
    id: "perspective-busy-1",
    category: "perspective",
    badge: "TIP",
    title: "Today's perspective",
    bodyLines: [
      "Today is busy. Protect a few quiet minutes for reading, reflection, or rest.",
      "Focus on one meaningful activity and keep the rest light."
    ],
    conditions: { scheduleLoad: ["heavy"] }
  },
  {
    id: "perspective-light-1",
    category: "perspective",
    badge: "TIP",
    title: "Today's perspective",
    bodyLines: [
      "Today looks light and open — a good day for gentle learning and curiosity."
    ],
    conditions: { scheduleLoad: ["light"] }
  },
  {
    id: "perspective-medium-1",
    category: "perspective",
    badge: "TIP",
    title: "Today's perspective",
    bodyLines: [
      "Today might feel a bit full — small steps count.",
      "Even one focused block still moves everything forward."
    ],
    conditions: { scheduleLoad: ["medium"] }
  },
  {
    id: "perspective-light-2",
    category: "perspective",
    badge: "TIP",
    title: "Today's perspective",
    bodyLines: [
      "Today has room to breathe. Let small moments of learning carry most of the weight."
    ],
    conditions: { scheduleLoad: ["light"] }
  },
  {
    id: "perspective-light-3",
    category: "perspective",
    badge: "TIP",
    title: "Today's perspective",
    bodyLines: [
      "Today is a spacious day. Follow their interests and keep plans flexible."
    ],
    conditions: { scheduleLoad: ["light"] }
  },
  {
    id: "perspective-heavy-2",
    category: "perspective",
    badge: "TIP",
    title: "Today's perspective",
    bodyLines: [
      "Today may move quickly. Short, focused sessions are better than perfect plans."
    ],
    conditions: { scheduleLoad: ["heavy"] }
  },
  {
    id: "perspective-heavy-3",
    category: "perspective",
    badge: "TIP",
    title: "Today's perspective",
    bodyLines: [
      "Today has a lot going on. Lighten expectations and celebrate any forward motion."
    ],
    conditions: { scheduleLoad: ["heavy"] }
  },
  {
    id: "perspective-medium-2",
    category: "perspective",
    badge: "TIP",
    title: "Today's perspective",
    bodyLines: [
      "Everyone's energy is steady today.",
      "A good day for steady progress and focused attention."
    ],
    conditions: { scheduleLoad: ["medium"] }
  },

  // ---------- Coaching ----------
  {
    id: "coaching-progress-not-perfection",
    category: "coaching",
    badge: "TIP",
    title: "Progress over perfection",
    bodyLines: [
      "Some days just starting is the win.",
      "It's okay if the plan shifts — flexibility is part of learning."
    ]
  },
  {
    id: "coaching-short-sessions",
    category: "coaching",
    badge: "TIP",
    title: "Short sessions count",
    bodyLines: [
      "10–15 minutes can still build mastery.",
      "Aim for progress, not completion."
    ]
  },
  {
    id: "coaching-simplify",
    category: "coaching",
    badge: "TIP",
    title: "Today's a good day to simplify",
    bodyLines: [
      "Pick one priority and let the rest go.",
      "Small steps still move everything forward."
    ]
  },
  {
    id: "coaching-notice-curiosity",
    category: "coaching",
    badge: "TIP",
    title: "Notice what sparked their curiosity",
    bodyLines: [
      "Reflection builds intrinsic motivation.",
      "Ask what they enjoyed most today."
    ]
  },

  // ---------- Learning quality ----------
  {
    id: "learning-teach-back",
    category: "learning_quality",
    badge: "INSIGHT",
    title: "Let them teach you",
    bodyLines: [
      "Children learn more deeply when they explain what they're doing.",
      "Ask them to teach you one idea today."
    ]
  },
  {
    id: "learning-review-builds-confidence",
    category: "learning_quality",
    badge: "INSIGHT",
    title: "Reviewing familiar tasks helps",
    bodyLines: [
      "Reviewing familiar tasks helps build confidence.",
      "Consider doing one easy win today."
    ]
  },
  {
    id: "learning-breaks-boost-attention",
    category: "learning_quality",
    badge: "INSIGHT",
    title: "Short breaks boost attention",
    bodyLines: [
      "Short breaks boost attention by up to 20%.",
      "Try a quick reset between sessions."
    ]
  },
  {
    id: "learning-movement-improves-memory",
    category: "learning_quality",
    badge: "INSIGHT",
    title: "Movement improves memory",
    bodyLines: [
      "Movement improves memory.",
      "A short walk can help reset focus."
    ]
  },

  // ---------- Routine ----------
  {
    id: "routine-bundle-blocks",
    category: "routine",
    badge: "ROUTINE",
    title: "Simplify today's schedule",
    bodyLines: [
      "If today feels tight, bundle two short tasks into one block.",
      "A single 20–30 minute session is enough."
    ],
    conditions: { scheduleLoad: ["heavy"] }
  },
  {
    id: "routine-mornings-reading",
    category: "routine",
    badge: "ROUTINE",
    title: "Mornings are best for reading",
    bodyLines: [
      "Mornings are the best time for reading.",
      "If you can, front-load one literacy activity."
    ]
  },
  {
    id: "routine-natural-learning-pocket",
    category: "routine",
    badge: "ROUTINE",
    title: "Natural learning pocket",
    bodyLines: [
      "You have a natural learning pocket at 3–4 PM today.",
      "Good for a short project."
    ]
  },

  // ---------- Development ----------
  {
    id: "development-warmup",
    category: "development",
    badge: "DEVELOPMENT",
    title: "A slower warmup is normal",
    bodyLines: [
      "Younger kids often need extra time to warm up their focus.",
      "A small warmup or transition can make the first block easier."
    ],
    conditions: { minChildren: 1 }
  },
  {
    id: "development-preteens-choices",
    category: "development",
    badge: "DEVELOPMENT",
    title: "Preteens thrive on small choices",
    bodyLines: [
      "Preteens thrive on small choices — offer two options today.",
      "Even a simple choice builds engagement."
    ],
    conditions: { minChildren: 1 }
  },
  {
    id: "development-meaningful-tasks",
    category: "development",
    badge: "DEVELOPMENT",
    title: "Older kids stay engaged",
    bodyLines: [
      "Older kids stay more engaged when tasks feel meaningful.",
      "Connect today's work to something they care about."
    ],
    conditions: { minChildren: 1 }
  },

  // ---------- Reflection ----------
  {
    id: "reflection-small-win",
    category: "reflection",
    badge: "REFLECTION",
    title: "Notice one small win",
    bodyLines: [
      "Take a moment today to notice something they did well.",
      "Naming small wins builds confidence over time."
    ]
  },
  {
    id: "reflection-end-of-day",
    category: "reflection",
    badge: "REFLECTION",
    title: "End today by asking",
    bodyLines: [
      "End today by asking what they enjoyed most.",
      "Reflection closes the loop and builds awareness."
    ]
  },
  {
    id: "reflection-celebrate-week",
    category: "reflection",
    badge: "REFLECTION",
    title: "Celebrate one small win",
    bodyLines: [
      "Celebrate one small win from this week.",
      "Every effort counts, even the small ones."
    ]
  },

  // ---------- Feature discovery ----------
  {
    id: "feature-weekly-goal",
    category: "feature",
    badge: "PLANNER",
    title: "Try a small weekly goal",
    bodyLines: [
      "Setting one simple weekly goal helps pacing feel clearer.",
      "You can add a goal any time from the planner."
    ],
    conditions: { requiresWeeklyGoalMissing: true }
  },
  {
    id: "feature-backlog",
    category: "feature",
    badge: "PLANNER",
    title: "Consider adding a backlog item",
    bodyLines: [
      "Want to remember something for later? Add it to your backlog.",
      "You can drag items from backlog into your schedule anytime."
    ],
    conditions: { requiresBacklogMissing: true }
  }
];

function matchesConditions(tip, ctx) {
  const c = tip.conditions;
  if (!c) return true;

  if (c.scheduleLoad && ctx.scheduleLoad && !c.scheduleLoad.includes(ctx.scheduleLoad)) {
    return false;
  }

  if (c.requiresWeeklyGoalMissing && ctx.hasWeeklyGoal) return false;
  if (c.requiresBacklogMissing && ctx.hasBacklogItems) return false;

  if (typeof c.minChildren === "number" && typeof ctx.numChildren === "number") {
    if (ctx.numChildren < c.minChildren) return false;
  }

  if (c.weekdaysOnly && (ctx.dayOfWeek === 0 || ctx.dayOfWeek === 6)) {
    return false;
  }

  return true;
}

export function getDailyTips(ctx, maxTips = 2) {
  const eligible = tipTemplates.filter((tip) => matchesConditions(tip, ctx));

  // Always prefer exactly one perspective tip if available
  const perspective = eligible.find((t) => t.category === "perspective");
  const remaining = eligible.filter((t) => t.category !== "perspective");

  const result = [];

  if (perspective) result.push(perspective);

  // Pick additional tips from other categories, prioritizing variety
  for (const tip of remaining) {
    if (result.length >= maxTips) break;
    // Avoid duplicate categories
    if (result.some((t) => t.category === tip.category)) continue;
    result.push(tip);
  }

  return result;
}

