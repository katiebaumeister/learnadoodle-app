import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ClipboardCheck, FileDown, Download } from 'lucide-react';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
import { PLANNER_SMART_ACTION_TOOLS, PLANNER_SMART_ACTION_UTILITIES, dispatchPlannerSmartAction } from './plannerSmartActionsConfig';

const SMART_ACTION_ICONS = {
  'bulk-attendance': ClipboardCheck,
  'export-attendance': FileDown,
  export: Download,
};

export default function PlannerSmartActionsMenu({ visible, triggerRef, onClose, showExport = false }) {
  const handleSelect = (modeId) => {
    onClose?.();
    dispatchPlannerSmartAction(modeId);
  };

  const utilities = [
    ...PLANNER_SMART_ACTION_TOOLS,
    ...(showExport ? PLANNER_SMART_ACTION_UTILITIES : []),
  ];

  return (
    <Dropdown
      visible={visible}
      triggerRef={triggerRef}
      onClose={onClose}
      placement="bottom-end"
      width={240}
      maxHeight={520}
      variant="context"
    >
      <View style={styles.menu}>
        {utilities.map((mode, index) => (
          <DropdownItem
            key={mode.id}
            icon={SMART_ACTION_ICONS[mode.id]}
            label={mode.title}
            onPress={() => handleSelect(mode.id)}
            variant="context"
            isLast={index === utilities.length - 1}
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
