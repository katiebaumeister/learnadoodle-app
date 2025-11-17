import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { Users, ChevronDown, Check } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function ChildFilter({ childrenList = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  const all = value === null || value.length === childrenList.length;

  const handleToggleAll = () => {
    onChange(all ? [] : null);
  };

  const handleToggleChild = (childId) => {
    if (value === null) {
      // Break out of 'all' mode
      onChange([childId]);
    } else {
      const isSelected = value.includes(childId);
      if (isSelected) {
        onChange(value.filter(id => id !== childId));
      } else {
        onChange([...value, childId]);
      }
    }
  };

  const displayText = all 
    ? 'All children' 
    : value && value.length > 0 
      ? `${value.length} selected` 
      : 'Select children';

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setOpen(true)}
      >
        <Users size={16} color={colors.text} />
        <Text style={styles.buttonText}>{displayText}</Text>
        <ChevronDown size={16} color={colors.text} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.dropdown}>
            <TouchableOpacity
              style={styles.option}
              onPress={handleToggleAll}
            >
              <View style={styles.checkbox}>
                {all && <Check size={16} color={colors.accent} />}
              </View>
              <Text style={styles.optionText}>All children</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <ScrollView style={styles.optionsList}>
              {childrenList.map((child) => {
                const isSelected = value === null || value.includes(child.id);
                return (
                  <TouchableOpacity
                    key={child.id}
                    style={styles.option}
                    onPress={() => handleToggleChild(child.id)}
                  >
                    <View style={styles.checkbox}>
                      {isSelected && <Check size={16} color={colors.accent} />}
                    </View>
                    <Text style={styles.optionText}>{child.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdown: {
    width: 240,
    maxHeight: 400,
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    ...shadows.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 14,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  optionsList: {
    maxHeight: 300,
  },
});
