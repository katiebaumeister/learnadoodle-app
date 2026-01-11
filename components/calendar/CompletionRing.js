import React, { useEffect, useRef, useState } from 'react';
import { View, Platform, Animated, TouchableOpacity } from 'react-native';
import { Check, Sparkles } from 'lucide-react';

/**
 * Progressive completion ring with easing animation and micro sparkle
 */
export default function CompletionRing({ isDone, size = 16, onPress }) {
  const scaleAnim = useRef(new Animated.Value(isDone ? 1 : 0)).current;
  const sparkleOpacity = useRef(new Animated.Value(0)).current;
  const ringProgress = useRef(new Animated.Value(isDone ? 1 : 0)).current;
  const wasDoneRef = useRef(isDone);
  const [webRingProgress, setWebRingProgress] = useState(isDone ? 1 : 0);

  useEffect(() => {
    if (isDone && !wasDoneRef.current) {
      // Just completed - animate ring fill and sparkle
      if (Platform.OS === 'web') {
        // Web: use requestAnimationFrame for smooth animation
        const duration = 400;
        const startTime = Date.now();
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out
          setWebRingProgress(eased);
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            // Trigger sparkle after ring completes
            setTimeout(() => {
              if (Platform.OS === 'web') {
                const sparkleEl = document.getElementById(`sparkle-${Date.now()}`);
                if (sparkleEl) {
                  sparkleEl.style.animation = 'sparkle 500ms ease-out';
                  setTimeout(() => {
                    if (sparkleEl) sparkleEl.style.animation = 'none';
                  }, 500);
                }
              }
            }, 100);
          }
        };
        requestAnimationFrame(animate);
      } else {
        // Native: use Animated API
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 150,
            friction: 8,
          }),
          Animated.sequence([
            Animated.timing(ringProgress, {
              toValue: 1,
              duration: 400,
              useNativeDriver: false, // stroke-dashoffset doesn't support native driver
            }),
            Animated.sequence([
              Animated.timing(sparkleOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(sparkleOpacity, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]).start();
      }
    } else if (!isDone && wasDoneRef.current) {
      // Uncompleted - reverse animation
      if (Platform.OS === 'web') {
        setWebRingProgress(0);
      } else {
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 150,
            friction: 8,
          }),
          Animated.timing(ringProgress, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }),
        ]).start();
      }
    }
    wasDoneRef.current = isDone;
  }, [isDone]);

  const radius = size / 2;
  const strokeWidth = 2.5;
  const innerRadius = radius - strokeWidth;
  const circumference = 2 * Math.PI * innerRadius;

  const ringContent = Platform.OS === 'web' ? (
    <View
      style={{
        width: size,
        height: size,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Outer soft ring */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: isDone ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.4)',
          backgroundColor: isDone ? 'rgba(16, 185, 129, 0.12)' : 'rgba(243, 244, 246, 0.5)',
          ...(Platform.OS === 'web' && {
            transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: isDone
              ? '0 0 8px rgba(16, 185, 129, 0.2), inset 0 0 4px rgba(16, 185, 129, 0.1)'
              : 'none',
          }),
        }}
      />
      {/* Progress ring (SVG via web) */}
      {Platform.OS === 'web' && (
        <View
          style={{
            position: 'absolute',
            width: size,
            height: size,
          }}
          dangerouslySetInnerHTML={{
            __html: `
              <svg width="${size}" height="${size}" style="transform: rotate(-90deg); position: absolute;">
                <circle
                  cx="${radius}"
                  cy="${radius}"
                  r="${innerRadius}"
                  fill="none"
                  stroke="${isDone ? '#10B981' : 'transparent'}"
                  stroke-width="${strokeWidth}"
                  stroke-dasharray="${circumference}"
                  stroke-dashoffset="${circumference * (1 - webRingProgress)}"
                  stroke-linecap="round"
                  style="transition: stroke-dashoffset 400ms cubic-bezier(0.4, 0, 0.2, 1);"
                />
              </svg>
            `,
          }}
        />
      )}
      {/* Check icon */}
      {isDone && (
        <View
          style={{
            position: 'absolute',
            opacity: webRingProgress,
            transform: [{ scale: webRingProgress }],
            ...(Platform.OS === 'web' && {
              transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }),
          }}
        >
          <Check size={size * 0.5} color="#10B981" strokeWidth={2.5} />
        </View>
      )}
      {/* Micro sparkle - only show once when completed */}
      {isDone && webRingProgress > 0.8 && (
        <View
          id={`sparkle-${Date.now()}`}
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            ...(Platform.OS === 'web' && {
              animation: 'none',
            }),
          }}
        >
          <Sparkles size={8} color="#FDE047" strokeWidth={2} />
        </View>
      )}
      {Platform.OS === 'web' && (
        <style>{`
          @keyframes sparkle {
            0% { opacity: 0; transform: scale(0) rotate(0deg); }
            50% { opacity: 1; transform: scale(1.2) rotate(180deg); }
            100% { opacity: 0; transform: scale(0.8) rotate(360deg); }
          }
        `}</style>
      )}
    </View>
  ) : (
    // Native version
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Outer soft ring */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: isDone ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.4)',
          backgroundColor: isDone ? 'rgba(16, 185, 129, 0.12)' : 'rgba(243, 244, 246, 0.5)',
        }}
      />
      {/* Check icon */}
      <Animated.View
        style={{
          opacity: scaleAnim,
          transform: [{ scale: scaleAnim }],
        }}
      >
        {isDone && <Check size={size * 0.5} color="#8B7CF6" strokeWidth={2.5} />}
      </Animated.View>
      {/* Sparkle */}
      {isDone && (
        <Animated.View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            opacity: sparkleOpacity,
          }}
        >
          <Sparkles size={8} color="#FDE047" strokeWidth={2} />
        </Animated.View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        activeOpacity={0.7}
        style={{
          ...(Platform.OS === 'web' && {
            cursor: 'pointer',
          }),
        }}
      >
        {ringContent}
      </TouchableOpacity>
    );
  }

  return ringContent;
}
