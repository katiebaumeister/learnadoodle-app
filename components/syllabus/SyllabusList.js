import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { BookOpen, Filter, Search } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

export default function SyllabusList({ familyId, onSelectSyllabus, selectedChildId, selectedSubjectId }) {
  const [syllabi, setSyllabi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (familyId) {
      loadSyllabi();
    }
  }, [familyId, selectedChildId, selectedSubjectId]);

  const loadSyllabi = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('syllabi')
        .select(`
          *,
          child:children(id, first_name),
          subject:subject(id, name)
        `)
        .eq('family_id', familyId);

      if (selectedChildId) {
        query = query.eq('child_id', selectedChildId);
      }

      if (selectedSubjectId) {
        query = query.eq('subject_id', selectedSubjectId);
      }

      if (search) {
        query = query.ilike('title', `%${search}%`);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      setSyllabi(data || []);
    } catch (err) {
      console.error('Error loading syllabi:', err);
      setSyllabi([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading syllabi...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Search size={16} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search syllabi..."
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            // Debounce search
            setTimeout(() => loadSyllabi(), 300);
          }}
        />
      </View>

      {/* List */}
      <ScrollView style={styles.list}>
        {syllabi.length === 0 ? (
          <View style={styles.emptyState}>
            <BookOpen size={48} color={colors.muted} />
            <Text style={styles.emptyText}>No syllabi found</Text>
          </View>
        ) : (
          syllabi.map((syllabus) => (
            <TouchableOpacity
              key={syllabus.id}
              style={styles.item}
              onPress={() => onSelectSyllabus?.(syllabus.id)}
            >
              <BookOpen size={20} color={colors.primary} />
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{syllabus.title || 'Untitled Syllabus'}</Text>
                <View style={styles.itemMeta}>
                  {syllabus.child && (
                    <Text style={styles.itemMetaText}>
                      {syllabus.child.first_name || 'Child'}
                    </Text>
                  )}
                  {syllabus.subject && (
                    <>
                      <Text style={styles.itemMetaSeparator}>•</Text>
                      <Text style={styles.itemMetaText}>
                        {syllabus.subject.name || 'Subject'}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  list: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemMetaText: {
    fontSize: 12,
    color: colors.muted,
  },
  itemMetaSeparator: {
    fontSize: 12,
    color: colors.muted,
  },
  emptyState: {
    padding: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    padding: 40,
  },
});

