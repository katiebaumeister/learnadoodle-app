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
  const raw = child.avatar_key || child.avatar_url || child.avatar;
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
  hideBackground = false,
  style,
}) {
  const ids = Array.isArray(childIds) ? childIds : [];
  if (ids.length === 0) return null;

  const visible = ids.slice(0, 3);
  const overflow = ids.length - visible.length;
  const hasOverflow = overflow > 0;
  const childFor = (childId) =>
    familyChildren.find((c) => c != null && String(c.id) === String(childId));

  // Bare prof art on chips/list rows: no fill, ring, or heavy overlap.
  if (hideBackground) {
    const maxOverlap = Math.round(-size * 0.55);
    const chipOverlap =
      overlap < 0 ? Math.max(overlap, maxOverlap) : maxOverlap;

    return (
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
          },
          style,
        ]}
      >
        {visible.map((childId, index) => (
          <View
            key={String(childId)}
            style={{
              width: size,
              height: size,
              marginLeft: index > 0 ? chipOverlap : 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              zIndex: visible.length - index + (hasOverflow ? 1 : 0),
              ...(Platform.OS === 'web' && {
                position: 'relative',
              }),
            }}
          >
            <Image
              source={sourceForChild(childFor(childId))}
              style={{
                width: size,
                height: size,
                ...(Platform.OS === 'web' && { objectFit: 'contain' }),
              }}
              resizeMode="contain"
            />
          </View>
        ))}
        {hasOverflow && size >= 14 ? (
          <View
            style={{
              width: size,
              height: size,
              marginLeft: visible.length > 0 ? chipOverlap : 0,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 0,
              ...(Platform.OS === 'web' && {
                position: 'relative',
              }),
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
        ) : null}
      </View>
    );
  }

  const stacked = visible.length > 1 || hasOverflow;
  const ring = stacked
    ? size <= 10
      ? Platform.OS === 'web'
        ? 0.5
        : StyleSheet.hairlineWidth
      : Platform.OS === 'web'
        ? 2
        : StyleSheet.hairlineWidth * 2
    : 0;
  const radius = size / 2;
  const imageScale = size <= 10 ? 1.2 : 1;
  const showOverflowCount = size >= 14;

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      {visible.map((childId, index) => (
        <View
          key={String(childId)}
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
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={sourceForChild(childFor(childId))}
            style={{
              width: size,
              height: size,
              ...(imageScale !== 1 && { transform: [{ scale: imageScale }] }),
              ...(Platform.OS === 'web' && { objectFit: 'cover' }),
            }}
            resizeMode="cover"
          />
        </View>
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
          {showOverflowCount ? (
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
          ) : null}
        </View>
      )}
    </View>
  );
}
