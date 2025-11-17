import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { ArrowLeft, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AddActivityForm({ familyId, selectedChildId = null, onBack, onActivityAdded, onOpenGoals, onOpenBacklog }) {
  const [activityName, setActivityName] = useState('');
  const [activityType, setActivityType] = useState('assignment');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasGoals, setHasGoals] = useState(true);
  const [hasBacklog, setHasBacklog] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        if (!familyId) return;
        // Detect any active subject goals for this family (any child)
        let goalsQuery = supabase
          .from('subject_goals')
          .select('id')
          .eq('is_active', true)
          .limit(1);
        if (selectedChildId) goalsQuery = goalsQuery.eq('child_id', selectedChildId);
        const { data: goals } = await goalsQuery;
        setHasGoals((goals || []).length > 0);

        // Detect any backlog items (events with status='backlog') for this family
        let backlogQuery = supabase
          .from('events')
          .select('id')
          .eq('status', 'backlog')
          .limit(1);
        if (selectedChildId) backlogQuery = backlogQuery.eq('child_id', selectedChildId);
        const { data: backlog } = await backlogQuery;
        setHasBacklog((backlog || []).length > 0);
      } catch {}
    };
    run();
  }, [familyId, selectedChildId]);

  const handleSave = async () => {
    if (!activityName.trim() || !subject.trim()) {
      Alert.alert('Required Fields', 'Please fill in the activity name and subject.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('activities')
        .insert({
          family_id: familyId,
          name: activityName.trim(),
          activity_type: activityType,
          subject_id: null, // This would need to be linked to actual subjects
          schedule_data: {
            due_date: dueDate || null,
            description: description.trim(),
            status: 'pending'
          },
          description: '',
        })
        .select()
        .single();

      if (error) throw error;

      Alert.alert('Success', 'Activity created successfully!', [
        { text: 'OK', onPress: () => {
          if (onActivityAdded) onActivityAdded(data);
          onBack();
        }}
      ]);
    } catch (error) {
      console.error('Error creating activity:', error);
      Alert.alert('Error', 'Failed to create activity. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <ArrowLeft size={24} color="#38B6FF" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add New Activity</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Suggestions / CTAs */}
        {(!hasGoals || !hasBacklog) && (
          <View style={styles.suggestions}>
            {!hasGoals && (
              <View style={styles.suggestionCard}>
                <Text style={styles.suggestionTitle}>Set weekly goals</Text>
                <Text style={styles.suggestionBody}>Create minutes-per-week goals so we can suggest quick top‑offs.</Text>
                <TouchableOpacity
                  style={styles.suggestionButton}
                  onPress={() => {
                    if (onOpenGoals) onOpenGoals(); else Alert.alert('Open Goals', 'Go to Records → Goals to add weekly goals.');
                  }}
                >
                  <Text style={styles.suggestionButtonText}>Open Goals</Text>
                </TouchableOpacity>
              </View>
            )}
            {!hasBacklog && (
              <View style={styles.suggestionCard}>
                <Text style={styles.suggestionTitle}>Add a backlog item</Text>
                <Text style={styles.suggestionBody}>Capture work to schedule later. We’ll show it here for one‑tap scheduling.</Text>
                <TouchableOpacity
                  style={styles.suggestionButton}
                  onPress={() => {
                    if (onOpenBacklog) onOpenBacklog(); else Alert.alert('Open Backlog', 'Open Planner → Backlog to add items.');
                  }}
                >
                  <Text style={styles.suggestionButtonText}>Open Backlog</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Activity Name *</Text>
            <TextInput
              style={styles.input}
              value={activityName}
              onChangeText={setActivityName}
              placeholder="e.g., Math Worksheet #3"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Activity Type</Text>
            <View style={styles.typeButtons}>
              {['assignment', 'project', 'quiz', 'reading', 'other'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeButton,
                    activityType === type && styles.typeButtonActive
                  ]}
                  onPress={() => setActivityType(type)}
                >
                  <Text style={[
                    styles.typeButtonText,
                    activityType === type && styles.typeButtonTextActive
                  ]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Subject *</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="e.g., Mathematics, Science, Language Arts"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the activity, requirements, and learning objectives..."
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Due Date (Optional)</Text>
            <TextInput
              style={styles.input}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isLoading}
          >
            <Save size={20} color="#ffffff" />
            <Text style={styles.saveButtonText}>
              {isLoading ? 'Creating...' : 'Create Activity'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#38B6FF',
    fontWeight: '500',
    marginLeft: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    flex: 1,
  },
  placeholder: {
    width: 60,
  },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  suggestionCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  suggestionBody: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  suggestionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#38B6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  suggestionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  typeButtonActive: {
    backgroundColor: '#38B6FF',
    borderColor: '#38B6FF',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  saveButton: {
    backgroundColor: '#38B6FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
