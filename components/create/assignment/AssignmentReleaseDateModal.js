import React, { useMemo } from 'react';
import { AppCalendarDatePickerModal } from '../../ui/AppCalendarDatePickerModal';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function AssignmentReleaseDateModal({
  visible,
  onClose,
  selectedDate = null,
  onConfirm,
}) {
  const minDate = useMemo(() => startOfToday(), []);

  return (
    <AppCalendarDatePickerModal
      visible={visible}
      onClose={onClose}
      selectedDate={selectedDate || minDate}
      minDate={minDate}
      title="Release date"
      requireConfirm
      confirmLabel="Set date & save"
      onSelectDate={(date) => {
        onConfirm?.(date);
      }}
    />
  );
}
