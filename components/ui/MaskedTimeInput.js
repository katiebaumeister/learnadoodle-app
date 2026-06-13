import React, { useRef } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

const BORDER = '#e5e7eb';
const FG = '#111827';
const MUTED = '#6b7280';
const PLACEHOLDER = '#94A3B8';
export const TIME_MASK = '__:__ __';

export const formatTimeInput = (text, previousValue = '') => {
  if (!text || !String(text).trim()) return '';
  const raw = String(text);
  const upperText = raw.toUpperCase();
  const condensedUpperText = upperText.replace(/\s+/g, '');
  const hasExplicitAM = /\bAM\b/.test(upperText) || condensedUpperText.endsWith('AM');
  const hasExplicitPM = /\bPM\b/.test(upperText) || condensedUpperText.endsWith('PM');
  const hasPartialAM = !hasExplicitAM && !hasExplicitPM && condensedUpperText.includes('A');
  const hasPartialPM = !hasExplicitAM && !hasExplicitPM && condensedUpperText.includes('P');
  const previousUpper = String(previousValue || '').toUpperCase();
  const previousPeriod = previousUpper.includes('PM')
    ? 'PM'
    : previousUpper.includes('AM')
      ? 'AM'
      : '';
  let period = hasExplicitPM || hasPartialPM
    ? 'PM'
    : hasExplicitAM || hasPartialAM
      ? 'AM'
      : previousPeriod || '__';

  let hourDigits = '';
  let minuteDigits = '';
  if (raw.includes(':')) {
    const colonIndex = raw.indexOf(':');
    hourDigits = raw.slice(0, colonIndex).replace(/\D/g, '').slice(0, 2);
    minuteDigits = raw.slice(colonIndex + 1).replace(/\D/g, '').slice(0, 2);
  } else {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) {
      hourDigits = digits;
    } else {
      hourDigits = digits.slice(0, 2);
      minuteDigits = digits.slice(2);
    }
  }

  if (hourDigits.length === 2) {
    const hourNum = parseInt(hourDigits, 10);
    if (hourNum === 0) {
      hourDigits = '12';
    } else if (hourNum > 12) {
      minuteDigits = `${hourDigits[1]}${minuteDigits}`.slice(0, 2);
      hourDigits = hourDigits[0];
    }
  }

  if (minuteDigits.length === 2) {
    const minuteNum = parseInt(minuteDigits, 10);
    if (minuteNum > 59) {
      minuteDigits = '59';
    }
  }

  const hourMask = `${hourDigits[0] || '_'}${hourDigits[1] || '_'}`;
  const minuteMask = `${minuteDigits[0] || '_'}${minuteDigits[1] || '_'}`;
  const periodMask = `${period[0] || '_'}${period[1] || '_'}`;
  return `${hourMask}:${minuteMask} ${periodMask}`;
};

const TIME_TOKEN_INDEXES = [0, 1, 3, 4, 6, 7];
const DIGIT_TOKEN_INDEXES = [0, 1, 3, 4];

const setMaskedCaret = (inputEl, pos) => {
  if (Platform.OS !== 'web' || !inputEl) return;
  requestAnimationFrame(() => {
    try {
      inputEl.setSelectionRange(pos, pos);
    } catch (_) {
      // Ignore selection errors in unsupported states.
    }
  });
};

const normalizeMask = (value, previousValue = '') => {
  const next = formatTimeInput(value || TIME_MASK, previousValue || '');
  return next || TIME_MASK;
};

const nextTokenIndex = (pos, inclusive = true) => {
  for (const idx of TIME_TOKEN_INDEXES) {
    if ((inclusive && idx >= pos) || (!inclusive && idx > pos)) return idx;
  }
  return TIME_TOKEN_INDEXES[TIME_TOKEN_INDEXES.length - 1];
};

const prevTokenIndex = (pos, inclusive = true) => {
  for (let i = TIME_TOKEN_INDEXES.length - 1; i >= 0; i -= 1) {
    const idx = TIME_TOKEN_INDEXES[i];
    if ((inclusive && idx <= pos) || (!inclusive && idx < pos)) return idx;
  }
  return TIME_TOKEN_INDEXES[0];
};

const clearTokenAt = (chars, idx) => {
  if (!TIME_TOKEN_INDEXES.includes(idx)) return;
  chars[idx] = '_';
  if (idx === 6 || idx === 7) {
    chars[6] = '_';
    chars[7] = '_';
  }
};

const snapTimeCaretToToken = (inputEl) => {
  if (Platform.OS !== 'web' || !inputEl) return;
  const caret = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : 0;
  if (TIME_TOKEN_INDEXES.includes(caret)) return;
  if (caret <= 2) {
    setMaskedCaret(inputEl, caret <= 1 ? caret : 3);
    return;
  }
  if (caret <= 5) {
    setMaskedCaret(inputEl, caret <= 4 ? caret : 6);
    return;
  }
  setMaskedCaret(inputEl, caret >= 7 ? 7 : 6);
};

const handleTimeMaskedWebKeyDown = (e, value, setValue) => {
  if (Platform.OS !== 'web') return;
  const key = String(e.key || '');
  if (key === 'Tab') return;
  const inputEl = e.currentTarget;
  const current = normalizeMask(value, value);
  const chars = current.split('');
  const start = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : 0;
  const end = typeof inputEl.selectionEnd === 'number' ? inputEl.selectionEnd : start;
  const hasSelection = end > start;
  const clearSelectionTokens = () => {
    if (!hasSelection) return false;
    for (const idx of TIME_TOKEN_INDEXES) {
      if (idx >= start && idx < end) clearTokenAt(chars, idx);
    }
    return true;
  };

  if (key === 'ArrowLeft') {
    e.preventDefault();
    setMaskedCaret(inputEl, prevTokenIndex(start, false));
    return;
  }
  if (key === 'ArrowRight') {
    e.preventDefault();
    setMaskedCaret(inputEl, nextTokenIndex(start, false));
    return;
  }
  if (key === 'Home') {
    e.preventDefault();
    setMaskedCaret(inputEl, 0);
    return;
  }
  if (key === 'End') {
    e.preventDefault();
    setMaskedCaret(inputEl, 7);
    return;
  }
  if (key === 'Backspace') {
    e.preventDefault();
    if (clearSelectionTokens()) {
      const nextValue = chars.join('');
      setValue(nextValue);
      setMaskedCaret(inputEl, prevTokenIndex(start, true));
      return;
    }
    const target = prevTokenIndex(start, false);
    clearTokenAt(chars, target);
    const nextValue = chars.join('');
    setValue(nextValue);
    setMaskedCaret(inputEl, target);
    return;
  }
  if (key === 'Delete') {
    e.preventDefault();
    if (clearSelectionTokens()) {
      const nextValue = chars.join('');
      setValue(nextValue);
      setMaskedCaret(inputEl, start);
      return;
    }
    const target = nextTokenIndex(start, true);
    clearTokenAt(chars, target);
    const nextValue = chars.join('');
    setValue(nextValue);
    setMaskedCaret(inputEl, target);
    return;
  }

  if (key.length !== 1) return;
  const upper = key.toUpperCase();
  const isDigit = /^[0-9]$/.test(upper);
  const isPeriodKey = upper === 'A' || upper === 'P' || upper === 'M';
  if (!isDigit && !isPeriodKey) {
    e.preventDefault();
    return;
  }

  e.preventDefault();
  clearSelectionTokens();
  let target = nextTokenIndex(start, true);

  if (isDigit) {
    if (!DIGIT_TOKEN_INDEXES.includes(target)) {
      target = nextTokenIndex(0, true);
    }
    if (target === 0 && Number(upper) > 1) {
      chars[0] = '0';
      chars[1] = upper;
      const nextValue = chars.join('');
      setValue(nextValue);
      setMaskedCaret(inputEl, 3);
      return;
    }
    if (target === 1 && chars[0] === '_') {
      chars[0] = '0';
    }
    if (target === 0 && Number(upper) > 1) return;
    if (target === 1) {
      const tens = chars[0];
      if (tens === '1' && Number(upper) > 2) return;
    }
    if (target === 3 && Number(upper) > 5) return;
    chars[target] = upper;
    const nextValue = chars.join('');
    setValue(nextValue);
    setMaskedCaret(inputEl, nextTokenIndex(target, false));
    return;
  }

  if (upper === 'A' || upper === 'P') {
    chars[6] = upper;
    chars[7] = 'M';
    const nextValue = chars.join('');
    setValue(nextValue);
    setMaskedCaret(inputEl, 7);
    return;
  }
  if (upper === 'M' && (chars[6] === 'A' || chars[6] === 'P')) {
    chars[7] = 'M';
    const nextValue = chars.join('');
    setValue(nextValue);
    setMaskedCaret(inputEl, 7);
  }
};

export default function MaskedTimeInput({
  value,
  onChangeText,
  onBlur,
  placeholder = 'Optional',
  placeholderTextColor = PLACEHOLDER,
  disabled = false,
  hasError = false,
  wrapStyle,
  inputStyle,
}) {
  const inputRef = useRef(null);
  const justFocusedRef = useRef(false);

  const handleFocus = () => {
    justFocusedRef.current = true;
    if (!value) {
      onChangeText(TIME_MASK);
    }
    if (Platform.OS === 'web') {
      requestAnimationFrame(() => {
        try {
          inputRef.current?.setSelectionRange(0, 0);
        } catch (_) {}
      });
    }
  };

  const handleBlur = () => {
    justFocusedRef.current = false;
    const nextValue = value === TIME_MASK ? '' : value;
    if (value === TIME_MASK) {
      onChangeText('');
    }
    onBlur?.(nextValue);
  };

  const borderColor = hasError ? '#ef4444' : BORDER;

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.wrap, wrapStyle]}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value || ''}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => handleTimeMaskedWebKeyDown(e, value, onChangeText)}
          onMouseUp={(e) => {
            if (justFocusedRef.current) {
              justFocusedRef.current = false;
              setMaskedCaret(e.currentTarget, 0);
              return;
            }
            snapTimeCaretToToken(e.currentTarget);
          }}
          onChange={(e) => {
            const rawValue = e.target.value || '';
            onChangeText(formatTimeInput(rawValue, value));
          }}
          disabled={disabled}
          style={{
            backgroundColor: disabled ? '#F8FAFC' : '#ffffff',
            borderRadius: 14,
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 12,
            paddingRight: 12,
            borderWidth: 1,
            borderColor,
            borderStyle: 'solid',
            fontSize: 14,
            color: disabled ? MUTED : FG,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            height: 'auto',
            outline: 'none',
            opacity: disabled ? 0.9 : 1,
            fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            ...(inputStyle || {}),
            ...(Platform.OS === 'web' ? {
              // @ts-ignore — RN Web forwards pseudo-selectors on DOM nodes
              '::placeholder': { color: placeholderTextColor, opacity: 1 },
            } : {}),
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, wrapStyle]}>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        value={value}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChangeText={(text) => onChangeText(formatTimeInput(text, value))}
        style={[
          styles.input,
          disabled && styles.inputDisabled,
          hasError && styles.inputError,
          inputStyle,
        ]}
        editable={!disabled}
        autoCapitalize="characters"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    width: Platform.OS === 'web' ? 116 : '100%',
    maxWidth: Platform.OS === 'web' ? 116 : 180,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: FG,
    backgroundColor: '#fff',
    fontSize: 14,
    width: '100%',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inputDisabled: {
    backgroundColor: '#F8FAFC',
    color: MUTED,
  },
  inputError: {
    borderColor: '#ef4444',
  },
});
