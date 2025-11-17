import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay } from "date-fns";

/** Returns a 6x7 matrix of Dates covering the month view */
export function buildMonthMatrix(activeMonth: Date, weekStartsOn: 0 | 1 = 0): Date[][] {
  const monthStart = startOfMonth(activeMonth);
  const monthEnd = endOfMonth(activeMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });

  const days: Date[][] = [];
  let current = gridStart;

  while (current <= gridEnd) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(current);
      current = addDays(current, 1);
    }
    days.push(row);
  }
  // Ensure 6 rows for stable layout
  while (days.length < 6) {
    const last = days[days.length - 1][6];
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) row.push(addDays(last, i + 1));
    days.push(row);
  }
  return days;
}

export function sameDay(a?: Date | null, b?: Date | null) {
  if (!a || !b) return false;
  return isSameDay(a, b);
}
