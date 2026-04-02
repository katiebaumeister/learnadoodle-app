import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type BillingMode = 'monthly' | 'annual';

type Props = {
  value: BillingMode;
  onChange: (v: BillingMode) => void;
  /** Merged with the root pill; use `{ alignSelf: 'center' }` to center under a full-width row. */
  style?: StyleProp<ViewStyle>;
};

export function BillingToggle({ value, onChange, style }: Props) {
  return (
    <View style={[styles.toggle, style]}>
      <Pressable
        style={[styles.option, value === 'monthly' && styles.activeOption]}
        onPress={() => onChange('monthly')}
        {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}
      >
        <Text style={[styles.optionText, value === 'monthly' && styles.activeText]}>Monthly</Text>
      </Pressable>
      <Pressable
        style={[styles.option, styles.annualOption, value === 'annual' && styles.activeOption]}
        onPress={() => onChange('annual')}
        {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}
      >
        <Text style={[styles.optionText, value === 'annual' && styles.activeText]}>Annual</Text>
        <View style={styles.saveBadge}>
          <Text style={styles.saveBadgeText}>Save 20%</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF0F3',
    borderRadius: 999,
    padding: 5,
    alignSelf: 'flex-start',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 5,
  },
  annualOption: {
    gap: 6,
  },
  activeOption: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  activeText: {
    color: '#111827',
  },
  saveBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  saveBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#047857',
  },
});
