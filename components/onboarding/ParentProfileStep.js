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
import { ONBOARDING_SKY, ONBOARDING_TEXT_PRIMARY } from '../../lib/constants/onboardingTheme';
import { AVATAR_KEYS, DEFAULT_AVATAR_KEY, onboardingProfAvatarSources, AVATAR_PICKER_CELL_SIZE, AVATAR_PICKER_IMAGE_SIZE, AVATAR_PICKER_PREVIEW_RING_SIZE, AVATAR_PICKER_PREVIEW_IMAGE_SIZE } from '../../lib/onboardingProfAvatars';

const AVATAR_SIZE = AVATAR_PICKER_CELL_SIZE;
const AVATAR_PREVIEW_SIZE = AVATAR_PICKER_PREVIEW_RING_SIZE;

export default function ParentProfileStep({
  initialName = '',
  initialAvatar = DEFAULT_AVATAR_KEY,
  onNext,
  isSaving = false,
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar || DEFAULT_AVATAR_KEY);
  const [hoveredAvatar, setHoveredAvatar] = useState(null);
  const [continueHovered, setContinueHovered] = useState(false);

  const trimmed = displayName.trim();
  const canContinue = Boolean(trimmed && avatar);

  const handleContinue = () => {
    if (!canContinue || isSaving) return;
    onNext?.({ displayName: trimmed, avatarKey: avatar });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>What should we call you?</Text>

      {trimmed ? (
        <View style={styles.previewRow}>
          <View
            style={[
              styles.previewAvatarWrap,
              { backgroundColor: hexToRgba(getChildColorFromAvatar(avatar), 0.55) },
            ]}
          >
            <Image
              source={onboardingProfAvatarSources[avatar]}
              style={styles.previewAvatar}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.previewName}>{trimmed}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>
        Your name <Text style={styles.requiredAsterisk}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="e.g. Katie, Mom, Dad"
        placeholderTextColor="#9CA3AF"
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        editable={!isSaving}
      />

      <Text style={styles.label}>
        Choose your avatar <Text style={styles.requiredAsterisk}>*</Text>
      </Text>
      <View style={styles.avatarsWrap}>
        {AVATAR_KEYS.map((key) => {
          const selected = avatar === key;
          const hovered = hoveredAvatar === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setAvatar(key)}
              onMouseEnter={Platform.OS === 'web' ? () => setHoveredAvatar(key) : undefined}
              onMouseLeave={Platform.OS === 'web' ? () => setHoveredAvatar(null) : undefined}
              style={[
                styles.avatarCell,
                { backgroundColor: hexToRgba(getChildColorFromAvatar(key), 0.55) },
                selected && styles.avatarCellSelected,
                Platform.OS === 'web' && !selected && hovered && styles.avatarCellHovered,
              ]}
              disabled={isSaving}
              accessibilityLabel={`Avatar ${key}`}
              accessibilityState={{ selected }}
            >
              <Image source={onboardingProfAvatarSources[key]} style={styles.avatarImg} resizeMode="contain" />
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.continueBtn,
          !canContinue && styles.continueBtnDisabled,
          Platform.OS === 'web' && canContinue && continueHovered && styles.continueBtnHovered,
        ]}
        onPress={handleContinue}
        disabled={!canContinue || isSaving}
        onMouseEnter={Platform.OS === 'web' ? () => setContinueHovered(true) : undefined}
        onMouseLeave={Platform.OS === 'web' ? () => setContinueHovered(false) : undefined}
        activeOpacity={0.9}
      >
        <Text style={styles.continueBtnText}>
          {isSaving ? 'Saving…' : 'Continue'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 28,
    paddingBottom: 16,
  },
  prompt: {
    fontSize: 30,
    fontWeight: '600',
    color: ONBOARDING_TEXT_PRIMARY,
    marginBottom: 24,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  previewAvatarWrap: {
    width: AVATAR_PREVIEW_SIZE,
    height: AVATAR_PREVIEW_SIZE,
    borderRadius: AVATAR_PREVIEW_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewAvatar: {
    width: AVATAR_PICKER_PREVIEW_IMAGE_SIZE,
    height: AVATAR_PICKER_PREVIEW_IMAGE_SIZE,
  },
  previewName: {
    fontSize: 20,
    fontWeight: '700',
    color: ONBOARDING_TEXT_PRIMARY,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
  requiredAsterisk: {
    color: '#DC2626',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
    ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", sans-serif' }),
  },
  avatarsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
    justifyContent: 'center',
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
    ...(Platform.OS === 'web' && {
      transition: 'border-color 0.15s ease, transform 0.15s ease',
    }),
  },
  avatarCellHovered: {
    borderColor: '#C7D2FE',
    transform: [{ translateY: -1 }],
  },
  avatarCellSelected: {
    borderColor: ONBOARDING_SKY,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(133,196,242,0.35)',
    }),
  },
  avatarImg: {
    width: AVATAR_PICKER_IMAGE_SIZE,
    height: AVATAR_PICKER_IMAGE_SIZE,
  },
  continueBtn: {
    backgroundColor: ONBOARDING_SKY,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  continueBtnDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
  },
  continueBtnHovered: {
    backgroundColor: '#78BCEF',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", sans-serif' }),
  },
});
