// lib/i18n/strings.ts
// Typed string wrapper with dot-path helpers.
// - No runtime deps
// - Type-safe keys (autocomplete + compile-time validation)
// - Simple param interpolation: {name}

export const STRINGS = {
  terminology: {
    instructionalSlot: "Instructional slot",
    instructionalSlots: "Instructional slots",
    emptySlot: "Empty slot",
    filledSlot: "Filled slot",
    lesson: "Lesson",
    lessons: "Lessons",
    scheduledLesson: "Scheduled lesson",
    scheduledLessons: "Scheduled lessons",
    unit: "Unit",
    units: "Units",
    draftLesson: "Draft lesson",
    draftLessons: "Draft lessons",
    lessonBacklog: "Lesson backlog",
    oneOffEvent: "One-off event",
  },

  global: {
    actions: {
      close: "Close",
      cancel: "Cancel",
      back: "Back",
      next: "Next",
      save: "Save",
      apply: "Apply",
      done: "Done",
      continue: "Continue",
      confirm: "Confirm",
      edit: "Edit",
      delete: "Delete",
      remove: "Remove",
      add: "Add",
      view: "View",
      learnMore: "Learn more",
    },
    status: {
      loading: "Loading…",
      saving: "Saving…",
      building: "Building…",
      generating: "Generating…",
      extracting: "Extracting…",
      applying: "Applying…",
    },
    emptyState: {
      noneYet: "None yet.",
      noResults: "No results found.",
    },
  },

  planMyYear: {
    modal: {
      title: "Plan My Year",
      subtitle: "Set when learning can happen and how much time is required.",
      helper:
        "This creates instructional slots on the calendar. Slots are safe to edit and can be filled with lessons later.",
    },

    sections: {
      useASource: {
        title: "Choose method",
        subtitle: "Choose where your plan content comes from.",
        options: {
          placeholders: {
            label: "Add just a cadence for now",
            description: "e.g. Math Tuesdays 9 a.m. for 12 weeks",
          },
          upload: {
            label: "Upload material",
            description: "Syllabus, lesson plan, PDF workbook, etc. — we'll parse it to create the correct number of lessons with details like units/topics pre-assigned",
          },
          link: {
            label: "Add a link",
            description: "e.g. A link to a Khan Academy unit — we'll import and create events for each lesson.",
          },
          paste: {
            label: "Paste list",
            description: `Paste plain text like "Unit 1: Foundations of Algebra:
• Evaluating algebraic expressions
• Combining like terms
• Understanding variables as representations of unknowns and changing quantities
• Writing linear equations in slope-intercept and standard form
Unit 2: Systems of..."`,
          },
        },
      },
      who: {
        title: "Who is this plan for?",
        subtitle: "Choose one child or plan for the whole family.",
        labels: {
          wholeFamily: "Whole family",
          specificChild: "Specific child",
        },
      },
      subjects: {
        title: "Subjects",
        subtitle: "Slots will be created per subject on eligible days.",
        labels: {
          allSubjects: "All subjects",
          selectedSubjects: "Selected subjects",
        },
      },
      blocks: {
        title: "Weekly blocks",
        subtitle:
          "Define recurring time blocks that will generate instructional slots.",
        actions: {
          addBlock: "Add block",
          editBlock: "Edit block",
          removeBlock: "Remove block",
          duplicateBlock: "Duplicate block",
        },
        empty: {
          title: "No blocks yet.",
          body:
            "Add a block like \"Math • Mon/Wed/Fri • 9:00–10:00\" to generate instructional slots.",
        },
      },
      dates: {
        title: "Dates",
        subtitle: "Set the plan start and end date.",
        labels: {
          startDate: "Start date",
          endDate: "End date",
        },
      },
      targets: {
        title: "Targets (optional)",
        subtitle:
          "Use targets to check whether your plan meets requirements.",
        labels: {
          none: "No targets",
          targetDays: "Target instructional days",
          targetHours: "Target instructional hours",
          flex: "Suggest adjustments if short",
        },
        fields: {
          days: "Days",
          hours: "Hours",
        },
      },
      breaks: {
        title: "Breaks & holidays",
        subtitle:
          "Exclude dates where slots should not be created.",
        actions: {
          addBreak: "Add break",
          addHoliday: "Add holiday",
          importPublicHolidays: "Import public holidays",
        },
      },
      preview: {
        title: "Preview",
        subtitle:
          "Estimated instructional time based on your blocks and exclusions.",
        labels: {
          estimatedSlots: "Estimated slots",
          estimatedDays: "Estimated instructional days",
          estimatedHours: "Estimated instructional hours",
        },
        actions: {
          recalculate: "Recalculate",
          computePotential: "Update preview",
        },
      },
    },

    primaryActions: {
      generateSlots: "Generate instructional slots",
      updateSlots: "Update instructional slots",
      replaceEmptySlots: "Replace empty slots",
      keepFilledSlots: "Keep scheduled lessons",
    },

    confirmations: {
      replaceEmptySlots: {
        title: "Update instructional slots?",
        body:
          "This will update only empty instructional slots generated by this plan. Scheduled lessons will not be changed.",
        confirm: "Update empty slots",
        cancel: "Cancel",
      },
      removeSlots: {
        title: "Remove instructional slots?",
        body:
          "This removes only generated instructional slots. Scheduled lessons will remain.",
        confirmLabel: "Remove instructional slots",
      },
    },

    toasts: {
      generated: "Instructional slots generated.",
      updated: "Instructional slots updated.",
      generatedWithCounts: "Generated {count} instructional slots.",
      updatedWithCounts:
        "Updated {updated} slots, added {inserted}, removed {deleted}.",
      skippedFilled: "Scheduled lessons were kept unchanged.",
    },

    calendar: {
      slotBadge: "Instructional slot",
      filledBadge: "Scheduled lesson",
      slotTooltipEmpty:
        "This is an instructional slot created by Plan My Year. Fill it with a lesson or leave it open.",
      slotTooltipFilled:
        "This slot contains a scheduled lesson. It will not be changed by future plan updates.",
    },
  },

  buildCurriculum: {
    modal: {
      title: "Build Curriculum",
      subtitle: "Create a structured unit with sequenced lessons.",
      helper:
        "You can schedule lessons into instructional slots or add them to the backlog.",
    },

    inputs: {
      mode: {
        label: "Build from",
        options: {
          material: "Material",
          link: "Link",
          topic: "Topic",
        },
      },
      students: {
        label: "Students",
        placeholder: "Select students",
      },
      weeks: {
        label: "Weeks",
        helper: "How many weeks should this unit span?",
      },
      minutesPerDay: {
        label: "Minutes per day",
        helper: "Used to estimate pacing and scheduling.",
      },
      weekdaysOnly: {
        label: "Weekdays only",
        helper: "Schedule lessons on weekdays only.",
      },
      difficulty: {
        label: "Difficulty",
        options: {
          gentle: "Gentle",
          standard: "Standard",
          stretch: "Stretch",
        },
      },
      startDate: {
        label: "Start date",
      },
    },

    placement: {
      title: "Scheduling",
      useSlots: {
        label: "Use available instructional slots",
        helper:
          "Fill lessons into your Plan My Year schedule when possible.",
      },
      fallback: {
        label: "If no slots are available",
        options: {
          autoSchedule: "Schedule using open availability",
          backlogOnly: "Add remaining lessons to backlog",
        },
      },
    },

    actions: {
      buildPreview: "Build preview",
      rebuild: "Rebuild",
      createUnitAndSchedule: "Create unit & schedule lessons",
      createUnitAndBacklog: "Create unit & add to backlog",
      selectAll: "Select all",
      selectNone: "Select none",
      editLesson: "Edit lesson",
    },

    preview: {
      header: "Unit preview",
      lessonsHeader: "Lessons in this unit",
      summary: "{lessonCount} lessons · ~{minutes} minutes · {weeks} weeks",
    },

    notices: {
      noSlotsFound:
        "No instructional slots were available in this range. Lessons were scheduled using open availability.",
      usedSlots: "Placed {used} lessons into instructional slots.",
      usedSlotsAndFallback:
        "Placed {used} lessons into instructional slots. Scheduled {fallback} more using open availability.",
    },

    toasts: {
      createdUnit: "Unit created.",
      scheduledLessons: "Lessons scheduled.",
      addedToBacklog: "Lessons added to backlog.",
    },
  },

  magicExtract: {
    modal: {
      title: "Extract Lessons & Assignments",
      subtitle: "Review and attach extracted content to a course.",
      helper:
        "Extracted items are drafts until they are attached to a unit.",
    },

    actions: {
      extract: "Extract",
      extracting: "Extracting…",
      attachToCourse: "Attach to course",
      chooseUnit: "Choose unit",
      createUnit: "Create new unit",
      addToBacklogOnly: "Add to backlog only",
      scheduleIntoSlots: "Schedule into instructional slots",
    },

    sections: {
      draftLessons: "Draft lessons",
      draftAssignments: "Draft assignments",
    },

    empty: {
      title: "Nothing to extract.",
      body:
        "Try a different file or upload a syllabus with clearer headings and dates.",
    },

    toasts: {
      extracted: "Extraction complete.",
      attached: "Added to unit.",
      addedToBacklog: "Added to backlog.",
    },
  },

  courseStructure: {
    section: {
      title: "Course structure",
      subtitle:
        "Define what is taught in this course and how it progresses.",
    },
    actions: {
      generateCurriculum: "Generate curriculum",
      importAndExtract: "Import & extract",
      addUnitManually: "Add unit manually",
      viewUnits: "View units",
    },
    empty: {
      title: "No units yet.",
      body:
        "Start by generating curriculum, importing a syllabus, or adding your first unit.",
    },
  },

  calendarSlotActions: {
    emptySlot: {
      title: "Instructional slot",
      primary: "Fill slot",
      secondary: "Create one-off event",
      tooltip:
        "This slot was generated by Plan My Year. Fill it with a lesson or leave it open.",
    },
    filledSlot: {
      title: "Scheduled lesson",
      primary: "View lesson",
      secondary: "Change lesson",
      tooltip:
        "This lesson is linked to curriculum and will not be changed by future plan updates.",
    },
    manualLesson: {
      title: "Lesson (manual)",
      primary: "Attach to unit",
      secondary: "Edit",
      tooltip: "This lesson is not linked to curriculum.",
    },
  },

  backlog: {
    title: "Lesson backlog",
    subtitle: "Lessons that are not yet scheduled.",
    actions: {
      scheduleIntoSlots: "Schedule into slots",
      schedule: "Schedule",
      removeFromBacklog: "Remove from backlog",
    },
    empty: {
      title: "Backlog is empty.",
      body:
        "Add lessons from a unit or import a syllabus to get started.",
    },
  },
} as const;

export type StringsTree = typeof STRINGS;

/** Utility types: dot-paths + value lookup */
type Primitive = string | number | boolean | null | undefined;

/** Build a union of all dot-separated leaf paths that resolve to a string */
export type DotPath<T> = T extends Primitive
  ? never
  : {
      [K in Extract<keyof T, string>]: T[K] extends string
        ? K
        : T[K] extends Array<unknown>
          ? never
          : `${K}.${DotPath<T[K]>}`;
    }[Extract<keyof T, string>];

/** Resolve the type at a dot-path */
export type PathValue<T, P extends string> =
  P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? PathValue<T[K], Rest>
      : never
    : P extends keyof T
      ? T[P]
      : never;

/** Params for template strings like "Generated {count} instructional slots." */
export type InterpParams = Record<string, string | number>;

/** Runtime: get value at dot-path */
function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce(
      (acc: unknown, key: string) =>
        acc != null && typeof acc === "object" && key in acc
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj
    );
}

/** Runtime: interpolate "{key}" placeholders */
function interpolate(template: string, params?: InterpParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = params[key];
    return v === undefined || v === null ? `{${key}}` : String(v);
  });
}

/**
 * t("planMyYear.toasts.generatedWithCounts", { count: 128 })
 * - key is compile-time validated
 * - returns a string
 */
export function t<K extends DotPath<StringsTree>>(
  key: K,
  params?: InterpParams
): PathValue<StringsTree, K> extends string ? string : never {
  const raw = getByPath(STRINGS, key as string);
  if (typeof raw !== "string") {
    throw new Error(`i18n key "${String(key)}" did not resolve to a string`);
  }
  return interpolate(raw, params) as PathValue<StringsTree, K> extends string
    ? string
    : never;
}

/**
 * Optional helper: strongly-typed accessor without interpolation.
 * Useful when you want the raw template string for UI composition.
 */
export function s<K extends DotPath<StringsTree>>(key: K): string {
  const raw = getByPath(STRINGS, key as string);
  if (typeof raw !== "string") {
    throw new Error(`i18n key "${String(key)}" did not resolve to a string`);
  }
  return raw;
}

/**
 * Optional helper: runtime check whether a key exists and is a string.
 * Useful if you accept dynamic keys from configs.
 */
export function hasStringKey(key: string): boolean {
  const raw = getByPath(STRINGS, key);
  return typeof raw === "string";
}
