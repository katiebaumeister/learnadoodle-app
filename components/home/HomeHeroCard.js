/**
 * HomeHeroCard
 * 
 * Shared hero card for all role-based home screens.
 * Features: poodle icon, date, forecast title/subtitle, status icons, stat chips.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Calendar } from 'lucide-react';
import { colors } from '../../theme/colors';
import StatusIconRow from './StatusIconRow';

export default function HomeHeroCard({
  date,
  dateLabel,
  title,
  subtitle,
  chips = [],
  statusBadges = { notifications: 0, rewards: 0, premium: false },
  onNotificationPress,
  onRewardPress,
  onPremiumPress,
  onChipPress,
}) {
  const formatDate = (date) => {
    if (dateLabel) return dateLabel;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const day = date.getDate();
    return `${dayName} · ${month} ${day}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.dateRow}>
          <Calendar size={16} color={colors.textSecondary} />
          <Text style={styles.dateText}>{formatDate(date)}</Text>
        </View>
        <StatusIconRow
          notifications={statusBadges.notifications}
          rewards={statusBadges.rewards}
          premium={statusBadges.premium}
          onNotificationPress={onNotificationPress}
          onRewardPress={onRewardPress}
          onPremiumPress={onPremiumPress}
        />
      </View>

      <View style={styles.heroContent}>
        <View style={styles.heroRow}>
          {/* Left: Poodle icon */}
          <View style={styles.poodleContainer}>
            <Image
              source={require('../../assets/poodle-icon.png')}
              style={styles.poodleIcon}
              resizeMode="contain"
            />
          </View>

          {/* Center: Title + Subtitle */}
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && (
              <Text style={styles.subtitle}>{subtitle}</Text>
            )}
          </View>
        </View>

        {/* Stat chips */}
        {chips.length > 0 && (
          <View style={styles.chipsRow}>
            {chips.map((chip, index) => (
              <TouchableOpacity
                key={index}
                style={styles.chip}
                onPress={() => onChipPress && onChipPress(chip)}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.chipValue}>{chip.value}</Text>
                <Text style={styles.chipLabel}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroContent: {
    gap: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  poodleContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    flexShrink: 0,
  },
  poodleIcon: {
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.border,
      },
    }),
  },
  chipValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
