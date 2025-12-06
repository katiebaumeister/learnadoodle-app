/**
 * InlineNotesIndicator Component
 * Small badge showing note count for events - can be embedded in event cards
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StickyNote } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

export default function InlineNotesIndicator({ eventId, familyId, size = 'small' }) {
  const [noteCount, setNoteCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (eventId && familyId) {
      loadNoteCount();
    }
  }, [eventId, familyId]);

  const loadNoteCount = async () => {
    if (!eventId || !familyId) return;
    
    setLoading(true);
    try {
      const { count, error } = await supabase
        .from('notes')
        .select('*', { count: 'exact', head: true })
        .eq('family_id', familyId)
        .eq('linked_event_id', eventId);

      if (error) {
        console.error('Error loading note count:', error);
        setNoteCount(0);
      } else {
        setNoteCount(count || 0);
      }
    } catch (err) {
      console.error('Exception loading note count:', err);
      setNoteCount(0);
    } finally {
      setLoading(false);
    }
  };

  if (loading || noteCount === 0) {
    return null;
  }

  const isSmall = size === 'small';
  const iconSize = isSmall ? 10 : 12;
  const fontSize = isSmall ? 9 : 10;
  const padding = isSmall ? 3 : 4;

  return (
    <View style={[styles.container, isSmall && styles.containerSmall]}>
      <StickyNote size={iconSize} color={colors.primary} />
      {noteCount > 1 && (
        <Text style={[styles.count, { fontSize }, isSmall && styles.countSmall]}>
          {noteCount}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 3,
    backgroundColor: colors.primarySoft || '#e3f2fd',
    borderRadius: 8,
    marginLeft: 4,
  },
  containerSmall: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRadius: 6,
  },
  count: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    minWidth: 12,
    textAlign: 'center',
  },
  countSmall: {
    fontSize: 9,
    minWidth: 10,
  },
});

