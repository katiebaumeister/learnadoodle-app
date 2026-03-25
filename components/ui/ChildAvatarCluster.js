import React from 'react';
import { View, Image, Text, StyleSheet, Platform } from 'react-native';
import { safeImageUri } from '../../lib/safeImageUri';

const avatarSources = {
  prof1: require('../../assets/prof1.png'),
  prof2: require('../../assets/prof2.png'),
  prof3: require('../../assets/prof3.png'),
  prof4: require('../../assets/prof4.png'),
  prof5: require('../../assets/prof5.png'),
  prof6: require('../../assets/prof6.png'),
  prof7: require('../../assets/prof7.png'),
  prof8: require('../../assets/prof8.png'),
  prof9: require('../../assets/prof9.png'),
  prof10: require('../../assets/prof10.png'),
};

function normalizedProfKey(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw
    .trim()
    .toLowerCase()
    .replace(/.*\//, '')
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
}

function resolveKeyedAvatar(avatarKey) {
  const key = normalizedProfKey(
    avatarKey == null ? '' : String(avatarKey)
  );
  if (key && avatarSources[key]) return avatarSources[key];
  return avatarSources.prof1;
}

/**
 * Remote / data URL first, then bundled prof1–prof10 keys.
 * Important: prof keys must NOT go through { uri: 'prof3' } — that breaks Image on web/native.
 */
/** Exported for invite flows, pickers, etc. */
export function sourceForChild(child) {
  if (!child) return avatarSources.prof1;
  const raw = child.avatar_url || child.avatar;
  if (raw == null || raw === '') return avatarSources.prof1;
  if (typeof raw !== 'string') return resolveKeyedAvatar(raw);

  const trimmed = raw.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:')
  ) {
    const uri = safeImageUri(trimmed);
    if (uri) return { uri };
    return avatarSources.prof1;
  }

  const key = normalizedProfKey(trimmed);
  if (key && avatarSources[key]) return avatarSources[key];

  return resolveKeyedAvatar(trimmed);
}

/**
 * Overlapping circular child avatars (home schedule, etc.).
 * Mirrors ChildDotCluster overlap behavior with white rings when stacked.
 */
export default function ChildAvatarCluster({
  childIds = [],
  familyChildren = [],
  size = 22,
  overlap = -6,
  style,
}) {
  const ids = Array.isArray(childIds) ? childIds : [];
  if (ids.length === 0) return null;

  const visible = ids.slice(0, 3);
  const overflow = ids.length - visible.length;
  const hasOverflow = overflow > 0;
  const stacked = visible.length > 1 || hasOverflow;
  const ring = stacked ? (Platform.OS === 'web' ? 2 : StyleSheet.hairlineWidth * 2) : 0;
  const radius = size / 2;

  const childFor = (childId) =>
    familyChildren.find((c) => c != null && String(c.id) === String(childId));

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      {visible.map((childId, index) => (
        <Image
          key={String(childId)}
          source={sourceForChild(childFor(childId))}
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: ring,
            borderColor: '#FFFFFF',
            marginLeft: index > 0 ? overlap : 0,
            zIndex: visible.length - index + (hasOverflow ? 1 : 0),
            backgroundColor: '#f1f5f9',
            overflow: 'hidden',
            ...(Platform.OS === 'web' && { objectFit: 'cover' }),
          }}
          resizeMode="cover"
        />
      ))}
      {hasOverflow && (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: ring,
            borderColor: '#FFFFFF',
            backgroundColor: '#e2e8f0',
            marginLeft: visible.length > 0 ? overlap : 0,
            zIndex: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: size > 20 ? 11 : 9,
              fontWeight: '600',
              color: '#64748b',
              ...(Platform.OS === 'web' && {
                fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }),
            }}
          >
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  );
}
