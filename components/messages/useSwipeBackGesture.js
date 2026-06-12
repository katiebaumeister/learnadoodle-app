import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform } from 'react-native';

const SWIPE_DISTANCE_THRESHOLD = 72;
const SWIPE_VELOCITY_THRESHOLD = 0.45;
const TRACKPAD_WHEEL_THRESHOLD = 96;
const MAX_DRAG_OFFSET = 360;

function isEditableWebTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = String(target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return Boolean(target.isContentEditable);
}

export default function useSwipeBackGesture({ onBack, enabled = true }) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const wheelAccumRef = useRef(0);
  const wheelResetTimerRef = useRef(null);

  const resetDrag = useCallback(() => {
    setIsDragging(false);
    setDragX(0);
  }, []);

  const triggerBack = useCallback(() => {
    if (typeof onBack !== 'function') return;
    resetDrag();
    onBack();
  }, [onBack, resetDrag]);

  const updateDragX = useCallback((next) => {
    setDragX(Math.max(0, Math.min(next, MAX_DRAG_OFFSET)));
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      if (!enabled) return false;
      const { dx, dy } = gestureState;
      return dx > 10 && dx > Math.abs(dy) * 1.15;
    },
    onPanResponderGrant: () => {
      setIsDragging(true);
    },
    onPanResponderMove: (_, gestureState) => {
      if (!enabled) return;
      if (gestureState.dx <= 0) {
        updateDragX(0);
        return;
      }
      updateDragX(gestureState.dx);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (!enabled) {
        resetDrag();
        return;
      }
      const shouldGoBack = gestureState.dx >= SWIPE_DISTANCE_THRESHOLD
        || gestureState.vx >= SWIPE_VELOCITY_THRESHOLD;
      if (shouldGoBack) {
        triggerBack();
        return;
      }
      resetDrag();
    },
    onPanResponderTerminate: resetDrag,
  }), [enabled, resetDrag, triggerBack, updateDragX]);

  const handleWheel = useCallback((event) => {
    if (!enabled || Platform.OS !== 'web') return;
    const nativeEvent = event?.nativeEvent || event;
    if (isEditableWebTarget(nativeEvent?.target)) return;

    const deltaX = Number(nativeEvent?.deltaX || 0);
    const deltaY = Number(nativeEvent?.deltaY || 0);
    if (Math.abs(deltaX) < Math.abs(deltaY) * 0.75) return;
    if (deltaX <= 0) return;

    wheelAccumRef.current += deltaX;
    if (wheelResetTimerRef.current) {
      clearTimeout(wheelResetTimerRef.current);
    }
    wheelResetTimerRef.current = setTimeout(() => {
      wheelAccumRef.current = 0;
    }, 220);

    if (wheelAccumRef.current < TRACKPAD_WHEEL_THRESHOLD) return;
    wheelAccumRef.current = 0;
    triggerBack();
  }, [enabled, triggerBack]);

  const swipeStyle = useMemo(() => {
    if (!enabled || dragX <= 0) return null;
    return {
      transform: [{ translateX: dragX }],
      ...(Platform.OS === 'web' && {
        boxShadow: '-6px 0 18px rgba(15, 23, 42, 0.08)',
        transition: isDragging ? 'none' : 'transform 180ms ease-out',
        touchAction: 'pan-y',
        cursor: isDragging ? 'grabbing' : undefined,
      }),
    };
  }, [dragX, enabled, isDragging]);

  return {
    swipeStyle,
    panHandlers: enabled ? panResponder.panHandlers : {},
    webHandlers: enabled && Platform.OS === 'web' ? { onWheel: handleWheel } : {},
  };
}
