import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Calendar, FileText, CalendarDays, CalendarX2 } from 'lucide-react';
import Dropdown, { DropdownItem } from '../ui/Dropdown';

const CREATE_OPTIONS = [
  { id: 'calendar_event', label: 'Event', icon: Calendar },
  { id: 'assignment', label: 'Assignment', icon: FileText },
  { id: 'learning_day', label: 'Learning day', icon: CalendarDays },
  { id: 'day_off', label: 'Day off', icon: CalendarX2 },
];

export default function PlannerCreateMenu({ visible, triggerRef, onClose, onSelect, panelProps = null }) {
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
      maxHeight={320}
      variant="context"
      panelProps={panelProps}
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
