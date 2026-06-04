import { useLayoutEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Measure fixed-position dropdown coords for a trigger ref (web only).
 */
export function measureFixedDropdownPosition(triggerRef, options = {}) {
  const {
    offset = 4,
    minWidth = 200,
    maxHeight: maxHeightCap = 300,
    flip = false,
    matchTriggerWidth = false,
  } = options;

  const triggerNode = triggerRef?.current?._nativeNode || triggerRef?.current;
  if (!triggerNode?.getBoundingClientRect || typeof window === 'undefined') {
    return null;
  }

  const rect = triggerNode.getBoundingClientRect();
  const width = matchTriggerWidth ? rect.width : Math.max(rect.width, minWidth);
  let top;
  let maxHeight = maxHeightCap;

  if (flip) {
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < 200 && spaceAbove > spaceBelow) {
      top = rect.top - Math.min(maxHeightCap, Math.max(spaceAbove - 10, 140));
      maxHeight = Math.min(maxHeightCap, Math.max(spaceAbove - 10, 140));
    } else {
      top = rect.bottom + offset;
      maxHeight = Math.min(maxHeightCap, Math.max(spaceBelow - 10, 140));
    }
  } else {
    top = rect.bottom + offset;
  }

  return { top, left: rect.left, width, maxHeight };
}

/**
 * Synchronously measure dropdown position before paint to avoid a (0,0) flash.
 */
export function useAnchoredDropdownPosition(visible, triggerRef, options = {}) {
  const [position, setPosition] = useState(null);

  const offset = options.offset ?? 4;
  const minWidth = options.minWidth ?? 200;
  const maxHeight = options.maxHeight ?? 300;
  const flip = options.flip ?? false;
  const matchTriggerWidth = options.matchTriggerWidth ?? false;

  useLayoutEffect(() => {
    if (!visible || Platform.OS !== 'web') {
      setPosition(null);
      return undefined;
    }

    const update = () => {
      const next = measureFixedDropdownPosition(triggerRef, {
        offset,
        minWidth,
        maxHeight,
        flip,
        matchTriggerWidth,
      });
      if (next) setPosition(next);
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [visible, triggerRef, offset, minWidth, maxHeight, flip, matchTriggerWidth]);

  return {
    position,
    ready: Boolean(position),
  };
}
