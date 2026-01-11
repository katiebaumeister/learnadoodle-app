// Date utilities for planner views (Sunday start)

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
  if (formatStr === 'MMM') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[date.getMonth()];
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

export const isSameMonth = (a, b) => {
  if (!a || !b || !(a instanceof Date) || !(b instanceof Date) || isNaN(a.getTime()) || isNaN(b.getTime())) {
    return false;
  }
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
};

export const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return a.toDateString() === b.toDateString();
};

export const isSameHour = (a, b) => {
  if (!a || !b) return false;
  return a.getHours() === b.getHours();
};

export const formatDayNum = (d) => d.getDate();

// Week starts on Sunday (day 0)
export const startOfWeek = (d) => {
  const n = new Date(d);
  const day = n.getDay();
  // Subtract to get Sunday (day 0)
  const diff = -day;
  n.setDate(n.getDate() + diff);
  n.setHours(0, 0, 0, 0);
  return n;
};

export const eachDayMatrix = (date) => {
  // Validate input date
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    console.error('[eachDayMatrix] Invalid date input:', date);
    // Return a fallback matrix for current month
    const fallbackDate = new Date();
    fallbackDate.setDate(1);
    date = fallbackDate;
  }
  
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  // Validate first date
  if (isNaN(first.getTime())) {
    console.error('[eachDayMatrix] Invalid first date created:', { date, first });
    const fallbackDate = new Date();
    fallbackDate.setDate(1);
    return eachDayMatrix(fallbackDate); // Recursive call with valid date
  }
  
  const start = startOfWeek(first);
  // Validate start date
  if (isNaN(start.getTime())) {
    console.error('[eachDayMatrix] Invalid start date created:', { first, start });
    const fallbackDate = new Date();
    fallbackDate.setDate(1);
    return eachDayMatrix(fallbackDate); // Recursive call with valid date
  }
  
  const weeks = [];
  let cur = new Date(start);
  
  for (let w = 0; w < 4; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const dayDate = new Date(cur);
      // Validate each day date
      if (isNaN(dayDate.getTime())) {
        console.error('[eachDayMatrix] Invalid day date created:', { cur, dayDate, w, d });
        // Skip this day or use a fallback
        row.push(new Date(start.getTime() + (w * 7 + d) * 24 * 60 * 60 * 1000));
      } else {
        row.push(dayDate);
      }
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

