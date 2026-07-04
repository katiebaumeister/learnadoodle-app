import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { ClipboardCheck, FileDown, Download, Settings } from 'lucide-react';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
import { PLANNER_SMART_ACTION_TOOLS, PLANNER_SMART_ACTION_UTILITIES, dispatchPlannerSmartAction } from './plannerSmartActionsConfig';
import { PLANNING_MODES } from '../../lib/planningMode';

const SMART_ACTION_ICONS = {
  'school-year-settings': Settings,
  'bulk-attendance': ClipboardCheck,
  'export-attendance': FileDown,
  export: Download,
};

const ATTENDANCE_ACTION_IDS = new Set(['bulk-attendance', 'export-attendance']);

export default function PlannerSmartActionsMenu({ visible, triggerRef, onClose, showExport = false, panelProps = null, capabilities = null, familyApproach = null }) {
  const handleSelect = (modeId) => {
    onClose?.();
    dispatchPlannerSmartAction(modeId);
  };

  const isHomeschool = familyApproach === PLANNING_MODES.HOMESCHOOL_COMPLIANCE;

  const utilities = useMemo(() => {
    let items = [
      ...PLANNER_SMART_ACTION_TOOLS,
      ...(showExport ? PLANNER_SMART_ACTION_UTILITIES : []),
    ].map((item) => {
      if (item.id === 'school-year-settings') {
        return { ...item, title: isHomeschool ? 'Edit School Year' : 'Edit Schedule Settings' };
      }
      return item;
    });
    if (capabilities && !capabilities.showAttendance) {
      items = items.filter((item) => !ATTENDANCE_ACTION_IDS.has(item.id));
    }
    return items;
  }, [showExport, capabilities, isHomeschool]);

  return (
    <Dropdown
      visible={visible}
      triggerRef={triggerRef}
      onClose={onClose}
      placement="bottom-end"
      width={240}
      maxHeight={520}
      variant="context"
      panelProps={panelProps}
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
