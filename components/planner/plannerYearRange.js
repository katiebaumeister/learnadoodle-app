const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function parseDateKey(key) {
  if (!key || key.length < 10) return null;
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1;
  const d = parseInt(key.slice(8, 10), 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return { year: y, month: m, day: d };
}

export function getDayKey(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function buildMonthsInRange(yearStart, yearEnd) {
  const start = parseDateKey(yearStart);
  const end = parseDateKey(yearEnd);
  if (!start || !end) return [];
  const months = [];
  let idx = 0;
  for (let y = start.year; y <= end.year; y += 1) {
    const monthStart = y === start.year ? start.month : 0;
    const monthEnd = y === end.year ? end.month : 11;
    for (let m = monthStart; m <= monthEnd; m += 1) {
      const totalDays = getDaysInMonth(y, m);
      const firstDay = (y === start.year && m === start.month) ? start.day : 1;
      const lastDay = (y === end.year && m === end.month) ? end.day : totalDays;
      months.push({
        index: idx,
        label: `${MONTH_LABELS[m]} ${y}`,
        year: y,
        monthIndex: m,
        firstDay,
        lastDay,
        totalDays,
      });
      idx += 1;
    }
  }
  return months;
}

export function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  const fullRows = Math.ceil(cells.length / 7);
  while (cells.length < fullRows * 7) cells.push(null);
  return { cells, fullRows };
}

export function resolvePlannerYearRange(anchorDate, academicYears = null) {
  const anchor = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
    ? anchorDate
    : new Date();
  const ymd = getDayKey(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());

  if (Array.isArray(academicYears) && academicYears.length > 0) {
    const match = academicYears.find((year) => {
      const start = String(year?.start_date || '').slice(0, 10);
      const end = String(year?.end_date || '').slice(0, 10);
      return start && end && ymd >= start && ymd <= end;
    });
    if (match) {
      return {
        yearStart: String(match.start_date).slice(0, 10),
        yearEnd: String(match.end_date).slice(0, 10),
        label: match.year_name || null,
      };
    }
  }

  const y = anchor.getFullYear();
  return {
    yearStart: `${y}-01-01`,
    yearEnd: `${y}-12-31`,
    label: String(y),
  };
}

export function formatPlannerYearHeaderLabel(anchorDate, academicYears = null) {
  const range = resolvePlannerYearRange(anchorDate, academicYears);
  if (range.label && range.label.includes('/')) return `${range.label} School Year`;
  if (range.label && range.yearStart && range.yearEnd) {
    const startYear = range.yearStart.slice(0, 4);
    const endYear = range.yearEnd.slice(0, 4);
    if (startYear !== endYear) return `${startYear}/${endYear.slice(-2)} School Year`;
    return range.label;
  }
  return range.label || String(anchorDate.getFullYear());
}

export function shiftPlannerYearAnchor(anchorDate, direction, academicYears = null) {
  const anchor = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
    ? new Date(anchorDate)
    : new Date();
  const range = resolvePlannerYearRange(anchor, academicYears);
  const start = parseDateKey(range.yearStart);
  const end = parseDateKey(range.yearEnd);
  if (!start || !end) {
    anchor.setFullYear(anchor.getFullYear() + direction);
    return anchor;
  }

  if (Array.isArray(academicYears) && academicYears.length > 0) {
    const sorted = [...academicYears].sort((a, b) => {
      const aStart = String(a?.start_date || '').slice(0, 10);
      const bStart = String(b?.start_date || '').slice(0, 10);
      return aStart.localeCompare(bStart);
    });
    const currentIndex = sorted.findIndex((year) => {
      const startKey = String(year?.start_date || '').slice(0, 10);
      const endKey = String(year?.end_date || '').slice(0, 10);
      const ymd = getDayKey(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
      return ymd >= startKey && ymd <= endKey;
    });
    if (currentIndex >= 0) {
      const nextIndex = currentIndex + direction;
      if (nextIndex >= 0 && nextIndex < sorted.length) {
        const next = sorted[nextIndex];
        const nextStart = parseDateKey(String(next?.start_date || '').slice(0, 10));
        if (nextStart) return new Date(nextStart.year, nextStart.month, nextStart.day);
      }
    }
  }

  const spanYears = end.year - start.year + 1;
  anchor.setFullYear(anchor.getFullYear() + (direction * Math.max(spanYears, 1)));
  return anchor;
}
