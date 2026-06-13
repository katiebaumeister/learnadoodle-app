import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ChevronDown } from 'lucide-react';
import Dropdown from '../../ui/Dropdown';
import {
  STUDENT_RESPONSE_TYPES,
  studentResponseTypeLabel,
  parseStudentResponseType,
} from '../../../lib/studentResponseTypes';
import { createModalStyles as styles, MUTED, ACCENT_TEXT, FG } from '../shared/createModalStyles';

export default function StudentResponseTypeField({
  value,
  onChange,
  label = 'Student response',
  required = false,
  disabled = false,
  placeholder = 'Select…',
  error = null,
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const selected = parseStudentResponseType(value);

  useEffect(() => {
    setOpen(false);
  }, [selected]);

  return (
    <View style={styles.formGroup}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        ref={triggerRef}
        style={[
          styles.select,
          styles.studentResponseSelect,
          disabled && { opacity: 0.6 },
          error && { borderColor: '#ef4444' },
        ]}
        onPress={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        {...(Platform.OS === 'web' && { cursor: disabled ? 'not-allowed' : 'pointer' })}
      >
        <Text
          style={[
            styles.selectText,
            styles.studentResponseSelectText,
            !selected && styles.selectPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selected ? studentResponseTypeLabel(selected) : placeholder}
        </Text>
        <ChevronDown size={16} color={MUTED} />
      </TouchableOpacity>
      {error ? <Text style={styles.errorTextSmall}>{error}</Text> : null}

      <Dropdown
        visible={open && !disabled}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        matchTriggerWidth
        maxHeight={260}
        offset={4}
      >
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 256 }}
          {...(Platform.OS === 'web' && {
            style: { maxHeight: 256, overflowY: 'auto' },
          })}
        >
          {STUDENT_RESPONSE_TYPES.map((option) => {
            const active = selected === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => {
                  onChange?.(option.id);
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
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Dropdown>
    </View>
  );
}
