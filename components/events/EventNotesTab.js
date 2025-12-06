/**
 * EventNotesTab Component
 * Displays notes linked to an event and allows creating new notes
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { StickyNote, Plus, Edit2, Trash2 } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import NoteEditorModal from '../records/NoteEditorModal';

export default function EventNotesTab({ event, familyId, children = [] }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [availableEvents, setAvailableEvents] = useState([]);

  useEffect(() => {
    if (event?.id) {
      loadNotes();
      loadAvailableEvents();
    }
  }, [event?.id, familyId]);

  const loadNotes = async () => {
    if (!event?.id || !familyId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('family_id', familyId)
        .eq('linked_event_id', event.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading notes:', error);
        setNotes([]);
      } else {
        setNotes(data || []);
      }
    } catch (err) {
      console.error('Exception loading notes:', err);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableEvents = async () => {
    if (!familyId) return;
    try {
      const { data } = await supabase
        .from('events')
        .select('id, title, start_ts')
        .eq('family_id', familyId)
        .order('start_ts', { ascending: false })
        .limit(100);
      
      setAvailableEvents(data || []);
    } catch (err) {
      console.error('Error loading events:', err);
    }
  };

  const handleNoteSaved = () => {
    setShowNoteEditor(false);
    setEditingNote(null);
    loadNotes();
  };

  const handleDeleteNote = async (noteId) => {
    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId);

      if (error) {
        console.error('Error deleting note:', error);
        alert('Failed to delete note');
      } else {
        loadNotes();
      }
    } catch (err) {
      console.error('Exception deleting note:', err);
      alert('Failed to delete note');
    }
  };

  const handleEditNote = (note) => {
    setEditingNote(note);
    setShowNoteEditor(true);
  };

  const handleAddNote = () => {
    setEditingNote(null);
    setShowNoteEditor(true);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'observation': return '#3b82f6';
      case 'reflection': return '#8b5cf6';
      case 'milestone': return '#10b981';
      case 'concern': return '#f59e0b';
      case 'celebration': return '#ec4899';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notes</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddNote}
          activeOpacity={0.7}
        >
          <Plus size={16} color={colors.white} />
          <Text style={styles.addButtonText}>Add Note</Text>
        </TouchableOpacity>
      </View>

      {notes.length === 0 ? (
        <View style={styles.emptyState}>
          <StickyNote size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No notes yet</Text>
          <Text style={styles.emptyDescription}>
            Add a note to capture observations, reflections, or concerns about this lesson.
          </Text>
          <TouchableOpacity
            style={styles.emptyAddButton}
            onPress={handleAddNote}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyAddButtonText}>Add First Note</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.notesList} contentContainerStyle={styles.notesListContent}>
          {notes.map((note) => {
            const child = children.find(c => c.id === note.child_id);
            return (
              <View key={note.id} style={styles.noteCard}>
                <View style={styles.noteHeader}>
                  <View style={styles.noteHeaderLeft}>
                    <View
                      style={[
                        styles.typeBadge,
                        { backgroundColor: getTypeColor(note.type) + '20' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeBadgeText,
                          { color: getTypeColor(note.type) },
                        ]}
                      >
                        {note.type || 'log'}
                      </Text>
                    </View>
                    {child && (
                      <Text style={styles.childName}>{child.first_name || child.name}</Text>
                    )}
                  </View>
                  <Text style={styles.noteDate}>{formatDate(note.created_at)}</Text>
                </View>

                <Text style={styles.noteText}>{note.text}</Text>

                {note.tags && Array.isArray(note.tags) && note.tags.length > 0 && (
                  <View style={styles.tagsContainer}>
                    {note.tags.map((tag, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.noteActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleEditNote(note)}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={14} color={colors.muted} />
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => {
                      Alert.alert(
                        'Delete Note',
                        'Are you sure you want to delete this note?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => handleDeleteNote(note.id),
                          },
                        ]
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={14} color={colors.error} />
                    <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <NoteEditorModal
        visible={showNoteEditor}
        onClose={() => {
          setShowNoteEditor(false);
          setEditingNote(null);
        }}
        onSaved={handleNoteSaved}
        familyId={familyId}
        defaultChildId={event?.child_id || null}
        defaultText=""
        linkedEventId={event?.id || null}
        availableEvents={availableEvents}
        editingNoteId={editingNote?.id || null}
        initialNote={editingNote}
        children={children}
      />
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
    padding: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyAddButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  emptyAddButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  notesList: {
    flex: 1,
  },
  notesListContent: {
    padding: 16,
    gap: 12,
  },
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  noteHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  childName: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  noteDate: {
    fontSize: 12,
    color: colors.muted,
  },
  noteText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  tagText: {
    fontSize: 11,
    color: colors.muted,
  },
  noteActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionButtonText: {
    fontSize: 12,
    color: colors.muted,
  },
  deleteButton: {
    // Styled inline
  },
  deleteButtonText: {
    color: colors.error,
  },
});

