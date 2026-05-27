/**
 * Small composer: child asks parent for help on an assignment or school event.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X, Check, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createAssignment, updateAssignment } from '../../lib/services/assignmentsClient';
import { colors } from '../../theme/colors';
import { assignmentRowLinksEventId } from '../../lib/assignmentLinkedEventUtils';

/** Structured log for per-message timestamps (best-effort; ignores RPC errors). */
async function appendHelpLogQuiet(assignmentId, body, reasonLabelForLog) {
  if (!assignmentId || body == null || String(body).trim() === '') return;
  try {
    const { error } = await supabase.rpc('append_assignment_help_message', {
      p_assignment_id: assignmentId,
      p_body: String(body).trim(),
      p_reason: reasonLabelForLog || null,
    });
    if (error) console.warn('[AskParentHelpModal] append_assignment_help_message:', error.message);
  } catch (e) {
    console.warn('[AskParentHelpModal] append_assignment_help_message', e);
  }
}

const REASONS = [
  { id: 'understand', label: "I'm confused about this" },
  { id: 'time', label: 'I need more time' },
  { id: 'materials', label: "I can't find what I need" },
  { id: 'question', label: 'I have a question' },
  { id: 'other', label: 'Something else' },
];

function formatAssignmentContextLine(startTs, endTs) {
  if (!startTs) return null;
  const start = new Date(startTs);
  if (Number.isNaN(start.getTime())) return null;
  const datePart = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtTime = (d) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const startT = fmtTime(start);
  if (endTs) {
    const end = new Date(endTs);
    if (!Number.isNaN(end.getTime())) {
      const endT = fmtTime(end);
      return `${datePart} • ${startT}–${endT}`;
    }
  }
  return `${datePart} • ${startT}`;
}

export default function AskParentHelpModal({
  visible,
  onClose,
  onSent,
  familyId,
  childId,
  /** Full assignment row when known */
  assignment = null,
  /** Event context when opened from event details (may or may not have a linked assignment) */
  eventContext = null,
}) {
  const [reasonId, setReasonId] = useState('understand');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setReasonId('understand');
      setNote('');
      setError(null);
    }
  }, [visible, assignment?.id, eventContext?.id]);

  const reasonLabel = REASONS.find((r) => r.id === reasonId)?.label || 'Something else';

  const contextSubtitle = useMemo(() => {
    if (eventContext?.start_ts) {
      return formatAssignmentContextLine(eventContext.start_ts, eventContext.end_ts);
    }
    if (assignment?.due_date) {
      const d = new Date(assignment.due_date);
      if (!Number.isNaN(d.getTime())) {
        return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      }
    }
    return null;
  }, [eventContext?.start_ts, eventContext?.end_ts, assignment?.due_date]);

  const latestHistoryLine = useMemo(() => {
    const formatWhen = (value) => {
      if (!value) return 'recently';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return 'recently';
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      const diffDays = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
      const time = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (diffDays === 0) return `today at ${time}`;
      if (diffDays === 1) return `yesterday at ${time}`;
      const date = parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `${date} at ${time}`;
    };

    const parseLog = (raw) => {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
      return [];
    };

    const log = parseLog(assignment?.help_message_log);
    const normalized = log
      .map((entry) => {
        const body = String(entry?.body || entry?.message || entry?.note || '').trim();
        const tsRaw = entry?.created_at || entry?.timestamp || assignment?.updated_at || assignment?.created_at || null;
        const ts = new Date(tsRaw || 0).getTime();
        if (!Number.isFinite(ts) || ts <= 0) return null;
        return { body, ts, tsRaw };
      })
      .filter(Boolean)
      .sort((a, b) => b.ts - a.ts);

    const latest = normalized[0];
    if (!latest) return null;
    return latest.body
      ? `Sent to parent ${formatWhen(latest.tsRaw)} — "${latest.body}"`
      : `Sent to parent ${formatWhen(latest.tsRaw)}`;
  }, [assignment?.help_message_log, assignment?.updated_at, assignment?.created_at]);

  const handleSend = async () => {
    if (!familyId || !childId) {
      setError('Missing account context.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const noteBlock = note.trim();
      const header = `[Help from student — ${reasonLabel}]`;
      const composed = [header, noteBlock || null].filter(Boolean).join('\n');

      if (assignment?.id) {
        const prev = (assignment.description || '').trim();
        const nextDesc = prev ? `${prev}\n\n${composed}` : composed;
        const { error: upErr } = await updateAssignment(assignment.id, {
          need_help: true,
          description: nextDesc,
        });
        if (upErr) throw upErr;
        await appendHelpLogQuiet(assignment.id, noteBlock || reasonLabel, reasonLabel);
        onSent?.();
        onClose?.();
        return;
      }

      if (eventContext?.id) {
        const eventIdStr = String(eventContext.id);
        // Avoid `.contains()` / `cs` on `linked_event_ids`: PostgREST can return 400 "invalid input syntax for type json"
        // depending on column type (jsonb vs uuid[]) and client encoding. Fetch scoped rows and match in JS.
        const { data: rows, error: findErr } = await supabase
          .from('assignments')
          .select('id, description, linked_event_ids')
          .eq('family_id', familyId)
          .eq('child_id', childId)
          .order('updated_at', { ascending: false })
          .limit(200);

        if (findErr) throw findErr;

        const linked = (rows || []).find((r) => assignmentRowLinksEventId(r, eventIdStr)) || null;

        if (linked?.id) {
          const prev = (linked.description || '').trim();
          const nextDesc = prev ? `${prev}\n\n${composed}` : composed;
          const { error: upErr } = await updateAssignment(linked.id, {
            need_help: true,
            description: nextDesc,
          });
          if (upErr) throw upErr;
          await appendHelpLogQuiet(linked.id, noteBlock || reasonLabel, reasonLabel);
        } else {
          const { data: created, error: insErr } = await createAssignment({
            family_id: familyId,
            child_id: childId,
            title: `Help: ${eventContext.title || 'Schoolwork'}`.slice(0, 200),
            description: composed,
            related_subject: null,
            due_date: eventContext.start_ts ? new Date(eventContext.start_ts).toISOString().split('T')[0] : null,
            status: 'not_started',
            linked_event_ids: [eventIdStr],
            need_help: true,
          });
          if (insErr) throw insErr;
          if (created?.id) {
            await appendHelpLogQuiet(created.id, noteBlock || reasonLabel, reasonLabel);
          }
        }
        onSent?.();
        onClose?.();
        return;
      }

      setError('Nothing to send.');
    } catch (e) {
      console.error('[AskParentHelpModal]', e);
      setError(e?.message || 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  const titleRef =
    assignment?.title ||
    eventContext?.title ||
    'this work';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => {
            e?.stopPropagation?.();
          }}
          onKeyDown={(e) => {
            e?.stopPropagation?.();
          }}
          style={styles.sheet}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <X size={20} color={colors.text} />
          </TouchableOpacity>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.contextTitle} numberOfLines={3}>
              {titleRef}
            </Text>
            {contextSubtitle ? (
              <Text style={styles.contextWhen}>{contextSubtitle}</Text>
            ) : null}

            {/* Zone 2 — decision (chips) */}
            <Text style={[styles.sectionLabel, styles.sectionLabelDecision]}>What do you need help with?</Text>
            <View style={styles.chips}>
              {REASONS.map((r) => {
                const on = r.id === reasonId;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setReasonId(r.id)}
                    activeOpacity={0.85}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    {on ? (
                      <View style={styles.chipCheckWrap}>
                        <Check size={14} color="#89B5E4" strokeWidth={3} />
                      </View>
                    ) : null}
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Zone 3 — expression (breathing room) */}
            <Text style={[styles.sectionLabel, styles.sectionLabelNote]}>Add a message</Text>
            {latestHistoryLine ? (
              <View style={styles.historyBox}>
                <Text style={styles.historyText}>{latestHistoryLine}</Text>
              </View>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Explain what you need help with…"
              placeholderTextColor={colors.muted}
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
            />

            {error ? <Text style={styles.err}>{error}</Text> : null}

            <View style={styles.ctaWrap}>
              <TouchableOpacity
                style={[styles.cta, sending && styles.ctaDisabled]}
                onPress={handleSend}
                disabled={sending}
                {...(Platform.OS === 'web' && { cursor: sending ? 'not-allowed' : 'pointer' })}
              >
                {sending ? (
                  <ActivityIndicator color="#5B6880" />
                ) : (
                  <View style={styles.ctaRow}>
                    <View style={styles.ctaIconWrap}>
                      <Send size={12} color="#5B6880" />
                    </View>
                    <Text style={styles.ctaText}>Send to parent</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '90%',
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  closeButton: {
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
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  contextTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 21,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  contextWhen: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 21,
    marginTop: 0,
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.15,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionLabelDecision: {
    marginTop: 18,
    marginBottom: 10,
  },
  sectionLabelNote: {
    marginTop: 22,
    marginBottom: 10,
  },
  historyBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  historyText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.5)',
    backgroundColor: '#FFFFFF',
  },
  /** Selected: Leanadoodle light blue (ice bg + border/text tone — same as planner filter pills) */
  chipOn: {
    borderColor: '#89B5E4',
    backgroundColor: '#EBF5FF',
  },
  chipCheckWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(137, 181, 228, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipTextOn: {
    color: '#89B5E4',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  err: {
    color: '#b91c1c',
    fontSize: 13,
    marginBottom: 8,
  },
  ctaWrap: {
    marginTop: 24,
    alignItems: 'center',
  },
  cta: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6DCE8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ctaIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  ctaText: {
    color: '#5B6880',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
