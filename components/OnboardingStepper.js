import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Switch,
  Modal,
  FlatList,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function OnboardingStepper({ onComplete }) {
  const { signUp, signIn, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modal states
  const [showGradePicker, setShowGradePicker] = useState(false);
  const [showStandardsPicker, setShowStandardsPicker] = useState(false);
  const [showLearningStylePicker, setShowLearningStylePicker] = useState(false);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentDateField, setCurrentDateField] = useState('');

  // Family Information
  const [familyCity, setFamilyCity] = useState('');
  const [familyState, setFamilyState] = useState('');
  const [familyCountry, setFamilyCountry] = useState('');

  // Children Information
  const [children, setChildren] = useState([]);
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [childGrade, setChildGrade] = useState('');
  const [childStandards, setChildStandards] = useState('');
  const [childInterests, setChildInterests] = useState('');
  const [childStyle, setChildStyle] = useState('');
  const [childCollegeBound, setChildCollegeBound] = useState(false);
  
  // Academic Year Information
  const [startDate, setStartDate] = useState('');
  const [totalDays, setTotalDays] = useState('');
  const [totalHours, setTotalHours] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('');
  const [teachingDays, setTeachingDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri default
  
  // Subjects Information
  const [subjects, setSubjects] = useState([]);
  const [subjectName, setSubjectName] = useState('');
  const [subjectGrade, setSubjectGrade] = useState('');
  const [subjectNotes, setSubjectNotes] = useState('');
  const [selectedChildForSubject, setSelectedChildForSubject] = useState('0');
  
  // Activities Information
  const [activities, setActivities] = useState([]);
  const [activityName, setActivityName] = useState('');
  const [activityPlatform, setActivityPlatform] = useState('');
  const [activityLink, setActivityLink] = useState('');
  const [activityStartDate, setActivityStartDate] = useState('');
  const [activityEndDate, setActivityEndDate] = useState('');
  const [activityStudyDays, setActivityStudyDays] = useState('');
  const [activityTravelMinutes, setActivityTravelMinutes] = useState('');
  const [activityClassSchedule, setActivityClassSchedule] = useState('');
  const [activityInitialPlan, setActivityInitialPlan] = useState('');
  const [selectedChildrenForActivity, setSelectedChildrenForActivity] = useState([]);
  const [selectedSubjectsForActivity, setSelectedSubjectsForActivity] = useState([]);
  
  // Account Information
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Predefined options
  const gradeOptions = [
    'Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', 
    '5th Grade', '6th Grade', '7th Grade', '8th Grade', '9th Grade', '10th Grade', 
    '11th Grade', '12th Grade', 'College Freshman', 'College Sophomore', 
    'College Junior', 'College Senior'
  ];

  const standardsOptions = [
    'Common Core State Standards',
    'Next Generation Science Standards',
    'State Standards',
    'International Baccalaureate',
    'Montessori',
    'Waldorf',
    'Classical Education',
    'Charlotte Mason',
    'Unschooling',
    'Other'
  ];

  const learningStyleOptions = [
    'Visual Learner',
    'Auditory Learner',
    'Kinesthetic Learner',
    'Reading/Writing Learner',
    'Social Learner',
    'Solitary Learner',
    'Logical Learner',
    'Naturalistic Learner'
  ];

  const platformOptions = [
    'Khan Academy',
    'Outschool',
    'Local School',
    'Homeschool Co-op',
    'Online Private School',
    'Tutoring Center',
    'Library Program',
    'Community Center',
    'Sports/Activities',
    'Music Lessons',
    'Art Classes',
    'Science Lab',
    'Math Center',
    'Language School',
    'Other'
  ];

  const subjectOptions = [
    'Mathematics',
    'Science',
    'English/Language Arts',
    'History/Social Studies',
    'Foreign Language',
    'Art',
    'Music',
    'Physical Education',
    'Computer Science',
    'Literature',
    'Writing',
    'Reading',
    'Grammar',
    'Spelling',
    'Geography',
    'Civics',
    'Economics',
    'Biology',
    'Chemistry',
    'Physics',
    'Algebra',
    'Geometry',
    'Calculus',
    'Statistics',
    'Other'
  ];

  const interestOptions = [
    'Mathematics', 'Science', 'Reading', 'Writing', 'Art', 'Music', 'Sports',
    'Technology', 'Cooking', 'Gardening', 'Animals', 'Space', 'History',
    'Geography', 'Languages', 'Dance', 'Theater', 'Photography', 'Coding',
    'Engineering', 'Medicine', 'Business', 'Law', 'Teaching', 'Other'
  ];

  // Helper functions
  const openDatePicker = (field) => {
    setCurrentDateField(field);
    setShowDatePicker(true);
  };

  const selectDate = (date) => {
    const formattedDate = date.toISOString().split('T')[0];
    switch (currentDateField) {
      case 'startDate':
        setStartDate(formattedDate);
        break;
      case 'activityStartDate':
        setActivityStartDate(formattedDate);
        break;
      case 'activityEndDate':
        setActivityEndDate(formattedDate);
        break;
    }
    setShowDatePicker(false);
  };

  const getCurrentDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const generateDateOptions = () => {
    const options = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Generate dates for current and next 2 years
    for (let year = currentYear; year <= currentYear + 2; year++) {
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 28; day++) {
          const date = new Date(year, month - 1, day);
          if (date >= today) {
            options.push({
              label: date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              }),
              value: date.toISOString().split('T')[0]
            });
          }
        }
      }
    }
    return options;
  };

  const renderPickerModal = (visible, onClose, title, options, onSelect, currentValue) => (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.optionItem,
                  currentValue === item && styles.selectedOptionItem
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={[
                  styles.optionText,
                  currentValue === item && styles.selectedOptionText
                ]}>
                  {typeof item === 'string' ? item : item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );

  const renderDatePickerModal = () => (
    <Modal
      visible={showDatePicker}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowDatePicker(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Date</Text>
            <TouchableOpacity onPress={() => setShowDatePicker(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={generateDateOptions()}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => selectDate(new Date(item.value))}
              >
                <Text style={styles.optionText}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );

  // Validation functions with specific constraints
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password) => {
    return password.length >= 6 && password.length <= 50;
  };

  const validateAge = (age) => {
    const numAge = parseInt(age);
    return !isNaN(numAge) && numAge >= 0 && numAge <= 25;
  };

  const validateNumeric = (value, min = 0, max = 999) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= min && num <= max;
  };

  const validateDate = (dateString) => {
    // Must be in YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  };

  const validateDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) return true; // Both optional
    const start = new Date(startDate);
    const end = new Date(endDate);
    return start < end;
  };

  const validateURL = (url) => {
    if (!url) return true; // Optional
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateChild = () => {
    if (!childName.trim()) {
      Alert.alert('Validation Error', 'Child name is required');
      return false;
    }
    if (!childAge.trim()) {
      Alert.alert('Validation Error', 'Child age is required');
      return false;
    }
    if (!validateAge(childAge)) {
      Alert.alert('Validation Error', 'Age must be between 0 and 25');
      return false;
    }
    return true;
  };

  const validateAcademicYear = () => {
    if (!startDate.trim()) {
      Alert.alert('Validation Error', 'Start date is required');
      return false;
    }
    if (!validateDate(startDate)) {
      Alert.alert('Validation Error', 'Start date must be in YYYY-MM-DD format (e.g., 2024-09-01)');
      return false;
    }
    if (!totalDays.trim()) {
      Alert.alert('Validation Error', 'Total days is required');
      return false;
    }
    if (!validateNumeric(totalDays, 1, 365)) {
      Alert.alert('Validation Error', 'Total days must be between 1 and 365');
      return false;
    }
    if (!totalHours.trim()) {
      Alert.alert('Validation Error', 'Total hours is required');
      return false;
    }
    if (!validateNumeric(totalHours, 1, 1000)) {
      Alert.alert('Validation Error', 'Total hours must be between 1 and 1000');
      return false;
    }
    if (!hoursPerDay.trim()) {
      Alert.alert('Validation Error', 'Hours per day is required');
      return false;
    }
    if (!validateNumeric(hoursPerDay, 0.1, 12)) {
      Alert.alert('Validation Error', 'Hours per day must be between 0.1 and 12');
      return false;
    }
    return true;
  };

  const validateSubject = () => {
    if (!subjectName.trim()) {
      Alert.alert('Validation Error', 'Subject name is required');
      return false;
    }
    if (children.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one child first');
      return false;
    }
    return true;
  };

  const validateActivity = () => {
    if (!activityName.trim()) {
      Alert.alert('Validation Error', 'Activity name is required');
      return false;
    }
    if (activityStartDate && !validateDate(activityStartDate)) {
      Alert.alert('Validation Error', 'Start date must be in YYYY-MM-DD format (e.g., 2024-09-01)');
      return false;
    }
    if (activityEndDate && !validateDate(activityEndDate)) {
      Alert.alert('Validation Error', 'End date must be in YYYY-MM-DD format (e.g., 2024-06-15)');
      return false;
    }
    if (!validateDateRange(activityStartDate, activityEndDate)) {
      Alert.alert('Validation Error', 'End date must be after start date');
      return false;
    }
    if (activityLink && !validateURL(activityLink)) {
      Alert.alert('Validation Error', 'Please enter a valid URL (e.g., https://example.com)');
      return false;
    }
    if (activityTravelMinutes && !validateNumeric(activityTravelMinutes, 0, 180)) {
      Alert.alert('Validation Error', 'Travel minutes must be between 0 and 180');
      return false;
    }
    return true;
  };

  const validateLogin = () => {
    if (!email.trim()) {
      Alert.alert('Validation Error', 'Email is required');
      return false;
    }
    if (!validateEmail(email)) {
      Alert.alert('Validation Error', 'Please enter a valid email address (e.g., user@example.com)');
      return false;
    }
    if (!password.trim()) {
      Alert.alert('Validation Error', 'Password is required');
      return false;
    }
    if (!validatePassword(password)) {
      Alert.alert('Validation Error', 'Password must be between 6 and 50 characters long');
      return false;
    }
    return true;
  };

  const validateAll = () => {
    if (children.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one child');
      return false;
    }
    if (!validateAcademicYear()) {
      return false;
    }
    if (subjects.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one subject');
      return false;
    }
    if (!validateLogin()) {
      return false;
    }
    return true;
  };

  const handleAddChild = () => {
    if (!validateChild()) return;
    
    setChildren([...children, {
      name: childName,
      age: parseInt(childAge),
      grade: childGrade,
      standards: childStandards,
      interests: childInterests,
      style: childStyle,
      collegeBound: childCollegeBound
    }]);
    
    // Reset form
    setChildName('');
    setChildAge('');
    setChildGrade('');
    setChildStandards('');
    setChildInterests('');
    setChildStyle('');
    setChildCollegeBound(false);
  };

  const handleRemoveChild = (index) => {
    setChildren(children.filter((_, i) => i !== index));
  };

  const handleAddSubject = () => {
    if (!validateSubject()) return;
    
    setSubjects([...subjects, {
      name: subjectName,
      grade: subjectGrade,
      notes: subjectNotes,
      childId: selectedChildForSubject
    }]);
    
    // Reset form
    setSubjectName('');
    setSubjectGrade('');
    setSubjectNotes('');
    setSelectedChildForSubject('0');
  };

  const handleRemoveSubject = (index) => {
    setSubjects(subjects.filter((_, i) => i !== index));
  };

  const handleAddActivity = () => {
    if (!validateActivity()) return;
    
    setActivities([...activities, {
      name: activityName,
      platform: activityPlatform,
      link: activityLink,
      startDate: activityStartDate,
      endDate: activityEndDate,
      studyDays: activityStudyDays,
      travelMinutes: activityTravelMinutes,
      classSchedule: activityClassSchedule,
      initialPlan: activityInitialPlan,
      childIds: selectedChildrenForActivity,
      subjectIds: selectedSubjectsForActivity
    }]);
    
    // Reset form
    setActivityName('');
    setActivityPlatform('');
    setActivityLink('');
    setActivityStartDate('');
    setActivityEndDate('');
    setActivityStudyDays('');
    setActivityTravelMinutes('');
    setActivityClassSchedule('');
    setActivityInitialPlan('');
    setSelectedChildrenForActivity([]);
    setSelectedSubjectsForActivity([]);
  };

  const handleRemoveActivity = (index) => {
    setActivities(activities.filter((_, i) => i !== index));
  };

  const toggleTeachingDay = (day) => {
    if (teachingDays.includes(day)) {
      setTeachingDays(teachingDays.filter(d => d !== day));
    } else {
      setTeachingDays([...teachingDays, day]);
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!validateAll()) return;
    
    setError(null);
    setLoading(true);
    
    try {
      let result;
      let userId = user?.id;
      
      if (!user) {
        // Try sign in first, then sign up if not found
        result = await signIn(email, password);
        if (result?.error) {
          console.log('Sign in failed, trying sign up:', result.error.message);
          // If sign in fails, try sign up
          result = await signUp(email, password);
          if (result?.error) {
            const errorMessage = result.error.message || 'Sign up failed';
            setError(errorMessage);
            Alert.alert('Sign Up Error', errorMessage);
            setLoading(false);
            return;
          }
        }
        userId = result?.user?.id;
      }

      if (userId) {
        await handleOnboardingData(userId);
        onComplete();
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      console.error('Error details:', {
        message: err.message,
        details: err.details,
        hint: err.hint,
        code: err.code
      });
      const errorMessage = err.message || 'Error saving onboarding data';
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingData = async (userId) => {
    // 1. Create family
      const { data: family, error: familyError } = await supabase
        .from('family')
      .insert({
        city: familyCity || 'Unknown',
        state: familyState || 'Unknown',
        country: familyCountry || 'Unknown'
      })
        .select('id')
        .single();
      if (familyError) throw familyError;

    // 2. Update profile with family_id
      const { error: profileError } = await supabase
        .from('profiles')
      .update({ family_id: family.id })
        .eq('id', userId);
      if (profileError) throw profileError;

      // 3. Insert children
      const childIds = [];
      for (const child of children) {
        const { data: childData, error: childError } = await supabase
          .from('children')
          .insert({
          family_id: family.id,
            first_name: child.first_name,
          age: child.age,
            grade: child.grade,
            standards: child.standards,
            interests: child.interests,
            style: child.style,
          college_bound: child.collegeBound ? 'yes' : 'no'
          })
          .select('id')
          .single();
        if (childError) throw childError;
        childIds.push(childData.id);
      }

    // 4. Calculate end date
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + parseInt(totalDays) - 1);
      
    // 5. Insert family_years
    const { data: familyYear, error: familyYearError } = await supabase
      .from('family_years')
      .insert({
        family_id: family.id,
        start_date: startDate,
        end_date: endDate.toISOString().split('T')[0],
        total_days: parseInt(totalDays),
        total_hours: parseInt(totalHours),
        hours_per_day: parseFloat(hoursPerDay),
        is_current: true
      })
      .select('id')
      .single();
    if (familyYearError) throw familyYearError;

    // 8. Define teaching pattern via rules (handled later) – skip legacy family_teaching_days

    // 9. Refresh availability cache for initial window (no bulk calendar_days inserts)
      const { error: refreshErr } = await supabase.rpc('refresh_calendar_days_cache', {
        p_family_id: family.id,
        p_from_date: startDate,
        p_to_date: endDate.toISOString().split('T')[0],
      });
      if (refreshErr) console.warn('refresh_calendar_days_cache error:', refreshErr.message);

    // 10. Insert subjects
      for (const subject of subjects) {
      const childIndex = parseInt(subject.childId);
      const child = children[childIndex];
      
      if (!child) {
        console.error('Child not found for subject:', subject);
        continue;
      }
      
        const { error: subjectError } = await supabase
          .from('subject')
          .insert({
          family_id: family.id,
          student_id: childIds[childIndex],
            name: subject.name,
            grade: subject.grade,
            notes: subject.notes,
            family_year_id: familyYear.id
          });
        if (subjectError) throw subjectError;
      }

    // 11. Insert activities/courses (subject_track)
      for (const activity of activities) {
        const { data: activityData, error: activityError } = await supabase
          .from('subject_track')
          .insert({
          family_id: family.id,
            name: activity.name,
            platform: activity.platform,
            link: activity.link,
          start_date: activity.startDate || null,
          end_date: activity.endDate || null,
            study_days: activity.studyDays,
            travel_minutes: parseInt(activity.travelMinutes) || 0,
            class_schedule: activity.classSchedule,
            initial_plan: activity.initialPlan,
          status: 'active',
          family_year_id: familyYear.id
          })
          .select('id')
          .single();
        if (activityError) throw activityError;

      // Link subjects to this activity
      if (activity.subjectIds && activity.subjectIds.length > 0) {
        for (const subjectIndex of activity.subjectIds) {
          const subject = subjects[subjectIndex];
          if (subject) {
            const { data: subjectData, error: subjectLookupError } = await supabase
              .from('subject')
              .select('id')
              .eq('name', subject.name)
              .eq('family_id', family.id)
              .single();
            if (subjectData && !subjectLookupError) {
            const { error: trackError } = await supabase
              .from('track')
              .insert({
                subject_track_id: activityData.id,
                  subject_id: subjectData.id,
                  family_id: family.id
              });
            if (trackError) throw trackError;
          }
        }
      }
    }
    }
  };

    return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <Text style={styles.title}>Complete Your Family Setup</Text>
        <Text style={styles.subtitle}>Fill out all the information below to get started</Text>

        {/* Family Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Family Information</Text>
          <TextInput
            style={styles.input}
            placeholder="City (optional)"
            value={familyCity}
            onChangeText={setFamilyCity}
            maxLength={50}
          />
          <TextInput
            style={styles.input}
            placeholder="State/Province (optional)"
            value={familyState}
            onChangeText={setFamilyState}
            maxLength={50}
          />
          <TextInput
            style={styles.input}
            placeholder="Country (optional)"
            value={familyCountry}
            onChangeText={setFamilyCountry}
            maxLength={50}
          />
      </View>

        {/* Children Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Children</Text>
          
          {/* Add Child Form */}
          <View style={styles.addForm}>
          <TextInput
            style={styles.input}
              placeholder="Child's Name (max 50 characters)"
            value={childName}
            onChangeText={setChildName}
              maxLength={50}
              autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
              placeholder="Age (0-25)"
            value={childAge}
            onChangeText={setChildAge}
            keyboardType="numeric"
              maxLength={2}
          />
            
            {/* Grade Picker */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowGradePicker(true)}
            >
              <Text style={styles.pickerButtonText}>
                {childGrade || 'Select Grade (optional)'}
              </Text>
              <Text style={styles.pickerArrow}>▼</Text>
            </TouchableOpacity>

            {/* Standards Picker */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowStandardsPicker(true)}
            >
              <Text style={styles.pickerButtonText}>
                {childStandards || 'Select Standards (optional)'}
              </Text>
              <Text style={styles.pickerArrow}>▼</Text>
            </TouchableOpacity>

          <TextInput
            style={styles.input}
              placeholder="Interests (e.g., math, art, science) - max 200 chars"
            value={childInterests}
            onChangeText={setChildInterests}
              maxLength={200}
            />

            {/* Learning Style Picker */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowLearningStylePicker(true)}
            >
              <Text style={styles.pickerButtonText}>
                {childStyle || 'Select Learning Style (optional)'}
              </Text>
              <Text style={styles.pickerArrow}>▼</Text>
            </TouchableOpacity>
          
          <View style={styles.switchContainer}>
              <Text>College Bound</Text>
            <Switch
              value={childCollegeBound}
              onValueChange={setChildCollegeBound}
            />
          </View>
            <TouchableOpacity style={styles.addButton} onPress={handleAddChild}>
              <Text style={styles.addButtonText}>Add Child</Text>
          </TouchableOpacity>
          </View>

          {/* Children List */}
          {children.length > 0 && (
            <View style={styles.listContainer}>
              <Text style={styles.listTitle}>Children Added:</Text>
              {children.map((child, idx) => (
                <View key={idx} style={styles.listItem}>
                  <Text style={styles.listItemText}>
                    {child.first_name} (Age: {child.age}) - {child.collegeBound ? 'College Bound' : 'Not College Bound'}
                </Text>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveChild(idx)}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Academic Year Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Academic Year Setup</Text>
          
          {/* Start Date Picker */}
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => openDatePicker('startDate')}
          >
            <Text style={styles.pickerButtonText}>
              {startDate ? new Date(startDate).toLocaleDateString() : 'Select Start Date'}
            </Text>
            <Text style={styles.pickerArrow}>📅</Text>
          </TouchableOpacity>
          
          <TextInput
            style={styles.input}
            placeholder="Total Days (1-365)"
            value={totalDays}
            onChangeText={setTotalDays}
            keyboardType="numeric"
            maxLength={3}
          />
          <TextInput
            style={styles.input}
            placeholder="Total Hours (1-1000)"
            value={totalHours}
            onChangeText={setTotalHours}
            keyboardType="numeric"
            maxLength={4}
          />
          <TextInput
            style={styles.input}
            placeholder="Hours Per Day (0.1-12)"
            value={hoursPerDay}
            onChangeText={setHoursPerDay}
            keyboardType="numeric"
            maxLength={4}
          />

          {/* Teaching Days */}
          <Text style={styles.subsectionTitle}>Teaching Days</Text>
          <View style={styles.daysContainer}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
          <TouchableOpacity
                key={index}
                style={[
                  styles.dayButton,
                  teachingDays.includes(index) && styles.selectedDayButton
                ]}
                onPress={() => toggleTeachingDay(index)}
          >
                <Text style={[
                  styles.dayButtonText,
                  teachingDays.includes(index) && styles.selectedDayButtonText
                ]}>
                  {day}
                </Text>
          </TouchableOpacity>
            ))}
        </View>
        </View>

        {/* Subjects Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subjects</Text>
          
          {/* Add Subject Form */}
          <View style={styles.addForm}>
            {/* Subject Name Picker */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => {
                // Show subject picker modal
                setShowSubjectPicker(true);
              }}
            >
              <Text style={styles.pickerButtonText}>
                {subjectName || 'Select Subject'}
              </Text>
              <Text style={styles.pickerArrow}>▼</Text>
            </TouchableOpacity>

            {/* Subject Grade Picker */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowGradePicker(true)}
            >
              <Text style={styles.pickerButtonText}>
                {subjectGrade || 'Select Grade Level (optional)'}
              </Text>
              <Text style={styles.pickerArrow}>▼</Text>
            </TouchableOpacity>

              <TextInput
                style={styles.input}
              placeholder="Notes (e.g., curriculum, resources, goals) - max 500 chars"
                value={subjectNotes}
                onChangeText={setSubjectNotes}
                multiline
              maxLength={500}
              numberOfLines={3}
            />
            {children.length > 0 && (
              <View style={styles.pickerContainer}>
                <Text style={styles.pickerLabel}>For Child:</Text>
                <View style={styles.childPicker}>
                  {children.map((child, index) => (
              <TouchableOpacity
                      key={index}
                      style={[
                        styles.childOption,
                        selectedChildForSubject === index.toString() && styles.selectedChildOption
                      ]}
                      onPress={() => setSelectedChildForSubject(index.toString())}
                    >
                      <Text style={[
                        styles.childOptionText,
                        selectedChildForSubject === index.toString() && styles.selectedChildOptionText
                      ]}>
                        {child.first_name}
                      </Text>
              </TouchableOpacity>
                  ))}
                </View>
              </View>
          )}
            <TouchableOpacity style={styles.addButton} onPress={handleAddSubject}>
              <Text style={styles.addButtonText}>Add Subject</Text>
            </TouchableOpacity>
          </View>

          {/* Subjects List */}
          {subjects.length > 0 && (
            <View style={styles.listContainer}>
              <Text style={styles.listTitle}>Subjects Added:</Text>
              {subjects.map((subject, idx) => (
                <View key={idx} style={styles.listItem}>
                  <Text style={styles.listItemText}>
                    {subject.name} - {children[parseInt(subject.childId)]?.first_name || 'Unknown Child'}
                </Text>
          <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveSubject(idx)}
          >
                    <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
              ))}
            </View>
          )}
        </View>

        {/* Activities Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activities/Courses</Text>
          
          {/* Add Activity Form */}
          <View style={styles.addForm}>
          <TextInput
            style={styles.input}
              placeholder="Activity/Course Name (e.g., Algebra 1, Science Lab) - max 100 chars"
            value={activityName}
            onChangeText={setActivityName}
              maxLength={100}
              autoCapitalize="words"
            />

            {/* Platform Picker */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowPlatformPicker(true)}
            >
              <Text style={styles.pickerButtonText}>
                {activityPlatform || 'Select Platform'}
              </Text>
              <Text style={styles.pickerArrow}>▼</Text>
            </TouchableOpacity>

          <TextInput
            style={styles.input}
              placeholder="Link (e.g., https://example.com) - optional"
            value={activityLink}
            onChangeText={setActivityLink}
              maxLength={500}
              autoCapitalize="none"
              keyboardType="url"
            />

            {/* Start Date Picker */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => openDatePicker('activityStartDate')}
            >
              <Text style={styles.pickerButtonText}>
                {activityStartDate ? new Date(activityStartDate).toLocaleDateString() : 'Select Start Date (optional)'}
              </Text>
              <Text style={styles.pickerArrow}>📅</Text>
            </TouchableOpacity>

            {/* End Date Picker */}
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => openDatePicker('activityEndDate')}
            >
              <Text style={styles.pickerButtonText}>
                {activityEndDate ? new Date(activityEndDate).toLocaleDateString() : 'Select End Date (optional)'}
              </Text>
              <Text style={styles.pickerArrow}>📅</Text>
            </TouchableOpacity>

          <TextInput
            style={styles.input}
              placeholder="Study Days (e.g., Mon, Wed, Fri) - max 50 chars"
            value={activityStudyDays}
            onChangeText={setActivityStudyDays}
              maxLength={50}
          />
          <TextInput
            style={styles.input}
              placeholder="Travel Minutes (0-180)"
            value={activityTravelMinutes}
            onChangeText={setActivityTravelMinutes}
            keyboardType="numeric"
              maxLength={3}
          />
          <TextInput
            style={styles.input}
              placeholder="Class Schedule (e.g., Tues/Thurs 2-3pm) - max 100 chars"
            value={activityClassSchedule}
            onChangeText={setActivityClassSchedule}
              maxLength={100}
          />
          <TextInput
            style={styles.input}
              placeholder="Initial Plan (curriculum outline, goals) - max 1000 chars"
            value={activityInitialPlan}
            onChangeText={setActivityInitialPlan}
            multiline
              maxLength={1000}
              numberOfLines={4}
            />
            <TouchableOpacity style={styles.addButton} onPress={handleAddActivity}>
              <Text style={styles.addButtonText}>Add Activity</Text>
          </TouchableOpacity>
          </View>

          {/* Activities List */}
          {activities.length > 0 && (
            <View style={styles.listContainer}>
              <Text style={styles.listTitle}>Activities Added:</Text>
              {activities.map((activity, idx) => (
                <View key={idx} style={styles.listItem}>
                  <Text style={styles.listItemText}>
                  {activity.name} ({activity.platform})
                </Text>
          <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveActivity(idx)}
          >
                    <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
              ))}
            </View>
          )}
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Create Account</Text>
        <TextInput
          style={styles.input}
            placeholder="Email (e.g., user@example.com) - max 100 chars"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
            keyboardType="email-address"
            maxLength={100}
        />
        <TextInput
          style={styles.input}
            placeholder="Password (6-50 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
            maxLength={50}
        />
        </View>

        {/* Error Display */}
        {error && <Text style={styles.error}>{error}</Text>}

        {/* Complete Button */}
        <TouchableOpacity
          style={[styles.completeButton, loading && styles.disabledButton]}
          onPress={handleCompleteOnboarding}
          disabled={loading}
        >
          <Text style={styles.completeButtonText}>
            {loading ? 'Setting Up...' : 'Complete Setup'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      {renderPickerModal(
        showGradePicker,
        () => setShowGradePicker(false),
        'Select Grade',
        gradeOptions,
        setChildGrade,
        childGrade
      )}

      {renderPickerModal(
        showStandardsPicker,
        () => setShowStandardsPicker(false),
        'Select Standards',
        standardsOptions,
        setChildStandards,
        childStandards
      )}

      {renderPickerModal(
        showLearningStylePicker,
        () => setShowLearningStylePicker(false),
        'Select Learning Style',
        learningStyleOptions,
        setChildStyle,
        childStyle
      )}

      {renderPickerModal(
        showPlatformPicker,
        () => setShowPlatformPicker(false),
        'Select Platform',
        platformOptions,
        setActivityPlatform,
        activityPlatform
      )}

      {renderPickerModal(
        showSubjectPicker,
        () => setShowSubjectPicker(false),
        'Select Subject',
        subjectOptions,
        setSubjectName,
        subjectName
      )}

      {renderDatePickerModal()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
  },
  section: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 15,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  addForm: {
    marginTop: 10,
  },
  addButton: {
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  listContainer: {
    marginTop: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 10,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    paddingLeft: 10,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 6,
    marginBottom: 5,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
  },
  listItemText: {
    fontSize: 15,
    flex: 1,
  },
  removeButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#e53e3e',
    borderRadius: 5,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pickerContainer: {
    marginTop: 15,
    marginBottom: 15,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  childPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    padding: 5,
  },
  childOption: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    margin: 5,
  },
  selectedChildOption: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  childOptionText: {
    fontSize: 14,
    color: '#333',
  },
  selectedChildOptionText: {
    color: '#fff',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 15,
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    padding: 5,
  },
  dayButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    margin: 5,
  },
  dayButtonText: {
    fontSize: 14,
    color: '#333',
  },
  selectedDayButton: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  selectedDayButtonText: {
    color: '#fff',
  },
  completeButton: {
    backgroundColor: '#667eea',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  completeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  disabledButton: {
    backgroundColor: '#ccc',
    opacity: 0.7,
  },
  error: {
    color: '#e53e3e',
    marginTop: 10,
    textAlign: 'center',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    width: '80%',
    maxHeight: '70%',
    padding: 20,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
  },
  optionItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  selectedOptionItem: {
    backgroundColor: '#e0e0e0',
  },
  selectedOptionText: {
    fontWeight: 'bold',
    color: '#667eea',
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  pickerArrow: {
    fontSize: 20,
    color: '#666',
  },
}); 