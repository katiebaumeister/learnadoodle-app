import React, { useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Bold, Italic, Underline, List } from 'lucide-react';
import { createModalStyles as styles, PLACEHOLDER } from './createModalStyles';

function readSelection(text, inputRef, selectionRef) {
  if (Platform.OS === 'web') {
    const el = inputRef.current;
    if (el && typeof el.selectionStart === 'number') {
      return { start: el.selectionStart, end: el.selectionEnd };
    }
  }
  const fallback = selectionRef.current || { start: text.length, end: text.length };
  return {
    start: fallback.start ?? text.length,
    end: fallback.end ?? text.length,
  };
}

function wrapSelection(text, selection, wrapper, emptyMarker) {
  const start = selection.start;
  const end = selection.end;
  const selected = text.slice(start, end);
  const replacement = selected ? `${wrapper}${selected}${wrapper}` : emptyMarker;
  const next = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
  const cursor = start + replacement.length;
  return { next, selectionStart: cursor, selectionEnd: cursor };
}

function prefixCurrentLine(text, selection, prefix) {
  const start = selection.start;
  const lines = text.split('\n');
  const lineIndex = Math.max(0, text.substring(0, start).split('\n').length - 1);
  const line = lines[lineIndex] ?? '';
  lines[lineIndex] = line.trim() === '' ? prefix : `${prefix}${line.replace(/^[•\-*]\s*/, '')}`;
  const next = lines.join('\n');
  const lineStart = lineIndex === 0
    ? 0
    : lines.slice(0, lineIndex).join('\n').length + 1;
  const cursor = lineStart + lines[lineIndex].length;
  return { next, selectionStart: cursor, selectionEnd: cursor };
}

export default function InstructionsEditor({
  value,
  onChangeText,
  label = 'Instructions',
  placeholder = 'Add instructions for students…',
}) {
  const inputRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  const restoreSelection = (start, end) => {
    if (Platform.OS !== 'web') return;
    const el = inputRef.current;
    if (!el) return;
    setTimeout(() => {
      el.focus?.();
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(start, end);
      }
    }, 0);
  };

  const applyFormat = (mode) => {
    const current = String(value || '');
    const selection = readSelection(current, inputRef, selectionRef);
    let result;

    if (mode === 'bold') {
      result = wrapSelection(current, selection, '**', '**');
    } else if (mode === 'italic') {
      result = wrapSelection(current, selection, '_', '_');
    } else if (mode === 'underline') {
      result = wrapSelection(current, selection, '__', '__');
    } else if (mode === 'list') {
      result = prefixCurrentLine(current, selection, '• ');
    } else {
      return;
    }

    onChangeText?.(result.next);
    restoreSelection(result.selectionStart, result.selectionEnd);
  };

  const preventToolbarBlur = Platform.OS === 'web'
    ? { onMouseDown: (event) => event.preventDefault() }
    : {};

  return (
    <View style={styles.formGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={(event) => {
          selectionRef.current = event.nativeEvent.selection;
        }}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        style={[styles.notesTextArea, { minHeight: 120 }]}
        multiline
        textAlignVertical="top"
      />
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
        {[
          { mode: 'bold', Icon: Bold, label: 'Bold' },
          { mode: 'italic', Icon: Italic, label: 'Italic' },
          { mode: 'underline', Icon: Underline, label: 'Underline' },
          { mode: 'list', Icon: List, label: 'Bulleted list' },
        ].map(({ mode, Icon, label }) => (
          <TouchableOpacity
            key={mode}
            onPress={() => applyFormat(mode)}
            style={styles.attachActionButton}
            accessibilityLabel={label}
            {...preventToolbarBlur}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Icon size={14} color="#374151" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
