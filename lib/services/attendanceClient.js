/**
 * API client for enhanced attendance features (check-in/out, manual attendance, reports)
 */
import { apiRequest } from '../apiClient';
import { supabase } from '../supabase';

// Get API base URL
const getAPIBase = () => {
  if (typeof window !== 'undefined') {
    return process.env.REACT_APP_API_URL || window.location.origin;
  }
  return process.env.REACT_APP_API_URL || '';
};

/**
 * Check in a child
 */
export async function checkIn(childId, checkInTime, note) {
  const { data, error } = await apiRequest('/api/attendance/check_in', {
    method: 'POST',
    body: JSON.stringify({
      child_id: childId,
      check_in_time: checkInTime,
      note: note || null,
    }),
  });
  
  if (error) throw error;
  return data;
}

/**
 * Check out a child
 */
export async function checkOut(checkInId, checkOutTime, note) {
  const { data, error } = await apiRequest('/api/attendance/check_out', {
    method: 'POST',
    body: JSON.stringify({
      check_in_id: checkInId,
      check_out_time: checkOutTime,
      note: note || null,
    }),
  });
  
  if (error) throw error;
  return data;
}

/**
 * Get check-in status for a child
 */
export async function getCheckInStatus(childId) {
  const { data, error } = await apiRequest(`/api/attendance/check_in_status/${encodeURIComponent(childId)}`, {
    method: 'GET',
  });
  
  if (error) throw error;
  return data;
}

/**
 * Add manual attendance record
 */
export async function addManualAttendance(attendanceData) {
  const { child_id, day_date, attendance_type, value, status, note } = attendanceData;
  
  const { data, error } = await apiRequest('/api/attendance/manual', {
    method: 'POST',
    body: JSON.stringify({
      child_id,
      day_date,
      attendance_type,
      value,
      status: status || 'present',
      note: note || null,
    }),
  });
  
  if (error) throw error;
  return data;
}

/**
 * Get manual attendance records
 */
export async function getManualAttendance(childId, startDate, endDate) {
  const startStr = startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate;
  const endStr = endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate;
  
  const { data, error } = await apiRequest(
    `/api/attendance/manual/${encodeURIComponent(childId)}?start_date=${startStr}&end_date=${endStr}`,
    {
      method: 'GET',
    }
  );
  
  if (error) throw error;
  return data || [];
}

/**
 * Generate attendance report
 */
export async function generateAttendanceReport(reportData) {
  const { child_id, report_type, date_range_start, date_range_end, format } = reportData;
  
  const startStr = date_range_start instanceof Date ? date_range_start.toISOString().split('T')[0] : date_range_start;
  const endStr = date_range_end instanceof Date ? date_range_end.toISOString().split('T')[0] : date_range_end;
  
  // Get auth token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const apiBase = getAPIBase();
  const response = await fetch(
    `${apiBase}/api/attendance/report`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        child_id,
        report_type,
        date_range_start: startStr,
        date_range_end: endStr,
        format: format || 'pdf',
      }),
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
  }
  
  const blob = await response.blob();
  return blob;
}

/**
 * Mark an event as completed (creates attendance record)
 */
export async function completeEvent(eventId, minutesOverride = null) {
  try {
    const body = minutesOverride !== null ? { minutes_override: minutesOverride } : {};
    const { data, error } = await apiRequest(`/api/events/${encodeURIComponent(eventId)}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    
    if (error) {
      return { data: null, error };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Update event status (for toggling completion or changing status)
 */
export async function updateEventStatus(eventId, status) {
  try {
    const { data, error } = await apiRequest(`/api/events/${encodeURIComponent(eventId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    
    if (error) {
      return { data: null, error };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}
