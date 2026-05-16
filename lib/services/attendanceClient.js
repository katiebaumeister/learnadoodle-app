/**
 * API client for enhanced attendance features (check-in/out, manual attendance, reports)
 */
import { apiRequest } from '../apiClient';
import { supabase } from '../supabase';
import { createAttendanceLog } from './recordsClient';

const getErrorText = (err) => String(err?.message || err?.detail || err || '');
const isConflictConstraintError = (err) => {
  const msg = getErrorText(err);
  return msg.includes('no unique or exclusion constraint matching the ON CONFLICT specification')
    || msg.includes('42P10');
};
const isServerFailure = (err) => Number(err?.status || 0) >= 500;
let hasKnownCompleteEndpointConflict = false;

const localCompleteEventFallback = async (eventId, minutesOverride = null) => {
  try {
    const { data: eventRow, error: eventErr } = await supabase
      .from('events')
      .select('id, family_id, child_id, child_ids, start_ts, end_ts')
      .eq('id', eventId)
      .single();
    if (eventErr || !eventRow) {
      return { data: null, error: eventErr || new Error('Event not found for fallback') };
    }

    const { error: statusErr } = await supabase
      .from('events')
      .update({ status: 'done' })
      .eq('id', eventId);
    if (statusErr) return { data: null, error: statusErr };

    const childIds = Array.isArray(eventRow.child_ids) ? eventRow.child_ids.filter(Boolean) : [];
    const chosenChildId = eventRow.child_id || childIds[0] || null;
    if (!chosenChildId) {
      return { data: { id: eventId, status: 'done', source: 'direct-fallback-no-child' }, error: null };
    }

    const start = eventRow.start_ts ? new Date(eventRow.start_ts) : null;
    const end = eventRow.end_ts ? new Date(eventRow.end_ts) : null;
    const dayDate = start && !Number.isNaN(start.getTime()) ? start.toISOString().split('T')[0] : null;
    const computedMinutes =
      minutesOverride != null
        ? Number(minutesOverride)
        : (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
            ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))
            : 60);
    const { data: userData } = await supabase.auth.getUser();
    const createdBy = userData?.user?.id || null;

    if (dayDate) {
      await supabase.from('attendance_records').delete().eq('event_id', eventId);
      const payload = {
        family_id: eventRow.family_id,
        child_id: chosenChildId,
        event_id: eventId,
        day_date: dayDate,
        minutes: computedMinutes,
        status: 'present',
        ...(createdBy ? { created_by: createdBy } : {}),
      };
      await createAttendanceLog(payload);
    }

    return { data: { id: eventId, status: 'done', source: 'direct-fallback-local-complete' }, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
};

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
export async function completeEvent(eventId, minutesOverride = null, options = {}) {
  const requirePersist = options?.requirePersist === true;
  const buildSoftFallback = (source, rootError = null) => {
    if (requirePersist) {
      const reason = getErrorText(rootError) || 'Completion could not be persisted. Please try again.';
      return {
        data: null,
        error: new Error(reason),
      };
    }
    return {
      data: { id: eventId, status: 'done', source, syncPending: true },
      error: null,
    };
  };
  // For strict persistence flows, never short-circuit using cached soft-fallback state.
  if (!requirePersist && hasKnownCompleteEndpointConflict) {
    return buildSoftFallback('soft-fallback-cached');
  }

  const directStatusFallback = async () => {
    try {
      const { error } = await supabase
        .from('events')
        .update({ status: 'done' })
        .eq('id', eventId);
      if (error) return { data: null, error };
      return { data: { id: eventId, status: 'done', source: 'direct-fallback' }, error: null };
    } catch (fallbackErr) {
      return { data: null, error: fallbackErr };
    }
  };

  try {
    const body = minutesOverride !== null ? { minutes_override: minutesOverride } : {};
    const { data, error } = await apiRequest(`/api/events/${encodeURIComponent(eventId)}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    
    if (error) {
      if (isConflictConstraintError(error)) {
        hasKnownCompleteEndpointConflict = true;
        return buildSoftFallback('soft-fallback', error);
      }
      const shouldTryFallback = isConflictConstraintError(error) || isServerFailure(error);
      if (shouldTryFallback) {
        const fallback = await updateEventStatus(eventId, 'done', { allowDirectFallback: !requirePersist });
        if (!fallback.error) {
          return { data: fallback.data, error: null };
        }
        if (requirePersist) {
          return { data: null, error: fallback.error || error };
        }
        const directFallback = await directStatusFallback();
        if (!directFallback.error) {
          return { data: directFallback.data, error: null };
        }
        const localFallback = await localCompleteEventFallback(eventId, minutesOverride);
        if (!localFallback.error) {
          return { data: localFallback.data, error: null };
        }
        // Last-resort UX fallback for known local schema/backend mismatch:
        // keep planner interaction responsive even when backend completion cannot persist.
        if (isConflictConstraintError(error) || isConflictConstraintError(fallback.error) || isConflictConstraintError(directFallback.error)) {
          return buildSoftFallback('soft-fallback', localFallback.error || directFallback.error || fallback.error || error);
        }
      }
      return { data: null, error };
    }
    return { data, error: null };
  } catch (err) {
    if (isConflictConstraintError(err)) {
      hasKnownCompleteEndpointConflict = true;
      return buildSoftFallback('soft-fallback', err);
    }
    if (isConflictConstraintError(err) || isServerFailure(err)) {
      const fallback = await updateEventStatus(eventId, 'done', { allowDirectFallback: !requirePersist });
      if (!fallback.error) {
        return { data: fallback.data, error: null };
      }
      if (requirePersist) {
        return { data: null, error: fallback.error || err };
      }
      const directFallback = await directStatusFallback();
      if (!directFallback.error) {
        return { data: directFallback.data, error: null };
      }
      const localFallback = await localCompleteEventFallback(eventId, minutesOverride);
      if (!localFallback.error) {
        return { data: localFallback.data, error: null };
      }
      if (isConflictConstraintError(err) || isConflictConstraintError(fallback.error) || isConflictConstraintError(directFallback.error)) {
        return buildSoftFallback('soft-fallback', localFallback.error || directFallback.error || fallback.error || err);
      }
    }
    return { data: null, error: err };
  }
}

/**
 * Update event status (for toggling completion or changing status)
 */
export async function updateEventStatus(eventId, status, options = {}) {
  const allowDirectFallback = options?.allowDirectFallback !== false;
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const shouldClearAttendance = normalizedStatus !== 'done' && normalizedStatus !== 'completed';
  const clearAttendanceForEvent = async () => {
    if (!shouldClearAttendance) return;
    try {
      await supabase.from('attendance_records').delete().eq('event_id', eventId);
    } catch (_) {
      // Do not fail status updates when attendance cleanup is unavailable.
    }
  };
  const directStatusFallback = async () => {
    try {
      const { error } = await supabase
        .from('events')
        .update({ status })
        .eq('id', eventId);
      if (error) return { data: null, error };
      await clearAttendanceForEvent();
      return { data: { id: eventId, status, source: 'direct-fallback' }, error: null };
    } catch (fallbackErr) {
      return { data: null, error: fallbackErr };
    }
  };

  try {
    const { data, error } = await apiRequest(`/api/events/${encodeURIComponent(eventId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    
    if (error) {
      if (isServerFailure(error) || isConflictConstraintError(error) || String(error?.message || '').includes('Failed to')) {
        if (allowDirectFallback) {
          const fallback = await directStatusFallback();
          if (!fallback.error) return { data: fallback.data, error: null };
          if (isConflictConstraintError(error) || isConflictConstraintError(fallback.error)) {
            return {
              data: { id: eventId, status, source: 'soft-fallback', syncPending: true },
              error: null,
            };
          }
        }
      }
      return { data: null, error };
    }
    await clearAttendanceForEvent();
    return { data, error: null };
  } catch (err) {
    if (allowDirectFallback) {
      const fallback = await directStatusFallback();
      if (!fallback.error) return { data: fallback.data, error: null };
      if (isConflictConstraintError(err) || isConflictConstraintError(fallback.error)) {
        return {
          data: { id: eventId, status, source: 'soft-fallback', syncPending: true },
          error: null,
        };
      }
    }
    return { data: null, error: err };
  }
}
