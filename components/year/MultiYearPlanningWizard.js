/**
 * Multi-Year Planning Wizard
 * Extends year planning to support planning across multiple consecutive years
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { X, ChevronRight, ChevronLeft, Check, Calendar, UserCircle, BookOpen, Target, Sparkles, Plus, Trash2 } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { createYearPlan, checkFeatureFlags } from '../../lib/services/yearClient';
import { supabase } from '../../lib/supabase';

export default function MultiYearPlanningWizard({
  familyId,
  children = [],
  visible = false,
  onClose,
  onComplete,
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  // Step 1: Students & Years
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [numberOfYears, setNumberOfYears] = useState(2);
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  
  // Step 2: Year Configurations
  const [yearConfigs, setYearConfigs] = useState([]);
  
  // Step 3: Review
  const [createdPlans, setCreatedPlans] = useState([]);

  useEffect(() => {
    if (familyId && visible) {
      loadChildren();
      checkFeatureFlags().then(flags => {
        if (!flags.yearPlans) {
          Alert.alert('Feature Disabled', 'Year planning is currently disabled. Please contact support.');
          onClose();
        }
      });
    }
  }, [familyId, visible]);

  useEffect(() => {
    // Generate year configurations when number of years or start year changes
    if (numberOfYears > 0 && startYear > 0) {
      const configs = [];
      for (let i = 0; i < numberOfYears; i++) {
        const year = startYear + i;
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31);
        
        configs.push({
          year,
          startDate: yearStart.toISOString().split('T')[0],
          endDate: yearEnd.toISOString().split('T')[0],
          breaks: [],
          subjects: {},
          hoursPerWeek: {},
        });
      }
      setYearConfigs(configs);
    }
  }, [numberOfYears, startYear]);

  const loadChildren = async () => {
    try {
      const { data, error } = await supabase
        .from('children')
        .select('id, first_name, last_name')
        .eq('family_id', familyId)
        .eq('archived', false)
        .order('first_name');

      if (error) throw error;
      if (data) {
        setSelectedChildren(data.map(c => c.id));
      }
    } catch (err) {
      setError(err.message || 'Failed to load children');
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (selectedChildren.length === 0) {
        Alert.alert('No Students Selected', 'Please select at least one student.');
        return;
      }
      if (numberOfYears < 1 || numberOfYears > 5) {
        Alert.alert('Invalid Number of Years', 'Please enter a number between 1 and 5.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleCreatePlans = async () => {
    setSaving(true);
    setError(null);
    const created = [];

    try {
      for (const config of yearConfigs) {
        const { data, error: createError } = await createYearPlan({
          family_id: familyId,
          scope: 'custom',
          start_date: config.startDate,
          end_date: config.endDate,
          breaks: config.breaks,
          children: selectedChildren.map(childId => ({
            child_id: childId,
            subjects: Object.entries(config.subjects[childId] || {}).map(([subjectKey, hours]) => ({
              key: subjectKey,
              targetMinPerWeek: (hours || 0) * 60, // Convert hours to minutes
            })),
            hoursPerWeek: config.hoursPerWeek[childId] || {},
          })),
        });

        if (createError) {
          throw new Error(`Failed to create plan for ${config.year}: ${createError.message}`);
        }

        if (data) {
          created.push({ year: config.year, planId: data.id, ...data });
        }
      }

      setCreatedPlans(created);
      
      if (onComplete) {
        onComplete({ plans: created });
      }
      
      Alert.alert(
        'Success',
        `Successfully created ${created.length} year plan${created.length !== 1 ? 's' : ''}!`,
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (err) {
      setError(err.message || 'Failed to create year plans');
      Alert.alert('Error', err.message || 'Failed to create year plans');
    } finally {
      setSaving(false);
    }
  };

  const updateYearConfig = (yearIndex, updates) => {
    setYearConfigs(configs => 
      configs.map((config, idx) => 
        idx === yearIndex ? { ...config, ...updates } : config
      )
    );
  };

  const updateYearBreaks = (yearIndex, breaks) => {
    updateYearConfig(yearIndex, { breaks });
  };

  const updateYearSubjects = (yearIndex, childId, subjects, hoursPerWeek) => {
    setYearConfigs(configs => 
      configs.map((config, idx) => {
        if (idx === yearIndex) {
          const newSubjects = { ...config.subjects };
          const newHours = { ...config.hoursPerWeek };
          newSubjects[childId] = subjects;
          newHours[childId] = hoursPerWeek;
          return { ...config, subjects: newSubjects, hoursPerWeek: newHours };
        }
        return config;
      })
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Sparkles size={20} color={colors.accent || '#3b82f6'} />
              <Text style={styles.title}>Multi-Year Planning</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted || '#6b7280'} />
            </TouchableOpacity>
          </View>

          {/* Progress Steps */}
          <View style={styles.stepsContainer}>
            {[
              { id: 1, label: 'Students & Years', icon: UserCircle },
              { id: 2, label: 'Configure Years', icon: Calendar },
              { id: 3, label: 'Review', icon: Check },
            ].map((stepInfo, idx) => {
              const Icon = stepInfo.icon;
              const isActive = step === stepInfo.id;
              const isCompleted = step > stepInfo.id;
              
              return (
                <React.Fragment key={stepInfo.id}>
                  <View style={styles.stepItem}>
                    <View style={[
                      styles.stepCircle,
                      isActive && styles.stepCircleActive,
                      isCompleted && styles.stepCircleCompleted,
                    ]}>
                      {isCompleted ? (
                        <Check size={16} color="#ffffff" />
                      ) : (
                        <Icon size={16} color={isActive ? colors.accent || '#3b82f6' : colors.muted || '#6b7280'} />
                      )}
                    </View>
                    <Text style={[
                      styles.stepLabel,
                      isActive && styles.stepLabelActive,
                    ]}>
                      {stepInfo.label}
                    </Text>
                  </View>
                  {idx < 2 && <View style={styles.stepConnector} />}
                </React.Fragment>
              );
            })}
          </View>

          <ScrollView style={styles.content}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {step === 1 && (
              <View style={styles.stepContent}>
                <Text style={styles.sectionTitle}>Select Students</Text>
                <Text style={styles.sectionDescription}>
                  Choose which students to include in the multi-year plan
                </Text>
                
                <View style={styles.childrenList}>
                  {children.map(child => {
                    const isSelected = selectedChildren.includes(child.id);
                    return (
                      <TouchableOpacity
                        key={child.id}
                        style={[
                          styles.childCard,
                          isSelected && styles.childCardSelected,
                        ]}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedChildren(prev => prev.filter(id => id !== child.id));
                          } else {
                            setSelectedChildren(prev => [...prev, child.id]);
                          }
                        }}
                      >
                        <View style={[
                          styles.checkbox,
                          isSelected && styles.checkboxSelected,
                        ]}>
                          {isSelected && <Check size={14} color="#ffffff" />}
                        </View>
                        <Text style={styles.childName}>
                          {child.first_name} {child.last_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.sectionTitle}>Planning Period</Text>
                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Start Year</Text>
                    <TextInput
                      style={styles.input}
                      value={startYear.toString()}
                      onChangeText={(text) => {
                        const year = parseInt(text);
                        if (!isNaN(year) && year >= 2020 && year <= 2100) {
                          setStartYear(year);
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="2025"
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Number of Years</Text>
                    <TextInput
                      style={styles.input}
                      value={numberOfYears.toString()}
                      onChangeText={(text) => {
                        const num = parseInt(text);
                        if (!isNaN(num) && num >= 1 && num <= 5) {
                          setNumberOfYears(num);
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="2"
                    />
                  </View>
                </View>

                <View style={styles.previewBox}>
                  <Text style={styles.previewTitle}>Preview:</Text>
                  <Text style={styles.previewText}>
                    Planning for {numberOfYears} year{numberOfYears !== 1 ? 's' : ''} starting in {startYear}
                  </Text>
                  <Text style={styles.previewSubtext}>
                    {yearConfigs.map(c => c.year).join(', ')}
                  </Text>
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={styles.stepContent}>
                <Text style={styles.sectionTitle}>Configure Each Year</Text>
                <Text style={styles.sectionDescription}>
                  Set up subjects, targets, and breaks for each year in your plan
                </Text>

                {yearConfigs.map((config, idx) => (
                  <YearConfigCard
                    key={idx}
                    config={config}
                    yearIndex={idx}
                    children={children.filter(c => selectedChildren.includes(c.id))}
                    onUpdateBreaks={(breaks) => updateYearBreaks(idx, breaks)}
                    onUpdateSubjects={(childId, subjects, hoursPerWeek) => 
                      updateYearSubjects(idx, childId, subjects, hoursPerWeek)
                    }
                  />
                ))}
              </View>
            )}

            {step === 3 && (
              <View style={styles.stepContent}>
                <Text style={styles.sectionTitle}>Review Multi-Year Plan</Text>
                <Text style={styles.sectionDescription}>
                  Review your configuration before creating the plans
                </Text>

                {yearConfigs.map((config, idx) => (
                  <View key={idx} style={styles.reviewCard}>
                    <Text style={styles.reviewYear}>{config.year}</Text>
                    <Text style={styles.reviewDates}>
                      {new Date(config.startDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })} - {new Date(config.endDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                    <Text style={styles.reviewInfo}>
                      {config.breaks.length} break{config.breaks.length !== 1 ? 's' : ''} • {selectedChildren.length} student{selectedChildren.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                ))}

                {saving && (
                  <View style={styles.savingContainer}>
                    <ActivityIndicator size="large" color={colors.accent || '#3b82f6'} />
                    <Text style={styles.savingText}>Creating year plans...</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {step > 1 && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                disabled={saving}
              >
                <ChevronLeft size={16} color={colors.accent || '#3b82f6'} />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            <View style={styles.footerRight}>
              {step < 3 ? (
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={handleNext}
                  disabled={loading || saving}
                >
                  <Text style={styles.nextButtonText}>Next</Text>
                  <ChevronRight size={16} color="#ffffff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.createButton, saving && styles.createButtonDisabled]}
                  onPress={handleCreatePlans}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Sparkles size={16} color="#ffffff" />
                      <Text style={styles.createButtonText}>Create Plans</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Simplified Year Config Card - can be enhanced with full PlanYearWizard integration
function YearConfigCard({ config, yearIndex, children, onUpdateBreaks, onUpdateSubjects }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.yearConfigCard}>
      <TouchableOpacity
        style={styles.yearConfigHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <View>
          <Text style={styles.yearConfigTitle}>Year {config.year}</Text>
          <Text style={styles.yearConfigDates}>
            {new Date(config.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(config.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
        <ChevronRight 
          size={20} 
          color={colors.muted || '#6b7280'}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.yearConfigContent}>
          <Text style={styles.configNote}>
            Full configuration options coming soon. For now, basic settings will be applied.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 900,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  closeButton: {
    padding: 8,
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  stepItem: {
    alignItems: 'center',
    gap: 8,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border || '#e5e7eb',
  },
  stepCircleActive: {
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderColor: colors.accent || '#3b82f6',
  },
  stepCircleCompleted: {
    backgroundColor: colors.accent || '#3b82f6',
    borderColor: colors.accent || '#3b82f6',
  },
  stepLabel: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
    fontWeight: '500',
  },
  stepLabelActive: {
    color: colors.accent || '#3b82f6',
    fontWeight: '600',
  },
  stepConnector: {
    width: 60,
    height: 2,
    backgroundColor: colors.border || '#e5e7eb',
    marginHorizontal: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  errorContainer: {
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: colors.redBold || '#dc2626',
  },
  stepContent: {
    gap: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
    marginBottom: 16,
  },
  childrenList: {
    gap: 8,
    marginBottom: 24,
  },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  childCardSelected: {
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderColor: colors.accent || '#3b82f6',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border || '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.accent || '#3b82f6',
    borderColor: colors.accent || '#3b82f6',
  },
  childName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text || '#111827',
  },
  previewBox: {
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 4,
  },
  previewText: {
    fontSize: 14,
    color: colors.text || '#111827',
    marginBottom: 4,
  },
  previewSubtext: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
  yearConfigCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    marginBottom: 12,
  },
  yearConfigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  yearConfigTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 4,
  },
  yearConfigDates: {
    fontSize: 13,
    color: colors.muted || '#6b7280',
  },
  yearConfigContent: {
    padding: 16,
    paddingTop: 0,
  },
  configNote: {
    fontSize: 13,
    color: colors.muted || '#6b7280',
    fontStyle: 'italic',
  },
  reviewCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  reviewYear: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 8,
  },
  reviewDates: {
    fontSize: 14,
    color: colors.text || '#111827',
    marginBottom: 4,
  },
  reviewInfo: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
  savingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  savingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.muted || '#6b7280',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  footerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.accent || '#3b82f6',
    borderRadius: 8,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.accent || '#3b82f6',
    borderRadius: 8,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

