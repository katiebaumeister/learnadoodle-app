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
} from 'react-native';
import { ArrowLeft, ArrowUp, Calendar, Paperclip, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveBundledAvatarSource } from '../../assets/imageAssetMap';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import { createFileMaterial } from '../../lib/services/materialsClient';
import {
  ASSIGNMENT_SELECT,
  buildSendPayload,
  formatChatEventDateLabel,
  isDirectMessageRecipient,
  isUnifiedMessageMine,
  markDirectMessagesRead,
  mergeUnifiedStream,
  messageMatchesParticipant,
  resolveAssignmentChildContext,
  resolveLinkedEventId,
} from '../../lib/familyDmClient';
import DmAttachEventModal from './DmAttachEventModal';
import MessagesPaneCloseButton from './MessagesPaneCloseButton';

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

function formatEventChipWhen(event) {
  const startRaw = event?.start_ts || event?.start_local;
  if (!startRaw) return '';
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) return '';
  return start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
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
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [pendingEvent, setPendingEvent] = useState(null);
  const [pendingMaterial, setPendingMaterial] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const scrollRef = useRef(null);
  const scrollToBottomOnLoadRef = useRef(true);

  const childCtx = useMemo(
    () => resolveAssignmentChildContext(participant, viewerRole, viewerChildId),
    [participant, viewerChildId, viewerRole]
  );

  const canAttachEvent = Boolean(childCtx?.childId && familyId);

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

  const enrichMessages = useCallback(async (unified, assignmentList) => {
    const eventIds = new Set();
    const materialIds = new Set();

    unified.forEach((msg) => {
      if (msg.linkedEventId) eventIds.add(msg.linkedEventId);
      if (msg.materialId) materialIds.add(msg.materialId);
    });
    assignmentList.forEach((assignment) => {
      const linked = resolveLinkedEventId(assignment);
      if (linked) eventIds.add(linked);
    });

    let eventMetaById = new Map();
    if (eventIds.size > 0) {
      const { data: eventRows } = await supabase
        .from('events')
        .select('id, title, start_ts, end_ts, event_type')
        .in('id', [...eventIds]);
      eventMetaById = new Map(
        (eventRows || []).map((row) => [String(row.id), row]),
      );
    }

    let materialMetaById = new Map();
    if (materialIds.size > 0) {
      const { data: materialRows } = await supabase
        .from('materials')
        .select('id, title, mime, url, provider_url, storage_path')
        .in('id', [...materialIds]);
      materialMetaById = new Map(
        (materialRows || []).map((row) => [String(row.id), row]),
      );
    }

    return unified.map((msg) => {
      const next = { ...msg };
      if (msg.linkedEventId && eventMetaById.has(msg.linkedEventId)) {
        next.eventAttachment = eventMetaById.get(msg.linkedEventId);
      }
      if (msg.materialId && materialMetaById.has(msg.materialId)) {
        next.materialAttachment = materialMetaById.get(msg.materialId);
      }
      if (msg.actionLink?.linkedEventId && eventMetaById.has(String(msg.actionLink.linkedEventId))) {
        next.actionLink = {
          ...msg.actionLink,
          eventAttachment: eventMetaById.get(String(msg.actionLink.linkedEventId)),
        };
      }
      return next;
    });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!familyId || !currentUserId || !participant) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const dmPromise = supabase
        .from('family_direct_messages')
        .select('id, sender_user_id, recipient_child_id, recipient_user_id, body, linked_event_id, material_id, created_at, read_at')
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
      const dmList = Array.isArray(dmRows) ? dmRows : [];

      const unreadForMe = dmList
        .filter((row) => messageMatchesParticipant(row, participant, currentUserId, viewerChildId))
        .filter((row) => String(row.sender_user_id) !== String(currentUserId))
        .filter((row) => !row.read_at)
        .filter((row) => isDirectMessageRecipient(row, currentUserId, viewerChildId));

      if (unreadForMe.length > 0) {
        try {
          const markedAt = new Date().toISOString();
          await markDirectMessagesRead(unreadForMe.map((row) => row.id));
          unreadForMe.forEach((row) => {
            row.read_at = markedAt;
          });
        } catch (markErr) {
          console.warn('[FamilyDmChat] mark read:', markErr?.message || markErr);
        }
      }

      const linkedEventIds = [...new Set(
        assignmentList.map(resolveLinkedEventId).filter(Boolean),
      )];
      let eventDatesById = new Map();
      if (linkedEventIds.length > 0) {
        const { data: eventRows, error: eventError } = await supabase
          .from('events')
          .select('id, start_ts')
          .in('id', linkedEventIds);
        if (eventError) {
          console.warn('[FamilyDmChat] linked event dates unavailable:', eventError.message);
        } else {
          eventDatesById = new Map(
            (eventRows || [])
              .filter((row) => row?.id && row?.start_ts)
              .map((row) => [String(row.id), row.start_ts]),
          );
        }
      }

      const unified = mergeUnifiedStream({
        directMessages: dmList,
        assignments: assignmentList,
        participant,
        currentUserId,
        viewerRole,
        viewerChildId,
        eventDatesById,
      });
      const enriched = await enrichMessages(unified, assignmentList);
      setMessages(enriched);
    } catch (error) {
      console.error('[FamilyDmChat] loadMessages exception:', error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [childCtx?.childId, currentUserId, enrichMessages, familyId, participant, viewerChildId, viewerRole]);

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
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadMessages();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', refresh);
      window.removeEventListener('parentAssignmentsNeedRefresh', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadMessages]);

  const canSend = Boolean(
    composerText.trim() || pendingEvent?.id || pendingMaterial?.id,
  );

  const handleSend = useCallback(async () => {
    if (!canSend || sending) return;
    const payload = buildSendPayload(
      familyId,
      participant,
      composerText,
      currentUserId,
      {
        linkedEventId: pendingEvent?.id || null,
        materialId: pendingMaterial?.id || null,
      },
    );
    if (!payload) return;
    setSending(true);
    try {
      const { error } = await supabase.from('family_direct_messages').insert(payload);
      if (error) {
        console.error('[FamilyDmChat] send error:', error);
        return;
      }
      setComposerText('');
      setPendingEvent(null);
      setPendingMaterial(null);
      setShowAttachMenu(false);
      scrollToBottomOnLoadRef.current = true;
      await loadMessages();
    } catch (error) {
      console.error('[FamilyDmChat] send exception:', error);
    } finally {
      setSending(false);
    }
  }, [
    canSend,
    composerText,
    currentUserId,
    familyId,
    loadMessages,
    participant,
    pendingEvent?.id,
    pendingMaterial?.id,
    sending,
  ]);

  const pickFile = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || uploadingFile) return;
    setShowAttachMenu(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf,.doc,.docx,.txt,video/*';
    input.onchange = async (e) => {
      const file = e?.target?.files?.[0];
      if (!file || !familyId) return;
      setUploadingFile(true);
      try {
        const lastDotIndex = file.name.lastIndexOf('.');
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${familyId}/${crypto.randomUUID()}_${safeFileName}`;
        const { error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(filePath, file, {
            upsert: false,
            contentType: file.type,
            metadata: { family_id: familyId },
          });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('evidence').getPublicUrl(filePath);
        const mat = await createFileMaterial({
          familyId,
          storagePath: filePath,
          title: file.name || 'Attachment',
          mime: file.type || 'application/octet-stream',
          bytes: file.size || 0,
          childId: childCtx?.childId || null,
          url: publicUrl,
        });
        setPendingMaterial({ id: mat?.id, title: file.name || 'Attachment' });
      } catch (err) {
        console.error('[FamilyDmChat] file upload:', err);
      } finally {
        setUploadingFile(false);
      }
    };
    input.click();
  }, [childCtx?.childId, familyId, uploadingFile]);

  const openEventAttachment = useCallback((eventId) => {
    if (!eventId || Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('openEventModal', {
      detail: { eventId: String(eventId), schedulingMode: true },
    }));
  }, []);

  const openMaterialAttachment = useCallback(async (material) => {
    if (!material) return;
    const url = material.url || material.provider_url || null;
    if (url && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (material.id) {
      const { data } = await supabase
        .from('materials')
        .select('url, provider_url')
        .eq('id', material.id)
        .maybeSingle();
      const resolved = data?.url || data?.provider_url || null;
      if (resolved && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(resolved, '_blank', 'noopener,noreferrer');
      }
    }
  }, []);

  const openStreamActionLink = useCallback((actionLink) => {
    if (!actionLink || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const { kind, linkedEventId, assignment } = actionLink;
    if (kind === 'submission' && linkedEventId) {
      const isParentViewer = viewerRole === 'parent' || viewerRole === 'tutor';
      if (isParentViewer && assignment) {
        window.dispatchEvent(new CustomEvent('openReviewForAssignment', { detail: { assignment } }));
        return;
      }
      window.dispatchEvent(new CustomEvent('openEventModal', {
        detail: {
          eventId: String(linkedEventId),
          childEventFocus: 'submission',
          assignment,
          childId: childCtx?.childId || assignment?.child_id || null,
          submissionViewOnly: false,
        },
      }));
      return;
    }
    if (linkedEventId) {
      openEventAttachment(linkedEventId);
    }
  }, [childCtx?.childId, openEventAttachment, viewerRole]);

  const avatarSource = useMemo(
    () => avatarSourceForParticipant(participant),
    [participant]
  );

  const firstMessageAt = messages[0]?.createdAt || null;

  const seenOnMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.source !== 'dm') continue;
      if (!isUnifiedMessageMine(message, viewerRole, currentUserId)) continue;
      return message.readAt ? message.id : null;
    }
    return null;
  }, [messages, viewerRole, currentUserId]);

  const renderEventChip = (event, onPress) => {
    if (!event) return null;
    const title = String(event.title || 'Event').trim() || 'Event';
    const when = formatEventChipWhen(event) || formatChatEventDateLabel(event.start_ts) || '';
    return (
      <TouchableOpacity
        style={styles.eventChip}
        onPress={onPress}
        activeOpacity={0.8}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Calendar size={14} color="#2563EB" />
        <View style={styles.chipTextWrap}>
          <Text style={styles.chipTitle} numberOfLines={1}>{title}</Text>
          {when ? <Text style={styles.chipMeta} numberOfLines={1}>{when}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderMaterialChip = (material, onPress) => {
    if (!material) return null;
    const title = String(material.title || 'Attachment').trim() || 'Attachment';
    return (
      <TouchableOpacity
        style={styles.materialChip}
        onPress={onPress}
        activeOpacity={0.8}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Paperclip size={14} color="#475569" />
        <Text style={styles.chipTitle} numberOfLines={1}>{title}</Text>
      </TouchableOpacity>
    );
  };

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
              <Text style={styles.introHint}>Send messages here</Text>
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
            const actionLink = message.actionLink || null;
            const actionIsLink = actionLink?.kind === 'submission';
            const hasBody = Boolean(String(displayBody || '').trim());
            const hasEventChip = Boolean(message.eventAttachment);
            const hasMaterialChip = Boolean(message.materialAttachment);
            const hasAction = Boolean(actionLink?.label);
            const showBubble = hasBody || hasEventChip || hasMaterialChip || hasAction;

            return (
              <View
                key={message.id}
                style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}
              >
                <Text style={styles.senderLabel}>{metaLabel}</Text>
                {showBubble ? (
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                    {hasBody ? (
                      <Text style={styles.bubbleText}>{displayBody}</Text>
                    ) : null}
                    {hasEventChip ? renderEventChip(
                      message.eventAttachment,
                      () => openEventAttachment(message.linkedEventId),
                    ) : null}
                    {hasMaterialChip ? renderMaterialChip(
                      message.materialAttachment,
                      () => openMaterialAttachment(message.materialAttachment),
                    ) : null}
                    {hasAction ? (
                      actionIsLink ? (
                        <TouchableOpacity
                          onPress={() => openStreamActionLink(actionLink)}
                          activeOpacity={0.7}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.actionInBubbleLink}>{actionLink.label}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.actionInBubble}>{actionLink.label}</Text>
                      )
                    ) : null}
                  </View>
                ) : null}
                {isMine && message.source === 'dm' && message.id === seenOnMessageId ? (
                  <Text style={styles.seenLabel}>Seen</Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {!childInviteGate ? (
        <View style={styles.composerWrap}>
          {(pendingEvent || pendingMaterial) ? (
            <View style={styles.pendingAttachments}>
              {pendingEvent ? (
                <View style={styles.pendingChipRow}>
                  {renderEventChip(pendingEvent, () => setShowEventModal(true))}
                  <TouchableOpacity
                    onPress={() => setPendingEvent(null)}
                    style={styles.pendingRemove}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={14} color="#64748B" />
                  </TouchableOpacity>
                </View>
              ) : null}
              {pendingMaterial ? (
                <View style={styles.pendingChipRow}>
                  {renderMaterialChip(pendingMaterial, () => openMaterialAttachment(pendingMaterial))}
                  <TouchableOpacity
                    onPress={() => setPendingMaterial(null)}
                    style={styles.pendingRemove}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={14} color="#64748B" />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.composerRow}>
            <View style={styles.attachWrap}>
              <TouchableOpacity
                style={styles.attachButton}
                onPress={() => setShowAttachMenu((prev) => !prev)}
                activeOpacity={0.8}
                disabled={uploadingFile}
                {...(Platform.OS === 'web' && { cursor: uploadingFile ? 'default' : 'pointer' })}
              >
                {uploadingFile ? (
                  <ActivityIndicator size="small" color="#64748B" />
                ) : (
                  <Plus size={18} color="#64748B" />
                )}
              </TouchableOpacity>
              {showAttachMenu ? (
                <View style={styles.attachMenu}>
                  {canAttachEvent ? (
                    <TouchableOpacity
                      style={styles.attachMenuItem}
                      onPress={() => {
                        setShowAttachMenu(false);
                        setShowEventModal(true);
                      }}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Calendar size={16} color="#334155" />
                      <Text style={styles.attachMenuText}>Event</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.attachMenuItem}
                    onPress={pickFile}
                    disabled={uploadingFile}
                    {...(Platform.OS === 'web' && { cursor: uploadingFile ? 'default' : 'pointer' })}
                  >
                    <Paperclip size={16} color="#334155" />
                    <Text style={styles.attachMenuText}>Photo or file</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              placeholder="Type a message..."
              placeholderTextColor="#94A3B8"
              style={styles.composerInput}
              multiline
              maxLength={2000}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                if (canSend && !sending) handleSend();
              }}
              {...(Platform.OS === 'web' && {
                onKeyDown: (e) => {
                  if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend && !sending) handleSend();
                  }
                },
              })}
              onKeyPress={Platform.OS === 'web' ? undefined : (e) => {
                const key = e.nativeEvent?.key;
                if (key === 'Enter' && !e.shiftKey && canSend && !sending) {
                  handleSend();
                }
              }}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!canSend || sending) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!canSend || sending}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: !canSend || sending ? 'default' : 'pointer' })}
            >
              <ArrowUp size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <DmAttachEventModal
        visible={showEventModal}
        onClose={() => setShowEventModal(false)}
        onSelect={(event) => setPendingEvent(event)}
        familyId={familyId}
        childId={childCtx?.childId || null}
        children={familyChildren}
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
    gap: 8,
    minWidth: 48,
  },
  bubbleMine: {
    backgroundColor: '#FFFFFF',
  },
  bubbleOther: {
    backgroundColor: '#F8FAFC',
  },
  bubbleText: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
  },
  actionInBubble: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#64748B',
    lineHeight: 18,
  },
  actionInBubbleLink: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#2563EB',
    lineHeight: 18,
  },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    maxWidth: 260,
  },
  materialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: 260,
  },
  chipTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  chipTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flexShrink: 1,
  },
  chipMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  seenLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  pendingAttachments: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  pendingChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  pendingRemove: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachWrap: {
    position: 'relative',
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  attachMenu: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    minWidth: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    zIndex: 20,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.12)',
    }),
  },
  attachMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  attachMenuText: {
    fontSize: 14,
    color: '#334155',
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
