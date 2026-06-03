const SUBLINE_SEPARATOR = ' · ';

export function resolveEventDateValue(ev) {
  if (!ev) return null;
  const direct = ev.start || ev.start_ts || ev.start_local || ev.due_ts;
  if (direct) return direct;
  const ymd = String(ev.date_local || ev.date || '').slice(0, 10);
  if (!ymd) return null;
  return `${ymd}T12:00:00.000Z`;
}

export function parseLinkedEventIds(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((id) => String(id)).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function mergeAssignmentsByEventId(rows) {
  const map = {};
  for (const row of rows || []) {
    for (const id of parseLinkedEventIds(row?.linked_event_ids)) {
      if (!map[id]) map[id] = [];
      map[id].push(row);
    }
  }
  return map;
}

export function formatEventTypeLabel(event) {
  if (!event) return 'Lesson';
  const holidayType = String(event?.holiday_type || event?.holidayType || '').trim().toUpperCase();
  if (holidayType === 'CUSTOM_BREAK') return 'Break';
  if (holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'GLOBAL_HOLIDAY') return 'Day Off';
  const raw = String(event?.event_type || event?.type || '').trim();
  if (!raw) return 'Lesson';
  const lower = raw.toLowerCase();
  if (lower === 'schedule block' || lower === 'scheduled class day' || lower === 'classday') return 'Class Day';
  if (lower === 'custom_break' || lower === 'break') return 'Break';
  if (lower === 'custom_holiday' || lower === 'global_holiday' || lower === 'holiday' || lower === 'day off' || lower === 'dayoff') return 'Day Off';
  const knownLabels = {
    lesson: 'Lesson',
    assignment: 'Assignment',
    activity: 'Activity',
    project: 'Project',
    exam: 'Exam',
    assessment: 'Assessment',
    appointment: 'Appointment',
  };
  return knownLabels[lower] || raw;
}

export function formatTimeRangeLabel(event) {
  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  const typeLower = String(event?.event_type || event?.type || '').trim().toLowerCase();
  if (typeLower === 'holiday' || holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'CUSTOM_BREAK' || holidayType === 'GLOBAL_HOLIDAY') {
    return 'All day';
  }
  const startValue = resolveEventDateValue(event);
  const endValue = event?.end_ts || event?.end || event?.end_local;
  const formatTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const startLabel = formatTime(startValue);
  const endLabel = formatTime(endValue);
  if (!startLabel && !endLabel) return '';
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || '';
}

export function formatChildNamesSentence(names) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list[0]}, ${list.slice(1, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export function resolveChildIdsForEvent(event) {
  const ids = [];
  if (event?.child_id) ids.push(String(event.child_id));
  if (Array.isArray(event?.child_ids)) {
    event.child_ids.forEach((id) => {
      if (id != null && String(id).trim()) ids.push(String(id));
    });
  }
  return [...new Set(ids.filter(Boolean))];
}

export function formatChildNamesCommaLine(childIds, children = []) {
  const names = (Array.isArray(childIds) ? childIds : [])
    .map((id) => {
      const match = (children || []).find((child) => String(child?.id) === String(id));
      return String(match?.first_name || match?.name || '').trim() || null;
    })
    .filter(Boolean);
  return names.join(', ');
}

export function resolveChildNamesForEvent(event, children = []) {
  const ids = resolveChildIdsForEvent(event);
  const names = ids
    .map((id) => {
      const match = (children || []).find((child) => String(child?.id) === id);
      return String(match?.first_name || match?.name || '').trim() || null;
    })
    .filter(Boolean);
  return formatChildNamesSentence(names);
}

export function getEventUnitLessonLabel(event) {
  const unitTitle = String(event?.curriculum_unit_title || event?.unit || event?.unit_name || '').trim();
  const meta = event?.curriculum_metadata && typeof event.curriculum_metadata === 'object'
    ? event.curriculum_metadata
    : {};
  const lessonTitle = String(meta?.lesson_label || event?.lesson || event?.lesson_name || '').trim();
  if (unitTitle && lessonTitle) return `${unitTitle}${SUBLINE_SEPARATOR}${lessonTitle}`;
  if (lessonTitle) return lessonTitle;
  if (unitTitle) return unitTitle;
  return '';
}

export function getEventMaterialIds(event) {
  const ids = [];
  const attachmentIds = Array.isArray(event?.materials_attachment_ids)
    ? event.materials_attachment_ids
    : [];
  attachmentIds.forEach((id) => {
    const normalized = String(id || '').trim();
    if (normalized) ids.push(normalized);
  });
  const primaryId = String(event?.material_id || '').trim();
  if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  return ids;
}

export function resolveMaterialDisplayLabel(material, materialId, event) {
  const title = String(material?.title || '').trim();
  if (title) return title;
  const providerName = String(material?.provider_name || '').trim();
  if (providerName) return providerName;
  const primaryId = String(event?.material_id || '').trim();
  if (primaryId && primaryId === String(materialId || '')) {
    const eventTitle = String(event?.material_title || event?.attachment_title || '').trim();
    if (eventTitle) return eventTitle;
  }
  const storagePath = String(material?.storage_path || '').trim();
  if (storagePath) {
    const base = storagePath.split('/').pop();
    if (base) {
      try {
        return decodeURIComponent(base);
      } catch {
        return base;
      }
    }
  }
  return 'Attachment';
}

export function formatEventGradeLabel(event) {
  if (!event) return '';
  if (event.grade != null && event.grade !== '') return String(event.grade);
  if (event.score != null && event.possible != null && Number(event.possible) > 0) {
    const percent = Math.round((Number(event.score) / Number(event.possible)) * 100);
    return `${event.score}/${event.possible} (${percent}%)`;
  }
  if (event.score != null && event.score !== '') return String(event.score);
  return '';
}

export function pickAssignmentForEvent(event, assignments = []) {
  if (!Array.isArray(assignments) || assignments.length === 0) return null;
  const childId = String(
    event?.child_id || event?.childId || (Array.isArray(event?.child_ids) ? event.child_ids[0] : '') || ''
  ).trim();
  if (childId) {
    const match = assignments.find((row) => String(row?.child_id || '') === childId);
    if (match) return match;
  }
  return assignments[0];
}

export function getPlannerEventTypeColors(event) {
  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  const eventType = String(event?.event_type || event?.type || '').trim().toLowerCase();
  if (holidayType === 'CUSTOM_BREAK' || eventType === 'break') {
    return { chipBg: '#FFF7D6', chipText: '#A16207' };
  }
  if (holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'GLOBAL_HOLIDAY' || eventType === 'day off' || eventType === 'holiday') {
    return { chipBg: '#FFEDE2', chipText: '#9A3412' };
  }
  if (eventType === 'lesson' || eventType === 'schedule block' || eventType === 'scheduled class day' || eventType === 'classday' || eventType === 'class day') {
    return { chipBg: '#E3F0FF', chipText: '#4C7ED9' };
  }
  if (eventType === 'activity') return { chipBg: '#EDE6FF', chipText: '#7A5CD6' };
  if (eventType === 'assignment') return { chipBg: '#DFF7E3', chipText: '#4FAF75' };
  if (eventType === 'project') return { chipBg: '#D6F0ED', chipText: '#0D9488' };
  if (eventType === 'exam' || eventType === 'assessment') return { chipBg: '#FCE7F3', chipText: '#BE185D' };
  return { chipBg: '#F2F4F7', chipText: '#6B7280' };
}
