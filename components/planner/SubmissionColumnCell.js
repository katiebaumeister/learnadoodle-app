import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import {
  SUBMISSION_COLUMN_STATES,
  SUBMISSION_COLUMN_TONES,
} from '../../lib/workEventHelpers';

const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

export default function SubmissionColumnCell({
  display,
  muted = false,
  onSubLabelPress = null,
  compact = false,
}) {
  if (!display || display.state === SUBMISSION_COLUMN_STATES.NONE) {
    return (
      <Text style={[styles.emptyDash, muted && styles.muted, compact && styles.compactEmpty]}>
        —
      </Text>
    );
  }

  const tone = SUBMISSION_COLUMN_TONES[display.tone] || SUBMISSION_COLUMN_TONES.requested;
  const subIsAction = display.subLabelRole === 'action' && display.subLabel;

  return (
    <View style={styles.wrap}>
      <View style={[styles.pill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
        <Text
          style={[styles.pillText, { color: tone.text }, compact && styles.pillTextCompact]}
          numberOfLines={1}
        >
          {display.pillLabel}
        </Text>
      </View>
      {display.subLabel ? (
        subIsAction && typeof onSubLabelPress === 'function' ? (
          <TouchableOpacity
            onPress={onSubLabelPress}
            activeOpacity={0.7}
            hitSlop={4}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={[styles.subLabelAction, compact && styles.subLabelCompact]} numberOfLines={1}>
              {display.subLabel}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text
            style={[
              styles.subLabel,
              display.state === SUBMISSION_COLUMN_STATES.RETURNED && styles.subLabelWarning,
              compact && styles.subLabelCompact,
            ]}
            numberOfLines={1}
          >
            {display.subLabel}
          </Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 3,
    width: '100%',
    minWidth: 0,
  },
  pill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    ...WEB_BODY_FONT,
  },
  pillTextCompact: {
    fontSize: 10,
  },
  subLabel: {
    fontSize: 11,
    color: '#64748B',
    ...WEB_BODY_FONT,
  },
  subLabelWarning: {
    color: '#C2410C',
    fontWeight: '600',
  },
  subLabelAction: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
    ...WEB_BODY_FONT,
  },
  subLabelCompact: {
    fontSize: 10,
  },
  emptyDash: {
    fontSize: 13,
    color: '#CBD5E1',
    ...WEB_BODY_FONT,
  },
  compactEmpty: {
    fontSize: 12,
  },
  muted: {
    opacity: 0.65,
  },
});
