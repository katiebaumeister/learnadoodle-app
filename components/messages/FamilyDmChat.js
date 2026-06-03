import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ArrowLeft, MoreHorizontal, ArrowUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveBundledAvatarSource } from '../../assets/imageAssetMap';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import {
  ASSIGNMENT_SELECT,
  buildSendPayload,
  deriveDmWorkflowActions,
  isUnifiedMessageMine,
  mergeUnifiedStream,
  resolveAssignmentChildContext,
  resolveLinkedEventId,
} from '../../lib/familyDmClient';
import { dispatchAssignmentRefreshEvents } from '../../lib/assignmentWorkflowClient';
import AssignmentMessageModal from '../subjects/AssignmentMessageModal';
import AssignmentSubmittalRequestModal from '../subjects/AssignmentSubmittalRequestModal';
import RespondToHelpRequestModal from '../parent/RespondToHelpRequestModal';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';

const EVENT_SELECT = 'id, title, start_ts, end_ts, subject_id, child_id, child_ids, materials_attachment_ids, material_id';

function avatarSourceForParticipant(participant) {
  if (!participant) return resolveBundledAvatarSource('prof1');
  if (participant.type === 'child') {
    return sourceForChild({
      avatar: participant.avatar,
      avatar_url: participant.avatar,
    });
  }
  return resolveBundledAvatarSource(participant.avatar || 'prof1');
}

async function loadEventForAssignment(assignment) {
  const eventId = resolveLinkedEventId(assignment);
  if (!eventId) return null;
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', eventId)
    .maybeSingle();
  if (error) {
    console.warn('[FamilyDmChat] loadEventForAssignment:', error.message);
    return null;
  }
  return data;
}

function WorkflowActionButton({ label, onPress, variant = 'default' }) {
  return (
    <TouchableOpacity
      style={[
        styles.actionChip,
        variant === 'primary' && styles.actionChipPrimary,
        variant === 'urgent' && styles.actionChipUrgent,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <Text style={[
        styles.actionChipText,
        variant === 'primary' && styles.actionChipTextPrimary,
        variant === 'urgent' && styles.actionChipTextUrgent,
      ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function FamilyDmChat({
  participant,
  familyId,
  currentUserId,
  viewerRole = 'parent',
  viewerChildId = null,
  familyChildren = [],
  onBack,
}) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  const [showNudgeModal, setShowNudgeModal] = useState(false);
  const [showSubmittalModal, setShowSubmittalModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [modalAssignment, setModalAssignment] = useState(null);
  const [modalEvent, setModalEvent] = useState(null);

  const childCtx = useMemo(
    () => resolveAssignmentChildContext(participant, viewerRole, viewerChildId),
    [participant, viewerChildId, viewerRole]
  );

  const workflowActions = useMemo(
    () => deriveDmWorkflowActions(assignments, { viewerRole }),
    [assignments, viewerRole]
  );

  const showWorkflowBar = !!childCtx?.childId
    && (viewerRole === 'parent' || viewerRole === 'tutor');

  const loadMessages = useCallback(async () => {
    if (!familyId || !currentUserId || !participant) {
      setMessages([]);
      setAssignments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const dmPromise = supabase
        .from('family_direct_messages')
        .select('id, sender_user_id, recipient_child_id, recipient_user_id, body, created_at')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false })
        .limit(300);

      const assignmentsPromise = childCtx?.childId
        ? supabase
          .from('assignments')
          .select(ASSIGNMENT_SELECT)
          .eq('family_id', familyId)
          .eq('child_id', childCtx.childId)
          .order('updated_at', { ascending: false })
          .limit(200)
        : Promise.resolve({ data: [], error: null });

      const [{ data: dmRows, error: dmError }, { data: assignmentRows, error: asgError }] = await Promise.all([
        dmPromise,
        assignmentsPromise,
      ]);

      if (dmError) {
        console.warn('[FamilyDmChat] direct messages unavailable:', dmError.message);
      }
      if (asgError) {
        console.warn('[FamilyDmChat] assignment stream unavailable:', asgError.message);
      }

      const assignmentList = Array.isArray(assignmentRows) ? assignmentRows : [];
      setAssignments(assignmentList);

      const unified = mergeUnifiedStream({
        directMessages: Array.isArray(dmRows) ? dmRows : [],
        assignments: assignmentList,
        participant,
        currentUserId,
        viewerRole,
        viewerChildId,
      });
      setMessages(unified);
    } catch (error) {
      console.error('[FamilyDmChat] loadMessages exception:', error);
      setMessages([]);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [childCtx?.childId, currentUserId, familyId, participant, viewerChildId, viewerRole]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refresh = () => { loadMessages(); };
    window.addEventListener('childAssignmentsNeedRefresh', refresh);
    window.addEventListener('parentAssignmentsNeedRefresh', refresh);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', refresh);
      window.removeEventListener('parentAssignmentsNeedRefresh', refresh);
    };
  }, [loadMessages]);

  const handleWorkflowComplete = useCallback(() => {
    dispatchAssignmentRefreshEvents();
    loadMessages();
  }, [loadMessages]);

  const openAssignmentWorkflow = useCallback(async (assignment, kind) => {
    if (!assignment) {
      const message = 'No schoolwork found yet. Add an assignment from the planner first.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Schoolwork needed', message);
      return;
    }
    const event = await loadEventForAssignment(assignment);
    if ((kind === 'nudge' || kind === 'submittal') && !event) {
      const message = 'Link this assignment to a planner event to send a nudge or request a submittal.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Planner event needed', message);
      return;
    }
    setModalAssignment(assignment);
    setModalEvent(event);
    if (kind === 'nudge') setShowNudgeModal(true);
    else if (kind === 'submittal') setShowSubmittalModal(true);
    else if (kind === 'help') setShowHelpModal(true);
    else if (kind === 'grade') setShowReviewModal(true);
  }, []);

  const closeModals = useCallback(() => {
    setShowNudgeModal(false);
    setShowSubmittalModal(false);
    setShowHelpModal(false);
    setShowReviewModal(false);
    setModalAssignment(null);
    setModalEvent(null);
  }, []);

  const handleSend = useCallback(async () => {
    const payload = buildSendPayload(familyId, participant, composerText, currentUserId);
    if (!payload || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from('family_direct_messages').insert(payload);
      if (error) {
        console.error('[FamilyDmChat] send error:', error);
        return;
      }
      setComposerText('');
      await loadMessages();
    } catch (error) {
      console.error('[FamilyDmChat] send exception:', error);
    } finally {
      setSending(false);
    }
  }, [composerText, currentUserId, familyId, loadMessages, participant, sending]);

  const avatarSource = useMemo(
    () => avatarSourceForParticipant(participant),
    [participant]
  );

  const firstMessageAt = messages[0]?.createdAt || null;
  const assignedChildIds = childCtx?.childId ? [childCtx.childId] : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <ArrowLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Image source={avatarSource} style={styles.headerAvatar} />
        <Text style={styles.headerName} numberOfLines={1}>{participant?.name}</Text>
        <TouchableOpacity
          style={styles.moreButton}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <MoreHorizontal size={20} color="#0F172A" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.introBlock}>
            <Image source={avatarSource} style={styles.introAvatar} />
            <Text style={styles.introName}>{participant?.name}</Text>
            <Text style={styles.introHint}>Nudges, help, submissions, and messages in one place</Text>
          </View>

          {firstMessageAt ? (
            <Text style={styles.dateDivider}>
              {new Date(firstMessageAt).toLocaleString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          ) : null}

          {messages.map((message) => {
            const isMine = isUnifiedMessageMine(message, viewerRole, currentUserId);
            const displayBody = message.displayBody || message.body;
            return (
              <View
                key={message.id}
                style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}
              >
                {isMine ? <Text style={styles.senderLabel}>You</Text> : null}
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                  {message.assignmentTitle ? (
                    <Text style={[styles.assignmentTitle, isMine ? styles.assignmentTitleMine : styles.assignmentTitleOther]}>
                      {message.assignmentTitle}
                    </Text>
                  ) : null}
                  {message.kindLabel ? (
                    <Text style={[styles.kindLabel, isMine ? styles.kindLabelMine : styles.kindLabelOther]}>
                      {message.kindLabel}
                    </Text>
                  ) : null}
                  <Text style={styles.bubbleText}>{displayBody}</Text>
                </View>
                {isMine && message.source === 'dm' ? (
                  <Text style={styles.seenLabel}>Seen</Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {showWorkflowBar ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.actionsScroll}
          contentContainerStyle={styles.actionsContent}
        >
          {workflowActions.respondHelp ? (
            <WorkflowActionButton
              label="Respond to help"
              variant="urgent"
              onPress={() => openAssignmentWorkflow(workflowActions.respondHelp, 'help')}
            />
          ) : null}
          {workflowActions.gradeSubmittal ? (
            <WorkflowActionButton
              label="Grade submittal"
              variant="primary"
              onPress={() => openAssignmentWorkflow(workflowActions.gradeSubmittal, 'grade')}
            />
          ) : null}
          {workflowActions.showNudge ? (
            <WorkflowActionButton
              label="Send nudge"
              onPress={() => openAssignmentWorkflow(workflowActions.primaryAssignment, 'nudge')}
            />
          ) : null}
          {workflowActions.showRequestSubmit ? (
            <WorkflowActionButton
              label="Request submittal"
              onPress={() => openAssignmentWorkflow(workflowActions.primaryAssignment, 'submittal')}
            />
          ) : null}
        </ScrollView>
      ) : null}

      <View style={styles.composerRow}>
        <TextInput
          value={composerText}
          onChangeText={setComposerText}
          placeholder="Type a message..."
          placeholderTextColor="#94A3B8"
          style={styles.composerInput}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!composerText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!composerText.trim() || sending}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' && { cursor: !composerText.trim() || sending ? 'default' : 'pointer' })}
        >
          <ArrowUp size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <AssignmentMessageModal
        visible={showNudgeModal}
        onClose={closeModals}
        onSent={handleWorkflowComplete}
        familyId={familyId}
        event={modalEvent}
        assignment={modalAssignment}
        isParentViewer
        children={familyChildren}
        assignedChildIds={assignedChildIds}
        subjectId={modalEvent?.subject_id || modalAssignment?.related_subject || null}
      />

      <AssignmentSubmittalRequestModal
        visible={showSubmittalModal}
        onClose={closeModals}
        onRequested={handleWorkflowComplete}
        familyId={familyId}
        event={modalEvent}
        assignment={modalAssignment}
        children={familyChildren}
        assignedChildIds={assignedChildIds}
        subjectId={modalEvent?.subject_id || modalAssignment?.related_subject || null}
      />

      <RespondToHelpRequestModal
        visible={showHelpModal}
        assignment={modalAssignment}
        onClose={closeModals}
        onResponded={handleWorkflowComplete}
      />

      <AssignmentReviewModal
        visible={showReviewModal}
        assignment={modalAssignment}
        onClose={closeModals}
        onReviewed={handleWorkflowComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#2563EB',
  },
  moreButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 10,
  },
  introBlock: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  introAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  introName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  introHint: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  dateDivider: {
    alignSelf: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginVertical: 8,
  },
  messageRow: {
    gap: 4,
    maxWidth: '88%',
  },
  messageRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageRowOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  bubbleMine: {
    backgroundColor: '#FFFFFF',
  },
  bubbleOther: {
    backgroundColor: '#F8FAFC',
  },
  assignmentTitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  assignmentTitleMine: {
    color: '#4338CA',
  },
  assignmentTitleOther: {
    color: '#6366F1',
  },
  kindLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  kindLabelMine: {
    color: '#4338CA',
  },
  kindLabelOther: {
    color: '#64748B',
  },
  bubbleText: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
  },
  seenLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actionsScroll: {
    flexGrow: 0,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  actionsContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionChipPrimary: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: 'rgba(139, 92, 246, 0.5)',
  },
  actionChipUrgent: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  actionChipTextPrimary: {
    color: '#4338CA',
  },
  actionChipTextUrgent: {
    color: '#92400E',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});
