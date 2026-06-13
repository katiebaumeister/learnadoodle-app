import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ChevronDown } from 'lucide-react';
import Dropdown from '../../ui/Dropdown';
import { createModalStyles as styles, MUTED, ACCENT_TEXT, FG } from './createModalStyles';

export default function SubjectSelectField({
  subjects = [],
  subjectId,
  onSubjectChange,
  label = 'Subject',
  required = false,
  error = null,
  placeholder = 'Select subject',
  disabled = false,
  emptyMessage = 'No subjects available',
  allowEmpty = false,
  noneLabel = 'No subject',
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const selected = subjects.find((s) => String(s.id) === String(subjectId));
  const displayValue = selected?.name || (allowEmpty ? noneLabel : placeholder);
  const showPlaceholderStyle = !selected && !allowEmpty;

  useEffect(() => {
    setOpen(false);
  }, [subjectId]);

  return (
    <View style={styles.formGroup}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        ref={triggerRef}
        style={[styles.select, disabled && { opacity: 0.6 }, error && { borderColor: '#ef4444' }]}
        onPress={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        {...(Platform.OS === 'web' && { cursor: disabled ? 'not-allowed' : 'pointer' })}
      >
        <Text style={[styles.selectText, showPlaceholderStyle && styles.selectPlaceholder]}>
          {displayValue}
        </Text>
        <ChevronDown size={16} color={MUTED} />
      </TouchableOpacity>

      <Dropdown
        visible={open && !disabled}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        matchTriggerWidth
        maxHeight={220}
        offset={4}
      >
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 216 }}
          {...(Platform.OS === 'web' && {
            style: { maxHeight: 216, overflowY: 'auto' },
          })}
        >
          {allowEmpty ? (
            <TouchableOpacity
              onPress={() => {
                onSubjectChange?.(null);
                setOpen(false);
              }}
              style={[
                { paddingVertical: 10, paddingHorizontal: 12 },
                subjectId == null ? styles.dropdownListItemActive : { backgroundColor: '#fff' },
              ]}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: subjectId == null ? ACCENT_TEXT : FG,
                  fontWeight: subjectId == null ? '600' : '400',
                }}
              >
                {noneLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
          {subjects.length === 0 ? (
            <View style={{ padding: 12 }}>
              <Text style={{ fontSize: 13, color: MUTED }}>{emptyMessage}</Text>
            </View>
          ) : (
            subjects.map((subject) => {
              const active = String(subject.id) === String(subjectId);
              return (
                <TouchableOpacity
                  key={String(subject.id)}
                  onPress={() => {
                    onSubjectChange?.(subject.id);
                    setOpen(false);
                  }}
                  style={[
                    { paddingVertical: 10, paddingHorizontal: 12 },
                    active ? styles.dropdownListItemActive : { backgroundColor: '#fff' },
                  ]}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: active ? ACCENT_TEXT : FG,
                      fontWeight: active ? '600' : '400',
                    }}
                  >
                    {subject.name}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </Dropdown>

      {error ? <Text style={styles.errorTextSmall}>{error}</Text> : null}
    </View>
  );
}
