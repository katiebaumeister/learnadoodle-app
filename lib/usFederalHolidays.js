/**
 * Built-in U.S. Federal Reserve–style bank holidays (observed dates).
 * Matches supabase/migrations/20260407190000_update_global_official_holidays_fed_schedule.sql
 * so School Year Settings can paint Days off instantly without waiting on Nager.Date.
 */

const US_FEDERAL_HOLIDAYS = [
  { date: '2024-01-01', name: "New Year's Day" },
  { date: '2024-01-15', name: 'Martin Luther King Jr. Day' },
  { date: '2024-02-19', name: "Presidents' Day" },
  { date: '2024-05-27', name: 'Memorial Day' },
  { date: '2024-06-19', name: 'Juneteenth' },
  { date: '2024-07-04', name: 'Independence Day' },
  { date: '2024-09-02', name: 'Labor Day' },
  { date: '2024-10-14', name: 'Columbus Day' },
  { date: '2024-11-11', name: 'Veterans Day' },
  { date: '2024-11-28', name: 'Thanksgiving Day' },
  { date: '2024-12-25', name: 'Christmas Day' },
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-20', name: 'Martin Luther King Jr. Day' },
  { date: '2025-02-17', name: "Presidents' Day" },
  { date: '2025-05-26', name: 'Memorial Day' },
  { date: '2025-06-19', name: 'Juneteenth' },
  { date: '2025-07-04', name: 'Independence Day' },
  { date: '2025-09-01', name: 'Labor Day' },
  { date: '2025-10-13', name: 'Columbus Day' },
  { date: '2025-11-11', name: 'Veterans Day' },
  { date: '2025-11-27', name: 'Thanksgiving Day' },
  { date: '2025-12-25', name: 'Christmas Day' },
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-19', name: 'Martin Luther King Jr. Day' },
  { date: '2026-02-16', name: "Presidents' Day" },
  { date: '2026-05-25', name: 'Memorial Day' },
  { date: '2026-06-19', name: 'Juneteenth' },
  { date: '2026-07-03', name: 'Independence Day' },
  { date: '2026-09-07', name: 'Labor Day' },
  { date: '2026-10-12', name: 'Columbus Day' },
  { date: '2026-11-11', name: 'Veterans Day' },
  { date: '2026-11-26', name: 'Thanksgiving Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2027-01-01', name: "New Year's Day" },
  { date: '2027-01-18', name: 'Martin Luther King Jr. Day' },
  { date: '2027-02-15', name: "Presidents' Day" },
  { date: '2027-05-31', name: 'Memorial Day' },
  { date: '2027-06-18', name: 'Juneteenth' },
  { date: '2027-07-05', name: 'Independence Day' },
  { date: '2027-09-06', name: 'Labor Day' },
  { date: '2027-10-11', name: 'Columbus Day' },
  { date: '2027-11-11', name: 'Veterans Day' },
  { date: '2027-11-25', name: 'Thanksgiving Day' },
  { date: '2027-12-24', name: 'Christmas Day' },
  { date: '2027-12-31', name: "New Year's Day" },
  { date: '2028-01-17', name: 'Martin Luther King Jr. Day' },
  { date: '2028-02-21', name: "Presidents' Day" },
  { date: '2028-05-29', name: 'Memorial Day' },
  { date: '2028-06-19', name: 'Juneteenth' },
  { date: '2028-07-04', name: 'Independence Day' },
  { date: '2028-09-04', name: 'Labor Day' },
  { date: '2028-10-09', name: 'Columbus Day' },
  { date: '2028-11-10', name: 'Veterans Day' },
  { date: '2028-11-23', name: 'Thanksgiving Day' },
  { date: '2028-12-25', name: 'Christmas Day' },
  { date: '2029-01-01', name: "New Year's Day" },
  { date: '2029-01-15', name: 'Martin Luther King Jr. Day' },
  { date: '2029-02-19', name: "Presidents' Day" },
  { date: '2029-05-28', name: 'Memorial Day' },
  { date: '2029-06-19', name: 'Juneteenth' },
  { date: '2029-07-04', name: 'Independence Day' },
  { date: '2029-09-03', name: 'Labor Day' },
  { date: '2029-10-08', name: 'Columbus Day' },
  { date: '2029-11-12', name: 'Veterans Day' },
  { date: '2029-11-22', name: 'Thanksgiving Day' },
  { date: '2029-12-25', name: 'Christmas Day' },
  { date: '2030-01-01', name: "New Year's Day" },
  { date: '2030-01-21', name: 'Martin Luther King Jr. Day' },
  { date: '2030-02-18', name: "Presidents' Day" },
  { date: '2030-05-27', name: 'Memorial Day' },
  { date: '2030-06-19', name: 'Juneteenth' },
  { date: '2030-07-04', name: 'Independence Day' },
  { date: '2030-09-02', name: 'Labor Day' },
  { date: '2030-10-14', name: 'Columbus Day' },
  { date: '2030-11-11', name: 'Veterans Day' },
  { date: '2030-11-28', name: 'Thanksgiving Day' },
  { date: '2030-12-25', name: 'Christmas Day' },
];

/**
 * @param {string} startYmd YYYY-MM-DD
 * @param {string} endYmd YYYY-MM-DD
 * @returns {{ date: string, name: string }[]}
 */
export function getUsFederalHolidaysForRange(startYmd, endYmd) {
  const start = String(startYmd || '').slice(0, 10);
  const end = String(endYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return [];
  }
  return US_FEDERAL_HOLIDAYS
    .filter((h) => h.date >= start && h.date <= end)
    .map((h) => ({ date: h.date, name: h.name }));
}
