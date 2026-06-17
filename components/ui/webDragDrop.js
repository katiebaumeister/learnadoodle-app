import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

export const LEARNING_DAY_PLACEMENT_DRAG_MIME = 'application/x-learnadoodle-learning-day-placement';

let activeDragMime = null;
let activeDragPayload = null;

const DEBUG_WEB_DND = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

function logWebDnD(...args) {
  if (DEBUG_WEB_DND) {
    console.log('[WebDragDrop]', ...args);
  }
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('dragend', () => {
    logWebDnD('dragend — clearing active payload', { mime: activeDragMime, payload: activeDragPayload });
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
  if (!dt?.setData) {
    logWebDnD('writeWebDragPayload skipped — no dataTransfer.setData', { mimeType, payload });
    return;
  }
  const raw = JSON.stringify(payload);
  dt.setData(mimeType, raw);
  dt.setData('text/plain', raw);
  dt.effectAllowed = 'move';
  activeDragMime = mimeType;
  activeDragPayload = payload;
  logWebDnD('writeWebDragPayload', { mimeType, payload, types: Array.from(dt.types || []) });
}

export function readWebDragPayload(ev, mimeType, validate) {
  try {
    const dt = getEventDataTransfer(ev);
    const raw = dt?.getData?.(mimeType) || dt?.getData?.('text/plain');
    if (raw) {
      const payload = JSON.parse(raw);
      if (validate(payload)) {
        logWebDnD('readWebDragPayload from dataTransfer', { mimeType, payload });
        return payload;
      }
      logWebDnD('readWebDragPayload invalid payload from dataTransfer', { mimeType, raw });
    }
  } catch (err) {
    logWebDnD('readWebDragPayload dataTransfer parse error', { mimeType, error: err?.message });
  }
  if (activeDragMime === mimeType && activeDragPayload && validate(activeDragPayload)) {
    logWebDnD('readWebDragPayload from active payload fallback', { mimeType, payload: activeDragPayload });
    return activeDragPayload;
  }
  logWebDnD('readWebDragPayload miss', {
    mimeType,
    activeDragMime,
    activeDragPayload,
    types: Array.from(getEventDataTransfer(ev)?.types || []),
  });
  return null;
}

function useStableHandlerRef(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  return ref;
}

function attachDropListeners(node, handlersRef, { capture = false, debugLabel = 'drop-view' } = {}) {
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
    logWebDnD('dragenter accepted', {
      debugLabel,
      types: Array.from(getEventDataTransfer(ev)?.types || []),
      activeDragMime,
    });
    handlersRef.current.onDragEnter?.(ev);
  };
  const dragLeave = (ev) => {
    handlersRef.current.onDragLeave?.(ev);
  };
  const drop = (ev) => {
    const accepted = acceptDrag(ev);
    logWebDnD('drop event', {
      debugLabel,
      accepted,
      types: Array.from(getEventDataTransfer(ev)?.types || []),
      activeDragMime,
      activeDragPayload,
    });
    if (!accepted) return;
    ev.preventDefault();
    ev.stopPropagation();
    handlersRef.current.onDrop?.(ev);
  };

  node.addEventListener('dragover', dragOver, capture);
  node.addEventListener('dragenter', dragEnter, capture);
  node.addEventListener('dragleave', dragLeave, capture);
  node.addEventListener('drop', drop, capture);
  logWebDnD('attachDropListeners', { debugLabel, capture, tagName: node.tagName });

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
  debugLabel = 'drag-handle',
}) {
  const ref = useRef(null);
  const onDragStartRef = useStableHandlerRef({ onDragStart });

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return undefined;
    const node = resolveWebDomNode(ref.current);
    if (!node) {
      logWebDnD('WebDragHandle — could not resolve DOM node', { debugLabel, ref: ref.current });
      return undefined;
    }

    node.draggable = true;
    const handleDragStart = (ev) => {
      logWebDnD('dragstart', { debugLabel, types: Array.from(getEventDataTransfer(ev)?.types || []) });
      onDragStartRef.current.onDragStart?.(ev);
    };
    const handleMouseDown = (ev) => {
      ev.stopPropagation();
    };
    node.addEventListener('dragstart', handleDragStart);
    node.addEventListener('mousedown', handleMouseDown);
    logWebDnD('WebDragHandle ready', { debugLabel, tagName: node.tagName });
    return () => {
      node.draggable = false;
      node.removeEventListener('dragstart', handleDragStart);
      node.removeEventListener('mousedown', handleMouseDown);
    };
  }, [enabled, debugLabel]);

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
    debugLabel = 'drop-view',
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
      cleanupRef.current = attachDropListeners(domNode, handlersRef, { capture: dropCapture, debugLabel });
    } else if (Platform.OS === 'web' && node) {
      logWebDnD('WebDropView — could not resolve DOM node', { debugLabel, node });
    }
  }, [forwardedRef, dropCapture, debugLabel]);

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
