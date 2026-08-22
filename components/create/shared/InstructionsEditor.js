import React, {
  forwardRef,
  useRef,
  useLayoutEffect,
  useCallback,
  useState,
  useEffect,
  useImperativeHandle,
} from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Bold, Italic, Underline, List } from 'lucide-react';
import { createModalStyles as styles, PLACEHOLDER, ACCENT_TEXT, FG } from './createModalStyles';
import { cleanInstructionMarkdown, htmlToMarkdown, markdownToHtml } from '../../../lib/instructionTextFormat';

const FORMAT_MODES = {
  bold: { wrapper: '**', emptyMarker: '****' },
  italic: { wrapper: '_', emptyMarker: '__' },
  underline: { wrapper: '__', emptyMarker: '____' },
};

const WEB_EDITOR_INNER_STYLE = {
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  fontSize: 14,
  lineHeight: '20px',
  color: FG,
  minHeight: 116,
  fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  width: '100%',
  boxSizing: 'border-box',
  padding: 0,
  flex: 1,
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

function isSelectionInsideElement(el, selection) {
  if (!el || !selection) return false;
  const anchor = selection.anchorNode;
  if (!anchor) return false;
  return el.contains(anchor);
}

function readWebFormatState(editableEl) {
  if (!editableEl || typeof document === 'undefined') {
    return { bold: false, italic: false, underline: false };
  }

  const sel = document.getSelection?.();
  const activeEl = document.activeElement;
  const editorHasFocus =
    activeEl === editableEl || (activeEl != null && editableEl.contains(activeEl));
  const selectionInsideEditor = isSelectionInsideElement(editableEl, sel);

  if (!editorHasFocus && !selectionInsideEditor) {
    return { bold: false, italic: false, underline: false };
  }

  if (sel) {
    let node = sel.anchorNode || null;
    const formats = { bold: false, italic: false, underline: false };
    while (node && node !== editableEl) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName?.toUpperCase?.() || '';
        if (tag === 'STRONG' || tag === 'B') formats.bold = true;
        if (tag === 'EM' || tag === 'I') formats.italic = true;
        if (tag === 'U') formats.underline = true;
        if (tag === 'SPAN' && node.style) {
          const weight = node.style.fontWeight;
          if (weight === 'bold' || weight === '700' || Number(weight) >= 600) formats.bold = true;
          const decoration = node.style.textDecoration || node.style.textDecorationLine || '';
          if (String(decoration).includes('underline')) formats.underline = true;
          if (node.style.fontStyle === 'italic') formats.italic = true;
        }
      }
      node = node.parentNode;
    }
    if (formats.bold || formats.italic || formats.underline) return formats;
  }

  if (!editorHasFocus) {
    return { bold: false, italic: false, underline: false };
  }

  try {
    return {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    };
  } catch (_) {
    return { bold: false, italic: false, underline: false };
  }
}

function FormatToolbar({ activeFormats, onPress, detectedFormats }) {
  return (
    <View data-format-toolbar="true" style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
      {[
        { mode: 'bold', Icon: Bold, label: 'Bold' },
        { mode: 'italic', Icon: Italic, label: 'Italic' },
        { mode: 'underline', Icon: Underline, label: 'Underline' },
        { mode: 'list', Icon: List, label: 'Bulleted list' },
      ].map(({ mode, Icon, label: actionLabel }) => {
        const isActive = mode !== 'list' && (detectedFormats?.[mode] || activeFormats[mode]);
        const buttonStyle = [
          styles.attachActionButton,
          isActive && styles.attachActionButtonActive,
          Platform.OS === 'web' && { cursor: 'pointer' },
        ];
        const iconColor = isActive ? ACCENT_TEXT : '#374151';

        if (Platform.OS === 'web') {
          return (
            <View
              key={mode}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              accessibilityState={{ selected: isActive }}
              onMouseDown={(event) => onPress(mode, event)}
              style={buttonStyle}
            >
              <Icon size={14} color={iconColor} />
            </View>
          );
        }

        return (
          <TouchableOpacity
            key={mode}
            onPress={() => onPress(mode)}
            style={buttonStyle}
            accessibilityLabel={actionLabel}
            accessibilityState={{ selected: isActive }}
          >
            <Icon size={14} color={iconColor} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function WebInstructionsEditor({
  value,
  onChangeText,
  label,
  placeholder,
  autoFocus,
  hideToolbar,
  textAreaStyle,
  editorRef,
}) {
  const containerRef = useRef(null);
  const editableRef = useRef(null);
  const skipExternalSyncRef = useRef(false);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false });

  const syncPlaceholder = useCallback((el) => {
    if (!el) return;
    const empty = !el.textContent?.replace(/\u200B/g, '').trim() && !el.querySelector('ul,ol');
    if (empty) {
      el.setAttribute('data-placeholder', placeholder || '');
    } else {
      el.removeAttribute('data-placeholder');
    }
  }, [placeholder]);

  const emitMarkdown = useCallback((el) => {
    if (!el) return '';
    const markdown = cleanInstructionMarkdown(htmlToMarkdown(el).replace(/\u200B/g, ''));
    syncPlaceholder(el);
    onChangeText?.(markdown);
    return markdown;
  }, [onChangeText, syncPlaceholder]);

  useImperativeHandle(editorRef, () => ({
    getMarkdown: () => {
      const el = editableRef.current;
      if (!el) return String(value ?? '');
      return cleanInstructionMarkdown(htmlToMarkdown(el).replace(/\u200B/g, ''));
    },
  }), [value]);

  const refreshFormatState = useCallback(() => {
    setActiveFormats(readWebFormatState(editableRef.current));
  }, []);

  const applyMarkdownToEditor = useCallback((el, markdown) => {
    if (!el) return;
    skipExternalSyncRef.current = true;
    el.innerHTML = markdownToHtml(markdown);
    syncPlaceholder(el);
    requestAnimationFrame(() => {
      skipExternalSyncRef.current = false;
      refreshFormatState();
    });
  }, [syncPlaceholder, refreshFormatState]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    const host = container._nativeNode || container;
    if (!host || typeof host.appendChild !== 'function') return undefined;

    const el = document.createElement('div');
    el.className = 'instructions-wysiwyg-editor';
    el.contentEditable = 'true';
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    el.setAttribute('aria-label', label || 'Instructions');
    Object.assign(el.style, WEB_EDITOR_INNER_STYLE);

    const handleInput = () => {
      emitMarkdown(el);
      refreshFormatState();
    };

    const handleBlur = () => {
      emitMarkdown(el);
      setActiveFormats({ bold: false, italic: false, underline: false });
    };

    const onSelectionActivity = () => refreshFormatState();

    el.addEventListener('input', handleInput);
    el.addEventListener('blur', handleBlur);
    el.addEventListener('keyup', onSelectionActivity);
    el.addEventListener('mouseup', onSelectionActivity);
    el.addEventListener('focus', onSelectionActivity);
    document.addEventListener('selectionchange', onSelectionActivity);

    host.appendChild(el);
    editableRef.current = el;
    applyMarkdownToEditor(el, value);

    if (autoFocus) {
      requestAnimationFrame(() => el.focus());
    }

    return () => {
      el.removeEventListener('input', handleInput);
      el.removeEventListener('blur', handleBlur);
      el.removeEventListener('keyup', onSelectionActivity);
      el.removeEventListener('mouseup', onSelectionActivity);
      el.removeEventListener('focus', onSelectionActivity);
      document.removeEventListener('selectionchange', onSelectionActivity);
      if (el.parentNode) el.parentNode.removeChild(el);
      editableRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const el = editableRef.current;
    if (!el || skipExternalSyncRef.current) return;
    const current = htmlToMarkdown(el).replace(/\u200B/g, '');
    const next = String(value ?? '');
    if (current !== next) {
      applyMarkdownToEditor(el, next);
    }
  }, [value, applyMarkdownToEditor]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;

    const styleId = 'instructions-wysiwyg-placeholder-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .instructions-wysiwyg-editor {
          margin: 0;
        }
        .instructions-wysiwyg-editor p,
        .instructions-wysiwyg-editor div,
        .instructions-wysiwyg-editor ul,
        .instructions-wysiwyg-editor ol {
          margin: 0;
          padding: 0;
        }
        .instructions-wysiwyg-editor ul,
        .instructions-wysiwyg-editor ol {
          padding-left: 1.25em;
        }
        .instructions-wysiwyg-editor li {
          margin: 0;
        }
        .instructions-wysiwyg-editor[data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: ${PLACEHOLDER};
          pointer-events: none;
        }
        .instructions-wysiwyg-editor strong,
        .instructions-wysiwyg-editor b { font-weight: 700; }
        .instructions-wysiwyg-editor em,
        .instructions-wysiwyg-editor i { font-style: italic; }
        .instructions-wysiwyg-editor u { text-decoration: underline; }
      `;
      document.head.appendChild(style);
    }

    return undefined;
  }, []);

  const handleToolbarPress = useCallback((mode, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const el = editableRef.current;
    if (!el) return;
    el.focus();

    if (mode === 'bold') document.execCommand('bold');
    else if (mode === 'italic') document.execCommand('italic');
    else if (mode === 'underline') document.execCommand('underline');
    else if (mode === 'list') document.execCommand('insertUnorderedList');

    emitMarkdown(el);
    refreshFormatState();
  }, [emitMarkdown, refreshFormatState]);

  return (
    <View style={styles.formGroup}>
      {label != null && label !== '' ? (
        <Text style={styles.fieldLabel}>{label}</Text>
      ) : null}
      <View
        ref={containerRef}
        style={[styles.webInstructionsEditorWrap, styles.notesTextArea, textAreaStyle]}
      />
      {!hideToolbar ? (
        <FormatToolbar activeFormats={activeFormats} onPress={handleToolbarPress} />
      ) : null}
    </View>
  );
}

function NativeInstructionsEditor({
  value,
  onChangeText,
  label,
  placeholder,
  autoFocus,
  hideToolbar,
  textAreaStyle,
  editorRef,
}) {
  const inputRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const pendingSelectionRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false });

  const textValue = String(value ?? '');

  useImperativeHandle(editorRef, () => ({
    getMarkdown: () => textValue,
  }), [textValue]);

  const syncSelection = useCallback((start, end) => {
    const safeStart = typeof start === 'number' ? start : 0;
    const safeEnd = typeof end === 'number' ? end : safeStart;
    selectionRef.current = { start: safeStart, end: safeEnd };
  }, []);

  useLayoutEffect(() => {
    if (!pendingSelectionRef.current) return;
    const { start, end } = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    const el = resolveWebTextInputElement(inputRef);
    if (!el || typeof el.setSelectionRange !== 'function') return;
    try {
      el.focus();
      el.setSelectionRange(start, end);
      selectionRef.current = { start, end };
      setActiveFormats(detectActiveFormats(textValue, start));
    } catch (_) {
      /* ignore */
    }
  }, [textValue]);

  const commitChange = useCallback((next, selectionStart, selectionEnd) => {
    pendingSelectionRef.current = { start: selectionStart, end: selectionEnd };
    selectionRef.current = { start: selectionStart, end: selectionEnd };
    setActiveFormats(detectActiveFormats(next, selectionStart));
    onChangeText?.(next);
  }, [onChangeText]);

  const applyFormat = useCallback((mode) => {
    const current = textValue;
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
  }, [textValue, commitChange]);

  const handleSelectionChange = useCallback((event) => {
    const { start, end } = event.nativeEvent.selection;
    syncSelection(start, end);
    setActiveFormats(detectActiveFormats(textValue, start));
  }, [syncSelection, textValue]);

  const cursor = selectionRef.current?.start ?? 0;
  const detectedFormats = detectActiveFormats(textValue, cursor);

  return (
    <View style={styles.formGroup}>
      {label != null && label !== '' ? (
        <Text style={styles.fieldLabel}>{label}</Text>
      ) : null}
      <TextInput
        ref={inputRef}
        value={textValue}
        onChangeText={onChangeText}
        onSelectionChange={handleSelectionChange}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        style={[styles.notesTextArea, textAreaStyle]}
        multiline
        textAlignVertical="top"
        autoFocus={autoFocus}
        editable
      />
      {!hideToolbar ? (
        <FormatToolbar
          activeFormats={activeFormats}
          detectedFormats={detectedFormats}
          onPress={(mode) => applyFormat(mode)}
        />
      ) : null}
    </View>
  );
}

const InstructionsEditor = forwardRef(function InstructionsEditor(props, ref) {
  if (Platform.OS === 'web') {
    return <WebInstructionsEditor {...props} editorRef={ref} />;
  }
  return <NativeInstructionsEditor {...props} editorRef={ref} />;
});

export default InstructionsEditor;
