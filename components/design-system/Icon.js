import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { getModeTokens } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';

// Fallback if context not available
function useSensoryModeSafe() {
  try {
    return useSensoryMode();
  } catch {
    return { mode: 'pastel' };
  }
}

/**
 * Monochrome icon component inspired by Co-Star's surreal objects
 * Lightly sketched, symbolic, conceptual pictograms
 */
export function Icon({
  name,
  size = 24,
  color,
  style,
  floating = false,
}) {
  const { mode } = useSensoryModeSafe();
  const tokens = getModeTokens(mode);
  
  const iconColor = color || tokens.icon;
  const iconSize = typeof size === 'number' ? size : 24;
  
  // Icon definitions (conceptual, symbolic)
  const icons = {
    home: () => (
      <View style={styles.iconContainer}>
        <View style={[styles.houseRoof, { borderBottomColor: iconColor }]} />
        <View style={[styles.houseBase, { borderColor: iconColor }]} />
      </View>
    ),
    planner: () => (
      <View style={styles.iconContainer}>
        <View style={[styles.calendarGrid, { borderColor: iconColor }]}>
          <View style={[styles.calendarLine, { backgroundColor: iconColor }]} />
          <View style={[styles.calendarLine, styles.calendarLineShort, { backgroundColor: iconColor }]} />
        </View>
      </View>
    ),
    intelligence: () => (
      <View style={styles.iconContainer}>
        <View style={[styles.star, { borderColor: iconColor }]}>
          <View style={[styles.starCenter, { backgroundColor: iconColor }]} />
        </View>
      </View>
    ),
    records: () => (
      <View style={styles.iconContainer}>
        <View style={styles.stack}>
          <View style={[styles.stackLine, { backgroundColor: iconColor }]} />
          <View style={[styles.stackLine, styles.stackLineMiddle, { backgroundColor: iconColor }]} />
          <View style={[styles.stackLine, { backgroundColor: iconColor }]} />
        </View>
      </View>
    ),
    profile: () => (
      <View style={styles.iconContainer}>
        <View style={[styles.circle, { borderColor: iconColor }]}>
          <View style={[styles.circleInner, { backgroundColor: iconColor }]} />
        </View>
      </View>
    ),
    sun: () => (
      <View style={styles.iconContainer}>
        <View style={[styles.circle, { borderColor: iconColor }]}>
          <View style={styles.rays}>
            {[...Array(8)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.ray,
                  {
                    backgroundColor: iconColor,
                    transform: [{ rotate: `${i * 45}deg` }],
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    ),
    activity: () => (
      <View style={styles.iconContainer}>
        <View style={styles.stack}>
          <View style={[styles.stackLine, styles.stackLineShort, { backgroundColor: iconColor }]} />
          <View style={[styles.stackLine, { backgroundColor: iconColor }]} />
          <View style={[styles.stackLine, styles.stackLineShort, { backgroundColor: iconColor }]} />
        </View>
      </View>
    ),
    learning: () => (
      <View style={styles.iconContainer}>
        <View style={[styles.star, { borderColor: iconColor }]} />
      </View>
    ),
    creative: () => (
      <View style={styles.iconContainer}>
        <View style={[styles.star, styles.starRounded, { borderColor: iconColor }]}>
          <View style={[styles.starCenter, { backgroundColor: iconColor }]} />
        </View>
      </View>
    ),
    progress: () => (
      <View style={styles.iconContainer}>
        <View style={styles.plant}>
          <View style={[styles.plantStem, { backgroundColor: iconColor }]} />
          <View style={[styles.plantLeaf, styles.plantLeafLeft, { borderColor: iconColor }]} />
          <View style={[styles.plantLeaf, styles.plantLeafRight, { borderColor: iconColor }]} />
        </View>
      </View>
    ),
    planet: () => (
      <View style={styles.iconContainer}>
        <View style={[styles.circle, { borderColor: iconColor }]}>
          <View style={[styles.circleRing, { borderColor: iconColor }]} />
        </View>
      </View>
    ),
    settings: () => (
      <View style={styles.iconContainer}>
        <View style={[styles.circle, { borderColor: iconColor }]}>
          <View style={styles.gear}>
            {[...Array(6)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.gearTooth,
                  {
                    backgroundColor: iconColor,
                    transform: [{ rotate: `${i * 60}deg` }],
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    ),
  };
  
  const IconComponent = icons[name] || icons.home;
  const scale = iconSize / 24;
  
  return (
    <View
      style={[
        {
          width: iconSize,
          height: iconSize,
          transform: [{ scale }],
          opacity: floating ? 0.8 : 1,
        },
        style,
      ]}
    >
      <IconComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // House icon
  houseRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -1,
  },
  houseBase: {
    width: 12,
    height: 8,
    borderWidth: 1.5,
    borderRadius: 1,
  },
  // Calendar icon
  calendarGrid: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 2,
    paddingTop: 3,
  },
  calendarLine: {
    width: 10,
    height: 1.5,
    marginLeft: 2,
    marginTop: 2,
    borderRadius: 0.5,
  },
  calendarLineShort: {
    width: 6,
  },
  // Star icon
  star: {
    width: 16,
    height: 16,
    borderWidth: 1.5,
    borderRadius: 8,
    position: 'relative',
  },
  starRounded: {
    borderRadius: 4,
  },
  starCenter: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  // Stack icon
  stack: {
    alignItems: 'center',
  },
  stackLine: {
    width: 12,
    height: 2,
    borderRadius: 1,
    marginBottom: 2,
  },
  stackLineMiddle: {
    width: 10,
  },
  stackLineShort: {
    width: 8,
  },
  // Circle icon
  circle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    position: 'relative',
  },
  circleInner: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  circleRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  // Sun rays
  rays: {
    position: 'absolute',
    width: 20,
    height: 20,
    top: -2,
    left: -2,
  },
  ray: {
    position: 'absolute',
    width: 1.5,
    height: 4,
    top: -2,
    left: 9,
    borderRadius: 0.75,
  },
  // Plant icon
  plant: {
    alignItems: 'center',
  },
  plantStem: {
    width: 2,
    height: 10,
    borderRadius: 1,
    marginBottom: -2,
  },
  plantLeaf: {
    width: 8,
    height: 8,
    borderWidth: 1.5,
    borderRadius: 4,
    position: 'absolute',
  },
  plantLeafLeft: {
    left: -4,
    top: 2,
    transform: [{ rotate: '-30deg' }],
  },
  plantLeafRight: {
    right: -4,
    top: 2,
    transform: [{ rotate: '30deg' }],
  },
  // Gear icon
  gear: {
    position: 'absolute',
    width: 16,
    height: 16,
  },
  gearTooth: {
    position: 'absolute',
    width: 2,
    height: 4,
    top: 0,
    left: 7,
    borderRadius: 1,
  },
});
