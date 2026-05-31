import React, { useEffect, useRef } from 'react';
import { View, Platform, Animated, TouchableOpacity } from 'react-native';
import { Check, Sparkles } from 'lucide-react';

const STROKE = 2.5;

/**
 * Month / list completion control: fixed size on web (no dangerouslySetInnerHTML) to avoid reflow and flicker when props re-render.
 */
export default function CompletionRing({
  isDone,
  size = 16,
  onPress,
  pendingBorderColor = 'rgba(59, 130, 246, 0.45)',
}) {
  const scaleAnim = useRef(new Animated.Value(isDone ? 1 : 0)).current;
  const sparkleOpacity = useRef(new Animated.Value(0)).current;
  const ringProgress = useRef(new Animated.Value(isDone ? 1 : 0)).current;
  const wasDoneRef = useRef(isDone);

  useEffect(() => {
    if (isDone && !wasDoneRef.current) {
      if (Platform.OS !== 'web') {
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
              useNativeDriver: false,
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
      if (Platform.OS !== 'web') {
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
  }, [isDone, scaleAnim, ringProgress, sparkleOpacity]);

  const ringContent = Platform.OS === 'web' ? (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: STROKE,
          borderColor: isDone ? 'transparent' : pendingBorderColor,
          backgroundColor: isDone ? '#10B981' : 'rgba(243, 244, 246, 0.85)',
          alignItems: 'center',
          justifyContent: 'center',
          ...(Platform.OS === 'web' && {
            transition: 'background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
            boxSizing: 'border-box',
            boxShadow: isDone
              ? '0 0 0 1px rgba(16, 185, 129, 0.2)'
              : 'inset 0 0 0 0 rgba(0,0,0,0)',
          }),
        }}
      >
        {isDone ? (
          <Check size={Math.round(size * 0.5)} color="#FFFFFF" strokeWidth={2.5} />
        ) : null}
      </View>
    </View>
  ) : (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: STROKE,
          borderColor: isDone ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.4)',
          backgroundColor: isDone ? 'rgba(16, 185, 129, 0.12)' : 'rgba(243, 244, 246, 0.5)',
        }}
      />
      <Animated.View
        style={{
          opacity: scaleAnim,
          transform: [{ scale: scaleAnim }],
        }}
      >
        {isDone && <Check size={size * 0.5} color="#8B7CF6" strokeWidth={2.5} />}
      </Animated.View>
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
