import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native';
import { X, Plus } from 'lucide-react';
import { createModalStyles as styles, ACCENT_TEXT } from '../../create/shared/createModalStyles';
import {
  GRADING_CALC_METHOD,
  GRADING_CALC_METHOD_OPTIONS,
  createEmptyCategory,
  getCategoryWeightRemaining,
} from '../../../lib/subjectGradingSettings';

export const gradingFieldStyles = {
  helpText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    marginBottom: 12,
  },
  switchBlock: {
    marginBottom: 12,
  },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
    paddingRight: 12,
  },
  fieldRow: {
    marginBottom: 8,
  },
  percentInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: 120,
  },
  percentInput: {
    flex: 1,
    minWidth: 48,
    textAlign: 'right',
  },
  percentSuffix: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 4,
    paddingBottom: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  categoryFields: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  categoryNameInput: {
    flex: 1,
  },
  categoryPercentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 96,
  },
  categoryPercentInput: {
    flex: 1,
    minWidth: 36,
    textAlign: 'right',
  },
  categoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
  },
  remainingText: {
    fontSize: 13,
    color: '#64748B',
  },
  addCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addCategoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: ACCENT_TEXT,
  },
};

export default function SubjectGradingFields({
  draft,
  onUpdateDraft,
  onUpdateCategory,
  onRemoveCategory,
  onAddCategory,
}) {
  const remainingPercent = getCategoryWeightRemaining(draft.categories);
  const showCategories = draft.calculation_method === GRADING_CALC_METHOD.WEIGHTED_CATEGORY;
  const localStyles = gradingFieldStyles;

  return (
    <View>
      <Text style={styles.sectionHeading}>Grade calculation</Text>
      <Text style={localStyles.helpText}>Choose how overall grades are calculated for this subject.</Text>
      <View style={styles.modeChipRow}>
        {GRADING_CALC_METHOD_OPTIONS.map((option) => {
          const active = draft.calculation_method === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.dropdownOption,
                styles.assigneePill,
                active && styles.dropdownOptionActive,
              ]}
              onPress={() => onUpdateDraft({ calculation_method: option.value })}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text
                style={[
                  styles.dropdownOptionText,
                  styles.assigneePillText,
                  active && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {draft.calculation_method !== GRADING_CALC_METHOD.NONE ? (
        <View style={[styles.inlineSwitchRow, localStyles.switchBlock]}>
          <Text style={localStyles.switchLabel}>Show overall grade to students</Text>
          <Switch
            value={draft.show_overall_to_students}
            onValueChange={(value) => onUpdateDraft({ show_overall_to_students: value })}
            trackColor={{ false: '#CBD5E1', true: '#9ECFFB' }}
            thumbColor="#FFFFFF"
          />
        </View>
      ) : null}

      {showCategories ? (
        <>
          <View style={styles.sectionDivider} />
          <Text style={styles.sectionHeading}>Weighted categories</Text>
          <Text style={localStyles.helpText}>Grade categories must add up to 100%.</Text>

          {(draft.categories || []).map((category, index) => (
            <View key={category.id || `cat-${index}`} style={localStyles.categoryRow}>
              <View style={localStyles.categoryFields}>
                <TextInput
                  style={[styles.fieldInput, localStyles.categoryNameInput]}
                  placeholder="Grade category"
                  placeholderTextColor="#94A3B8"
                  value={category.name}
                  onChangeText={(text) => onUpdateCategory(index, { name: text })}
                  {...(Platform.OS === 'web' && { cursor: 'text' })}
                />
                <View style={localStyles.categoryPercentWrap}>
                  <TextInput
                    style={[styles.fieldInput, localStyles.categoryPercentInput]}
                    value={String(category.weight_percent ?? 0)}
                    onChangeText={(text) => {
                      const digits = text.replace(/[^\d]/g, '');
                      onUpdateCategory(index, {
                        weight_percent: digits === '' ? 0 : Number(digits),
                      });
                    }}
                    keyboardType="number-pad"
                    maxLength={3}
                    {...(Platform.OS === 'web' && { cursor: 'text' })}
                  />
                  <Text style={localStyles.percentSuffix}>%</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => onRemoveCategory(index)}
                hitSlop={8}
                accessibilityLabel="Remove category"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          ))}

          <View style={localStyles.categoryFooter}>
            <Text style={localStyles.remainingText}>Remaining {remainingPercent}%</Text>
            <TouchableOpacity
              style={localStyles.addCategoryBtn}
              onPress={onAddCategory}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={14} color={ACCENT_TEXT} />
              <Text style={localStyles.addCategoryText}>Add grade category</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  );
}
