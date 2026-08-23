/** Age chips for parent-managed child profiles (3–17, then 18+). */
export const CHILD_AGE_OPTIONS = [
  ...Array.from({ length: 15 }, (_, i) => String(i + 3)),
  '18+',
];

/** Age chips for student self-onboarding (13–17, then 18+). */
export const STUDENT_SELF_AGE_OPTIONS = [
  ...Array.from({ length: 5 }, (_, i) => String(i + 13)),
  '18+',
];

export const CHILD_GRADE_OPTIONS = [
  'Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12+',
];

export function childAgeToPickerValue(age) {
  if (age == null || age === '') return '';
  if (String(age) === '18+') return '18+';
  const n = Number(age);
  if (Number.isFinite(n) && n >= 18) return '18+';
  return String(age);
}

export function childAgeFromPickerValue(pickerValue) {
  if (pickerValue === '18+') return 18;
  const n = Number(pickerValue);
  return Number.isFinite(n) ? n : null;
}

export function childGradeToPickerValue(grade) {
  if (!grade) return '';
  const g = String(grade).trim();
  if (g === '12') return '12+';
  return g;
}

export function isAgeChipSelected(pickerValue, currentAge) {
  if (pickerValue === '18+') {
    return currentAge === '18+' || (Number(currentAge) >= 18 && Number.isFinite(Number(currentAge)));
  }
  return String(currentAge) === String(pickerValue);
}
