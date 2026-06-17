import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ChevronDown } from 'lucide-react';
import Dropdown from '../../ui/Dropdown';
import { createModalStyles as styles, MUTED, ACCENT_TEXT, FG } from './createModalStyles';
import { useSubjectCurriculumUnits } from '../../../lib/useSubjectCurriculumUnits';

function unitOptionValue(unit, index) {
  const id = unit?.id != null ? String(unit.id).trim() : '';
  const title = String(unit?.title || '').trim() || `Unit ${index + 1}`;
  return id || `__title__:${title}`;
}

function resolveSelectedUnit(units, { unitId, unitTitle, selectedValue }) {
  if (unitId) {
    const byId = (units || []).find((unit) => String(unit?.id) === String(unitId));
    if (byId) return byId;
  }
  const titleFromValue = String(selectedValue || '').startsWith('__title__:')
    ? String(selectedValue).slice('__title__:'.length)
    : '';
  const titleNeedle = String(unitTitle || titleFromValue || '').trim();
  if (titleNeedle) {
    return (units || []).find((unit) => String(unit?.title || '').trim() === titleNeedle) || null;
  }
  return null;
}

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
  const units = useSubjectCurriculumUnits(familyId, subjectId);

  const unitOptions = useMemo(() => {
    const rows = [{ key: 'none', value: '', label: 'No unit' }];
    (units || []).forEach((unit, index) => {
      const title = String(unit?.title || '').trim() || `Unit ${index + 1}`;
      const value = unitOptionValue(unit, index);
      rows.push({
        key: value,
        value,
        label: title,
        title,
        unitId: unit?.id != null ? String(unit.id) : null,
      });
    });
    return rows;
  }, [units]);

  const selectedUnit = useMemo(
    () => resolveSelectedUnit(units, { unitId, unitTitle }),
    [units, unitId, unitTitle],
  );

  const selectedUnitValue = unitId
    ? String(unitId)
    : (selectedUnit ? unitOptionValue(selectedUnit, (units || []).indexOf(selectedUnit)) : (unitTitle ? `__title__:${unitTitle}` : ''));

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

  const disabled = !subjectId;

  return (
    <>
      <SelectField
        label="Unit"
        value={selectedUnitValue}
        displayValue={unitDisplay}
        placeholder="No unit"
        disabled={disabled}
        options={unitOptions}
        onSelect={(option) => {
          if (!option?.value) {
            onUnitChange?.({ unitId: null, unitTitle: '' });
            onLessonChange?.({ curriculumLessonId: null, lessonLabel: '' });
            return;
          }
          onUnitChange?.({
            unitId: option.unitId || null,
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
