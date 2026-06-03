import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ArrowLeft, ArrowUp, Hand, ClipboardList, MessageCircle } from 'lucide-react';
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
import MessagesPaneCloseButton from './MessagesPaneCloseButton';

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

function formatMessageTime(createdAt) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
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

function renderWorkflowHintPortal(actionHint) {
  if (Platform.OS !== 'web' || !actionHint?.text || typeof document === 'undefined') {
    return null;
  }
  let ReactDOM;
  try {
    ReactDOM = require('react-dom');
  } catch {
    return null;
  }
  if (!ReactDOM?.createPortal) return null;
  return ReactDOM.createPortal(
    <View
      pointerEvents="none"
      style={[
        styles.workflowActionHint,
        {
          left: actionHint.x,
          top: actionHint.y,
        },
      ]}
    >
      <Text style={styles.workflowActionHintText}>{actionHint.text}</Text>
    </View>,
    document.body
  );
}

function WorkflowActionIconButton({
  Icon,
  label,
  hint,
  onPress,
  onShowHint,
  onHideHint,
  disabled = false,
  allowDisabledPress = false,
  urgent = false,
}) {
  const hintText = String(hint || label || '').trim();
  const canPressWhenDisabled = disabled && allowDisabledPress;
  const touchDisabled = disabled && !allowDisabledPress;
  const iconColor = disabled
    ? '#CBD5E1'
    : urgent
      ? '#EA580C'
      : '#5B6880';

  const handleMouseEnter = useCallback((e) => {
    if (Platform.OS !== 'web' || !hintText) return;
    onShowHint?.(hintText, e);
  }, [hintText, onShowHint]);

  const handleMouseLeave = useCallback(() => {
    if (Platform.OS !== 'web') return;
    onHideHint?.();
  }, [onHideHint]);

  return (
    <TouchableOpacity
      style={[
        styles.workflowActionIconBtn,
        disabled && styles.workflowActionIconBtnDisabled,
        canPressWhenDisabled && styles.workflowActionIconBtnDisabledPressable,
        urgent && !disabled && styles.workflowActionIconBtnUrgent,
      ]}
      onPress={() => {
        if (disabled) {
          if (canPressWhenDisabled) onPress?.();
          return;
        }
        onPress?.();
      }}
      disabled={touchDisabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      {...(Platform.OS === 'web' && {
        cursor: canPressWhenDisabled || !disabled ? 'pointer' : 'default',
        title: hintText,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
      })}
    >
      <Icon size={15} color={iconColor} strokeWidth={2.1} />
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
  childInviteSummaries = null,
  onClosePane = null,
  onBack,
}) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const scrollToBottomOnLoadRef = useRef(true);
  const [workflowActionHint, setWorkflowActionHint] = useState(null);

  const showWorkflowActionHint = useCallback((text, event) => {
    if (Platform.OS !== 'web' || !text) return;
    const node = event?.currentTarget || event?.target;
    if (!node || typeof node.getBoundingClientRect !== 'function') return;
    const rect = node.getBoundingClientRect();
    setWorkflowActionHint({
      text,
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
  }, []);

  const hideWorkflowActionHint = useCallback(() => {
    if (Platform.OS !== 'web') return;
    setWorkflowActionHint(null);
  }, []);

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

  const childInviteGate = useMemo(() => {
    if (participant?.type !== 'child') return null;
    if (viewerRole !== 'parent' && viewerRole !== 'tutor') return null;
    const childId = String(participant?.id || '').trim();
    if (!childId) return null;
    const summaries = childInviteSummaries && typeof childInviteSummaries === 'object'
      ? childInviteSummaries
      : null;
    const status = String(summaries?.[childId]?.invite_status || 'none').trim().toLowerCase();
    if (status === 'accepted' || status === 'connected') return null;
    const childName = String(participant?.name || '').trim() || 'this child';
    return {
      childId,
      childName,
      status: status === 'pending' ? 'pending' : 'none',
    };
  }, [participant, viewerRole, childInviteSummaries]);

  const openInviteChildModal = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const childId = String(childInviteGate?.childId || participant?.id || '').trim() || null;
    window.dispatchEvent(new CustomEvent('openInviteChildModal', {
      detail: { childId },
    }));
  }, [childInviteGate?.childId, participant?.id]);

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
    scrollToBottomOnLoadRef.current = true;
  }, [participant?.id]);

  const scrollToBottom = useCallback((animated = false) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const run = () => scroll.scrollToEnd?.({ animated });
    if (Platform.OS === 'web' && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
      return;
    }
    run();
  }, []);

  const handleScrollContentSizeChange = useCallback(() => {
    if (!scrollToBottomOnLoadRef.current) return;
    scrollToBottom(false);
    scrollToBottomOnLoadRef.current = false;
  }, [scrollToBottom]);

  useEffect(() => {
    if (loading || !scrollToBottomOnLoadRef.current) return;
    scrollToBottom(false);
  }, [loading, messages.length, scrollToBottom]);

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
      scrollToBottomOnLoadRef.current = true;
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
        {typeof onClosePane === 'function' ? (
          <MessagesPaneCloseButton onPress={onClosePane} />
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={handleScrollContentSizeChange}
        >
          <View style={styles.introBlock}>
            <Image source={avatarSource} style={styles.introAvatar} />
            <Text style={styles.introName}>{participant?.name}</Text>
            {!childInviteGate ? (
              <Text style={styles.introHint}>Nudges, help, submissions, and messages in one place</Text>
            ) : null}
          </View>

          {childInviteGate ? (
            <View style={styles.inviteCard}>
              <Text style={styles.inviteCardTitle}>
                {childInviteGate.status === 'pending'
                  ? `Waiting for ${childInviteGate.childName}`
                  : `Invite ${childInviteGate.childName}`}
              </Text>
              <Text style={styles.inviteCardSubtitle}>
                {childInviteGate.status === 'pending'
                  ? `${childInviteGate.childName} has not accepted yet. Resend the invite so they can use Messages and get assignments.`
                  : `Send ${childInviteGate.childName} an invite so you can message them and assign work.`}
              </Text>
              <TouchableOpacity
                style={styles.inviteCardButton}
                onPress={openInviteChildModal}
                activeOpacity={0.85}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.inviteCardButtonText}>
                  {childInviteGate.status === 'pending' ? 'Resend invite' : 'Invite child'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

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
            const senderName = isMine
              ? 'You'
              : (String(participant?.name || '').trim() || 'Student');
            const timeLabel = formatMessageTime(message.createdAt);
            const metaLabel = timeLabel ? `${senderName} · ${timeLabel}` : senderName;
            return (
              <View
                key={message.id}
                style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}
              >
                <Text style={styles.senderLabel}>{metaLabel}</Text>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                  {message.assignmentTitle ? (
                    <Text style={styles.assignmentTitle}>
                      {message.assignmentTitle}
                    </Text>
                  ) : null}
                  {message.kindLabel ? (
                    <Text style={styles.kindLabel}>
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

      {showWorkflowBar && !childInviteGate ? (
        <View style={styles.actionsRow}>
          <WorkflowActionIconButton
            Icon={Hand}
            label="Nudge student"
            hint="Nudge student"
            onShowHint={showWorkflowActionHint}
            onHideHint={hideWorkflowActionHint}
            onPress={() => openAssignmentWorkflow(workflowActions.primaryAssignment, 'nudge')}
          />
          <WorkflowActionIconButton
            Icon={ClipboardList}
            label={workflowActions.gradeSubmittal ? 'Grade submittal' : 'Request submit'}
            hint={workflowActions.gradeSubmittal ? 'Grade submittal' : 'Request submit'}
            urgent={!!workflowActions.gradeSubmittal}
            onShowHint={showWorkflowActionHint}
            onHideHint={hideWorkflowActionHint}
            onPress={() => {
              if (workflowActions.gradeSubmittal) {
                openAssignmentWorkflow(workflowActions.gradeSubmittal, 'grade');
                return;
              }
              openAssignmentWorkflow(workflowActions.primaryAssignment, 'submittal');
            }}
          />
          <WorkflowActionIconButton
            Icon={MessageCircle}
            label="Respond to help"
            hint="Respond to help"
            disabled={!workflowActions.respondHelp}
            allowDisabledPress
            urgent={!!workflowActions.respondHelp}
            onShowHint={showWorkflowActionHint}
            onHideHint={hideWorkflowActionHint}
            onPress={() => {
              if (workflowActions.respondHelp) {
                openAssignmentWorkflow(workflowActions.respondHelp, 'help');
              }
            }}
          />
        </View>
      ) : null}

      {!childInviteGate ? (
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
      ) : null}

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

      {renderWorkflowHintPortal(workflowActionHint)}
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
  inviteCard: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(238, 242, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(99, 102, 241, 0.08)',
    }),
  },
  inviteCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inviteCardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 14,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inviteCardButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#4F46E5',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)',
    }),
  },
  inviteCardButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    color: '#5AAEF2',
  },
  kindLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: '#5AAEF2',
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  workflowActionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  workflowActionIconBtnDisabled: {
    opacity: 0.38,
  },
  workflowActionIconBtnDisabledPressable: {
    opacity: 0.38,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  workflowActionHint: {
    position: 'fixed',
    zIndex: 100001,
    maxWidth: 240,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
    transform: [{ translateX: -50 }],
    pointerEvents: 'none',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)',
    }),
  },
  workflowActionHintText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      whiteSpace: 'nowrap',
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  workflowActionIconBtnUrgent: {
    borderColor: 'rgba(234, 88, 12, 0.35)',
    backgroundColor: '#FFF7ED',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
