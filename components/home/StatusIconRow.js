/**
 * StatusIconRow
 * 
 * Duolingo-style status icon row with badges.
 * Shows notifications, rewards, and premium indicators.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Bell, Sparkles, Diamond } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function StatusIconRow({ notifications = 0, rewards = 0, premium = false, onNotificationPress, onRewardPress, onPremiumPress }) {
  return (
    <View style={styles.container}>
      <IconBadge
        icon={Bell}
        count={notifications}
        label="Notifications"
        onPress={onNotificationPress}
      />
      <IconBadge
        icon={Sparkles}
        count={rewards}
        label="Rewards"
        onPress={onRewardPress}
      />
      <IconBadge
        icon={Diamond}
        count={premium ? 1 : 0}
        label="Premium"
        onPress={onPremiumPress}
        showBadge={premium}
      />
    </View>
  );
}

function IconBadge({ icon: Icon, count, label, onPress, showBadge = false }) {
  const hasBadge = showBadge || count > 0;

  return (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={onPress}
      activeOpacity={0.7}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <Icon size={20} color={colors.textSecondary} />
      {hasBadge && (
        <View style={styles.badge}>
          {count > 0 && (
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.bgSubtle,
        borderColor: colors.primary,
      },
    }),
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
