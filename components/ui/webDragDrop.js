import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

export const LEARNING_DAY_PLACEMENT_DRAG_MIME = 'application/x-learnadoodle-learning-day-placement';

let activeDragMime = null;
let activeDragPayload = null;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('dragend', () => {
    activeDragMime = null;
    activeDragPayload = null;
  });
}

export function resolveWebDomNode(node) {
  if (!node) return null;
  if (typeof node.addEventListener === 'function' && typeof node.getBoundingClientRect === 'function') {
    return node;
  }
  const native = node._nativeNode ?? node.__nativeNode ?? node.nativeElement;
  if (native && typeof native.addEventListener === 'function') return native;
  return null;
}

export function getEventDataTransfer(ev) {
  return ev?.nativeEvent?.dataTransfer ?? ev?.dataTransfer;
}

export function isWebDragOfType(ev, mimeType) {
  const types = getEventDataTransfer(ev)?.types;
  if (!types) return activeDragMime === mimeType;
  return Array.from(types).includes(mimeType);
}

export function writeWebDragPayload(ev, mimeType, payload) {
  const dt = getEventDataTransfer(ev);
  if (!dt?.setData) return;
  const raw = JSON.stringify(payload);
  dt.setData(mimeType, raw);
  dt.setData('text/plain', raw);
  dt.effectAllowed = 'move';
  activeDragMime = mimeType;
  activeDragPayload = payload;
}

export function readWebDragPayload(ev, mimeType, validate) {
  try {
    const dt = getEventDataTransfer(ev);
    const raw = dt?.getData?.(mimeType) || dt?.getData?.('text/plain');
    if (raw) {
      const payload = JSON.parse(raw);
      if (validate(payload)) return payload;
    }
  } catch (_) {
    // Fall through to in-memory payload.
  }
  if (activeDragMime === mimeType && activeDragPayload && validate(activeDragPayload)) {
    return activeDragPayload;
  }
  return null;
}

function useStableHandlerRef(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  return ref;
}

function attachDropListeners(node, handlersRef, { capture = false } = {}) {
  const acceptDrag = (ev) => {
    const accept = handlersRef.current.shouldAcceptDrag?.(ev);
    return accept !== false;
  };

  const dragOver = (ev) => {
    if (!acceptDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev?.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    handlersRef.current.onDragOver?.(ev);
  };
  const dragEnter = (ev) => {
    if (!acceptDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    handlersRef.current.onDragEnter?.(ev);
  };
  const dragLeave = (ev) => {
    handlersRef.current.onDragLeave?.(ev);
  };
  const drop = (ev) => {
    if (!acceptDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    handlersRef.current.onDrop?.(ev);
  };

  node.addEventListener('dragover', dragOver, capture);
  node.addEventListener('dragenter', dragEnter, capture);
  node.addEventListener('dragleave', dragLeave, capture);
  node.addEventListener('drop', drop, capture);

  return () => {
    node.removeEventListener('dragover', dragOver, capture);
    node.removeEventListener('dragenter', dragEnter, capture);
    node.removeEventListener('dragleave', dragLeave, capture);
    node.removeEventListener('drop', drop, capture);
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
    const node = resolveWebDomNode(ref.current);
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
    shouldAcceptDrag,
    dropCapture = false,
    style,
    children,
    ...rest
  },
  forwardedRef,
) {
  const innerRef = useRef(null);
  const cleanupRef = useRef(null);
  const handlersRef = useStableHandlerRef({
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    shouldAcceptDrag,
  });

  const setRef = useCallback((node) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    innerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
    const domNode = resolveWebDomNode(node);
    if (Platform.OS === 'web' && domNode) {
      cleanupRef.current = attachDropListeners(domNode, handlersRef, { capture: dropCapture });
    }
  }, [forwardedRef, dropCapture]);

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
