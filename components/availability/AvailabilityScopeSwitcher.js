import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Home, UserCircle } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

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

const resolveAvatarSource = (avatarKey) => {
  if (!avatarKey) {
    return avatarSources.prof1;
  }
  const normalized = String(avatarKey)
    .toLowerCase()
    .replace(/.*\//, '')
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
  return avatarSources[normalized] || avatarSources.prof1;
};

/**
 * Scope Switcher Component
 * Allows switching between Family and individual children
 */
const AvailabilityScopeSwitcher = ({
  selectedScope,
  selectedChildId,
  children = [],
  onScopeChange,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Whose schedule are we editing?</Text>
      <View style={styles.chipRow}>
        {/* Family Chip */}
        <TouchableOpacity
          style={[
            styles.chip,
            selectedScope === 'family' && styles.chipActive,
          ]}
          onPress={() => onScopeChange('family', null)}
        >
          <Home size={16} color={selectedScope === 'family' ? colors.accent : colors.muted} />
          <Text style={[
            styles.chipText,
            selectedScope === 'family' && styles.chipTextActive,
          ]}>
            Family
          </Text>
        </TouchableOpacity>

        {/* Child Chips */}
        {children.map(child => {
          const isActive = selectedScope === 'child' && selectedChildId === child.id;
          const avatarSource = resolveAvatarSource(child.avatar);
          
          return (
            <TouchableOpacity
              key={child.id}
              style={[
                styles.chip,
                isActive && styles.chipActive,
              ]}
              onPress={() => onScopeChange('child', child.id)}
            >
              <Image
                source={avatarSource}
                style={styles.avatar}
              />
              <Text style={[
                styles.chipText,
                isActive && styles.chipTextActive,
              ]}>
                {child.first_name || child.name || 'Child'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  chipActive: {
    backgroundColor: colors.blueSoft || '#eff6ff',
    borderColor: colors.accent,
    ...shadows.md,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
});

export default AvailabilityScopeSwitcher;

