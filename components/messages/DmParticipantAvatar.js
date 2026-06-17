import React from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';
import { resolveBundledAvatarSource } from '../../assets/imageAssetMap';
import ChildAvatarCluster, { sourceForChild } from '../ui/ChildAvatarCluster';

export function childIdsFromDmParticipant(participant) {
  if (!participant) return [];
  if (participant.type === 'group' || participant.type === 'multicast') {
    return (participant.members || [])
      .filter((member) => member?.type === 'child' && member?.id != null)
      .map((member) => String(member.id));
  }
  if (participant.type === 'child' && participant.id != null) {
    return [String(participant.id)];
  }
  return [];
}

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

function clusterChipSize(outerSize, count) {
  if (count <= 2) return Math.max(18, Math.round(outerSize * 0.52));
  return Math.max(16, Math.round(outerSize * 0.4));
}

/** Circular avatar — clustered prof art for group chats with 2+ children. */
export default function DmParticipantAvatar({
  participant,
  familyChildren = [],
  size = 48,
  style,
}) {
  const childIds = childIdsFromDmParticipant(participant);
  const useCluster =
    (participant?.type === 'group' || participant?.type === 'multicast')
    && childIds.length >= 2;

  if (useCluster) {
    const chipSize = clusterChipSize(size, childIds.length);
    const overlap = Math.round(-chipSize * 0.38);
    return (
      <View
        style={[
          styles.clusterWrap,
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
      >
        <ChildAvatarCluster
          childIds={childIds}
          familyChildren={familyChildren}
          size={chipSize}
          overlap={overlap}
        />
      </View>
    );
  }

  return (
    <Image
      source={avatarSourceForParticipant(participant)}
      style={[
        styles.singleAvatar,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  clusterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      flexShrink: 0,
    }),
  },
  singleAvatar: {
    backgroundColor: '#F1F5F9',
    ...(Platform.OS === 'web' && {
      objectFit: 'cover',
    }),
  },
});
