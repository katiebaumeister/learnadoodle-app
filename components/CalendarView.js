import React, { useState, useEffect } from 'react';
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



export default function CalendarView({ familyId, selectedChildId = null, onChildSelect = null, onPlanNew = null }) {
  // State for calendar data
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [markedDates, setMarkedDates] = useState({});
  const [classDayMappings, setClassDayMappings] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [activities, setActivities] = useState([]);
  const [learningTracks, setLearningTracks] = useState([]);
  const [children, setChildren] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [showDayDetails, setShowDayDetails] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayDetails, setDayDetails] = useState(null);
  const [localSelectedChildId, setLocalSelectedChildId] = useState(selectedChildId);

  useEffect(() => {
    if (familyId) {
      fetchChildren();
      fetchAcademicYears();
    }
  }, [familyId]);

  useEffect(() => {
    if (selectedYear) {
      fetchCalendarData();
      fetchLearningTracks();
    }
  }, [selectedYear]);

  const fetchChildren = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        return;
      }

      if (!profile || !profile.family_id) {
        console.log('No profile or family_id found for user');
        return;
      }

      const { data: childrenData } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', profile.family_id);

      if (childrenData) {
        setChildren(childrenData);
      }
    } catch (error) {
      console.error('Error fetching children:', error);
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

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        return;
      }

      if (!profile || !profile.family_id) {
        console.log('No profile or family_id found for user');
        return;
      }

      console.log('Profile family_id:', profile.family_id);
      
      const { data: years, error } = await supabase
        .from('family_years')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('start_date', { ascending: false });

      if (error) {
        console.error('Error fetching academic years:', error);
        return;
      }

      if (years && years.length > 0) {
        console.log('Academic years found:', years.length);
        console.log('First year details:', years[0]);
        setAcademicYears(years);
        setSelectedYear(years[0]); // Select the most recent year
      } else {
        console.log('No academic years found for family_id:', profile.family_id);
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCalendarData = async () => {
    if (!selectedYear) return;

    try {
      setIsLoading(true);
      
      // Build marked dates for the current month using get_calendar_day_status RPC
      const year = new Date(selectedYear.start_date).getFullYear();
      const month = new Date(selectedYear.start_date).getMonth();
      const firstOfMonth = new Date(year, month, 1);
      const lastOfMonth = new Date(year, month + 1, 0);
      const days = [];
      for (let d = new Date(firstOfMonth); d <= lastOfMonth; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d));
      }
      const dayStatusResults = await Promise.all(
        days.map(async (d) => {
          const dateStr = d.toISOString().split('T')[0];
          const { data, error } = await supabase.rpc('get_calendar_day_status', {
            p_family_id: selectedYear.family_id,
            p_date: dateStr,
          });
          if (error) {
            console.warn('get_calendar_day_status error for', dateStr, error.message);
            return { dateStr, is_teaching: null, is_vacation: null, notes: null };
          }
          const row = Array.isArray(data) ? data[0] : data; // rpc returns setof
          return { dateStr, is_teaching: row?.is_teaching, is_vacation: row?.is_vacation, notes: row?.notes };
        })
      );
      const calendarDayMarks = dayStatusResults.map(({ dateStr, is_vacation }) => ({
        calendar_date: dateStr,
        is_vacation: !!is_vacation,
        is_teaching: !is_vacation,
      }));
      setClassDayMappings(calendarDayMarks);

      // No longer reading per-family holidays table; overrides drive day status
      const holidaysData = [];

      // Fetch lessons for this academic year
      const { data: lessonsData } = await supabase
        .from('lessons')
        .select(`
          *,
          subject_track:subject_track_id(id, name),
          track:track!subject_track_id(id, subject_id)
        `)
        .eq('family_year_id', selectedYear.id)
        .gte('lesson_date', selectedYear.start_date)
        .lte('lesson_date', selectedYear.end_date)
        .order('lesson_date', { ascending: true });

      if (lessonsData) {
        console.log('Lessons loaded:', lessonsData.length);
        // Store lessons for calendar display
        setLessons(lessonsData);
      }

      // Fetch activities for this family
      const { data: activitiesData } = await supabase
        .from('activities')
        .select('*')
        .eq('family_id', selectedYear.family_id)
        .order('created_at', { ascending: true });

      if (activitiesData) {
        console.log('Activities loaded:', activitiesData.length);
        // Store activities for calendar display
        setActivities(activitiesData);
      }

      // Update marked dates with all the data
      updateMarkedDates(calendarDayMarks || [], holidaysData || [], lessonsData || [], activitiesData || []);
      
      // Debug logging
      console.log('Calendar data loaded:');
      console.log('- Calendar days:', calendarDayMarks?.length || 0);
      console.log('- Holidays:', holidaysData?.length || 0);
      console.log('- Lessons:', lessonsData?.length || 0);
      console.log('- Activities:', activitiesData?.length || 0);
      
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLearningTracks = async () => {
    if (!selectedYear) return;

    try {
      console.log('Fetching learning tracks for family_id:', selectedYear.family_id);
      
      const { data: tracksData, error } = await supabase
        .from('subject_track')
        .select('*')
        .eq('family_id', selectedYear.family_id)
        .order('name', { ascending: true });

      if (error) {
        console.error('Supabase error fetching learning tracks:', error);
        return;
      }

      if (tracksData) {
        setLearningTracks(tracksData);
        console.log('Learning tracks loaded:', tracksData.length);
        console.log('Track names:', tracksData.map(t => t.name));
      } else {
        console.log('No learning tracks found for family_id:', selectedYear.family_id);
      }
    } catch (error) {
      console.error('Error fetching learning tracks:', error);
    }
  };

  const updateMarkedDates = (mappingsData, holidaysData, lessonsData, activitiesData) => {
    const newMarkedDates = {};

    // Mark calendar days from calendar_days
    mappingsData.forEach(mapping => {
      if (mapping.calendar_date) {
        const dateStr = mapping.calendar_date;
        newMarkedDates[dateStr] = {
          marked: true,
          dotColor: mapping.is_vacation ? '#FF6B6B' : '#38B6FF',
          textColor: '#333',
          selected: false,
          customStyles: {
            container: {
              backgroundColor: mapping.is_vacation ? '#FFE5E5' : '#E5F3FF',
            }
          },
          // Add data for calendar chips
          calendarDay: mapping,
          lessons: lessonsData?.filter(l => l.lesson_date === dateStr) || [],
          activities: activitiesData?.filter(a => {
            try {
              const scheduleData = JSON.parse(a.schedule_data);
              return scheduleData.date === dateStr;
            } catch {
              return false;
            }
          }) || []
        };
      }
    });

    // Mark holidays
    holidaysData.forEach(holiday => {
      if (holiday.holiday_date) {
        const dateStr = holiday.holiday_date;
        newMarkedDates[dateStr] = {
          marked: true,
          dotColor: '#FF6B6B',
          textColor: '#333',
          selected: false,
          customStyles: {
            container: {
              backgroundColor: '#FFE5E5',
            }
          },
          holiday: holiday
        };
      }
    });

    // Mark days with lessons (even if not class days)
    lessonsData.forEach(lesson => {
      if (lesson.lesson_date) {
        const dateStr = lesson.lesson_date;
        if (!newMarkedDates[dateStr]) {
          newMarkedDates[dateStr] = {
            marked: true,
            dotColor: '#4CAF50',
            textColor: '#333',
            selected: false,
            customStyles: {
              container: {
                backgroundColor: '#E8F5E8',
              }
            }
          };
        }
        
        // Add lesson data
        if (!newMarkedDates[dateStr].lessons) {
          newMarkedDates[dateStr].lessons = [];
        }
        newMarkedDates[dateStr].lessons.push(lesson);
      }
    });

    setMarkedDates(newMarkedDates);
    console.log('Marked dates updated with rich data:', Object.keys(newMarkedDates).length);
  };

  const handleDayPress = (day) => {
    const date = day.dateString;
    const dayData = markedDates[date];
    
    if (dayData) {
      setSelectedDate(date);
      setDayDetails({
        date,
        calendarDay: dayData.calendarDay,
        holiday: dayData.holiday,
        lessons: dayData.lessons || [],
        activities: dayData.activities || [],
        children: children.filter(c => !selectedChildId || c.id === selectedChildId)
      });
      setShowDayDetails(true);
    }
  };



  const handleChildSelect = (childId) => {
    setLocalSelectedChildId(childId);
    if (onChildSelect) {
      onChildSelect(childId);
    }
  };

  const getFilteredLearningTracks = () => {
    console.log('Filtering tracks. Selected child ID:', localSelectedChildId);
            console.log('Available children:', children.map(c => ({ id: c.id, name: c.first_name })));
    console.log('All learning tracks:', learningTracks.map(t => t.name));
    
    if (!localSelectedChildId) {
      console.log('No child selected, returning all tracks');
      return learningTracks;
    }
    
    // Filter tracks based on child name in track name
    const filtered = learningTracks.filter(track => {
              const childName = children.find(c => c.id === localSelectedChildId)?.first_name;
      console.log('Looking for child name:', childName, 'in track:', track.name);
      if (childName) {
        const includes = track.name.includes(childName);
        console.log('Track includes child name:', includes);
        return includes;
      }
      return false;
    });
    
    console.log('Filtered tracks:', filtered.map(t => t.name));
    return filtered;
  };





  const renderCalendar = () => (
    <View style={styles.calendarContainer}>
      {/* Custom Calendar Header */}
      <View style={styles.calendarHeader}>
        <Text style={styles.calendarMonthTitle}>
          {selectedYear ? new Date(selectedYear.start_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Loading...'}
        </Text>
      </View>
      
      {/* Custom Grid Calendar */}
      <View style={styles.calendarGrid}>
        {/* Day Headers */}
        <View style={styles.dayHeaders}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
            <View key={`day-header-${day}`} style={styles.dayHeader}>
              <Text style={styles.dayHeaderText}>{day}</Text>
            </View>
          ))}
        </View>
        
        {/* Calendar Days Grid */}
        <View style={styles.daysGrid}>
          {renderCalendarDays()}
        </View>
      </View>
    </View>
  );

  const renderRoadmapUnits = (roadmap) => {
    try {
      if (typeof roadmap === 'string') {
        roadmap = JSON.parse(roadmap);
      }
      
      if (roadmap && roadmap.units && Array.isArray(roadmap.units)) {
        return (
          <View style={styles.roadmapUnits}>
            {roadmap.units.slice(0, 3).map((unit, index) => (
              <View key={`unit-${unit.name}-${index}`} style={styles.roadmapUnit}>
                <Text style={styles.unitName}>{unit.name}</Text>
                <Text style={styles.unitDetails}>
                  {unit.lessons} lessons • {unit.duration}
                </Text>
              </View>
            ))}
            {roadmap.units.length > 3 && (
              <Text style={styles.moreUnits}>
                +{roadmap.units.length - 3} more units
              </Text>
            )}
          </View>
        );
      }
      
      return (
        <Text style={styles.roadmapContent}>
          Roadmap data available
        </Text>
      );
    } catch (error) {
      return (
        <Text style={styles.roadmapContent}>
          Roadmap data available
        </Text>
      );
    }
  };

  const renderCourseOutline = (outline) => {
    try {
      if (typeof outline === 'string') {
        outline = JSON.parse(outline);
      }
      
      if (outline && (outline.topics || outline.skills)) {
        return (
          <View style={styles.outlineContent}>
            {outline.topics && (
              <View style={styles.outlineSection}>
                <Text style={styles.outlineSectionTitle}>Topics:</Text>
                <View style={styles.tagsContainer}>
                  {outline.topics.slice(0, 4).map((topic, index) => (
                    <View key={`topic-${topic}-${index}`} style={styles.tag}>
                      <Text style={styles.tagText}>{topic}</Text>
                    </View>
                  ))}
                  {outline.topics.length > 4 && (
                    <Text style={styles.moreTags}>+{outline.topics.length - 4}</Text>
                  )}
                </View>
              </View>
            )}
            
            {outline.skills && (
              <View style={styles.outlineSection}>
                <Text style={styles.outlineSectionTitle}>Skills:</Text>
                <View style={styles.tagsContainer}>
                  {outline.skills.slice(0, 3).map((skill, index) => (
                    <View key={`skill-${skill}-${index}`} style={styles.tag}>
                      <Text style={styles.tagText}>{skill}</Text>
                    </View>
                  ))}
                  {outline.skills.length > 3 && (
                    <Text style={styles.moreTags}>+{outline.skills.length - 3}</Text>
                  )}
                </View>
              </View>
            )}
          </View>
        );
      }
      
      return (
        <Text style={styles.roadmapContent}>
          Course outline available
        </Text>
      );
    } catch (error) {
      return (
        <Text style={styles.roadmapContent}>
          Course outline available
        </Text>
      );
    }
  };

  const renderCalendarDays = () => {
    if (!selectedYear) return null;
    
    const startDate = new Date(selectedYear.start_date);
    const endDate = new Date(selectedYear.end_date);
    const currentDate = new Date(startDate);
    
    // Get the first day of the month to start the grid
    const firstDayOfMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const startGridDate = new Date(firstDayOfMonth);
    startGridDate.setDate(startGridDate.getDate() - firstDayOfMonth.getDay());
    
    const weeks = [];
    let currentWeek = [];
    let currentGridDate = new Date(startGridDate);
    
    // Generate 6 weeks of dates (42 days total)
    for (let i = 0; i < 42; i++) {
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      
      const isCurrentMonth = currentGridDate.getMonth() === startDate.getMonth();
      const isToday = currentGridDate.toDateString() === new Date().toDateString();
      const isSelected = currentGridDate.toDateString() === selectedDate?.toDateString();
      
      // Get the date string for this day
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
              day.isSelected && styles.dayTextSelected
            ]}>
              {day.dayNumber}
            </Text>
            
            {/* Render calendar chips based on day data */}
            {day.dayData && (
              <View style={styles.dayChips}>
                {/* Holiday chip */}
                {day.dayData.holiday && (
                  <View style={styles.chipHoliday}>
                    <Text style={styles.chipText}>🎉</Text>
                  </View>
                )}
                
                {/* Lesson chips */}
                {day.dayData.lessons && day.dayData.lessons.length > 0 && (
                  <View style={styles.chipLessons}>
                    <Text style={styles.chipText}>📚</Text>
                    {day.dayData.lessons.length > 1 && (
                      <Text style={styles.chipCount}>{day.dayData.lessons.length}</Text>
                    )}
                  </View>
                )}
                
                {/* Activity chips */}
                {day.dayData.activities && day.dayData.activities.length > 0 && (
                  <View style={styles.chipActivities}>
                    <Text style={styles.chipText}>🎯</Text>
                    {day.dayData.activities.length > 1 && (
                      <Text style={styles.chipCount}>{day.dayData.activities.length}</Text>
                    )}
                  </View>
                )}
                
                {/* Class day indicator */}
                {day.dayData.classDay && (
                  <View style={styles.chipClassDay}>
                    <Text style={styles.chipText}>🏫</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    ));
  };

  const renderLearningTracks = () => {
    const filteredTracks = getFilteredLearningTracks();
    const activeChild = children.find(c => c.id === localSelectedChildId);
    
    return (
      <View style={styles.learningTracksSection}>
        <Text style={styles.sectionTitle}>Learning Tracks & Schedule</Text>
        
        <ScrollView showsVerticalScrollIndicator={false} style={[styles.tracksContainer, styles.rightColumnTracksContainer]}>
          {filteredTracks.map((track) => (
            <TouchableOpacity 
              key={track.id} 
              style={[styles.trackCard, styles.rightColumnTrackCard]}
              onPress={() => {
                // TODO: Show track details modal
                console.log('Track clicked:', track.name);
              }}
            >
              <View style={styles.trackCardContent}>
                <Text style={styles.trackNameCompact}>{track.name}</Text>
                <Text style={styles.trackScheduleCompact}>
                  {track.class_schedule} • {track.study_days}
                </Text>
              </View>
              <View style={styles.trackStatusCompact}>
                <View style={[styles.statusDot, { backgroundColor: track.status === 'active' ? '#4CAF50' : '#FF9800' }]} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderDayDetailsModal = () => (
    <Modal
      visible={showDayDetails}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowDayDetails(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowDayDetails(false)}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {dayDetails?.holiday && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Holiday</Text>
                <Text style={styles.holidayName}>{dayDetails.holiday.holiday_name}</Text>
                {dayDetails.holiday.description && (
                  <Text style={styles.holidayDescription}>{dayDetails.holiday.description}</Text>
                )}
              </View>
            )}

            {dayDetails?.classDayMapping && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Class Day</Text>
                <Text style={styles.classDayInfo}>
                  Class day scheduled
                </Text>
              </View>
            )}

            {dayDetails?.lessons && dayDetails.lessons.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Lessons ({dayDetails.lessons.length})</Text>
                {dayDetails.lessons.map((lesson, index) => (
                  <View key={`lesson-${lesson.id}-${index}`} style={styles.lessonItem}>
                    <Text style={styles.lessonTitle}>
                      {lesson.subject_track?.name || 'Lesson'} #{lesson.sequence_no}
                    </Text>
                    {lesson.summary && (
                      <Text style={styles.lessonSummary}>{lesson.summary}</Text>
                    )}
                    {lesson.content_summary && (
                      <Text style={styles.lessonContent}>{lesson.content_summary}</Text>
                    )}
                    {lesson.progress && (
                      <View style={styles.progressContainer}>
                        <Text style={styles.progressLabel}>Progress:</Text>
                        <Text style={styles.progressValue}>
                          {typeof lesson.progress === 'object' ? 
                            `${lesson.progress.completed || 0}/${lesson.progress.total || 1}` :
                            lesson.progress
                          }
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {dayDetails?.activities && dayDetails.activities.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Activities ({dayDetails.activities.length})</Text>
                {dayDetails.activities.map((activity, index) => (
                  <View key={`activity-${activity.id}-${index}`} style={styles.activityItem}>
                    <Text style={styles.activityName}>{activity.name}</Text>
                    <Text style={styles.activityType}>{activity.activity_type}</Text>
                            {activity.description && (
          <Text style={styles.activityAnalysis}>{activity.description}</Text>
        )}
                  </View>
                ))}
              </View>
            )}

            {dayDetails?.children && dayDetails.children.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Children</Text>
                {dayDetails.children.map((child) => (
                  <View key={child.id} style={styles.childItem}>
                                          <Text style={styles.childName}>{child.first_name}</Text>
                    <Text style={styles.childDetails}>
                      Age: {child.age} | Grade: {child.grade}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading calendar...</Text>
      </View>
    );
  }

  if (academicYears.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Calendars Available</Text>
        <Text style={styles.emptySubtitle}>
          You haven't created any academic calendars yet. Create your first calendar to get started.
        </Text>
        <TouchableOpacity 
          style={styles.planButton}
          onPress={() => {
            // This will need to be handled by the parent component
            // For now, we'll show an alert
            Alert.alert(
              'Calendar Planning',
              'To create a new calendar, please use the Calendar Planning tab in the main navigation.',
              [{ text: 'OK' }]
            );
          }}
        >
          <Text style={styles.planButtonText}>Plan New Calendar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Add error boundary for missing data
  if (!selectedYear) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Calendar Setup Required</Text>
        <Text style={styles.emptySubtitle}>
          Your calendar needs some basic setup. Please create an academic year and calendar data to get started.
        </Text>
        <TouchableOpacity 
          style={styles.planButton}
          onPress={() => {
            Alert.alert(
              'Calendar Setup',
              'Please use the Calendar Planning tab to set up your academic year and calendar.',
              [{ text: 'OK' }]
            );
          }}
        >
          <Text style={styles.planButtonText}>Set Up Calendar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.topNav}>
        <View style={styles.navLeft}>
          <Text style={styles.navTitle}>Learnadoodle Calendar</Text>
        </View>
        <View style={styles.navCenter}>
          <Text style={styles.currentView}>Month</Text>
          <TouchableOpacity style={styles.todayButton}>
            <Text style={styles.todayButtonText}>Today</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.navRight}>
          <Text style={styles.currentMonth}>
            {selectedYear ? new Date(selectedYear.start_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Loading...'}
          </Text>
        </View>
      </View>

      {/* Main Layout */}
      <View style={styles.mainLayout}>
        {/* Left Sidebar - Mini Calendar & Account */}
        <View style={styles.leftSidebar}>
          <View style={styles.miniCalendar}>
            <Text style={styles.miniCalendarTitle}>
              {selectedYear ? new Date(selectedYear.start_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Loading...'}
            </Text>
            {/* Mini calendar grid would go here */}
            <Text style={styles.miniCalendarNote}>Mini calendar view</Text>
          </View>
          
          <View style={styles.accountSection}>
            <Text style={styles.accountTitle}>Account</Text>
            <Text style={styles.accountEmail}>katiebaumeister@icloud.com</Text>
            <TouchableOpacity style={styles.addAccountButton}>
              <Text style={styles.addAccountButtonText}>+ Add calendar account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Calendar Area */}
        <View style={styles.mainCalendarArea}>
          {renderCalendar()}
        </View>

        {/* Right Sidebar - Learning Tracks */}
        <View style={styles.rightSidebar}>
          {renderLearningTracks()}
        </View>
      </View>
      
      {renderDayDetailsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // Top Navigation Bar
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#ffffff',
  },
  navLeft: {
    flex: 1,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  navCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  currentView: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  todayButton: {
    backgroundColor: '#38B6FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  todayButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  navRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  currentMonth: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },

  // Main Layout
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
    height: '100%',
  },
  leftSidebar: {
    width: 280,
    backgroundColor: '#f8f9fa',
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
    padding: 20,
    height: '100%',
  },
  mainCalendarArea: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 0,
  },
  rightSidebar: {
    width: 320,
    backgroundColor: '#f8f9fa',
    borderLeftWidth: 1,
    borderLeftColor: '#f0f0f0',
    padding: 20,
    height: '100%',
  },

  // Left Sidebar Components
  miniCalendar: {
    marginBottom: 32,
  },
  miniCalendarTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  miniCalendarNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  accountSection: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 20,
  },
  accountTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  accountEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  addAccountButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addAccountButtonText: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  // Override styles for right column layout
  rightColumnTracksContainer: {
    maxHeight: 400,
  },
  rightColumnTrackCard: {
    marginBottom: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Compact track card styles
  trackCardContent: {
    flex: 1,
  },
  trackNameCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  trackScheduleCompact: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  trackStatusCompact: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },



  calendarContainer: {
    backgroundColor: '#ffffff',
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  fullCalendar: {
    height: '100%',
    width: '100%',
    flex: 1,
  },
  calendarHeader: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#ffffff',
  },
  calendarMonthTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
  },

  // Custom Grid Calendar Styles
  calendarGrid: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  dayHeaders: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fafbfc',
  },
  dayHeader: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  daysGrid: {
    flex: 1,
  },
  weekRow: {
    flexDirection: 'row',
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
    minHeight: 80,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  dayCellOtherMonth: {
    backgroundColor: '#fafbfc',
  },
  dayCellToday: {
    backgroundColor: '#E9F6FF',
  },
  dayCellSelected: {
    backgroundColor: '#38B6FF',
  },
  dayText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  dayTextOtherMonth: {
    color: '#ccc',
  },
  dayTextToday: {
    color: '#38B6FF',
    fontWeight: '600',
  },
  dayTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },

  calendarTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarSubtitle: {
    fontSize: 14,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarGrid: {
    padding: 24,
  },
  calendarRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calendarCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  calendarCellHover: {
    backgroundColor: '#f8f9fa',
  },
  calendarCellToday: {
    backgroundColor: '#1a1a1a',
  },
  calendarCellText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarCellTextToday: {
    color: '#ffffff',
  },
  calendarCellTextOther: {
    color: '#cccccc',
  },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 32,
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  planButton: {
    backgroundColor: '#38B6FF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
  },
  planButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Learning Tracks Styles
  learningTracksSection: {
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  tracksContainer: {
    marginBottom: 20,
  },
  trackCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginRight: 16,
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  trackName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  trackSchedule: {
    fontSize: 14,
    color: '#38B6FF',
    marginBottom: 4,
  },
  trackDays: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  trackStatus: {
    marginBottom: 12,
  },
  statusBadge: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  roadmapPreview: {
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
    paddingTop: 12,
  },
  roadmapTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  roadmapContent: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
  },
  roadmapUnits: {
    marginTop: 8,
  },
  roadmapUnit: {
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  unitName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  unitDetails: {
    fontSize: 10,
    color: '#666',
    lineHeight: 14,
  },
  moreUnits: {
    fontSize: 10,
    color: '#38B6FF',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Course Outline Styles
  courseOutlinePreview: {
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
    paddingTop: 12,
    marginTop: 8,
  },
  outlineTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  outlineContent: {
    gap: 8,
  },
  outlineSection: {
    marginBottom: 8,
  },
  outlineSectionTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    backgroundColor: '#E5F3FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 9,
    color: '#38B6FF',
    fontWeight: '500',
  },
  moreTags: {
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
    alignSelf: 'center',
    marginLeft: 4,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.25)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 24,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  holidayName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#FF6B6B',
    marginBottom: 4,
  },
  holidayDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  classDayInfo: {
    fontSize: 16,
    color: '#38B6FF',
    marginBottom: 8,
  },
  classDayNotes: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  childItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  childName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  childDetails: {
    fontSize: 14,
    color: '#666',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#666666',
    marginTop: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 32,
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  planButton: {
    backgroundColor: '#38B6FF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
  },
  planButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  planNewButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  planNewButtonHover: {
    backgroundColor: '#000000',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(26, 26, 26, 0.2)',
  },
  planNewButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  // Learning Tracks Styles
  learningTracksSection: {
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  tracksContainer: {
    marginBottom: 20,
  },
  trackCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginRight: 16,
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  trackName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  trackSchedule: {
    fontSize: 14,
    color: '#38B6FF',
    marginBottom: 4,
  },
  trackDays: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  trackStatus: {
    marginBottom: 12,
  },
  statusBadge: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  roadmapPreview: {
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
    paddingTop: 12,
  },
  roadmapTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  roadmapContent: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
  },
  roadmapUnits: {
    marginTop: 8,
  },
  roadmapUnit: {
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  unitName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  unitDetails: {
    fontSize: 10,
    color: '#666',
    lineHeight: 14,
  },
  moreUnits: {
    fontSize: 10,
    color: '#38B6FF',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Course Outline Styles
  courseOutlinePreview: {
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
    paddingTop: 12,
    marginTop: 8,
  },
  outlineTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  outlineContent: {
    gap: 8,
  },
  outlineSection: {
    marginBottom: 8,
  },
  outlineSectionTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    backgroundColor: '#E5F3FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 9,
    color: '#38B6FF',
    fontWeight: '500',
  },
  moreTags: {
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
    alignSelf: 'center',
    marginLeft: 4,
  },
  // Schedule Optimization Styles
  optimizationSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optimizationTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  optimizationStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#38B6FF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.25)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 24,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  holidayName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#FF6B6B',
    marginBottom: 4,
  },
  holidayDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  classDayInfo: {
    fontSize: 16,
    color: '#38B6FF',
    marginBottom: 8,
  },
  classDayNotes: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  childItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  childName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  childDetails: {
    fontSize: 14,
    color: '#666',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#666666',
    marginTop: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 32,
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  planButton: {
    backgroundColor: '#38B6FF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
  },
  planButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  planNewButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  planNewButtonHover: {
    backgroundColor: '#000000',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(26, 26, 26, 0.2)',
  },
  planNewButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  // Learning Tracks Styles
  learningTracksSection: {
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  tracksContainer: {
    marginBottom: 20,
  },
  trackCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginRight: 16,
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  trackName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  trackSchedule: {
    fontSize: 14,
    color: '#38B6FF',
    marginBottom: 4,
  },
  trackDays: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  trackStatus: {
    marginBottom: 12,
  },
  statusBadge: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  roadmapPreview: {
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
    paddingTop: 12,
  },
  roadmapTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  roadmapContent: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
  },
  roadmapUnits: {
    marginTop: 8,
  },
  roadmapUnit: {
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  unitName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  unitDetails: {
    fontSize: 10,
    color: '#666',
    lineHeight: 14,
  },
  moreUnits: {
    fontSize: 10,
    color: '#38B6FF',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Course Outline Styles
  courseOutlinePreview: {
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
    paddingTop: 12,
    marginTop: 8,
  },
  outlineTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  outlineContent: {
    gap: 8,
  },
  outlineSection: {
    marginBottom: 8,
  },
  outlineSectionTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    backgroundColor: '#E5F3FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 9,
    color: '#38B6FF',
    fontWeight: '500',
  },
  moreTags: {
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
    alignSelf: 'center',
    marginLeft: 4,
  },
  // Schedule Optimization Styles
  optimizationSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optimizationTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  optimizationStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#38B6FF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  
  // Calendar Chip Styles
  dayChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 2,
    marginTop: 4,
  },
  chipHoliday: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'center',
  },
  chipLessons: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'center',
  },
  chipActivities: {
    backgroundColor: '#FF9800',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'center',
  },
  chipClassDay: {
    backgroundColor: '#38B6FF',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  chipCount: {
    fontSize: 8,
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 2,
  },
  
  // Lesson and Activity Styles
  lessonItem: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  lessonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  lessonSummary: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  lessonContent: {
    fontSize: 12,
    color: '#333',
    marginBottom: 6,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  progressValue: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
  },
  activityItem: {
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  activityName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  activityType: {
    fontSize: 12,
    color: '#FF9800',
    marginBottom: 4,
    fontWeight: '500',
  },
  activityAnalysis: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
});
