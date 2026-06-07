import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SquarePen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFamilyMembers } from '../../lib/apiClient';
import { resolveBundledAvatarSource } from '../../assets/imageAssetMap';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import {
  ASSIGNMENT_SELECT,
  buildFamilyDmParticipants,
  buildPreviewMapFromUnified,
  formatDmRelativeTime,
  participantKey,
  sortParticipantsByActivity,
} from '../../lib/familyDmClient';
import FamilyDmChat from './FamilyDmChat';
import FamilyNewMessagePicker from './FamilyNewMessagePicker';
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

  const loadInbox = useCallback(async () => {
    if (!familyId || !currentUserId) {
      setParticipants([]);
      setPreviewMap(new Map());
      return;
    }
    setLoading(true);
    try {
      const { data: familyData } = await getFamilyMembers();
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

      const [dmResult, assignmentsResult] = await Promise.all([
        supabase
          .from('family_direct_messages')
          .select('id, sender_user_id, recipient_child_id, recipient_user_id, body, created_at, read_at')
          .eq('family_id', familyId)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('assignments')
          .select(ASSIGNMENT_SELECT)
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(300),
      ]);

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

      const previews = buildPreviewMapFromUnified({
        directMessages: messages,
        assignments,
        participants: built,
        currentUserId,
        viewerRole,
        viewerChildId,
      });
      const sorted = sortParticipantsByActivity(built, previews);

      setParticipants(sorted);
      setPreviewMap(previews);
      setChatParticipant((prev) => {
        if (!prev) return null;
        const key = participantKey(prev);
        return sorted.find((p) => participantKey(p) === key) || null;
      });
    } catch (error) {
      console.error('[FamilyMessagesPane] loadInbox exception:', error);
      setParticipants([]);
      setPreviewMap(new Map());
    } finally {
      setLoading(false);
    }
  }, [currentUserId, familyChildren, familyId, viewerChildId, viewerRole]);

  useEffect(() => {
    if (!active) return;
    loadInbox();
  }, [active, loadInbox]);

  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refresh = () => { loadInbox(); };
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

  const handlePickerNext = useCallback((participant) => {
    setChatParticipant(participant);
    setPaneView('chat');
  }, []);

  const handleBackFromChat = useCallback(() => {
    setChatParticipant(null);
    setPaneView('inbox');
    loadInbox();
  }, [loadInbox]);

  const handleBackFromPicker = useCallback(() => {
    setPaneView('inbox');
  }, []);

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
          onClosePane={showPaneClose ? onClosePane : null}
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
          childInviteSummaries={childInviteSummaries}
          onClosePane={showPaneClose ? onClosePane : null}
          onBack={handleBackFromChat}
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

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color="#6366F1" />
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
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={styles.newMessageIconWrap}>
              <SquarePen size={18} color="rgba(99, 102, 241, 1)" />
            </View>
            <Text style={styles.newMessageLabel}>New message</Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>Messages</Text>

          {listRows.map(({ participant, key, preview, lastActivityAt }) => (
            <TouchableOpacity
              key={key}
              style={styles.threadRow}
              onPress={() => handleSelectParticipant(participant)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Image
                source={avatarSourceForParticipant(participant)}
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
    borderRadius: 0,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.5)',
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
