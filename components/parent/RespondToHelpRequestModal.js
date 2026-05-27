/**
 * Parent/tutor modal: respond to a child's help request (guidance, not grading).
 * Learnadoodle shell + light blue accents (planner-style, not admin modal).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
  Switch,
  Alert,
} from 'react-native';
import { X, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { updateAssignment } from '../../lib/services/assignmentsClient';
import { getChildHelpMessageHistory } from '../../lib/assignmentHelpHistory';
import { extractStudentHelpReason } from '../tutor/tutorHelpUtils';
import { useToast } from '../Toast';
import { LD, shellShadow, fontDisplay } from './parentModalTheme';

const QUICK_ACTIONS = [
  { id: 'explain', label: 'Explain concept', text: "Here's how this works… " },
  { id: 'hint', label: 'Give hint', text: 'Try this: ' },
  { id: 'next', label: 'Suggest next step', text: "Here's what I'd do next: " },
  { id: 'resource', label: 'Recommend resource', text: 'I recommend looking at: ' },
];

/** One line: event title · type · date · time (or assignment + subject/due if no event) */
function buildContextHeadline(linkedEvent, assignment, subjectName) {
  const fallbackTitle = displayAssignmentTitle(assignment?.title);
  const eventTitle = (linkedEvent?.title && linkedEvent.title.trim()) || fallbackTitle || 'Schoolwork';

  if (linkedEvent?.start_ts) {
    const start = new Date(linkedEvent.start_ts);
    if (Number.isNaN(start.getTime())) return eventTitle;
    const end = linkedEvent.end_ts ? new Date(linkedEvent.end_ts) : null;
    const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const fmt = (d) =>
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const typeLabel = linkedEvent.event_type || 'Lesson';
    const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0;
    const endIsValid = !!(end && !Number.isNaN(end.getTime()));
    const endsAtMidnight = endIsValid && end.getHours() === 0 && end.getMinutes() === 0;
    const endsAtEndOfDay = endIsValid && end.getHours() === 23 && end.getMinutes() === 59;
    const noSavedTime = startsAtMidnight && (!endIsValid || endsAtMidnight || endsAtEndOfDay);
    if (noSavedTime) {
      return `${eventTitle} · ${typeLabel} · ${dateStr}`;
    }
    const timePart = endIsValid ? `${fmt(start)}–${fmt(end)}` : fmt(start);
    return `${eventTitle} · ${typeLabel} · ${dateStr} · ${timePart}`;
  }

  const parts = [eventTitle];
  if (subjectName) parts.push(subjectName);
  if (assignment?.due_date) {
    const d = new Date(assignment.due_date);
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      );
    }
  }
  return parts.join(' · ');
}

function displayAssignmentTitle(raw) {
  if (!raw || typeof raw !== 'string') return 'Schoolwork';
  const t = raw.replace(/^Help:\s*/i, '').trim();
  return t || 'Schoolwork';
}

export default function RespondToHelpRequestModal({ visible, assignment, onClose, onResponded }) {
  const toast = useToast();
  const [response, setResponse] = useState('');
  const [giveMoreTime, setGiveMoreTime] = useState(false);
  const [sending, setSending] = useState(false);
  const [linkedEvent, setLinkedEvent] = useState(null);
  const [responseFocused, setResponseFocused] = useState(false);

  const reset = useCallback(() => {
    setResponse('');
    setGiveMoreTime(false);
    setLinkedEvent(null);
    setResponseFocused(false);
  }, []);

  useEffect(() => {
    if (!visible || !assignment) return;
    setResponse('');
    setGiveMoreTime(false);
    setLinkedEvent(null);
    setResponseFocused(false);
    const load = async () => {
      const ids = assignment.linked_event_ids;
      const arr = Array.isArray(ids) ? ids : [];
      const eid = arr[0];
      if (!eid) {
        setLinkedEvent(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, title, start_ts, end_ts, event_type')
          .eq('id', eid)
          .maybeSingle();
        if (!error && data) setLinkedEvent(data);
        else setLinkedEvent(null);
      } catch {
        setLinkedEvent(null);
      }
    };
    load();
  }, [visible, assignment?.id]);

  const childName =
    assignment?.child?.first_name ||
    assignment?.child?.name ||
    'your child';

  const subjectName = assignment?.subject?.name || null;

  const contextHeadline = useMemo(
    () => buildContextHeadline(linkedEvent, assignment, subjectName),
    [linkedEvent, assignment, subjectName]
  );

  const helpLines = assignment ? getChildHelpMessageHistory(assignment) : [];
  let quotedNotes = helpLines
    .map((h) => {
      const body = (h.note || '').trim();
      const reason = (h.reason || '').trim();
      if (body) return body;
      if (reason) return reason;
      return null;
    })
    .filter(Boolean);
  if (quotedNotes.length === 0 && assignment) {
    const fb = extractStudentHelpReason(assignment);
    if (fb) quotedNotes = [fb];
  }

  const threadLines = useMemo(() => {
    const raw = assignment?.help_message_log;
    let log = [];
    if (Array.isArray(raw)) {
      log = raw;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) log = parsed;
      } catch (_) {
        log = [];
      }
    }
    if (!Array.isArray(log) || log.length === 0) return [];
    const formatWhen = (value) => {
      if (!value) return 'recently';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return 'recently';
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (day.getTime() === today.getTime()) return `today at ${time}`;
      return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
    };
    return log
      .map((entry) => {
        const senderRole = String(entry?.sender_role || '').trim().toLowerCase();
        const reason = String(entry?.reason || '').trim().toLowerCase();
        const body = String(entry?.body || entry?.message || entry?.note || '').trim();
        const tsRaw = entry?.created_at || entry?.timestamp || null;
        const ts = new Date(tsRaw || 0).getTime();
        if (!Number.isFinite(ts) || ts <= 0) return null;
        let actor = 'Update';
        if (senderRole === 'parent') actor = 'You';
        if (senderRole === 'child' || senderRole === 'student') actor = childName || 'Student';
        if (senderRole === 'parent' && reason === 'sent_assignment') {
          return {
            ts,
            line: `${actor} sent assignment ${formatWhen(tsRaw)}${body && body !== '[Sent assignment]' ? ` — "${body}"` : ''}`,
          };
        }
        return {
          ts,
          line: `${actor} ${senderRole === 'parent' ? 'replied' : 'wrote'} ${formatWhen(tsRaw)}${body ? ` — "${body}"` : ''}`,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.ts - b.ts)
      .map((entry) => entry.line);
  }, [assignment?.help_message_log, childName]);

  const newDueDateLabel = useMemo(() => {
    if (!giveMoreTime || !assignment?.due_date) return null;
    const d = new Date(assignment.due_date);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + 3);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [giveMoreTime, assignment?.due_date]);

  const appendQuick = (snippet) => {
    setResponse((prev) => {
      const t = prev.trim();
      if (!t) return snippet;
      return `${t}\n\n${snippet}`;
    });
  };

  const handleSend = async () => {
    if (!assignment?.id) return;
    const trimmed = response.trim();
    if (!trimmed) {
      Alert.alert(
        'Add a response',
        'Write something for your learner before sending.'
      );
      return;
    }

    setSending(true);
    try {
      if (trimmed) {
        const { error } = await supabase.rpc('append_assignment_help_message', {
          p_assignment_id: assignment.id,
          p_body: trimmed,
          p_reason: null,
        });
        if (error) throw error;
      }

      const updates = {};
      updates.need_help = false;
      if (giveMoreTime && assignment.due_date) {
        const d = new Date(assignment.due_date);
        if (!Number.isNaN(d.getTime())) {
          d.setDate(d.getDate() + 3);
          updates.due_date = d.toISOString();
        }
      }
      if (Object.keys(updates).length > 0) {
        const { error: upErr } = await updateAssignment(assignment.id, updates);
        if (upErr) throw upErr;
      }

      toast.push(`Response sent to ${childName}`, 'success');
      reset();
      if (onResponded) onResponded(assignment.id);
      else onClose?.();
    } catch (e) {
      console.error('[RespondToHelpRequestModal]', e);
      Alert.alert('Could not send', e?.message || 'Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    if (sending) return;
    reset();
    onClose?.();
  };

  if (!assignment) return null;

  const signOffName = childName === 'your child' ? 'Student' : childName;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        />
        <View style={styles.modalContent}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeFab}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <X size={20} color={LD.ink} />
          </TouchableOpacity>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <View style={styles.contextCard}>
              <ScrollView
                style={styles.contextScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                bounces={Platform.OS !== 'web'}
              >
                <Text style={styles.contextHeadline}>{contextHeadline}</Text>
                {quotedNotes.length > 0 ? (
                  <View style={styles.quoteBlock}>
                    {quotedNotes.map((line, i) => (
                      <Text key={i} style={styles.quote}>
                        “{line}”
                      </Text>
                    ))}
                  </View>
                ) : null}
                {threadLines.length > 0 ? (
                  <View style={styles.threadBlock}>
                    <Text style={styles.threadLabel}>Conversation history</Text>
                    {threadLines.map((line, i) => (
                      <Text key={`thread-${i}`} style={styles.threadLine}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.signOff}>– {signOffName}</Text>
              </ScrollView>
            </View>

            <View style={styles.blockResponse}>
              <Text style={styles.labelCalm}>Your response</Text>
              <View style={styles.quickRepliesRow}>
                <Text style={styles.quickRepliesInlineLabel}>Quick replies</Text>
                {QUICK_ACTIONS.map((q) => (
                  <TouchableOpacity
                    key={q.id}
                    style={styles.quickChip}
                    onPress={() => appendQuick(q.text)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.quickChipText}>{q.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[
                  styles.responseInput,
                  responseFocused && styles.responseInputFocused,
                  Platform.OS === 'web' && responseFocused && styles.responseInputFocusedWeb,
                ]}
                value={response}
                onChangeText={setResponse}
                onFocus={() => setResponseFocused(true)}
                onBlur={() => setResponseFocused(false)}
                placeholder="Explain this, give guidance, or suggest what to do next…"
                placeholderTextColor={LD.placeholder}
                multiline
                scrollEnabled
                textAlignVertical="top"
              />
            </View>

            <View style={styles.blockOptions}>
              <Text style={styles.labelCalm}>Options</Text>
              {assignment.due_date ? (
                <View style={styles.optionRow}>
                  <View style={styles.optionTextCol}>
                    <Text style={styles.optionTitle}>Give more time</Text>
                    <Text style={styles.optionSub}>Add 3 days to the due date</Text>
                    {giveMoreTime && newDueDateLabel ? (
                      <Text style={styles.optionHint}>New due date: {newDueDateLabel}</Text>
                    ) : null}
                  </View>
                  <Switch value={giveMoreTime} onValueChange={setGiveMoreTime} />
                </View>
              ) : null}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.sendPillButton, sending && styles.sendPillButtonDisabled]}
                onPress={handleSend}
                disabled={sending}
                {...(Platform.OS === 'web' && { cursor: sending ? 'not-allowed' : 'pointer' })}
              >
                <View style={styles.sendPillIconWrap}>
                  <Mail size={12} color="#5B6880" />
                </View>
                <Text style={styles.sendPillText}>{sending ? 'Sending…' : `Send to ${childName}`}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 680,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    position: 'relative',
    ...shellShadow,
  },
  closeFab: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DCE8',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    /** Clear close button (top 14 + height 40 = 54) with a few px gap */
    paddingTop: 64,
    paddingBottom: 32,
  },
  /** Tight: top → card */
  contextCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DCE8',
  },
  /** Scroll long student messages without growing the modal */
  contextScroll: {
    maxHeight: 260,
  },
  contextHeadline: {
    fontSize: 14,
    fontWeight: '500',
    color: '#5B6880',
    lineHeight: 21,
    ...fontDisplay('500'),
  },
  quoteBlock: {
    marginTop: 12,
  },
  quote: {
    fontSize: 14,
    fontWeight: '400',
    fontStyle: 'italic',
    color: '#5B6880',
    lineHeight: 21,
    marginBottom: 4,
  },
  threadBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#D6DCE8',
    gap: 6,
  },
  threadLabel: {
    fontSize: 12,
    color: '#5B6880',
    ...fontDisplay('600'),
  },
  threadLine: {
    fontSize: 12,
    lineHeight: 17,
    color: '#5B6880',
    ...fontDisplay('400'),
  },
  signOff: {
    fontSize: 13,
    fontWeight: '500',
    color: '#5B6880',
    marginTop: 10,
    textAlign: 'right',
    lineHeight: 19,
  },
  /** Medium: card → response */
  blockResponse: {
    marginBottom: 20,
  },
  labelCalm: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5B6880',
    marginBottom: 8,
    letterSpacing: 0.15,
    ...fontDisplay('600'),
  },
  quickRepliesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  quickRepliesInlineLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#5B6880',
    marginRight: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  responseInput: {
    borderWidth: 1,
    borderColor: LD.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 15,
    fontWeight: '400',
    color: LD.ink,
    minHeight: 144,
    maxHeight: 300,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { overflow: 'auto' }),
  },
  responseInputFocused: {
    borderColor: LD.ring,
    backgroundColor: '#ffffff',
  },
  responseInputFocusedWeb: {
    outlineStyle: 'solid',
    outlineWidth: 3,
    outlineColor: LD.ringSoft,
  },
  quickChip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DCE8',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#5B6880',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Medium: quick → options */
  blockOptions: {
    marginBottom: 0,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingVertical: 4,
    gap: 12,
  },
  optionRowLast: {
    marginBottom: 0,
  },
  optionTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#5B6880',
  },
  optionSub: {
    fontSize: 12,
    fontWeight: '400',
    color: '#7A8598',
    marginTop: 2,
    lineHeight: 16,
  },
  optionHint: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5B6880',
    marginTop: 4,
  },
  footer: {
    marginTop: 24,
    paddingTop: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendPillButton: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D6DCE8',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sendPillButtonDisabled: {
    opacity: 0.7,
  },
  sendPillIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  sendPillText: {
    fontSize: 14,
    color: '#5B6880',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
