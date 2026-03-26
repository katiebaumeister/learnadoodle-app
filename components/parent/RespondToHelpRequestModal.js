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
import { X } from 'lucide-react';
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
    const timePart =
      end && !Number.isNaN(end.getTime()) ? `${fmt(start)}–${fmt(end)}` : fmt(start);
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
  const [markResolved, setMarkResolved] = useState(false);
  const [sending, setSending] = useState(false);
  const [linkedEvent, setLinkedEvent] = useState(null);
  const [responseFocused, setResponseFocused] = useState(false);

  const reset = useCallback(() => {
    setResponse('');
    setGiveMoreTime(false);
    setMarkResolved(false);
    setLinkedEvent(null);
    setResponseFocused(false);
  }, []);

  useEffect(() => {
    if (!visible || !assignment) return;
    setResponse('');
    setGiveMoreTime(false);
    setMarkResolved(false);
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
    if (!trimmed && !markResolved) {
      Alert.alert(
        'Add a response or mark as resolved',
        'Write something for your learner, or check “Mark as resolved” to close this request.'
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
      if (markResolved) {
        updates.need_help = false;
      }
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
              <View style={[styles.optionRow, styles.optionRowLast]}>
                <View style={styles.optionTextCol}>
                  <Text style={styles.optionTitle}>Mark as resolved</Text>
                  <Text style={styles.optionSub}>Close this help request after replying</Text>
                </View>
                <Switch value={markResolved} onValueChange={setMarkResolved} />
              </View>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.primaryButton, sending && styles.primaryButtonDisabled]}
                onPress={handleSend}
                disabled={sending}
                {...(Platform.OS === 'web' && { cursor: sending ? 'not-allowed' : 'pointer' })}
              >
                <Text style={styles.primaryButtonText}>{sending ? 'Sending…' : `Send to ${childName}`}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleClose}
                disabled={sending}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
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
    backgroundColor: LD.shell,
    borderRadius: 24,
    width: '100%',
    maxWidth: 680,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: LD.shellBorder,
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
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: LD.border,
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
    backgroundColor: LD.fillWash,
    borderWidth: 1,
    borderColor: LD.border,
  },
  /** Scroll long student messages without growing the modal */
  contextScroll: {
    maxHeight: 260,
  },
  contextHeadline: {
    fontSize: 14,
    fontWeight: '500',
    color: LD.inkSoft,
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
    color: LD.muted,
    lineHeight: 21,
    marginBottom: 4,
  },
  signOff: {
    fontSize: 13,
    fontWeight: '500',
    color: LD.inkSoft,
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
    color: LD.inkSoft,
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
    color: LD.inkSoft,
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
    backgroundColor: LD.fillSoft,
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
    backgroundColor: LD.fillWash,
    borderWidth: 1,
    borderColor: 'rgba(137, 181, 228, 0.28)',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '400',
    color: LD.inkSoft,
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
    color: LD.inkSoft,
  },
  optionSub: {
    fontSize: 12,
    fontWeight: '400',
    color: LD.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  optionHint: {
    fontSize: 12,
    fontWeight: '500',
    color: LD.blueMuted,
    marginTop: 4,
  },
  footer: {
    marginTop: 24,
    paddingTop: 0,
  },
  primaryButton: {
    backgroundColor: LD.black,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(17, 24, 39, 0.12)' },
      default: {},
    }),
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    ...fontDisplay('600'),
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '400',
    color: LD.mutedLight,
  },
});
