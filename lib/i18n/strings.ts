// lib/i18n/strings.ts
// Typed string wrapper with dot-path helpers.
// - No runtime deps
// - Type-safe keys (autocomplete + compile-time validation)
// - Simple param interpolation: {name}

/** Shared Plan My Year copy for manual unit builder + paste-to-parse paths */
const PLAN_MANUAL_INPUT_AND_PASTE_PLAIN_DESCRIPTION = `Paste plain text like "Unit 1: Foundations of Algebra:
• Evaluating algebraic expressions
• Combining like terms
• Understanding variables as representations of unknowns and changing quantities
• Writing linear equations in slope-intercept and standard form
Unit 2: Systems of..."`;

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
      title: "Build plan",
      subtitle: "Set when learning can happen and how much time is required.",
      helper:
        "This creates instructional slots on the calendar. Slots are safe to edit and can be filled with lessons later.",
      /** Same visual hierarchy as attendance “Year at a glance” (YearHeatmapGrid). */
      structuredClassPlansTitle: "Build Structured Class Plans",
      structuredClassPlansHelp:
        "Choose subjects, set your date range and weekly blocks, then preview and generate instructional slots on your calendar.",
      /** Edit plan list (inline planner) — same title scale as structuredClassPlansTitle. */
      editPlanTitle: "Edit plan",
      editPlanHelp: "Select a plan to view details or make changes.",
    },

    sections: {
      planningScope: {
        title: "What do you want to build?",
        subtitle:
          "Choose the kind of plan that matches your goal. You can add subjects or curriculum later.",
        options: {
          full_year: {
            label: "A full-year learning plan",
            description:
              "Set learning days across the year for one or more children. Reserve capacity first; assign subjects or lessons when you're ready.",
          },
          one_subject: {
            label: "A plan for one subject",
            description:
              "Schedule a single subject and optionally attach curriculum or material.",
          },
          placeholders_only: {
            label: "Just placeholder learning days",
            description:
              "Create generic learning slots with no subject yet. Fill them later with math, reading, projects, or anything else.",
          },
          build_from_material: {
            label: "Build from material / syllabus",
            description:
              "Upload, paste, or link to a syllabus or list — we'll map lessons onto your calendar.",
          },
        },
      },
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
            label: "Manual input",
            description: "Add units, lessons, projects, exams and their dates by hand.",
          },
          pastePlain: {
            label: "Paste plain text",
            description: PLAN_MANUAL_INPUT_AND_PASTE_PLAIN_DESCRIPTION,
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
        multiSelectHint:
          "Choose one or more subjects. Each subject gets its own cadence row below.",
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
        genericSlotLabel: "Learning block",
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
        title: "Planning Preferences",
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

    cadenceConflicts: {
      title: "Schedule conflicts",
      loadingCalendar: "Checking your calendar for overlapping events…",
      internalLine:
        "{date}: {subjectA} and {subjectB} overlap ({time}) for the same student(s).",
      externalLine:
        "{date}: {subjectName} ({slotTime}) overlaps “{eventTitle}” on the calendar.",
      more: "+ {count} more",
      trySuggestion: "Apply suggested times",
      ignoreToggle: "Ignore conflicts and allow overlapping slots",
      ignoreHint:
        "We will still generate instructional slots; you can fix overlaps on the calendar later.",
      previewRowFlag: "Conflict with another class or calendar event",
      previewConflictSummaryOne: "1 day in this preview has a schedule conflict.",
      previewConflictSummaryMany:
        "{count} days in this preview have schedule conflicts.",
      tryAllSuggestions: "Apply all suggested times",
      applyBlocked:
        "Resolve schedule conflicts below, or enable “Ignore conflicts” before applying.",
    },

    planningTargetProgress: {
      title: "Target vs this plan",
      subtitle:
        "Counts use your date range, cadence, and exclusions (trips, breaks, and optional public holidays).",
      loading: "Calculating…",
      needCadence: "Select subjects and set cadence to compare this plan to your targets.",
      overallDaysLead: "Instructional days in this plan: {projected}",
      overallDaysTarget: "Planning target: {target} days",
      overallHoursLead: "Instructional hours in this plan: {projected}",
      overallHoursTarget: "Planning target: {target} hours",
      deltaOverDays: "{n} over target",
      deltaUnderDays: "{n} under target",
      deltaMetDays: "On target for days",
      deltaOverHours: "{n} h over target",
      deltaUnderHours: "{n} h under target",
      deltaMetHours: "On target for hours",
      suggestedEnd: "End date that would match your day target: {date}",
      excludedPublicHolidays:
        "{count} weekdays in range fall on a U.S. public holiday (not counted as instructional).",
      cadenceHint: "{message}",
      subjectRowDays: "{name}: {projected} of {target} class days",
      subjectRowHours: "{name}: {projected} of {target} instructional hours",
    },

    multiSubjectUnits: {
      subjectPickerTitle: "Subject for units & lessons",
      subjectPickerHint:
        "You have multiple subjects in this plan. Choose which one you’re adding structure for, or go back to Logistics → Cadence and use Manual, Paste, Upload, or Generate under that subject’s row.",
      chooseSubjectEmptyTitle: "Choose a subject",
      chooseSubjectEmptyBody:
        "Pick which subject you’re adding units for using the chips below, or go back to Logistics → Cadence and choose Manual, Paste plain text, Upload, or Generate under that subject’s row.",
      backToMethod: "Back to method",
      backToLogistics: "Back to logistics",
      subjectBannerPrefix: "Subject:",
      subjectBannerHint: "Units and lessons you add here apply to this subject only.",
      cadenceAddUnitsLink: "Add units & lessons for {subjectName}",
      previewMultiSubjectLead: "Multiple subjects:",
      previewMultiSubjectHint:
        "To add units for another subject, go back to Logistics → Cadence and choose Manual, Paste, Upload, or Generate under that subject’s row (or use Back and pick a subject below).",
      reviewLastSavedUnits: "Last saved units & lessons: {subjectName}",
      headerUnitsFor: "Units: {subjectName}",
      toastPickSubjectFirst:
        "Choose which subject you’re adding units for—pick a chip below, or go back to Cadence and tap Manual, Paste, Upload, or Generate under that subject’s row.",
      cadenceRowHint:
        "Each subject has its own row—set weekdays and class times per subject.",
      cadenceAddUnitsInlinePrompt: "Add units",
      cadenceChangeUnitsInlinePrompt: "Change units",
      cadenceDifferentMethodBanner:
        "You previously saved units and lessons using {method}. Open that method to edit your previous inputs, or build a new unit structure below. Your calendar stays as-is until you save.",
      savedUnitsUnknownMethod: "a previous method",
      step1SetSchedule: "Step 1 — Set schedule",
      step2AddContent: "Step 2 — Add content",
      addContentSetCadenceHint:
        "Set days & times to automatically place lessons on your calendar.",
      addContentBeforeCadenceInline:
        "Pick weekdays and class times in Step 1 first for automatic placement. You can still add content now; lessons will map once a schedule produces instructional slots.",
      unitModalNoScheduleBanner:
        "No schedule set yet — lessons will be placed once you choose days & times.",
      instructionalSlotsAvailableOne: "1 instructional slot available",
      instructionalSlotsAvailableMany: "{count} instructional slots available",
      draftLessonSlotMapIntro: "Lessons map to your class times in order:",
      cadenceGenerateLabel: "Generate curriculum",
      unitInputModalTitle: "Manual input",
      a11yCadenceAddUnitsMethod: "{methodLabel} for {subjectName}",
      footerSaveDraftLogisticsFirst: "Continue in Builder",
      footerSaveManualChanges: "Save changes",
      editManualCurriculum: "Edit curriculum",
      clearManualCurriculumRedo: "Clear and redo",
      savedManualCurriculumTitle: "Saved curriculum",
      savedManualCurriculumHint:
        "Your curriculum is saved below. Edit units to change it, or use Back to builder to continue planning. Cancel returns to logistics.",
      savedManualCurriculumFooterBackToBuilder: "Back to builder",
      savedManualCurriculumFooterEditUnits: "Edit units",
      lessonSchedulePreviewHeading: "How lessons will be placed",
      previewSelectedDaysTimesTitle: "Preview selected days/times",
      availableInstructionalSlot: "Available slot",
      lessonsOverflowPastRange:
        "{count} lessons don't have available dates in this range",
      lessonsOverflowExtendSuggestion:
        "Add {extraDays} more class day(s) on your current weekdays and class times by extending your plan end date to {endDate}.",
      lessonsOverflowExtendCta: "Extend end date to {endDate}",
      clearManualCurriculumConfirmTitle: "Clear curriculum?",
      clearManualCurriculumConfirmMessage:
        "This removes all manual units and lessons you saved for this subject. This cannot be undone.",
      clearManualCurriculumConfirm: "Clear",
      addLessonLink: "Add lesson",
      addUnitLink: "Add unit",
      draftLessonMore: "More",
      draftLessonReferenceDate: "Reference date",
      draftReorderA11y: "Reorder lessons",
      draftInsertUnitBreakAbove: "Insert unit break above",
      draftMoveLessonToNewUnit: "Move to new unit",
      draftMoveLessonToUnit: "Move to…",
      draftMoveLessonBack: "Back",
      draftDeleteLesson: "Delete lesson",
      draftUnitMergeWithPrevious: "Merge with previous unit",
      draftUnitMergeWithNext: "Merge with next unit",
      draftUnitAddLesson: "Add lesson",
      draftUnitAddUnitBelow: "Add unit below",
      draftDragLessonA11y: "Drag to reorder or move to another unit",
      footerSaveDraftClassic: "Save & Continue → Schedule",
      footerSkipLogisticsFirst: "Continue to review",
      footerSkipClassic: "Continue → Schedule",
      /** Paste plain text / upload → paste: primary action (parse + go to preview) */
      importPreviewStructure: "Preview structure →",
      importPreviewStructureLoading: "Parsing…",
      importStreamAssistantLabel: "Live preview",
      importStreamWaiting: "Reading your outline…",
      importFromTextTitle: "Import from text",
      importFromTextIntro:
        "Paste your syllabus, lesson list, or plan. We'll organize it into units and lessons.",
      importPasteTipTitle: "Tip: Works best with formats like:",
      importPasteTipBulletUnit: "“Unit 1: …”",
      importPasteTipBulletLesson: "“Lesson 1: …”",
      importPasteTipBulletSchedule: "Weekly or dated lists",
      importRefineParsing: "Refine parsing",
      importRefineParsingHint: "Didn't look right?",
      importSourceTitleOptional: "Source title (optional)",
      pasteDetectedPrefix: "Detected:",
      importParseHintLessonBased: "lesson-based structure",
      importParseHintUnitBased: "unit-based structure",
      importParseHintWeekBased: "week-based structure",
      importParseHintDateBased: "date-based structure",
      importParseHintOutline: "structured outline",
      parsedPreviewTitle: "Units & lessons",
      parsedPreviewSubtitle: "Parsed from your text",
      parsedPreviewMayNeedReview: "{count} items may need review",
      parsedSchedulePreviewTitle: "Lesson schedule preview",
      parsedPreviewEditTip:
        "Tip: You can edit lesson names or reorder them. They'll automatically update on your schedule.",
      parsedPreviewUpdatePreview: "Update preview",
      draftLessonUnscheduled: "Unscheduled",
      nextChooseMethod: "Next: Choose method",
      nextContinueToReview: "Next: Review",
      loadingCurriculum: "Loading existing curriculum…",
      breadcrumbStep3UnitStructure: "3. Unit structure",
      breadcrumbUnitStructureForSubject: "3. Unit structure · {subjectName}",
      a11ySelectSubjectChip: "Select {subjectName} for units and lessons",
      a11yCadenceAddUnits: "Add units and lessons for {subjectName}",
    },

    primaryActions: {
      generateSlots: "Apply to Calendar",
      updateSlots: "Update instructional slots",
      replaceEmptySlots: "Replace empty slots",
      keepFilledSlots: "Keep scheduled lessons",
    },

    applyFrom: {
      title: "Apply schedule changes to calendar",
      entirePlan: "Entire plan (all dates in range)",
      fromToday: "From today forward",
      fromDate: "From a chosen date forward",
      pickDate: "Pick date",
      changeDate: "Change date",
      dateRequired: "Pick a date for “From a chosen date forward”, or choose another option.",
      hint:
        "Only affects how far forward instructional slots from this cadence (days and times) are updated on the calendar. Pick full plan scope to refresh the whole date range; otherwise past dates stay as they are.",
      applyToPlanLabel: "Apply to plan",
      linkFullPlanScope: "Full plan scope",
      linkTodayGoingForward: "Today going forward",
      linkSpecificRange: "Specific range",
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
      slotsUpdatedCount: "Updated {count} instructional slots.",
      slotAddedOne: "1 new instructional slot added.",
      slotsAddedCount: "Added {count} new instructional slots.",
      slotRemovedOne: "1 instructional slot removed.",
      slotsRemovedCount: "Removed {count} instructional slots.",
      updatedWithCounts:
        "Updated {updated} slots, added {inserted}, removed {deleted}.",
      /** Pieces for apply-to-calendar when more than one of updated/inserted/deleted is non-zero */
      applyPartUpdated: "{count} slot(s) updated",
      applyPartInserted: "{count} added",
      applyPartRemoved: "{count} removed",
      skippedFilled: "Scheduled lessons were kept unchanged.",
    },

    calendar: {
      filledBadge: "Scheduled lesson",
      slotTooltipEmpty:
        "This is an instructional slot created by Build plan. Fill it with a lesson or leave it open.",
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
          "Fill lessons into your Build plan schedule when possible.",
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
      generateCurriculumHelper: "Create a structured unit and lesson outline with AI for this subject.",
      importAndExtract: "Import & extract",
      addUnitManually: "Add unit manually",
      viewUnits: "View units",
    },
    empty: {
      title: "No units yet.",
      body:
        "Start by generating curriculum, importing a syllabus, or adding your first unit.",
    },
    generateCurriculum: {
      title: "Generate curriculum",
      scopeLabel: "Scope / course goal",
      scopePlaceholder: "e.g. Generate a semester-long introduction to watercolor painting",
      learnerStageLabel: "Grade level or learner stage",
      learnerStageOptions: "K–2, 3–5, 6–8, 9–12, or custom",
      durationLabel: "Duration",
      durationSingleUnit: "Single unit",
      durationMultiUnit: "Multi-unit course",
      durationSemester: "Full semester",
      durationFullYear: "Full year",
      durationCustomWeeks: "Custom number of weeks",
      customWeeksPlaceholder: "Weeks",
      lessonCountLabel: "Approximate lesson count",
      lessonCountPlaceholder: "e.g. 18",
      lessonMinutesLabel: "Typical lesson length (minutes)",
      lessonMinutesPlaceholder: "e.g. 45",
      styleLabel: "Educational style (optional)",
      stylePlaceholder: "e.g. project-based, Charlotte Mason–inspired",
      rigorLabel: "Rigor",
      rigorGentle: "Gentle",
      rigorStandard: "Standard",
      rigorAdvanced: "Advanced",
      includeAssessments: "Include assessments",
      includeProjects: "Include projects",
      includeMaterials: "Include materials suggestions",
      includePacing: "Include pacing suggestions",
      specialInstructionsLabel: "Special instructions (optional)",
      specialInstructionsPlaceholder: "e.g. Focus on hands-on activities; one lesson per week",
      generateButton: "Generate",
      generating: "Generating…",
      reviewTitle: "Review & edit draft",
      reviewSubtitle: "Edit unit and lesson details, then save to add this curriculum to your subject.",
      courseTitle: "Course title",
      summary: "Summary",
      unitTitle: "Unit title",
      unitDescription: "Description",
      lessonTitle: "Lesson title",
      objective: "Objective",
      minutes: "Min",
      modality: "Modality",
      lessonType: "Type",
      materials: "Materials",
      assessmentIdea: "Assessment idea",
      pacingSuggestion: "Pacing",
      addLesson: "Add lesson",
      deleteLesson: "Delete lesson",
      deleteUnit: "Delete unit",
      saveCurriculum: "Save curriculum",
      saving: "Saving…",
      saveSuccess: "Curriculum saved.",
      backToForm: "Back",
      close: "Close",
      errorGenerate: "Failed to generate curriculum. Please try again.",
      errorSave: "Failed to save curriculum.",
    },
    importExtract: {
      title: "Import & extract",
      helper: "Paste a syllabus, lesson list, or pacing guide and extract units, lessons, assignments, and dates.",
      pasteLabel: "Paste your content",
      pastePlaceholder: "Paste syllabus, outline, or lesson list here…",
      sourceTitleLabel: "Source title (optional)",
      sourceTitlePlaceholder: "e.g. Spring Biology Syllabus",
      sourceTypeLabel: "Source type",
      sourceTypeAuto: "Auto-detect",
      sourceTypeSyllabus: "Syllabus",
      sourceTypeLessonList: "Lesson list",
      sourceTypePacingGuide: "Pacing guide",
      sourceTypeWeeklyPlan: "Weekly plan",
      sourceTypeCourseOutline: "Course outline",
      parseModeLabel: "Parse mode",
      parseModeAuto: "Auto-detect",
      parseModeUnitBased: "Unit-based",
      parseModeLessonBased: "Lesson-based",
      parseModeWeekBased: "Week-based",
      parseModeDateBased: "Date-based",
      detectDates: "Detect dates from text",
      preserveHeadings: "Preserve source headings",
      ignorePolicyText: "Ignore policy / admin text",
      extractAssignments: "Extract assignments",
      extractAssessments: "Extract assessments",
      specialInstructionsLabel: "Special instructions (optional)",
      specialInstructionsPlaceholder: "e.g. Treat each week as a unit; ignore grading policy",
      extractButton: "Extract",
      extracting: "Extracting…",
      streamAssistantLabel: "Live preview",
      streamWaiting: "Reading your outline…",
      reviewTitle: "Review extracted structure",
      reviewSubtitle: "Edit titles and move items if needed, then save to add to your course.",
      warnings: "Parser warnings",
      unassignedItems: "Unassigned / uncertain items",
      ignoredItems: "Ignored (e.g. policy text)",
      saveExtracted: "Save to course",
      saving: "Saving…",
      saveSuccess: "Extracted curriculum saved.",
      backToForm: "Back",
      close: "Close",
      errorParse: "Failed to extract structure. Please try again.",
      errorSave: "Failed to save.",
      noContent: "Please paste some text to extract.",
    },
    manualBuilder: {
      title: "Add unit manually",
      helper: "Enter your own units, lessons, class days, or assignments by hand.",
      modeRich: "Build units and lessons",
      modeRichDesc: "Create named units and lesson items manually.",
      modeClassDays: "Add class days / placeholders",
      modeClassDaysDesc: "Quickly create class sessions or placeholder lesson slots for this subject.",
      unitTitle: "Unit title",
      unitDescription: "Description (optional)",
      addUnit: "Add unit",
      addLesson: "Add lesson",
      addAssignment: "Add assignment",
      deleteUnit: "Delete unit",
      deleteLesson: "Delete lesson",
      lessonTitle: "Lesson title",
      objective: "Objective (optional)",
      minutes: "Minutes",
      lessonType: "Type",
      notes: "Notes (optional)",
      moveUp: "Move up",
      moveDown: "Move down",
      containerTitle: "Unit / container title",
      sessionNaming: "Session naming",
      sessionDay: "Day",
      sessionSession: "Session",
      sessionClass: "Class",
      sessionLesson: "Lesson",
      sessionCustom: "Custom",
      customPrefixPlaceholder: "Prefix",
      totalSessions: "Total sessions",
      defaultMinutes: "Default minutes per session",
      meetingDays: "Meeting days (optional)",
      meetingMon: "Mon",
      meetingTue: "Tue",
      meetingWed: "Wed",
      meetingThu: "Thu",
      meetingFri: "Fri",
      meetingSat: "Sat",
      meetingSun: "Sun",
      createPlaceholders: "Create placeholders",
      addAssignmentRow: "Add assignment",
      reset: "Reset",
      saveCurriculum: "Save to course",
      saving: "Saving…",
      saveSuccess: "Curriculum saved.",
      errorSave: "Failed to save.",
      atLeastOneUnit: "Add at least one unit.",
      unitNeedsTitle: "Unit must have a title.",
      unitNeedsLesson: "Unit must have at least one lesson.",
      lessonNeedsTitle: "Lesson must have a title.",
    },
  },

  calendarSlotActions: {
    emptySlot: {
      primary: "Fill slot",
      secondary: "Create one-off event",
      tooltip:
        "This slot was generated by Build plan. Fill it with a lesson or leave it open.",
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
