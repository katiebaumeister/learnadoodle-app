import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { colors } from '../../../theme/colors';

export default function NotesTab({ child }) {
  // TODO: load notes from Supabase and persist on save
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState([
    {
      id: "n1",
      createdAt: "Nov 12, 2025",
      body: "Really excited about the new science unit on space. Asking lots of questions.",
    },
  ]);

  const handleSave = () => {
    if (!draft.trim()) return;
    const newNote = {
      id: `local-${Date.now()}`,
      createdAt: new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      body: draft.trim(),
    };
    setNotes((prev) => [newNote, ...prev]);
    setDraft("");
    // TODO: POST to /api/records/notes
  };

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
            style={[styles.saveButton, !draft.trim() && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!draft.trim()}
          >
            <Text style={styles.saveButtonText}>Save note</Text>
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

