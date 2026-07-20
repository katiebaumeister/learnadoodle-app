import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getFamilyMembers } from '../../lib/apiClient';
import {
  buildFamilyDmParticipants,
  buildPreviewMapFromUnified,
  clearFamilyDirectMessages,
  collectMessageIdsForParticipants,
  mergeGroupThreadParticipants,
  messageMatchesParticipant,
  participantKey,
  queryFamilyDirectMessages,
  queryFamilyDmThreads,
  sortParticipantsByActivity,
} from '../../lib/familyDmClient';
import { AIConversationService } from '../../lib/aiConversationService';
import { DOODLE_HELPER_PARTICIPANT } from '../../lib/doodleHelperParticipant';
import ConfirmDialog from '../ConfirmDialog';
import DmParticipantAvatar from '../messages/DmParticipantAvatar';

function normalizeChildrenList(familyChildren = [], apiChildren = []) {
  if (Array.isArray(familyChildren) && familyChildren.length > 0) {
    return familyChildren.filter((c) => c?.archived !== true);
  }
  return (Array.isArray(apiChildren) ? apiChildren : [])
    .filter((c) => c?.archived !== true)
    .map((c) => ({
      id: c.id,
      first_name: c.first_name || c.name,
      name: c.name || c.first_name,
      avatar: c.avatar || null,
      archived: c.archived,
    }));
}

function formatMessageCount(count) {
  const n = Math.max(0, Number(count) || 0);
  return n === 1 ? '1 message' : `${n} messages`;
}

function countMessagesForParticipant(messages, participant, currentUserId) {
  if (!participant) return 0;
  return (Array.isArray(messages) ? messages : []).filter((m) =>
    messageMatchesParticipant(m, participant, currentUserId)
  ).length;
}

function chainsFromParticipants(participants = [], messages = [], currentUserId = null) {
  return (Array.isArray(participants) ? participants : []).map((p) => ({
    key: participantKey(p),
    participant: p,
    title: p.name || (p.type === 'group' ? 'Group chat' : 'Chat'),
    messageCount: countMessagesForParticipant(messages, p, currentUserId),
  }));
}

function ChatCheckbox({ checked, onToggle, disabled = false }) {
  return (
    <TouchableOpacity
      style={[styles.checkbox, checked && styles.checkboxChecked, disabled && styles.checkboxDisabled]}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
    >
      {checked ? <Text style={styles.checkmark}>✓</Text> : null}
    </TouchableOpacity>
  );
}

function ChainRow({
  title,
  messageCount = 0,
  participant = null,
  familyChildren = [],
  checked,
  onToggle,
  disabled = false,
}) {
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.75}
      {...(Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' })}
    >
      {participant ? (
        <DmParticipantAvatar
          participant={participant}
          familyChildren={familyChildren}
          size={44}
          style={styles.rowAvatar}
        />
      ) : null}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
      </View>
      <Text style={styles.rowCount}>{formatMessageCount(messageCount)}</Text>
      <ChatCheckbox checked={checked} onToggle={onToggle} disabled={disabled} />
    </TouchableOpacity>
  );
}

/**
 * Household Settings → Messages: select message streams and/or Doodle to clear.
 * List comes from backend (DMs + group threads), not app inbox cache.
 */
export default function SettingsChatsPanel({
  familyId = null,
  currentUserId = null,
  children: familyChildren = [],
  userRole = 'parent',
  readOnly = false,
}) {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState(null);
  const [messageChains, setMessageChains] = useState([]);
  const [avatarChildren, setAvatarChildren] = useState(() => normalizeChildrenList(familyChildren));
  const [allDmMessages, setAllDmMessages] = useState([]);
  const [doodleConversationIds, setDoodleConversationIds] = useState([]);
  const [doodleMessageCount, setDoodleMessageCount] = useState(0);
  const [selectedMessageKeys, setSelectedMessageKeys] = useState(() => new Set());
  const [doodleSelected, setDoodleSelected] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const loadIdRef = useRef(0);

  const canEdit = !readOnly && userRole === 'parent' && Boolean(familyId);

  const load = useCallback(async ({ resetSelection = false } = {}) => {
    const loadId = ++loadIdRef.current;

    if (!familyId || !currentUserId) {
      setMessageChains([]);
      setAvatarChildren(normalizeChildrenList(familyChildren));
      setAllDmMessages([]);
      setDoodleConversationIds([]);
      setDoodleMessageCount(0);
      if (resetSelection) {
        setDoodleSelected(false);
        setSelectedMessageKeys(new Set());
      }
      return;
    }

    setError(null);
    try {
      const [familyResult, dmResult, threadsResult, doodleList] = await Promise.all([
        getFamilyMembers(),
        queryFamilyDirectMessages(supabase, { familyId, limit: 500, ascending: false }),
        queryFamilyDmThreads(supabase, { familyId, limit: 50 }),
        AIConversationService.listDoodleConversationsForClear(familyId, 40),
      ]);

      if (loadId !== loadIdRef.current) return;

      const familyData = familyResult?.data;
      const members = Array.isArray(familyData?.members) ? familyData.members : [];
      const childrenList = normalizeChildrenList(familyChildren, familyData?.children);

      const built = buildFamilyDmParticipants({
        children: childrenList,
        members,
        currentUserId,
        viewerRole: 'parent',
        viewerChildId: null,
      });
      const withGroups = mergeGroupThreadParticipants({
        directParticipants: built,
        threads: threadsResult.data,
        children: childrenList,
        members,
        viewerRole: 'parent',
        viewerChildId: null,
        currentUserId,
      });
      const messages = !dmResult.error && Array.isArray(dmResult.data) ? dmResult.data : [];
      const previews = buildPreviewMapFromUnified({
        directMessages: messages,
        assignments: [],
        participants: withGroups,
        currentUserId,
        viewerRole: 'parent',
        viewerChildId: null,
      });
      // Full list from backend in one write (children + group threads together).
      const sorted = sortParticipantsByActivity(withGroups, previews);

      setAllDmMessages(messages);
      setMessageChains(chainsFromParticipants(sorted, messages, currentUserId));
      setAvatarChildren(childrenList);
      const doodleRows = Array.isArray(doodleList) ? doodleList : [];
      setDoodleConversationIds(
        doodleRows.map((row) => String(row?.id || '')).filter(Boolean),
      );
      setDoodleMessageCount(
        doodleRows.reduce((sum, row) => sum + (Number(row?.messageCount) || 0), 0),
      );
      if (resetSelection) {
        setSelectedMessageKeys(new Set());
        setDoodleSelected(false);
      }
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      console.warn('[SettingsChatsPanel] load failed:', err);
      setError(err?.message || 'Could not load chats.');
    }
  }, [currentUserId, familyChildren, familyId]);

  useEffect(() => {
    setAvatarChildren(normalizeChildrenList(familyChildren));
    load({ resetSelection: false });
  }, [load, familyChildren]);

  const totalChains = messageChains.length + 1;
  const selectedCount = selectedMessageKeys.size + (doodleSelected ? 1 : 0);

  const toggleMessageKey = (key) => {
    setSelectedMessageKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runClear = async () => {
    if (!canEdit || !selectedCount) return;
    setClearing(true);
    setError(null);
    try {
      const clearAllMessages = messageChains.length > 0
        && messageChains.every((c) => selectedMessageKeys.has(c.key));

      if (selectedMessageKeys.size > 0) {
        if (clearAllMessages) {
          const { error: dmError } = await clearFamilyDirectMessages({
            familyId,
            clearAll: true,
          });
          if (dmError) throw dmError;
        } else {
          const selectedParticipants = messageChains
            .filter((c) => selectedMessageKeys.has(c.key))
            .map((c) => c.participant);
          const ids = collectMessageIdsForParticipants(
            allDmMessages,
            selectedParticipants,
            currentUserId,
          );
          const { error: dmError } = await clearFamilyDirectMessages({
            familyId,
            clearAll: false,
            messageIds: ids,
          });
          if (dmError) throw dmError;
        }
      }

      if (doodleSelected) {
        const { error: doodleError } = await AIConversationService.clearDoodleConversations(
          familyId,
          {
            clearAll: true,
            conversationIds: doodleConversationIds,
          },
        );
        if (doodleError) throw doodleError;
      }

      setConfirmVisible(false);
      await load({ resetSelection: true });
    } catch (err) {
      setError(err?.message || 'Could not clear selected chats.');
      setConfirmVisible(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Messages</Text>

      {!canEdit ? (
        <Text style={styles.readonlyNote}>Only parents can clear household chats.</Text>
      ) : null}

      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[
            styles.clearBtn,
            (!canEdit || !selectedCount || clearing) && styles.clearBtnDisabled,
          ]}
          onPress={() => setConfirmVisible(true)}
          disabled={!canEdit || !selectedCount || clearing}
          {...(Platform.OS === 'web' && { cursor: canEdit && selectedCount ? 'pointer' : 'default' })}
        >
          <Text style={styles.clearBtnText}>
            {clearing ? 'Clearing…' : `Clear selected${selectedCount ? ` (${selectedCount})` : ''}`}
          </Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.list}>
          <View style={styles.divider} />
          {totalChains === 0 ? (
            <Text style={styles.empty}>No chats to clear.</Text>
          ) : (
            <>
              {messageChains.map((chain) => (
                <ChainRow
                  key={`msg:${chain.key}`}
                  title={chain.title}
                  messageCount={chain.messageCount}
                  participant={chain.participant}
                  familyChildren={avatarChildren}
                  checked={selectedMessageKeys.has(chain.key)}
                  onToggle={() => canEdit && toggleMessageKey(chain.key)}
                  disabled={!canEdit}
                />
              ))}
              <ChainRow
                key="doodle"
                title="Doodle"
                messageCount={doodleMessageCount}
                participant={DOODLE_HELPER_PARTICIPANT}
                familyChildren={avatarChildren}
                checked={doodleSelected}
                onToggle={() => canEdit && setDoodleSelected((prev) => !prev)}
                disabled={!canEdit}
              />
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmVisible}
        title="Clear selected chats?"
        message={`This permanently removes ${selectedCount} selected conversation${selectedCount === 1 ? '' : 's'}. This cannot be undone.`}
        confirmLabel="Clear chats"
        cancelLabel="Cancel"
        destructive
        onCancel={() => !clearing && setConfirmVisible(false)}
        onConfirm={runClear}
      />
    </View>
  );
}

const FONT = '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  readonlyNote: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 12,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginBottom: 16,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  clearBtnDisabled: {
    opacity: 0.4,
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  errorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 10,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  list: {
    gap: 0,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 4,
  },
  empty: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    paddingVertical: 12,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  rowDisabled: {
    opacity: 0.7,
  },
  rowAvatar: {
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  rowCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    marginRight: 4,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    borderColor: '#0F172A',
    backgroundColor: '#0F172A',
  },
  checkboxDisabled: {
    opacity: 0.5,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
});
