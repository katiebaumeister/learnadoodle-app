/**
 * Shared UI for planner / event conflict banners (learner pill + parsing helpers).
 */

import React from 'react';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';
import { colors } from '../../theme/colors';
import { sourceForChild } from '../ui/ChildAvatarCluster';

/** Normalize family member rows for resolveLearnerChild + LearnerPill */
export function mapChildrenForConflict(members) {
  if (!members?.length) return [];
  return members.map((m) => ({
    ...m,
    first_name: m.first_name || m.name,
    name: m.name,
    avatar: m.avatar,
    avatar_url: m.avatar_url,
  }));
}

export function resolveLearnerChild(movedEvent, children, learnerName = null) {
  if (!movedEvent || !children?.length) return null;
  const id = movedEvent.child_id || (Array.isArray(movedEvent.child_ids) && movedEvent.child_ids[0]);
  if (id) {
    const byId = children.find((c) => c && String(c.id) === String(id)) || null;
    if (byId) return byId;
  }
  const normalizedName = typeof learnerName === 'string' ? learnerName.trim().toLowerCase() : '';
  if (!normalizedName) return null;
  return (
    children.find((c) => {
      const first = typeof c?.first_name === 'string' ? c.first_name.trim().toLowerCase() : '';
      const full = typeof c?.name === 'string' ? c.name.trim().toLowerCase() : '';
      return first === normalizedName || full === normalizedName;
    }) || null
  );
}

export function formatConflictMetaFromEvent(ev) {
  if (!ev?.start_ts) return '';
  const eventDate = new Date(ev.start_ts);
  if (isNaN(eventDate.getTime())) return '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = dayNames[eventDate.getDay()];
  const monthName = monthNames[eventDate.getMonth()];
  const day = eventDate.getDate();
  const formatTime = (d) => {
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    if (hours > 12) hours -= 12;
    else if (hours === 0) hours = 12;
    return minutes === 0 ? `${hours} ${period}` : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };
  const eventStart = new Date(ev.start_ts);
  const eventEnd = new Date(ev.end_ts || ev.start_ts);
  const startTimeStr = formatTime(eventStart);
  const endTimeStr = formatTime(eventEnd);
  const startTimeOnly = startTimeStr.replace(/\s*(AM|PM)$/i, '');
  const endTimeOnly = endTimeStr.replace(/\s*(AM|PM)$/i, '');
  const period = startTimeStr.includes('PM') ? 'PM' : 'AM';
  const timeRange = `${startTimeOnly}–${endTimeOnly} ${period}`;
  return `${dayName} ${monthName} ${day} · ${timeRange}`;
}

/** Parse "Name — Title (meta)" from WebContent conflict string */
export function parseConflictMessageString(conflictMessage) {
  if (!conflictMessage || typeof conflictMessage !== 'string') return null;
  const trimmed = conflictMessage.trim();
  const paren = trimmed.match(/^(.+?)\s*—\s*(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    return {
      learnerName: paren[1].trim(),
      conflictingTitle: paren[2].trim(),
      metaLine: paren[3].replace(/,\s*/, ' · '),
    };
  }
  return null;
}

/** Inline learner label: bundled prof1–10 or remote avatar + name, no pill border/background */
export function LearnerPill({ child, nameFallback }) {
  const name = (child && (child.first_name || child.name)) || nameFallback || 'Learner';
  const imgSource = sourceForChild(child || null);
  return (
    <View style={learnerInlineStyles.row}>
      <Image source={imgSource} style={learnerInlineStyles.avatar} resizeMode="contain" />
      <Text style={learnerInlineStyles.name} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const learnerInlineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: 200,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

/** Compact conflict banner shell + typography + primary / ghost CTAs (planner + event modal) */
export const sharedConflictBannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: colors.panel || '#f6f8ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.14)',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 2,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
          zIndex: 10000,
          position: 'relative',
          display: 'flex',
          visibility: 'visible',
        }
      : {
          shadowColor: '#101828',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
        }),
  },
  bannerIconWrapSm: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(133, 196, 242, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bannerContentCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  bannerTextGrow: {
    flex: 1,
    minWidth: 140,
  },
  conflictLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  kicker: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  conflictTitle: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  metaInline: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  bannerMessagePlain: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  bannerActionsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  primaryButton: {
    flexShrink: 0,
    backgroundColor: '#85C4F2',
    borderWidth: 1,
    borderColor: 'rgba(107, 179, 232, 0.95)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ghostButton: {
    flexShrink: 0,
    backgroundColor: 'transparent',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
