/**
 * Sticky Notes Container
 * Manages multiple sticky notes that persist across sessions
 */
import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import StickyNote from './StickyNote';

export default function StickyNotesContainer({ familyId, visible = true }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId || !visible) return;
    loadNotes();
  }, [familyId, visible]);

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('sticky_notes')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Error loading sticky notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async () => {
    try {
      const newNote = {
        family_id: familyId,
        text: '',
        position: { x: Math.random() * 300 + 100, y: Math.random() * 300 + 100 },
      };

      const { data, error } = await supabase
        .from('sticky_notes')
        .insert([newNote])
        .select()
        .single();

      if (error) throw error;
      setNotes([...notes, data]);
    } catch (error) {
      console.error('Error creating sticky note:', error);
    }
  };

  const handleUpdateNote = async (updatedNote) => {
    try {
      const { error } = await supabase
        .from('sticky_notes')
        .update({
          text: updatedNote.text,
          position: updatedNote.position,
        })
        .eq('id', updatedNote.id);

      if (error) throw error;
      setNotes(notes.map(n => n.id === updatedNote.id ? updatedNote : n));
    } catch (error) {
      console.error('Error updating sticky note:', error);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      const { error } = await supabase
        .from('sticky_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      setNotes(notes.filter(n => n.id !== noteId));
    } catch (error) {
      console.error('Error deleting sticky note:', error);
    }
  };

  if (!visible || loading) {
    return null;
  }

  return (
    <View style={[styles.container, { pointerEvents: 'box-none' }]}>
      {notes.map((note, index) => (
        <StickyNote
          key={note.id}
          note={note}
          onUpdate={handleUpdateNote}
          onDelete={handleDeleteNote}
          zIndex={1000 + index}
        />
      ))}
      <TouchableOpacity
        style={styles.addButton}
        onPress={handleCreateNote}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Plus size={20} color={colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    zIndex: 1000,
    pointerEvents: 'box-none',
  },
  addButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
      },
    }),
  },
});

