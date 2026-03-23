import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { getChildColorFromAvatar } from '../../utils/avatarColors';

/** Overlapping prof-colored child dots (planner chips, home schedule, subject cards). */
export default function ChildDotCluster({
  childIds = [],
  familyChildren = [],
  dotSize = 7,
  overlap = -3,
  style,
}) {
  const ids = Array.isArray(childIds) ? childIds : [];
  if (ids.length === 0) return null;
  const visible = ids.slice(0, 3);
  const hasOverflow = ids.length > 3;
  const radius = dotSize / 2;
  // White ring only when dots overlap (multiple or +more); single dot stays flush with chip
  const stacked = visible.length > 1 || hasOverflow;
  const ringWidth = stacked
    ? Platform.OS === 'web'
      ? 0.5
      : StyleSheet.hairlineWidth
    : 0;

  const colorFor = (childId) => {
    const child = familyChildren.find((c) => c != null && String(c.id) === String(childId));
    if (!child?.avatar) return '#E5E7EB';
    return getChildColorFromAvatar(child.avatar);
  };

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      {visible.map((childId, index) => (
        <View
          key={String(childId)}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: radius,
            borderWidth: ringWidth,
            borderColor: '#FFFFFF',
            backgroundColor: colorFor(childId),
            marginLeft: index > 0 ? overlap : 0,
            zIndex: visible.length - index + (hasOverflow ? 1 : 0),
          }}
        />
      ))}
      {hasOverflow && (
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: radius,
            borderWidth: ringWidth,
            borderColor: '#FFFFFF',
            backgroundColor: '#D1D5DB',
            marginLeft: visible.length > 0 ? overlap : 0,
            zIndex: 0,
          }}
        />
      )}
    </View>
  );
}
