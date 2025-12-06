import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput, Switch, Platform } from 'react-native';
import { Clock, UserCircle, BookOpen, Trash2, Edit2, Calendar, Plus, ChevronDown, X, Save } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { formatDate, apiRequest } from '../../lib/apiClient';
import { getMaterials } from '../../lib/services/materialsClient';
import AddMaterialModal from '../materials/AddMaterialModal';
import { logDeleteEvent } from '../../app/services/plannerInstrumentation';
import StandardsSearchModal from '../standards/StandardsSearchModal';
import MasteryPicker from '../standards/MasteryPicker';
import TemplatePicker from '../templates/TemplatePicker';

const STATUS_BASE = ['scheduled', 'in_progress', 'done', 'skipped', 'canceled'];
const STATUS_NORMALIZE = {
  cancelled: 'canceled',
  canceled: 'canceled',
  'in progress': 'in_progress',
};

const normalizeStatus = (value) => {
  if (!value) return 'scheduled';
  const key = value.toLowerCase();
  return STATUS_NORMALIZE[key] || key;
};

const formatStatusLabel = (value) => value.replace('_', ' ').toUpperCase();

const getTimestamp = (event, keys = []) => {
  for (const key of keys) {
    const value = event[key];
    if (value) {
      // If it's a time string like "09:00", return null (not a valid timestamp)
      if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) {
        continue; // Skip time strings, look for actual timestamps
      }
      return value;
    }
  }
  return null;
};

const toDateInput = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

const toTimeInput = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  // Convert to 12-hour format with AM/PM
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Format date input to enforce YYYY-MM-DD
const formatDateInput = (value) => {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');
  // Format as YYYY-MM-DD
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
};

// Format time input to enforce HH:MM AM/PM with validation
const formatTimeInput = (value) => {
  console.log('[formatTimeInput] Input value:', value);
  
  // Preserve colon and extract AM/PM
  const upper = value.toUpperCase();
  const hasAM = upper.includes('AM');
  const hasPM = upper.includes('PM');
  const hasColon = value.includes(':');
  
  // If there's a colon, split into hour and minute parts
  let hourDigits = '';
  let minuteDigits = '';
  if (hasColon) {
    const colonIndex = value.indexOf(':');
    const beforeColon = value.slice(0, colonIndex);
    const afterColon = value.slice(colonIndex + 1);
    hourDigits = beforeColon.replace(/[^\d]/g, '');
    minuteDigits = afterColon.replace(/[^\d]/g, '');
  } else {
    // No colon - extract all digits
    hourDigits = value.replace(/[^\d]/g, '');
    minuteDigits = '';
  }
  
  const digits = hourDigits + minuteDigits; // For length checks
  console.log('[formatTimeInput] Hour digits:', hourDigits, 'Minute digits:', minuteDigits, 'hasColon:', hasColon, 'hasAM:', hasAM, 'hasPM:', hasPM);
  
  if (digits.length === 0) {
    console.log('[formatTimeInput] No digits, returning empty');
    return '';
  }
  
  // Single digit hour - allow 1-9 (valid hours in 12-hour format)
  if (hourDigits.length === 1 && minuteDigits.length === 0) {
    const d = parseInt(hourDigits, 10);
    if (d === 0 || d > 9) {
      console.log('[formatTimeInput] Invalid single digit:', d);
      return '';
    }
    // Preserve colon if present (user is typing minutes)
    if (hasColon) {
      const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
      const result = `${hourDigits}:${minuteDigits}${ampm}`;
      console.log('[formatTimeInput] Single digit hour with colon result:', result);
      return result;
    }
    // No colon - just preserve AM/PM if present
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
    console.log('[formatTimeInput] Single digit valid:', hourDigits, 'with AM/PM:', ampm);
    return hourDigits + ampm;
  }
  
  // Single digit hour with minutes being typed
  if (hourDigits.length === 1 && minuteDigits.length > 0) {
    const d = parseInt(hourDigits, 10);
    if (d === 0 || d > 9) {
      console.log('[formatTimeInput] Invalid single digit hour:', d);
      return '';
    }
    // Limit minutes to 2 digits
    const limitedMinutes = minuteDigits.slice(0, 2);
    // Validate minutes (0-59)
    if (limitedMinutes.length === 2) {
      const mins = parseInt(limitedMinutes, 10);
      if (mins > 59) {
        // Invalid minutes - keep only first digit
        const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
        const result = `${hourDigits}:${limitedMinutes[0]}${ampm}`;
        console.log('[formatTimeInput] Invalid minutes, keeping first digit:', result);
        return result;
      }
    }
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
    const result = `${hourDigits}:${limitedMinutes}${ampm}`;
    console.log('[formatTimeInput] Single digit hour with minutes result:', result);
    return result;
  }
  
  // Two digit hour - validate hours (1-12)
  if (hourDigits.length === 2 && minuteDigits.length === 0) {
    const hours = parseInt(hourDigits, 10);
    if (hours > 12) {
      // Invalid hour like "20" - keep only first digit and add colon for minutes
      console.log('[formatTimeInput] Invalid hours > 12:', hours, '->', `${hourDigits[0]}:`);
      return `${hourDigits[0]}:`;
    }
    if (hours === 0) {
      console.log('[formatTimeInput] Invalid hours = 0');
      return '';
    }
    // Auto-insert colon after 2 digits if not already present (unless AM/PM is already set)
    const ampm = hasPM ? 'PM' : hasAM ? 'AM' : '';
    if (hasColon) {
      // Already has colon - preserve it
      const result = `${hourDigits}:${minuteDigits}${ampm ? ' ' + ampm : ''}`;
      console.log('[formatTimeInput] Two digits with colon result:', result);
      return result;
    } else if (ampm) {
      // If AM/PM is set, don't auto-add colon yet
      const result = `${hourDigits} ${ampm}`;
      console.log('[formatTimeInput] Two digits with AM/PM result:', result);
      return result;
    } else {
      // Auto-add colon to allow typing minutes
      const result = `${hourDigits}:`;
      console.log('[formatTimeInput] Two digits auto-adding colon result:', result);
      return result;
    }
  }
  
  // Two digit hour with minutes being typed
  if (hourDigits.length === 2 && minuteDigits.length > 0) {
    const hours = parseInt(hourDigits, 10);
    if (hours > 12 || hours === 0) {
      console.log('[formatTimeInput] Invalid hours:', hours);
      return `${hourDigits[0]}:${minuteDigits}`;
    }
    // Limit minutes to 2 digits
    const limitedMinutes = minuteDigits.slice(0, 2);
    // Validate minutes (0-59)
    if (limitedMinutes.length === 2) {
      const mins = parseInt(limitedMinutes, 10);
      if (mins > 59) {
        // Invalid minutes - keep only first digit
        const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
        const result = `${hourDigits}:${limitedMinutes[0]}${ampm}`;
        console.log('[formatTimeInput] Invalid minutes, keeping first digit:', result);
        return result;
      }
    }
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
    const result = `${hourDigits}:${limitedMinutes}${ampm}`;
    console.log('[formatTimeInput] Two digit hour with minutes result:', result);
    return result;
  }
  
  // Handle remaining edge cases - if we get here, something unexpected happened
  // Fallback: try to format based on total digits
  console.log('[formatTimeInput] Fallback case - hourDigits:', hourDigits, 'minuteDigits:', minuteDigits);
  
  // If we have hour digits but no colon and no minutes, just return what we have
  if (hourDigits.length > 0 && !hasColon && minuteDigits.length === 0) {
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
    return hourDigits + ampm;
  }
  
  // If we have both hour and minute digits, format them
  if (hourDigits.length > 0 && minuteDigits.length > 0) {
    const limitedMinutes = minuteDigits.slice(0, 2);
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
    return `${hourDigits}:${limitedMinutes}${ampm}`;
  }
  
  console.log('[formatTimeInput] No match, returning empty');
  return '';
};

// Validate and convert time string to 24-hour format for storage
const parseTimeTo24Hour = (timeStr) => {
  if (!timeStr) return null;
  
  // Handle formats: "8 AM", "8:00 AM", "08:00 AM", "8", "8:00"
  // Match: (hours)(optional colon and minutes)(optional AM/PM)
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0; // Default to 0 if no minutes
  const ampm = match[3]?.toUpperCase();
  
  // Validate 12-hour format: hours must be 1-12 when AM/PM is present
  if (ampm && (hours < 1 || hours > 12)) return null;
  
  // Validate minutes
  if (minutes < 0 || minutes > 59) return null;
  
  // Convert to 24-hour format
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  
  // Final validation for 24-hour format
  if (hours < 0 || hours > 23) return null;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const combineDateTime = (dateStr, timeStr, fallbackMinutes = 0) => {
  if (!dateStr) return null;
  // Convert time string to 24-hour format if needed
  const time24 = parseTimeTo24Hour(timeStr) || '00:00';
  const base = new Date(`${dateStr}T${time24}`);
  if (Number.isNaN(base.getTime())) return null;
  if (!timeStr && fallbackMinutes > 0) {
    base.setMinutes(base.getMinutes() + fallbackMinutes);
  }
  return base;
};

const formatTime = (timestamp) => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const SUGGESTED_TAGS = ['math', 'reading', 'science', 'writing', 'review', 'test', 'project', 'practice'];

export default function EventDetails({ event, onEventUpdated, onEventDeleted, familyMembers = [], onEventPatched, familyId }) {
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftStartTime, setDraftStartTime] = useState('');
  const [draftEndTime, setDraftEndTime] = useState('');
  const [draftChildId, setDraftChildId] = useState(null);
  const [draftAllDay, setDraftAllDay] = useState(false);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftStatus, setDraftStatus] = useState('scheduled');
  const [draftTags, setDraftTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [draftMaterialId, setDraftMaterialId] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  
  // Standards state
  const [attachedStandards, setAttachedStandards] = useState([]);
  const [showStandardsModal, setShowStandardsModal] = useState(false);
  const [loadingStandards, setLoadingStandards] = useState(false);
  const [standardsMastery, setStandardsMastery] = useState({}); // Map of standard_id -> mastery_level
  
  // Templates state
  const [savingAsTemplate, setSavingAsTemplate] = useState(false);
  const [showTemplateNameInput, setShowTemplateNameInput] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const startPeriod = useMemo(() => {
    if (!draftStartTime) return null;
    const upper = draftStartTime.toUpperCase();
    if (upper.includes('AM') && !upper.includes('PM')) return 'AM';
    if (upper.includes('PM')) return 'PM';
    return null;
  }, [draftStartTime]);

  const endPeriod = useMemo(() => {
    if (!draftEndTime) return null;
    const upper = draftEndTime.toUpperCase();
    if (upper.includes('AM') && !upper.includes('PM')) return 'AM';
    if (upper.includes('PM')) return 'PM';
    return null;
  }, [draftEndTime]);

  const statusColors = useMemo(
    () => ({
      scheduled: '#f3f4f6',
      done: '#f3f4f6',
      skipped: '#f3f4f6',
      canceled: '#f3f4f6',
      in_progress: '#f3f4f6',
    }),
    []
  );

  const statusOptions = useMemo(() => {
    const current = normalizeStatus(event?.status);
    return Array.from(new Set([...STATUS_BASE, current].filter(Boolean)));
  }, [event?.status]);

  // Load standards when event loads
  useEffect(() => {
    if (event?.id) {
      loadAttachedStandards();
    }
  }, [event?.id]);

  const loadAttachedStandards = async () => {
    if (!event?.id) return;
    setLoadingStandards(true);
    try {
      const { data, error } = await supabase
        .from('lesson_standards')
        .select('standard_id, standards(*)')
        .eq('lesson_id', event.id);
      
      if (error) throw error;
      
      const standards = (data || []).map(item => ({
        id: item.standard_id,
        ...item.standards,
      }));
      setAttachedStandards(standards);
      
      // Load mastery levels if event is done and has a student
      if (event.status === 'done' && event.child_id) {
        const standardIds = standards.map(s => s.id);
        if (standardIds.length > 0) {
          const { data: masteryData, error: masteryError } = await supabase
            .from('student_standard_mastery')
            .select('standard_id, mastery_level')
            .eq('student_id', event.child_id)
            .in('standard_id', standardIds);
          
          if (!masteryError && masteryData) {
            const masteryMap = {};
            masteryData.forEach(m => {
              masteryMap[m.standard_id] = m.mastery_level;
            });
            setStandardsMastery(masteryMap);
          }
        }
      }
    } catch (error) {
      console.error('Error loading standards:', error);
    } finally {
      setLoadingStandards(false);
    }
  };

  const handleAttachStandards = async (standards) => {
    if (!event?.id) return;
    
    try {
      const { error } = await apiRequest('/api/standards/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: event.id,
          standards: standards.map(s => s.id),
        }),
      });
      
      if (error) throw error;
      
      setAttachedStandards(standards);
      onEventUpdated?.();
    } catch (error) {
      console.error('Error attaching standards:', error);
      Alert.alert('Error', 'Failed to attach standards');
    }
  };

  const handleRemoveStandard = async (standardId) => {
    if (!event?.id) return;
    
    try {
      const { error } = await supabase
        .from('lesson_standards')
        .delete()
        .eq('lesson_id', event.id)
        .eq('standard_id', standardId);
      
      if (error) throw error;
      
      setAttachedStandards(prev => prev.filter(s => s.id !== standardId));
      setStandardsMastery(prev => {
        const next = { ...prev };
        delete next[standardId];
        return next;
      });
      onEventUpdated?.();
    } catch (error) {
      console.error('Error removing standard:', error);
      Alert.alert('Error', 'Failed to remove standard');
    }
  };

  const handleMasteryUpdate = async (data) => {
    if (!event?.child_id) return;
    
    try {
      const { error } = await apiRequest('/api/standards/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (error) throw error;
      
      setStandardsMastery(prev => ({
        ...prev,
        [data.standard_id]: data.mastery_level,
      }));
      onEventUpdated?.();
    } catch (error) {
      console.error('Error updating mastery:', error);
      Alert.alert('Error', 'Failed to update mastery level');
    }
  };

  const handleApplyTemplate = async (template) => {
    if (!event?.id) return;
    
    try {
      const { data, error } = await apiRequest(`/api/lesson-templates/${template.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson_id: event.id }),
      });
      
      if (error) throw error;
      
      // Update local state with template data
      if (data.template) {
        setDraftNotes(data.template.default_objectives || draftNotes);
        // Could update other fields too
      }
      
      // Reload event to get updated data
      onEventUpdated?.();
      Alert.alert('Success', 'Template applied successfully');
    } catch (error) {
      console.error('Error applying template:', error);
      Alert.alert('Error', 'Failed to apply template');
    }
  };

  const handleSaveAsTemplate = () => {
    if (!event?.id) return;
    setShowTemplateNameInput(true);
    setTemplateName(event.title || '');
  };

  const confirmSaveTemplate = async () => {
    if (!event?.id || !templateName.trim()) {
      Alert.alert('Error', 'Template name is required');
      return;
    }
    
    setSavingAsTemplate(true);
    try {
      const { data, error } = await apiRequest('/api/lesson-templates/from-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: event.id,
          title: templateName.trim(),
        }),
      });
      
      if (error) throw error;
      
      setShowTemplateNameInput(false);
      setTemplateName('');
      Alert.alert('Success', 'Template saved successfully');
    } catch (error) {
      console.error('Error saving template:', error);
      Alert.alert('Error', 'Failed to save template');
    } finally {
      setSavingAsTemplate(false);
    }
  };

  useEffect(() => {
    if (!event) return;

    const startTs = getTimestamp(event, ['start_ts', 'start', 'start_local']);
    const endTs = getTimestamp(event, ['end_ts', 'end', 'end_local']);

    setDraftTitle(event.title || '');
    const dateString = toDateInput(startTs);
    setDraftDate(dateString);

    const inferredAllDay =
      !!startTs &&
      (() => {
        try {
          const startDate = new Date(startTs);
          const endDate = endTs ? new Date(endTs) : null;
          const startIsMidnight = startDate.getHours() === 0 && startDate.getMinutes() === 0;
          const endIsMidnight = endDate ? endDate.getHours() === 0 && endDate.getMinutes() === 0 : true;

          if (startIsMidnight && endIsMidnight) {
            return true;
          }
        } catch {
          return false;
        }
        return false;
      })();

    setDraftAllDay(inferredAllDay || (!startTs && !endTs));

    if (inferredAllDay) {
      setDraftStartTime('');
      setDraftEndTime('');
    } else {
      setDraftStartTime(toTimeInput(startTs));
      setDraftEndTime(toTimeInput(endTs));
    }
    setDraftChildId(event.child_id || event.childId || event.child?.id || null);
    setDraftNotes(event.description || event.notes || '');
    setDraftStatus(normalizeStatus(event.status));
    setDraftTags(Array.isArray(event.tags) ? event.tags : []);
    setTagInput('');
    setDraftMaterialId(event.material_id || null);
    setEditing(false);
  }, [event]);

  // Load materials when editing starts
  useEffect(() => {
    if (editing && familyId) {
      loadMaterials();
    }
  }, [editing, familyId]);

  const loadMaterials = async () => {
    if (!familyId) return;
    setLoadingMaterials(true);
    try {
      const data = await getMaterials(familyId);
      setMaterials(data);
    } catch (error) {
      console.error('Error loading materials:', error);
    } finally {
      setLoadingMaterials(false);
    }
  };

  const childName =
    event?.child?.first_name ||
    event?.child?.name ||
    event?.childName ||
    event?.child_name ||
    (Array.isArray(event?.assignees) && event.assignees.length ? event.assignees.join(', ') : null);

  const subjectName = event?.subject?.name || event?.subject || event?.subjectName || event?.subject_name;

  const handleDelete = async () => {
    console.log('[EventDetails] handleDelete called');
    console.log('[EventDetails] Event object:', event);
    console.log('[EventDetails] Event ID:', event?.id);
    
    if (!event?.id) {
      console.error('[EventDetails] Event ID is missing, cannot delete');
      if (Platform.OS === 'web') {
        window.alert('Error: Event ID is missing');
      } else {
        Alert.alert('Error', 'Event ID is missing');
      }
      return;
    }
    
    console.log('[EventDetails] Showing delete confirmation');
    
    // Use window.confirm on web, Alert.alert on native
    let confirmed = false;
    if (Platform.OS === 'web') {
      confirmed = window.confirm('Are you sure you want to delete this event?');
      console.log('[EventDetails] User confirmed delete:', confirmed);
    } else {
      // For native, use Alert.alert with Promise wrapper
      confirmed = await new Promise((resolve) => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?',
      [
            { 
              text: 'Cancel', 
              style: 'cancel',
              onPress: () => {
                console.log('[EventDetails] Delete cancelled by user');
                resolve(false);
              }
            },
        {
          text: 'Delete',
          style: 'destructive',
              onPress: () => {
                console.log('[EventDetails] Delete confirmed by user');
                resolve(true);
              },
            },
          ]
        );
      });
    }
    
    if (!confirmed) {
      console.log('[EventDetails] Delete cancelled, aborting');
      return;
    }
    
    console.log('[EventDetails] Delete confirmed, starting deletion process');
            setDeleting(true);
            try {
      console.log('[EventDetails] Attempting to delete event with ID:', event.id);
      console.log('[EventDetails] Supabase client:', supabase ? 'available' : 'missing');
      
      const deleteQuery = supabase
        .from('events')
        .delete()
        .eq('id', event.id)
        .select();
      
      console.log('[EventDetails] Delete query constructed, executing...');
      const { data, error } = await deleteQuery;
      
      console.log('[EventDetails] Delete response received');
      console.log('[EventDetails] Delete response data:', data);
      console.log('[EventDetails] Delete response error:', error);
      
      if (error) {
        console.error('[EventDetails] Delete error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }
      
      console.log('[EventDetails] Event deleted successfully, calling onEventDeleted callback');
      console.log('[EventDetails] onEventDeleted function:', onEventDeleted ? 'exists' : 'missing');
      
              if (onEventDeleted) {
                onEventDeleted(event.id);
                console.log('[EventDetails] onEventDeleted callback executed with event ID:', event.id);
              } else {
                console.warn('[EventDetails] onEventDeleted callback is not provided');
              }
              
              // Log delete event action (will be logged in PlannerWeek.handleEventDeleted if called from there)
              // EventDetails is used in multiple contexts, so we log here as fallback
              try {
                const eventDate = event.start_ts ? new Date(event.start_ts).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                logDeleteEvent(
                  event.id,
                  eventDate,
                  event.child_id
                );
              } catch (logError) {
                console.warn('Failed to log event deletion:', logError);
              }
            } catch (err) {
      console.error('[EventDetails] Exception during delete:', err);
      console.error('[EventDetails] Error stack:', err?.stack);
      const errorMessage = err?.message || err?.details || 'Failed to delete event';
      console.error('[EventDetails] Showing error alert:', errorMessage);
      
      if (Platform.OS === 'web') {
        window.alert(`Failed to delete event: ${errorMessage}`);
      } else {
        Alert.alert('Error', `Failed to delete event: ${errorMessage}`);
      }
            } finally {
      console.log('[EventDetails] Setting deleting state to false');
              setDeleting(false);
            }
  };

  const toggleTag = (tag) => {
    setDraftTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setTagInput('');
  };

  const commitTag = () => {
    const trimmed = tagInput.trim().replace(/^#/, '');
    if (trimmed && !draftTags.includes(trimmed)) {
      setDraftTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    setDraftTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    if (!event?.id) return;
    if (!draftTitle.trim()) {
      Alert.alert('Validation', 'Please enter a title.');
      return;
    }

    let startDateObj = null;
    let endDateObj = null;

    if (draftDate) {
      if (draftAllDay) {
        startDateObj = combineDateTime(draftDate, null);
        endDateObj = null;
        if (!startDateObj || Number.isNaN(startDateObj.getTime())) {
          Alert.alert('Validation', 'Start date is invalid.');
          return;
        }
      } else {
        if (!draftStartTime) {
          Alert.alert('Validation', 'Please enter a start time or mark the event as All Day.');
          return;
        }

        startDateObj = combineDateTime(draftDate, draftStartTime);
        if (!startDateObj || Number.isNaN(startDateObj.getTime())) {
          Alert.alert('Validation', 'Start date/time is invalid.');
          return;
        }

        if (draftEndTime) {
          endDateObj = combineDateTime(draftDate, draftEndTime);
          if (!endDateObj || Number.isNaN(endDateObj.getTime())) {
            Alert.alert('Validation', 'End time is invalid.');
            return;
          }
        } else {
          endDateObj = new Date(startDateObj.getTime() + 30 * 60 * 1000);
        }
      }
    }

    setSaving(true);
    try {
      const updates = {
        title: draftTitle.trim(),
        description: draftNotes.trim() ? draftNotes.trim() : null,
        child_id: draftChildId || null,
        status: normalizeStatus(draftStatus),
        tags: draftTags.length ? draftTags : null,
        material_id: draftMaterialId || null,
      };

      if (startDateObj) {
        updates.start_ts = startDateObj.toISOString();
        updates.end_ts = endDateObj?.toISOString() || null;
      }

      const { error } = await supabase.from('events').update(updates).eq('id', event.id);
      if (error) throw error;

      const patch = { ...updates };
      if (!('start_ts' in patch) && event.start_ts) {
        patch.start_ts = event.start_ts;
      }
      if (!('end_ts' in patch) && event.end_ts) {
        patch.end_ts = event.end_ts;
      }

      setEditing(false);
      onEventPatched?.({
        id: event.id,
        previous_start_ts: event.start_ts,
        ...patch,
      });
      onEventUpdated?.();
    } catch (err) {
      console.error('Error updating event:', err);
      Alert.alert('Error', 'Failed to update event');
    } finally {
      setSaving(false);
    }
  };

  const renderTagsView = (tags) => {
    if (!tags || tags.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tags</Text>
        <View style={styles.tagsRow}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagChipText}>#{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderEditForm = () => (
    <View style={styles.editForm}>
      <Text style={styles.fieldLabel}>Title</Text>
      <TextInput
        style={styles.input}
        value={draftTitle}
        onChangeText={setDraftTitle}
        placeholder="Event title"
      />

      <View>
        <Text style={styles.fieldLabel}>Date</Text>
        <TextInput
          style={styles.input}
          value={draftDate}
          onChangeText={(value) => {
            const formatted = formatDateInput(value);
            setDraftDate(formatted);
          }}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.fieldLabel}>All day</Text>
        <Switch
          value={draftAllDay}
          onValueChange={(value) => {
            setDraftAllDay(value);
            if (value) {
              setDraftStartTime('');
              setDraftEndTime('');
            }
          }}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={draftAllDay ? colors.white : colors.card}
        />
      </View>

      <View style={styles.inlineRow}>
        <View style={styles.inlineField}>
          <Text style={styles.fieldLabel}>Start time</Text>
          <View style={styles.timeInputContainer}>
            <TextInput
              style={styles.timeInput}
              value={draftStartTime.replace(/\s*(AM|PM)/i, '').trim()}
              onChangeText={(value) => {
                console.log('[StartTime] onChangeText - value:', value, 'current draftStartTime:', draftStartTime);
                // Extract current AM/PM if it exists
                const currentAMPM = draftStartTime.match(/\s*(AM|PM)/i)?.[0]?.trim() || '';
                console.log('[StartTime] Current AM/PM:', currentAMPM);
                const formatted = formatTimeInput(value + (currentAMPM ? ' ' + currentAMPM : ''));
                console.log('[StartTime] Formatted result:', formatted);
                setDraftStartTime(formatted);
              }}
              placeholder="09:00"
              maxLength={6}
              keyboardType="numeric"
              editable={!draftAllDay}
              selectTextOnFocus={!draftAllDay}
            />
            <View style={styles.timePeriodContainer} pointerEvents="box-none">
              <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => {
                  if (draftAllDay) return;
                  console.log('[StartTime] AM button pressed');
                  let timeWithoutAMPM = draftStartTime.replace(/\s*(AM|PM)/i, '').trim();
                  // If no colon, add ":00" for proper parsing
                  if (timeWithoutAMPM && !timeWithoutAMPM.includes(':')) {
                    timeWithoutAMPM = `${timeWithoutAMPM}:00`;
                  }
                  const timeValue = timeWithoutAMPM || '12:00';
                  console.log('[StartTime] Setting to:', `${timeValue} AM`);
                  setDraftStartTime(`${timeValue} AM`);
                }}
                style={[
                  styles.timePeriodButton,
                  draftAllDay && styles.timePeriodButtonDisabled,
                  startPeriod === 'AM' && styles.timePeriodButtonActive
                ]}
              >
                <Text style={[
                  styles.timePeriodButtonText,
                  draftAllDay && styles.timePeriodButtonTextDisabled,
                  startPeriod === 'AM' && styles.timePeriodButtonTextActive
                ]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => {
                  if (draftAllDay) return;
                  console.log('[StartTime] PM button pressed');
                  let timeWithoutAMPM = draftStartTime.replace(/\s*(AM|PM)/i, '').trim();
                  // If no colon, add ":00" for proper parsing
                  if (timeWithoutAMPM && !timeWithoutAMPM.includes(':')) {
                    timeWithoutAMPM = `${timeWithoutAMPM}:00`;
                  }
                  const timeValue = timeWithoutAMPM || '12:00';
                  console.log('[StartTime] Setting to:', `${timeValue} PM`);
                  setDraftStartTime(`${timeValue} PM`);
                }}
                style={[
                  styles.timePeriodButton,
                  draftAllDay && styles.timePeriodButtonDisabled,
                  startPeriod === 'PM' && styles.timePeriodButtonActive
                ]}
              >
                <Text style={[
                  styles.timePeriodButtonText,
                  draftAllDay && styles.timePeriodButtonTextDisabled,
                  startPeriod === 'PM' && styles.timePeriodButtonTextActive
                ]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={styles.inlineField}>
          <Text style={styles.fieldLabel}>End time</Text>
          <View style={styles.timeInputContainer}>
            <TextInput
              style={styles.timeInput}
              value={draftEndTime.replace(/\s*(AM|PM)/i, '').trim()}
              onChangeText={(value) => {
                console.log('[EndTime] onChangeText - value:', value, 'current draftEndTime:', draftEndTime);
                // Extract current AM/PM if it exists
                const currentAMPM = draftEndTime.match(/\s*(AM|PM)/i)?.[0]?.trim() || '';
                console.log('[EndTime] Current AM/PM:', currentAMPM);
                const formatted = formatTimeInput(value + (currentAMPM ? ' ' + currentAMPM : ''));
                console.log('[EndTime] Formatted result:', formatted);
                setDraftEndTime(formatted);
              }}
              placeholder="10:00"
              maxLength={6}
              keyboardType="numeric"
              editable={!draftAllDay}
              selectTextOnFocus={!draftAllDay}
            />
            <View style={styles.timePeriodContainer} pointerEvents="box-none">
              <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => {
                  if (draftAllDay) return;
                  console.log('[EndTime] AM button pressed');
                  let timeWithoutAMPM = draftEndTime.replace(/\s*(AM|PM)/i, '').trim();
                  // If no colon, add ":00" for proper parsing
                  if (timeWithoutAMPM && !timeWithoutAMPM.includes(':')) {
                    timeWithoutAMPM = `${timeWithoutAMPM}:00`;
                  }
                  const timeValue = timeWithoutAMPM || '12:00';
                  console.log('[EndTime] Setting to:', `${timeValue} AM`);
                  setDraftEndTime(`${timeValue} AM`);
                }}
                style={[
                  styles.timePeriodButton,
                  draftAllDay && styles.timePeriodButtonDisabled,
                  endPeriod === 'AM' && styles.timePeriodButtonActive
                ]}
              >
                <Text style={[
                  styles.timePeriodButtonText,
                  draftAllDay && styles.timePeriodButtonTextDisabled,
                  endPeriod === 'AM' && styles.timePeriodButtonTextActive
                ]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => {
                  if (draftAllDay) return;
                  console.log('[EndTime] PM button pressed');
                  let timeWithoutAMPM = draftEndTime.replace(/\s*(AM|PM)/i, '').trim();
                  // If no colon, add ":00" for proper parsing
                  if (timeWithoutAMPM && !timeWithoutAMPM.includes(':')) {
                    timeWithoutAMPM = `${timeWithoutAMPM}:00`;
                  }
                  const timeValue = timeWithoutAMPM || '12:00';
                  console.log('[EndTime] Setting to:', `${timeValue} PM`);
                  setDraftEndTime(`${timeValue} PM`);
                }}
                style={[
                  styles.timePeriodButton,
                  draftAllDay && styles.timePeriodButtonDisabled,
                  endPeriod === 'PM' && styles.timePeriodButtonActive
                ]}
              >
                <Text style={[
                  styles.timePeriodButtonText,
                  draftAllDay && styles.timePeriodButtonTextDisabled,
                  endPeriod === 'PM' && styles.timePeriodButtonTextActive
                ]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Material Selector */}
      <Text style={styles.fieldLabel}>Material (optional)</Text>
      <View style={styles.materialSelectorContainer}>
        <TouchableOpacity
          style={styles.materialSelector}
          onPress={() => setShowMaterialDropdown(!showMaterialDropdown)}
        >
          <Text style={[styles.materialSelectorText, !draftMaterialId && styles.materialSelectorPlaceholder]}>
            {draftMaterialId 
              ? materials.find(m => m.id === draftMaterialId)?.title || 'Select material...'
              : 'Select material...'}
          </Text>
          <ChevronDown size={16} color={colors.muted} />
        </TouchableOpacity>
        {draftMaterialId && (
          <TouchableOpacity
            style={styles.clearMaterialButton}
            onPress={() => setDraftMaterialId(null)}
          >
            <Text style={styles.clearMaterialText}>Clear</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.addMaterialButton}
          onPress={() => setShowAddMaterialModal(true)}
        >
          <Plus size={14} color={colors.accent} />
          <Text style={styles.addMaterialText}>Add New</Text>
        </TouchableOpacity>
      </View>
      {showMaterialDropdown && (
        <View style={styles.materialDropdown}>
          <ScrollView style={styles.materialDropdownList} nestedScrollEnabled>
            {loadingMaterials ? (
              <Text style={styles.materialDropdownItem}>Loading...</Text>
            ) : materials.length === 0 ? (
              <Text style={styles.materialDropdownItem}>No materials yet</Text>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.materialDropdownItem}
                  onPress={() => {
                    setDraftMaterialId(null);
                    setShowMaterialDropdown(false);
                  }}
                >
                  <Text style={styles.materialDropdownItemText}>None</Text>
                </TouchableOpacity>
                {materials.map((material) => (
                  <TouchableOpacity
                    key={material.id}
                    style={[
                      styles.materialDropdownItem,
                      draftMaterialId === material.id && styles.materialDropdownItemActive
                    ]}
                    onPress={() => {
                      setDraftMaterialId(material.id);
                      setShowMaterialDropdown(false);
                    }}
                  >
                    <Text style={[
                      styles.materialDropdownItemText,
                      draftMaterialId === material.id && styles.materialDropdownItemTextActive
                    ]}>
                      {material.title} ({material.type})
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      )}

      <Text style={styles.fieldLabel}>Child</Text>
      <View style={styles.tagsRow}>
        {familyMembers.map((member) => {
          const active = draftChildId === member.id;
          return (
            <TouchableOpacity
              key={member.id}
              onPress={() => setDraftChildId(active ? null : member.id)}
              style={[styles.assigneeChip, active && styles.assigneeChipActive]}
            >
              <Text style={[styles.assigneeChipText, active && styles.assigneeChipTextActive]}>
                {member.name}
              </Text>
            </TouchableOpacity>
          );
        })}
        {familyMembers.length === 0 && (
          <Text style={styles.emptyHint}>No family members found.</Text>
        )}
      </View>

      <Text style={styles.fieldLabel}>Status</Text>
      <View style={styles.tagsRow}>
        {statusOptions.map((status) => {
          const active = draftStatus === status;
          return (
            <TouchableOpacity
              key={status}
              onPress={() => setDraftStatus(status)}
              style={[styles.statusChip, active && styles.statusChipActive]}
            >
              <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                {formatStatusLabel(status)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Notes</Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        value={draftNotes}
        onChangeText={setDraftNotes}
        placeholder="Add notes"
        multiline
      />

      {/* Template Section */}
      <View style={styles.templateSection}>
        <Text style={styles.fieldLabel}>Template</Text>
        <TemplatePicker
          subjectId={event?.subject_id}
          familyId={familyId}
          onSelect={handleApplyTemplate}
        />
        {!familyId && (
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>
            Warning: Family ID missing - templates may not load
          </Text>
        )}
        {event?.id && (
          <TouchableOpacity
            style={styles.saveTemplateButton}
            onPress={handleSaveAsTemplate}
            disabled={savingAsTemplate}
          >
            <Text style={styles.saveTemplateButtonText}>
              {savingAsTemplate ? 'Saving...' : 'Save as Template'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.fieldLabel}>Tags</Text>
      <View style={styles.tagsRow}>
        {draftTags.map((tag) => (
          <TouchableOpacity key={tag} style={styles.editTagChip} onPress={() => removeTag(tag)}>
            <Text style={styles.editTagChipText}>#{tag} ✕</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={tagInput}
        onChangeText={(value) => {
          setTagInput(value);
          if (/[\s,]$/.test(value)) {
            commitTag();
          }
        }}
        onSubmitEditing={commitTag}
        placeholder="Type #label and press enter"
      />
      <View style={styles.tagsRow}>
        {SUGGESTED_TAGS.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[styles.suggestedChip, draftTags.includes(tag) && styles.suggestedChipActive]}
            onPress={() => toggleTag(tag)}
          >
            <Text style={[styles.suggestedChipText, draftTags.includes(tag) && styles.suggestedChipTextActive]}>#{tag}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderViewMode = () => {
    const currentStatus = normalizeStatus(event.status || event.data?.status || 'scheduled');

    return (
      <>
        <Text style={styles.title}>{event.title || 'Untitled Event'}</Text>

        <View style={[styles.statusBadge, { backgroundColor: statusColors[currentStatus] || colors.muted }]}>
          <Text style={styles.statusText}>{formatStatusLabel(currentStatus)}</Text>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.detailRow}>
            <Calendar size={16} color={colors.muted} />
            <Text style={styles.detailLabel}>Date:</Text>
            <Text style={styles.detailValue}>
              {(() => {
                const timestamp = getTimestamp(event, ['start_ts', 'start', 'start_local']);
                if (!timestamp) return '—';
                // If it's a time string like "09:00", skip it and try other fields
                if (typeof timestamp === 'string' && /^\d{2}:\d{2}$/.test(timestamp)) {
                  const fallback = getTimestamp(event, ['start_ts']);
                  return fallback ? formatDate(fallback) : '—';
                }
                return formatDate(timestamp);
              })()}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Clock size={16} color={colors.muted} />
            <Text style={styles.detailLabel}>Time:</Text>
            <Text style={styles.detailValue}>
              {(() => {
                const startTs = getTimestamp(event, ['start_ts', 'start', 'start_local']);
                const endTs = getTimestamp(event, ['end_ts', 'end', 'end_local']);
                // If timestamps are time strings, try to get proper timestamps
                const start = (typeof startTs === 'string' && /^\d{2}:\d{2}$/.test(startTs))
                  ? getTimestamp(event, ['start_ts']) || startTs
                  : startTs;
                const end = (typeof endTs === 'string' && /^\d{2}:\d{2}$/.test(endTs))
                  ? getTimestamp(event, ['end_ts']) || endTs
                  : endTs;
                return `${formatTime(start)} - ${formatTime(end)}`;
              })()}
            </Text>
          </View>

          {childName && (
            <View style={styles.detailRow}>
              <UserCircle size={16} color={colors.muted} />
              <Text style={styles.detailLabel}>Child:</Text>
              <Text style={styles.detailValue}>{childName}</Text>
            </View>
          )}

          {subjectName && (
            <View style={styles.detailRow}>
              <BookOpen size={16} color={colors.muted} />
              <Text style={styles.detailLabel}>Subject:</Text>
              <Text style={styles.detailValue}>{subjectName}</Text>
            </View>
          )}

          {(event.estimated_minutes || event.minutes) && (
            <View style={styles.detailRow}>
              <Clock size={16} color={colors.muted} />
              <Text style={styles.detailLabel}>Duration:</Text>
              <Text style={styles.detailValue}>{event.estimated_minutes || event.minutes} minutes</Text>
            </View>
          )}

          {event.is_flexible && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Type:</Text>
              <Text style={styles.detailValue}>Flexible Task</Text>
            </View>
          )}
        </View>

        {(event.description || event.notes) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.sectionContent}>{event.description || event.notes}</Text>
          </View>
        )}

        {renderTagsView(event.tags)}

        {/* Standards Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Standards</Text>
            <TouchableOpacity 
              style={styles.attachButton}
              onPress={() => setShowStandardsModal(true)}
            >
              <Plus size={16} color={colors.primary} />
              <Text style={styles.attachButtonText}>Attach Standard</Text>
            </TouchableOpacity>
          </View>
          
          {loadingStandards ? (
            <Text style={styles.loadingText}>Loading standards...</Text>
          ) : attachedStandards.length === 0 ? (
            <Text style={styles.emptyText}>No standards attached</Text>
          ) : (
            <View style={styles.standardsList}>
              {attachedStandards.map(standard => (
                <View key={standard.id} style={styles.standardItem}>
                  <View style={styles.standardContent}>
                    <Text style={styles.standardCode}>
                      {standard.standard_code || standard.code || 'N/A'}
                    </Text>
                    <Text style={styles.standardDescription} numberOfLines={2}>
                      {standard.standard_text || standard.description || ''}
                    </Text>
                    {event && (event.status === 'done' || event.status === 'completed') && event.child_id && (
                      <MasteryPicker
                        studentId={event.child_id}
                        standardId={standard.id}
                        lessonId={event.id}
                        currentMastery={standardsMastery[standard.id] || 'not_attempted'}
                        onUpdate={handleMasteryUpdate}
                      />
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveStandard(standard.id)}
                  >
                    <X size={16} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Save as Template Button */}
        {event?.id && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.saveTemplateButtonView}
              onPress={handleSaveAsTemplate}
              disabled={savingAsTemplate}
            >
              <Save size={18} color={colors.accent} />
              <Text style={styles.saveTemplateButtonText}>
                {savingAsTemplate ? 'Saving as Template...' : 'Save as Template'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  };

  const selectedMaterial = materials.find(m => m.id === draftMaterialId);

  return (
    <>
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          {editing ? renderEditForm() : renderViewMode()}
          
          {/* Standards Search Modal */}
          <StandardsSearchModal
            visible={showStandardsModal}
            onClose={() => setShowStandardsModal(false)}
            onSelect={handleAttachStandards}
            subjectId={event?.subject_id}
            initialSelected={attachedStandards}
          />
          
          {/* Template Name Input Modal */}
          {showTemplateNameInput && (
            <Modal
              visible={showTemplateNameInput}
              transparent
              animationType="slide"
              onRequestClose={() => setShowTemplateNameInput(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalContainer}>
                  <Text style={styles.modalTitle}>Save as Template</Text>
                  <Text style={styles.modalSubtitle}>Enter a name for this template:</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={templateName}
                    onChangeText={setTemplateName}
                    placeholder="Template name"
                    autoFocus
                  />
                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonCancel]}
                      onPress={() => {
                        setShowTemplateNameInput(false);
                        setTemplateName('');
                      }}
                    >
                      <Text style={[styles.modalButtonText, styles.modalButtonCancelText]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonSave]}
                      onPress={confirmSaveTemplate}
                      disabled={savingAsTemplate || !templateName.trim()}
                    >
                      <Text style={[styles.modalButtonText, styles.modalButtonSaveText]}>
                        {savingAsTemplate ? 'Saving...' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}

        <View style={styles.actions}>
          {editing ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => setEditing(false)}
                disabled={saving}
              >
                <Text style={[styles.actionButtonText, styles.cancelButtonText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.actionButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.editButton]}
                onPress={() => setEditing(true)}
              >
                <Edit2 size={16} color="#111827" />
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => {
                  console.log('[EventDetails] Delete button pressed');
                  handleDelete();
                }}
                disabled={deleting}
              >
                <Trash2 size={16} color="#111827" />
                <Text style={styles.actionButtonText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </ScrollView>

    {/* Add Material Modal */}
    <AddMaterialModal
      visible={showAddMaterialModal}
      onClose={() => setShowAddMaterialModal(false)}
      onSaved={async () => {
        setShowAddMaterialModal(false);
        await loadMaterials();
      }}
      familyId={familyId}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  detailsGrid: {
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
    minWidth: 80,
  },
  detailValue: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  editButton: {
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  deleteButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  cancelButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.text,
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  timeInput: {
    width: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    flexShrink: 0,
  },
  timePeriodContainer: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
    zIndex: 10,
  },
  timePeriodButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    minWidth: 52,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  timePeriodButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  timePeriodButtonDisabled: {
    opacity: 0.5,
  },
  timePeriodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  timePeriodButtonTextDisabled: {
    color: colors.muted,
  },
  timePeriodButtonTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  editForm: {
    gap: 16,
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 16,
  },
  inlineField: {
    flex: 1,
    minWidth: 180,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  attachButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  standardsList: {
    marginTop: 8,
  },
  standardItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  standardContent: {
    flex: 1,
  },
  standardCode: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  standardDescription: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  removeButton: {
    padding: 4,
    marginLeft: 8,
  },
  loadingText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  },
  emptyText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  },
  templateSection: {
    marginBottom: 16,
  },
  saveTemplateButton: {
    marginTop: 8,
    padding: 10,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  saveTemplateButtonView: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  saveTemplateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    padding: 20,
    ...shadows.large,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  modalInput: {
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalButtonCancel: {
    backgroundColor: colors.bgSubtle,
  },
  modalButtonSave: {
    backgroundColor: colors.primary,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalButtonCancelText: {
    color: colors.text,
  },
  modalButtonSaveText: {
    color: colors.accentContrast,
  },
  tagChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  editTagChip: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  editTagChipText: {
    color: colors.text,
    fontSize: 12,
  },
  suggestedChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  suggestedChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
  },
  suggestedChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  suggestedChipTextActive: {
    fontWeight: '600',
  },
  assigneeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  assigneeChipActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  assigneeChipText: {
    color: colors.text,
    fontSize: 12,
  },
  assigneeChipTextActive: {
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 12,
    color: colors.muted,
  },
  statusChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  statusChipActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  statusChipText: {
    color: colors.text,
    fontSize: 12,
  },
  statusChipTextActive: {
    fontWeight: '600',
  },
  materialSelectorContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  materialSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.card,
    minHeight: 40,
  },
  materialSelectorText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  materialSelectorPlaceholder: {
    color: colors.muted,
  },
  clearMaterialButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  clearMaterialText: {
    fontSize: 12,
    color: colors.muted,
  },
  addMaterialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  addMaterialText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
  materialDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 200,
    zIndex: 1000,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
      },
    }),
  },
  materialDropdownList: {
    maxHeight: 200,
  },
  materialDropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  materialDropdownItemActive: {
    backgroundColor: colors.accentLight,
  },
  materialDropdownItemText: {
    fontSize: 14,
    color: colors.text,
  },
  materialDropdownItemTextActive: {
    color: colors.accent,
    fontWeight: '500',
  },
});

