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
import { Calendar } from 'react-native-calendars';
import { supabase } from '../lib/supabase';



export default function CalendarView({ familyId, selectedChildId = null, onChildSelect = null, onPlanNew = null }) {
  // State for calendar data
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [markedDates, setMarkedDates] = useState({});
  const [classDayMappings, setClassDayMappings] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [learningTracks, setLearningTracks] = useState([]);
  const [children, setChildren] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showYearSelector, setShowYearSelector] = useState(false);
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();

      if (profile?.family_id) {
        const { data: childrenData } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', profile.family_id);

        if (childrenData) {
          setChildren(childrenData);
        }
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();

      if (profile?.family_id) {
        console.log('Profile family_id:', profile.family_id);
        
        const { data: years, error } = await supabase
          .from('academic_years')
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
      } else {
        console.log('No family_id in profile');
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
      
      // Fetch class day mappings (actual calendar dates)
      const { data: mappingsData } = await supabase
        .from('class_day_mappings')
        .select('*')
        .eq('academic_year_id', selectedYear.id)
        .order('class_date', { ascending: true });

      if (mappingsData) {
        setClassDayMappings(mappingsData);
        console.log('Class day mappings loaded:', mappingsData.length);
      }

      // Initialize holidays data
      let holidaysData = [];

      // Fetch holidays using family_year_id
      // First get the family_year record
      console.log('Looking for family_year with family_id:', selectedYear.family_id, 'global_year_id:', selectedYear.global_year_id);
      
      const { data: familyYear, error: familyYearError } = await supabase
        .from('family_years')
        .select('id')
        .eq('family_id', selectedYear.family_id)
        .eq('global_year_id', selectedYear.global_year_id)
        .single();

      if (familyYearError) {
        console.error('Error fetching family_year:', familyYearError);
        // Try alternative approach - look for any family_year for this family
        const { data: altFamilyYear } = await supabase
          .from('family_years')
          .select('id')
          .eq('family_id', selectedYear.family_id)
          .limit(1)
          .single();
        
        if (altFamilyYear) {
          console.log('Found alternative family_year:', altFamilyYear.id);
          const { data: holidaysResult } = await supabase
            .from('holidays')
            .select('*')
            .eq('family_year_id', altFamilyYear.id)
            .order('holiday_date', { ascending: true });

          if (holidaysResult) {
            holidaysData = holidaysResult;
            setHolidays(holidaysResult);
            console.log('Holidays loaded (alternative):', holidaysResult.length);
          }
        }
      } else if (familyYear) {
        const { data: holidaysResult } = await supabase
          .from('holidays')
          .select('*')
          .eq('family_year_id', familyYear.id)
          .order('holiday_date', { ascending: true });

        if (holidaysResult) {
          holidaysData = holidaysResult;
          setHolidays(holidaysResult);
          console.log('Holidays loaded:', holidaysResult.length);
        }
      } else {
        console.log('No family_year found for holidays');
      }

      // Update marked dates
      updateMarkedDates(mappingsData || [], holidaysData);
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

  const updateMarkedDates = (mappingsData, holidaysData) => {
    const newMarkedDates = {};

    // Mark class days from class_day_mappings
    mappingsData.forEach(mapping => {
      if (mapping.class_date) {
        const dateStr = mapping.class_date;
        newMarkedDates[dateStr] = {
          marked: true,
          dotColor: mapping.is_vacation ? '#FF6B6B' : '#38B6FF',
          textColor: '#333',
          selected: false,
          customStyles: {
            container: {
              backgroundColor: mapping.is_vacation ? '#FFE5E5' : '#E5F3FF',
            }
          }
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
          }
        };
      }
    });

    setMarkedDates(newMarkedDates);
    console.log('Marked dates updated:', Object.keys(newMarkedDates).length);
  };

  const handleDayPress = (day) => {
    const date = day.dateString;
    const classDayMapping = classDayMappings.find(m => m.class_date === date);
    const holiday = holidays.find(h => h.holiday_date === date);

    if (classDayMapping || holiday) {
      setSelectedDate(date);
      setDayDetails({
        date,
        classDayMapping,
        holiday,
        children: children.filter(c => !selectedChildId || c.id === selectedChildId)
      });
      setShowDayDetails(true);
    }
  };

  const handleClickOutside = () => {
    if (showYearSelector) {
      setShowYearSelector(false);
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
    console.log('Available children:', children.map(c => ({ id: c.id, name: c.name })));
    console.log('All learning tracks:', learningTracks.map(t => t.name));
    
    if (!localSelectedChildId) {
      console.log('No child selected, returning all tracks');
      return learningTracks;
    }
    
    // Filter tracks based on child name in track name
    const filtered = learningTracks.filter(track => {
      const childName = children.find(c => c.id === localSelectedChildId)?.name;
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

  const renderYearSelector = () => (
    <Pressable onPress={handleClickOutside} style={styles.yearSelector}>
        <TouchableOpacity 
          style={[
            styles.yearButton,
            academicYears.length > 1 && styles.yearButtonClickable
          ]}
          onPress={() => {
            // Only show dropdown if there are multiple years
            if (academicYears.length > 1) {
              setShowYearSelector(!showYearSelector);
            }
          }}
        >
          <Text style={styles.yearButtonText}>
            {selectedYear ? `${selectedYear.year_name || selectedYear.start_date}` : 'Loading...'}
          </Text>
          {academicYears.length > 1 && (
            <Text style={styles.yearButtonArrow}>▼</Text>
          )}
        </TouchableOpacity>

        {academicYears.length === 1 && (
          <Text style={styles.singleYearNote}>Only one academic year available</Text>
        )}

        {showYearSelector && academicYears.length > 1 && (
          <View style={styles.yearDropdown}>
            {academicYears.map((year) => (
              <TouchableOpacity
                key={year.id}
                style={[
                  styles.yearOption,
                  selectedYear?.id === year.id && styles.yearOptionSelected
                ]}
                onPress={() => {
                  setSelectedYear(year);
                  setShowYearSelector(false);
                }}
              >
                <Text style={[
                  styles.yearOptionText,
                  selectedYear?.id === year.id && styles.yearOptionTextSelected
                ]}>
                  {year.year_name || `${year.start_date} - ${year.end_date}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Pressable>
    );

  const renderChildFilter = () => (
    <View style={styles.childFilter}>
      <Text style={styles.filterLabel}>Filter by child:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            !localSelectedChildId && styles.filterChipActive
          ]}
          onPress={() => handleChildSelect(null)}
        >
          <Text style={[
            styles.filterChipText,
            !localSelectedChildId && styles.filterChipTextActive
          ]}>
            All Children
          </Text>
        </TouchableOpacity>
        {children.map((child) => (
          <TouchableOpacity
            key={child.id}
            style={[
              styles.filterChip,
              localSelectedChildId === child.id && styles.filterChipActive
            ]}
            onPress={() => handleChildSelect(child.id)}
          >
            <Text style={[
              styles.filterChipText,
              localSelectedChildId === child.id && styles.filterChipTextActive
            ]}>
              {child.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderCalendar = () => (
    <View style={styles.calendarContainer}>
      <Calendar
        onDayPress={handleDayPress}
        markedDates={markedDates}
        theme={{
          calendarBackground: '#ffffff',
          textSectionTitleColor: '#333',
          selectedDayBackgroundColor: '#38B6FF',
          selectedDayTextColor: '#ffffff',
          todayTextColor: '#38B6FF',
          dayTextColor: '#333',
          textDisabledColor: '#d9e1e8',
          dotColor: '#38B6FF',
          selectedDotColor: '#ffffff',
          arrowColor: '#38B6FF',
          monthTextColor: '#333',
          indicatorColor: '#38B6FF',
          textDayFontWeight: '300',
          textMonthFontWeight: 'bold',
          textDayHeaderFontWeight: '500',
          textDayFontSize: 16,
          textMonthFontSize: 16,
          textDayHeaderFontSize: 13
        }}
      />
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
              <View key={index} style={styles.roadmapUnit}>
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
                    <View key={index} style={styles.tag}>
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
                    <View key={index} style={styles.tag}>
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

  const renderLearningTracks = () => {
    const filteredTracks = getFilteredLearningTracks();
    const activeChild = children.find(c => c.id === localSelectedChildId);
    
    return (
      <View style={styles.learningTracksSection}>
        <Text style={styles.sectionTitle}>Learning Tracks & Schedule</Text>
        <Text style={styles.sectionSubtitle}>
          {localSelectedChildId 
            ? `${filteredTracks.length} active learning tracks for ${activeChild?.name || 'selected child'}`
            : `${filteredTracks.length} active learning tracks for ${children.length} children`
          }
        </Text>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tracksContainer}>
          {filteredTracks.map((track) => (
          <View key={track.id} style={styles.trackCard}>
            <Text style={styles.trackName}>{track.name}</Text>
            <Text style={styles.trackSchedule}>{track.class_schedule}</Text>
            <Text style={styles.trackDays}>{track.study_days}</Text>
            <View style={styles.trackStatus}>
              <Text style={[styles.statusBadge, { backgroundColor: track.status === 'active' ? '#4CAF50' : '#FF9800' }]}>
                {track.status}
              </Text>
            </View>
            {track.roadmap && (
              <View style={styles.roadmapPreview}>
                <Text style={styles.roadmapTitle}>Learning Roadmap:</Text>
                {renderRoadmapUnits(track.roadmap)}
              </View>
            )}
            
            {track.course_outline && (
              <View style={styles.courseOutlinePreview}>
                <Text style={styles.outlineTitle}>Course Focus:</Text>
                {renderCourseOutline(track.course_outline)}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Schedule Optimization Summary */}
      <View style={styles.optimizationSection}>
        <Text style={styles.optimizationTitle}>Schedule Optimization</Text>
        <View style={styles.optimizationStats}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{classDayMappings.filter(m => !m.is_vacation).length}</Text>
            <Text style={styles.statLabel}>School Days</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{holidays.length}</Text>
            <Text style={styles.statLabel}>Holidays</Text>
          </View>
                      <View style={styles.statItem}>
              <Text style={styles.statNumber}>{filteredTracks.length}</Text>
              <Text style={styles.statLabel}>Learning Tracks</Text>
            </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {Math.round((classDayMappings.filter(m => !m.is_vacation).length / 180) * 100)}%
            </Text>
            <Text style={styles.statLabel}>Year Progress</Text>
          </View>
        </View>
      </View>
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
                <Text style={styles.holidayName}>{dayDetails.holiday.name}</Text>
                {dayDetails.holiday.description && (
                  <Text style={styles.holidayDescription}>{dayDetails.holiday.description}</Text>
                )}
              </View>
            )}

            {dayDetails?.classDayMapping && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Class Day</Text>
                <Text style={styles.classDayInfo}>
                  {dayDetails.classDayMapping.hours_per_day || '6'} hours scheduled
                </Text>
                {dayDetails.classDayMapping.notes && (
                  <Text style={styles.classDayNotes}>{dayDetails.classDayMapping.notes}</Text>
                )}
              </View>
            )}

            {dayDetails?.children && dayDetails.children.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Children</Text>
                {dayDetails.children.map((child) => (
                  <View key={child.id} style={styles.childItem}>
                    <Text style={styles.childName}>{child.name}</Text>
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Calendar View</Text>
            <Text style={styles.subtitle}>View and interact with your saved calendars</Text>
          </View>
          <TouchableOpacity 
            style={styles.planNewButton}
            onPress={() => {
              if (onPlanNew) {
                onPlanNew();
              } else {
                Alert.alert(
                  'Calendar Planning',
                  'To create a new calendar, please use the Calendar Planning tab in the main navigation.',
                  [{ text: 'OK' }]
                );
              }
            }}
          >
            <Text style={styles.planNewButtonText}>Plan New</Text>
          </TouchableOpacity>
          

        </View>
      </View>

      <ScrollView 
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
      >
        {renderChildFilter()}
        {renderYearSelector()}
        {renderCalendar()}
        {renderLearningTracks()}
      </ScrollView>
      
      {renderDayDetailsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  childFilter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  filterChipActive: {
    borderColor: '#38B6FF',
    backgroundColor: '#E9F6FF',
  },
  filterChipText: {
    fontSize: 14,
    color: '#666',
  },
  filterChipTextActive: {
    color: '#38B6FF',
    fontWeight: '600',
  },
  yearSelector: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: 'relative',
  },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  yearButtonClickable: {
    cursor: 'pointer',
    borderColor: '#38B6FF',
  },
  singleYearNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  yearButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  yearButtonArrow: {
    fontSize: 12,
    color: '#666',
  },
  yearDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    marginTop: 4,
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
    zIndex: 1000,
  },
  yearOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  yearOptionSelected: {
    backgroundColor: '#E9F6FF',
  },
  yearOptionText: {
    fontSize: 16,
    color: '#333',
  },
  yearOptionTextSelected: {
    color: '#38B6FF',
    fontWeight: '600',
  },
  calendarContainer: {
    flex: 1,
    paddingHorizontal: 20,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
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
    backgroundColor: '#38B6FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  planNewButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
});
