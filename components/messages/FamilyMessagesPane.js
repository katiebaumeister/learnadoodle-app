import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SquarePen, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFamilyMembers } from '../../lib/apiClient';
import {
  ASSIGNMENT_SELECT,
  buildFamilyDmParticipants,
  buildCompositeParticipant,
  buildPreviewMapFromUnified,
  clearFamilyDirectMessages,
  collectMessageIdsForParticipants,
  formatDmRelativeTime,
  getCachedFamilyDmInbox,
  mergeGroupThreadParticipants,
  participantKey,
  queryFamilyDirectMessages,
  queryFamilyDmThreads,
  setCachedFamilyDmInbox,
  sortParticipantsByActivity,
} from '../../lib/familyDmClient';
import {
  DOODLE_HELPER_PARTICIPANT,
  doodleHelperParticipantKey,
  isDoodleHelperParticipant,
} from '../../lib/doodleHelperParticipant';
import { AIConversationService } from '../../lib/aiConversationService';
import { useOptionalDoodleCommandStore } from '../../app/state/useDoodleCommandStore';
import FamilyDmChat from './FamilyDmChat';
import FamilyNewMessagePicker from './FamilyNewMessagePicker';
import MessagesPaneCloseButton from './MessagesPaneCloseButton';
import DmParticipantAvatar from './DmParticipantAvatar';
import ConfirmDialog from '../ConfirmDialog';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
import { ACCENT_TEXT, ACCENT_CHIP_BORDER, ACCENT_SOFT_BG } from '../create/shared/createModalStyles';

const DOODLE_FALLBACK_PREVIEW = 'Your built-in helper';

function isWeakDoodlePreview(text) {
  const t = String(text || '').trim();
  return !t || t === DOODLE_FALLBACK_PREVIEW || t === 'No messages yet';
}

function previewFromDoodleMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const content = String(messages[i]?.content || '').replace(/\s+/g, ' ').trim();
    if (content && !isWeakDoodlePreview(content)) {
      return {
        preview: content.slice(0, 80),
        lastActivityAt: messages[i]?.createdAt || messages[i]?.timestamp || null,
      };
    }
  }
  return null;
}

function resolveContextMenuPoint(nativeEvent) {
  let x =
    nativeEvent?.clientX
    ?? nativeEvent?.pageX
    ?? nativeEvent?.x
    ?? nativeEvent?.nativeEvent?.clientX
    ?? nativeEvent?.nativeEvent?.pageX
    ?? nativeEvent?.nativeEvent?.x;
  let y =
    nativeEvent?.clientY
    ?? nativeEvent?.pageY
    ?? nativeEvent?.y
    ?? nativeEvent?.nativeEvent?.clientY
    ?? nativeEvent?.nativeEvent?.pageY
    ?? nativeEvent?.nativeEvent?.y;
  if ((x == null || y == null) && nativeEvent?.target?.getBoundingClientRect) {
    const rect = nativeEvent.target.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

export default function FamilyMessagesPane({
  familyId = null,
  viewerRole = 'parent',
  viewerChildId = null,
  currentUserId = null,
  children: familyChildren = [],
  active = false,
  placement = 'left',
  onClosePane = null,
  onOpenDoodle = null,
  doodleEnabled = true,
}) {
  const showPaneClose = placement === 'left' && typeof onClosePane === 'function';
  const cachedInbox = familyId ? getCachedFamilyDmInbox(familyId) : null;
  const [loading, setLoading] = useState(() => !cachedInbox);
  const [participants, setParticipants] = useState(() => cachedInbox?.participants || []);
  const [previewMap, setPreviewMap] = useState(
    () => (cachedInbox ? new Map(cachedInbox.previewEntries) : new Map()),
  );
  const [paneView, setPaneView] = useState('inbox');
  const [chatParticipant, setChatParticipant] = useState(null);
  const [familyMembersList, setFamilyMembersList] = useState(
    () => cachedInbox?.familyMembers || [],
  );
  const doodleStore = useOptionalDoodleCommandStore();
  const initialDoodleFromStore = previewFromDoodleMessages(doodleStore?.messages);
  const initialDoodlePreview = String(
    initialDoodleFromStore?.preview
    || cachedInbox?.doodlePreview
    || '',
  ).trim();
  const [doodlePreview, setDoodlePreview] = useState(() => initialDoodlePreview);
  const [doodleLastActivityAt, setDoodleLastActivityAt] = useState(
    () => initialDoodleFromStore?.lastActivityAt || cachedInbox?.doodleLastActivityAt || null,
  );
  // Only show the empty-state helper label after we know there is no real preview.
  const [doodlePreviewSettled, setDoodlePreviewSettled] = useState(
    () => !isWeakDoodlePreview(initialDoodlePreview),
  );
  const doodlePreviewRef = useRef(doodlePreview);
  const [dmMessages, setDmMessages] = useState([]);
  const [doodleConversationIds, setDoodleConversationIds] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [clearTarget, setClearTarget] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(null);
  const inboxReadyRef = useRef(Boolean(cachedInbox));
  const loadInFlightRef = useRef(false);
  const pendingInboxRefreshRef = useRef(false);
  const showDoodleHelper = Boolean(doodleEnabled && typeof onOpenDoodle === 'function');
  const canClearChats = viewerRole === 'parent';

  useEffect(() => {
    doodlePreviewRef.current = doodlePreview;
  }, [doodlePreview]);

  // Keep inbox preview in sync with the live Doodle pane (no helper ↔ message flicker).
  useEffect(() => {
    if (!showDoodleHelper) return;
    const fromStore = previewFromDoodleMessages(doodleStore?.messages);
    if (!fromStore) return;
    setDoodlePreview(fromStore.preview);
    if (fromStore.lastActivityAt) setDoodleLastActivityAt(fromStore.lastActivityAt);
    setDoodlePreviewSettled(true);
    if (familyId) {
      setCachedFamilyDmInbox(familyId, {
        doodlePreview: fromStore.preview,
        doodleLastActivityAt: fromStore.lastActivityAt || null,
      });
    }
  }, [doodleStore?.messages, familyId, showDoodleHelper]);

  const familyChildrenKey = useMemo(
    () => (familyChildren || [])
      .filter((c) => c?.archived !== true && c?.id != null)
      .map((c) => String(c.id))
      .sort()
      .join(','),
    [familyChildren]
  );

  const loadInbox = useCallback(async ({ silent = false } = {}) => {
    if (!familyId || !currentUserId) {
      setParticipants([]);
      setPreviewMap(new Map());
      setDmMessages([]);
      inboxReadyRef.current = false;
      return;
    }
    if (loadInFlightRef.current) {
      pendingInboxRefreshRef.current = true;
      return;
    }
    loadInFlightRef.current = true;
    const showLoadingUi = !silent && !inboxReadyRef.current;
    if (showLoadingUi) setLoading(true);
    try {
      // Run the family-members API call concurrently with the message/thread
      // queries — none of the DB queries depend on the members payload, so there
      // is no reason to wait for it first (this was an extra sequential round trip).
      const doodleListPromise = showDoodleHelper
        ? AIConversationService.listDoodleConversationsForClear(familyId, 20).catch(() => null)
        : Promise.resolve(null);
      const [familyResult, dmResult, assignmentsResult, threadsResult, doodleListed] = await Promise.all([
        getFamilyMembers(),
        queryFamilyDirectMessages(supabase, { familyId, limit: 300, ascending: false }),
        supabase
          .from('assignments')
          .select(ASSIGNMENT_SELECT)
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(300),
        queryFamilyDmThreads(supabase, { familyId, limit: 50 }),
        doodleListPromise,
      ]);

      const familyData = familyResult?.data;
      const members = Array.isArray(familyData?.members) ? familyData.members : [];
      const childrenList = (Array.isArray(familyChildren) && familyChildren.length > 0)
        ? familyChildren.filter((c) => c?.archived !== true)
        : (Array.isArray(familyData?.children) ? familyData.children : [])
          .filter((c) => c?.archived !== true)
          .map((c) => ({
            id: c.id,
            first_name: c.first_name || c.name,
            name: c.name || c.first_name,
            avatar: c.avatar || null,
            archived: c.archived,
          }));

      const built = buildFamilyDmParticipants({
        children: childrenList,
        members,
        currentUserId,
        viewerRole,
        viewerChildId,
      });

      const messages = !dmResult.error && Array.isArray(dmResult.data) ? dmResult.data : [];
      setDmMessages(messages);
      if (dmResult.error) {
        console.warn('[FamilyMessagesPane] previews unavailable:', dmResult.error.message);
      }
      const assignments = !assignmentsResult.error && Array.isArray(assignmentsResult.data)
        ? assignmentsResult.data
        : [];
      if (assignmentsResult.error) {
        console.warn('[FamilyMessagesPane] assignment previews unavailable:', assignmentsResult.error.message);
      }
      if (threadsResult.error) {
        console.warn('[FamilyMessagesPane] group threads unavailable:', threadsResult.error.message);
      }

      const withGroupThreads = mergeGroupThreadParticipants({
        directParticipants: built,
        threads: threadsResult.data,
        children: childrenList,
        members,
        viewerRole,
        viewerChildId,
        currentUserId,
      });

      setFamilyMembersList(members);

      const previews = buildPreviewMapFromUnified({
        directMessages: messages,
        assignments,
        participants: withGroupThreads,
        currentUserId,
        viewerRole,
        viewerChildId,
      });
      const sorted = sortParticipantsByActivity(withGroupThreads, previews);

      setParticipants(sorted);
      setPreviewMap(previews);

      let nextDoodlePreview = doodlePreviewRef.current;
      let nextDoodleActivity = doodleLastActivityAt;
      if (showDoodleHelper) {
        if (Array.isArray(doodleListed)) {
          setDoodleConversationIds(doodleListed.map((row) => row.id));
          const latest = doodleListed[0] || null;
          const incoming = String(latest?.preview || '').trim();
          if (incoming && !isWeakDoodlePreview(incoming)) {
            nextDoodlePreview = incoming;
            nextDoodleActivity = latest?.updatedAt || null;
            setDoodlePreview(incoming);
            setDoodleLastActivityAt(nextDoodleActivity);
          } else if (isWeakDoodlePreview(doodlePreviewRef.current)) {
            // Never had a real preview — settle on the helper label once (no loading flash).
            nextDoodlePreview = DOODLE_FALLBACK_PREVIEW;
            nextDoodleActivity = null;
            setDoodlePreview(DOODLE_FALLBACK_PREVIEW);
            setDoodleLastActivityAt(null);
          }
          // else: keep existing strong preview (store/cache) even if this refresh is empty/weak
          setDoodlePreviewSettled(true);
        }
        // doodleListed === null → fetch failed; keep whatever we already show
      }

      setCachedFamilyDmInbox(familyId, {
        participants: sorted,
        previewMap: previews,
        familyMembers: members,
        doodlePreview: nextDoodlePreview,
        doodleLastActivityAt: nextDoodleActivity,
      });
      inboxReadyRef.current = true;
      setChatParticipant((prev) => {
        if (!prev || isDoodleHelperParticipant(prev)) return prev;
        const key = participantKey(prev);
        const next = sorted.find((p) => participantKey(p) === key) || null;
        if (!next) return null;
        if (
          participantKey(prev) === participantKey(next)
          && prev.name === next.name
          && prev.type === next.type
          && prev.avatar === next.avatar
        ) {
          return prev;
        }
        return next;
      });
    } catch (error) {
      console.error('[FamilyMessagesPane] loadInbox exception:', error);
      if (!inboxReadyRef.current) {
        setParticipants([]);
        setPreviewMap(new Map());
      }
    } finally {
      if (showLoadingUi) setLoading(false);
      loadInFlightRef.current = false;
      if (pendingInboxRefreshRef.current) {
        pendingInboxRefreshRef.current = false;
        loadInbox({ silent: true });
      }
    }
  }, [currentUserId, familyChildrenKey, familyId, showDoodleHelper, viewerChildId, viewerRole]);

  // Re-hydrate if familyId arrives/changes after mount (e.g. session warm-up).
  useEffect(() => {
    if (!familyId) return;
    const cached = getCachedFamilyDmInbox(familyId);
    if (!cached) return;
    setParticipants(cached.participants || []);
    setPreviewMap(new Map(cached.previewEntries || []));
    setFamilyMembersList(cached.familyMembers || []);
    const cachedDoodle = String(cached.doodlePreview || '').trim();
    if (!isWeakDoodlePreview(cachedDoodle)) {
      setDoodlePreview(cachedDoodle);
      setDoodleLastActivityAt(cached.doodleLastActivityAt || null);
      setDoodlePreviewSettled(true);
    }
    inboxReadyRef.current = true;
    setLoading(false);
  }, [familyId]);

  useEffect(() => {
    if (!active) return;
    const hasCache = Boolean(familyId && getCachedFamilyDmInbox(familyId));
    loadInbox({ silent: inboxReadyRef.current || hasCache });
  }, [active, familyId, loadInbox]);

  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refresh = () => { loadInbox({ silent: true }); };
    const onDoodleCleared = () => {
      setDoodlePreview(DOODLE_FALLBACK_PREVIEW);
      setDoodleLastActivityAt(null);
      setDoodleConversationIds([]);
      setDoodlePreviewSettled(true);
      loadInbox({ silent: true });
    };
    window.addEventListener('childAssignmentsNeedRefresh', refresh);
    window.addEventListener('parentAssignmentsNeedRefresh', refresh);
    window.addEventListener('familyDirectMessagesUpdated', refresh);
    window.addEventListener('doodleConversationsCleared', onDoodleCleared);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', refresh);
      window.removeEventListener('parentAssignmentsNeedRefresh', refresh);
      window.removeEventListener('familyDirectMessagesUpdated', refresh);
      window.removeEventListener('doodleConversationsCleared', onDoodleCleared);
    };
  }, [active, loadInbox]);

  useEffect(() => {
    if (!active || !familyId) return undefined;
    const poll = setInterval(() => {
      loadInbox({ silent: true });
    }, 12000);
    return () => clearInterval(poll);
  }, [active, familyId, loadInbox]);

  const handleSelectParticipant = useCallback((participant) => {
    if (isDoodleHelperParticipant(participant)) {
      onOpenDoodle?.();
      return;
    }
    setChatParticipant(participant);
    setPaneView('chat');
  }, [onOpenDoodle]);

  const handleOpenNewMessage = useCallback(() => {
    setPaneView('picker');
  }, []);

  const handlePickerNext = useCallback(({ participants: selected, deliveryMode }) => {
    if (Array.isArray(selected) && selected.some(isDoodleHelperParticipant) && selected.length === 1) {
      onOpenDoodle?.();
      return;
    }
    const withoutDoodle = (Array.isArray(selected) ? selected : [])
      .filter((p) => !isDoodleHelperParticipant(p));
    const composite = buildCompositeParticipant(
      withoutDoodle,
      deliveryMode === 'separate' ? 'separate' : 'group',
    );
    if (!composite) return;
    setChatParticipant(composite);
    setPaneView('chat');
  }, [onOpenDoodle]);

  const handleBackFromPicker = useCallback(() => {
    setPaneView('inbox');
  }, []);

  const handleBackFromChat = useCallback(() => {
    setChatParticipant(null);
    setPaneView('inbox');
    loadInbox({ silent: true });
  }, [loadInbox]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const openThreadContextMenu = useCallback((participant, nativeEvent) => {
    if (Platform.OS !== 'web' || !canClearChats || !participant) return;
    nativeEvent?.preventDefault?.();
    nativeEvent?.stopPropagation?.();
    setContextMenu({
      participant,
      anchorPoint: resolveContextMenuPoint(nativeEvent),
    });
  }, [canClearChats]);

  const handleClearChatConfirm = useCallback(async () => {
    if (!clearTarget || !familyId || !canClearChats) return;
    setClearing(true);
    setClearError(null);
    try {
      if (isDoodleHelperParticipant(clearTarget)) {
        const { error } = await AIConversationService.clearDoodleConversations(familyId, {
          clearAll: true,
          conversationIds: doodleConversationIds,
        });
        if (error) throw error;
        setDoodlePreview(DOODLE_FALLBACK_PREVIEW);
        setDoodleLastActivityAt(null);
        setDoodleConversationIds([]);
        setDoodlePreviewSettled(true);
        if (familyId) {
          setCachedFamilyDmInbox(familyId, {
            doodlePreview: DOODLE_FALLBACK_PREVIEW,
            doodleLastActivityAt: null,
          });
        }
      } else {
        const ids = collectMessageIdsForParticipants(
          dmMessages,
          [clearTarget],
          currentUserId,
        );
        if (ids.length === 0) {
          setClearTarget(null);
          setClearing(false);
          await loadInbox({ silent: true });
          return;
        }
        const { error } = await clearFamilyDirectMessages({
          familyId,
          clearAll: false,
          messageIds: ids,
        });
        if (error) throw error;
      }
      setClearTarget(null);
      await loadInbox({ silent: true });
    } catch (err) {
      setClearError(err?.message || 'Could not clear chat.');
      setClearTarget(null);
    } finally {
      setClearing(false);
    }
  }, [
    canClearChats,
    clearTarget,
    currentUserId,
    dmMessages,
    doodleConversationIds,
    familyId,
    loadInbox,
  ]);

  const listRows = useMemo(() => {
    const rows = participants.map((participant) => {
      const key = participantKey(participant);
      const meta = previewMap.get(key) || {};
      return {
        participant,
        key,
        preview: meta.preview || '',
        lastActivityAt: meta.lastActivityAt,
      };
    });
    if (!showDoodleHelper) return rows;
    const stablePreview = !isWeakDoodlePreview(doodlePreview)
      ? doodlePreview
      : (doodlePreviewSettled ? DOODLE_FALLBACK_PREVIEW : '');
    return [
      {
        participant: DOODLE_HELPER_PARTICIPANT,
        key: doodleHelperParticipantKey(),
        preview: stablePreview,
        lastActivityAt: doodleLastActivityAt,
      },
      ...rows,
    ];
  }, [doodleLastActivityAt, doodlePreview, doodlePreviewSettled, participants, previewMap, showDoodleHelper]);

  if (paneView === 'picker') {
    return (
      <View style={[
        styles.container,
        styles.containerFlex,
        placement === 'left' ? styles.containerLeft : styles.containerRight,
      ]}>
        <FamilyNewMessagePicker
          participants={participants}
          showDoodleHelper={showDoodleHelper}
          onSelectDoodle={() => onOpenDoodle?.()}
          onBack={handleBackFromPicker}
          onNext={handlePickerNext}
        />
      </View>
    );
  }

  if (paneView === 'chat' && chatParticipant) {
    return (
      <View style={[
        styles.container,
        styles.containerFlex,
        placement === 'left' ? styles.containerLeft : styles.containerRight,
      ]}>
        <FamilyDmChat
          participant={chatParticipant}
          familyId={familyId}
          currentUserId={currentUserId}
          viewerRole={viewerRole}
          viewerChildId={viewerChildId}
          familyChildren={familyChildren}
          familyMembers={familyMembersList}
          onClosePane={showPaneClose ? onClosePane : null}
          onBack={handleBackFromChat}
          onGroupThreadCreated={(threadId) => {
            setChatParticipant((prev) => (
              prev?.type === 'group' && threadId
                ? { ...prev, threadId: String(threadId) }
                : prev
            ));
          }}
        />
      </View>
    );
  }

  return (
    <View style={[
      styles.container,
      styles.containerFlex,
      placement === 'left' ? styles.containerLeft : styles.containerRight,
    ]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        {showPaneClose ? <MessagesPaneCloseButton onPress={onClosePane} /> : null}
      </View>

      {loading && listRows.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={ACCENT_TEXT} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.newMessageRow}
            onPress={handleOpenNewMessage}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="New message"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={styles.newMessageIconWrap}>
              <SquarePen size={18} color={ACCENT_TEXT} />
            </View>
            <Text style={styles.newMessageLabel}>New message</Text>
          </TouchableOpacity>

          {listRows.length > 0 ? (
            <Text style={styles.sectionLabel}>Recent</Text>
          ) : null}

          {listRows.map(({ participant, key, preview, lastActivityAt }) => (
            <TouchableOpacity
              key={key}
              style={styles.threadRow}
              onPress={() => handleSelectParticipant(participant)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && {
                cursor: 'pointer',
                ...(canClearChats ? {
                  onContextMenu: (e) => openThreadContextMenu(participant, e),
                  onMouseDown: (e) => {
                    const button = e?.button ?? e?.nativeEvent?.button;
                    if (button !== 2) return;
                    openThreadContextMenu(participant, e?.nativeEvent || e);
                  },
                } : {}),
              })}
            >
              <DmParticipantAvatar
                participant={participant}
                familyChildren={familyChildren}
                size={48}
                style={styles.threadAvatar}
              />
              <View style={styles.threadBody}>
                <View style={styles.threadTopRow}>
                  <Text style={styles.threadName} numberOfLines={1}>{participant.name}</Text>
                  {lastActivityAt ? (
                    <Text style={styles.threadTime}>{formatDmRelativeTime(lastActivityAt)}</Text>
                  ) : null}
                </View>
                {preview ? (
                  <Text style={styles.threadPreview} numberOfLines={1}>{preview}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {canClearChats && contextMenu?.participant ? (
        <Dropdown
          visible
          triggerRef={null}
          anchorPoint={contextMenu.anchorPoint}
          onClose={closeContextMenu}
          placement="bottom-start"
          width={180}
          variant="context"
        >
          <DropdownItem
            icon={Trash2}
            label="Clear chat"
            danger
            onPress={() => {
              const target = contextMenu.participant;
              closeContextMenu();
              setClearError(null);
              setClearTarget(target);
            }}
          />
        </Dropdown>
      ) : null}

      <ConfirmDialog
        visible={Boolean(clearTarget)}
        title="Clear this chat?"
        message={
          clearTarget
            ? `This permanently removes your conversation with ${clearTarget.name || 'this contact'}. This cannot be undone.`
            : ''
        }
        confirmLabel={clearing ? 'Clearing…' : 'Clear chat'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!clearing) setClearTarget(null);
        }}
        onConfirm={() => {
          if (!clearing) handleClearChatConfirm();
        }}
      />

      <ConfirmDialog
        visible={Boolean(clearError)}
        title="Could not clear chat"
        message={clearError || ''}
        confirmLabel="OK"
        hideCancel
        onCancel={() => setClearError(null)}
        onConfirm={() => setClearError(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  containerFlex: {
    flex: 1,
    minHeight: 0,
  },
  containerLeft: {},
  containerRight: {
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 24,
  },
  newMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  newMessageIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ACCENT_SOFT_BG,
    borderWidth: 1,
    borderColor: ACCENT_CHIP_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newMessageLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  threadAvatar: {
    flexShrink: 0,
  },
  threadBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  threadTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  threadName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  threadTime: {
    fontSize: 12,
    color: '#94A3B8',
  },
  threadPreview: {
    fontSize: 13,
    color: '#64748B',
  },
});
