export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const addMonths = (date, count) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + count);
  return d;
};

export const formatMonthYear = (d) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export const isToday = (d) => {
  const t = new Date();
  return t.toDateString() === d.toDateString();
};

export const isSameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export const formatDayNum = (d) => d.getDate();

export const startOfWeek = (d) => {
  const n = new Date(d);
  const day = (n.getDay() + 7) % 7;
  n.setDate(n.getDate() - day);
  n.setHours(0, 0, 0, 0);
  return n;
};

export const eachDayMatrix = (date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  const weeks = [];
  let cur = new Date(start);
  
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      row.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
  }
  
  return weeks;
};
