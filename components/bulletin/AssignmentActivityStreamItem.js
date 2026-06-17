import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import { formatStreamTimestamp, displayNameForUser } from '../../lib/services/bulletinClient';
import { resolveBundledAvatarSource, LEARNADOODLE_ICON_ASSET } from '../../assets/imageAssetMap';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import { getChildColorFromAvatar } from '../../utils/avatarColors';

const AVATAR_RING_SIZE = 36;
const PARENT_AVATAR_BG = '#F3E8FF';

function avatarSourceForUserId(userId) {
  const raw = String(userId || '');
  if (!raw) return resolveBundledAvatarSource('prof1');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash + raw.charCodeAt(i)) % 10;
  }
  return resolveBundledAvatarSource(`prof${hash + 1}`);
}

function resolveActivityAuthor(item, children = [], profileMap = new Map()) {
  const role = String(item?.actorRole || 'system').toLowerCase();
  if (role === 'system') {
    return {
      name: 'Learnadoodle',
      isLearnadoodle: true,
      avatar: LEARNADOODLE_ICON_ASSET,
      backgroundColor: PARENT_AVATAR_BG,
    };
  }
  if (role === 'child') {
    const child = (children || []).find((c) => String(c?.id) === String(item?.childId));
    return {
      name: item?.childFirstName || child?.first_name || child?.name || 'Student',
      isLearnadoodle: false,
      avatar: child ? sourceForChild(child) : resolveBundledAvatarSource('prof1'),
      backgroundColor: child
        ? getChildColorFromAvatar(child.avatar_key || child.avatar_url || child.avatar)
        : PARENT_AVATAR_BG,
    };
  }
  return {
    name: displayNameForUser(profileMap, item?.actorUserId) || 'Parent',
    isLearnadoodle: false,
    avatar: avatarSourceForUserId(item?.actorUserId),
    backgroundColor: PARENT_AVATAR_BG,
  };
}

function StreamAuthorAvatar({ source, backgroundColor, isLearnadoodle = false }) {
  const imageSize = 32;
  return (
    <View
      style={[
        styles.avatarRing,
        { backgroundColor, width: AVATAR_RING_SIZE, height: AVATAR_RING_SIZE },
      ]}
    >
      <Image
        source={source}
        style={[
          styles.avatarImage,
          {
            width: imageSize,
            height: imageSize,
            ...(isLearnadoodle && { transform: [{ scale: 1.08 }] }),
            ...(Platform.OS === 'web' && { objectFit: isLearnadoodle ? 'contain' : 'cover' }),
          },
        ]}
        resizeMode={isLearnadoodle ? 'contain' : 'cover'}
      />
    </View>
  );
}

export default function AssignmentActivityStreamItem({
  item,
  children = [],
  profileMap = new Map(),
  onPress = null,
}) {
  const author = resolveActivityAuthor(item, children, profileMap);
  const clickable = Boolean(onPress && item?.assignmentId);
  const BubbleWrap = clickable ? TouchableOpacity : View;

  return (
    <View style={styles.wrap}>
      <Text style={styles.timeDivider}>{formatStreamTimestamp(item.createdAt)}</Text>
      <View style={styles.row}>
        <StreamAuthorAvatar
          source={author.avatar}
          backgroundColor={author.backgroundColor}
          isLearnadoodle={author.isLearnadoodle}
        />
        <View style={styles.content}>
          <Text style={styles.senderLabel}>{author.name}</Text>
          <BubbleWrap
            style={[styles.bubble, clickable && styles.bubbleClickable]}
            onPress={clickable ? () => onPress(item) : undefined}
            accessibilityRole={clickable ? 'button' : undefined}
            accessibilityLabel={clickable ? `Open assignment: ${item.summary}` : undefined}
            activeOpacity={0.85}
            {...(clickable && Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.summary}>{item.summary}</Text>
            {clickable ? (
              <Text style={styles.actionHint}>View assignment</Text>
            ) : null}
          </BubbleWrap>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 2,
    marginBottom: 6,
  },
  timeDivider: {
    alignSelf: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginVertical: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatarRing: {
    borderRadius: AVATAR_RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImage: {
    ...(Platform.OS === 'web' && { objectFit: 'contain' }),
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  senderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 6,
  },
  bubbleClickable: {
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.12s ease',
    }),
  },
  summary: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionHint: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6BB3E8',
  },
});
