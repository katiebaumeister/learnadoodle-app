// Doodle AI Assistant - Fast Chat Assistant for Learnadoodle
// Structured response contract, LLM intent classification, compressed context, conversation memory.

import { supabase } from './supabase.js';
import { getSubjectsWithOverview } from './services/subjectsClient.js';
import {
  createAssistantResponse,
  getDisplayMessage,
  toLegacyResponse,
  isToolCall,
  getToolName,
  getToolParams,
  RESPONSE_TYPES,
} from './assistant/responseContract.js';
import { validateToolParams } from './assistant/toolSchemas.js';
import { logAssistantEvent } from './assistant/assistantLogger.js';
import { buildCompressedContext, formatContextForPrompt } from './assistant/contextBuilder.js';
import { classifyIntentLLM } from './assistant/intentClassifier.js';
import { searchKnowledge } from './chatbotKnowledgeStore.js';

const API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_DIRECT = 'gpt-4o-mini';
const MODEL_CLASSIFIER = 'gpt-4o-mini';
const RECENT_MESSAGES_LIMIT = 5;

const createOpenAIClient = (baseUrl = 'https://api.openai.com/v1') => ({
  chat: {
    completions: {
      create: async (params) => {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify(params),
        });
        if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
        return response.json();
      },
    },
  },
});

const getFamilyContext = async (familyId) => {
  try {
    const [childrenRes, subjectsRes, subjectTracksRes, academicYearRes, activitiesRes] = await Promise.all([
      supabase.from('children').select('*').eq('family_id', familyId),
      supabase.from('subject').select('*').eq('family_id', familyId),
      supabase.from('subject_track').select('*').eq('family_id', familyId),
      supabase.from('family_years').select('*').eq('family_id', familyId).eq('is_current', true).single(),
      // Fetch activities separately so 404 (e.g. missing table) doesn't break context; assistant doesn't use it yet
      supabase.from('activities').select('*').eq('family_id', familyId).then((r) => r.data || []).catch(() => []),
    ]);
    const activities = Array.isArray(activitiesRes) ? activitiesRes : [];
    return {
      children: childrenRes.data || [],
      subjects: subjectsRes.data || [],
      subjectTracks: subjectTracksRes.data || [],
      activities,
      academicYear: academicYearRes.data || null,
      familyId,
    };
  } catch {
    return { children: [], subjects: [], subjectTracks: [], activities: [], academicYear: null, familyId };
  }
};

const suggestSubjects = async (context, childName = null, meta = null) => {
  try {
    const { children, subjects } = context;
    let child = childName ? children.find((c) => (c.first_name || '').toLowerCase().includes(childName.toLowerCase())) : null;
    if (!child && children.length > 0) child = children[0];

    if (!child) {
      return createAssistantResponse(
        RESPONSE_TYPES.MESSAGE,
        "I need to know which child you're asking about. Could you tell me their name?",
        null,
        meta
      );
    }

    const grade = parseInt(child.grade, 10) || 0;
    const existingSubjects = subjects.filter((s) => s.student_id === child.id);
    let recommendations = [];

    if (grade <= 5) {
      const cores = ['Math', 'ELA (Reading & Writing)', 'Science', 'Social Studies'];
      const electives = ['Art', 'Music', 'Physical Education'];
      cores.forEach((subject) => {
        if (!existingSubjects.some((s) => (s.subject_name || '').toLowerCase().includes(subject.toLowerCase()))) recommendations.push(subject);
      });
      electives.forEach((subject) => { if (recommendations.length < 6) recommendations.push(subject); });
    } else if (grade <= 8) {
      const cores = ['Math', 'ELA', 'Science', 'Social Studies'];
      const electives = ['Art', 'Music', 'Physical Education', 'Foreign Language'];
      cores.forEach((subject) => {
        if (!existingSubjects.some((s) => (s.subject_name || '').toLowerCase().includes(subject.toLowerCase()))) recommendations.push(subject);
      });
      electives.forEach((subject) => { if (recommendations.length < 7) recommendations.push(subject); });
    } else {
      const categories = { Math: ['Algebra I'], English: ['English 9'], Science: ['Biology'], 'Social Studies': ['World History'], 'Foreign Language': ['Spanish I'] };
      Object.entries(categories).forEach(([category, options]) => {
        if (!existingSubjects.some((s) => (s.subject_name || '').toLowerCase().includes(category.toLowerCase()))) recommendations.push(`${category}: ${options[0]}`);
      });
    }

    const text = `For ${child.first_name} (${grade}th grade), I suggest:\n${recommendations.map((r) => `• ${r}`).join('\n')}\n\nDoes this cover what you had in mind?`;
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, text, null, { ...meta, matched_child: child.first_name });
  } catch {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, "I'm having trouble suggesting subjects right now. Could you try again?", null, meta);
  }
};

const suggestCourses = async (context, subjectName, approach = null, meta = null) => {
  try {
    if (!approach) {
      const text = `I can help you find courses for ${subjectName}. Here are the main approaches:\n\n1. Live-class – instructor led, parent supervision only ($0-$400/semester)\n2. Self-paced online – video lessons + auto-grading; minimal teaching ($0-$200/semester)\n3. Self-paced book/print – textbook + workbook; some parent grading ($20-$150/semester)\n4. Custom plan – Doodle drafts lessons; best if parent comfortable coaching ($0-$100/semester)\n\nWhich approach feels best?`;
      return createAssistantResponse(RESPONSE_TYPES.MESSAGE, text, null, meta);
    }
    let courses = [];
    if (approach === 'live-class') courses = [`Outschool ${subjectName} – 16 wks, ~$280`, `Time4Learning ${subjectName} – 18 wks, ~$200`, `K12 ${subjectName} – 20 wks, ~$350`];
    else if (approach === 'self-paced online') courses = [`Khan Academy ${subjectName} – free, self-paced`, `IXL ${subjectName} – $10/month, adaptive`, `Coursera ${subjectName} – free, university-level`];
    else if (approach === 'self-paced book/print') courses = [`${subjectName} textbook set – ~$55`, `Workbook series – ~$25`, `Complete curriculum – ~$120`];
    else if (approach === 'custom plan') {
      return createAssistantResponse(RESPONSE_TYPES.MESSAGE, `I'll create a custom ${subjectName} plan for you. Let me work on that...`, null, meta, { fetch: 'custom-plan' });
    }
    const text = `Here are some ${approach} options for ${subjectName}:\n${courses.map((c) => `• ${c}`).join('\n')}\n\nLet me know which specific course you'd like, or if you need more options.`;
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, text, null, meta);
  } catch {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, "I'm having trouble suggesting courses right now. Could you try again?", null, meta);
  }
};

/**
 * Run add_appointment logic for a given message (can be combined e.g. "add doctors appt today at 3 for Lilly").
 * Returns assistant response with createEventInBackground or prompt for assignee.
 * @param {string} msg - User message (or combined message for follow-up)
 * @param {object} context - Family context
 * @param {string} familyId
 * @param {object} meta
 * @param {number} startMs
 * @param {{ assigneeOverride?: string }} options - If set, use this as the assignee (e.g. "lilly") instead of parsing from msg (avoids "for today" matching)
 */
function handleAddAppointment(msg, context, familyId, meta, startMs, options = {}) {
  const message = typeof msg === 'string' ? msg.trim() : '';
  const assigneeOverride = options.assigneeOverride != null ? String(options.assigneeOverride).trim() : null;

  // Parse title (support "appointment" and "appt")
  let title = 'Appointment';
  const doctorMatch = message.match(/(?:add|schedule|create|book)\s+(?:a\s+)?(?:doctor['s]?\s*)?(.*?)\s+appt(?:ointment)?/i) ||
    message.match(/(?:add|schedule).*?(doctor['s]?|dentist)/i) ||
    message.match(/(doctor['s]?|dentist)\s*(?:appt|appointment)?/i);
  if (doctorMatch) {
    const raw = (doctorMatch[1] || doctorMatch[0] || '').replace(/\s+appt(?:ointment)?$/i, '').trim();
    if (raw && !/^(doctor|dentist)/i.test(raw)) title = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    else if (/doctor/i.test(doctorMatch[0] || raw)) title = 'Doctors';
    else if (/dentist/i.test(doctorMatch[0] || raw)) title = 'Dentist';
  }

  // Parse date
  let date = new Date();
  if (/\btomorrow\b/i.test(message)) {
    date = new Date(date);
    date.setDate(date.getDate() + 1);
  }

  // Parse time
  let hour24 = 15;
  let min = 0;
  const timeMatch = message.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) || message.match(/\b(?:at\s+)?(\d{1,2})\b/);
  if (timeMatch) {
    hour24 = parseInt(timeMatch[1], 10);
    min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = (timeMatch[3] || '').toLowerCase();
    if (!ampm) hour24 = hour24 < 8 ? hour24 + 12 : hour24;
    else if (ampm === 'am' && hour24 === 12) hour24 = 0;
    else if (ampm === 'pm' && hour24 !== 12) hour24 += 12;
  }

  // Parse assignee: use assigneeOverride when provided (follow-up reply), else parse from message.
  // Match child by first_name or name (DB may use either).
  const childDisplayName = (c) => (c.first_name || c.name || '').trim().toLowerCase();
  let childIds = [];
  const assigneeSource = assigneeOverride !== null && assigneeOverride !== '' ? assigneeOverride : null;
  const textToResolve = assigneeSource !== null ? assigneeSource : message;
  if (/\b(all\s+children|everyone|every\s+child)\b/i.test(textToResolve)) {
    childIds = (context.children || []).map((c) => c.id);
  } else {
    let forName = null;
    if (assigneeSource !== null) {
      forName = assigneeSource.trim().toLowerCase();
    } else {
      const forMatches = message.matchAll(/\bfor\s+(\w+)\b/gi);
      for (const match of forMatches) {
        const candidate = match[1].toLowerCase();
        if ((context.children || []).some((c) => childDisplayName(c) === candidate)) {
          forName = candidate;
          break;
        }
      }
    }
    if (forName) {
      const child = (context.children || []).find((c) => childDisplayName(c) === forName);
      if (child) childIds = [child.id];
    }
  }

  const children = context.children || [];
  if (children.length > 1 && childIds.length === 0) {
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "Just one more thing, who is this for? You can say all children or assign specifically.",
      null,
      meta
    );
  }
  if (children.length === 1 && childIds.length === 0) childIds = [children[0].id];

  const startDate = new Date(date);
  startDate.setHours(hour24, min, 0, 0);
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
  const start_ts = startDate.toISOString();
  const end_ts = endDate.toISOString();

  const eventData = {
    title: title || 'Appointment',
    start_ts,
    end_ts,
    event_type: 'Appointment',
    status: 'scheduled',
    source: 'doodle',
    minutes: 30,
    description: null,
    tags: null,
    is_flexible: false,
    subject_id: null,
    unit: null,
    grade: null,
    location: null,
    mode: null,
    instructor: null,
    goal_link: null,
    materials_attachment_ids: null,
    source_link: null,
    resume_position: null,
  };

  return createAssistantResponse(
    RESPONSE_TYPES.MESSAGE,
    `Done. I've added ${title || 'the appointment'} to the calendar.`,
    null,
    meta,
    { createEventInBackground: { eventData, familyId, childIds } }
  );
}

/**
 * Main Doodle assistant. Options.recentMessages = [{ role, content }] for short-term memory (e.g. last 5).
 */
export const processDoodleMessage = async (userMessage, familyId, conversationId = null, options = {}) => {
  const startMs = Date.now();
  const recentMessages = Array.isArray(options.recentMessages) ? options.recentMessages.slice(-RECENT_MESSAGES_LIMIT) : [];

  logAssistantEvent({ user_message: userMessage });

  try {
    const context = await getFamilyContext(familyId);
    if (!context.familyId) {
      const out = createAssistantResponse(RESPONSE_TYPES.ERROR, "I need to know your family information to help you. Please try again.", null, { intent: null });
      logAssistantEvent({ intent: null, response_type: 'error', latency_ms: Date.now() - startMs });
      return out;
    }

    const { intent, confidence } = await classifyIntentLLM(userMessage, context, createOpenAIClient);
    const meta = { intent, confidence };
    logAssistantEvent({ intent, confidence });

    // Follow-up: user replied with just a name (e.g. "Lilly") after we asked "who is this for?"
    const trimMsg = typeof userMessage === 'string' ? userMessage.trim() : '';
    const isShortReply = trimMsg.length > 0 && trimMsg.length < 80 && !/\b(add|schedule|create|log|progress|reschedule|take me)\b/i.test(trimMsg);
    if (isShortReply && recentMessages.length >= 2) {
      const last = recentMessages[recentMessages.length - 1];
      const lastContent = last?.role === 'assistant' && typeof last.content === 'string' ? last.content : '';
      if (lastContent && (lastContent.includes('who is this for?') || lastContent.includes('You can say all children'))) {
        let priorUserContent = '';
        for (let i = recentMessages.length - 2; i >= 0; i--) {
          if (recentMessages[i].role === 'user') {
            priorUserContent = typeof recentMessages[i].content === 'string' ? recentMessages[i].content.trim() : '';
            break;
          }
        }
        if (priorUserContent) {
          const out = handleAddAppointment(priorUserContent, context, familyId, { ...meta, intent: 'add_appointment' }, startMs, { assigneeOverride: trimMsg });
          logAssistantEvent({ response_type: 'message', intent: 'add_appointment', follow_up_assignee: true, latency_ms: Date.now() - startMs });
          return out;
        }
      }
    }

    switch (intent) {
      case 'add_activity': {
        const params = {
          activity_type: 'homework',
          name: userMessage.replace(/log|homework|activity/gi, '').trim() || 'Activity',
          schedule_data: {},
        };
        const out = createAssistantResponse(
          RESPONSE_TYPES.TOOL_CALL,
          "I'll help you log that activity. What subject is this for?",
          { name: 'add_activity', params },
          meta
        );
        logAssistantEvent({ response_type: 'tool_call', tool_called: 'add_activity', latency_ms: Date.now() - startMs, model_used: null });
        return out;
      }

      case 'progress_summary': {
        const subjectMatchesKeyword = (subjName, keyword) => {
          if (!subjName || !keyword) return false;
          const s = subjName.toLowerCase();
          const k = keyword.toLowerCase();
          return s === k || s.startsWith(k + ' ') || s === k + 's' || (k.endsWith('s') && s === k.slice(0, -1)) || k.startsWith(s);
        };

        const subjectNameMatch = userMessage.match(/(?:progress\s+on|for|in|status\s+on)\s+(\w+)/i) || userMessage.match(/(\w+)\s+progress/i) || userMessage.match(/(?:what'?s?|whats?)\s+(?:the\s+)?(?:status|progress)\s+on\s+(\w+)/i);
        const subjectKeyword = subjectNameMatch ? subjectNameMatch[1].toLowerCase().trim() : null;

        if (subjectKeyword) {
          try {
            const childrenWithSubject = [];
            for (const c of context.children) {
              const subjects = await getSubjectsWithOverview(familyId, c.id, null);
              if (subjects && subjects.some((s) => subjectMatchesKeyword((s.name || s.subject_name || '').trim(), subjectKeyword))) {
                childrenWithSubject.push(c);
              }
            }
            if (childrenWithSubject.length === 1) {
              const onlyChild = childrenWithSubject[0];
              const subjects = await getSubjectsWithOverview(familyId, onlyChild.id, null);
              const match = subjects.find((s) => subjectMatchesKeyword((s.name || s.subject_name || '').trim(), subjectKeyword));
              const subjectName = match ? (match.name || match.subject_name || subjectKeyword) : subjectKeyword;
              const pct = match && match.progressPercent != null && !Number.isNaN(match.progressPercent) ? Math.round(match.progressPercent) : null;
              const progressLine = pct != null ? `${pct}%` : 'no progress data yet';
              const msg = `${onlyChild.first_name} is the only child with ${subjectName}. Their progress is: ${progressLine}.`;
              return createAssistantResponse(RESPONSE_TYPES.MESSAGE, msg, null, { ...meta, matched_child: onlyChild.first_name, matched_subject: subjectName });
            }
            if (childrenWithSubject.length > 1) {
              const names = childrenWithSubject.map((c) => c.first_name || 'Unknown').join(', ');
              return createAssistantResponse(RESPONSE_TYPES.MESSAGE, `For what child? (${names})`, null, meta);
            }
            return createAssistantResponse(RESPONSE_TYPES.MESSAGE, `No one has ${subjectKeyword} with progress data yet.`, null, meta);
          } catch (err) {
            return createAssistantResponse(RESPONSE_TYPES.MESSAGE, "I couldn't load progress data right now. Please try again.", null, { ...meta, reasoning: err?.message });
          }
        }

        const msgLower = userMessage.toLowerCase();
        const mentionedChild = context.children.find((c) => msgLower.includes((c.first_name || '').toLowerCase()));
        const child = mentionedChild || (context.children.length === 1 ? context.children[0] : null);

        if (context.children.length > 1 && !mentionedChild) {
          const names = context.children.map((c) => c.first_name || 'Unknown').join(', ');
          return createAssistantResponse(RESPONSE_TYPES.MESSAGE, `For what child? (${names})`, null, meta);
        }
        if (!child) {
          return createAssistantResponse(RESPONSE_TYPES.MESSAGE, "I need to know which child you're asking about. Could you tell me their name?", null, meta);
        }

        try {
          const subjects = await getSubjectsWithOverview(familyId, child.id, null);
          if (!subjects || subjects.length === 0) {
            return createAssistantResponse(RESPONSE_TYPES.MESSAGE, `${child.first_name} doesn't have any subjects with progress data yet.`, null, { ...meta, matched_child: child.first_name });
          }

          const lines = subjects
            .filter((s) => s.progressPercent != null && !Number.isNaN(s.progressPercent))
            .map((s) => `${s.name || s.subject_name}: ${Math.round(s.progressPercent)}%`)
            .slice(0, 10);
          const summary = lines.length > 0 ? lines.join('\n') : 'No subject progress data yet.';
          return createAssistantResponse(RESPONSE_TYPES.MESSAGE, `${child.first_name}'s progress:\n${summary}`, null, { ...meta, matched_child: child.first_name });
        } catch (err) {
          return createAssistantResponse(RESPONSE_TYPES.MESSAGE, "I couldn't load progress data right now. Please try again.", null, { ...meta, reasoning: err?.message });
        }
      }

      case 'queue_reschedule': {
        const out = createAssistantResponse(
          RESPONSE_TYPES.TOOL_CALL,
          "I'll help you reschedule that. What date should we move it to?",
          {
            name: 'queue_reschedule',
            params: {
              family_id: familyId,
              calendar_date: new Date().toISOString().split('T')[0],
              note: userMessage,
            },
          },
          meta
        );
        logAssistantEvent({ response_type: 'tool_call', tool_called: 'queue_reschedule', latency_ms: Date.now() - startMs });
        return out;
      }

      case 'add_appointment': {
        const out = handleAddAppointment(userMessage, context, familyId, meta, startMs);
        logAssistantEvent({ response_type: 'message', intent: 'add_appointment', latency_ms: Date.now() - startMs });
        return out;
      }

      case 'suggest_subjects': {
        const childName = userMessage.match(/(?:for|about)\s+(\w+)/i)?.[1];
        return await suggestSubjects(context, childName, meta);
      }

      case 'suggest_courses': {
        const subjectMatch = userMessage.match(/(?:for|about)\s+([^?]+)/i);
        const subject = subjectMatch ? subjectMatch[1].trim() : 'Math';
        const approachMatch = userMessage.match(/(live-class|self-paced|custom)/i);
        const approach = approachMatch ? approachMatch[1].toLowerCase() : null;
        return await suggestCourses(context, subject, approach, meta);
      }

      case 'navigate': {
        const msg = userMessage.toLowerCase();
        let fetchTarget = null;
        let text = '';
        if (/attendance|attend/i.test(msg)) {
          fetchTarget = 'navigate_planner_attendance';
          text = "Taking you to the Planner attendance view.";
        } else if (/planner|schedule|calendar/i.test(msg)) {
          fetchTarget = 'navigate_planner';
          text = "Taking you to the Planner.";
        } else if (/home|dashboard/i.test(msg)) {
          fetchTarget = 'navigate_home';
          text = "Taking you to Home.";
        } else {
          fetchTarget = 'navigate_planner_attendance';
          text = "Taking you to the Planner attendance view.";
        }
        return createAssistantResponse(RESPONSE_TYPES.MESSAGE, text, null, meta, { fetch: fetchTarget });
      }

      default: {
        const client = createOpenAIClient();
        const compressed = await buildCompressedContext(familyId, context);
        const contextBlock = formatContextForPrompt(compressed);
        let knowledgeBlock = '';
        try {
          const hits = await searchKnowledge(userMessage, { matchCount: 5, matchThreshold: 0.45 });
          if (hits?.length > 0) {
            knowledgeBlock = '\n\nApp guide (use to direct users where to find things in the app):\n' + hits.map((h) => h.content).join('\n\n---\n\n');
          }
        } catch {
          // RAG optional; continue without
        }
        const systemPrompt = `You are Doodle, the fast chat assistant for Learnadoodle. You help parents with quick questions about their homeschooling journey.

Key principles:
- Be concise (≤2 sentences when possible)
- Be helpful and supportive
- Use the family's actual data when relevant
- Don't give legal/compliance advice
- Ask for missing information when needed
- When users ask where to find something (grades, attendance, subjects, planner, etc.), use the App guide below to point them to the right screen (e.g. "Go to the Subjects screen and open a subject to see grades.").

Family context:
${contextBlock}${knowledgeBlock}`;

        const messages = [{ role: 'system', content: systemPrompt }];
        for (const m of recentMessages) {
          if (m.role && m.content) messages.push({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content?.text || '' });
        }
        messages.push({ role: 'user', content: userMessage });

        const response = await client.chat.completions.create({
          model: MODEL_DIRECT,
          messages,
          temperature: 0.7,
          max_tokens: 200,
        });

        const text = response.choices?.[0]?.message?.content?.trim() || "I'm not sure how to answer that. Can you rephrase?";
        const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, text, null, meta);
        logAssistantEvent({ response_type: 'message', latency_ms: Date.now() - startMs, model_used: MODEL_DIRECT });
        return out;
      }
    }
  } catch (error) {
    const out = createAssistantResponse(RESPONSE_TYPES.ERROR, "I'm having trouble processing your request right now. Please try again.", null, { reasoning: error?.message });
    logAssistantEvent({ response_type: 'error', error: error?.message, latency_ms: Date.now() - startMs });
    return out;
  }
};

export { getDisplayMessage, toLegacyResponse, isToolCall, getToolName, getToolParams };

/**
 * Guardrails: ensure child belongs to family (for tools that take child_id).
 */
async function ensureChildBelongsToFamily(childId, familyId) {
  if (!childId) return { ok: false, error: 'child_id is required' };
  const { data, error } = await supabase.from('children').select('id').eq('id', childId).eq('family_id', familyId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Child not found or not in this family' };
  return { ok: true };
}

/**
 * Execute a tool with validation and guardrails. Returns { success, data, userMessage? }.
 * userMessage is a natural-language summary for the UI (e.g. "I've added the activity to Emma's plan for tomorrow.").
 */
export const executeTool = async (toolName, params, familyId) => {
  const startMs = Date.now();
  const tool = typeof toolName === 'string' ? toolName : (toolName?.name ?? null);
  const toolParams = params || toolName?.params || {};

  const validation = validateToolParams(tool, toolParams);
  if (!validation.valid) {
    logAssistantEvent({ tool_called: tool, execution_result: 'rejected', error: validation.error });
    throw new Error(validation.error);
  }

  try {
    switch (tool) {
      case 'add_activity': {
        const childId = toolParams.child_id;
        if (childId) {
          const guard = await ensureChildBelongsToFamily(childId, familyId);
          if (!guard.ok) {
            logAssistantEvent({ tool_called: tool, execution_result: 'rejected', error: guard.error });
            throw new Error(guard.error);
          }
        }
        const { data, error } = await supabase.rpc('add_activity', familyId, toolParams.name, toolParams.subject_track_id || null, toolParams.activity_type || 'homework', toolParams.schedule_data || {});
        if (error) throw error;
        const childName = toolParams._childNameForMessage;
        const userMessage = childName ? `I've added "${toolParams.name}" to ${childName}'s plan.` : `I've added the activity "${toolParams.name}" to the plan.`;
        logAssistantEvent({ tool_called: tool, execution_result: 'success', latency_ms: Date.now() - startMs });
        return { success: true, data, userMessage };
      }

      case 'progress_summary': {
        const guard = await ensureChildBelongsToFamily(toolParams.child_id, familyId);
        if (!guard.ok) {
          logAssistantEvent({ tool_called: tool, execution_result: 'rejected', error: guard.error });
          throw new Error(guard.error);
        }
        const { data: progressData, error: progressError } = await supabase.rpc('progress_summary', toolParams.child_id, toolParams.days_back || 14);
        if (progressError) {
          const fallbackData = {
            child_id: toolParams.child_id,
            period_days: toolParams.days_back || 14,
            summary: 'Progress data not available',
          };
          logAssistantEvent({ tool_called: tool, execution_result: 'success', latency_ms: Date.now() - startMs });
          return { success: true, data: fallbackData };
        }
        logAssistantEvent({ tool_called: tool, execution_result: 'success', latency_ms: Date.now() - startMs });
        return { success: true, data: progressData };
      }

      case 'queue_reschedule': {
        if (toolParams.family_id && toolParams.family_id !== familyId) {
          logAssistantEvent({ tool_called: tool, execution_result: 'rejected', error: 'family_id mismatch' });
          throw new Error('Cannot reschedule for another family');
        }
        const { data: rescheduleData, error: rescheduleError } = await supabase.rpc('queue_reschedule', familyId, toolParams.calendar_date, toolParams.note || '');
        if (rescheduleError) throw rescheduleError;
        const userMessage = `I've queued your reschedule for ${toolParams.calendar_date}. I'll help adjust the plan around that.`;
        logAssistantEvent({ tool_called: tool, execution_result: 'success', latency_ms: Date.now() - startMs });
        return { success: true, data: rescheduleData, userMessage };
      }

      default:
        logAssistantEvent({ tool_called: tool, execution_result: 'rejected', error: `Unknown tool: ${tool}` });
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (error) {
    logAssistantEvent({ tool_called: tool, execution_result: 'failure', error: error?.message, latency_ms: Date.now() - startMs });
    throw error;
  }
};
