import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ChevronDown } from 'lucide-react';
import Dropdown from '../../ui/Dropdown';
import { createModalStyles as styles, MUTED, ACCENT_TEXT, FG } from './createModalStyles';
import { fetchSubjectCurriculumEventsStructure } from '../../../lib/services/curriculumClient';

function SelectField({
  label,
  value,
  displayValue,
  placeholder,
  disabled = false,
  options = [],
  onSelect,
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const showPlaceholder = !value;

  useEffect(() => {
    setOpen(false);
  }, [value, disabled]);

  return (
    <View style={styles.formGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        ref={triggerRef}
        style={[styles.select, disabled && { opacity: 0.6 }]}
        onPress={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        {...(Platform.OS === 'web' && { cursor: disabled ? 'not-allowed' : 'pointer' })}
      >
        <Text style={[styles.selectText, showPlaceholder && styles.selectPlaceholder]}>
          {displayValue || placeholder}
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
          {options.map((option) => {
            const active = String(value || '') === String(option.value || '');
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => {
                  onSelect?.(option);
                  setOpen(false);
                }}
                style={[
                  { paddingVertical: 10, paddingHorizontal: 12 },
                  active ? styles.dropdownListItemActive : { backgroundColor: '#fff' },
                ]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={{ fontSize: 14, color: active ? ACCENT_TEXT : FG, fontWeight: active ? '600' : '400' }}>
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

export default function ClassworkPlacementFields({
  familyId,
  subjectId,
  unitId,
  unitTitle,
  curriculumLessonId,
  lessonLabel,
  onUnitChange,
  onLessonChange,
}) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!familyId || !subjectId) {
      setUnits([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await fetchSubjectCurriculumEventsStructure(familyId, subjectId, null);
        if (cancelled) return;
        setUnits(error ? [] : (Array.isArray(data?.units) ? data.units : []));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, subjectId]);

  const unitOptions = useMemo(() => {
    const rows = [{ key: 'none', value: '', label: 'No unit' }];
    (units || []).forEach((unit, index) => {
      const id = unit?.id != null ? String(unit.id) : '';
      const title = String(unit?.title || '').trim() || `Unit ${index + 1}`;
      rows.push({
        key: id || `unit-${index}`,
        value: id,
        label: title,
        title,
      });
    });
    return rows;
  }, [units]);

  const selectedUnit = useMemo(() => {
    if (unitId) {
      return (units || []).find((unit) => String(unit?.id) === String(unitId)) || null;
    }
    if (unitTitle) {
      return (units || []).find((unit) => String(unit?.title || '').trim() === String(unitTitle).trim()) || null;
    }
    return null;
  }, [units, unitId, unitTitle]);

  const lessonOptions = useMemo(() => {
    const rows = [{ key: 'none', value: '', label: 'No lesson' }];
    const lessons = Array.isArray(selectedUnit?.lessons) ? selectedUnit.lessons : [];
    lessons.forEach((lesson, index) => {
      const id = lesson?.id != null ? String(lesson.id) : '';
      const title = String(lesson?.title || '').trim() || `Lesson ${index + 1}`;
      if (!id) return;
      rows.push({
        key: id,
        value: id,
        label: title,
        title,
      });
    });
    return rows;
  }, [selectedUnit]);

  const unitDisplay = selectedUnit
    ? (String(selectedUnit?.title || '').trim() || 'Unit')
    : (unitTitle || null);

  const lessonDisplay = curriculumLessonId
    ? (lessonLabel || lessonOptions.find((row) => String(row.value) === String(curriculumLessonId))?.label || 'Lesson')
    : null;

  const disabled = !subjectId || loading;

  return (
    <>
      <SelectField
        label="Unit"
        value={unitId || selectedUnit?.id || ''}
        displayValue={unitDisplay}
        placeholder={loading ? 'Loading units…' : 'No unit'}
        disabled={disabled}
        options={unitOptions}
        onSelect={(option) => {
          if (!option?.value) {
            onUnitChange?.({ unitId: null, unitTitle: '' });
            onLessonChange?.({ curriculumLessonId: null, lessonLabel: '' });
            return;
          }
          onUnitChange?.({
            unitId: option.value,
            unitTitle: option.title || option.label,
          });
          onLessonChange?.({ curriculumLessonId: null, lessonLabel: '' });
        }}
      />

      <SelectField
        label="Lesson"
        value={curriculumLessonId || ''}
        displayValue={lessonDisplay}
        placeholder={!selectedUnit ? 'Select a unit first' : 'No lesson'}
        disabled={disabled || !selectedUnit}
        options={lessonOptions}
        onSelect={(option) => {
          if (!option?.value) {
            onLessonChange?.({ curriculumLessonId: null, lessonLabel: '' });
            return;
          }
          onLessonChange?.({
            curriculumLessonId: option.value,
            lessonLabel: option.title || option.label,
          });
        }}
      />
    </>
  );
}
