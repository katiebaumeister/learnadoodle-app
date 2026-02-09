/**
 * Plan Year Modal
 * Academic year planning with constraint solver and holiday management
 * 
 * Two paths:
 * 1. Non-homeschool fast path: Defaults + typical holidays
 * 2. Homeschool constraint solver: Pick 3 vars, compute 4th
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
  Switch,
} from 'react-native';
import { 
  X, 
  Calendar, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Save,
  FileText,
  Globe,
  Clock,
  Target
} from 'lucide-react';
import { colors } from '../../theme/colors';
import {
  createDefaultAcademicYear,
  recalculateAcademicYear,
  saveAcademicYear,
  syncGlobalHolidays,
  getAcademicYear,
  getHolidayCountries,
} from '../../lib/services/academicYearClient';
import { supabase } from '../../lib/supabase';
import HolidayPicker from './HolidayPicker';

const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const ACCENT = '#8b5cf6';
const ACCENT_LIGHT = '#ede9fe';
const ERROR = '#ef4444';
const SUCCESS = '#10b981';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NUMBERS = [0, 1, 2, 3, 4, 5, 6];

// Helper function to get country/region display label
const getCountryRegionLabel = (countryCode, regionCode, countries = []) => {
  const country = countries.find(c => c.code === countryCode);
  const countryName = country ? country.name : countryCode;
  
  if (regionCode) {
    return `${countryName} · ${regionCode}`;
  }
  return `${countryName} · National`;
};

export default function PlanYearModal({
  visible,
  familyId,
  children = [],
  onClose,
  onComplete,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isHomeschool, setIsHomeschool] = useState(false);
  const [checkingHomeschool, setCheckingHomeschool] = useState(true);
  
  // Fast path state
  const [fastPathYearId, setFastPathYearId] = useState(null);
  const [followGlobalHolidays, setFollowGlobalHolidays] = useState(true);
  const [countryCode, setCountryCode] = useState('US');
  const [regionCode, setRegionCode] = useState(null);
  const [showHolidayPicker, setShowHolidayPicker] = useState(false);
  const [countriesList, setCountriesList] = useState([]);
  
  // Constraint solver state
  const [mode, setMode] = useState('FIXED_END'); // FIXED_END | TARGET_DAYS | TARGET_HOURS
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetDays, setTargetDays] = useState('');
  const [targetHours, setTargetHours] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('');
  const [allowedWeekdays, setAllowedWeekdays] = useState([1, 2, 3, 4, 5]); // Mon-Fri
  const [customHolidays, setCustomHolidays] = useState([]);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [academicYearId, setAcademicYearId] = useState(null);
  
  // Calculated results
  const [calculatedResult, setCalculatedResult] = useState(null);
  const [recalculating, setRecalculating] = useState(false);
  
  const recalculateTimeoutRef = useRef(null);

  // Check if family has homeschooled students
  useEffect(() => {
    if (visible && familyId) {
      checkHomeschoolStatus();
    }
  }, [visible, familyId]);

  const checkHomeschoolStatus = async () => {
    setCheckingHomeschool(true);
    try {
      // Check if any children are homeschooled
      // This is a placeholder - adjust based on your actual data model
      const { data: childrenData, error } = await supabase
        .from('children')
        .select('id, homeschooled')
        .eq('family_id', familyId);
      
      if (error) throw error;
      
      const hasHomeschooled = childrenData?.some(c => c.homeschooled === true) || false;
      setIsHomeschool(hasHomeschooled);
      
      // If not homeschooled, create default year immediately
      if (!hasHomeschooled) {
        await createDefaultYear();
      }
    } catch (err) {
      console.error('Error checking homeschool status:', err);
      // Default to homeschool path if check fails
      setIsHomeschool(true);
    } finally {
      setCheckingHomeschool(false);
    }
  };

  const createDefaultYear = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await createDefaultAcademicYear(familyId);
      
      if (error) throw error;
      
      if (data?.academic_year_id) {
        setFastPathYearId(data.academic_year_id);
        // Load the created year to show details
        const { data: yearData } = await getAcademicYear(data.academic_year_id);
        if (yearData) {
          setFollowGlobalHolidays(yearData.holiday_settings?.follow_global_holidays || true);
          setCountryCode(yearData.holiday_settings?.holiday_country_code || 'US');
          setRegionCode(yearData.holiday_settings?.holiday_region || null);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to create default academic year');
    } finally {
      setLoading(false);
    }
  };

  // Debounced recalculation
  const triggerRecalculation = useCallback(() => {
    if (recalculateTimeoutRef.current) {
      clearTimeout(recalculateTimeoutRef.current);
    }
    
    recalculateTimeoutRef.current = setTimeout(async () => {
      await performRecalculation();
    }, 500);
  }, [mode, startDate, endDate, targetDays, targetHours, hoursPerDay, allowedWeekdays, customHolidays, followGlobalHolidays, countryCode]);

  // Load countries list for display
  useEffect(() => {
    if (visible && followGlobalHolidays) {
      loadCountriesList();
    }
  }, [visible, followGlobalHolidays]);

  const loadCountriesList = async () => {
    try {
      const { data } = await getHolidayCountries();
      if (data?.countries) {
        setCountriesList(data.countries);
      }
    } catch (err) {
      console.error('Error loading countries:', err);
    }
  };

  // Recalculate when inputs change (including country/region)
  useEffect(() => {
    if (isHomeschool && startDate && (endDate || targetDays || targetHours)) {
      triggerRecalculation();
    }
  }, [mode, startDate, endDate, targetDays, targetHours, hoursPerDay, allowedWeekdays, customHolidays, followGlobalHolidays, countryCode, regionCode, isHomeschool, triggerRecalculation]);

  const performRecalculation = async () => {
    if (!startDate) return;
    
    setRecalculating(true);
    setError(null);
    
    try {
      const input = {
        academic_year_id: academicYearId,
        mode,
        start_date: startDate,
        end_date: mode === 'FIXED_END' ? endDate : undefined,
        target_instructional_days: mode === 'TARGET_DAYS' ? parseInt(targetDays) : undefined,
        target_instructional_hours: mode === 'TARGET_HOURS' ? parseInt(targetHours) : undefined,
        planned_hours_per_day: mode === 'TARGET_HOURS' ? parseFloat(hoursPerDay) : undefined,
        allowed_weekdays: allowedWeekdays,
        holiday_settings: {
          follow_global_holidays: followGlobalHolidays,
          holiday_country_code: countryCode,
          holiday_region: regionCode,
          provider: 'NAGER_DATE',
        },
        custom_holidays: customHolidays.map(h => ({
          date: h.date,
          name: h.name,
          type: h.type || 'CUSTOM_HOLIDAY',
        })),
      };
      
      const { data, error } = await recalculateAcademicYear(input);
      
      if (error) throw error;
      
      setCalculatedResult(data);
    } catch (err) {
      console.error('Recalculation error:', err);
      setError(err.message || 'Failed to recalculate');
    } finally {
      setRecalculating(false);
    }
  };

  const handleSave = async (isDraft = false) => {
    if (isHomeschool && !startDate) {
      setError('Start date is required');
      return;
    }
    
    if (isHomeschool && mode === 'FIXED_END' && !endDate) {
      setError('End date is required for fixed end mode');
      return;
    }
    
    if (isHomeschool && mode === 'TARGET_DAYS' && !targetDays) {
      setError('Target days is required');
      return;
    }
    
    if (isHomeschool && mode === 'TARGET_HOURS' && (!targetHours || !hoursPerDay)) {
      setError('Target hours and hours per day are required');
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      if (!isHomeschool) {
        // Fast path: just update holiday settings
        if (fastPathYearId) {
          const input = {
            academic_year_id: fastPathYearId,
            mode: 'FIXED_END',
            start_date: '', // Will be loaded from existing year
            end_date: '', // Will be loaded from existing year
            holiday_settings: {
              follow_global_holidays: followGlobalHolidays,
              holiday_country_code: countryCode,
              holiday_region: regionCode,
              provider: 'NAGER_DATE',
            },
            custom_holidays: [],
          };
          
          const { data, error } = await saveAcademicYear(input);
          if (error) throw error;
        }
      } else {
        // Homeschool path: save full configuration
        const input = {
          academic_year_id: academicYearId,
          mode,
          start_date: startDate,
          end_date: mode === 'FIXED_END' ? endDate : calculatedResult?.end_date,
          target_instructional_days: mode === 'TARGET_DAYS' ? parseInt(targetDays) : undefined,
          target_instructional_hours: mode === 'TARGET_HOURS' ? parseInt(targetHours) : undefined,
          planned_hours_per_day: mode === 'TARGET_HOURS' ? parseFloat(hoursPerDay) : undefined,
          allowed_weekdays: allowedWeekdays,
          holiday_settings: {
            follow_global_holidays: followGlobalHolidays,
            holiday_country_code: countryCode,
            holiday_region: regionCode,
            provider: 'NAGER_DATE',
          },
          custom_holidays: customHolidays.map(h => ({
            date: h.date,
            name: h.name,
            type: h.type || 'CUSTOM_HOLIDAY',
          })),
        };
        
        const { data, error } = await saveAcademicYear(input);
        if (error) throw error;
        
        if (data?.academic_year_id) {
          setAcademicYearId(data.academic_year_id);
        }
      }
      
      Alert.alert('Success', 'Academic year saved successfully', [
        { text: 'OK', onPress: () => {
          onComplete?.();
          onClose();
        }},
      ]);
    } catch (err) {
      setError(err.message || 'Failed to save academic year');
    } finally {
      setSaving(false);
    }
  };

  const addCustomHoliday = () => {
    if (!newHolidayDate || !newHolidayName) {
      setError('Date and name are required');
      return;
    }
    
    setCustomHolidays([...customHolidays, {
      date: newHolidayDate,
      name: newHolidayName,
      type: 'CUSTOM_HOLIDAY',
    }]);
    
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const removeCustomHoliday = (index) => {
    setCustomHolidays(customHolidays.filter((_, i) => i !== index));
  };

  const toggleWeekday = (dayNum) => {
    if (allowedWeekdays.includes(dayNum)) {
      setAllowedWeekdays(allowedWeekdays.filter(d => d !== dayNum));
    } else {
      setAllowedWeekdays([...allowedWeekdays, dayNum].sort());
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setError(null);
      setCustomHolidays([]);
      setNewHolidayDate('');
      setNewHolidayName('');
      setCalculatedResult(null);
      setFastPathYearId(null);
      setAcademicYearId(null);
    }
  }, [visible]);

  if (checkingHomeschool) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.loadingText}>Checking setup...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Plan My Year</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={FG} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {!isHomeschool ? (
              // Fast Path: Non-Homeschool
              <View>
                <Text style={styles.sectionTitle}>Here's your year</Text>
                <Text style={styles.description}>
                  We've set up a default academic year (August 15 - June 15) with typical holidays.
                </Text>

                <TouchableOpacity style={styles.editButton}>
                  <Text style={styles.editButtonText}>Edit dates</Text>
                </TouchableOpacity>

                <View style={styles.settingRow}>
                  <View style={styles.settingLabel}>
                    <Globe size={18} color={FG} />
                    <Text style={styles.settingText}>Follow public holidays</Text>
                  </View>
                  <Switch
                    value={followGlobalHolidays}
                    onValueChange={setFollowGlobalHolidays}
                    trackColor={{ false: MUTED, true: ACCENT_LIGHT }}
                    thumbColor={followGlobalHolidays ? ACCENT : '#f4f3f4'}
                  />
                </View>

                {followGlobalHolidays && (
                  <View style={styles.holidaySettingsRow}>
                    <TouchableOpacity
                      style={styles.countryChip}
                      onPress={() => setShowHolidayPicker(true)}
                    >
                      <Text style={styles.countryChipText}>
                        {getCountryRegionLabel(countryCode, regionCode, countriesList)}
                      </Text>
                      <ChevronDown size={16} color={SUB} />
                    </TouchableOpacity>
                    {fastPathYearId && (
                      <TouchableOpacity
                        style={styles.resyncButton}
                        onPress={async () => {
                          setLoading(true);
                          try {
                            const { error } = await syncGlobalHolidays(fastPathYearId);
                            if (error) throw error;
                            Alert.alert('Success', 'Holidays synced successfully');
                          } catch (err) {
                            setError(err.message || 'Failed to sync holidays');
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        <Text style={styles.resyncButtonText}>Resync holidays</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ) : (
              // Homeschool Constraint Solver
              <View>
                <Text style={styles.sectionTitle}>Homeschool Year Planning</Text>
                <Text style={styles.description}>
                  Choose what you know, and we'll calculate the rest.
                </Text>

                {/* Mode Selection */}
                <View style={styles.modeSelector}>
                  <TouchableOpacity
                    style={[styles.modeButton, mode === 'FIXED_END' && styles.modeButtonActive]}
                    onPress={() => setMode('FIXED_END')}
                  >
                    <Calendar size={16} color={mode === 'FIXED_END' ? ACCENT : SUB} />
                    <Text style={[styles.modeButtonText, mode === 'FIXED_END' && styles.modeButtonTextActive]}>
                      I know my end date
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modeButton, mode === 'TARGET_DAYS' && styles.modeButtonActive]}
                    onPress={() => setMode('TARGET_DAYS')}
                  >
                    <Target size={16} color={mode === 'TARGET_DAYS' ? ACCENT : SUB} />
                    <Text style={[styles.modeButtonText, mode === 'TARGET_DAYS' && styles.modeButtonTextActive]}>
                      I need X school days
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modeButton, mode === 'TARGET_HOURS' && styles.modeButtonActive]}
                    onPress={() => setMode('TARGET_HOURS')}
                  >
                    <Clock size={16} color={mode === 'TARGET_HOURS' ? ACCENT : SUB} />
                    <Text style={[styles.modeButtonText, mode === 'TARGET_HOURS' && styles.modeButtonTextActive]}>
                      I need X hours
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Start Date */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Start Date</Text>
                  <TextInput
                    style={styles.input}
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={MUTED}
                  />
                </View>

                {/* End Date (FIXED_END mode) */}
                {mode === 'FIXED_END' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>End Date</Text>
                    <TextInput
                      style={styles.input}
                      value={endDate}
                      onChangeText={setEndDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={MUTED}
                    />
                  </View>
                )}

                {/* Target Days (TARGET_DAYS mode) */}
                {mode === 'TARGET_DAYS' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Target Instructional Days</Text>
                    <TextInput
                      style={styles.input}
                      value={targetDays}
                      onChangeText={setTargetDays}
                      placeholder="180"
                      keyboardType="numeric"
                      placeholderTextColor={MUTED}
                    />
                  </View>
                )}

                {/* Target Hours (TARGET_HOURS mode) */}
                {mode === 'TARGET_HOURS' && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Target Instructional Hours</Text>
                      <TextInput
                        style={styles.input}
                        value={targetHours}
                        onChangeText={setTargetHours}
                        placeholder="1080"
                        keyboardType="numeric"
                        placeholderTextColor={MUTED}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Hours per Instructional Day</Text>
                      <TextInput
                        style={styles.input}
                        value={hoursPerDay}
                        onChangeText={setHoursPerDay}
                        placeholder="6.0"
                        keyboardType="decimal-pad"
                        placeholderTextColor={MUTED}
                      />
                    </View>
                  </>
                )}

                {/* Weekday Pattern */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>School Days</Text>
                  <View style={styles.weekdayChips}>
                    {WEEKDAY_NUMBERS.map((dayNum, idx) => (
                      <TouchableOpacity
                        key={dayNum}
                        style={[
                          styles.weekdayChip,
                          allowedWeekdays.includes(dayNum) && styles.weekdayChipActive,
                        ]}
                        onPress={() => toggleWeekday(dayNum)}
                      >
                        <Text
                          style={[
                            styles.weekdayChipText,
                            allowedWeekdays.includes(dayNum) && styles.weekdayChipTextActive,
                          ]}
                        >
                          {WEEKDAY_LABELS[idx]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Global Holidays Toggle */}
                <View style={styles.settingRow}>
                  <View style={styles.settingLabel}>
                    <Globe size={18} color={FG} />
                    <Text style={styles.settingText}>Follow public holidays</Text>
                  </View>
                  <Switch
                    value={followGlobalHolidays}
                    onValueChange={setFollowGlobalHolidays}
                    trackColor={{ false: MUTED, true: ACCENT_LIGHT }}
                    thumbColor={followGlobalHolidays ? ACCENT : '#f4f3f4'}
                  />
                </View>

                {followGlobalHolidays && (
                  <View style={styles.holidaySettingsRow}>
                    <TouchableOpacity
                      style={styles.countryChip}
                      onPress={() => setShowHolidayPicker(true)}
                    >
                      <Text style={styles.countryChipText}>
                        {getCountryRegionLabel(countryCode, regionCode, countriesList)}
                      </Text>
                      <ChevronDown size={16} color={SUB} />
                    </TouchableOpacity>
                    {academicYearId && (
                      <TouchableOpacity
                        style={styles.resyncButton}
                        onPress={async () => {
                          setLoading(true);
                          try {
                            const { error } = await syncGlobalHolidays(academicYearId);
                            if (error) throw error;
                            Alert.alert('Success', 'Holidays synced successfully');
                          } catch (err) {
                            setError(err.message || 'Failed to sync holidays');
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        <Text style={styles.resyncButtonText}>Resync holidays</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Custom Holidays */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Custom Holidays</Text>
                  <View style={styles.holidayInputRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 8 }]}
                      value={newHolidayDate}
                      onChangeText={setNewHolidayDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={MUTED}
                    />
                    <TextInput
                      style={[styles.input, { flex: 2, marginRight: 8 }]}
                      value={newHolidayName}
                      onChangeText={setNewHolidayName}
                      placeholder="Holiday name"
                      placeholderTextColor={MUTED}
                    />
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={addCustomHoliday}
                    >
                      <Plus size={18} color={BG} />
                    </TouchableOpacity>
                  </View>

                  {customHolidays.map((holiday, index) => (
                    <View key={index} style={styles.holidayItem}>
                      <Text style={styles.holidayDate}>{holiday.date}</Text>
                      <Text style={styles.holidayName}>{holiday.name}</Text>
                      <TouchableOpacity
                        onPress={() => removeCustomHoliday(index)}
                        style={styles.deleteButton}
                      >
                        <Trash2 size={16} color={ERROR} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                {/* Calculated Results */}
                {recalculating && (
                  <View style={styles.resultBox}>
                    <ActivityIndicator size="small" color={ACCENT} />
                    <Text style={styles.resultText}>Calculating...</Text>
                  </View>
                )}

                {calculatedResult && !recalculating && (
                  <View style={styles.resultBox}>
                    <Text style={styles.resultTitle}>Calculated Results</Text>
                    <Text style={styles.resultText}>
                      Instructional Days: {calculatedResult.instructional_days}
                    </Text>
                    {calculatedResult.instructional_hours && (
                      <Text style={styles.resultText}>
                        Instructional Hours: {calculatedResult.instructional_hours.toFixed(1)}
                      </Text>
                    )}
                    {calculatedResult.end_date && (
                      <Text style={styles.resultText}>
                        End Date: {calculatedResult.end_date}
                      </Text>
                    )}
                    <Text style={styles.resultText}>
                      Non-Instructional Days: {calculatedResult.non_instructional_days}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Holiday Picker Modal */}
          <HolidayPicker
            visible={showHolidayPicker}
            currentCountry={countryCode}
            currentRegion={regionCode}
            onClose={() => setShowHolidayPicker(false)}
            onApply={(selection) => {
              setCountryCode(selection.country);
              setRegionCode(selection.region);
              setShowHolidayPicker(false);
              // Trigger recalculation will happen via useEffect
            }}
          />

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.skipButton]}
              onPress={onClose}
            >
              <Text style={styles.skipButtonText}>Skip for now</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.saveButton, saving && styles.buttonDisabled]}
              onPress={() => handleSave(false)}
              disabled={saving || loading}
            >
              {saving ? (
                <ActivityIndicator size="small" color={BG} />
              ) : (
                <>
                  <Save size={18} color={BG} />
                  <Text style={styles.saveButtonText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '90%',
    maxWidth: 600,
    maxHeight: '90%',
    backgroundColor: BG,
    borderRadius: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: FG,
    fontFamily: Platform.select({
      web: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      default: 'System',
    }),
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: FG,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: SUB,
    marginBottom: 20,
    lineHeight: 20,
  },
  editButton: {
    padding: 12,
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 8,
    marginBottom: 20,
  },
  editButtonText: {
    color: ACCENT,
    fontWeight: '500',
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  settingLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingText: {
    fontSize: 16,
    color: FG,
  },
  holidaySettingsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  countryChip: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: BG,
  },
  countryChipText: {
    fontSize: 14,
    color: FG,
    fontWeight: '500',
  },
  resyncButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: BG,
  },
  resyncButtonText: {
    fontSize: 14,
    color: ACCENT,
    fontWeight: '500',
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  modeButton: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: BG,
  },
  modeButtonActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_LIGHT,
  },
  modeButtonText: {
    fontSize: 14,
    color: SUB,
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: ACCENT,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: FG,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: FG,
    backgroundColor: BG,
  },
  weekdayChips: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  weekdayChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    backgroundColor: BG,
  },
  weekdayChipActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_LIGHT,
  },
  weekdayChipText: {
    fontSize: 14,
    color: SUB,
    fontWeight: '500',
  },
  weekdayChipTextActive: {
    color: ACCENT,
  },
  holidayInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  holidayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    marginBottom: 8,
  },
  holidayDate: {
    fontSize: 14,
    color: SUB,
    marginRight: 12,
    minWidth: 100,
  },
  holidayName: {
    flex: 1,
    fontSize: 14,
    color: FG,
  },
  deleteButton: {
    padding: 4,
  },
  resultBox: {
    padding: 16,
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 8,
    marginTop: 20,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    color: FG,
    marginBottom: 4,
  },
  errorBox: {
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: ERROR,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 8,
  },
  skipButton: {
    backgroundColor: BORDER,
  },
  skipButtonText: {
    fontSize: 16,
    color: FG,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: ACCENT,
  },
  saveButtonText: {
    fontSize: 16,
    color: BG,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: SUB,
  },
});
