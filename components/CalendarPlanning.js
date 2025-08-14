import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { supabase } from '../lib/supabase';

export default function CalendarPlanning({ familyId, academicYear, showOnboardingBanner = false, onBack = null }) {
  // Academic year state
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [yearName, setYearName] = useState('');
  const [planningType, setPlanningType] = useState('year-round'); // 'year-round', 'days', 'hours'
  const [totalDays, setTotalDays] = useState('');
  const [totalHours, setTotalHours] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('5');
  
  // Teaching days state
  const [selectedDays, setSelectedDays] = useState({
    0: false, // Sunday
    1: true,  // Monday
    2: true,  // Tuesday
    3: true,  // Wednesday
    4: true,  // Thursday
    5: true,  // Friday
    6: false  // Saturday
  });
  
  // Calendar state
  const [markedDates, setMarkedDates] = useState({});
  const [vacationDates, setVacationDates] = useState({});
  const [holidayDates, setHolidayDates] = useState({});
  const [classDayRecords, setClassDayRecords] = useState([]);
  
  // UI state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAcademicYear, setCurrentAcademicYear] = useState(null);
  const [showBanner, setShowBanner] = useState(showOnboardingBanner);

  // Day names for display
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayAbbrevs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    if (familyId) {
      console.log('🚀 CalendarPlanning mounted with familyId:', familyId);
      console.log('🔐 Checking Supabase auth status...');
      
      // Check auth status
      supabase.auth.getSession().then(({ data, error }) => {
        if (error) {
          console.error('❌ Auth error:', error);
        } else {
          console.log('✅ Auth session:', data.session ? 'Active' : 'No session');
          console.log('👤 User ID:', data.session?.user?.id);
        }
      });
      
      fetchCurrentAcademicYear();
      fetchTypicalHolidays();
    } else {
      console.log('⚠️ No familyId provided to CalendarPlanning');
    }
  }, [familyId]);

  useEffect(() => {
    if (startDate) {
      calculateEndDate();
    }
  }, [startDate, planningType, totalDays, totalHours, hoursPerDay]);

  useEffect(() => {
    updateMarkedDates();
  }, [startDate, endDate, selectedDays, vacationDates, holidayDates]);

  const fetchCurrentAcademicYear = async () => {
    try {
      console.log('🔍 Fetching academic year for familyId:', familyId);
      
      // Check if user is authenticated first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('🔐 Session check result:', { session: !!session, error: sessionError });
      
      if (sessionError || !session) {
        console.log('⚠️ User not authenticated, skipping database call');
        return;
      }
      
      console.log('👤 User authenticated, attempting database query...');
      console.log('🔑 User ID:', session.user.id);
      console.log('📧 User email:', session.user.email);
      
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .eq('family_id', familyId)
        .eq('is_current', true)
        .single();

      console.log('📊 Query result:', { data, error });
      
      if (error) {
        console.error('❌ Error fetching academic year:', error);
        console.log('🔍 Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        
        if (error.code === '42501') {
          console.log('🔧 Permission denied - RLS policies need to be fixed');
          console.log('💡 This is a database configuration issue, not a user issue');
          console.log('🔗 Try running the SQL fix in Supabase dashboard');
        }
        return;
      }

      console.log('✅ Academic year fetched successfully:', data);
      setCurrentAcademicYear(data);
      if (data) setShowBanner(false);
    } catch (error) {
      console.error('❌ Exception in fetchCurrentAcademicYear:', error);
    }
  };

  const fetchTypicalHolidays = async () => {
    try {
      console.log('🔍 Fetching typical holidays');
      
      // Check if user is authenticated first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('🔐 Session check for holidays:', { session: !!session, error: sessionError });
      
      if (sessionError || !session) {
        console.log('⚠️ User not authenticated, using mock data');
        
        // Mock holiday data for testing
        const mockHolidays = [
          { holiday_name: 'New Year\'s Day', holiday_type: 'fixed', month: 1, day: 1 },
          { holiday_name: 'Independence Day', holiday_type: 'fixed', month: 7, day: 4 },
          { holiday_name: 'Christmas Day', holiday_type: 'fixed', month: 12, day: 25 }
        ];
        
        const mockCurrentYear = new Date().getFullYear();
        const mockHolidayDates = {};
        
        mockHolidays.forEach(holiday => {
          if (holiday.holiday_type === 'fixed' && holiday.month && holiday.day) {
            const dateString = `${mockCurrentYear}-${holiday.month.toString().padStart(2, '0')}-${holiday.day.toString().padStart(2, '0')}`;
            mockHolidayDates[dateString] = holiday.holiday_name;
          }
        });

        console.log('📅 Mock holiday dates:', mockHolidayDates);
        setHolidayDates(mockHolidayDates);
        return;
      }
      
      console.log('👤 User authenticated for holidays, attempting database query...');
      
      // Use global_official_holidays instead of typical_holidays
      const { data, error } = await supabase
        .from('global_official_holidays')
        .select('id, name, holiday_date');

      console.log('📊 Holidays query result:', { data, error });

      if (error) {
        console.error('❌ Error fetching typical holidays:', error);
        console.log('🔍 Holiday error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        
        if (error.code === '42501') {
          console.log('🔧 Holiday permission denied - RLS policies need to be fixed');
          console.log('💡 This is a database configuration issue, not a user issue');
          console.log('🔗 Try running the SQL fix in Supabase dashboard');
        }
        return;
      }

      console.log('✅ Global official holidays data:', data);

      // Map rows to YYYY-MM-DD: name
      const holidayDates = {};
      (data || []).forEach(h => {
        const dateString = new Date(h.holiday_date).toISOString().split('T')[0];
        holidayDates[dateString] = h.name;
      });

      console.log('📅 Processed holiday dates:', holidayDates);
      setHolidayDates(holidayDates);
    } catch (error) {
      console.error('❌ Exception in fetchTypicalHolidays:', error);
    }
  };

  const fetchClassDays = async (academicYearId) => {
    try {
      // Check if user is authenticated first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.log('⚠️ User not authenticated, skipping class days fetch');
        return;
      }
      
      const { data, error } = await supabase
        .from('class_day_mappings')
        .select('*')
        .eq('academic_year_id', academicYearId);

      if (error) {
        console.error('Error fetching class days:', error);
        return;
      }

      setClassDayRecords(data || []);
    } catch (error) {
      console.error('Error fetching class days:', error);
    }
  };

  const fetchHolidays = async (academicYearId) => {
    try {
      // Check if user is authenticated first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.log('⚠️ User not authenticated, skipping holidays fetch');
        return;
      }
      
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .eq('academic_year_id', academicYearId);

      if (error) {
        console.error('Error fetching holidays:', error);
        return;
      }

      const holidayDates = {};
      data.forEach(holiday => {
        holidayDates[holiday.holiday_date] = holiday.holiday_name;
      });

      setHolidayDates(holidayDates);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  };

  const calculateEndDate = () => {
    if (!startDate) return;

    const start = new Date(startDate);
    let end;

    switch (planningType) {
      case 'year-round':
        // One year from start date
        end = new Date(start);
        end.setFullYear(end.getFullYear() + 1);
        break;
      case 'days':
        if (totalDays) {
          end = new Date(start);
          let daysAdded = 0;
          let currentDate = new Date(start);
          
          while (daysAdded < parseInt(totalDays)) {
            const dayOfWeek = currentDate.getDay();
            if (selectedDays[dayOfWeek] && !isVacationOrHoliday(currentDate)) {
              daysAdded++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }
          end = new Date(currentDate);
        }
        break;
      case 'hours':
        if (totalHours && hoursPerDay) {
          const daysNeeded = Math.ceil(parseInt(totalHours) / parseFloat(hoursPerDay));
          end = new Date(start);
          let daysAdded = 0;
          let currentDate = new Date(start);
          
          while (daysAdded < daysNeeded) {
            const dayOfWeek = currentDate.getDay();
            if (selectedDays[dayOfWeek] && !isVacationOrHoliday(currentDate)) {
              daysAdded++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }
          end = new Date(currentDate);
        }
        break;
    }

    if (end) {
      setEndDate(end.toISOString().split('T')[0]);
    }
  };

  const isVacationOrHoliday = (date) => {
    const dateString = date.toISOString().split('T')[0];
    return vacationDates[dateString] || holidayDates[dateString];
  };

  const updateMarkedDates = () => {
    const marked = {};
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const current = new Date(start);

      while (current <= end) {
        const dateString = current.toISOString().split('T')[0];
        const dayOfWeek = current.getDay();
        const isTeachingDay = selectedDays[dayOfWeek];
        const isVacation = vacationDates[dateString];
        const isHoliday = holidayDates[dateString];

        if (isTeachingDay && !isVacation && !isHoliday) {
          marked[dateString] = {
            selected: true,
            selectedColor: '#38B6FF',
            marked: true,
            dotColor: '#38B6FF'
          };
        } else if (isVacation) {
          marked[dateString] = {
            selected: true,
            selectedColor: '#FF6B6B',
            marked: true,
            dotColor: '#FF6B6B'
          };
        } else if (isHoliday) {
          marked[dateString] = {
            selected: true,
            selectedColor: '#FFD93D',
            marked: true,
            dotColor: '#FFD93D'
          };
        } else {
          marked[dateString] = {
            selected: true,
            selectedColor: '#E0E0E0',
            textColor: '#999'
          };
        }

        current.setDate(current.getDate() + 1);
      }
    }

    setMarkedDates(marked);
  };

  const handleDayPress = (day) => {
    const dateString = day.dateString;
    const date = new Date(dateString);
    const dayOfWeek = date.getDay();

    // Can only toggle vacation on teaching days
    if (!selectedDays[dayOfWeek]) {
      Alert.alert('Not a Teaching Day', 'You can only set vacations on teaching days.');
      return;
    }

    // Toggle vacation status
    setVacationDates(prev => {
      const updated = { ...prev };
      if (updated[dateString]) {
        delete updated[dateString];
      } else {
        updated[dateString] = 'Vacation';
      }
      return updated;
    });
  };

  const toggleTeachingDay = (dayOfWeek) => {
    setSelectedDays(prev => ({
      ...prev,
      [dayOfWeek]: !prev[dayOfWeek]
    }));
  };

  const saveAcademicYear = async () => {
    if (!startDate || !yearName) {
      Alert.alert('Missing Information', 'Please fill in the start date and year name.');
      return;
    }

    console.log('💾 Saving academic year...');
    console.log('📝 Data to save:', {
      familyId,
      yearName,
      startDate,
      endDate,
      totalDays,
      totalHours,
      hoursPerDay
    });

    // TEMPORARY: Test save function without database
    console.log('⚠️ TEMPORARILY SKIPPING DATABASE SAVE - Testing save function');
    Alert.alert('Test Save', 'Save function triggered successfully! (Database save disabled for testing)');
    setIsLoading(false);
    // return;

    setIsLoading(true);

    try {
      let academicYearId = currentAcademicYear?.id;

      if (!academicYearId) {
        console.log('🆕 Creating new academic year');
        // Create new academic year
        const { data, error } = await supabase
          .from('academic_years')
          .insert({
            family_id: familyId,
            year_name: yearName,
            start_date: startDate,
            end_date: endDate,
            total_days: totalDays ? parseInt(totalDays) : null,
            total_hours: totalHours ? parseInt(totalHours) : null,
            hours_per_day: hoursPerDay ? parseFloat(hoursPerDay) : null,
            is_current: true
          })
          .select()
          .single();

        if (error) {
          console.error('❌ Error creating academic year:', error);
          throw error;
        }
        
        console.log('✅ Academic year created:', data);
        academicYearId = data.id;
        setCurrentAcademicYear(data);
        setShowBanner(false);
      } else {
        console.log('🔄 Updating existing academic year:', academicYearId);
        // Update existing academic year
        const { error } = await supabase
          .from('academic_years')
          .update({
            year_name: yearName,
            start_date: startDate,
            end_date: endDate,
            total_days: totalDays ? parseInt(totalDays) : null,
            total_hours: totalHours ? parseInt(totalHours) : null,
            hours_per_day: hoursPerDay ? parseFloat(hoursPerDay) : null
          })
          .eq('id', academicYearId);

        if (error) {
          console.error('❌ Error updating academic year:', error);
          throw error;
        }
        
        console.log('✅ Academic year updated');
        setShowBanner(false);
      }

      // Save class days
      console.log('📅 Saving class days...');
      await saveClassDays(academicYearId);
      
      // Save holidays
      console.log('🎉 Saving holidays...');
      await saveHolidays(academicYearId);

      console.log('✅ Academic year saved successfully!');
      Alert.alert('Success', 'Academic year saved successfully!');
    } catch (error) {
      console.error('❌ Error saving academic year:', error);
      Alert.alert('Error', 'Failed to save academic year: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveClassDays = async (academicYearId) => {
    // Clear existing class days
    await supabase
      .from('class_day_mappings')
      .delete()
      .eq('academic_year_id', academicYearId);

    // Generate new class day mappings
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);
    let classDayNumber = 0;
    const classDayRecords = [];

    while (current <= end) {
      const dateString = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();
      const isTeachingDay = selectedDays[dayOfWeek];
      const isVacation = vacationDates[dateString];
      const isHoliday = holidayDates[dateString];

      if (isTeachingDay && !isVacation && !isHoliday) {
        classDayNumber++;
        classDayRecords.push({
          academic_year_id: academicYearId,
          class_date: dateString,
          class_day_number: classDayNumber,
          is_vacation: false
        });
      } else if (isTeachingDay && (isVacation || isHoliday)) {
        classDayRecords.push({
          academic_year_id: academicYearId,
          class_date: dateString,
          class_day_number: null,
          is_vacation: true
        });
      }

      current.setDate(current.getDate() + 1);
    }

    if (classDayRecords.length > 0) {
      const { error } = await supabase
        .from('class_day_mappings')
        .insert(classDayRecords);

      if (error) throw error;
    }
  };

  const saveHolidays = async (academicYearId) => {
    // Clear existing holidays
    await supabase
      .from('holidays')
      .delete()
      .eq('academic_year_id', academicYearId);

    // Save new holidays
    const holidayRecords = Object.entries(holidayDates).map(([date, name]) => ({
      academic_year_id: academicYearId,
      holiday_name: name,
      holiday_date: date,
      is_proposed: false
    }));

    if (holidayRecords.length > 0) {
      const { error } = await supabase
        .from('holidays')
        .insert(holidayRecords);

      if (error) throw error;
    }
  };

  const renderTeachingDays = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Teaching Days</Text>
      <Text style={styles.sectionSubtitle}>Select which days of the week you have classes</Text>
      
      <View style={styles.daysContainer}>
        {dayNames.map((day, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.dayButton,
              selectedDays[index] && styles.dayButtonSelected
            ]}
            onPress={() => toggleTeachingDay(index)}
          >
            <Text style={[
              styles.dayButtonText,
              selectedDays[index] && styles.dayButtonTextSelected
            ]}>
              {dayAbbrevs[index]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderPlanningOptions = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Planning Options</Text>
      
      <View style={styles.planningTypeContainer}>
        <TouchableOpacity
          style={[
            styles.planningTypeButton,
            planningType === 'year-round' && styles.planningTypeButtonSelected
          ]}
          onPress={() => setPlanningType('year-round')}
        >
          <Text style={[
            styles.planningTypeText,
            planningType === 'year-round' && styles.planningTypeTextSelected
          ]}>
            Year-Round
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.planningTypeButton,
            planningType === 'days' && styles.planningTypeButtonSelected
          ]}
          onPress={() => setPlanningType('days')}
        >
          <Text style={[
            styles.planningTypeText,
            planningType === 'days' && styles.planningTypeTextSelected
          ]}>
            Total Days
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.planningTypeButton,
            planningType === 'hours' && styles.planningTypeButtonSelected
          ]}
          onPress={() => setPlanningType('hours')}
        >
          <Text style={[
            styles.planningTypeText,
            planningType === 'hours' && styles.planningTypeTextSelected
          ]}>
            Total Hours
          </Text>
        </TouchableOpacity>
      </View>

      {planningType === 'days' && (
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Total Days</Text>
          <TextInput
            style={styles.input}
            value={totalDays}
            onChangeText={setTotalDays}
            placeholder="e.g., 180"
            keyboardType="numeric"
          />
        </View>
      )}

      {planningType === 'hours' && (
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Total Hours</Text>
          <TextInput
            style={styles.input}
            value={totalHours}
            onChangeText={setTotalHours}
            placeholder="e.g., 900"
            keyboardType="numeric"
          />
          <Text style={styles.inputLabel}>Hours per Day</Text>
          <TextInput
            style={styles.input}
            value={hoursPerDay}
            onChangeText={setHoursPerDay}
            placeholder="e.g., 5"
            keyboardType="numeric"
          />
        </View>
      )}
    </View>
  );

  const renderCalendar = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Academic Calendar</Text>
      <Text style={styles.sectionSubtitle}>
        Tap on teaching days to mark them as vacation. Blue = teaching day, Red = vacation, Yellow = holiday
      </Text>
      
      <Calendar
        onDayPress={handleDayPress}
        markedDates={markedDates}
        firstDay={0}
        theme={{
          selectedDayBackgroundColor: '#38B6FF',
          selectedDayTextColor: '#ffffff',
          todayTextColor: '#38B6FF',
          dayTextColor: '#2d4150',
          textDisabledColor: '#d9e1e8',
          dotColor: '#38B6FF',
          selectedDotColor: '#ffffff',
          arrowColor: '#38B6FF',
          monthTextColor: '#2d4150',
          indicatorColor: '#38B6FF',
          textDayFontWeight: '300',
          textMonthFontWeight: 'bold',
          textDayHeaderFontWeight: '300',
          textDayFontSize: 16,
          textMonthFontSize: 16,
          textDayHeaderFontSize: 13
        }}
      />
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <View style={styles.header}>
          {onBack && (
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Text style={styles.backButtonText}>← Back to Calendar</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.title}>Academic Calendar Planning</Text>
        </View>
        {showBanner && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Great job setting subjects! 🎉</Text>
            <Text style={styles.bannerText}>Next, set your start date and pick teaching days. We’ll mark US holidays automatically.</Text>
          </View>
        )}
        <Text style={styles.subtitle}>Set up your academic year, teaching days, and holidays</Text>

        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Year Name</Text>
            <TextInput
              style={styles.input}
              value={yearName}
              onChangeText={setYearName}
              placeholder="e.g., 2024-2025 Academic Year"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Start Date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {startDate || 'Select Start Date'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Date Picker Modal */}
          <Modal
            visible={showDatePicker}
            transparent={true}
            animationType="slide"
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Start Date</Text>
                <DatePicker
                  selected={startDate ? new Date(startDate) : new Date()}
                  onChange={(date) => {
                    setStartDate(date.toISOString().split('T')[0]);
                    setShowDatePicker(false);
                  }}
                  inline
                  minDate={new Date()}
                />
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowDatePicker(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {endDate && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>End Date (Calculated)</Text>
              <Text style={styles.calculatedDate}>{endDate}</Text>
            </View>
          )}
        </View>

        {renderTeachingDays()}
        {renderPlanningOptions()}
        {renderCalendar()}

        <TouchableOpacity
          style={[styles.saveButton, isLoading && styles.disabledButton]}
          onPress={saveAcademicYear}
          disabled={isLoading}
        >
          <Text style={styles.saveButtonText}>
            {isLoading ? 'Saving...' : 'Save Academic Year'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#38B6FF',
    fontWeight: '500',
  },
  banner: {
    backgroundColor: '#E9F6FF',
    borderColor: '#38B6FF',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  bannerTitle: { fontWeight: '700', color: '#0c7ac9', marginBottom: 4 },
  bannerText: { color: '#0c7ac9' },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    flex: 1,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
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
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  calculatedDate: {
    fontSize: 16,
    color: '#38B6FF',
    fontWeight: '500',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dayButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  dayButtonSelected: {
    borderColor: '#38B6FF',
    backgroundColor: '#38B6FF',
  },
  dayButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  dayButtonTextSelected: {
    color: '#fff',
  },
  planningTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  planningTypeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginHorizontal: 4,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  planningTypeButtonSelected: {
    borderColor: '#38B6FF',
    backgroundColor: '#38B6FF',
  },
  planningTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  planningTypeTextSelected: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#38B6FF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
}); 