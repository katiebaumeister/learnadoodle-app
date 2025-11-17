// ICS Calendar Service
// Generates ICS feeds for family and child-specific calendars
// Parents can subscribe in Apple/Google Calendar for transparency

import { supabase } from './supabase';

/**
 * Generate ICS content for a family calendar
 * @param {string} familyId - The family ID
 * @param {Date} startDate - Start date for events
 * @param {Date} endDate - End date for events
 * @returns {Promise<string>} ICS calendar content
 */
export const generateFamilyICS = async (familyId, startDate = null, endDate = null) => {
  try {
    // Default to next 90 days if no dates provided
    const start = startDate || new Date();
    const end = endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    // Fetch events for the family
    const { data: events, error } = await supabase
      .from('events')
      .select(`
        id,
        title,
        start_ts,
        end_ts,
        status,
        description,
        children!inner(id, first_name, last_name, family_id)
      `)
      .eq('children.family_id', familyId)
      .gte('start_ts', start.toISOString())
      .lte('start_ts', end.toISOString())
      .order('start_ts');

    if (error) {
      console.error('Error fetching events for ICS:', error);
      throw error;
    }

    // Fetch day-off overrides
    const { data: dayOffOverrides, error: overrideError } = await supabase
      .from('schedule_overrides')
      .select(`
        date,
        notes,
        children!inner(id, first_name, last_name, family_id)
      `)
      .eq('children.family_id', familyId)
      .eq('override_kind', 'day_off')
      .gte('date', start.toISOString().split('T')[0])
      .lte('date', end.toISOString().split('T')[0]);

    if (overrideError) {
      console.error('Error fetching day-off overrides for ICS:', overrideError);
    }

    // Generate ICS content
    const icsContent = generateICSContent(events || [], dayOffOverrides || [], familyId);
    return icsContent;

  } catch (error) {
    console.error('Error generating family ICS:', error);
    throw error;
  }
};

/**
 * Generate ICS content for a child-specific calendar
 * @param {string} childId - The child ID
 * @param {Date} startDate - Start date for events
 * @param {Date} endDate - End date for events
 * @returns {Promise<string>} ICS calendar content
 */
export const generateChildICS = async (childId, startDate = null, endDate = null) => {
  try {
    // Default to next 90 days if no dates provided
    const start = startDate || new Date();
    const end = endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    // Fetch events for the specific child
    const { data: events, error } = await supabase
      .from('events')
      .select(`
        id,
        title,
        start_ts,
        end_ts,
        status,
        description,
        children!inner(id, first_name, last_name)
      `)
      .eq('child_id', childId)
      .gte('start_ts', start.toISOString())
      .lte('start_ts', end.toISOString())
      .order('start_ts');

    if (error) {
      console.error('Error fetching child events for ICS:', error);
      throw error;
    }

    // Fetch day-off overrides for the child
    const { data: dayOffOverrides, error: overrideError } = await supabase
      .from('schedule_overrides')
      .select('date, notes')
      .eq('scope_type', 'child')
      .eq('scope_id', childId)
      .eq('override_kind', 'day_off')
      .gte('date', start.toISOString().split('T')[0])
      .lte('date', end.toISOString().split('T')[0]);

    if (overrideError) {
      console.error('Error fetching child day-off overrides for ICS:', overrideError);
    }

    // Generate ICS content
    const icsContent = generateICSContent(events || [], dayOffOverrides || [], null, childId);
    return icsContent;

  } catch (error) {
    console.error('Error generating child ICS:', error);
    throw error;
  }
};

/**
 * Generate the actual ICS calendar content
 * @param {Array} events - Array of events
 * @param {Array} dayOffOverrides - Array of day-off overrides
 * @param {string} familyId - Family ID (for family calendar)
 * @param {string} childId - Child ID (for child calendar)
 * @returns {string} ICS calendar content
 */
const generateICSContent = (events, dayOffOverrides, familyId = null, childId = null) => {
  const now = new Date();
  const calendarName = familyId ? 'Learnadoodle Family Calendar' : 'Learnadoodle Child Calendar';
  const calendarId = familyId || childId;

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Learnadoodle//Schedule Calendar//EN',
    `X-WR-CALNAME:${calendarName}`,
    `X-WR-CALDESC:Schedule calendar from Learnadoodle`,
    `X-WR-TIMEZONE:UTC`,
    ''
  ];

  // Add events
  events.forEach(event => {
    const startDate = new Date(event.start_ts);
    const endDate = new Date(event.end_ts);
    const childName = event.children ? `${event.children.first_name} ${event.children.last_name}` : 'Unknown';

    // Generate unique ID for the event
    const uid = `${event.id}@learnadoodle.com`;

    // Format dates for ICS
    const startICS = formatDateForICS(startDate);
    const endICS = formatDateForICS(endDate);

    // Create event description
    const description = [
      `Child: ${childName}`,
      event.description ? `Description: ${event.description}` : '',
      `Status: ${event.status}`,
      `Created: ${now.toISOString()}`
    ].filter(Boolean).join('\\n');

    ics.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${startICS}`,
      `DTEND:${endICS}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${description}`,
      `STATUS:${event.status === 'scheduled' ? 'CONFIRMED' : 'CANCELLED'}`,
      `CREATED:${formatDateForICS(now)}`,
      `LAST-MODIFIED:${formatDateForICS(now)}`,
      'END:VEVENT'
    );
  });

  // Add day-off overrides as all-day events
  dayOffOverrides.forEach(override => {
    const date = new Date(override.date);
    const uid = `dayoff-${override.date}@learnadoodle.com`;

    ics.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${formatDateForICS(date, true)}`,
      `DTEND;VALUE=DATE:${formatDateForICS(new Date(date.getTime() + 24 * 60 * 60 * 1000), true)}`,
      'SUMMARY:Day Off',
      `DESCRIPTION:${override.notes || 'Scheduled day off'}`,
      'STATUS:CONFIRMED',
      `CREATED:${formatDateForICS(now)}`,
      `LAST-MODIFIED:${formatDateForICS(now)}`,
      'END:VEVENT'
    );
  });

  ics.push('END:VCALENDAR');

  return ics.join('\r\n');
};

/**
 * Format a date for ICS format
 * @param {Date} date - The date to format
 * @param {boolean} dateOnly - Whether to include only the date (for all-day events)
 * @returns {string} Formatted date string
 */
const formatDateForICS = (date, dateOnly = false) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (dateOnly) {
    return `${year}${month}${day}`;
  }

  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

/**
 * Generate ICS URL for a family calendar
 * @param {string} familyId - The family ID
 * @param {string} baseUrl - The base URL of your app
 * @returns {string} ICS URL
 */
export const getFamilyICSUrl = (familyId, baseUrl = 'https://your-app.com') => {
  return `${baseUrl}/api/ics/family.ics?family_id=${familyId}`;
};

/**
 * Generate ICS URL for a child calendar
 * @param {string} childId - The child ID
 * @param {string} baseUrl - The base URL of your app
 * @returns {string} ICS URL
 */
export const getChildICSUrl = (childId, baseUrl = 'https://your-app.com') => {
  return `${baseUrl}/api/ics/child/${childId}.ics`;
};

/**
 * Validate ICS URL format
 * @param {string} url - The URL to validate
 * @returns {boolean} Whether the URL is a valid ICS URL
 */
export const isValidICSUrl = (url) => {
  return url && (url.endsWith('.ics') || url.includes('/api/ics/'));
};

export default {
  generateFamilyICS,
  generateChildICS,
  getFamilyICSUrl,
  getChildICSUrl,
  isValidICSUrl
};