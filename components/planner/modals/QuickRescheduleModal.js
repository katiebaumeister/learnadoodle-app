/**
 * Quick Reschedule Modal
 * Micro-rescheduler for last-minute changes
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  Switch,
  TextInput,
} from 'react-native';
import { X, Clock, ChevronDown, ChevronRight, Check, AlertCircle, RotateCcw, Move, XCircle, Plus, Timer, UserX } from 'lucide-react';
import { colors } from '../../../theme/colors';
import { runQuickReschedule, applyQuickReschedule } from '../../../lib/services/quickRescheduleClient';
import { supabase } from '../../../lib/supabase';

// Match TaskCreateModal styling
const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const CHIP_BG = '#f3f4f6';
const CHIP_BORDER = '#e5e7eb';

const CHANGE_TYPES = [
  { 
    value: 'moved_event', 
    label: 'Something moved',
    icon: Move,
    consequence: 'We\'ll move related events to avoid conflicts.',
    implemented: true
  },
  { 
    value: 'canceled_event', 
    label: 'Something was canceled',
    icon: XCircle,
    consequence: 'We\'ll fill gaps or relax the schedule.',
    implemented: true
  },
  { 
    value: 'new_event', 
    label: 'We need to add something',
    icon: Plus,
    consequence: 'We\'ll find the best time slot for it.',
    implemented: false
  },
  { 
    value: 'shortened_day', 
    label: 'Today got shorter',
    icon: Timer,
    consequence: 'We\'ll compress or move events to fit.',
    implemented: false
  },
  { 
    value: 'kid_unavailable', 
    label: 'A child isn\'t available',
    icon: UserX,
    consequence: 'We\'ll avoid scheduling anything for them during that time.',
    implemented: false
  },
];

const TIME_WINDOW_OPTIONS = [
  { value: 'today', label: 'Today only', hint: 'We\'ll only move events inside this window.' },
  { value: 'tomorrow', label: 'Tomorrow', hint: 'We\'ll only move events inside this window.' },
  { value: 'this_week', label: 'This week', hint: 'We\'ll only move events inside this window.' },
  { value: 'custom', label: 'Custom range', hint: 'We\'ll only move events inside this window.' },
];

export default function QuickRescheduleModal({
  visible,
  familyId,
  children = [],
  selectedChildIds = null,
  initialEvent = null,
  onClose,
  onComplete,
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [parsing, setParsing] = useState(false);

  // Step 1: Freeform input
  const [userInput, setUserInput] = useState('');
  const [inputConfirmed, setInputConfirmed] = useState(false);
  const [pendingInterpretation, setPendingInterpretation] = useState(null);
  
  // Step 2: Parsed interpretation (editable)
  const [interpretation, setInterpretation] = useState(null);
  const [editingInterpretation, setEditingInterpretation] = useState(false);
  const [showStructuredForm, setShowStructuredForm] = useState(false);
  
  // Step 3: Intent confirmation
  const [intent, setIntent] = useState('move_around'); // 'move_around', 'cancel', 'block_time'
  
  // Legacy state (for backward compatibility and internal use)
  const [changeType, setChangeType] = useState('moved_event');
  const [affectedChildIds, setAffectedChildIds] = useState([]);
  const [timeWindow, setTimeWindow] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [newStartDate, setNewStartDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  
  // UI state for collapsed sections
  const [showWhatChanged, setShowWhatChanged] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [eventLocked, setEventLocked] = useState(true);
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const [showEventDropdown, setShowEventDropdown] = useState(false);

  // Step 4: Constraints (for preview generation)
  const [carefulnessLevel, setCarefulnessLevel] = useState(2);
  const [showAdvancedConstraints, setShowAdvancedConstraints] = useState(false);
  const [lockFixed, setLockFixed] = useState(true);
  const [onlyFlexible, setOnlyFlexible] = useState(true);
  const [maxMoves, setMaxMoves] = useState(6);
  const [preferSameDay, setPreferSameDay] = useState(true);

  // Step 4: Preview
  const [preview, setPreview] = useState(null);
  const [proposedEventsPatch, setProposedEventsPatch] = useState([]);
  const [runId, setRunId] = useState(null);
  
  // Event selection
  const [availableEvents, setAvailableEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Load events when time window or children change
  useEffect(() => {
    if (visible && (changeType === 'moved_event' || changeType === 'canceled_event') && affectedChildIds.length > 0) {
      loadEvents();
    } else {
      setAvailableEvents([]);
    }
  }, [visible, changeType, affectedChildIds, timeWindow, customStartDate, customEndDate]);

  // Load events when modal opens with initialEvent
  useEffect(() => {
    if (visible && initialEvent && affectedChildIds.length > 0) {
      // Small delay to ensure state is set
      setTimeout(() => {
        loadEvents();
      }, 100);
    }
  }, [visible, initialEvent]);

  // Update constraints based on carefulness level
  useEffect(() => {
    switch (carefulnessLevel) {
      case 0: // Gentle
        setLockFixed(true);
        setOnlyFlexible(true);
        setMaxMoves(3);
        setPreferSameDay(true);
        break;
      case 1: // Moderate
        setLockFixed(true);
        setOnlyFlexible(true);
        setMaxMoves(5);
        setPreferSameDay(true);
        break;
      case 2: // Balanced (default)
        setLockFixed(true);
        setOnlyFlexible(true);
        setMaxMoves(6);
        setPreferSameDay(true);
        break;
      case 3: // Aggressive
        setLockFixed(false);
        setOnlyFlexible(false);
        setMaxMoves(10);
        setPreferSameDay(false);
        break;
      case 4: // Very Aggressive
        setLockFixed(false);
        setOnlyFlexible(false);
        setMaxMoves(15);
        setPreferSameDay(false);
        break;
    }
  }, [carefulnessLevel]);

  // Auto-parse user input when it changes (with debounce) - store in pending
  useEffect(() => {
    if (!userInput.trim()) {
      setPendingInterpretation(null);
      setInputConfirmed(false);
      return;
    }

    // Reset confirmation when input changes
    setInputConfirmed(false);

    const timeoutId = setTimeout(() => {
      setParsing(true);
      try {
        const parsed = parseUserInput(userInput);
        setPendingInterpretation(parsed);
      } catch (err) {
        // Silently fail - user can continue typing
        setPendingInterpretation(null);
      } finally {
        setParsing(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [userInput]);

  // Confirm input - move pending interpretation to confirmed
  const confirmInput = () => {
    if (pendingInterpretation) {
      setInterpretation(pendingInterpretation);
      setInputConfirmed(true);
      
      // Update legacy state for API compatibility
      setChangeType(pendingInterpretation.type);
      setAffectedChildIds(pendingInterpretation.children);
      setTimeWindow(pendingInterpretation.scope);
      if (pendingInterpretation.date) setNewStartDate(pendingInterpretation.date);
      if (pendingInterpretation.time) setNewStartTime(pendingInterpretation.time);
      if (pendingInterpretation.endTime) setNewEndTime(pendingInterpretation.endTime);
    }
  };

  // Auto-generate preview when interpretation and intent are set
  useEffect(() => {
    if (!interpretation || !intent || loading || applying) return;

    const generatePreview = async () => {
      setLoading(true);
      setError(null);

      try {
        const timeWindowDates = getTimeWindowDates();
        
        // Build change object based on interpretation and intent
        const changeObj = {
          type: interpretation.type,
          notes: userInput,
        };
        
        // Handle based on intent
        if (intent === 'move_around') {
          // Move learning around the new/canceled event
          if (interpretation.type === 'new_event' && interpretation.time) {
            const [startHour, startMin] = interpretation.time.split(':').map(Number);
            const [endHour, endMin] = (interpretation.endTime || `${startHour + 1}:${startMin}`).split(':').map(Number);
            const newStart = new Date(`${interpretation.date}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`);
            const newEnd = new Date(`${interpretation.date}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`);
            
            changeObj.new_event = {
              title: interpretation.title,
              start: newStart.toISOString(),
              end: newEnd.toISOString(),
            };
          } else if (interpretation.type === 'moved_event' && selectedEventId) {
            const [startHour, startMin] = (interpretation.time || newStartTime).split(':').map(Number);
            const [endHour, endMin] = (interpretation.endTime || newEndTime).split(':').map(Number);
            const newStart = new Date(`${interpretation.date || newStartDate}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`);
            const newEnd = new Date(`${interpretation.date || newStartDate}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`);
            
            changeObj.event_id = selectedEventId;
            changeObj.new_start = newStart.toISOString();
            changeObj.new_end = newEnd.toISOString();
          } else if (interpretation.type === 'canceled_event' && selectedEventId) {
            changeObj.event_id = selectedEventId;
          }
        } else if (intent === 'cancel') {
          // Cancel today's learning
          changeObj.cancel_all = true;
          changeObj.scope = interpretation.scope;
        } else if (intent === 'block_time') {
          // Just block the time
          if (interpretation.time) {
            const [startHour, startMin] = interpretation.time.split(':').map(Number);
            const [endHour, endMin] = (interpretation.endTime || `${startHour + 1}:${startMin}`).split(':').map(Number);
            const newStart = new Date(`${interpretation.date}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`);
            const newEnd = new Date(`${interpretation.date}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`);
            
            changeObj.block_time = {
              start: newStart.toISOString(),
              end: newEnd.toISOString(),
            };
          }
        }
        
        const payload = {
          family_id: familyId,
          children: interpretation.children,
          time_window: timeWindowDates,
          change: changeObj,
          constraints: {
            lock_fixed: lockFixed,
            only_flexible: onlyFlexible,
            max_moves: maxMoves,
            prefer_same_day: preferSameDay,
          },
          notes: userInput,
        };

        const { data, error: apiError } = await runQuickReschedule(payload);

        if (apiError) {
          throw new Error(apiError.message || 'Failed to generate reschedule preview');
        }

        setPreview(data.preview);
        setProposedEventsPatch(data.proposed_events_patch || []);
        setRunId(data.meta?.run_id);
      } catch (err) {
        // Don't set error for auto-preview failures - user can still continue
        console.error('Auto-preview failed:', err);
      } finally {
        setLoading(false);
      }
    };

    // Debounce preview generation
    const timeoutId = setTimeout(generatePreview, 1000);
    return () => clearTimeout(timeoutId);
  }, [interpretation, intent, userInput, selectedEventId, lockFixed, onlyFlexible, maxMoves, preferSameDay]);

  // Auto-infer values when "Something moved" is selected
  useEffect(() => {
    if (visible && changeType === 'moved_event') {
      // Auto-infer affected children from selected event
      if (initialEvent) {
        const eventChildId = initialEvent.child_id || initialEvent.ev?.child_id;
        if (eventChildId && !affectedChildIds.includes(eventChildId)) {
          setAffectedChildIds([eventChildId]);
        }
      }
      
      // Auto-scope to "Today only"
      if (timeWindow !== 'today') {
        setTimeWindow('today');
      }
      
      // Auto-select primary event if available
      if (initialEvent && !selectedEventId) {
        setSelectedEventId(initialEvent.id || initialEvent.ev?.id);
        setEventLocked(true);
      }
    }
  }, [visible, changeType, initialEvent, affectedChildIds, timeWindow, selectedEventId]);

  // Parse user input into structured interpretation
  const parseUserInput = (input) => {
    const lowerInput = input.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Detect change type
    let detectedType = 'new_event';
    if (lowerInput.includes('cancel') || lowerInput.includes('cancelled')) {
      detectedType = 'canceled_event';
    } else if (lowerInput.includes('move') || lowerInput.includes('moved') || lowerInput.includes('reschedule')) {
      detectedType = 'moved_event';
    } else if (lowerInput.includes('sick') || lowerInput.includes('unavailable') || lowerInput.includes('not available')) {
      detectedType = 'kid_unavailable';
    }
    
    // Detect time references
    let detectedDate = today.toISOString().split('T')[0];
    let detectedTime = null;
    let detectedEndTime = null;
    
    // Parse time (e.g., "at 2", "at 2pm", "2:00", "2pm")
    const timeMatch = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3]?.toLowerCase();
      
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      detectedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      // Default duration: 1 hour
      const endHours = hours + 1;
      detectedEndTime = `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    
    // Parse date references
    let detectedScope = 'today'; // Default scope
    
    // Try to parse numeric dates first (e.g., "18th", "18", "the 18th")
    const numericDateMatch = input.match(/(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i);
    if (numericDateMatch) {
      const dayNum = parseInt(numericDateMatch[1]);
      if (dayNum >= 1 && dayNum <= 31) {
        const targetDate = new Date(today);
        targetDate.setDate(dayNum);
        // If the date has passed this month, assume next month
        if (targetDate < today) {
          targetDate.setMonth(targetDate.getMonth() + 1);
        }
        detectedDate = targetDate.toISOString().split('T')[0];
        // Determine scope based on how far in the future
        const daysDiff = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff === 0) {
          detectedScope = 'today';
        } else if (daysDiff === 1) {
          detectedScope = 'tomorrow';
        } else if (daysDiff <= 7) {
          detectedScope = 'this_week';
        } else {
          detectedScope = 'this_week'; // Default to this_week for further dates
        }
      }
    }
    
    // Parse month + day (e.g., "January 18", "Jan 18", "january 18th")
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
    const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                          'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
    
    for (let i = 0; i < monthNames.length; i++) {
      const monthPattern = `(?:${monthNames[i]}|${monthAbbrevs[i]})\\s+(\\d{1,2})(?:st|nd|rd|th)?`;
      const monthMatch = lowerInput.match(new RegExp(monthPattern, 'i'));
      if (monthMatch) {
        const dayNum = parseInt(monthMatch[1]);
        if (dayNum >= 1 && dayNum <= 31) {
          const targetDate = new Date(today.getFullYear(), i, dayNum);
          // If the date has passed this year, assume next year
          if (targetDate < today) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
          detectedDate = targetDate.toISOString().split('T')[0];
          const daysDiff = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24));
          if (daysDiff === 0) {
            detectedScope = 'today';
          } else if (daysDiff === 1) {
            detectedScope = 'tomorrow';
          } else if (daysDiff <= 7) {
            detectedScope = 'this_week';
          } else {
            detectedScope = 'this_week';
          }
          break;
        }
      }
    }
    
    // Parse date formats like "1/18", "01/18", "1-18"
    const dateFormatMatch = input.match(/(\d{1,2})[\/\-](\d{1,2})(?:\/)?(\d{2,4})?/);
    if (dateFormatMatch && !detectedDate) {
      const month = parseInt(dateFormatMatch[1]);
      const day = parseInt(dateFormatMatch[2]);
      const year = dateFormatMatch[3] ? parseInt(dateFormatMatch[3]) : today.getFullYear();
      // Handle 2-digit years
      const fullYear = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const targetDate = new Date(fullYear, month - 1, day);
        detectedDate = targetDate.toISOString().split('T')[0];
        const daysDiff = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff === 0) {
          detectedScope = 'today';
        } else if (daysDiff === 1) {
          detectedScope = 'tomorrow';
        } else if (daysDiff <= 7) {
          detectedScope = 'this_week';
        } else {
          detectedScope = 'this_week';
        }
      }
    }
    
    // Parse relative dates like "in 3 days", "3 days from now"
    const relativeDaysMatch = lowerInput.match(/(?:in|after)\s+(\d+)\s+days?/);
    if (relativeDaysMatch && !detectedDate) {
      const days = parseInt(relativeDaysMatch[1]);
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + days);
      detectedDate = targetDate.toISOString().split('T')[0];
      if (days === 0) {
        detectedScope = 'today';
      } else if (days === 1) {
        detectedScope = 'tomorrow';
      } else if (days <= 7) {
        detectedScope = 'this_week';
      } else {
        detectedScope = 'this_week';
      }
    }
    
    // Parse named dates (today, tomorrow, etc.) - only if no numeric date was found
    if (!detectedDate || detectedDate === today.toISOString().split('T')[0]) {
      if (lowerInput.includes('today')) {
        detectedDate = today.toISOString().split('T')[0];
        detectedScope = 'today';
      } else if (lowerInput.includes('tomorrow')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        detectedDate = tomorrow.toISOString().split('T')[0];
        detectedScope = 'tomorrow';
      } else if (lowerInput.includes('next week')) {
        // Next week: 7 days from today
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        detectedDate = nextWeek.toISOString().split('T')[0];
        detectedScope = 'this_week';
      } else if (lowerInput.includes('next weekend') || lowerInput.includes('this weekend')) {
        const daysUntilSaturday = (6 - today.getDay()) % 7 || 7;
        const saturday = new Date(today);
        saturday.setDate(today.getDate() + daysUntilSaturday);
        detectedDate = saturday.toISOString().split('T')[0];
        detectedScope = 'this_week';
      } else if (lowerInput.includes('next monday') || lowerInput.includes('monday')) {
        const daysUntilMonday = (1 - today.getDay() + 7) % 7 || 7;
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + daysUntilMonday);
        detectedDate = nextMonday.toISOString().split('T')[0];
        detectedScope = 'this_week';
      } else if (lowerInput.includes('next tuesday') || lowerInput.includes('tuesday')) {
        const daysUntilTuesday = (2 - today.getDay() + 7) % 7 || 7;
        const nextTuesday = new Date(today);
        nextTuesday.setDate(today.getDate() + daysUntilTuesday);
        detectedDate = nextTuesday.toISOString().split('T')[0];
        detectedScope = 'this_week';
      } else if (lowerInput.includes('next wednesday') || lowerInput.includes('wednesday')) {
        const daysUntilWednesday = (3 - today.getDay() + 7) % 7 || 7;
        const nextWednesday = new Date(today);
        nextWednesday.setDate(today.getDate() + daysUntilWednesday);
        detectedDate = nextWednesday.toISOString().split('T')[0];
        detectedScope = 'this_week';
      } else if (lowerInput.includes('next thursday') || lowerInput.includes('thursday')) {
        const daysUntilThursday = (4 - today.getDay() + 7) % 7 || 7;
        const nextThursday = new Date(today);
        nextThursday.setDate(today.getDate() + daysUntilThursday);
        detectedDate = nextThursday.toISOString().split('T')[0];
        detectedScope = 'this_week';
      } else if (lowerInput.includes('next friday') || lowerInput.includes('friday')) {
        const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
        const nextFriday = new Date(today);
        nextFriday.setDate(today.getDate() + daysUntilFriday);
        detectedDate = nextFriday.toISOString().split('T')[0];
        detectedScope = 'this_week';
      } else if (lowerInput.includes('next saturday') || lowerInput.includes('saturday')) {
        const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
        const nextSaturday = new Date(today);
        nextSaturday.setDate(today.getDate() + daysUntilSaturday);
        detectedDate = nextSaturday.toISOString().split('T')[0];
        detectedScope = 'this_week';
      } else if (lowerInput.includes('next sunday') || lowerInput.includes('sunday')) {
        const daysUntilSunday = (0 - today.getDay() + 7) % 7 || 7;
        const nextSunday = new Date(today);
        nextSunday.setDate(today.getDate() + daysUntilSunday);
        detectedDate = nextSunday.toISOString().split('T')[0];
        detectedScope = 'this_week';
      }
    }
    
    // Detect affected children
    const detectedChildren = [];
    children.forEach(child => {
      const childName = (child.first_name || child.name || '').toLowerCase();
      if (lowerInput.includes(childName)) {
        detectedChildren.push(child.id);
      }
    });
    
    // Extract event title
    let eventTitle = 'New event';
    if (lowerInput.includes('doctor') || lowerInput.includes('appointment')) {
      eventTitle = "Doctor's appointment";
    } else if (lowerInput.includes('travel') || lowerInput.includes('trip')) {
      eventTitle = 'Travel';
    } else {
      // Try to extract a title from the input
      const sentences = input.split(/[.!?]/);
      if (sentences[0]) {
        eventTitle = sentences[0].trim();
        if (eventTitle.length > 50) {
          eventTitle = eventTitle.substring(0, 47) + '...';
        }
      }
    }
    
    // Detect conflicts (this would be enhanced with actual conflict detection)
    const conflicts = [];
    
    return {
      type: detectedType,
      title: eventTitle,
      date: detectedDate,
      time: detectedTime,
      endTime: detectedEndTime,
      children: detectedChildren.length > 0 ? detectedChildren : (selectedChildIds || (children.length > 0 ? [children[0].id] : [])),
      conflicts: conflicts,
      scope: detectedScope, // Use detected scope instead of hardcoded 'today'
      originalInput: input,
    };
  };

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setUserInput('');
      setInputConfirmed(false);
      setPendingInterpretation(null);
      setInterpretation(null);
      setEditingInterpretation(false);
      setShowStructuredForm(false);
      setIntent('move_around');
      setError(null);
      setLoading(false);
      setApplying(false);
      setParsing(false);
      setPreview(null);
      setProposedEventsPatch([]);
      setRunId(null);
      
      // If initialEvent is provided, pre-fill input
      if (initialEvent) {
        const eventTitle = initialEvent.title || initialEvent.ev?.title || 'this event';
        const eventChildId = initialEvent.child_id || initialEvent.ev?.child_id;
        const eventChild = children.find(c => c.id === eventChildId);
        const eventChildName = eventChild?.first_name || eventChild?.name || '';
        const eventStart = initialEvent.start_ts || initialEvent.start || initialEvent.ev?.start_ts;
        
        if (eventStart) {
          const eventDate = new Date(eventStart);
          const timeStr = eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          setUserInput(`Moved ${eventTitle}${eventChildName ? ` with ${eventChildName}` : ''} to ${timeStr}`);
        } else {
          setUserInput(`Moved ${eventTitle}${eventChildName ? ` with ${eventChildName}` : ''}`);
        }
      }
    }
  }, [visible, selectedChildIds, children, initialEvent]);


  const loadEvents = async () => {
    if (!familyId || affectedChildIds.length === 0) return;
    
    setLoadingEvents(true);
    try {
      const timeWindowDates = getTimeWindowDates();
      const startDate = new Date(timeWindowDates.start_date + 'T00:00:00');
      const endDate = new Date(timeWindowDates.end_date + 'T23:59:59');
      
      let query = supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .in('child_id', affectedChildIds)
        .gte('start_ts', startDate.toISOString())
        .lte('start_ts', endDate.toISOString())
        .neq('status', 'canceled')
        .is('canceled_at', null)
        .is('deleted_at', null)
        .order('start_ts', { ascending: true });

      const { data, error } = await query;
      
      if (error) throw error;
      setAvailableEvents(data || []);
    } catch (err) {
      console.error('Error loading events:', err);
      setError('Failed to load events');
      setAvailableEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  const toggleChild = (childId) => {
    setAffectedChildIds(prev => {
      if (prev.includes(childId)) {
        return prev.filter(id => id !== childId);
      } else {
        return [...prev, childId];
      }
    });
  };

  const getTimeWindowDates = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (timeWindow) {
      case 'today':
        return {
          start_date: today.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
        };
      case 'tomorrow':
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return {
          start_date: tomorrow.toISOString().split('T')[0],
          end_date: tomorrow.toISOString().split('T')[0],
        };
      case 'this_week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Sunday
        return {
          start_date: weekStart.toISOString().split('T')[0],
          end_date: weekEnd.toISOString().split('T')[0],
        };
      case 'custom':
        return {
          start_date: customStartDate,
          end_date: customEndDate,
        };
      default:
        return {
          start_date: today.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
        };
    }
  };

  const validateStep1 = () => {
    if (affectedChildIds.length === 0) {
      setError('Please select at least one child');
      return false;
    }
    if (timeWindow === 'custom' && (!customStartDate || !customEndDate)) {
      setError('Please provide both start and end dates for custom range');
      return false;
    }
    if ((changeType === 'moved_event' || changeType === 'canceled_event') && !selectedEventId) {
      setError(`Please select an event to ${changeType === 'moved_event' ? 'move' : 'cancel'}`);
      return false;
    }
    if (changeType === 'moved_event' && selectedEventId) {
      if (!newStartDate || !newStartTime || !newEndTime) {
        setError('Please provide new date and time for the moved event');
        return false;
      }
    }
    return true;
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getSelectedEvent = () => {
    return availableEvents.find(e => e.id === selectedEventId);
  };

  // Calculate event counts for impact preview
  const getChildEventCount = (childId) => {
    const timeWindowDates = getTimeWindowDates();
    if (!timeWindowDates.start_date || !timeWindowDates.end_date) return 0;
    
    const startDate = new Date(timeWindowDates.start_date + 'T00:00:00');
    const endDate = new Date(timeWindowDates.end_date + 'T23:59:59');
    
    return availableEvents.filter(e => {
      const eventChildId = e.child_id;
      const eventStart = e.start_ts ? new Date(e.start_ts) : null;
      return eventChildId === childId && eventStart && eventStart >= startDate && eventStart <= endDate;
    }).length;
  };


  const handleTryAgain = async () => {
    // Re-run with slightly higher max moves
    setLoading(true);
    setError(null);

    try {
      const timeWindowDates = getTimeWindowDates();
      
      const payload = {
        family_id: familyId,
        children: affectedChildIds,
        time_window: timeWindowDates,
        change: {
          type: changeType,
          notes: userInput,
        },
        constraints: {
          lock_fixed: lockFixed,
          only_flexible: onlyFlexible,
          max_moves: maxMoves + 2, // Increase by 2
          prefer_same_day: preferSameDay,
        },
        notes: userInput,
      };

      const { data, error: apiError } = await runQuickReschedule(payload);

      if (apiError) {
        throw new Error(apiError.message || 'Failed to generate reschedule preview');
      }

      setPreview(data.preview);
      setProposedEventsPatch(data.proposed_events_patch || []);
      setRunId(data.meta?.run_id);
      setMaxMoves(maxMoves + 2); // Update the constraint value
    } catch (err) {
      setError(err.message || 'Failed to generate reschedule preview');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview || !runId) return;

    setApplying(true);
    setError(null);

    try {
      const { data, error: apiError } = await applyQuickReschedule({
        family_id: familyId,
        run_id: runId,
        proposed_events_patch: proposedEventsPatch,
      });

      if (apiError) {
        throw new Error(apiError.message || 'Failed to apply changes');
      }

      // Clear pending optimistic update flags for all events that were moved
      // This allows the refresh to proceed immediately
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (window.__clearPendingOptimisticUpdate && proposedEventsPatch) {
          proposedEventsPatch.forEach((change) => {
            if (change.event_id) {
              window.__clearPendingOptimisticUpdate(change.event_id);
            }
          });
        }
        
        // Also clear any conflict banner since conflicts are now resolved
        window.dispatchEvent(new CustomEvent('clearConflictBanner'));
        
        // Refresh calendar
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }

      if (onComplete) {
        onComplete({
          applied: true,
          changesCount: preview.moved?.length || 0,
        });
      }

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to apply changes');
    } finally {
      setApplying(false);
    }
  };


  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.iconCircle}>
                <Clock size={20} color="#3B82F6" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>Quick Reschedule</Text>
                <Text style={styles.subtitle}>Describe what changed and we'll handle the rest</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} disabled={applying}>
                <X size={20} color={applying ? colors.muted : colors.text} />
              </TouchableOpacity>
            </View>
          </View>


          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {error && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color="#E2556A" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => setError(null)} style={styles.errorDismiss}>
                  <X size={14} color="#E2556A" />
                </TouchableOpacity>
              </View>
            )}

            {/* Freeform input */}
            <View style={styles.stepContent}>
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>What changed?</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowStructuredForm(!showStructuredForm);
                      // Initialize interpretation if it doesn't exist
                      if (!interpretation && !showStructuredForm) {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        setInterpretation({
                          type: 'new_event',
                          title: '',
                          date: today.toISOString().split('T')[0],
                          time: '',
                          endTime: '',
                          children: children.length > 0 ? [children[0].id] : [],
                          scope: 'today',
                          originalInput: '',
                        });
                        setEditingInterpretation(true);
                      }
                    }}
                  >
                    <Text style={styles.expandFormLink}>
                      {showStructuredForm ? 'Use freeform input' : 'Or enter details directly'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {!showStructuredForm ? (
                  <>
                    <Text style={styles.fieldHint}>Enter details for any last minute changes</Text>
                    <TextInput
                      style={styles.freeformInput}
                      value={userInput}
                      onChangeText={setUserInput}
                      onBlur={confirmInput}
                      placeholder="e.g., New doctor's appointment today at 2"
                      placeholderTextColor={colors.muted}
                      multiline
                      numberOfLines={4}
                      autoFocus
                    />
                    {pendingInterpretation && !inputConfirmed && (
                      <TouchableOpacity
                        style={styles.verifyButton}
                        onPress={confirmInput}
                        disabled={!pendingInterpretation}
                      >
                        <Text style={styles.verifyButtonText}>Verify date/time</Text>
                      </TouchableOpacity>
                    )}
                    {parsing && (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={styles.loadingText}>Understanding...</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.editInterpretationForm}>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Event title</Text>
                      <TextInput
                        style={styles.textInput}
                        value={interpretation?.title || ''}
                        onChangeText={(text) => {
                          if (!interpretation) {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            setInterpretation({
                              type: 'new_event',
                              title: text,
                              date: today.toISOString().split('T')[0],
                              time: '',
                              endTime: '',
                              children: children.length > 0 ? [children[0].id] : [],
                              scope: 'today',
                              originalInput: '',
                            });
                          } else {
                            setInterpretation({...interpretation, title: text});
                          }
                        }}
                        placeholder="e.g., Doctor's appointment"
                      />
                    </View>
                    
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Date</Text>
                      <TextInput
                        style={styles.textInput}
                        value={interpretation?.date || ''}
                        onChangeText={(text) => {
                          if (!interpretation) {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            setInterpretation({
                              type: 'new_event',
                              title: '',
                              date: text,
                              time: '',
                              endTime: '',
                              children: children.length > 0 ? [children[0].id] : [],
                              scope: 'today',
                              originalInput: '',
                            });
                          } else {
                            setInterpretation({...interpretation, date: text});
                          }
                        }}
                        placeholder="YYYY-MM-DD"
                      />
                    </View>
                    
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Time</Text>
                      <View style={styles.timeInputs}>
                        <TextInput
                          style={[styles.textInput, { flex: 1 }]}
                          value={interpretation?.time || ''}
                          onChangeText={(text) => {
                            if (!interpretation) {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              setInterpretation({
                                type: 'new_event',
                                title: '',
                                date: today.toISOString().split('T')[0],
                                time: text,
                                endTime: '',
                                children: children.length > 0 ? [children[0].id] : [],
                                scope: 'today',
                                originalInput: '',
                              });
                            } else {
                              setInterpretation({...interpretation, time: text});
                            }
                          }}
                          placeholder="HH:MM"
                        />
                        <Text style={styles.timeSeparator}>-</Text>
                        <TextInput
                          style={[styles.textInput, { flex: 1 }]}
                          value={interpretation?.endTime || ''}
                          onChangeText={(text) => {
                            if (!interpretation) {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              setInterpretation({
                                type: 'new_event',
                                title: '',
                                date: today.toISOString().split('T')[0],
                                time: '',
                                endTime: text,
                                children: children.length > 0 ? [children[0].id] : [],
                                scope: 'today',
                                originalInput: '',
                              });
                            } else {
                              setInterpretation({...interpretation, endTime: text});
                            }
                          }}
                          placeholder="HH:MM"
                        />
                      </View>
                    </View>
                    
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Affected children</Text>
                      <View style={styles.childSelector}>
                        {children.map((child) => {
                          const isSelected = interpretation?.children?.includes(child.id) || false;
                          return (
                            <TouchableOpacity
                              key={child.id}
                              style={[styles.childChip, isSelected && styles.childChipSelected]}
                              onPress={() => {
                                const currentChildren = interpretation?.children || [];
                                const newChildren = isSelected
                                  ? currentChildren.filter(id => id !== child.id)
                                  : [...currentChildren, child.id];
                                
                                if (!interpretation) {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  setInterpretation({
                                    type: 'new_event',
                                    title: '',
                                    date: today.toISOString().split('T')[0],
                                    time: '',
                                    endTime: '',
                                    children: newChildren,
                                    scope: 'today',
                                    originalInput: '',
                                  });
                                } else {
                                  setInterpretation({...interpretation, children: newChildren});
                                }
                              }}
                            >
                              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                {isSelected && <Check size={12} color="#FFFFFF" />}
                              </View>
                              <Text style={[styles.childChipText, isSelected && styles.childChipTextSelected]}>
                                {child.first_name || child.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* System interpretation (read-only view when parsed from freeform) */}
            {interpretation && inputConfirmed && !showStructuredForm && !editingInterpretation && (
              <View style={styles.stepContent}>
                <View style={styles.interpretationBox}>
                  <Text style={styles.interpretationTitle}>Here's what I understood:</Text>
                  
                  {!editingInterpretation ? (
                    <>
                      <View style={styles.interpretationItem}>
                        <Text style={styles.interpretationLabel}>Event:</Text>
                        <Text style={styles.interpretationValue}>{interpretation.title}</Text>
                      </View>
                      
                      {interpretation.time && (
                        <View style={styles.interpretationItem}>
                          <Text style={styles.interpretationLabel}>Time:</Text>
                          <Text style={styles.interpretationValue}>
                            {formatDate(interpretation.date)} {interpretation.time}
                            {interpretation.endTime && ` - ${interpretation.endTime}`}
                          </Text>
                        </View>
                      )}
                      
                      <View style={styles.interpretationItem}>
                        <Text style={styles.interpretationLabel}>Affects:</Text>
                        <Text style={styles.interpretationValue}>
                          {interpretation.children.map(id => {
                            const child = children.find(c => c.id === id);
                            return child?.first_name || child?.name;
                          }).join(', ') || 'All children'}
                        </Text>
                      </View>
                      
                      {interpretation.conflicts && interpretation.conflicts.length > 0 && (
                        <View style={styles.interpretationItem}>
                          <Text style={styles.interpretationLabel}>Conflicts with:</Text>
                          <Text style={styles.interpretationValue}>
                            {interpretation.conflicts.join(', ')}
                          </Text>
                        </View>
                      )}
                      
                      <View style={styles.interpretationItem}>
                        <Text style={styles.interpretationLabel}>Scope:</Text>
                        <Text style={styles.interpretationValue}>
                          {interpretation.scope === 'today' ? 'Today' : interpretation.scope}
                        </Text>
                      </View>
                      
                      <TouchableOpacity
                        style={styles.editInterpretationButton}
                        onPress={() => {
                          setEditingInterpretation(true);
                          setShowStructuredForm(true);
                        }}
                      >
                        <Text style={styles.editInterpretationText}>Edit</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={styles.editInterpretationForm}>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Event title</Text>
                        <TextInput
                          style={styles.textInput}
                          value={interpretation.title}
                          onChangeText={(text) => setInterpretation({...interpretation, title: text})}
                        />
                      </View>
                      
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Date</Text>
                        <TextInput
                          style={styles.textInput}
                          value={interpretation.date}
                          onChangeText={(text) => setInterpretation({...interpretation, date: text})}
                          placeholder="YYYY-MM-DD"
                        />
                      </View>
                      
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Time</Text>
                        <View style={styles.timeInputs}>
                          <TextInput
                            style={[styles.textInput, { flex: 1 }]}
                            value={interpretation.time || ''}
                            onChangeText={(text) => setInterpretation({...interpretation, time: text})}
                            placeholder="HH:MM"
                          />
                          <Text style={styles.timeSeparator}>-</Text>
                          <TextInput
                            style={[styles.textInput, { flex: 1 }]}
                            value={interpretation.endTime || ''}
                            onChangeText={(text) => setInterpretation({...interpretation, endTime: text})}
                            placeholder="HH:MM"
                          />
                        </View>
                      </View>
                      
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Affected children</Text>
                        <View style={styles.childSelector}>
                          {children.map((child) => {
                            const isSelected = interpretation.children.includes(child.id);
                            return (
                              <TouchableOpacity
                                key={child.id}
                                style={[styles.childChip, isSelected && styles.childChipSelected]}
                                onPress={() => {
                                  setInterpretation({
                                    ...interpretation,
                                    children: isSelected
                                      ? interpretation.children.filter(id => id !== child.id)
                                      : [...interpretation.children, child.id]
                                  });
                                }}
                              >
                                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                  {isSelected && <Check size={12} color="#FFFFFF" />}
                                </View>
                                <Text style={[styles.childChipText, isSelected && styles.childChipTextSelected]}>
                                  {child.first_name || child.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                      
                      <TouchableOpacity
                        style={styles.saveInterpretationButton}
                        onPress={() => {
                          setEditingInterpretation(false);
                          // Update legacy state
                          setChangeType(interpretation.type);
                          setAffectedChildIds(interpretation.children);
                          setTimeWindow(interpretation.scope);
                          if (interpretation.date) setNewStartDate(interpretation.date);
                          if (interpretation.time) setNewStartTime(interpretation.time);
                          if (interpretation.endTime) setNewEndTime(interpretation.endTime);
                        }}
                      >
                        <Text style={styles.saveInterpretationText}>Looks right</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Intent confirmation */}
            <View style={styles.stepContent}>
              <View style={styles.fieldGroup}>
                <Text style={styles.intentTitle}>What should I do?</Text>
                  <View style={styles.intentOptions}>
                    <TouchableOpacity
                      style={[styles.intentOption, intent === 'move_around' && styles.intentOptionSelected]}
                      onPress={() => setIntent('move_around')}
                    >
                      <View style={styles.intentOptionContent}>
                        <Text style={[styles.intentOptionTitle, intent === 'move_around' && styles.intentOptionTitleSelected]}>
                          Move learning around it
                        </Text>
                        <Text style={styles.intentOptionSubtitle}>Recommended</Text>
                      </View>
                      {intent === 'move_around' && (
                        <View style={styles.intentOptionCheck}>
                          <Check size={20} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.intentOption, intent === 'cancel' && styles.intentOptionSelected]}
                      onPress={() => setIntent('cancel')}
                    >
                      <View style={styles.intentOptionContent}>
                        <Text style={[styles.intentOptionTitle, intent === 'cancel' && styles.intentOptionTitleSelected]}>
                          Cancel today's learning
                        </Text>
                      </View>
                      {intent === 'cancel' && (
                        <View style={styles.intentOptionCheck}>
                          <Check size={20} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.intentOption, intent === 'block_time' && styles.intentOptionSelected]}
                      onPress={() => setIntent('block_time')}
                    >
                      <View style={styles.intentOptionContent}>
                        <Text style={[styles.intentOptionTitle, intent === 'block_time' && styles.intentOptionTitleSelected]}>
                          Just block the time
                        </Text>
                      </View>
                      {intent === 'block_time' && (
                        <View style={styles.intentOptionCheck}>
                          <Check size={20} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

            {/* Legacy Step 1 content (to be removed) */}
            {false && step === 1 && (
              <View style={styles.stepContent}>
                {/* Suggested fix section - show when single event is selected and not showing other options */}
                {selectedEventId && changeType === 'moved_event' && !showOtherOptions && (() => {
                  const event = getSelectedEvent();
                  if (!event) return null;
                  
                  // Calculate suggested time (next available slot or current time + 1 hour)
                  const eventStart = new Date(event.start_ts);
                  const suggestedStart = new Date(eventStart);
                  suggestedStart.setHours(suggestedStart.getHours() + 1);
                  const suggestedEnd = new Date(suggestedStart);
                  suggestedEnd.setMinutes(suggestedEnd.getMinutes() + (event.minutes || 30));
                  
                  const formatSuggestedTime = (date) => {
                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const dayName = dayNames[date.getDay()];
                    const monthName = monthNames[date.getMonth()];
                    const day = date.getDate();
                    const hours = date.getHours();
                    const minutes = date.getMinutes();
                    const period = hours >= 12 ? 'PM' : 'AM';
                    const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
                    const timeStr = minutes === 0 
                      ? `${displayHours} ${period}` 
                      : `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
                    return `${dayName}, ${monthName} ${day} • ${timeStr}`;
                  };
                  
                  const suggestedTimeStr = `${formatSuggestedTime(suggestedStart)}–${formatSuggestedTime(suggestedEnd)}`;
                  
                  return (
                    <View style={styles.suggestedFixSection}>
                      <Text style={styles.suggestedFixTitle}>Suggested fix</Text>
                      <Text style={styles.suggestedFixText}>
                        Move "{event.title}" to
                      </Text>
                      <Text style={styles.suggestedFixTime}>{suggestedTimeStr}</Text>
                      <Text style={styles.suggestedFixReassurance}>No other events will be moved</Text>
                      <View style={styles.suggestedFixActions}>
                        <TouchableOpacity
                          style={styles.applyFixButton}
                          onPress={async () => {
                            // Directly apply the fix
                            setNewStartDate(suggestedStart.toISOString().split('T')[0]);
                            setNewStartTime(suggestedStart.toTimeString().slice(0, 5));
                            setNewEndTime(suggestedEnd.toTimeString().slice(0, 5));
                            
                            // Run preview and apply
                            setLoading(true);
                            try {
                              const timeWindowDates = getTimeWindowDates();
                              const changeObj = {
                                type: 'moved_event',
                                event_id: selectedEventId,
                                new_start: suggestedStart.toISOString(),
                                new_end: suggestedEnd.toISOString(),
                              };
                              
                              const payload = {
                                family_id: familyId,
                                children: affectedChildIds,
                                time_window: timeWindowDates,
                                change: changeObj,
                                constraints: {
                                  lock_fixed: lockFixed,
                                  only_flexible: onlyFlexible,
                                  max_moves: maxMoves,
                                  prefer_same_day: preferSameDay,
                                },
                              };
                              
                              const { data, error: apiError } = await runQuickReschedule(payload);
                              if (apiError) throw new Error(apiError.message || 'Failed to generate reschedule preview');
                              
                              setPreview(data);
                              setProposedEventsPatch(data.proposed_events_patch || []);
                              setRunId(data.run_id);
                              setStep(3);
                              
                              // Auto-apply if only one change
                              if (data.moved && data.moved.length === 1) {
                                await handleApply();
                              }
                            } catch (err) {
                              setError(err.message || 'Failed to apply fix');
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          <View style={styles.applyFixButtonContent}>
                            <Text style={styles.applyFixButtonText}>Apply fix</Text>
                            <Text style={styles.applyFixButtonSubtext}>Move this event</Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.seeOtherOptionsButton}
                          onPress={() => setShowOtherOptions(true)}
                        >
                          <Text style={styles.seeOtherOptionsButtonText}>See other options</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })()}
                
                {/* Only show change type selector if NOT launched contextually or in Advanced mode */}
                {false && (!isContextualLaunch || false) && (
                <View style={styles.fieldGroup}>
                  {false && isContextualLaunch ? (
                    <View style={styles.assumptionRow}>
                      <Text style={styles.assumptionLabel}>Change type:</Text>
                      <View style={styles.assumptionValue}>
                        <Text style={styles.assumptionValueText}>
                          {CHANGE_TYPES.find(t => t.value === changeType)?.label || changeType}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity
                          style={styles.collapsibleHeader}
                          onPress={() => setShowWhatChanged(!showWhatChanged)}
                      >
                          <Text style={styles.fieldLabel}>What changed?</Text>
                          {showWhatChanged ? <ChevronDown size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />}
                      </TouchableOpacity>
                        {showWhatChanged && (
                          <View style={styles.changeTypeGrid}>
                          {CHANGE_TYPES.map((type) => {
                            const isSelected = changeType === type.value;
                            const isDisabled = !type.implemented;
                            return (
                            <TouchableOpacity
                              key={type.value}
                                style={[
                                  styles.changeTypeCard,
                                  isSelected && styles.changeTypeCardSelected,
                                  isDisabled && styles.changeTypeCardDisabled
                                ]}
                              onPress={() => {
                                  if (!isDisabled) {
                                setChangeType(type.value);
                                  }
                              }}
                                disabled={isDisabled}
                            >
                                <Text style={[styles.changeTypeLabel, isSelected && styles.changeTypeLabelSelected]}>
                                {type.label}
                              </Text>
                                <Text style={[styles.changeTypeConsequence, isSelected && styles.changeTypeConsequenceSelected]}>
                                  {type.consequence}
                                </Text>
                                {isDisabled && (
                                  <View style={styles.comingSoonBadge}>
                                    <Text style={styles.comingSoonText}>Coming soon</Text>
                      </View>
                    )}
                                {isSelected && !isDisabled && (
                                  <View style={styles.selectedIndicator}>
                                    <Check size={16} color="#FFFFFF" />
                  </View>
                                )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                        )}
                    </>
                  )}
                </View>
                )}

                {/* Time window - show as editable default in Quick mode */}
                {false && (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>How much can I change?</Text>
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => setShowTimeWindowDropdown(!showTimeWindowDropdown)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dropdownText}>
                          {TIME_WINDOW_OPTIONS.find(t => t.value === timeWindow)?.label || timeWindow}
                        </Text>
                        {showTimeWindowDropdown && (
                          <Text style={styles.dropdownHint}>
                            {TIME_WINDOW_OPTIONS.find(t => t.value === timeWindow)?.hint || ''}
                          </Text>
                        )}
                      </View>
                      {showTimeWindowDropdown ? <ChevronDown size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />}
                    </TouchableOpacity>
                    {showTimeWindowDropdown && (
                      <View style={styles.dropdownMenu}>
                        {TIME_WINDOW_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option.value}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setTimeWindow(option.value);
                              setShowTimeWindowDropdown(false);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.dropdownItemText, timeWindow === option.value && styles.dropdownItemTextActive]}>
                                {option.label}
                              </Text>
                              <Text style={styles.dropdownItemHint}>{option.hint}</Text>
                            </View>
                            {timeWindow === option.value && <Check size={14} color={colors.accent} />}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* In Quick mode, show as editable assumptions */}
                {false && (
                  <View style={styles.fieldGroup}>
                    <View style={styles.assumptionRow}>
                      <Text style={styles.assumptionLabel}>Time window:</Text>
                      <TouchableOpacity
                        style={styles.assumptionValue}
                        onPress={() => setShowTimeWindowDropdown(!showTimeWindowDropdown)}
                      >
                        <Text style={styles.assumptionValueText}>
                          {TIME_WINDOW_OPTIONS.find(t => t.value === timeWindow)?.label || timeWindow}
                        </Text>
                        <ChevronRight size={14} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                    {showTimeWindowDropdown && (
                      <View style={styles.dropdownMenu}>
                        {TIME_WINDOW_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option.value}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setTimeWindow(option.value);
                              setShowTimeWindowDropdown(false);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.dropdownItemText, timeWindow === option.value && styles.dropdownItemTextActive]}>
                                {option.label}
                              </Text>
                            </View>
                            {timeWindow === option.value && <Check size={14} color={colors.accent} />}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Affected children - show as editable default in Quick mode */}
                <View style={styles.fieldGroup}>
                  {false ? (
                    <>
                      <Text style={styles.fieldLabel}>Affected children</Text>
                      <View style={styles.childSelector}>
                        {children.map((child) => {
                          const isSelected = affectedChildIds.includes(child.id);
                          const eventCount = getChildEventCount(child.id);
                          return (
                            <TouchableOpacity
                              key={child.id}
                              style={[styles.childChip, isSelected && styles.childChipSelected]}
                              onPress={() => toggleChild(child.id)}
                            >
                              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                {isSelected && <Check size={12} color="#FFFFFF" />}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.childChipText, isSelected && styles.childChipTextSelected]}>
                                  {child.first_name || child.name}
                                </Text>
                                {eventCount > 0 && (
                                  <Text style={styles.childEventCount}>
                                    {eventCount} {eventCount === 1 ? 'event' : 'events'} in this window
                                  </Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.assumptionRow}>
                        <Text style={styles.assumptionLabel}>Affected children:</Text>
                        <View style={styles.assumptionValue}>
                          <Text style={styles.assumptionValueText}>
                            {affectedChildIds.map(id => {
                              const child = children.find(c => c.id === id);
                              return child?.first_name || child?.name;
                            }).join(', ') || 'None selected'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.childSelector}>
                        {children.map((child) => {
                          const isSelected = affectedChildIds.includes(child.id);
                          const eventCount = getChildEventCount(child.id);
                          return (
                            <TouchableOpacity
                              key={child.id}
                              style={[styles.childChip, isSelected && styles.childChipSelected]}
                              onPress={() => toggleChild(child.id)}
                            >
                              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                {isSelected && <Check size={12} color="#FFFFFF" />}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.childChipText, isSelected && styles.childChipTextSelected]}>
                                  {child.first_name || child.name}
                                </Text>
                                {eventCount > 0 && (
                                  <Text style={styles.childEventCount}>
                                    {eventCount} {eventCount === 1 ? 'event' : 'events'} in this window
                                  </Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}
                  {false && affectedChildIds.length > 0 && (
                    <Text style={styles.impactPreview}>
                      This may affect {availableEvents.filter(e => affectedChildIds.includes(e.child_id)).length} events
                    </Text>
                  )}
                </View>

                {timeWindow === 'custom' && (
                  <View style={styles.fieldGroup}>
                    <View style={styles.dateInputs}>
                      <View style={styles.dateInputGroup}>
                        <Text style={styles.dateLabel}>Start date</Text>
                        <TextInput
                          style={styles.dateInput}
                          value={customStartDate}
                          onChangeText={setCustomStartDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.muted}
                        />
                      </View>
                      <View style={styles.dateInputGroup}>
                        <Text style={styles.dateLabel}>End date</Text>
                        <TextInput
                          style={styles.dateInput}
                          value={customEndDate}
                          onChangeText={setCustomEndDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.muted}
                        />
                      </View>
                    </View>
                  </View>
                )}

                {/* Event selection for moved/canceled events - Auto-selected in Quick mode */}
                {(changeType === 'moved_event' || changeType === 'canceled_event') && (
                  <>
                    {false && selectedEventId && eventLocked && (() => {
                      const event = availableEvents.find(e => e.id === selectedEventId) || (initialEvent ? {
                        title: initialEvent.title || initialEvent.ev?.title,
                        start_ts: initialEvent.start_ts || initialEvent.start || initialEvent.ev?.start_ts,
                        end_ts: initialEvent.end_ts || initialEvent.end || initialEvent.ev?.end_ts,
                      } : null);
                      if (!event) return null;
                      
                      return (
                        <View style={styles.fieldGroup}>
                          <View style={styles.assumptionRow}>
                            <Text style={styles.assumptionLabel}>Event to {changeType === 'moved_event' ? 'move' : 'cancel'}:</Text>
                            <View style={styles.assumptionValue}>
                              <Text style={styles.assumptionValueText}>{event.title || 'Unknown event'}</Text>
                              <TouchableOpacity 
                                onPress={() => setEventLocked(false)}
                                style={{ marginLeft: 8 }}
                              >
                                <Text style={styles.changeEventLink}>Change</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })()}

                    {false && (!eventLocked || false) && (
                      <View style={styles.fieldGroup}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={styles.fieldLabel}>
                            {changeType === 'moved_event' ? 'Select event to move' : 'Select event to cancel'}
                          </Text>
                          {eventLocked && selectedEventId && (
                            <TouchableOpacity onPress={() => setEventLocked(false)}>
                              <Text style={styles.changeEventLink}>Change event</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        {eventLocked && selectedEventId && (
                          <Text style={styles.helperText}>This is the event that caused the conflict</Text>
                        )}
                        {loadingEvents ? (
                          <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color={colors.accent} />
                            <Text style={styles.loadingText}>Loading events...</Text>
                          </View>
                        ) : (
                          <ScrollView style={styles.eventList} nestedScrollEnabled>
                            {availableEvents.map((event) => {
                              const isSelected = selectedEventId === event.id;
                              const eventChild = children.find(c => c.id === event.child_id);
                              const isFixed = event.is_fixed || event.event_type === 'Appointment';
                              const isFlexible = event.is_flexible && !isFixed;
                              
                              return (
                                <TouchableOpacity
                                  key={event.id}
                                  style={[styles.eventListItem, isSelected && styles.eventListItemSelected, eventLocked && !isSelected && styles.eventListItemDisabled]}
                                  onPress={() => {
                                    if (eventLocked && !isSelected) return; // Prevent selection when locked
                                    setSelectedEventId(event.id);
                                    // Pre-fill new time with current time for moved events
                                    if (changeType === 'moved_event') {
                                      const eventDate = new Date(event.start_ts);
                                      setNewStartDate(eventDate.toISOString().split('T')[0]);
                                      setNewStartTime(eventDate.toTimeString().slice(0, 5));
                                      const eventEnd = new Date(event.end_ts);
                                      setNewEndTime(eventEnd.toTimeString().slice(0, 5));
                                    }
                                  }}
                                  disabled={eventLocked && !isSelected}
                                >
                                  <View style={styles.eventListItemContent}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={[styles.eventListItemTitle, isSelected && styles.eventListItemTitleSelected]}>
                                        {event.title}
                                      </Text>
                                      <View style={styles.eventListItemMeta}>
                                        <Text style={styles.eventListItemTime}>
                                          {formatDate(event.start_ts)} {formatTime(event.start_ts)} - {formatTime(event.end_ts)}
                                        </Text>
                                        {eventChild && (
                                          <View style={styles.eventListItemChild}>
                                            <View style={[styles.childDot, { backgroundColor: '#8B5CF6' }]} />
                                            <Text style={styles.eventListItemChildName}>{eventChild.first_name || eventChild.name}</Text>
                                          </View>
                                        )}
                                      </View>
                                    </View>
                                    <View style={styles.eventListItemIndicators}>
                                      {isFixed ? (
                                        <Text style={styles.fixedIndicator}>🔒</Text>
                                      ) : isFlexible ? (
                                        <Text style={styles.flexibleIndicator}>✨</Text>
                                      ) : null}
                                      {isSelected && (
                                        <View style={styles.selectedCheck}>
                                          <Check size={16} color="#FFFFFF" />
                                        </View>
                                      )}
                                    </View>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                            {availableEvents.length === 0 && !loadingEvents && (
                              <Text style={styles.hintText}>No events found in this time window</Text>
                            )}
                          </ScrollView>
                        )}
                      </View>
                    )}

                    {/* New time for moved events */}
                    {changeType === 'moved_event' && selectedEventId && (
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>New date and time</Text>
                        <View style={styles.dateInputs}>
                          <View style={styles.dateInputGroup}>
                            <Text style={styles.dateLabel}>Date</Text>
                            <TextInput
                              style={styles.dateInput}
                              value={newStartDate}
                              onChangeText={setNewStartDate}
                              placeholder="YYYY-MM-DD"
                              placeholderTextColor={colors.muted}
                            />
                          </View>
                          <View style={styles.dateInputGroup}>
                            <Text style={styles.dateLabel}>Start time</Text>
                            <TextInput
                              style={styles.dateInput}
                              value={newStartTime}
                              onChangeText={setNewStartTime}
                              placeholder="HH:MM (24h)"
                              placeholderTextColor={colors.muted}
                            />
                          </View>
                          <View style={styles.dateInputGroup}>
                            <Text style={styles.dateLabel}>End time</Text>
                            <TextInput
                              style={styles.dateInput}
                              value={newEndTime}
                              onChangeText={setNewEndTime}
                              placeholder="HH:MM (24h)"
                              placeholderTextColor={colors.muted}
                            />
                          </View>
                        </View>
                      </View>
                    )}
                  </>
                )}

                <View style={styles.fieldGroup}>
                  <TouchableOpacity
                    style={styles.collapsibleHeader}
                    onPress={() => setShowNotes(!showNotes)}
                  >
                  <Text style={styles.fieldLabel}>Notes (optional)</Text>
                    {showNotes ? <ChevronDown size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />}
                  </TouchableOpacity>
                  {showNotes && (
                  <TextInput
                    style={styles.textArea}
                    value={notes}
                    onChangeText={setNotes}
                      placeholder="Optional — e.g., 'Doctor ran late' or 'Low-energy day'"
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                      onFocus={() => setShowNotes(true)}
                  />
                  )}
                </View>
              </View>
            )}

            {/* Step 2: Review Intent - OLD CODE, DISABLED */}
            {false && step === 2 && (
              <View style={styles.stepContent}>
                {/* Confidence statement */}
                <View style={styles.confidenceStatement}>
                  <Text style={styles.confidenceText}>
                    I'll make the smallest possible change to keep today working.
                  </Text>
                </View>

                <View style={styles.reviewSummary}>
                  <Text style={styles.reviewTitle}>Here's what I'll do:</Text>
                  
                  {changeType === 'moved_event' && selectedEventId && (() => {
                    const event = availableEvents.find(e => e.id === selectedEventId);
                    if (!event) return null;
                    return (
                      <View style={styles.reviewItem}>
                        <Text style={styles.reviewItemText}>
                          Adjust schedule to resolve the conflict with <Text style={styles.reviewItemBold}>{event.title}</Text>
                        </Text>
                        <Text style={styles.reviewItemSubtext}>
                          Move {event.title} from {formatTime(event.start_ts)} → {formatTime(newStartTime)}
                        </Text>
                      </View>
                    );
                  })()}
                  
                  {changeType === 'canceled_event' && selectedEventId && (() => {
                    const event = availableEvents.find(e => e.id === selectedEventId);
                    if (!event) return null;
                    return (
                      <View style={styles.reviewItem}>
                        <Text style={styles.reviewItemText}>
                          Adjust schedule to resolve the conflict with <Text style={styles.reviewItemBold}>{event.title}</Text>
                        </Text>
                        <Text style={styles.reviewItemSubtext}>
                          Cancel {event.title}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                {/* How careful should I be? slider */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>How careful should I be?</Text>
                  <View style={styles.carefulnessSliderContainer}>
                    <View style={styles.carefulnessSliderTrack}>
                      <View 
                        style={[
                          styles.carefulnessSliderFill, 
                          { width: `${(carefulnessLevel / 4) * 100}%` }
                        ]} 
                      />
                      <View style={styles.carefulnessSliderLabels}>
                        <Text style={styles.carefulnessLabel}>Gentle</Text>
                        <Text style={styles.carefulnessLabel}>Aggressive</Text>
                      </View>
                    </View>
                    <View style={styles.carefulnessSliderControls}>
                      {[0, 1, 2, 3, 4].map((level) => {
                        const labels = ['Gentle', 'Moderate', 'Balanced', 'Aggressive', 'Very Aggressive'];
                        return (
                          <TouchableOpacity
                            key={level}
                            style={[
                              styles.carefulnessSliderButton,
                              carefulnessLevel === level && styles.carefulnessSliderButtonActive
                            ]}
                            onPress={() => setCarefulnessLevel(level)}
                          >
                            <View style={[
                              styles.carefulnessSliderDot,
                              carefulnessLevel === level && styles.carefulnessSliderDotActive
                            ]} />
                            {carefulnessLevel === level && (
                              <Text style={styles.carefulnessSliderButtonLabel}>
                                {labels[level]}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {/* Advanced constraints (collapsed by default) */}
                <View style={styles.fieldGroup}>
                  <TouchableOpacity
                    style={styles.collapsibleHeader}
                    onPress={() => setShowAdvancedConstraints(!showAdvancedConstraints)}
                  >
                    <Text style={styles.fieldLabel}>Advanced options</Text>
                    {showAdvancedConstraints ? <ChevronDown size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />}
                  </TouchableOpacity>
                  {showAdvancedConstraints && (
                    <View style={styles.advancedConstraints}>
                      <View style={styles.constraintRow}>
                        <View style={styles.constraintLabel}>
                          <Text style={styles.constraintText}>Prefer same-day moves</Text>
                          <Text style={styles.constraintHint}>Try to keep events on the same day</Text>
                        </View>
                        <Switch
                          value={preferSameDay}
                          onValueChange={setPreferSameDay}
                          trackColor={{ false: '#E5E7EB', true: colors.accent }}
                          thumbColor="#FFFFFF"
                        />
                      </View>

                      <View style={styles.constraintRow}>
                        <View style={styles.constraintLabel}>
                          <Text style={styles.constraintText}>Only move flexible events</Text>
                          <Text style={styles.constraintHint}>Only reschedule flexible tasks</Text>
                        </View>
                        <Switch
                          value={onlyFlexible}
                          onValueChange={setOnlyFlexible}
                          trackColor={{ false: '#E5E7EB', true: colors.accent }}
                          thumbColor="#FFFFFF"
                        />
                      </View>

                      <View style={styles.constraintRow}>
                        <View style={styles.constraintLabel}>
                          <Text style={styles.constraintText}>Skip fixed classes</Text>
                          <Text style={styles.constraintHint}>Prevents moving fixed-time events</Text>
                        </View>
                        <Switch
                          value={lockFixed}
                          onValueChange={setLockFixed}
                          trackColor={{ false: '#E5E7EB', true: colors.accent }}
                          thumbColor="#FFFFFF"
                        />
                      </View>

                      <View style={styles.constraintRow}>
                        <View style={styles.constraintLabel}>
                          <Text style={styles.constraintText}>Max moves: {maxMoves}</Text>
                          <Text style={styles.constraintHint}>Maximum number of events to move</Text>
                        </View>
                        <View style={styles.sliderContainer}>
                          <View style={styles.sliderTrack}>
                            <View style={[styles.sliderFill, { width: `${(maxMoves / 20) * 100}%` }]} />
                          </View>
                          <View style={styles.sliderControls}>
                            <TouchableOpacity
                              style={styles.sliderButton}
                              onPress={() => setMaxMoves(Math.max(1, maxMoves - 1))}
                            >
                              <Text style={styles.sliderButtonText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.sliderValue}>{maxMoves}</Text>
                            <TouchableOpacity
                              style={styles.sliderButton}
                              onPress={() => setMaxMoves(Math.min(20, maxMoves + 1))}
                            >
                              <Text style={styles.sliderButtonText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Net effect */}
            <View style={styles.stepContent}>
              <View style={styles.netEffectBox}>
                <Text style={styles.netEffectTitle}>Net effect</Text>
                {preview ? (
                  <>
                    <View style={styles.netEffectStats}>
                      <View style={styles.netEffectStat}>
                        <Text style={styles.netEffectValue}>{preview.moved?.length || 0}</Text>
                        <Text style={styles.netEffectLabel}>events moved</Text>
                      </View>
                      <View style={styles.netEffectStat}>
                        <Text style={styles.netEffectValue}>{preview.dropped?.length || 0}</Text>
                        <Text style={styles.netEffectLabel}>dropped</Text>
                      </View>
                      <View style={styles.netEffectStat}>
                        <Text style={styles.netEffectValue}>{preview.conflicts_resolved || 0}</Text>
                        <Text style={styles.netEffectLabel}>conflicts resolved</Text>
                      </View>
                    </View>
                    {(preview.conflicts_resolved || 0) > 0 && (
                      <Text style={styles.netEffectSuccess}>No conflicts remain</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.netEffectPlaceholder}>Preview will appear after confirmation</Text>
                )}
              </View>

              {preview && (
                <>
                  {preview.moved && preview.moved.length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>Proposed changes</Text>
                      {preview.moved.map((item, index) => (
                        <View key={index} style={[styles.previewItem, styles.previewItemMoved]}>
                          <View style={styles.previewItemContent}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <RotateCcw size={16} color="#4C7ED9" />
                              <Text style={styles.previewItemTitle}>
                                {item.title}
                              </Text>
                            </View>
                            <Text style={styles.previewItemDetails}>
                              {formatDate(item.old_start?.split('T')[0])} {formatTime(item.old_start)} → {formatTime(item.new_start)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {preview.dropped && preview.dropped.length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>Couldn't be placed</Text>
                      {preview.dropped.map((item, index) => (
                        <View key={index} style={[styles.previewItem, styles.previewItemDropped]}>
                          <View style={styles.previewItemContent}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <XCircle size={16} color="#E2556A" />
                              <Text style={styles.previewItemTitle}>
                                {item.title}
                              </Text>
                            </View>
                            <Text style={styles.previewItemDetails}>{item.reason || 'No available slot'}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerActions}>
              {preview && (
                <TouchableOpacity
                  style={styles.tryAgainButton}
                  onPress={handleTryAgain}
                  disabled={loading || applying}
                >
                  <RotateCcw size={14} color={colors.accent} />
                  <Text style={styles.tryAgainButtonText}>Try again</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.applyButton, (applying || !preview || loading) && styles.applyButtonDisabled]}
                onPress={handleApply}
                disabled={applying || !preview || loading}
              >
                {applying ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Check size={16} color="#FFFFFF" />
                    <Text style={styles.applyButtonText}>
                      {preview ? `Apply ${preview?.moved?.length || 0} ${preview?.moved?.length === 1 ? 'change' : 'changes'}` : 'Generate preview'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: 720,
    maxWidth: '100%',
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: BG,
    borderRadius: 16,
    flexDirection: 'column',
    ...Platform.select({
      web: {
        boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
      },
    }),
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: FG,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 13,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    padding: 4,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: MUTED,
  },
  stepDotActive: {
    backgroundColor: colors.accent,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: MUTED,
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: colors.accent,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#E2556A',
  },
  errorDismiss: {
    padding: 4,
  },
  stepContent: {
    marginBottom: 24,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  expandFormLink: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fieldHint: {
    fontSize: 12,
    color: SUB,
    marginTop: 0,
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  dropdownText: {
    fontSize: 14,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dropdownMenu: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 4,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      },
    }),
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  dropdownItemText: {
    fontSize: 13,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dropdownItemTextActive: {
    color: colors.accent,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CHIP_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
  },
  childChipSelected: {
    backgroundColor: '#e0f2fe',
    borderColor: colors.accent,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  childChipText: {
    fontSize: 13,
    color: FG,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childChipTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInputGroup: {
    flex: 1,
    gap: 8,
  },
  dateLabel: {
    fontSize: 12,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateInput: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    fontSize: 14,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  textArea: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    fontSize: 14,
    color: FG,
    minHeight: 80,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  constraintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  constraintLabel: {
    flex: 1,
    marginRight: 16,
  },
  constraintText: {
    fontSize: 13,
    fontWeight: '600',
    color: FG,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  constraintHint: {
    fontSize: 12,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sliderContainer: {
    gap: 8,
  },
  sliderTrack: {
    width: 120,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  sliderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderButton: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    minWidth: 24,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: CHIP_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryLabel: {
    fontSize: 12,
    color: SUB,
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewSection: {
    marginBottom: 16,
  },
  previewSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: CHIP_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    marginBottom: 8,
  },
  previewItemContent: {
    flex: 1,
  },
  previewItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: FG,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewItemDetails: {
    fontSize: 12,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 14,
    color: SUB,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  tryAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  tryAgainButtonText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  loadingText: {
    fontSize: 13,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eventDetails: {
    fontSize: 12,
    color: SUB,
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  hintText: {
    fontSize: 12,
    color: SUB,
    fontStyle: 'italic',
    marginTop: 4,
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  changeTypeGrid: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
  },
  changeTypeCard: {
    width: '100%',
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    position: 'relative',
  },
  changeTypeCardSelected: {
    backgroundColor: '#e0f2fe',
    borderColor: colors.accent,
  },
  changeTypeCardDisabled: {
    opacity: 0.5,
  },
  changeTypeIcon: {
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeTypeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: FG,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  changeTypeLabelSelected: {
    color: '#1e40af',
  },
  changeTypeConsequence: {
    fontSize: 12,
    color: SUB,
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  changeTypeConsequenceSelected: {
    color: '#1e40af',
    opacity: 0.8,
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  comingSoonText: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '500',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childEventCount: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  impactPreview: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  dropdownHint: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  dropdownItemHint: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  eventList: {
    maxHeight: 300,
    marginTop: 8,
  },
  eventListItem: {
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  eventListItemSelected: {
    backgroundColor: '#F0F9FF',
    borderColor: colors.accent,
  },
  eventListItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eventListItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  eventListItemTitleSelected: {
    color: colors.accent,
  },
  eventListItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  eventListItemTime: {
    fontSize: 12,
    color: colors.muted,
  },
  eventListItemChild: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  childDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventListItemChildName: {
    fontSize: 12,
    color: colors.muted,
  },
  eventListItemIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fixedIndicator: {
    fontSize: 16,
  },
  flexibleIndicator: {
    fontSize: 16,
  },
  selectedCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewSummary: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  reviewItem: {
    marginBottom: 8,
  },
  reviewItemText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  reviewItemBold: {
    fontWeight: '600',
  },
  reviewConstraints: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  reviewConstraintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  reviewCheck: {
    fontSize: 16,
  },
  reviewUncheck: {
    fontSize: 16,
    opacity: 0.3,
  },
  reviewConstraintText: {
    fontSize: 14,
    color: colors.text,
  },
  previewItemMoved: {
    backgroundColor: '#e0f2fe',
    borderColor: '#3b82f6',
  },
  previewItemDropped: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  suggestedFixSection: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  suggestedFixTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  suggestedFixText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  suggestedFixTime: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  suggestedFixReassurance: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  suggestedFixActions: {
    flexDirection: 'row',
    gap: 8,
  },
  applyFixButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFixButtonContent: {
    alignItems: 'center',
  },
  applyFixButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  applyFixButtonSubtext: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '400',
    opacity: 0.9,
  },
  seeOtherOptionsButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  seeOtherOptionsButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  changeEventLink: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
  eventListItemDisabled: {
    opacity: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  modeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
  },
  modeButtonTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  confidenceStatement: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  confidenceText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 22,
  },
  reviewItemSubtext: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  carefulnessSliderContainer: {
    marginTop: 12,
  },
  carefulnessSliderTrack: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 8,
    position: 'relative',
  },
  carefulnessSliderFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  carefulnessSliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  carefulnessLabel: {
    fontSize: 11,
    color: colors.muted,
  },
  carefulnessSliderControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  carefulnessSliderButton: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  carefulnessSliderButtonActive: {
    // Active state styling handled by dot
  },
  carefulnessSliderDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D1D5DB',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  carefulnessSliderDotActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  carefulnessSliderButtonLabel: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600',
    marginTop: 2,
  },
  assumptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: CHIP_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    marginBottom: 8,
  },
  assumptionLabel: {
    fontSize: 13,
    color: SUB,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assumptionValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assumptionValueText: {
    fontSize: 13,
    color: FG,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  advancedConstraints: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  freeformInput: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    fontSize: 14,
    color: FG,
    minHeight: 120,
    textAlignVertical: 'top',
    marginTop: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  verifyButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignSelf: 'flex-start',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      },
    }),
  },
  verifyButtonText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fieldHint: {
    fontSize: 12,
    color: SUB,
    marginTop: 0,
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  examplesSection: {
    marginTop: 24,
  },
  examplesTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: SUB,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exampleChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: CHIP_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 13,
    color: FG,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  interpretationBox: {
    backgroundColor: CHIP_BG,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  interpretationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  interpretationItem: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  interpretationLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: SUB,
    width: 100,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  interpretationValue: {
    fontSize: 14,
    color: FG,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  editInterpretationButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    alignSelf: 'flex-start',
  },
  editInterpretationText: {
    fontSize: 13,
    color: FG,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  editInterpretationForm: {
    marginTop: 0,
    gap: 16,
  },
  textInput: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    fontSize: 14,
    color: FG,
    marginTop: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 0,
  },
  timeSeparator: {
    fontSize: 16,
    color: colors.muted,
  },
  saveInterpretationButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveInterpretationText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  intentOptions: {
    gap: 12,
  },
  intentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  intentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
  },
  intentOptionSelected: {
    backgroundColor: '#e0f2fe',
    borderColor: colors.accent,
  },
  intentOptionContent: {
    flex: 1,
  },
  intentOptionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  intentOptionTitleSelected: {
    color: '#1e40af',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  intentOptionSubtitle: {
    fontSize: 12,
    color: SUB,
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  intentOptionCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  netEffectBox: {
    backgroundColor: CHIP_BG,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 20,
  },
  netEffectTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  netEffectStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  netEffectStat: {
    alignItems: 'center',
  },
  netEffectValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  netEffectLabel: {
    fontSize: 12,
    color: SUB,
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  netEffectSuccess: {
    fontSize: 13,
    fontWeight: '500',
    color: '#10B981',
    textAlign: 'center',
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  netEffectPlaceholder: {
    fontSize: 13,
    color: SUB,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

