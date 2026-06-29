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
import { SquarePen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFamilyMembers } from '../../lib/apiClient';
import {
  ASSIGNMENT_SELECT,
  buildFamilyDmParticipants,
  buildCompositeParticipant,
  buildPreviewMapFromUnified,
  formatDmRelativeTime,
  mergeGroupThreadParticipants,
  participantKey,
  queryFamilyDirectMessages,
  queryFamilyDmThreads,
  sortParticipantsByActivity,
} from '../../lib/familyDmClient';
import FamilyDmChat from './FamilyDmChat';
import FamilyNewMessagePicker from './FamilyNewMessagePicker';
import MessagesPaneCloseButton from './MessagesPaneCloseButton';
import DmParticipantAvatar from './DmParticipantAvatar';
import { ACCENT_TEXT, ACCENT_CHIP_BORDER, ACCENT_SOFT_BG } from '../create/shared/createModalStyles';

export default function FamilyMessagesPane({
  familyId = null,
  viewerRole = 'parent',
  viewerChildId = null,
  currentUserId = null,
  children: familyChildren = [],
  active = false,
  placement = 'left',
  childInviteSummaries = null,
  onClosePane = null,
}) {
  const showPaneClose = placement === 'left' && typeof onClosePane === 'function';
  const [loading, setLoading] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [previewMap, setPreviewMap] = useState(new Map());
  const [paneView, setPaneView] = useState('inbox');
  const [chatParticipant, setChatParticipant] = useState(null);
  const [familyMembersList, setFamilyMembersList] = useState([]);
  const inboxReadyRef = useRef(false);
  const loadInFlightRef = useRef(false);

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
      inboxReadyRef.current = false;
      return;
    }
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    const showLoadingUi = !silent && !inboxReadyRef.current;
    if (showLoadingUi) setLoading(true);
    try {
      // Run the family-members API call concurrently with the message/thread
      // queries — none of the DB queries depend on the members payload, so there
      // is no reason to wait for it first (this was an extra sequential round trip).
      const [familyResult, dmResult, assignmentsResult, threadsResult] = await Promise.all([
        getFamilyMembers(),
        queryFamilyDirectMessages(supabase, { familyId, limit: 300, ascending: false }),
        supabase
          .from('assignments')
          .select(ASSIGNMENT_SELECT)
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(300),
        queryFamilyDmThreads(supabase, { familyId, limit: 50 }),
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
      inboxReadyRef.current = true;
      setChatParticipant((prev) => {
        if (!prev) return null;
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
    }
  }, [currentUserId, familyChildrenKey, familyId, viewerChildId, viewerRole]);

  useEffect(() => {
    if (!active) return;
    loadInbox({ silent: inboxReadyRef.current });
  }, [active, loadInbox]);

  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refresh = () => { loadInbox({ silent: true }); };
    window.addEventListener('childAssignmentsNeedRefresh', refresh);
    window.addEventListener('parentAssignmentsNeedRefresh', refresh);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', refresh);
      window.removeEventListener('parentAssignmentsNeedRefresh', refresh);
    };
  }, [active, loadInbox]);

  const handleSelectParticipant = useCallback((participant) => {
    setChatParticipant(participant);
    setPaneView('chat');
  }, []);

  const handleOpenNewMessage = useCallback(() => {
    setPaneView('picker');
  }, []);

  const handlePickerNext = useCallback(({ participants: selected, deliveryMode }) => {
    const composite = buildCompositeParticipant(
      selected,
      deliveryMode === 'separate' ? 'separate' : 'group',
    );
    if (!composite) return;
    setChatParticipant(composite);
    setPaneView('chat');
  }, []);

  const handleBackFromPicker = useCallback(() => {
    setPaneView('inbox');
  }, []);

  const handleBackFromChat = useCallback(() => {
    setChatParticipant(null);
    setPaneView('inbox');
    loadInbox({ silent: true });
  }, [loadInbox]);

  const listRows = useMemo(
    () => participants.map((participant) => {
      const key = participantKey(participant);
      const meta = previewMap.get(key) || {};
      return {
        participant,
        key,
        preview: meta.preview || '',
        lastActivityAt: meta.lastActivityAt,
      };
    }),
    [participants, previewMap]
  );

  if (paneView === 'picker') {
    return (
      <View style={[
        styles.container,
        styles.containerFlex,
        placement === 'left' ? styles.containerLeft : styles.containerRight,
      ]}>
        <FamilyNewMessagePicker
          participants={participants}
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
          childInviteSummaries={childInviteSummaries}
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
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
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
