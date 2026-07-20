import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import { ArrowLeft, ArrowRight, Check, Search } from 'lucide-react';
import { resolveBundledAvatarSource } from '../../assets/imageAssetMap';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import { participantKey } from '../../lib/familyDmClient';
import { DOODLE_HELPER_PARTICIPANT } from '../../lib/doodleHelperParticipant';
import DmParticipantAvatar from './DmParticipantAvatar';
import {
  ACCENT,
  ACCENT_TEXT,
  ACCENT_CHIP_BORDER,
  ACCENT_CHIP_BG,
  ACCENT_LIST_ACTIVE_BG,
} from '../create/shared/createModalStyles';

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

export default function FamilyNewMessagePicker({
  participants = [],
  showDoodleHelper = false,
  onSelectDoodle = null,
  onBack,
  onNext,
}) {
  const [searchText, setSearchText] = useState('');
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [deliveryMode, setDeliveryMode] = useState('group');

  const filtered = useMemo(() => {
    const query = String(searchText || '').trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((p) => String(p.name || '').toLowerCase().includes(query));
  }, [participants, searchText]);

  const selectedParticipants = useMemo(
    () => participants.filter((p) => selectedKeys.has(participantKey(p))),
    [participants, selectedKeys],
  );

  const canProceed = selectedParticipants.length > 0;
  const showDeliveryMode = selectedParticipants.length > 1;

  const toggleParticipant = (participant) => {
    const key = participantKey(participant);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleNext = () => {
    if (!canProceed) return;
    onNext?.({
      participants: selectedParticipants,
      deliveryMode: showDeliveryMode ? deliveryMode : 'single',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerSide}
          onPress={onBack}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <ArrowLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New message</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerSide}
            onPress={handleNext}
            disabled={!canProceed}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' && { cursor: canProceed ? 'pointer' : 'default' })}
          >
            <View style={[
              styles.nextButton,
              !canProceed && styles.nextButtonDisabled,
            ]}
            >
              <Text style={[
                styles.nextButtonText,
                !canProceed && styles.nextButtonTextDisabled,
              ]}
              >
                Next
              </Text>
              <ArrowRight
                size={16}
                color={canProceed ? '#FFFFFF' : '#94A3B8'}
                strokeWidth={2.5}
              />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color="#94A3B8" />
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search by name"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
        />
      </View>

      {showDeliveryMode ? (
        <View style={styles.deliveryModeWrap}>
          <Text style={styles.deliveryModeLabel}>Send as</Text>
          <View style={styles.deliveryModeRow}>
            <TouchableOpacity
              style={[
                styles.deliveryModeChip,
                deliveryMode === 'group' && styles.deliveryModeChipActive,
              ]}
              onPress={() => setDeliveryMode('group')}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={[
                styles.deliveryModeChipText,
                deliveryMode === 'group' && styles.deliveryModeChipTextActive,
              ]}
              >
                Group conversation
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.deliveryModeChip,
                deliveryMode === 'separate' && styles.deliveryModeChipActive,
              ]}
              onPress={() => setDeliveryMode('separate')}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={[
                styles.deliveryModeChipText,
                deliveryMode === 'separate' && styles.deliveryModeChipTextActive,
              ]}
              >
                Separate chats
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {showDoodleHelper
          && typeof onSelectDoodle === 'function'
          && (() => {
            const q = String(searchText || '').trim().toLowerCase();
            return !q || 'doodle'.includes(q) || q.includes('doodle') || q.includes('helper');
          })()
          ? (
          <>
            <Text style={styles.sectionLabel}>Helpers</Text>
            <TouchableOpacity
              style={styles.row}
              onPress={() => onSelectDoodle()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Message Doodle"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <DmParticipantAvatar
                participant={DOODLE_HELPER_PARTICIPANT}
                size={48}
                style={styles.avatar}
              />
              <View style={styles.helperText}>
                <Text style={styles.name} numberOfLines={1}>Doodle</Text>
                <Text style={styles.helperSubtitle} numberOfLines={1}>Built-in helper</Text>
              </View>
            </TouchableOpacity>
          </>
          ) : null}

        <Text style={styles.sectionLabel}>
          {showDeliveryMode ? `Selected (${selectedParticipants.length})` : 'Family'}
        </Text>
        {filtered.map((participant) => {
          const key = participantKey(participant);
          const selected = selectedKeys.has(key);
          return (
            <TouchableOpacity
              key={key}
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => toggleParticipant(participant)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Image
                source={avatarSourceForParticipant(participant)}
                style={styles.avatar}
              />
              <Text style={styles.name} numberOfLines={1}>{participant.name}</Text>
              <View style={[styles.checkWrap, selected && styles.checkWrapSelected]}>
                {selected ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerSide: {
    width: 72,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'flex-end',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  nextButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  nextButtonTextDisabled: {
    color: '#94A3B8',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: ACCENT_CHIP_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  deliveryModeWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  deliveryModeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  deliveryModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  deliveryModeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  deliveryModeChipActive: {
    borderColor: ACCENT_CHIP_BORDER,
    backgroundColor: ACCENT_CHIP_BG,
  },
  deliveryModeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  deliveryModeChipTextActive: {
    color: ACCENT_TEXT,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowSelected: {
    backgroundColor: ACCENT_LIST_ACTIVE_BG,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  helperText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  helperSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  checkWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkWrapSelected: {
    borderColor: ACCENT_CHIP_BORDER,
    backgroundColor: ACCENT_TEXT,
  },
});
