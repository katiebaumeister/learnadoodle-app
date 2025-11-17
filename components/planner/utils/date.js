// Date utilities for planner views (Monday start)

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

export const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const format = (date, formatStr) => {
  // Simple format function - supports common patterns
  if (formatStr === 'EEE') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  }
  if (formatStr === 'EEEE') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  }
  if (formatStr === 'd') {
    return date.getDate().toString();
  }
  if (formatStr === 'MMM d') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }
  if (formatStr === 'MMMM yyyy') {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  if (formatStr === 'MMMM d, yyyy') {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
  if (formatStr === 'EEEE, MMMM d, yyyy') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
  if (formatStr === 'HH:00') {
    const hours = date.getHours().toString().padStart(2, '0');
    return `${hours}:00`;
  }
  return date.toLocaleDateString();
};

export const addWeeks = (date, weeks) => {
  return addDays(date, weeks * 7);
};

export const isToday = (d) => {
  const t = new Date();
  return t.toDateString() === d.toDateString();
};

export const isSameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return a.toDateString() === b.toDateString();
};

export const isSameHour = (a, b) => {
  if (!a || !b) return false;
  return a.getHours() === b.getHours();
};

export const formatDayNum = (d) => d.getDate();

// Week starts on Monday (day 1)
export const startOfWeek = (d) => {
  const n = new Date(d);
  const day = n.getDay();
  // Convert Sunday (0) to 7, then subtract to get Monday
  const diff = day === 0 ? -6 : 1 - day;
  n.setDate(n.getDate() + diff);
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

export const setHours = (date, hours) => {
  const d = new Date(date);
  d.setHours(hours, 0, 0, 0);
  return d;
};

