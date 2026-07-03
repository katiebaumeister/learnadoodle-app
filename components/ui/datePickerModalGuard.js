/** Tracks open app calendar pickers so parent modals can ignore backdrop dismiss. */
let openDatePickerCount = 0;

export function registerDatePickerModalOpen() {
  openDatePickerCount += 1;
}

export function registerDatePickerModalClose() {
  openDatePickerCount = Math.max(0, openDatePickerCount - 1);
}

export function isDatePickerModalOpen() {
  return openDatePickerCount > 0;
}
