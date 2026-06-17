import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import { getChildColorFromAvatar, hexToRgba } from '../../utils/avatarColors';
import { AVATAR_KEYS, DEFAULT_AVATAR_KEY, onboardingProfAvatarSources, AVATAR_PICKER_CELL_SIZE, AVATAR_PICKER_IMAGE_SIZE, AVATAR_PICKER_PREVIEW_RING_SIZE, AVATAR_PICKER_PREVIEW_IMAGE_SIZE } from '../../lib/onboardingProfAvatars';

const AVATAR_SIZE = AVATAR_PICKER_CELL_SIZE;

export default function FamilyAdultProfileFields({
  displayName = '',
  avatarKey = DEFAULT_AVATAR_KEY,
  onDisplayNameChange,
  onAvatarChange,
  disabled = false,
  nameLabel = 'What should we call them?',
  namePlaceholder = 'e.g. Katie, Mom, Professor Doodle',
}) {
  const [hoveredAvatar, setHoveredAvatar] = useState(null);
  const trimmed = String(displayName || '').trim();

  return (
    <View style={styles.wrap}>
      {trimmed ? (
        <View style={styles.previewRow}>
          <View
            style={[
              styles.previewAvatarWrap,
              { backgroundColor: hexToRgba(getChildColorFromAvatar(avatarKey), 0.55) },
            ]}
          >
            <Image
              source={onboardingProfAvatarSources[avatarKey] || onboardingProfAvatarSources[DEFAULT_AVATAR_KEY]}
              style={styles.previewAvatar}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.previewName}>{trimmed}</Text>
        </View>
      ) : null}

      <Text style={styles.fieldLabel}>
        {nameLabel} <Text style={styles.requiredAsterisk}>*</Text>
      </Text>
      <TextInput
        style={styles.fieldInput}
        value={displayName}
        onChangeText={onDisplayNameChange}
        placeholder={namePlaceholder}
        placeholderTextColor="#9ca3af"
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        editable={!disabled}
      />

      <Text style={styles.fieldLabel}>
        Choose avatar <Text style={styles.requiredAsterisk}>*</Text>
      </Text>
      <View style={styles.avatarsWrap}>
        {AVATAR_KEYS.map((key) => {
          const selected = avatarKey === key;
          const hovered = hoveredAvatar === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onAvatarChange?.(key)}
              onMouseEnter={Platform.OS === 'web' ? () => setHoveredAvatar(key) : undefined}
              onMouseLeave={Platform.OS === 'web' ? () => setHoveredAvatar(null) : undefined}
              style={[
                styles.avatarCell,
                { backgroundColor: hexToRgba(getChildColorFromAvatar(key), 0.55) },
                selected && styles.avatarCellSelected,
                Platform.OS === 'web' && !selected && hovered && styles.avatarCellHovered,
              ]}
              disabled={disabled}
              accessibilityLabel={`Avatar ${key}`}
              accessibilityState={{ selected }}
            >
              <Image source={onboardingProfAvatarSources[key]} style={styles.avatarImg} resizeMode="contain" />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function isFamilyAdultProfileComplete(displayName, avatarKey) {
  return Boolean(String(displayName || '').trim() && String(avatarKey || '').trim());
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  previewAvatarWrap: {
    width: AVATAR_PICKER_PREVIEW_RING_SIZE,
    height: AVATAR_PICKER_PREVIEW_RING_SIZE,
    borderRadius: AVATAR_PICKER_PREVIEW_RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewAvatar: {
    width: AVATAR_PICKER_PREVIEW_IMAGE_SIZE,
    height: AVATAR_PICKER_PREVIEW_IMAGE_SIZE,
  },
  previewName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 6,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  requiredAsterisk: {
    color: '#DC2626',
  },
  fieldInput: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111827',
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    width: '100%',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", sans-serif',
      outlineStyle: 'none',
    }),
  },
  avatarsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  avatarCell: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  avatarCellHovered: {
    borderColor: '#C7D2FE',
  },
  avatarCellSelected: {
    borderColor: '#9ECFFB',
  },
  avatarImg: {
    width: AVATAR_PICKER_IMAGE_SIZE,
    height: AVATAR_PICKER_IMAGE_SIZE,
  },
});
