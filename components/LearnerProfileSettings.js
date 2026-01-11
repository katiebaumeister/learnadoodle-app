import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Palette, Star, Heart, BookOpen, Users, Target, TrendingUp, Sparkles } from 'lucide-react';
import { getSupportProfile, updateSupportProfile, getLearnerProfile, updateLearnerProfile } from '../lib/services/recordsClient';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
import RecommendationsPanel from './RecommendationsPanel';
import { useColorMode } from '../contexts/ColorModeContext';

const COLOR_MODES = [
  { value: 'default', label: 'Default', description: 'Standard color scheme' },
  { value: 'high_contrast', label: 'High Contrast', description: 'Enhanced contrast for better visibility' },
  { value: 'low_contrast', label: 'Low Contrast', description: 'Softer colors for sensitivity' },
  { value: 'colorblind_friendly', label: 'Colorblind Friendly', description: 'Optimized for color vision differences' },
  { value: 'dyslexia_friendly', label: 'Dyslexia Friendly', description: 'Colors that support reading' },
  { value: 'autism_friendly', label: 'Autism Friendly', description: 'Calming, low-stimulation colors' },
];

const STRENGTH_OPTIONS = [
  'Strong problem-solving', 'Creative thinking', 'Excellent memory', 'Quick learner',
  'Strong verbal skills', 'Strong spatial reasoning', 'Detail-oriented', 'Big-picture thinker',
  'Independent worker', 'Collaborative', 'Persistent', 'Curious', 'Analytical', 'Intuitive'
];

const INTEREST_OPTIONS = [
  'STEM', 'Reading', 'Writing', 'Arts', 'Music', 'Sports', 'Outdoors', 'Languages',
  'History', 'Coding', 'Woodworking', 'Animals', 'Nature', 'Technology', 'Cooking', 'Other'
];

export default function LearnerProfileSettings({ childId, childName, familyId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supportProfile, setSupportProfile] = useState(null);
  const [learnerProfile, setLearnerProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('color'); // 'color', 'strengths', 'interests', 'academic'
  const toast = useToast();

  // Use color mode from context for display, but use local state for selection before saving
  const { colorMode: contextColorMode, setColorMode: updateContextColorMode, colorPreferences: contextColorPreferences, refresh: refreshColorMode } = useColorMode();
  
  // Local state for the selected color mode (before saving)
  const [selectedColorMode, setSelectedColorMode] = useState(contextColorMode);
  const [selectedColorPreferences, setSelectedColorPreferences] = useState(contextColorPreferences);

  // Learner profile state
  const [strengths, setStrengths] = useState([]);
  const [interests, setInterests] = useState([]);
  const [academicStrengths, setAcademicStrengths] = useState([]);
  const [academicChallenges, setAcademicChallenges] = useState([]);
  const [preferredSubjects, setPreferredSubjects] = useState([]);
  const [motivationFactors, setMotivationFactors] = useState([]);
  const [newStrength, setNewStrength] = useState('');
  const [newInterest, setNewInterest] = useState('');
  const [newAcademicStrength, setNewAcademicStrength] = useState('');
  const [newAcademicChallenge, setNewAcademicChallenge] = useState('');
  const [newPreferredSubject, setNewPreferredSubject] = useState('');
  const [newMotivationFactor, setNewMotivationFactor] = useState('');

  useEffect(() => {
    loadProfiles();
  }, [childId]);

  // Sync local state with context when context changes
  useEffect(() => {
    setSelectedColorMode(contextColorMode);
    setSelectedColorPreferences(contextColorPreferences);
  }, [contextColorMode, contextColorPreferences]);

  const loadProfiles = async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const [supportData, learnerData] = await Promise.all([
        getSupportProfile(childId).catch(() => null),
        getLearnerProfile(childId).catch(() => null),
      ]);

      if (supportData) {
        setSupportProfile(supportData);
        // Set local state from loaded data
        if (supportData.color_mode) {
          setSelectedColorMode(supportData.color_mode);
          setSelectedColorPreferences(supportData.color_preferences || {});
        }
      }

      if (learnerData && learnerData.id) {
        setLearnerProfile(learnerData);
        setStrengths(learnerData.strengths || []);
        setInterests(learnerData.interests || []);
        setAcademicStrengths(learnerData.academic_strengths || []);
        setAcademicChallenges(learnerData.academic_challenges || []);
        setPreferredSubjects(learnerData.preferred_subjects || []);
        setMotivationFactors(learnerData.motivation_factors || []);
      }
    } catch (error) {
      toast.push('Failed to load profile settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveColorMode = async () => {
    if (!childId) return;
    setSaving(true);
    try {
      // Save to database
      await updateSupportProfile(childId, selectedColorMode, selectedColorPreferences);
      // Update context with the new color mode
      await updateContextColorMode(selectedColorMode, selectedColorPreferences);
      // Refresh the context to ensure it's in sync
      await refreshColorMode();
      toast.push('Color mode saved successfully', 'success');
    } catch (error) {
      toast.push('Failed to save color mode', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveLearnerProfile = async () => {
    if (!childId) return;
    setSaving(true);
    try {
      await updateLearnerProfile(childId, {
        strengths,
        interests,
        academic_strengths: academicStrengths,
        academic_challenges: academicChallenges,
        preferred_subjects: preferredSubjects,
        motivation_factors: motivationFactors,
      });
      toast.push('Learner profile saved successfully', 'success');
    } catch (error) {
      toast.push('Failed to save learner profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleFromList = (item, list, setter) => {
    if (list.includes(item)) {
      setter(list.filter(i => i !== item));
    } else {
      setter([...list, item]);
    }
  };

  const addCustomItem = (value, list, setter, inputSetter) => {
    if (value.trim() && !list.includes(value.trim())) {
      setter([...list, value.trim()]);
      inputSetter('');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading profile settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Learner Profile & Settings</Text>
        <Text style={styles.subtitle}>{childName}</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'color' && styles.tabActive]}
          onPress={() => setActiveTab('color')}
        >
          <Palette size={16} color={activeTab === 'color' ? colors.accent : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'color' && styles.tabTextActive]}>Color Mode</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'strengths' && styles.tabActive]}
          onPress={() => setActiveTab('strengths')}
        >
          <Star size={16} color={activeTab === 'strengths' ? colors.accent : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'strengths' && styles.tabTextActive]}>Strengths</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'interests' && styles.tabActive]}
          onPress={() => setActiveTab('interests')}
        >
          <Heart size={16} color={activeTab === 'interests' ? colors.accent : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'interests' && styles.tabTextActive]}>Interests</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'academic' && styles.tabActive]}
          onPress={() => setActiveTab('academic')}
        >
          <BookOpen size={16} color={activeTab === 'academic' ? colors.accent : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'academic' && styles.tabTextActive]}>Academic</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recommendations' && styles.tabActive]}
          onPress={() => setActiveTab('recommendations')}
        >
          <Sparkles size={16} color={activeTab === 'recommendations' ? colors.accent : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'recommendations' && styles.tabTextActive]}>Recommendations</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'color' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sensory-Friendly Color Modes</Text>
            <Text style={styles.sectionDescription}>
              Choose a color mode that works best for {childName}'s sensory needs and preferences.
            </Text>
            {COLOR_MODES.map(mode => (
              <TouchableOpacity
                key={mode.value}
                style={[styles.colorModeOption, selectedColorMode === mode.value && styles.colorModeOptionActive]}
                onPress={() => setSelectedColorMode(mode.value)}
              >
                <View style={styles.colorModeContent}>
                  <Text style={[styles.colorModeLabel, selectedColorMode === mode.value && styles.colorModeLabelActive]}>
                    {mode.label}
                  </Text>
                  <Text style={styles.colorModeDescription}>{mode.description}</Text>
                </View>
                {selectedColorMode === mode.value && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveColorMode}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Color Mode</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'strengths' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Strengths & Abilities</Text>
            <Text style={styles.sectionDescription}>
              Identify {childName}'s strengths and natural abilities.
            </Text>
            <View style={styles.chipContainer}>
              {STRENGTH_OPTIONS.map(strength => (
                <TouchableOpacity
                  key={strength}
                  style={[styles.chip, strengths.includes(strength) && styles.chipSelected]}
                  onPress={() => toggleFromList(strength, strengths, setStrengths)}
                >
                  <Text style={[styles.chipText, strengths.includes(strength) && styles.chipTextSelected]}>
                    {strength}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.addCustomContainer}>
              <TextInput
                style={styles.customInput}
                placeholder="Add custom strength..."
                value={newStrength}
                onChangeText={setNewStrength}
                onSubmitEditing={() => addCustomItem(newStrength, strengths, setStrengths, setNewStrength)}
              />
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => addCustomItem(newStrength, strengths, setStrengths, setNewStrength)}
              >
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveLearnerProfile}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Strengths</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'interests' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests & Passions</Text>
            <Text style={styles.sectionDescription}>
              Track what {childName} is interested in and passionate about.
            </Text>
            <View style={styles.chipContainer}>
              {INTEREST_OPTIONS.map(interest => (
                <TouchableOpacity
                  key={interest}
                  style={[styles.chip, interests.includes(interest) && styles.chipSelected]}
                  onPress={() => toggleFromList(interest, interests, setInterests)}
                >
                  <Text style={[styles.chipText, interests.includes(interest) && styles.chipTextSelected]}>
                    {interest}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.addCustomContainer}>
              <TextInput
                style={styles.customInput}
                placeholder="Add custom interest..."
                value={newInterest}
                onChangeText={setNewInterest}
                onSubmitEditing={() => addCustomItem(newInterest, interests, setInterests, setNewInterest)}
              />
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => addCustomItem(newInterest, interests, setInterests, setNewInterest)}
              >
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveLearnerProfile}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Interests</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'academic' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Academic Profile</Text>
            <Text style={styles.sectionDescription}>
              Track academic strengths, challenges, preferred subjects, and motivation factors.
            </Text>

            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Academic Strengths</Text>
              <View style={styles.addCustomContainer}>
                <TextInput
                  style={styles.customInput}
                  placeholder="Add academic strength (e.g., 'Strong in math', 'Excellent reader')..."
                  value={newAcademicStrength}
                  onChangeText={setNewAcademicStrength}
                  onSubmitEditing={() => addCustomItem(newAcademicStrength, academicStrengths, setAcademicStrengths, setNewAcademicStrength)}
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => addCustomItem(newAcademicStrength, academicStrengths, setAcademicStrengths, setNewAcademicStrength)}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.listContainer}>
                {academicStrengths.map((item, index) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={styles.listItemText}>{item}</Text>
                    <TouchableOpacity
                      onPress={() => setAcademicStrengths(academicStrengths.filter((_, i) => i !== index))}
                    >
                      <Text style={styles.removeButton}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Academic Challenges</Text>
              <View style={styles.addCustomContainer}>
                <TextInput
                  style={styles.customInput}
                  placeholder="Add challenge (e.g., 'Needs support with writing', 'Struggles with time management')..."
                  value={newAcademicChallenge}
                  onChangeText={setNewAcademicChallenge}
                  onSubmitEditing={() => addCustomItem(newAcademicChallenge, academicChallenges, setAcademicChallenges, setNewAcademicChallenge)}
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => addCustomItem(newAcademicChallenge, academicChallenges, setAcademicChallenges, setNewAcademicChallenge)}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.listContainer}>
                {academicChallenges.map((item, index) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={styles.listItemText}>{item}</Text>
                    <TouchableOpacity
                      onPress={() => setAcademicChallenges(academicChallenges.filter((_, i) => i !== index))}
                    >
                      <Text style={styles.removeButton}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Preferred Subjects</Text>
              <View style={styles.addCustomContainer}>
                <TextInput
                  style={styles.customInput}
                  placeholder="Add preferred subject..."
                  value={newPreferredSubject}
                  onChangeText={setNewPreferredSubject}
                  onSubmitEditing={() => addCustomItem(newPreferredSubject, preferredSubjects, setPreferredSubjects, setNewPreferredSubject)}
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => addCustomItem(newPreferredSubject, preferredSubjects, setPreferredSubjects, setNewPreferredSubject)}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.listContainer}>
                {preferredSubjects.map((item, index) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={styles.listItemText}>{item}</Text>
                    <TouchableOpacity
                      onPress={() => setPreferredSubjects(preferredSubjects.filter((_, i) => i !== index))}
                    >
                      <Text style={styles.removeButton}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Motivation Factors</Text>
              <View style={styles.addCustomContainer}>
                <TextInput
                  style={styles.customInput}
                  placeholder="Add motivation factor (e.g., 'Gamification', 'Real-world connections', 'Creative projects')..."
                  value={newMotivationFactor}
                  onChangeText={setNewMotivationFactor}
                  onSubmitEditing={() => addCustomItem(newMotivationFactor, motivationFactors, setMotivationFactors, setNewMotivationFactor)}
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => addCustomItem(newMotivationFactor, motivationFactors, setMotivationFactors, setNewMotivationFactor)}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.listContainer}>
                {motivationFactors.map((item, index) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={styles.listItemText}>{item}</Text>
                    <TouchableOpacity
                      onPress={() => setMotivationFactors(motivationFactors.filter((_, i) => i !== index))}
                    >
                      <Text style={styles.removeButton}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveLearnerProfile}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Academic Profile</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'recommendations' && (
          <View style={styles.section}>
            <RecommendationsPanel childId={childId} familyId={familyId} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  loadingText: {
    marginTop: 16,
    color: colors.muted,
    fontSize: 14,
  },
  header: {
    padding: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
  colorModeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  colorModeOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.blueSoft || colors.card,
  },
  colorModeContent: {
    flex: 1,
  },
  colorModeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  colorModeLabelActive: {
    color: colors.accent,
  },
  colorModeDescription: {
    fontSize: 14,
    color: colors.muted,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.white,
    fontWeight: '500',
  },
  addCustomContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  customInput: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
  addButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  subsection: {
    marginBottom: 24,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  listContainer: {
    marginTop: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  removeButton: {
    fontSize: 24,
    color: colors.error,
    fontWeight: 'bold',
    paddingHorizontal: 8,
  },
  saveButton: {
    marginTop: 20,
    padding: 16,
    backgroundColor: colors.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});

