import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Paperclip, X, FileText, Image, Video, File } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';

export default function MaterialsAttachment({ 
  familyId, 
  childId, 
  subjectId,
  selectedMaterialIds = [], 
  onSelectionChange,
  maxSelections = null 
}) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set(selectedMaterialIds || []));
  const toast = useToast();

  useEffect(() => {
    loadMaterials();
  }, [familyId, childId, subjectId]);

  useEffect(() => {
    // Sync external changes
    setSelectedIds(new Set(selectedMaterialIds || []));
  }, [selectedMaterialIds]);

  const loadMaterials = async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('uploads')
        .select('id, title, mime, created_at, storage_path')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (childId) {
        query = query.or(`child_id.eq.${childId},child_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setMaterials(data || []);
    } catch (error) {
      toast.push('Failed to load materials', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (materialId) => {
    const newSelected = new Set(selectedIds);
    
    if (newSelected.has(materialId)) {
      newSelected.delete(materialId);
    } else {
      if (maxSelections && newSelected.size >= maxSelections) {
        toast.push(`Maximum ${maxSelections} materials allowed`, 'error');
        return;
      }
      newSelected.add(materialId);
    }
    
    setSelectedIds(newSelected);
    onSelectionChange?.(Array.from(newSelected));
  };

  const getMimeIcon = (mime) => {
    if (mime?.startsWith('image/')) return <Image size={16} color="#3b82f6" />;
    if (mime?.startsWith('video/')) return <Video size={16} color="#ef4444" />;
    if (mime === 'application/pdf') return <FileText size={16} color="#ef4444" />;
    return <File size={16} color="#6b7280" />;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Paperclip size={16} color="#6b7280" />
        <Text style={styles.title}>Attach Materials</Text>
        {selectedIds.size > 0 && (
          <Text style={styles.count}>{selectedIds.size} selected</Text>
        )}
      </View>

      {materials.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No materials available</Text>
          <Text style={styles.emptySubtext}>Upload materials in the Materials Library</Text>
        </View>
      ) : (
        <ScrollView style={styles.materialsList} nestedScrollEnabled>
          {materials.map((material) => {
            const isSelected = selectedIds.has(material.id);
            return (
              <TouchableOpacity
                key={material.id}
                style={[styles.materialItem, isSelected && styles.materialItemSelected]}
                onPress={() => toggleSelection(material.id)}
              >
                <View style={styles.materialIcon}>
                  {getMimeIcon(material.mime)}
                </View>
                <View style={styles.materialInfo}>
                  <Text style={styles.materialTitle} numberOfLines={1}>
                    {material.title || 'Untitled'}
                  </Text>
                  <Text style={styles.materialMeta}>
                    {new Date(material.created_at).toLocaleDateString()}
                  </Text>
                </View>
                {isSelected && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  count: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 'auto',
  },
  materialsList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  materialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  materialItemSelected: {
    backgroundColor: '#eff6ff',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  materialIcon: {
    marginRight: 12,
  },
  materialInfo: {
    flex: 1,
  },
  materialTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  materialMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  checkmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6b7280',
  },
});

