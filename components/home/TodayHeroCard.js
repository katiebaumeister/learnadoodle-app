import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { Sparkles, Calendar } from 'lucide-react';

// Check for reduced motion preference
const prefersReducedMotion = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
};

export default function TodayHeroCard({
  date,
  weatherStatus,
  weatherMessage,
  blockCount,
  backlogCount,
  overdueCount,
  onParentDigest,
}) {
  // Animation refs
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const badge1Opacity = useRef(new Animated.Value(0)).current;
  const badge1TranslateY = useRef(new Animated.Value(4)).current;
  const badge2Opacity = useRef(new Animated.Value(0)).current;
  const badge2TranslateY = useRef(new Animated.Value(4)).current;
  const badge3Opacity = useRef(new Animated.Value(0)).current;
  const badge3TranslateY = useRef(new Animated.Value(4)).current;

  // Pulse animation for hero icon
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.03,
            duration: 1600,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.92,
            duration: 1600,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.0,
            duration: 1600,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulseOpacity, {
            toValue: 1.0,
            duration: 1600,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
      ])
    );

    pulseAnimation.start();

    return () => pulseAnimation.stop();
  }, [pulseScale, pulseOpacity]);

  // Staggered fade-in for badges
  useEffect(() => {
    if (prefersReducedMotion()) {
      // Set to final values immediately
      badge1Opacity.setValue(1);
      badge1TranslateY.setValue(0);
      badge2Opacity.setValue(1);
      badge2TranslateY.setValue(0);
      badge3Opacity.setValue(1);
      badge3TranslateY.setValue(0);
      return;
    }

    const staggerDelay = 70;
    const duration = 250;

    Animated.parallel([
      Animated.parallel([
        Animated.timing(badge1Opacity, {
          toValue: 1,
          duration,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(badge1TranslateY, {
          toValue: 0,
          duration,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
      Animated.parallel([
        Animated.timing(badge2Opacity, {
          toValue: 1,
          duration,
          delay: staggerDelay,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(badge2TranslateY, {
          toValue: 0,
          duration,
          delay: staggerDelay,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
      Animated.parallel([
        Animated.timing(badge3Opacity, {
          toValue: 1,
          duration,
          delay: staggerDelay * 2,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(badge3TranslateY, {
          toValue: 0,
          duration,
          delay: staggerDelay * 2,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    ]).start();
  }, [date, badge1Opacity, badge1TranslateY, badge2Opacity, badge2TranslateY, badge3Opacity, badge3TranslateY]);

  const [isHovered, setIsHovered] = React.useState(false);

  const formatDate = (date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const day = date.getDate();
    return `${dayName} · ${month} ${day}`;
  };

  const getWeatherColor = (status) => {
    switch (status) {
      case 'light':
        return '#86EFAC'; // green
      case 'moderate':
        return '#FACC15'; // yellow
      case 'heavy':
        return '#F87171'; // red
      case 'catch-up':
        return '#F472B6'; // pink
      default:
        return '#94A3B8'; // gray
    }
  };

  const getWeatherLabel = (status) => {
    switch (status) {
      case 'light':
        return 'Today is light.';
      case 'moderate':
        return 'Today is steady.';
      case 'heavy':
        return 'Today is heavy.';
      case 'catch-up':
        return 'Time to catch up.';
      default:
        return 'Open day';
    }
  };

  return (
    <View 
      style={[
        styles.container,
        Platform.OS === 'web' && isHovered && styles.containerHovered
      ]}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      })}
    >
      <View style={styles.header}>
        <View style={styles.dateRow}>
          <Calendar size={16} color="#64748b" />
          <Text style={styles.dateText}>{formatDate(date)}</Text>
        </View>
        {onParentDigest && (
          <TouchableOpacity
            style={styles.digestButton}
            onPress={onParentDigest}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.digestButtonText}>Parent Digest →</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.heroContent}>
        <View style={styles.weatherRow}>
          <Animated.View 
            style={[
              styles.weatherIcon, 
              { 
                backgroundColor: getWeatherColor(weatherStatus),
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              }
            ]}
          >
            <Sparkles size={20} color="#FFFFFF" />
          </Animated.View>
          <View style={styles.weatherText}>
            <Text style={styles.weatherHeadline}>{getWeatherLabel(weatherStatus)}</Text>
            <Text style={styles.weatherSubtext}>{weatherMessage}</Text>
          </View>
        </View>

        <View style={styles.badgesRow}>
          <Animated.View 
            style={[
              styles.badge,
              {
                opacity: badge1Opacity,
                transform: [{ translateY: badge1TranslateY }],
              }
            ]}
          >
            <Text style={styles.badgeValue}>{blockCount}</Text>
            <Text style={styles.badgeLabel}>blocks</Text>
          </Animated.View>
          <Animated.View 
            style={[
              styles.badge,
              {
                opacity: badge2Opacity,
                transform: [{ translateY: badge2TranslateY }],
              }
            ]}
          >
            <Text style={styles.badgeValue}>{backlogCount}</Text>
            <Text style={styles.badgeLabel}>backlog</Text>
          </Animated.View>
          <Animated.View 
            style={[
              styles.badge,
              {
                opacity: badge3Opacity,
                transform: [{ translateY: badge3TranslateY }],
              }
            ]}
          >
            <Text style={styles.badgeValue}>{overdueCount}</Text>
            <Text style={styles.badgeLabel}>overdue</Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.2s ease',
    } : {
      elevation: 2,
    }),
  },
  containerHovered: {
    ...(Platform.OS === 'web' && {
      transform: [{ translateY: -1 }],
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
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
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  digestButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  digestButtonText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroContent: {
    gap: 16,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  weatherIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherText: {
    flex: 1,
  },
  weatherHeadline: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  weatherSubtext: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    alignItems: 'center',
  },
  badgeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  badgeLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
