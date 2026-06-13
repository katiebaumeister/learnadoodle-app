import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ChevronDown } from 'lucide-react';
import Dropdown from '../../ui/Dropdown';
import { createModalStyles as styles, MUTED } from './createModalStyles';

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
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const selected = subjects.find((s) => String(s.id) === String(subjectId));

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
        <Text style={[styles.selectText, !selected && styles.selectPlaceholder]}>
          {selected?.name || placeholder}
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
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: active ? '#EFF6FF' : '#fff',
                  }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: active ? '#1D4ED8' : '#111827',
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
