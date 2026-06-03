import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { X, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { updateAssignment } from '../../lib/services/assignmentsClient';
import { extractStudentHelpReason } from '../tutor/tutorHelpUtils';
import { useToast } from '../Toast';
import {
  appendAssignmentMessage,
  dispatchAssignmentRefreshEvents,
  ensureLinkedAssignment,
  findLinkedAssignment,
  formatAssignmentThreadLines,
  getChildIdsFromEvent,
} from '../../lib/assignmentWorkflowClient';
import AskParentHelpModal from '../child/AskParentHelpModal';

function formatEventContextLine(event) {
  const title = String(event?.title || 'Assignment').trim();
  const start = event?.start_ts || event?.start_local;
  if (!start) return title;
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return title;
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${title} · ${datePart} · ${timePart}`;
}

export default function AssignmentMessageModal({
  visible = false,
  onClose,
  onSent,
  familyId,
  event = null,
  assignment = null,
  isParentViewer = true,
  children = [],
  subjectId = null,
  assignedChildIds = [],
}) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loadedAssignment, setLoadedAssignment] = useState(assignment);
  const [authUserId, setAuthUserId] = useState(null);

  const childIds = useMemo(
    () => getChildIdsFromEvent(event, assignedChildIds),
    [event, assignedChildIds],
  );
  const primaryChildId = childIds[0] || null;
  const childName = useMemo(() => {
    if (!primaryChildId) return 'Student';
    const match = (children || []).find((c) => String(c?.id) === String(primaryChildId));
    return String(match?.first_name || match?.name || 'Student').trim() || 'Student';
  }, [children, primaryChildId]);

  useEffect(() => {
    if (!visible) return;
    setNote('');
    setError('');
    setLoadedAssignment(assignment);
    supabase.auth.getUser().then(({ data }) => {
      setAuthUserId(data?.user?.id || null);
    });
  }, [visible, assignment]);

  useEffect(() => {
    if (!visible || !isParentViewer || !familyId || !event?.id || !primaryChildId) return;
    let cancelled = false;
    findLinkedAssignment({ familyId, childId: primaryChildId, eventId: event.id })
      .then((row) => {
        if (!cancelled) setLoadedAssignment(row || assignment || null);
      })
      .catch(() => {
        if (!cancelled) setLoadedAssignment(assignment || null);
      });
    return () => { cancelled = true; };
  }, [visible, isParentViewer, familyId, event?.id, primaryChildId, assignment]);

  const historyLines = useMemo(
    () => formatAssignmentThreadLines(loadedAssignment, { childName }),
    [loadedAssignment, childName],
  );
  const helpReason = loadedAssignment?.need_help ? extractStudentHelpReason(loadedAssignment) : '';

  const handleParentSend = useCallback(async () => {
    const trimmed = String(note || '').trim();
    if (!trimmed) {
      setError('Add a message before sending.');
      return;
    }
    if (!familyId || !event?.id || !primaryChildId) {
      setError('Choose a student on this event first.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const assignmentId = await ensureLinkedAssignment({
        familyId,
        event,
        childId: primaryChildId,
        subjectId: subjectId || event?.subject_id,
        userId: authUserId,
        title: event?.title,
        status: 'not_started',
      });
      if (!assignmentId) throw new Error('Could not link assignment');

      if (loadedAssignment?.need_help) {
        await updateAssignment(assignmentId, { need_help: false });
      }
      await appendAssignmentMessage(assignmentId, trimmed, 'sent_assignment');
      toast.push(`Message sent to ${childName}`, 'success');
      dispatchAssignmentRefreshEvents();
      onSent?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  }, [
    note,
    familyId,
    event,
    primaryChildId,
    subjectId,
    authUserId,
    loadedAssignment?.need_help,
    childName,
    toast,
    onSent,
    onClose,
  ]);

  if (!isParentViewer) {
    return (
      <AskParentHelpModal
        visible={visible}
        onClose={onClose}
        onSent={onSent}
        familyId={familyId}
        childId={primaryChildId}
        assignment={loadedAssignment}
        eventContext={
          event?.id
            ? {
                id: event.id,
                title: event.title,
                start_ts: event.start_ts,
                end_ts: event.end_ts,
                subject_id: event.subject_id || subjectId || null,
              }
            : null
        }
        titleOverride="Message parent about assignment"
        ctaTextOverride="Send message"
      />
    );
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
            <X size={20} color="#6B7280" />
          </TouchableOpacity>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Message student about assignment</Text>
            <Text style={styles.contextLine}>{formatEventContextLine(event)}</Text>
            <Text style={styles.helperText}>
              Send a nudge, reminder, or note about getting started. This is separate from requesting a submittal.
            </Text>

            {helpReason ? (
              <View style={styles.helpBanner}>
                <Text style={styles.helpBannerTitle}>{childName} asked for help</Text>
                <Text style={styles.helpBannerBody}>{helpReason}</Text>
              </View>
            ) : null}

            {historyLines.length > 0 ? (
              <View style={styles.historyBox}>
                <Text style={styles.historyLabel}>Message thread</Text>
                {historyLines.map((line, idx) => (
                  <Text key={`msg-${idx}`} style={styles.historyLine}>{line}</Text>
                ))}
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Message</Text>
            <TextInput
              style={styles.input}
              placeholder={`Write a note to ${childName}…`}
              placeholderTextColor="#9CA3AF"
              value={note}
              onChangeText={(value) => {
                setNote(value);
                if (error) setError('');
              }}
              multiline
              textAlignVertical="top"
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.sendButton, sending && styles.sendButtonDisabled]}
              onPress={handleParentSend}
              disabled={sending}
              {...(Platform.OS === 'web' && { cursor: sending ? 'not-allowed' : 'pointer' })}
            >
              {sending ? (
                <ActivityIndicator color="#5B6880" />
              ) : (
                <View style={styles.sendRow}>
                  <Send size={14} color="#5B6880" />
                  <Text style={styles.sendText}>Send message</Text>
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '84%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    paddingRight: 36,
  },
  contextLine: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748B',
  },
  helperText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: '#6B7280',
  },
  helpBanner: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  helpBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9A3412',
  },
  helpBannerBody: {
    marginTop: 4,
    fontSize: 13,
    color: '#7C2D12',
    lineHeight: 18,
  },
  historyBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  historyLine: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
    marginBottom: 4,
  },
  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    minHeight: 110,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#DC2626',
  },
  sendButton: {
    marginTop: 20,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sendText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
});
