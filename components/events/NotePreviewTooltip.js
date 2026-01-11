/**
 * NotePreviewTooltip Component
 * Shows note preview on hover for events
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { StickyNote } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

export default function NotePreviewTooltip({ eventId, familyId, visible, position }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && eventId && familyId) {
      loadNotes();
    } else {
      setNotes([]);
    }
  }, [visible, eventId, familyId]);

  const loadNotes = async () => {
    if (!eventId || !familyId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('id, text, type, created_at')
        .eq('family_id', familyId)
        .eq('linked_event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(3); // Show max 3 notes in preview

      if (error) {
        setNotes([]);
      } else {
        setNotes(data || []);
      }
    } catch (err) {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  if (!visible || notes.length === 0) {
    return null;
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const truncateText = (text, maxLength = 60) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <View
      style={[
        styles.tooltip,
        position && {
          position: 'absolute',
          left: position.x,
          top: position.y,
        },
      ]}
    >
      <View style={styles.header}>
        <StickyNote size={14} color={colors.primary} />
        <Text style={styles.headerText}>
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </Text>
      </View>
      {loading ? (
        <Text style={styles.loadingText}>Loading...</Text>
      ) : (
        <View style={styles.notesList}>
          {notes.map((note) => (
            <View key={note.id} style={styles.noteItem}>
              <Text style={styles.noteText}>{truncateText(note.text)}</Text>
              <Text style={styles.noteDate}>{formatDate(note.created_at)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
    minWidth: 200,
    maxWidth: 300,
    zIndex: 10000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  loadingText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  },
  notesList: {
    gap: 8,
  },
  noteItem: {
    gap: 4,
  },
  noteText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
  noteDate: {
    fontSize: 10,
    color: colors.muted,
  },
});

