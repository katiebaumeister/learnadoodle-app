import React from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';
import { Sparkles } from 'lucide-react';
import { LEARNADOODLE_ICON_ASSET, resolveBundledAvatarSource } from '../../assets/imageAssetMap';
import { isDoodleHelperParticipant } from '../../lib/doodleHelperParticipant';
import ChildAvatarCluster, { sourceForChild } from '../ui/ChildAvatarCluster';
import { ACCENT_SOFT_BG, ACCENT_TEXT } from '../create/shared/createModalStyles';

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
  if (isDoodleHelperParticipant(participant)) {
    const iconSize = Math.max(18, Math.round(size * 0.48));
    return (
      <View
        style={[
          styles.doodleAvatar,
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
      >
        {LEARNADOODLE_ICON_ASSET ? (
          <Image
            source={LEARNADOODLE_ICON_ASSET}
            style={{ width: size * 0.72, height: size * 0.72, borderRadius: size * 0.2 }}
            resizeMode="contain"
          />
        ) : (
          <Sparkles size={iconSize} color={ACCENT_TEXT} strokeWidth={2} />
        )}
      </View>
    );
  }

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
  doodleAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_SOFT_BG,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && { flexShrink: 0 }),
  },
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
