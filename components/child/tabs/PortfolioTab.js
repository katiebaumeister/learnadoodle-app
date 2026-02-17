import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { shouldSuppressError } from '../../../lib/apiClient';
import { colors } from '../../../theme/colors';
import { safeImageUri } from '../../../lib/safeImageUri';

export default function PortfolioTab({ child }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortfolioItems();
  }, [child.id]);

  const fetchPortfolioItems = async () => {
    if (!child?.id) return;
    
    try {
      setLoading(true);
      
      const { data: uploads, error } = await supabase
        .from('uploads')
        .select('id, storage_path, title, url, kind, created_at, caption, subject_id, filename')
        .eq('child_id', child.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        // Log error details for debugging

        if (!shouldSuppressError(error) && error.code !== 'PGRST116') throw error;
      }

      if (!uploads || uploads.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Fetch subject names separately
      const subjectIds = [...new Set(uploads.map(u => u.subject_id).filter(Boolean))];
      const subjectLookup = {};
      
      if (subjectIds.length > 0) {
        const { data: subjects } = await supabase
          .from('subject')
          .select('id, name')
          .in('id', subjectIds);
        
        (subjects || []).forEach(s => {
          subjectLookup[s.id] = s.name;
        });
      }

      const formattedItems = uploads.map(upload => {
        // Extract filename from storage_path or use filename column if available
        const filename = upload.filename || (upload.storage_path ? upload.storage_path.split('/').pop() : '');
        const fileExt = filename?.split('.').pop()?.toLowerCase() || '';
        let type = 'File';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
          type = 'Photo';
        } else if (fileExt === 'pdf') {
          type = 'PDF';
        } else if (['doc', 'docx'].includes(fileExt)) {
          type = 'Document';
        }

        return {
          id: upload.id,
          type,
          subject: upload.subject_id ? (subjectLookup[upload.subject_id] || 'Unassigned') : 'Unassigned',
          title: upload.caption || upload.title || filename || 'Untitled',
          date: new Date(upload.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          thumbnailUrl: type === 'Photo' ? upload.url : null,
          url: upload.url,
        };
      });

      setItems(formattedItems);
    } catch (error) {
      setItems([]);
    } finally {
      setLoading(false);
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
        <Text style={styles.title}>Portfolio for {child.first_name}</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => {
            // TODO: Open upload modal
}}
        >
          <Plus size={14} color={colors.card} />
          <Text style={styles.addButtonText}>Upload work</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Upload photos, scans, or files from {child.first_name}'s work and we'll keep them here for transcripts and reporting.
          </Text>
        </View>
      ) : (
        <View style={styles.itemsGrid}>
          {items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              {safeImageUri(item.thumbnailUrl) ? (
                <Image 
                  source={{ uri: safeImageUri(item.thumbnailUrl) }} 
                  style={styles.thumbnail}
                  onError={(e) => {
                    // Suppress 404 errors for missing images - they're harmless
                    if (Platform.OS === 'web' && e.nativeEvent) {
                      e.preventDefault?.();
                    }
                  }}
                />
              ) : (
                <View style={styles.thumbnail} />
              )}
              <View style={styles.itemInfo}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{item.type}</Text>
                  </View>
                </View>
                <Text style={styles.itemMeta}>
                  {item.subject} • {item.date}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
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
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.card,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    margin: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  itemsGrid: {
    padding: 16,
    gap: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  itemCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  thumbnail: {
    aspectRatio: 4 / 3,
    width: '100%',
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
  },
  itemInfo: {
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  typeBadge: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeText: {
    fontSize: 11,
    color: colors.muted,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.muted,
  },
});

