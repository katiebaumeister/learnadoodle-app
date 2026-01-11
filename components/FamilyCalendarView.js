import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  Modal,
} from 'react-native';

import { supabase } from '../lib/supabase';

export default function FamilyCalendarView({ familyId, onEventSelect = null, onPlanNew = null }) {
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [markedDates, setMarkedDates] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [events, setEvents] = useState([]);
  const [children, setChildren] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDayDetails, setShowDayDetails] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayDetails, setDayDetails] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => {
    if (familyId) {
      fetchChildren();
      fetchAcademicYears();
    }
  }, [familyId]);

  useEffect(() => {
    if (selectedYear) {
      fetchCalendarData();
      fetchConflicts();
    }
  }, [selectedYear, familyId]);

  const fetchChildren = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError || !profile?.family_id) {
        return;
      }

      const { data: childrenData } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('first_name');

      if (childrenData) {
        setChildren(childrenData);
      }
    } catch (error) {
    }
  };

  const fetchAcademicYears = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError || !profile?.family_id) {
        return;
      }

      const { data: years } = await supabase
        .from('family_years')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('start_date', { ascending: false });

      if (years && years.length > 0) {
        setAcademicYears(years);
        setSelectedYear(years[0]);
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCalendarData = async () => {
    if (!selectedYear || !familyId) return;

    try {
      setIsLoading(true);
      const startDate = new Date(selectedYear.start_date);
      const endDate = new Date(selectedYear.end_date);

      // Fetch all events for the family (including family events and shared classes)
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
          *,
          children:child_id (
            id,
            first_name,
            last_name
          ),
          subject:subject_id (
            id,
            name
          )
        `)
        .eq('family_id', familyId)
        .gte('start_ts', startDate.toISOString())
        .lte('start_ts', endDate.toISOString())
        .neq('status', 'canceled')
        .is('canceled_at', null)
        .is('deleted_at', null)
        .order('start_ts', { ascending: true });

      if (eventsError) {
        return;
      }

      // Process events to include child_ids array
      const processedEvents = (eventsData || []).map(event => {
        let childNames = [];
        
        if (event.child_id && event.children) {
          childNames.push(event.children.first_name);
        } else if (event.child_ids && Array.isArray(event.child_ids) && event.child_ids.length > 0) {
          const childIds = event.child_ids;
          childNames = children
            .filter(c => childIds.includes(c.id))
            .map(c => c.first_name);
        } else if (event.event_type === 'Family Event') {
          childNames = ['All'];
        }

        return {
          ...event,
          childNames: childNames.join(', '),
          isFamilyEvent: event.event_type === 'Family Event' || (event.child_ids && event.child_ids.length > 1),
          isSharedClass: event.shared_class_id !== null,
        };
      });

      setEvents(processedEvents);

      // Build marked dates
      const marked = {};
      processedEvents.forEach(event => {
        const dateStr = new Date(event.start_ts).toISOString().split('T')[0];
        if (!marked[dateStr]) {
          marked[dateStr] = {
            marked: true,
            dots: [],
            customStyles: {
              container: {
                backgroundColor: '#f0f0f0',
              },
            },
          };
        }
        
        // Add dot for event type
        const dotColor = event.isFamilyEvent 
          ? '#3b82f6' // Blue for family events
          : event.isSharedClass
          ? '#10b981' // Green for shared classes
          : '#6b7280'; // Gray for individual events

        marked[dateStr].dots.push({
          key: event.id,
          color: dotColor,
        });
      });

      setMarkedDates(marked);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const fetchConflicts = async () => {
    if (!familyId || !selectedYear) return;

    try {
      const startDate = new Date(selectedYear.start_date);
      const endDate = new Date(selectedYear.end_date);

      const { data, error } = await supabase.rpc('detect_schedule_conflicts', {
        p_family_id: familyId,
        p_start_date: startDate.toISOString().split('T')[0],
        p_end_date: endDate.toISOString().split('T')[0],
      });

      if (error) {
        return;
      }

      setConflicts(data || []);
    } catch (error) {
    }
  };

  const handleDayPress = useCallback(({ dateString }) => {
    setSelectedDate(new Date(dateString));
    
    const dayEvents = events.filter(event => {
      const eventDate = new Date(event.start_ts).toISOString().split('T')[0];
      return eventDate === dateString;
    });

    const dayConflicts = conflicts.filter(conflict => {
      return conflict.conflict_date === dateString;
    });

    setDayDetails({
      date: dateString,
      events: dayEvents,
      conflicts: dayConflicts,
    });
    setShowDayDetails(true);
  }, [events, conflicts]);

  const renderCalendar = () => (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarHeader}>
        <Text style={styles.calendarMonthTitle}>
          {selectedYear ? new Date(selectedYear.start_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Loading...'}
        </Text>
        {conflicts.length > 0 && (
          <TouchableOpacity
            style={styles.conflictsBadge}
            onPress={() => setShowConflicts(true)}
          >
            <Text style={styles.conflictsBadgeText}>
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.calendarGrid}>
        <View style={styles.dayHeaders}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <View key={`day-header-${day}`} style={styles.dayHeader}>
              <Text style={styles.dayHeaderText}>{day}</Text>
            </View>
          ))}
        </View>
        
        <View style={styles.daysGrid}>
          {renderCalendarDays()}
        </View>
      </View>
    </View>
  );

  const renderCalendarDays = () => {
    if (!selectedYear) return null;
    
    const startDate = new Date(selectedYear.start_date);
    const firstDayOfMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const startGridDate = new Date(firstDayOfMonth);
    startGridDate.setDate(startGridDate.getDate() - firstDayOfMonth.getDay());
    
    const weeks = [];
    let currentWeek = [];
    let currentGridDate = new Date(startGridDate);
    
    for (let i = 0; i < 42; i++) {
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      
      const isCurrentMonth = currentGridDate.getMonth() === startDate.getMonth();
      const isToday = currentGridDate.toDateString() === new Date().toDateString();
      const isSelected = currentGridDate.toDateString() === selectedDate?.toDateString();
      const dateString = currentGridDate.toISOString().split('T')[0];
      const dayData = markedDates[dateString];
      
      currentWeek.push({
        date: new Date(currentGridDate),
        isCurrentMonth,
        isToday,
        isSelected,
        dayNumber: currentGridDate.getDate(),
        dateString,
        dayData
      });
      
      currentGridDate.setDate(currentGridDate.getDate() + 1);
    }
    
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }
    
    return weeks.map((week, weekIndex) => (
      <View key={`week-${weekIndex}`} style={styles.weekRow}>
        {week.map((day, dayIndex) => (
          <TouchableOpacity
            key={`day-${weekIndex}-${dayIndex}-${day.dateString}`}
            style={[
              styles.dayCell,
              !day.isCurrentMonth && styles.dayCellOtherMonth,
              day.isToday && styles.dayCellToday,
              day.isSelected && styles.dayCellSelected,
              day.dayData?.customStyles?.container
            ]}
            onPress={() => handleDayPress({ dateString: day.dateString })}
          >
            <Text style={[
              styles.dayText,
              !day.isCurrentMonth && styles.dayTextOtherMonth,
              day.isToday && styles.dayTextToday,
            ]}>
              {day.dayNumber}
            </Text>
            {day.dayData?.dots && day.dayData.dots.length > 0 && (
              <View style={styles.dotsContainer}>
                {day.dayData.dots.slice(0, 3).map((dot, idx) => (
                  <View
                    key={dot.key || idx}
                    style={[styles.dot, { backgroundColor: dot.color }]}
                  />
                ))}
                {day.dayData.dots.length > 3 && (
                  <Text style={styles.moreDots}>+{day.dayData.dots.length - 3}</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    ));
  };

  return (
    <View style={styles.container}>
      {renderCalendar()}
      
      {/* Day Details Modal */}
      <Modal
        visible={showDayDetails}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDayDetails(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {dayDetails?.date ? new Date(dayDetails.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
              </Text>
              <TouchableOpacity onPress={() => setShowDayDetails(false)}>
                <Text style={styles.closeButton}>Close</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {dayDetails?.events && dayDetails.events.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Events</Text>
                  {dayDetails.events.map(event => (
                    <View key={event.id} style={styles.eventItem}>
                      <View style={styles.eventHeader}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        {event.isFamilyEvent && (
                          <View style={styles.familyEventBadge}>
                            <Text style={styles.familyEventBadgeText}>Family</Text>
                          </View>
                        )}
                        {event.isSharedClass && (
                          <View style={styles.sharedClassBadge}>
                            <Text style={styles.sharedClassBadgeText}>Shared</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.eventTime}>
                        {new Date(event.start_ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - {new Date(event.end_ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                      <Text style={styles.eventChildren}>Children: {event.childNames || 'N/A'}</Text>
                      {event.subject?.name && (
                        <Text style={styles.eventSubject}>Subject: {event.subject.name}</Text>
                      )}
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.noEvents}>No events scheduled</Text>
              )}
              
              {dayDetails?.conflicts && dayDetails.conflicts.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, styles.conflictTitle]}>Conflicts</Text>
                  {dayDetails.conflicts.map((conflict, idx) => {
                    const child1 = children.find(c => c.id === conflict.child_id_1);
                    const child2 = children.find(c => c.id === conflict.child_id_2);
                    return (
                      <View key={idx} style={styles.conflictItem}>
                        <Text style={styles.conflictText}>
                          Schedule conflict between {child1?.first_name || 'Child 1'} and {child2?.first_name || 'Child 2'}
                        </Text>
                        <Text style={styles.conflictTime}>
                          {new Date(conflict.conflict_start).toLocaleTimeString()} - {new Date(conflict.conflict_end).toLocaleTimeString()}
                        </Text>
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Conflicts Modal */}
      <Modal
        visible={showConflicts}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowConflicts(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule Conflicts</Text>
              <TouchableOpacity onPress={() => setShowConflicts(false)}>
                <Text style={styles.closeButton}>Close</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {conflicts.length > 0 ? (
                conflicts.map((conflict, idx) => {
                  const child1 = children.find(c => c.id === conflict.child_id_1);
                  const child2 = children.find(c => c.id === conflict.child_id_2);
                  return (
                    <View key={idx} style={styles.conflictItem}>
                      <Text style={styles.conflictDate}>
                        {new Date(conflict.conflict_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                      </Text>
                      <Text style={styles.conflictText}>
                        {child1?.first_name || 'Child 1'} has overlapping events
                      </Text>
                      <Text style={styles.conflictTime}>
                        {new Date(conflict.conflict_start).toLocaleTimeString()} - {new Date(conflict.conflict_end).toLocaleTimeString()}
                      </Text>
                      <Text style={styles.conflictSeverity}>
                        Severity: {conflict.severity}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.noEvents}>No conflicts detected</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  calendarContainer: {
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarMonthTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
  },
  conflictsBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  conflictsBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  calendarGrid: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dayHeaders: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  dayHeader: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  dayHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  daysGrid: {
    backgroundColor: '#fff',
  },
  weekRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  dayCell: {
    flex: 1,
    minHeight: 60,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  dayCellOtherMonth: {
    backgroundColor: '#f9fafb',
  },
  dayCellToday: {
    backgroundColor: '#dbeafe',
  },
  dayCellSelected: {
    backgroundColor: '#bfdbfe',
  },
  dayText: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  dayTextOtherMonth: {
    color: '#9ca3af',
  },
  dayTextToday: {
    color: '#2563eb',
    fontWeight: '700',
  },
  dotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
    gap: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 2,
  },
  moreDots: {
    fontSize: 8,
    color: '#6b7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  closeButton: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '500',
  },
  modalBody: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
    marginTop: 8,
  },
  conflictTitle: {
    color: '#ef4444',
    marginTop: 16,
  },
  eventItem: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  familyEventBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  familyEventBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  sharedClassBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  sharedClassBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  eventTime: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  eventChildren: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  eventSubject: {
    fontSize: 14,
    color: '#6b7280',
  },
  noEvents: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    padding: 20,
  },
  conflictItem: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  conflictDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  conflictText: {
    fontSize: 14,
    color: '#1f2937',
    marginBottom: 4,
  },
  conflictTime: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  conflictSeverity: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '500',
  },
});

