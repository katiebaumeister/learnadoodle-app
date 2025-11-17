import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Upload, CheckCircle } from 'lucide-react';
import { colors } from '../../theme/colors';

// Web-only component for conic-gradient ring using inline styles
const WebProgressRing = ({ size, radius, strokeWidth, percentage, color }) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  
  // React Native Web supports web-specific CSS properties via style prop
  return (
    <View
      // @ts-ignore - web-specific CSS properties
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: `conic-gradient(from -90deg, ${color} 0deg ${percentage * 3.6}deg, transparent ${percentage * 3.6}deg)`,
        maskImage: `radial-gradient(circle, transparent ${radius - strokeWidth}px, black ${radius}px)`,
        WebkitMaskImage: `radial-gradient(circle, transparent ${radius - strokeWidth}px, black ${radius}px)`,
        position: 'absolute',
      }}
    />
  );
};

export default function EvidenceRings({ data, onRingClick }) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No evidence data available</Text>
      </View>
    );
  }

  const renderRing = (item) => {
    const uploadCount = item.file_count || 0;
    const target = item.target || 4;
    const percentage = target > 0 ? Math.min(100, (uploadCount / target) * 100) : 0;
    const isComplete = uploadCount >= target;

    // Calculate ring dimensions
    const size = 80;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <TouchableOpacity
        key={item.subject_id}
        style={styles.ringContainer}
        onPress={() => onRingClick?.(item.subject_id)}
      >
        <View style={styles.ringWrapper}>
          {/* Background ring - always show as full empty circle (light gray) */}
          <View style={[styles.ringBackground, { 
            width: size, 
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: colors.border || '#e5e7eb',
            borderStyle: 'solid',
          }]} />
          
          {/* Progress ring overlay - only show if percentage > 0 */}
          {percentage > 0 && (
            <View style={[styles.ringProgressContainer, {
              width: size,
              height: size,
            }]}>
              {/* For web, use conic-gradient component */}
              {Platform.OS === 'web' && typeof document !== 'undefined' ? (
                <WebProgressRing
                  size={size}
                  radius={radius}
                  strokeWidth={strokeWidth}
                  percentage={percentage}
                  color={isComplete ? colors.greenBold : colors.primary}
                />
              ) : (
                // For native, use a simple segmented approach
                <View style={[styles.ringProgressArc, {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderWidth: strokeWidth,
                  borderColor: isComplete ? colors.greenBold : colors.primary,
                  borderStyle: 'solid',
                  // Show progress by revealing border segments (quarter turns)
                  borderTopColor: percentage >= 25 ? (isComplete ? colors.greenBold : colors.primary) : 'transparent',
                  borderRightColor: percentage >= 50 ? (isComplete ? colors.greenBold : colors.primary) : 'transparent',
                  borderBottomColor: percentage >= 75 ? (isComplete ? colors.greenBold : colors.primary) : 'transparent',
                  borderLeftColor: percentage >= 100 ? (isComplete ? colors.greenBold : colors.primary) : 'transparent',
                  transform: [{ rotate: '-90deg' }],
                }]} />
              )}
            </View>
          )}
          
          {/* Content overlay */}
          <View style={[styles.ringCircle, { 
            width: size - strokeWidth * 2, 
            height: size - strokeWidth * 2,
            borderRadius: (size - strokeWidth * 2) / 2,
            margin: strokeWidth,
          }]}>
            <View style={styles.ringContent}>
              {isComplete ? (
                <CheckCircle size={20} color={colors.greenBold} />
              ) : (
                <Upload size={20} color={colors.primary} />
              )}
              <Text style={styles.ringCount}>{uploadCount}</Text>
              <Text style={styles.ringTarget}>/{target}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.ringLabel} numberOfLines={2}>
          {item.subject_name || item.subject_id || 'Unknown'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Evidence Coverage (This Month)</Text>
      <View style={styles.ringsGrid}>
        {data.map(renderRing)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  ringsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  ringContainer: {
    alignItems: 'center',
    width: 100,
  },
  ringWrapper: {
    marginBottom: 8,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
  },
  ringBackground: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  ringProgressContainer: {
    position: 'absolute',
  },
  ringProgressWeb: {
    position: 'absolute',
    maskMode: 'alpha',
  },
  ringProgressArc: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  ringCircle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel || colors.bg || '#ffffff',
    zIndex: 10,
  },
  ringContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  ringTarget: {
    fontSize: 12,
    color: colors.muted,
  },
  ringLabel: {
    fontSize: 11,
    color: colors.text,
    textAlign: 'center',
    marginTop: 4,
    minHeight: 32,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
});

