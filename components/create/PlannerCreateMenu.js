import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Calendar, FileText } from 'lucide-react';
import Dropdown, { DropdownItem } from '../ui/Dropdown';

const CREATE_OPTIONS = [
  { id: 'calendar_event', label: 'Event', icon: Calendar },
  { id: 'assignment', label: 'Assignment', icon: FileText },
];

export default function PlannerCreateMenu({ visible, triggerRef, onClose, onSelect }) {
  const handleSelect = (kind) => {
    onClose?.();
    onSelect?.(kind);
  };

  return (
    <Dropdown
      visible={visible}
      triggerRef={triggerRef}
      onClose={onClose}
      placement="bottom-end"
      width={220}
      maxHeight={160}
      variant="context"
    >
      <View style={styles.menu}>
        {CREATE_OPTIONS.map((option, index) => (
          <DropdownItem
            key={option.id}
            icon={option.icon}
            label={option.label}
            onPress={() => handleSelect(option.id)}
            variant="context"
            isLast={index === CREATE_OPTIONS.length - 1}
          />
        ))}
      </View>
    </Dropdown>
  );
}

const styles = StyleSheet.create({
  menu: {
    paddingVertical: 4,
  },
});
