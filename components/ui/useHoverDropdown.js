import { useRef, useCallback } from 'react';
import { Platform } from 'react-native';

const CLICK_GUARD_MS = 250;

/**
 * Web hover-to-open for portaled dropdowns: stays open while pointer is on trigger or panel.
 * Click toggle is handled separately by the trigger's onPress (use wrapClickToggle).
 */
export function useHoverDropdown({ open, setOpen, onOpen, closeDelay = 150 }) {
  const closeTimerRef = useRef(null);
  const hoveringTriggerRef = useRef(false);
  const hoveringPanelRef = useRef(false);
  const openedAtRef = useRef(0);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      if (!hoveringTriggerRef.current && !hoveringPanelRef.current) {
        setOpen(false);
      }
    }, closeDelay);
  }, [clearCloseTimer, closeDelay, setOpen]);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    openedAtRef.current = Date.now();
    onOpen?.();
    setOpen(true);
  }, [clearCloseTimer, onOpen, setOpen]);

  const wrapClickToggle = useCallback((toggle) => () => {
    if (Date.now() - openedAtRef.current < CLICK_GUARD_MS) return;
    toggle();
  }, []);

  if (Platform.OS !== 'web') {
    return { triggerProps: {}, panelProps: {}, wrapClickToggle: (toggle) => toggle };
  }

  return {
    triggerProps: {
      onMouseEnter: () => {
        hoveringTriggerRef.current = true;
        openMenu();
      },
      onMouseLeave: () => {
        hoveringTriggerRef.current = false;
        scheduleClose();
      },
    },
    panelProps: {
      onMouseEnter: () => {
        hoveringPanelRef.current = true;
        clearCloseTimer();
      },
      onMouseLeave: () => {
        hoveringPanelRef.current = false;
        scheduleClose();
      },
    },
    wrapClickToggle,
  };
}
