import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

export function getEventDataTransfer(ev) {
  return ev?.nativeEvent?.dataTransfer ?? ev?.dataTransfer;
}

export function writeWebDragPayload(ev, mimeType, payload) {
  const dt = getEventDataTransfer(ev);
  if (!dt?.setData) return;
  const raw = JSON.stringify(payload);
  dt.setData(mimeType, raw);
  dt.setData('text/plain', raw);
  dt.effectAllowed = 'move';
}

export function readWebDragPayload(ev, mimeType, validate) {
  try {
    const dt = getEventDataTransfer(ev);
    const raw = dt?.getData?.(mimeType) || dt?.getData?.('text/plain');
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return validate(payload) ? payload : null;
  } catch (_) {
    return null;
  }
}

function useStableHandlerRef(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  return ref;
}

function attachDropListeners(node, handlersRef) {
  const dragOver = (ev) => {
    ev.preventDefault();
    handlersRef.current.onDragOver?.(ev);
  };
  const dragEnter = (ev) => {
    ev.preventDefault();
    handlersRef.current.onDragEnter?.(ev);
  };
  const dragLeave = (ev) => {
    handlersRef.current.onDragLeave?.(ev);
  };
  const drop = (ev) => {
    ev.preventDefault();
    handlersRef.current.onDrop?.(ev);
  };

  node.addEventListener('dragover', dragOver);
  node.addEventListener('dragenter', dragEnter);
  node.addEventListener('dragleave', dragLeave);
  node.addEventListener('drop', drop);

  return () => {
    node.removeEventListener('dragover', dragOver);
    node.removeEventListener('dragenter', dragEnter);
    node.removeEventListener('dragleave', dragLeave);
    node.removeEventListener('drop', drop);
  };
}

/**
 * RN Web View strips draggable / drag event props. Attach them to the DOM node instead.
 */
export function WebDragHandle({
  enabled = true,
  onDragStart,
  style,
  children,
  accessibilityLabel,
}) {
  const ref = useRef(null);
  const onDragStartRef = useStableHandlerRef({ onDragStart });

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    node.draggable = true;
    const handleDragStart = (ev) => {
      onDragStartRef.current.onDragStart?.(ev);
    };
    const handleMouseDown = (ev) => {
      ev.stopPropagation();
    };
    node.addEventListener('dragstart', handleDragStart);
    node.addEventListener('mousedown', handleMouseDown);
    return () => {
      node.draggable = false;
      node.removeEventListener('dragstart', handleDragStart);
      node.removeEventListener('mousedown', handleMouseDown);
    };
  }, [enabled]);

  return (
    <View ref={ref} style={style} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

export const WebDropView = React.forwardRef(function WebDropView(
  {
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    style,
    children,
    ...rest
  },
  forwardedRef,
) {
  const innerRef = useRef(null);
  const cleanupRef = useRef(null);
  const handlersRef = useStableHandlerRef({ onDragOver, onDragEnter, onDragLeave, onDrop });

  const setRef = useCallback((node) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    innerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
    if (Platform.OS === 'web' && node) {
      cleanupRef.current = attachDropListeners(node, handlersRef);
    }
  }, [forwardedRef]);

  useLayoutEffect(() => () => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  return (
    <View ref={setRef} style={style} {...rest}>
      {children}
    </View>
  );
});
