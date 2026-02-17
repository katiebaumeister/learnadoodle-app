import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Alert, Image, Platform } from 'react-native';
import { Upload, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { shouldSuppressError } from '../../lib/apiClient';
import { colors, shadows } from '../../theme/colors';
import { createFileMaterial } from '../../lib/services/materialsClient';
import { safeImageUri } from '../../lib/safeImageUri';

export default function Uploads({ familyId, initialChildren = [] }) {
  const [items, setItems] = useState([]);
  const [children, setChildren] = useState(initialChildren);
  const [q, setQ] = useState('');
  const [childIds, setChildIds] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load children if not provided
      if (children.length === 0) {
        const { data: kids } = await supabase
          .from('children')
          .select('id, first_name')
          .eq('family_id', familyId)
          .eq('archived', false)
          .order('first_name');
        setChildren(kids || []);
      }

      // Load file-based materials (replaces uploads)
      // Handle child filter via material_children junction table
      let materialIds = null;
      
      if (childIds && childIds.length > 0) {
        const { data: mcData } = await supabase
          .from('material_children')
          .select('material_id')
          .in('child_id', childIds)
          .eq('family_id', familyId);
        materialIds = mcData?.map(mc => mc.material_id) || [];
        if (materialIds.length === 0) {
          setItems([]);
          return;
        }
      }
      
      let query = supabase
        .from('materials')
        .select('id, title, filename, storage_path, created_at, mime, bytes, tags, subject_id, event_id')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .not('storage_path', 'is', null) // Only file-based materials
        .order('created_at', { ascending: false });
      
      if (materialIds) {
        query = query.in('id', materialIds);
      }
      
      if (q) {
        query = query.or(`title.ilike.%${q}%,filename.ilike.%${q}%,storage_path.ilike.%${q}%`);
      }
      
      const { data, error } = await query;
      
      if (error && !shouldSuppressError(error)) {
        Alert.alert('Error', 'Failed to load files');
      }
      
      // Get child_ids from material_children for display
      if (data && data.length > 0) {
        const ids = data.map(m => m.id);
        const { data: mcData } = await supabase
          .from('material_children')
          .select('material_id, child_id')
          .in('material_id', ids);
        
        const childIdMap = new Map();
        (mcData || []).forEach(mc => {
          if (!childIdMap.has(mc.material_id)) {
            childIdMap.set(mc.material_id, mc.child_id);
          }
        });
        
        const itemsWithChildId = (data || []).map(m => ({
          ...m,
          child_id: childIdMap.get(m.id) || null,
        }));
        
        setItems(itemsWithChildId);
      } else {
        setItems(data || []);
      }
    } catch (error) {
      if (!shouldSuppressError(error)) {
        Alert.alert('Error', 'Failed to load uploads');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (familyId) {
      loadData();
    }
  }, [familyId, q, JSON.stringify(childIds)]);

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const path = `${familyId}/${crypto.randomUUID()}_${file.name}`;

    try {
      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
          metadata: { family_id: familyId }
        });

      if (uploadError) {
        Alert.alert('Upload Error', uploadError.message);
        return;
      }

      // Create file material (replaces uploads table insert)
      const uploadRecord = await createFileMaterial({
        familyId,
        storagePath: uploadData?.path,
        title: file.name,
        mime: file.type || 'application/octet-stream',
        bytes: file.size,
      });

      // Get upload ID and file URL for auto-captioning
      const uploadId = uploadRecord?.id;
      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(uploadData?.path);
      const fileUrl = urlData?.publicUrl;

      // Trigger auto-captioning (non-blocking)
      if (uploadId && fileUrl) {
        autoCaptionOnUpload(uploadId, file.type, fileUrl, file.name).catch(err => {
        });
      }

      await loadData();
      Alert.alert('Success', 'File uploaded successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to upload file');
    }
  };

  const getFilePreview = (item) => {
    if (item.mime?.startsWith('image/')) {
      return <SignedImage path={item.storage_path} />;
    } else if (item.mime === 'application/pdf') {
      return (
        <View style={styles.pdfPreview}>
          <Text style={styles.pdfText}>PDF</Text>
          <View style={styles.pdfActions}>
            <PDFViewer uploadId={item.id} familyId={familyId} />
            <MagicExtract
              uploadId={item.id}
              onExtracted={(extractedItem, type) => {
                Alert.alert('Extracted', `${type} extracted. Create event from extracted item?`);
              }}
            />
          </View>
        </View>
      );
    } else {
      return (
        <View style={styles.filePreview}>
          <Text style={styles.fileText}>{item.mime?.split('/')[1]?.toUpperCase() || 'FILE'}</Text>
        </View>
      );
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const fileInputRef = useRef(null);

  const handleUploadClick = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Uploads</Text>
        <TouchableOpacity style={styles.uploadButton} onPress={handleUploadClick} activeOpacity={0.7}>
          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => handleFileUpload(e.target.files)}
              accept="*/*"
            />
          )}
          <Upload size={16} color={colors.text} />
          <Text style={styles.uploadText}>Upload</Text>
        </TouchableOpacity>
      </View>

      {/* Search and filters */}
      <View style={styles.searchSection}>
        <View style={styles.searchInput}>
          <Search size={16} color={colors.muted} />
          <TextInput
            style={styles.searchField}
            placeholder="Search files..."
            value={q}
            onChangeText={setQ}
          />
        </View>
        
        {/* Child filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterRow}>
            {children.map(child => {
              const active = childIds?.includes(child.id) ?? false;
              return (
                <TouchableOpacity
                  key={child.id}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => {
                    setChildIds(prev => 
                      !prev 
                        ? [child.id] 
                        : prev.includes(child.id)
                          ? prev.filter(id => id !== child.id)
                          : [...prev, child.id]
                    );
                  }}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {child.first_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.filterChip}
              onPress={() => setChildIds(null)}
            >
              <Text style={styles.filterChipText}>All</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* Files grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading files...</Text>
        </View>
      ) : (
        <View style={styles.filesGrid}>
          {items.map(item => (
            <View key={item.id} style={styles.fileCard}>
              <View style={styles.filePreview}>
                {getFilePreview(item)}
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.fileMeta}>
                  {formatFileSize(item.bytes)} • {new Date(item.created_at).toLocaleDateString()}
                </Text>
                {item.child_id && (
                  <Text style={styles.fileChild}>
                    {children.find(c => c.id === item.child_id)?.first_name || 'Child'}
                  </Text>
                )}
              </View>
            </View>
          ))}
          
          {items.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No files uploaded yet</Text>
              <Text style={styles.emptySubtext}>Upload your first file to get started</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// Signed Image Component
function SignedImage({ path }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const getSignedUrl = async () => {
      try {
        const { data } = await supabase.storage
          .from('evidence')
          .createSignedUrl(path, 60);
        setUrl(data?.signedUrl || null);
      } catch (error) {
      }
    };

    if (path) {
      getSignedUrl();
    }
  }, [path]);

  if (!url) {
    return (
      <View style={styles.imagePlaceholder}>
        <Text style={styles.placeholderText}>Loading...</Text>
      </View>
    );
  }

  const safeUrl = safeImageUri(url);
  return safeUrl ? (
    <Image
      source={{ uri: safeUrl }}
      style={styles.imagePreview}
      resizeMode="cover"
    />
  ) : (
    <View style={styles.imagePlaceholder}>
      <Text style={styles.placeholderText}>Image unavailable</Text>
    </View>
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
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  uploadText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  searchSection: {
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: 16,
  },
  searchField: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipActive: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blueBold,
  },
  filterChipText: {
    fontSize: 13,
    color: colors.text,
  },
  filterChipTextActive: {
    color: colors.blueBold,
    fontWeight: '500',
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.muted,
  },
  filesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  fileCard: {
    width: '47%',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  filePreview: {
    aspectRatio: 16/9,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
  },
  placeholderText: {
    fontSize: 12,
    color: colors.muted,
  },
  pdfPreview: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.redSoft,
  },
  pdfText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.redBold,
  },
  filePreview: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
  },
  fileText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
  },
  fileInfo: {
    padding: 12,
  },
  fileTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  fileMeta: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  fileChild: {
    fontSize: 11,
    color: colors.blueBold,
    fontWeight: '500',
  },
  emptyState: {
    width: '100%',
    padding: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.muted,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.muted,
  },
});
