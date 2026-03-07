/**
 * Intent classification: LLM-based classifier with keyword fallback.
 */

const INTENTS = [
  'add_appointment',
  'add_activity',
  'progress_summary',
  'queue_reschedule',
  'suggest_subjects',
  'suggest_courses',
  'navigate',
  'direct_answer',
];

/**
 * Keyword-based fallback when LLM is unavailable or low confidence.
 */
export function triageIntentKeyword(userMessage, _context) {
  const message = userMessage.toLowerCase();

  // Add/schedule appointment before add_activity and queue_reschedule so "add a doctors appointment" isn't misclassified
  if (/\b(add|schedule|create|book)\b.*\b(appointment|doctor|dentist)\b/i.test(message) ||
      /\b(appointment|doctor['s]?\s*appointment|dentist)\b.*\b(for|at|on|today|tomorrow)\b/i.test(message)) {
    return { intent: 'add_appointment', confidence: 0.85 };
  }
  if (/log|homework|activity|add\s+(an?\s+)?(activity|homework)/i.test(message)) {
    return { intent: 'add_activity', confidence: 0.8 };
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
  if (/take\s+me\s+to|show\s+me\s+the|go\s+to\s+the|open\s+(the\s+)?(attendance|planner)|attendance\s+page|planner\s+attendance|navigate\s+to/i.test(message)) {
    return { intent: 'navigate', confidence: 0.85 };
  }

  return { intent: 'direct_answer', confidence: 0.5 };
}

const CLASSIFIER_PROMPT = `Classify the user request into exactly one of these intents: ${INTENTS.join(', ')}.
Reply with only a JSON object, no other text: { "intent": "<intent>", "confidence": <0-1 number> }`;

/**
 * Call small LLM to classify intent. Falls back to keyword triage on failure or low confidence.
 * @param {string} userMessage
 * @param {Object} context - unused but available for future context-aware classification
 * @param {Function} createClient - OpenAI-style client
 * @returns {Promise<{ intent: string, confidence: number }>}
 */
export async function classifyIntentLLM(userMessage, context, createClient) {
  const fallback = triageIntentKeyword(userMessage, context);

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
