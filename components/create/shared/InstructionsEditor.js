import React, { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Bold, Italic, Underline, List } from 'lucide-react';
import { createModalStyles as styles, PLACEHOLDER, ACCENT_TEXT } from './createModalStyles';

const FORMAT_MODES = {
  bold: { wrapper: '**', emptyMarker: '****' },
  italic: { wrapper: '_', emptyMarker: '__' },
  underline: { wrapper: '__', emptyMarker: '____' },
};

function resolveWebTextInputElement(inputRef) {
  if (Platform.OS !== 'web' || !inputRef?.current) return null;
  const raw = inputRef.current;
  const candidates = [raw, raw._nativeNode, raw.__nativeNode];
  if (typeof raw.getNativeNode === 'function') {
    try {
      candidates.push(raw.getNativeNode());
    } catch (_) {
      /* ignore */
    }
  }
  for (const node of candidates) {
    if (!node) continue;
    if (node.tagName === 'TEXTAREA' && typeof node.selectionStart === 'number') {
      return node;
    }
    if (typeof node.selectionStart === 'number' && typeof node.setSelectionRange === 'function') {
      return node;
    }
    if (typeof node.querySelector === 'function') {
      const nested = node.querySelector('textarea');
      if (nested && typeof nested.selectionStart === 'number') return nested;
    }
  }
  return null;
}

function countWrappersBefore(text, cursor, wrapper) {
  const before = text.slice(0, cursor);
  let count = 0;
  let idx = 0;
  while (idx <= before.length - wrapper.length) {
    const found = before.indexOf(wrapper, idx);
    if (found === -1) break;
    count += 1;
    idx = found + wrapper.length;
  }
  return count;
}

function isInsideWrapper(text, cursor, wrapper) {
  return countWrappersBefore(text, cursor, wrapper) % 2 === 1;
}

function detectActiveFormats(text, cursor) {
  const content = String(text || '');
  const pos = Math.max(0, Math.min(cursor ?? 0, content.length));
  return {
    bold: isInsideWrapper(content, pos, '**'),
    italic: isInsideWrapper(content, pos, '_') && !isInsideWrapper(content, pos, '__'),
    underline: isInsideWrapper(content, pos, '__'),
  };
}

function wrapSelection(text, selection, wrapper, emptyMarker) {
  const start = selection.start;
  const end = selection.end;
  const selected = text.slice(start, end);
  if (selected && selected.startsWith(wrapper) && selected.endsWith(wrapper) && selected.length >= wrapper.length * 2) {
    const unwrapped = selected.slice(wrapper.length, selected.length - wrapper.length);
    const next = `${text.slice(0, start)}${unwrapped}${text.slice(end)}`;
    const cursor = start + unwrapped.length;
    return { next, selectionStart: cursor, selectionEnd: cursor };
  }
  const replacement = selected ? `${wrapper}${selected}${wrapper}` : emptyMarker;
  const next = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
  if (!selected) {
    const cursor = start + wrapper.length;
    return { next, selectionStart: cursor, selectionEnd: cursor };
  }
  const cursor = start + replacement.length;
  return { next, selectionStart: cursor, selectionEnd: cursor };
}

function openFormatAtCursor(text, cursor, wrapper) {
  const emptyMarker = wrapper + wrapper;
  const next = `${text.slice(0, cursor)}${emptyMarker}${text.slice(cursor)}`;
  return { next, selectionStart: cursor + wrapper.length, selectionEnd: cursor + wrapper.length };
}

function closeFormatAtCursor(text, cursor, wrapper) {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  if (before.endsWith(wrapper) && after.startsWith(wrapper)) {
    const next = `${before.slice(0, -wrapper.length)}${after.slice(wrapper.length)}`;
    return { next, selectionStart: cursor - wrapper.length, selectionEnd: cursor - wrapper.length };
  }
  if (isInsideWrapper(text, cursor, wrapper)) {
    const next = `${before}${wrapper}${after}`;
    return { next, selectionStart: cursor, selectionEnd: cursor };
  }
  return { next: text, selectionStart: cursor, selectionEnd: cursor };
}

function prefixCurrentLine(text, selection, prefix = '• ') {
  const content = String(text ?? '');
  const start = Math.max(
    0,
    Math.min(typeof selection?.start === 'number' ? selection.start : content.length, content.length),
  );
  const lines = content.split('\n');
  const lineIndex = Math.min(
    Math.max(0, content.substring(0, start).split('\n').length - 1),
    Math.max(0, lines.length - 1),
  );
  const line = lines[lineIndex] ?? '';
  const bulletPrefix = String(prefix ?? '• ');
  lines[lineIndex] = line.trim() === ''
    ? bulletPrefix
    : `${bulletPrefix}${line.replace(/^[•\-*]\s*/, '')}`;
  const updatedLine = lines[lineIndex] ?? '';
  const next = lines.join('\n');
  const lineStart = lineIndex === 0
    ? 0
    : lines.slice(0, lineIndex).join('\n').length + 1;
  const cursor = lineStart + updatedLine.length;
  return { next, selectionStart: cursor, selectionEnd: cursor };
}

export default function InstructionsEditor({
  value,
  onChangeText,
  label = 'Instructions',
  placeholder = 'Add instructions for students…',
  autoFocus = false,
  hideToolbar = false,
  textAreaStyle = null,
}) {
  const inputRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const pendingSelectionRef = useRef(null);
  const toolbarRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false });

  const persistSelectionFromElement = useCallback((el) => {
    if (!el || typeof el.selectionStart !== 'number') return;
    selectionRef.current = {
      start: el.selectionStart,
      end: el.selectionEnd ?? el.selectionStart,
    };
    setActiveFormats(detectActiveFormats(String(value || ''), el.selectionStart));
  }, [value]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    let el = null;
    let saveSelection = null;
    let cancelled = false;

    const attach = () => {
      if (cancelled) return;
      el = resolveWebTextInputElement(inputRef);
      if (!el) return;
      saveSelection = () => persistSelectionFromElement(el);
      el.addEventListener('select', saveSelection);
      el.addEventListener('keyup', saveSelection);
      el.addEventListener('mouseup', saveSelection);
      el.addEventListener('click', saveSelection);
      el.addEventListener('input', saveSelection);
    };

    const onDocumentSelectionChange = () => {
      if (!el || document.activeElement !== el) return;
      saveSelection?.();
    };

    attach();
    const retryId = requestAnimationFrame(attach);
    document.addEventListener('selectionchange', onDocumentSelectionChange);

    return () => {
      cancelled = true;
      cancelAnimationFrame(retryId);
      document.removeEventListener('selectionchange', onDocumentSelectionChange);
      if (el && saveSelection) {
        el.removeEventListener('select', saveSelection);
        el.removeEventListener('keyup', saveSelection);
        el.removeEventListener('mouseup', saveSelection);
        el.removeEventListener('click', saveSelection);
        el.removeEventListener('input', saveSelection);
      }
    };
  }, [persistSelectionFromElement]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !pendingSelectionRef.current) return;
    const { start, end } = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    const el = resolveWebTextInputElement(inputRef);
    if (!el || typeof el.setSelectionRange !== 'function') return;
    try {
      el.focus();
      el.setSelectionRange(start, end);
      selectionRef.current = { start, end };
      setActiveFormats(detectActiveFormats(String(value || ''), start));
    } catch (_) {
      /* ignore */
    }
  }, [value]);

  const commitChange = useCallback((next, selectionStart, selectionEnd) => {
    pendingSelectionRef.current = { start: selectionStart, end: selectionEnd };
    selectionRef.current = { start: selectionStart, end: selectionEnd };
    setActiveFormats(detectActiveFormats(next, selectionStart));
    onChangeText?.(next);
  }, [onChangeText]);

  const applyFormat = useCallback((mode) => {
    const current = String(value || '');
    const saved = selectionRef.current;
    const start = typeof saved?.start === 'number' ? saved.start : current.length;
    const end = typeof saved?.end === 'number' ? saved.end : start;
    const hasRange = end > start;

    if (mode === 'list') {
      const result = prefixCurrentLine(current, { start, end }, '• ');
      commitChange(result.next, result.selectionStart, result.selectionEnd);
      return;
    }

    const { wrapper, emptyMarker } = FORMAT_MODES[mode];
    if (hasRange) {
      const result = wrapSelection(current, { start, end }, wrapper, emptyMarker);
      commitChange(result.next, result.selectionStart, result.selectionEnd);
      return;
    }

    const inside = isInsideWrapper(current, start, wrapper);
    if (inside) {
      const result = closeFormatAtCursor(current, start, wrapper);
      commitChange(result.next, result.selectionStart, result.selectionEnd);
      return;
    }

    const result = openFormatAtCursor(current, start, wrapper);
    commitChange(result.next, result.selectionStart, result.selectionEnd);
  }, [value, commitChange]);

  const handleToolbarPress = useCallback((mode, event) => {
    if (Platform.OS === 'web') {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const el = resolveWebTextInputElement(inputRef);
      if (el && typeof el.selectionStart === 'number' && document.activeElement === el) {
        selectionRef.current = {
          start: el.selectionStart,
          end: el.selectionEnd ?? el.selectionStart,
        };
      }
    }
    applyFormat(mode);
  }, [applyFormat]);

  const handleChangeText = useCallback((text) => {
    onChangeText?.(text);
    requestAnimationFrame(() => {
      const el = resolveWebTextInputElement(inputRef);
      if (el && typeof el.selectionStart === 'number') {
        persistSelectionFromElement(el);
      }
    });
  }, [onChangeText, persistSelectionFromElement]);

  const cursor = selectionRef.current?.start ?? 0;
  const detectedFormats = detectActiveFormats(String(value || ''), cursor);

  return (
    <View style={styles.formGroup}>
      {label != null && label !== '' ? (
        <Text style={styles.fieldLabel}>{label}</Text>
      ) : null}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        onSelectionChange={(event) => {
          const { start, end } = event.nativeEvent.selection;
          selectionRef.current = { start, end };
          setActiveFormats(detectActiveFormats(String(value || ''), start));
        }}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        style={[styles.notesTextArea, { minHeight: 120 }, textAreaStyle]}
        multiline
        textAlignVertical="top"
        autoFocus={autoFocus}
      />
      {!hideToolbar ? (
        <View ref={toolbarRef} data-format-toolbar="true" style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {[
            { mode: 'bold', Icon: Bold, label: 'Bold' },
            { mode: 'italic', Icon: Italic, label: 'Italic' },
            { mode: 'underline', Icon: Underline, label: 'Underline' },
            { mode: 'list', Icon: List, label: 'Bulleted list' },
          ].map(({ mode, Icon, label: actionLabel }) => {
            const isActive = mode !== 'list' && (detectedFormats[mode] || activeFormats[mode]);
            const buttonStyle = [
              styles.attachActionButton,
              isActive && styles.attachActionButtonActive,
              Platform.OS === 'web' && { cursor: 'pointer' },
            ];
            const iconColor = isActive ? ACCENT_TEXT : '#374151';

            return Platform.OS === 'web' ? (
              <View
                key={mode}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
                accessibilityState={{ selected: isActive }}
                onMouseDown={(event) => handleToolbarPress(mode, event)}
                style={buttonStyle}
              >
                <Icon size={14} color={iconColor} />
              </View>
            ) : (
              <TouchableOpacity
                key={mode}
                onPress={() => applyFormat(mode)}
                style={buttonStyle}
                accessibilityLabel={actionLabel}
                accessibilityState={{ selected: isActive }}
              >
                <Icon size={14} color={iconColor} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
