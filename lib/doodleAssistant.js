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
import { classifyIntentLLM, triageIntentKeyword } from './assistant/intentClassifier.js';
import {
  CHAT_COMMIT_KINDS,
  summarizeCreateEventCommit,
  summarizeAddActivityCommit,
  summarizeQueueRescheduleCommit,
  summarizeDeleteEventProposal,
  summarizeUpdateEventProposal,
  summarizeMarkAttendanceProposal,
  summarizeDeleteMaterialProposal,
  summarizeUpdateMaterialProposal,
  summarizeUpdateChildProposal,
  summarizeArchiveChildProposal,
  summarizeDeleteChildPermanentProposal,
  summarizeAddSubjectProposal,
  summarizeDeleteSubjectProposal,
  summarizeUpdateSubjectProposal,
  summarizeLogGradeProposal,
  summarizeAddMaterialLinkProposal,
} from './assistant/chatCommit.js';
import {
  fetchResolvableEvents,
  resolveEventFromUserMessage,
  parseEventUpdatesFromMessage,
  summarizeEventForChat,
  stripEventForDisambiguation,
  resolveDisambiguationReply,
} from './assistant/eventChatActions.js';
import {
  fetchAttendanceSummaryForChild,
  pickChildFromMessage,
  parseAttendanceDate,
} from './assistant/attendanceChatActions.js';
import {
  fetchMaterialsForChat,
  resolveMaterialFromUserMessage,
  summarizeMaterialLine,
  stripMaterialForDisambiguation,
  parseRenameMaterialTitles,
  parseAddMaterialLinkIntent,
} from './assistant/materialChatActions.js';
import {
  formatChildrenListLines,
  fetchSubjectsForFamily,
  formatSubjectsListLines,
  parseRenameChild,
  parseGradeChild,
  parseArchiveChildIntent,
  parseDeleteChildPermanentIntent,
  parseAddSubjectIntent,
  resolveSubjectFromUserMessage,
  summarizeSubjectLineForChat,
  stripSubjectForDisambiguation,
  parseRenameSubjectTitles,
} from './assistant/familyRosterChatActions.js';
import { parseLogGradeIntent, fetchGradesForChat, formatGradesListLines } from './assistant/gradesChatActions.js';
import { searchKnowledge } from './chatbotKnowledgeStore.js';
import { searchLocalAppGuide } from './appGuide/localGuideSearch.js';

const API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_DIRECT = 'gpt-4o-mini';
const MODEL_CLASSIFIER = 'gpt-4o-mini';
const RECENT_MESSAGES_LIMIT = 5;
/** Local app guide match quality — below this we fall back to the grounded model */
const FAST_GUIDE_MIN_SIMILARITY = 0.52;
let disableClientLlmForSession = false;

const hasUsableClientOpenAIKey = () => {
  const key = String(API_KEY || '').trim();
  if (!key) return false;
  // Guard obvious placeholders from local/dev env templates.
  if (/your-openai-key|replace-me|placeholder|sk-your/i.test(key)) return false;
  return key.startsWith('sk-');
};

function normalizeGuideLanguage(rawText) {
  let text = String(rawText || '');
  // Align legacy IA terms with current app labels.
  text = text.replace(/\bLearning\s*>\s*/gi, 'Subjects > ');
  text = text.replace(/,\s*Learning\s*\(/gi, ', Subjects (');
  text = text.replace(/\bopen\s+Learning\b/gi, 'open Subjects');
  return text;
}

function toFriendlyPlainText(rawText, { maxChars = 520, maxSentences = 4 } = {}) {
  let text = normalizeGuideLanguage(rawText);
  // Remove markdown-heavy formatting for parent-facing chat tone.
  text = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const concise = (sentences.slice(0, Math.max(1, maxSentences)).join(' ') || text).trim();
  return concise.slice(0, maxChars).trim();
}

const createOpenAIClient = (baseUrl = 'https://api.openai.com/v1') => ({
  chat: {
    completions: {
      create: async (params) => {
        if (!hasUsableClientOpenAIKey() || disableClientLlmForSession) {
          throw new Error('Client LLM unavailable');
        }
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify(params),
        });
        if (response.status === 401 || response.status === 403) {
          // Prevent repeated unauthorized completion calls from spamming logs.
          disableClientLlmForSession = true;
          throw new Error(`OpenAI API unauthorized: ${response.status}`);
        }
        if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
        return response.json();
      },
    },
  },
});

const getFamilyContext = async (familyId) => {
  try {
    const [childrenRes, subjectsRes, subjectTracksRes, academicYearRes] = await Promise.all([
      supabase.from('children').select('*').eq('family_id', familyId),
      supabase.from('subject').select('*').eq('family_id', familyId),
      supabase.from('subject_track').select('*').eq('family_id', familyId),
      // maybeSingle: no "current" year is valid — .single() caused HTTP 406 when zero rows matched
      supabase.from('family_years').select('*').eq('family_id', familyId).eq('is_current', true).maybeSingle(),
    ]);
    return {
      children: childrenRes.data || [],
      subjects: subjectsRes.data || [],
      subjectTracks: subjectTracksRes.data || [],
      activities: [],
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
    source: 'chatbot',
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

  const childLabels = childIds.map((id) => {
    const c = children.find((ch) => ch.id === id);
    return (c?.first_name || c?.name || 'Student').trim();
  });
  const summaryBlock = summarizeCreateEventCommit(eventData, childLabels);
  return createAssistantResponse(
    RESPONSE_TYPES.MESSAGE,
    `Here's what I'll add to your calendar. Use **Add to calendar** to save, or **Cancel** to skip.\n\n${summaryBlock}`,
    null,
    meta,
    {
      pendingCommit: {
        kind: CHAT_COMMIT_KINDS.CREATE_EVENT,
        payload: { eventData, familyId, childIds },
      },
    }
  );
}

function buildDeletePendingResponse(ev, familyId, meta) {
  const snap = { title: ev.title, start_ts: ev.start_ts, event_type: ev.event_type };
  const body = `I'll remove this from your calendar:\n\n${summarizeDeleteEventProposal(snap)}\n\nTap **Delete event** to confirm — you can restore from trash in the planner if needed.`;
  return createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.DELETE_EVENT,
      payload: { familyId, eventId: ev.id, snapshot: snap },
    },
  });
}

async function completeUpdateEventAfterResolve(priorUserMessage, ev, _familyId, _context, meta, startMs, fromDisambiguation = false) {
  const parsed = parseEventUpdatesFromMessage(priorUserMessage, ev);
  if (parsed.error) {
    logAssistantEvent({
      intent: 'update_event',
      response_type: 'message',
      parse_error: true,
      from_disambiguation: fromDisambiguation,
      latency_ms: Date.now() - startMs,
    });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `I matched this event:\n\n${summarizeEventForChat(ev)}\n\n${parsed.error}`,
      null,
      meta
    );
  }
  const body = `I'll apply these updates:\n\n${summarizeUpdateEventProposal(ev, parsed.summaryLines)}\n\nTap **Apply changes** to confirm.`;
  const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.UPDATE_EVENT,
      payload: { eventId: ev.id, updates: parsed.updates, allowOverlaps: false },
    },
  });
  logAssistantEvent({
    intent: 'update_event',
    response_type: 'message',
    pending_commit: true,
    from_disambiguation: fromDisambiguation,
    latency_ms: Date.now() - startMs,
  });
  return out;
}

async function handleDeleteEventIntent(userMessage, familyId, context, meta, startMs) {
  const { events, error } = await fetchResolvableEvents(familyId);
  if (error) {
    logAssistantEvent({ intent: 'delete_event', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't load your calendar right now. Try again, or remove the event from the planner.",
      null,
      meta
    );
  }
  const resolved = resolveEventFromUserMessage(userMessage, events, context);
  if (!resolved.ok) {
    if (resolved.candidates?.length) {
      const lines = resolved.candidates
        .map((e, i) => `${i + 1}. ${summarizeEventForChat(e).replace(/\n/g, ' — ')}`)
        .join('\n');
      logAssistantEvent({ intent: 'delete_event', response_type: 'message', disambiguation: true, latency_ms: Date.now() - startMs });
      return createAssistantResponse(
        RESPONSE_TYPES.MESSAGE,
        `I found more than one match. Reply with the number or put the exact title in quotes:\n\n${lines}`,
        null,
        meta,
        {
          disambiguation: {
            intent: 'delete_event',
            candidates: resolved.candidates.map(stripEventForDisambiguation),
            priorUserMessage: userMessage,
          },
        }
      );
    }
    logAssistantEvent({ intent: 'delete_event', response_type: 'message', no_match: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't find a matching event in the next several weeks. Open the planner, or describe it with a clearer title (quotes help).",
      null,
      meta
    );
  }
  const out = buildDeletePendingResponse(resolved.event, familyId, meta);
  logAssistantEvent({ intent: 'delete_event', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

async function handleUpdateEventIntent(userMessage, familyId, context, meta, startMs) {
  const { events, error } = await fetchResolvableEvents(familyId);
  if (error) {
    logAssistantEvent({ intent: 'update_event', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't load your calendar right now. Try again, or edit the event in the planner.",
      null,
      meta
    );
  }
  const resolved = resolveEventFromUserMessage(userMessage, events, context);
  if (!resolved.ok) {
    if (resolved.candidates?.length) {
      const lines = resolved.candidates
        .map((e, i) => `${i + 1}. ${summarizeEventForChat(e).replace(/\n/g, ' — ')}`)
        .join('\n');
      logAssistantEvent({ intent: 'update_event', response_type: 'message', disambiguation: true, latency_ms: Date.now() - startMs });
      return createAssistantResponse(
        RESPONSE_TYPES.MESSAGE,
        `I found more than one match. Reply with the number or put the exact title in quotes:\n\n${lines}`,
        null,
        meta,
        {
          disambiguation: {
            intent: 'update_event',
            candidates: resolved.candidates.map(stripEventForDisambiguation),
            priorUserMessage: userMessage,
          },
        }
      );
    }
    logAssistantEvent({ intent: 'update_event', response_type: 'message', no_match: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't find a matching event. Name it more specifically or use quotes around the title.",
      null,
      meta
    );
  }
  const ev = resolved.event;
  return await completeUpdateEventAfterResolve(userMessage, ev, familyId, context, meta, startMs, false);
}

async function handleCheckAttendanceIntent(userMessage, familyId, context, meta, startMs) {
  const children = context.children || [];
  const msgLower = userMessage.toLowerCase();
  const child = pickChildFromMessage(msgLower, children);
  if (children.length > 1 && !child) {
    const names = children.map((c) => c.first_name || c.name || 'Child').join(', ');
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, `Which child? (${names})`, null, meta);
  }
  const c = child || children[0];
  if (!c) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, 'Add a child in Settings > Family Members first, then I can summarize attendance.', null, meta);
  }
  const { lines, error } = await fetchAttendanceSummaryForChild(c.id, familyId);
  if (error) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, `I couldn't load attendance: ${error}`, null, meta);
  }
  const text = `**${c.first_name || 'Child'}** — this month:\n\n${lines.join('\n\n')}`;
  logAssistantEvent({ intent: 'check_attendance', response_type: 'message', latency_ms: Date.now() - startMs });
  return createAssistantResponse(RESPONSE_TYPES.MESSAGE, text, null, meta);
}

function buildDeleteMaterialPendingResponse(material, familyId, meta) {
  const snap = { title: material.title, type: material.type };
  const body = `I'll remove this from your materials:\n\n${summarizeDeleteMaterialProposal(snap)}\n\nTap **Remove from materials** to confirm (you can restore it from Materials trash).`;
  return createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.DELETE_MATERIAL,
      payload: { familyId, materialId: material.id, snapshot: snap },
    },
  });
}

function buildRenameMaterialPendingResponse(material, newTitle, familyId, meta) {
  const snap = { title: material.title, type: material.type };
  const nt = String(newTitle || '').trim();
  const body = `I'll rename this materials item:\n\n${summarizeUpdateMaterialProposal(snap, nt)}\n\nTap **Rename** to confirm.`;
  return createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.UPDATE_MATERIAL,
      payload: { familyId, materialId: material.id, snapshot: snap, newTitle: nt },
    },
  });
}

function buildAddMaterialLinkPendingResponse(parsed, familyId, meta) {
  const body = `I'll add this link to your materials:\n\n${summarizeAddMaterialLinkProposal({
    title: parsed.title,
    providerUrl: parsed.providerUrl,
    childName: parsed.childName,
    subjectName: parsed.subjectName,
  })}\n\nTap **Add to materials** to confirm.`;
  return createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.ADD_MATERIAL_LINK,
      payload: {
        familyId,
        title: parsed.title,
        providerUrl: parsed.providerUrl,
        childId: parsed.childId || null,
        subjectId: parsed.subjectId || null,
        snapshot: { title: parsed.title, providerUrl: parsed.providerUrl },
      },
    },
  });
}

function buildDeleteSubjectPendingResponse(subjectRow, familyId, meta) {
  const snap = { name: subjectRow.name };
  const body = `⚠️ **Delete subject**\n\n${summarizeDeleteSubjectProposal(snap)}\n\nTap **Delete subject** only if you're sure.`;
  return createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.DELETE_SUBJECT,
      payload: { familyId, subjectId: subjectRow.id, snapshot: snap },
    },
  });
}

function buildRenameSubjectPendingResponse(subjectRow, newName, familyId, meta, learnerLabel) {
  const snap = { name: subjectRow.name };
  const nm = String(newName || '').trim();
  const body = `I'll rename this subject:\n\n${summarizeUpdateSubjectProposal(snap, nm, learnerLabel)}\n\nTap **Rename subject** to confirm.`;
  return createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.UPDATE_SUBJECT,
      payload: { familyId, subjectId: subjectRow.id, snapshot: snap, newName: nm },
    },
  });
}

async function handleListMaterialsIntent(userMessage, familyId, meta, startMs) {
  const { materials, error } = await fetchMaterialsForChat(familyId);
  if (error) {
    logAssistantEvent({ intent: 'list_materials', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't load your materials right now. Open **Materials** from the sidebar.",
      null,
      meta
    );
  }
  if (!materials.length) {
    logAssistantEvent({ intent: 'list_materials', response_type: 'message', empty: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      'Your materials list is empty. Add files from **Materials**, attach them to lessons, or paste a **https://…** link in chat and say **add to materials**.',
      null,
      meta
    );
  }
  let list = materials;
  const words = userMessage.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const filterHints = words.filter((w) => !['list', 'show', 'what', 'material', 'materials', 'library', 'books', 'have', 'the', 'and', 'for', 'our', 'my', 'all'].includes(w));
  if (filterHints.length) {
    const needle = filterHints[filterHints.length - 1];
    const narrowed = materials.filter(
      (m) =>
        (m.title || '').toLowerCase().includes(needle) ||
        (m.provider_name || '').toLowerCase().includes(needle) ||
        (m.subject_key || '').toLowerCase().includes(needle)
    );
    if (narrowed.length) list = narrowed;
  }
  const lines = list.slice(0, 25).map((m) => summarizeMaterialLine(m)).join('\n');
  const more =
    list.length > 25 ? `\n\n… and ${list.length - 25} more. Open **Materials** for search and filters.` : '';
  logAssistantEvent({ intent: 'list_materials', response_type: 'message', count: list.length, latency_ms: Date.now() - startMs });
  return createAssistantResponse(
    RESPONSE_TYPES.MESSAGE,
    `Materials (newest first):\n\n${lines}${more}`,
    null,
    meta
  );
}

async function handleDeleteMaterialIntent(userMessage, familyId, meta, startMs) {
  const { materials, error } = await fetchMaterialsForChat(familyId);
  if (error) {
    logAssistantEvent({ intent: 'delete_material', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't load your materials. Try again or remove the item from **Materials**.",
      null,
      meta
    );
  }
  if (!materials.length) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, 'Your materials list is empty — nothing to delete.', null, meta);
  }
  const resolved = resolveMaterialFromUserMessage(userMessage, materials);
  if (!resolved.ok) {
    if (resolved.candidates?.length) {
      const lines = resolved.candidates
        .map((m, i) => `${i + 1}. ${summarizeMaterialLine(m).replace(/^•\s*/, '')}`)
        .join('\n');
      logAssistantEvent({ intent: 'delete_material', response_type: 'message', disambiguation: true, latency_ms: Date.now() - startMs });
      return createAssistantResponse(
        RESPONSE_TYPES.MESSAGE,
        `I found more than one match. Reply with the number or put the exact title in quotes:\n\n${lines}`,
        null,
        meta,
        {
          disambiguation: {
            intent: 'delete_material',
            candidates: resolved.candidates.map(stripMaterialForDisambiguation),
            priorUserMessage: userMessage,
          },
        }
      );
    }
    logAssistantEvent({ intent: 'delete_material', response_type: 'message', no_match: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't find that material. Open **Materials** or name it more specifically (quotes help).",
      null,
      meta
    );
  }
  const out = buildDeleteMaterialPendingResponse(resolved.material, familyId, meta);
  logAssistantEvent({ intent: 'delete_material', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

async function handleRenameMaterialIntent(userMessage, familyId, meta, startMs) {
  const parsed = parseRenameMaterialTitles(userMessage);
  if (!parsed) {
    logAssistantEvent({ intent: 'rename_material', response_type: 'message', parse_error: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      'Say e.g. **rename "Old title" to "New title"** or **rename workbook in materials to Algebra workbook**.',
      null,
      meta
    );
  }
  const { materials, error } = await fetchMaterialsForChat(familyId);
  if (error) {
    logAssistantEvent({ intent: 'rename_material', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't load your materials. Try again or rename the item in **Materials**.",
      null,
      meta
    );
  }
  if (!materials.length) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, 'Your materials list is empty — nothing to rename.', null, meta);
  }
  const resolved = resolveMaterialFromUserMessage(parsed.oldHint, materials);
  if (!resolved.ok) {
    if (resolved.candidates?.length) {
      const lines = resolved.candidates
        .map((m, i) => `${i + 1}. ${summarizeMaterialLine(m).replace(/^•\s*/, '')}`)
        .join('\n');
      logAssistantEvent({ intent: 'rename_material', response_type: 'message', disambiguation: true, latency_ms: Date.now() - startMs });
      return createAssistantResponse(
        RESPONSE_TYPES.MESSAGE,
        `I found more than one match. Reply with the number or put the exact title in quotes:\n\n${lines}`,
        null,
        meta,
        {
          disambiguation: {
            intent: 'rename_material',
            candidates: resolved.candidates.map(stripMaterialForDisambiguation),
            priorUserMessage: userMessage,
            newTitle: parsed.newTitle,
          },
        }
      );
    }
    logAssistantEvent({ intent: 'rename_material', response_type: 'message', no_match: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't find that material. Open **Materials** or name the current title more specifically (quotes help).",
      null,
      meta
    );
  }
  const out = buildRenameMaterialPendingResponse(resolved.material, parsed.newTitle, familyId, meta);
  logAssistantEvent({ intent: 'rename_material', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

async function handleAddMaterialIntent(userMessage, familyId, context, meta, startMs) {
  const children = context.children || [];
  const subjects = context.subjects || [];
  const parsed = parseAddMaterialLinkIntent(userMessage, children, subjects);
  if (!parsed) {
    logAssistantEvent({ intent: 'add_material', response_type: 'message', parse_miss: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      'Paste a **link** (https://…) and say e.g. **add this to our materials** or **save material "Algebra notes" https://…**. To upload a file, open **Materials** → **Add material**.',
      null,
      meta
    );
  }
  if (parsed.kind === 'need_url') {
    logAssistantEvent({ intent: 'add_material', response_type: 'message', need_url: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      'I need a **https://…** link to save from chat. Paste the URL, or open **Materials** → **Add material** to upload a file.',
      null,
      meta
    );
  }
  const out = buildAddMaterialLinkPendingResponse(parsed, familyId, meta);
  logAssistantEvent({ intent: 'add_material', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

async function handleDeleteSubjectIntent(userMessage, familyId, context, meta, startMs) {
  const { subjects, error } = await fetchSubjectsForFamily(familyId);
  if (error) {
    logAssistantEvent({ intent: 'delete_subject', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `I couldn't load subjects: ${error.message || String(error)}`,
      null,
      meta
    );
  }
  if (!subjects.length) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, 'You have no subjects yet — nothing to delete.', null, meta);
  }
  const children = context.children || [];
  const map = new Map(children.map((c) => [String(c.id), c]));
  const resolved = resolveSubjectFromUserMessage(userMessage, subjects, children);
  if (!resolved.ok) {
    if (resolved.candidates?.length) {
      const lines = resolved.candidates
        .map((s, i) => `${i + 1}. ${summarizeSubjectLineForChat(s, map).replace(/^•\s*/, '')}`)
        .join('\n');
      logAssistantEvent({ intent: 'delete_subject', response_type: 'message', disambiguation: true, latency_ms: Date.now() - startMs });
      return createAssistantResponse(
        RESPONSE_TYPES.MESSAGE,
        `I found more than one match. Reply with the number or put the exact name in quotes:\n\n${lines}`,
        null,
        meta,
        {
          disambiguation: {
            intent: 'delete_subject',
            candidates: resolved.candidates.map(stripSubjectForDisambiguation),
            priorUserMessage: userMessage,
          },
        }
      );
    }
    logAssistantEvent({ intent: 'delete_subject', response_type: 'message', no_match: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't find that subject. Name it more specifically (quotes help) or say **delete subject [name] for [child]**.",
      null,
      meta
    );
  }
  const out = buildDeleteSubjectPendingResponse(resolved.subject, familyId, meta);
  logAssistantEvent({ intent: 'delete_subject', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

function subjectLearnerLabel(subjectRow, childrenById) {
  const cid = subjectRow?.student_id || subjectRow?.child_id;
  if (!cid || !childrenById) return '';
  const idStr = String(cid).split(';')[0].trim();
  const ch = childrenById.get(idStr);
  return ch ? childDisplayNameForRoster(ch) : '';
}

async function handleRenameSubjectIntent(userMessage, familyId, context, meta, startMs) {
  const parsed = parseRenameSubjectTitles(userMessage);
  if (!parsed) {
    logAssistantEvent({ intent: 'rename_subject', response_type: 'message', parse_error: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      'Say e.g. **rename subject Algebra to Geometry** or **rename subject "Bio" to "Biology" for Emma**.',
      null,
      meta
    );
  }
  const { subjects, error } = await fetchSubjectsForFamily(familyId);
  if (error) {
    logAssistantEvent({ intent: 'rename_subject', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `I couldn't load subjects: ${error.message || String(error)}`,
      null,
      meta
    );
  }
  if (!subjects.length) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, 'You have no subjects yet — add one from **Subjects** (left sidebar) using **+ New**.', null, meta);
  }
  const children = context.children || [];
  const map = new Map(children.map((c) => [String(c.id), c]));
  const resolveMsg = parsed.forChild ? `${parsed.oldHint} for ${parsed.forChild}` : parsed.oldHint;
  const resolved = resolveSubjectFromUserMessage(resolveMsg, subjects, children);
  if (!resolved.ok) {
    if (resolved.candidates?.length) {
      const lines = resolved.candidates
        .map((s, i) => `${i + 1}. ${summarizeSubjectLineForChat(s, map).replace(/^•\s*/, '')}`)
        .join('\n');
      logAssistantEvent({ intent: 'rename_subject', response_type: 'message', disambiguation: true, latency_ms: Date.now() - startMs });
      return createAssistantResponse(
        RESPONSE_TYPES.MESSAGE,
        `I found more than one match. Reply with the number or put the exact name in quotes:\n\n${lines}`,
        null,
        meta,
        {
          disambiguation: {
            intent: 'rename_subject',
            candidates: resolved.candidates.map(stripSubjectForDisambiguation),
            priorUserMessage: userMessage,
            newSubjectName: parsed.newName,
          },
        }
      );
    }
    logAssistantEvent({ intent: 'rename_subject', response_type: 'message', no_match: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      "I couldn't find that subject. Use quotes or say **rename subject [old] to [new] for [child]**.",
      null,
      meta
    );
  }
  const learner = subjectLearnerLabel(resolved.subject, map);
  const out = buildRenameSubjectPendingResponse(resolved.subject, parsed.newName, familyId, meta, learner);
  logAssistantEvent({ intent: 'rename_subject', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

function childDisplayNameForRoster(c) {
  return (c?.first_name || c?.name || 'Child').trim();
}

async function handleListChildrenIntent(context, meta, startMs) {
  const lines = formatChildrenListLines(context.children || []);
  logAssistantEvent({ intent: 'list_children', response_type: 'message', latency_ms: Date.now() - startMs });
  return createAssistantResponse(
    RESPONSE_TYPES.MESSAGE,
    `Children in your family:\n\n${lines.join('\n')}`,
    null,
    meta
  );
}

async function handleListSubjectsIntent(userMessage, familyId, context, meta, startMs) {
  const { subjects, error } = await fetchSubjectsForFamily(familyId);
  if (error) {
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `I couldn't load subjects: ${error.message || String(error)}`,
      null,
      meta
    );
  }
  const children = context.children || [];
  const map = new Map(children.map((c) => [String(c.id), c]));
  const msgLower = userMessage.toLowerCase();
  const ch = pickChildFromMessage(msgLower, children);
  let list = subjects;
  if (ch) {
    const id = String(ch.id);
    list = subjects.filter((s) => {
      const raw = String(s.student_id || s.child_id || '');
      return raw.split(/[;,]/).some((x) => x.trim() === id);
    });
  }
  const lines = formatSubjectsListLines(list, map);
  const title = ch ? `Subjects for **${childDisplayNameForRoster(ch)}**` : 'Subjects in your family';
  logAssistantEvent({ intent: 'list_subjects', response_type: 'message', count: list.length, latency_ms: Date.now() - startMs });
  return createAssistantResponse(
    RESPONSE_TYPES.MESSAGE,
    `${title}:\n\n${lines.join('\n')}`,
    null,
    meta
  );
}

async function handleUpdateChildIntent(userMessage, context, meta, familyId, startMs) {
  const children = context.children || [];
  const renamed = parseRenameChild(userMessage, children);
  if (renamed?.error) {
    logAssistantEvent({ intent: 'update_child', response_type: 'message', parse_error: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, renamed.error, null, meta);
  }
  if (renamed?.child && renamed.updates) {
    const dn = childDisplayNameForRoster(renamed.child);
    const body = `I'll update this learner:\n\n${summarizeUpdateChildProposal(dn, renamed.updates)}\n\nTap **Save changes** to confirm.`;
    const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
      pendingCommit: {
        kind: CHAT_COMMIT_KINDS.UPDATE_CHILD,
        payload: { familyId, childId: renamed.child.id, updates: renamed.updates, displayName: dn },
      },
    });
    logAssistantEvent({ intent: 'update_child', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
    return out;
  }
  const graded = parseGradeChild(userMessage, children);
  if (graded?.error) {
    logAssistantEvent({ intent: 'update_child', response_type: 'message', parse_error: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, graded.error, null, meta);
  }
  if (graded?.child && graded.updates) {
    const dn = childDisplayNameForRoster(graded.child);
    const body = `I'll update this learner:\n\n${summarizeUpdateChildProposal(dn, graded.updates)}\n\nTap **Save changes** to confirm.`;
    const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
      pendingCommit: {
        kind: CHAT_COMMIT_KINDS.UPDATE_CHILD,
        payload: { familyId, childId: graded.child.id, updates: graded.updates, displayName: dn },
      },
    });
    logAssistantEvent({ intent: 'update_child', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
    return out;
  }
  return createAssistantResponse(
    RESPONSE_TYPES.MESSAGE,
    'Say e.g. **rename Emma to Emily** or **set Emma grade to 7th**.',
    null,
    meta
  );
}

async function handleArchiveChildIntent(userMessage, context, meta, familyId, startMs) {
  const parsed = parseArchiveChildIntent(userMessage, context.children);
  if (parsed.error) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, parsed.error, null, meta);
  }
  const c = parsed.child;
  const dn = childDisplayNameForRoster(c);
  const body = `Please confirm:\n\n${summarizeArchiveChildProposal(dn)}\n\nTap **Archive child** to confirm.`;
  const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.ARCHIVE_CHILD,
      payload: { familyId, childId: c.id, displayName: dn },
    },
  });
  logAssistantEvent({ intent: 'archive_child', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

async function handleDeleteChildPermanentIntent(userMessage, context, meta, familyId, startMs) {
  const parsed = parseDeleteChildPermanentIntent(userMessage, context.children);
  if (parsed.error) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, parsed.error, null, meta);
  }
  const c = parsed.child;
  const confirmName = (c.first_name || c.name || '').trim();
  const dn = childDisplayNameForRoster(c);
  if (!confirmName) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, "This profile doesn't have a first name set; use **Settings > Family Members** to remove them.", null, meta);
  }
  const body = `⚠️ **Permanent delete**\n\n${summarizeDeleteChildPermanentProposal(dn)}\n\nTap **Delete permanently** only if you're sure.`;
  const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.DELETE_CHILD_PERMANENT,
      payload: { familyId, childId: c.id, confirmName, displayName: dn },
    },
  });
  logAssistantEvent({ intent: 'delete_child_permanent', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

async function handleAddSubjectIntent(userMessage, context, meta, familyId, startMs) {
  const parsed = parseAddSubjectIntent(userMessage, context.children);
  if (parsed?.error) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, parsed.error, null, meta);
  }
  if (!parsed?.child || !parsed?.subjectName) {
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      'Say e.g. **add subject Algebra for Emma**.',
      null,
      meta
    );
  }
  const dn = childDisplayNameForRoster(parsed.child);
  const body = `I'll add:\n\n${summarizeAddSubjectProposal(dn, parsed.subjectName)}\n\nTap **Add subject** to confirm.`;
  const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.ADD_SUBJECT,
      payload: {
        familyId,
        childId: parsed.child.id,
        subjectName: parsed.subjectName.trim(),
        childName: dn,
      },
    },
  });
  logAssistantEvent({ intent: 'add_subject', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

async function handleMarkAttendanceIntent(userMessage, familyId, context, meta, startMs) {
  const children = context.children || [];
  const msgLower = userMessage.toLowerCase();
  const child = pickChildFromMessage(msgLower, children);
  if (children.length > 1 && !child) {
    const names = children.map((c) => c.first_name || c.name || 'Child').join(', ');
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `Which child? (${names}) Say e.g. "Mark [name] present today" or "Mark [name] absent on 2026-03-28".`,
      null,
      meta
    );
  }
  const c = child || children[0];
  if (!c) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, 'Add a child first, then ask me to mark attendance.', null, meta);
  }
  const uiStatus = /\babsent\b/i.test(userMessage) ? 'absent' : 'present';
  const dateISO = parseAttendanceDate(userMessage);
  const childName = (c.first_name || c.name || 'Student').trim();
  const summary = summarizeMarkAttendanceProposal({ childName, dateISO, uiStatus });
  const body = `I'll record attendance:\n\n${summary}\n\nTap **Mark attendance** to confirm.`;
  const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.MARK_ATTENDANCE,
      payload: { familyId, childId: c.id, dateISO, uiStatus, childName },
    },
  });
  logAssistantEvent({ intent: 'mark_attendance', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

async function handleLogGradeIntent(userMessage, familyId, context, meta, startMs) {
  const { subjects, error } = await fetchSubjectsForFamily(familyId);
  if (error) {
    logAssistantEvent({ intent: 'log_grade', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `I couldn't load subjects: ${error.message || String(error)}`,
      null,
      meta
    );
  }
  const parsed = parseLogGradeIntent(userMessage, context.children, subjects || []);
  if (parsed === null) {
    logAssistantEvent({ intent: 'log_grade', response_type: 'message', parse_error: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      'Say e.g. **log grade B+ for Emma in Algebra** or **record score 18/20 for Sam in math**.',
      null,
      meta
    );
  }
  if (parsed.error) {
    logAssistantEvent({ intent: 'log_grade', response_type: 'message', parse_error: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, parsed.error, null, meta);
  }
  const childName = childDisplayNameForRoster(parsed.child);
  const prop = summarizeLogGradeProposal({
    childName,
    subjectName: parsed.subjectName,
    gradeLetter: parsed.gradeLetter,
    score: parsed.score,
    possible: parsed.possible,
  });
  const body = `I'll log this grade:\n\n${prop}\n\nTap **Log grade** to confirm.`;
  const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
    pendingCommit: {
      kind: CHAT_COMMIT_KINDS.LOG_GRADE,
      payload: {
        familyId,
        childId: parsed.child.id,
        childName,
        subjectId: parsed.subjectId,
        subjectName: parsed.subjectName,
        gradeLetter: parsed.gradeLetter,
        score: parsed.score,
        possible: parsed.possible,
      },
    },
  });
  logAssistantEvent({ intent: 'log_grade', response_type: 'message', pending_commit: true, latency_ms: Date.now() - startMs });
  return out;
}

async function handleListGradesIntent(userMessage, familyId, context, meta, startMs) {
  const children = (context.children || []).filter((c) => !c.archived);
  const msgLower = userMessage.toLowerCase();
  const wantAll = /\b(all|everyone|whole\s+family|my\s+kids)\b/i.test(userMessage);
  const child = pickChildFromMessage(msgLower, children);
  if (children.length > 1 && !child && !wantAll) {
    const names = children.map((c) => c.first_name || c.name || 'Child').join(', ');
    logAssistantEvent({ intent: 'list_grades', response_type: 'message', needs_child: true, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `Which child? (${names}) Or say **show all grades**.`,
      null,
      meta
    );
  }
  const filterChildId = wantAll ? null : (child || children[0])?.id ?? null;
  if (!filterChildId && children.length === 0) {
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, 'Add a child first, then I can list grades.', null, meta);
  }
  const { grades, error } = await fetchGradesForChat(familyId, filterChildId, wantAll ? 40 : 25);
  if (error) {
    logAssistantEvent({ intent: 'list_grades', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `I couldn't load grades: ${error.message || String(error)} Open **Records** to view them.`,
      null,
      meta
    );
  }
  const { subjects: subjRows } = await fetchSubjectsForFamily(familyId);
  const subMap = new Map((subjRows || []).map((s) => [String(s.id), s]));
  const chMap = new Map(children.map((x) => [String(x.id), x]));
  const lines = formatGradesListLines(grades, chMap, subMap);
  const title = wantAll ? 'Recent grades (family)' : filterChildId ? `Recent grades for **${childDisplayNameForRoster(child || children[0])}**` : 'Recent grades';
  const more =
    grades.length >= (wantAll ? 40 : 25)
      ? '\n\n… Open **Records** for the full history and filters.'
      : '';
  logAssistantEvent({ intent: 'list_grades', response_type: 'message', count: grades.length, latency_ms: Date.now() - startMs });
  return createAssistantResponse(
    RESPONSE_TYPES.MESSAGE,
    `${title}:\n\n${lines.join('\n')}${more}`,
    null,
    meta
  );
}

function localYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Calendar snapshot for today / tomorrow / this week — no LLM (keyword intent `todays_schedule`). */
async function handleTodaysScheduleIntent(userMessage, familyId, meta, startMs) {
  const msg = (userMessage || '').toLowerCase();
  const wantWeek =
    /\b(this\s+week|rest\s+of\s+(the\s+)?week)\b/i.test(msg) ||
    (/\bthis\s+week\b/i.test(msg) && /\b(what|show|anything|calendar|schedule|events?)\b/i.test(msg));
  const wantTomorrow = /\btomorrow\b/i.test(msg) && !wantWeek;

  let startBound;
  let endBound;
  let label;

  if (wantWeek) {
    const now = new Date();
    const dow = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - dow);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    startBound = start.toISOString();
    endBound = end.toISOString();
    label = 'this week';
  } else {
    const d = new Date();
    if (wantTomorrow) d.setDate(d.getDate() + 1);
    const ymd = localYmd(d);
    startBound = `${ymd}T00:00:00`;
    endBound = `${ymd}T23:59:59.999`;
    label = wantTomorrow ? `tomorrow (${ymd})` : `today (${ymd})`;
  }

  const { data: rows, error } = await supabase
    .from('events')
    .select('id,title,start_ts,end_ts,event_type')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .gte('start_ts', startBound)
    .lte('start_ts', endBound)
    .order('start_ts', { ascending: true })
    .limit(60);

  if (error) {
    logAssistantEvent({ intent: 'todays_schedule', response_type: 'message', error: error.message, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `I couldn't load events: ${error.message}. Open **Planner** to see your calendar.`,
      null,
      meta
    );
  }

  const list = rows || [];
  if (list.length === 0) {
    logAssistantEvent({ intent: 'todays_schedule', response_type: 'message', count: 0, latency_ms: Date.now() - startMs });
    return createAssistantResponse(
      RESPONSE_TYPES.MESSAGE,
      `Nothing is on your family calendar for **${label}**. Use **Planner** (left sidebar) and click **+ New** to add an event.`,
      null,
      meta
    );
  }

  const lines = list.map((ev) => {
    const t = ev.start_ts ? new Date(ev.start_ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    const titleEv = ev.title || 'Event';
    return `• **${t}** — ${titleEv}`;
  });
  const more = list.length >= 60 ? '\n\n… Showing the first 60. Open **Planner** for the full list.' : '';
  logAssistantEvent({ intent: 'todays_schedule', response_type: 'message', count: list.length, latency_ms: Date.now() - startMs });
  return createAssistantResponse(
    RESPONSE_TYPES.MESSAGE,
    `Here's what's on your calendar **${label}**:\n\n${lines.join('\n')}${more}`,
    null,
    meta
  );
}

/**
 * Pure local retrieval from bundled app guide — no embedding API, no LLM (fast path for "how do I…").
 */
function tryFastAnswerFromLocalGuide(userMessage, meta, startMs) {
  const localHits = searchLocalAppGuide(userMessage, { limit: 6 });
  if (!localHits.length) return null;
  const topSim = localHits[0].similarity ?? 0;
  if (topSim < FAST_GUIDE_MIN_SIMILARITY) return null;
  const best = localHits[0]?.content || '';
  const body = toFriendlyPlainText(best, { maxChars: 560, maxSentences: 4 });
  if (!body) return null;
  const text = `Answer: ${body}`;
  logAssistantEvent({
    intent: 'direct_answer',
    response_type: 'message',
    latency_ms: Date.now() - startMs,
    model_used: null,
    fast_path: 'local_guide_only',
  });
  return createAssistantResponse(RESPONSE_TYPES.MESSAGE, text, null, meta);
}

/**
 * Grounded OpenAI reply with optional vector search (skip for most product-help questions to save ~200–800ms).
 */
async function runGroundedOpenAIReply(
  userMessage,
  familyId,
  context,
  meta,
  recentMessages,
  startMs,
  { skipVectorSearch = false } = {}
) {
  if (!hasUsableClientOpenAIKey() || disableClientLlmForSession) {
    const localHits = searchLocalAppGuide(userMessage, { limit: 3 });
    const best = localHits?.[0]?.content ? String(localHits[0].content).trim() : '';
    const friendlyBest = best ? toFriendlyPlainText(best, { maxChars: 560, maxSentences: 4 }) : '';
    const fallbackText = best
      ? `Answer: ${friendlyBest}`
      : "I can help with planner actions, events, attendance, subjects, and materials. Try a direct request like “add an event for Max tomorrow at 10am” or “add a new subject for Max.”";
    return createAssistantResponse(RESPONSE_TYPES.MESSAGE, fallbackText, null, meta);
  }
  const client = createOpenAIClient();
  const compressed = await buildCompressedContext(familyId, context);
  const contextBlock = formatContextForPrompt(compressed);
  let knowledgeBlock = '';
  try {
    const vectorHits = skipVectorSearch ? [] : await searchKnowledge(userMessage, { matchCount: 5, matchThreshold: 0.45 });
    const localHits = searchLocalAppGuide(userMessage, { limit: 6 });
    const merged = [];
    const seen = new Set();
    for (const h of [...(vectorHits || []), ...localHits]) {
      const c = typeof h?.content === 'string' ? h.content.trim() : '';
      if (!c) continue;
      const key = c.slice(0, 160);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
      if (merged.length >= 8) break;
    }
    if (merged.length > 0) {
      knowledgeBlock =
        '\n\nApp guide (ground truth for where features live — prefer this over guessing):\n' +
        merged.join('\n\n---\n\n');
    }
  } catch {
    // RAG optional; continue without
  }
  const systemPrompt = `You are Doodle, the fast chat assistant for Learnadoodle. You help families with quick questions about the product and their homeschool planning.

Key principles:
- Be concise (≤2 sentences when possible unless the user asks for steps)
- Be helpful and supportive; use the family's actual data when relevant
- Use plain, calm text for parents; be helpful but not chatty, and avoid markdown headings/heavy formatting
- Do not give legal, medical, or compliance advice
- Ask for missing information when needed
- For "where is…" or "how do I…" questions, follow the App guide below. Name the sidebar or area using current labels (Home, Planner, Subjects, Materials, Settings) and include top tabs when useful (e.g. Subjects > Schedule, Subjects > Progress, Settings > Feedback).
- If the App guide does not mention a feature, say you are not sure it exists yet and tell them to use **Settings > Feedback** to request it or describe what they need. Do not invent features.
- Never promise dates for unreleased work; feedback goes through Settings > Feedback.

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
    temperature: skipVectorSearch ? 0.35 : 0.7,
    max_tokens: skipVectorSearch ? 220 : 280,
  });

  const text = response.choices?.[0]?.message?.content?.trim() || "I'm not sure how to answer that. Can you rephrase?";
  const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, text, null, meta);
  logAssistantEvent({
    response_type: 'message',
    latency_ms: Date.now() - startMs,
    model_used: MODEL_DIRECT,
    skip_embedding: skipVectorSearch,
  });
  return out;
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

    const disambigPick = resolveDisambiguationReply(userMessage, recentMessages);
    if (disambigPick?.intent === 'delete_event') {
      const out = buildDeletePendingResponse(disambigPick.event, familyId, { intent: 'delete_event', from_disambiguation: true });
      logAssistantEvent({
        intent: 'delete_event',
        response_type: 'message',
        from_disambiguation: true,
        pending_commit: true,
        latency_ms: Date.now() - startMs,
      });
      return out;
    }
    if (disambigPick?.intent === 'update_event') {
      return await completeUpdateEventAfterResolve(
        disambigPick.priorUserMessage,
        disambigPick.event,
        familyId,
        context,
        { intent: 'update_event', from_disambiguation: true },
        startMs,
        true
      );
    }
    if (disambigPick?.intent === 'delete_material') {
      const mat = disambigPick.event;
      const out = buildDeleteMaterialPendingResponse(mat, familyId, { intent: 'delete_material', from_disambiguation: true });
      logAssistantEvent({
        intent: 'delete_material',
        response_type: 'message',
        from_disambiguation: true,
        pending_commit: true,
        latency_ms: Date.now() - startMs,
      });
      return out;
    }
    if (disambigPick?.intent === 'rename_material') {
      const mat = disambigPick.event;
      const nt = disambigPick.newTitle;
      if (!nt) {
        return createAssistantResponse(
          RESPONSE_TYPES.MESSAGE,
          'Ask again with **rename "current title" to "new title"** (or include materials / workbook in your message).',
          null,
          { intent: 'rename_material', from_disambiguation: true }
        );
      }
      const out = buildRenameMaterialPendingResponse(mat, nt, familyId, { intent: 'rename_material', from_disambiguation: true });
      logAssistantEvent({
        intent: 'rename_material',
        response_type: 'message',
        from_disambiguation: true,
        pending_commit: true,
        latency_ms: Date.now() - startMs,
      });
      return out;
    }
    if (disambigPick?.intent === 'delete_subject') {
      const subj = disambigPick.event;
      const out = buildDeleteSubjectPendingResponse(subj, familyId, { intent: 'delete_subject', from_disambiguation: true });
      logAssistantEvent({
        intent: 'delete_subject',
        response_type: 'message',
        from_disambiguation: true,
        pending_commit: true,
        latency_ms: Date.now() - startMs,
      });
      return out;
    }
    if (disambigPick?.intent === 'rename_subject') {
      const subj = disambigPick.event;
      const nn = disambigPick.newSubjectName;
      if (!nn) {
        return createAssistantResponse(
          RESPONSE_TYPES.MESSAGE,
          'Ask again with **rename subject "current" to "new"** (include the word **subject**).',
          null,
          { intent: 'rename_subject', from_disambiguation: true }
        );
      }
      const map = new Map((context.children || []).map((c) => [String(c.id), c]));
      const learner = subjectLearnerLabel(subj, map);
      const out = buildRenameSubjectPendingResponse(subj, nn, familyId, { intent: 'rename_subject', from_disambiguation: true }, learner);
      logAssistantEvent({
        intent: 'rename_subject',
        response_type: 'message',
        from_disambiguation: true,
        pending_commit: true,
        latency_ms: Date.now() - startMs,
      });
      return out;
    }

    // Fast path: common "how do I / where is" product questions — local guide only (after disambiguation so we don't steal follow-up replies)
    const triageEarly = triageIntentKeyword(userMessage, context);
    if (triageEarly.intent === 'direct_answer' && triageEarly.confidence >= 0.82) {
      const fast = tryFastAnswerFromLocalGuide(userMessage, { intent: 'direct_answer', confidence: triageEarly.confidence }, startMs);
      if (fast) return fast;
    }

    const { intent, confidence } = await classifyIntentLLM(userMessage, context, createOpenAIClient);
    const meta = { intent, confidence };
    logAssistantEvent({ intent, confidence });

    // Follow-up: user replied with just a name (e.g. "Lilly") after we asked "who is this for?"
    const trimMsg = typeof userMessage === 'string' ? userMessage.trim() : '';
    const isShortReply =
      trimMsg.length > 0 &&
      trimMsg.length < 80 &&
      !/\b(add|schedule|create|log|grade|grades|progress|reschedule|take me)\b/i.test(trimMsg);
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
        const childNames = (context.children || [])
          .map((c) => c.first_name || c.name)
          .filter(Boolean)
          .join(', ');
        const ask =
          (context.children || []).length > 1
            ? `I'll log that activity. In **one reply**, tell me (1) which child (${childNames || 'name'}) and (2) which subject.`
            : `I'll log that activity. In **one reply**, tell me which subject this is for${childNames ? ` (for ${childNames})` : ''}.`;
        const summary = summarizeAddActivityCommit(params);
        const body = `${ask}\n\n${summary}\n\nTap **Log activity** below when you're ready — nothing is saved until you confirm.`;
        const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
          pendingCommit: {
            kind: CHAT_COMMIT_KINDS.ADD_ACTIVITY,
            payload: { toolName: 'add_activity', params, familyId },
          },
        });
        logAssistantEvent({ response_type: 'message', intent: 'add_activity', latency_ms: Date.now() - startMs, model_used: null });
        return out;
      }

      case 'check_attendance': {
        return await handleCheckAttendanceIntent(userMessage, familyId, context, meta, startMs);
      }

      case 'mark_attendance': {
        return await handleMarkAttendanceIntent(userMessage, familyId, context, meta, startMs);
      }

      case 'log_grade': {
        return await handleLogGradeIntent(userMessage, familyId, context, meta, startMs);
      }

      case 'list_grades': {
        return await handleListGradesIntent(userMessage, familyId, context, meta, startMs);
      }

      case 'list_children': {
        return await handleListChildrenIntent(context, meta, startMs);
      }

      case 'list_subjects': {
        return await handleListSubjectsIntent(userMessage, familyId, context, meta, startMs);
      }

      case 'update_child': {
        return await handleUpdateChildIntent(userMessage, context, meta, familyId, startMs);
      }

      case 'archive_child': {
        return await handleArchiveChildIntent(userMessage, context, meta, familyId, startMs);
      }

      case 'delete_child_permanent': {
        return await handleDeleteChildPermanentIntent(userMessage, context, meta, familyId, startMs);
      }

      case 'add_subject': {
        return await handleAddSubjectIntent(userMessage, context, meta, familyId, startMs);
      }

      case 'delete_subject': {
        return await handleDeleteSubjectIntent(userMessage, familyId, context, meta, startMs);
      }

      case 'rename_subject': {
        return await handleRenameSubjectIntent(userMessage, familyId, context, meta, startMs);
      }

      case 'list_materials': {
        return await handleListMaterialsIntent(userMessage, familyId, meta, startMs);
      }

      case 'add_material': {
        return await handleAddMaterialIntent(userMessage, familyId, context, meta, startMs);
      }

      case 'delete_material': {
        return await handleDeleteMaterialIntent(userMessage, familyId, meta, startMs);
      }

      case 'rename_material': {
        return await handleRenameMaterialIntent(userMessage, familyId, meta, startMs);
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
        const iso = userMessage.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        const calendar_date = iso ? iso[1] : new Date().toISOString().split('T')[0];
        const params = {
          family_id: familyId,
          calendar_date,
          note: userMessage,
        };
        const summary = summarizeQueueRescheduleCommit(params);
        const body = `I'll queue a reschedule for the planner.\n\n${summary}\n\nTap **Queue reschedule** below to confirm — nothing runs until you do. If the date is wrong, say the correct date (YYYY-MM-DD) and ask again.`;
        const out = createAssistantResponse(RESPONSE_TYPES.MESSAGE, body, null, meta, {
          pendingCommit: {
            kind: CHAT_COMMIT_KINDS.QUEUE_RESCHEDULE,
            payload: { toolName: 'queue_reschedule', params, familyId },
          },
        });
        logAssistantEvent({ response_type: 'message', intent: 'queue_reschedule', latency_ms: Date.now() - startMs });
        return out;
      }

      case 'delete_event': {
        return await handleDeleteEventIntent(userMessage, familyId, context, meta, startMs);
      }

      case 'update_event': {
        return await handleUpdateEventIntent(userMessage, familyId, context, meta, startMs);
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

      case 'todays_schedule': {
        return await handleTodaysScheduleIntent(userMessage, familyId, meta, startMs);
      }

      case 'navigate': {
        const msg = userMessage.toLowerCase();
        let fetchTarget = null;
        let text = '';
        if (/feedback|feature request|leave (a )?(comment|note)|send (a )?suggestion/i.test(msg)) {
          fetchTarget = 'navigate_family_feedback';
          text = 'Opening Settings > Feedback so you can send a note to the team.';
        } else if (/(family|account|members|invite|profile settings)\b/i.test(msg) && !/attendance|planner|calendar|subject|library/i.test(msg)) {
          fetchTarget = 'navigate_family';
          text = 'Opening Settings.';
        } else if (/subject|subjects|intelligence|learning hub/i.test(msg)) {
          fetchTarget = 'navigate_subjects';
          text = 'Opening Subjects.';
        } else if (/library|materials/i.test(msg)) {
          fetchTarget = 'navigate_materials';
          text = 'Opening Materials.';
        } else if (/attendance|attend/i.test(msg)) {
          fetchTarget = 'navigate_planner_attendance';
          text = 'Taking you to the Planner attendance view.';
        } else if (/planner|schedule|calendar/i.test(msg)) {
          fetchTarget = 'navigate_planner';
          text = 'Taking you to the Planner.';
        } else if (/home|dashboard/i.test(msg)) {
          fetchTarget = 'navigate_home';
          text = 'Taking you to Home.';
        } else {
          fetchTarget = 'navigate_planner_attendance';
          text = 'Taking you to the Planner attendance view.';
        }
        return createAssistantResponse(RESPONSE_TYPES.MESSAGE, text, null, meta, { fetch: fetchTarget });
      }

      case 'direct_answer': {
        return await runGroundedOpenAIReply(userMessage, familyId, context, meta, recentMessages, startMs, {
          skipVectorSearch: true,
        });
      }

      default: {
        return await runGroundedOpenAIReply(userMessage, familyId, context, meta, recentMessages, startMs, {
          skipVectorSearch: false,
        });
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
