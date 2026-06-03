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
import { ArrowLeft, Search } from 'lucide-react';
import { resolveBundledAvatarSource } from '../../assets/imageAssetMap';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import { participantKey } from '../../lib/familyDmClient';

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
  onBack,
  onNext,
}) {
  const [searchText, setSearchText] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);

  const filtered = useMemo(() => {
    const query = String(searchText || '').trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((p) => String(p.name || '').toLowerCase().includes(query));
  }, [participants, searchText]);

  const selectedParticipant = useMemo(
    () => participants.find((p) => participantKey(p) === selectedKey) || null,
    [participants, selectedKey]
  );

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
        <TouchableOpacity
          style={styles.headerSide}
          onPress={() => selectedParticipant && onNext?.(selectedParticipant)}
          disabled={!selectedParticipant}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' && { cursor: selectedParticipant ? 'pointer' : 'default' })}
        >
          <View style={[
            styles.nextButton,
            !selectedParticipant && styles.nextButtonDisabled,
          ]}
          >
            <Text style={[
              styles.nextButtonText,
              !selectedParticipant && styles.nextButtonTextDisabled,
            ]}
            >
              Next
            </Text>
          </View>
        </TouchableOpacity>
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Family</Text>
        {filtered.map((participant) => {
          const key = participantKey(participant);
          const selected = key === selectedKey;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => setSelectedKey(key)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Image
                source={avatarSourceForParticipant(participant)}
                style={styles.avatar}
              />
              <Text style={styles.name} numberOfLines={1}>{participant.name}</Text>
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  nextButton: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(99, 102, 241, 1)',
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
    borderColor: '#6366F1',
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
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
});
