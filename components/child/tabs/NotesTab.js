import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { shouldSuppressError } from '../../../lib/apiClient';
import { colors } from '../../../theme/colors';

export default function NotesTab({ child }) {
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [child.id]);

  const fetchNotes = async () => {
    if (!child?.id) return;
    
    try {
      setLoading(true);
      
      // Check if there's a notes/records table, otherwise use events with notes
      const { data: recordsNotes, error: recordsError } = await supabase
        .from('records')
        .select('id, notes, created_at')
        .eq('child_id', child.id)
        .not('notes', 'is', null)
        .order('created_at', { ascending: false });

      if (recordsError && !shouldSuppressError(recordsError) && recordsError.code !== 'PGRST116') {
        // Table might not exist, try events table
        const { data: eventNotes, error: eventsError } = await supabase
          .from('events')
          .select('id, description, created_at')
          .eq('child_id', child.id)
          .not('description', 'is', null)
          .eq('source', 'note')
          .order('created_at', { ascending: false });

        if (!eventsError && eventNotes) {
          const formattedNotes = eventNotes.map(note => ({
            id: note.id,
            createdAt: new Date(note.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            body: note.description,
          }));
          setNotes(formattedNotes);
        }
      } else if (recordsNotes) {
        const formattedNotes = recordsNotes.map(note => ({
          id: note.id,
          createdAt: new Date(note.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          body: note.notes,
        }));
        setNotes(formattedNotes);
      }
    } catch (error) {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!draft.trim() || !child?.id) return;
    
    try {
      setSaving(true);
      
      // Try to save to records table first
      const { data: profile } = await supabase.auth.getUser();
      if (!profile?.user) throw new Error('Not authenticated');

      const { data: familyData } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', profile.user.id)
        .single();

      if (!familyData?.family_id) throw new Error('No family found');

      // Try records table
      const { error: recordsError } = await supabase
        .from('records')
        .insert({
          family_id: familyData.family_id,
          child_id: child.id,
          notes: draft.trim(),
        });

      if (recordsError && recordsError.code !== 'PGRST116') {
        // If records table doesn't exist, create an event with source='note'
        const { error: eventError } = await supabase
          .from('events')
          .insert({
            family_id: familyData.family_id,
            child_id: child.id,
            title: 'Note',
            description: draft.trim(),
            source: 'note',
            status: 'done',
            start_ts: new Date().toISOString(),
            end_ts: new Date().toISOString(),
          });

        if (eventError) throw eventError;
      }

      // Refresh notes
      await fetchNotes();
      setDraft("");
    } catch (error) {
      alert('Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notes about {child.first_name}</Text>
      </View>

      <View style={styles.editorCard}>
        <TextInput
          style={styles.textarea}
          placeholder={`Write observations, questions, or ideas about ${child.first_name}'s learning...`}
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          multiline
          textAlignVertical="top"
        />
        <View style={styles.editorActions}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setDraft("")}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, (!draft.trim() || saving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!draft.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.card} />
            ) : (
              <Text style={styles.saveButtonText}>Save note</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.notesList}>
        {notes.length === 0 ? (
          <Text style={styles.emptyText}>
            No notes yet. Use this space to capture stories, concerns, and wins—it makes transcripts and portfolios much richer.
          </Text>
        ) : (
          notes.map((note) => (
            <View key={note.id} style={styles.noteCard}>
              <Text style={styles.noteDate}>{note.createdAt}</Text>
              <Text style={styles.noteBody}>{note.body}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  header: {
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  editorCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    gap: 12,
  },
  textarea: {
    minHeight: 140,
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
    padding: 12,
    fontSize: 14,
    color: colors.text,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  clearButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButtonText: {
    fontSize: 12,
    color: colors.muted,
  },
  saveButton: {
    borderRadius: 999,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.card,
  },
  notesList: {
    padding: 16,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    padding: 16,
  },
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  noteDate: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  noteBody: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});

