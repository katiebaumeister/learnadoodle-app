/**
 * Intent classification: LLM-based classifier with keyword fallback.
 */

const INTENTS = [
  'add_appointment',
  'add_activity',
  'delete_event',
  'update_event',
  'mark_attendance',
  'check_attendance',
  'log_grade',
  'list_grades',
  'list_materials',
  'add_material',
  'delete_material',
  'rename_material',
  'list_children',
  'list_subjects',
  'update_child',
  'archive_child',
  'delete_child_permanent',
  'add_subject',
  'delete_subject',
  'rename_subject',
  'progress_summary',
  'queue_reschedule',
  'suggest_subjects',
  'suggest_courses',
  'navigate',
  'todays_schedule',
  'direct_answer',
];

/**
 * Keyword-based fallback when LLM is unavailable or low confidence.
 * @param {object} [context] - optional family context (e.g. children) for disambiguation
 */
export function triageIntentKeyword(userMessage, context) {
  const message = userMessage.toLowerCase();

  // Add/schedule appointment before add_activity and queue_reschedule so "add a doctors appointment" isn't misclassified
  if (/\b(add|schedule|create|book)\b.*\b(appointment|doctor|dentist)\b/i.test(message) ||
      /\b(appointment|doctor['s]?\s*appointment|dentist)\b.*\b(for|at|on|today|tomorrow)\b/i.test(message)) {
    return { intent: 'add_appointment', confidence: 0.85 };
  }
  if (
    /\b(log|record|add|enter)\b/i.test(message) &&
    (/\bgrade\b/i.test(message) || /\bscore\b/i.test(message))
  ) {
    return { intent: 'log_grade', confidence: 0.8 };
  }
  if (
    /\b(show|list|see|view|pull\s+up|what)\b/i.test(message) &&
    /\bgrades?\b/i.test(message) &&
    !/(?:^|[\s,])(log|record|add|enter)\s+grade\b/i.test(message)
  ) {
    return { intent: 'list_grades', confidence: 0.79 };
  }
  if (/log|homework|activity|add\s+(an?\s+)?(activity|homework)/i.test(message)) {
    return { intent: 'add_activity', confidence: 0.8 };
  }
  if (
    /\b(delete|remove|trash)\b/i.test(message) &&
    /\b(event|lesson|class|appointment|meeting|calendar|block)\b/i.test(message)
  ) {
    return { intent: 'delete_event', confidence: 0.82 };
  }
  if (/\bcancel\b/i.test(message) && /\b(appointment|lesson|event|class)\b/i.test(message)) {
    return { intent: 'delete_event', confidence: 0.8 };
  }
  if (
    /\bto\b/i.test(message) &&
    (/\brename\b/i.test(message) || /\bretitle\b/i.test(message) || /\bchange\s+(?:the\s+)?(?:title|name)\b/i.test(message)) &&
    (/\b(material|materials|library|workbook|textbook|upload|pdf|file)\b/i.test(message) ||
      /^\s*rename\s+(?:the\s+)?(?:material|item)\s+/i.test(userMessage.trim())) &&
    !/\b(event|lesson|calendar|appointment|meeting)\b/i.test(message)
  ) {
    return { intent: 'rename_material', confidence: 0.83 };
  }
  if (
    /\bto\b/i.test(message) &&
    (/\brename\b/i.test(message) || /\bchange\s+(?:the\s+)?(?:name|title)\b/i.test(message)) &&
    /\bsubject\b/i.test(message) &&
    !/\b(material|materials|library|workbook|textbook|upload|pdf|file)\b/i.test(message) &&
    !/\b(event|lesson|calendar|appointment|meeting)\b/i.test(message)
  ) {
    return { intent: 'rename_subject', confidence: 0.81 };
  }
  const renameTwoToken = userMessage.match(/\brename\s+(\w+)\s+to\s+(\w+)\b/i);
  if (renameTwoToken && Array.isArray(context?.children) && context.children.length) {
    if (
      !/\b(event|lesson|calendar|appointment|subject|material|materials|library|workbook|textbook|meeting|block)\b/i.test(
        message
      )
    ) {
      const from = renameTwoToken[1].toLowerCase();
      const active = context.children.filter((c) => !c.archived);
      const matchesLearner = active.some((c) => {
        const fn = (c.first_name || '').toLowerCase().trim();
        const firstOfFull = (c.name || '').toLowerCase().trim().split(/\s+/).filter(Boolean)[0] || '';
        return (
          (fn && (fn === from || fn.startsWith(from))) ||
          (firstOfFull && (firstOfFull === from || firstOfFull.startsWith(from)))
        );
      });
      if (matchesLearner) {
        return { intent: 'update_child', confidence: 0.84 };
      }
    }
  }
  if (
    /\b(rename|retitle|change\s+the\s+title)\b/i.test(message) ||
    /\bmove\s+(the|my|this|that)\b/i.test(message) ||
    /\bchange\b.*\bto\s+(lesson|project|exam|assignment|activity|appointment)\b/i.test(message) ||
    /\b(change|set)\s+(?:the\s+)?(?:event\s+)?type\s+to\b/i.test(message)
  ) {
    return { intent: 'update_event', confidence: 0.78 };
  }
  if (
    /\bmark\b.*\b(present|absent)\b/i.test(message) ||
    (/\b(record|set)\b.*\battendance\b/i.test(message) && /\b(present|absent)\b/i.test(message))
  ) {
    return { intent: 'mark_attendance', confidence: 0.82 };
  }
  if (
    /\b(check|show|see|view|pull\s+up)\b.*\battendance\b/i.test(message) ||
    /\battendance\s+(for|this\s+month|record|history)\b/i.test(message) ||
    /\bhow\s+(many|much)\b.*\b(days|day)\b.*\b(school|attendance)\b/i.test(message)
  ) {
    return { intent: 'check_attendance', confidence: 0.8 };
  }
  const urlInMsg = /https?:\/\//i.test(userMessage);
  if (
    urlInMsg &&
    /\b(add|save|put|bookmark|store|include)\b/i.test(message) &&
    /\b(material|materials|library|resource|link|bookmark)\b/i.test(message) &&
    !/\b(delete|remove|trash)\b/i.test(message)
  ) {
    return { intent: 'add_material', confidence: 0.84 };
  }
  if (
    /\b(add|save|put|bookmark)\b/i.test(message) &&
    /\b(material|materials|library|resource|link)\b/i.test(message) &&
    !urlInMsg &&
    !/\b(list|show|what|see|view|delete|remove|trash)\b/i.test(message)
  ) {
    return { intent: 'add_material', confidence: 0.76 };
  }
  if (
    /\b(list|show|what\s+do\s+we\s+have|what'?s?\s+in)\b/i.test(message) &&
    /\b(material|materials|library|books?|resources)\b/i.test(message)
  ) {
    return { intent: 'list_materials', confidence: 0.8 };
  }
  if (
    /\b(delete|remove|trash|archive)\b/i.test(message) &&
    /\b(material|from\s+(the\s+)?library|workbook|textbook)\b/i.test(message)
  ) {
    return { intent: 'delete_material', confidence: 0.8 };
  }
  if (/\b(list|who)\b.*\b(children|kids?|learners?)\b/i.test(message) || /\bhow\s+many\s+kids\b/i.test(message)) {
    return { intent: 'list_children', confidence: 0.8 };
  }
  if (/\b(list|show|what)\b.*\b(subjects?|classes)\b/i.test(message) && !/\b(event|lesson)\b/i.test(message)) {
    return { intent: 'list_subjects', confidence: 0.78 };
  }
  if (
    /\b(permanently\s+delete|delete\s+forever|remove\s+permanently)\b/i.test(message) &&
    /\b(child|kid|learner|student|profile)\b/i.test(message)
  ) {
    return { intent: 'delete_child_permanent', confidence: 0.86 };
  }
  if (/\b(archive|hide)\b/i.test(message) && /\b(child|kid|learner|student)\b/i.test(message)) {
    return { intent: 'archive_child', confidence: 0.8 };
  }
  if (
    !/\b(event|lesson|calendar|appointment|material|library)\b/i.test(message) &&
    (/\bset\s+\w+'?s?\s+grade\s+to\b/i.test(message) ||
      /\bchange\s+\w+'?s?\s+name\s+to\b/i.test(message) ||
      /\brename\s+\w+\s+to\s+\w+\b/i.test(message))
  ) {
    return { intent: 'update_child', confidence: 0.76 };
  }
  if (/\b(add|create)\b/i.test(message) && /\b(subject|class|course)\b/i.test(message)) {
    return { intent: 'add_subject', confidence: 0.8 };
  }
  if (
    /\b(delete|remove|drop)\b/i.test(message) &&
    /\b(subject|subjects)\b/i.test(message) &&
    !/\b(material|materials|library|book|books|workbook|textbook|event|lesson|calendar|appointment|meeting)\b/i.test(
      message
    )
  ) {
    return { intent: 'delete_subject', confidence: 0.78 };
  }
  if (/progress|how\s+(is|are).*(doing|going)|how.*progress/i.test(message)) {
    return { intent: 'progress_summary', confidence: 0.8 };
  }
  if (/reschedule|move\s+it|change\s+it|shift/i.test(message)) {
    return { intent: 'queue_reschedule', confidence: 0.8 };
  }
  if (/subject.*(suggest|recommend|what)|what\s+subjects/i.test(message)) {
    return { intent: 'suggest_subjects', confidence: 0.8 };
  }
  if (/course.*(suggest|recommend|idea)|what\s+courses/i.test(message)) {
    return { intent: 'suggest_courses', confidence: 0.8 };
  }
  if (
    /take\s+me\s+to|show\s+me\s+the|go\s+to(\s+the)?\s+(home|dashboard|planner|calendar|library|materials|subjects|family|feedback|attendance)|open\s+(the\s+)?(attendance|planner|family|feedback|library|subjects|materials|home)|jump\s+to|navigate\s+to|attendance\s+page|planner\s+attendance/i.test(
      message
    )
  ) {
    return { intent: 'navigate', confidence: 0.85 };
  }

  // Read-only: what's on the calendar today / tomorrow (skip classifier + LLM; handled in code)
  if (
    !/\b(delete|remove|cancel|trash|add|create|book)\b/i.test(message) &&
    (/\bwhat\s+(is|'?s?)\s+on\s+(my\s+)?(calendar|schedule)\s+(today|tomorrow)\b/i.test(message) ||
      /\bwhat\s+do\s+i\s+have\s+(today|tomorrow)\b/i.test(message) ||
      /\b(show|list)\s+(me\s+)?(my\s+)?(today'?s?\s+)?(schedule|calendar|events?|lessons?)\b/i.test(message) ||
      /\b(today'?s?\s+schedule|schedule\s+for\s+today|events?\s+today|lessons?\s+today|on\s+my\s+calendar\s+today)\b/i.test(message) ||
      /\bwhat'?s?\s+happening\s+(today|tomorrow)\b/i.test(message) ||
      /\bdo\s+i\s+have\s+(anything\s+)?(today|tomorrow)\b/i.test(message) ||
      /\b(am\s+i\s+free|busy)\s+(today|tomorrow)\b/i.test(message) ||
      /\bwhat'?s?\s+planned\s+(for\s+)?(today|tomorrow)\b/i.test(message))
  ) {
    return { intent: 'todays_schedule', confidence: 0.86 };
  }

  if (
    /\b(how\s+do\s+i|how\s+to|where\s+(is|do|can|should)|where\s+can\s+i\s+find|what\s+is|tell\s+me\s+where|faq|in\s+the\s+app)\b/i.test(
      message
    )
  ) {
    return { intent: 'direct_answer', confidence: 0.88 };
  }

  return { intent: 'direct_answer', confidence: 0.5 };
}

const CLASSIFIER_PROMPT = `Classify the user request into exactly one of these intents: ${INTENTS.join(', ')}.

Rules:
- direct_answer: how the app works, where to tap, planner/subjects concepts, FAQ, or general product help (not a command to perform an action now).
- navigate: user wants to jump to a screen (e.g. "open planner", "take me to feedback", "go to library").
- todays_schedule: read-only question about what is on the family calendar today, tomorrow, or this week (not deleting or adding events).
- add_appointment: scheduling doctor/dentist/medical-style appointments.
- add_activity: log homework/activity for a child.
- delete_event: remove/cancel/trash a specific calendar event (not general "clear my week").
- update_event: rename, change type, or move time of a specific existing calendar event (not a vague "reschedule everything"). If the user says "rename [Name] to [Name]" and those look like a child's given name (not a lesson title), prefer **update_child** unless they mention event/lesson/calendar/appointment.
- mark_attendance: record a child present or absent for a day (e.g. "mark Emma present today").
- check_attendance: summarize attendance for a child / this month (not "open the attendance screen" — that is navigate).
- log_grade: save a letter grade or numeric score for a child (optionally tied to a subject). Not logging homework as an activity (that is add_activity).
- list_grades: show recent saved grades / scores (read-only). Not "log grade" (that is log_grade).
- list_materials: list or summarize items in the materials library (not "open library" — that is navigate).
- add_material: save a **web link** into the materials library from chat (user includes https://… and words like add/save/material/library). Not uploading a file from chat (tell them to use Library). Not list_materials.
- delete_material: remove/archive a specific library material by name (not deleting a calendar event).
- rename_material: rename a library material / book / file (e.g. rename "Old" to "New" in the library). Not renaming a child or calendar event.
- list_children: who are the kids / list children in the family.
- list_subjects: list subjects (not subject *progress* — that is progress_summary).
- update_child: rename a learner (e.g. "rename Emma to Emily") or change their grade. Not renaming a calendar event or a subject row (use rename_subject when they say "subject").
- archive_child: hide/archive a learner from planning (not delete forever).
- delete_child_permanent: only when user clearly wants permanent removal (danger).
- add_subject: add a new subject for a child (e.g. add Algebra for Emma).
- delete_subject: permanently delete a subject from the family (not a library material or calendar event).
- rename_subject: rename a planner subject for a child (message should mention "subject", e.g. rename subject Algebra to Geometry for Emma). Not library materials (rename_material) or calendar events.
- queue_reschedule: broad reschedule / shift plan requests without naming one event.
- progress_summary: how a child is doing / subject progress.
- suggest_subjects / suggest_courses: recommendations.

Reply with only a JSON object, no other text: { "intent": "<intent>", "confidence": <0-1 number> }`;

/**
 * Call small LLM to classify intent. Falls back to keyword triage on failure or low confidence.
 * @param {string} userMessage
 * @param {Object} context - family context (e.g. children) for keyword triage
 * @param {Function} createClient - OpenAI-style client
 * @returns {Promise<{ intent: string, confidence: number }>}
 */
export async function classifyIntentLLM(userMessage, context, createClient) {
  const fallback = triageIntentKeyword(userMessage, context);

  // Skip a full classifier LLM round-trip when keyword triage is already confident (saves ~1–3s per message).
  const CLASSIFIER_SKIP_THRESHOLD = 0.78;
  if (fallback.confidence >= CLASSIFIER_SKIP_THRESHOLD) {
    return fallback;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const client = createClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CLASSIFIER_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 80,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback;

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}') + 1;
    const jsonStr = start >= 0 && end > start ? raw.slice(start, end) : raw;
    const parsed = JSON.parse(jsonStr);
    const intent = parsed.intent && INTENTS.includes(parsed.intent) ? parsed.intent : fallback.intent;
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : fallback.confidence;

    if (confidence < 0.5) return fallback;
    return { intent, confidence };
  } catch {
    return fallback;
  }
}
