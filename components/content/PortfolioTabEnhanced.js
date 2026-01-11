import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, TextInput, Alert } from 'react-native';
import { Plus, Mic, Link2, Download, X, Play, Pause, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { shouldSuppressError } from '../../lib/apiClient';
import { colors } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

/**
 * Enhanced Portfolio Tab with voice notes, standards linking, and export
 */
export default function PortfolioTabEnhanced({ child, familyId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [standards, setStandards] = useState([]);
  const [selectedStandards, setSelectedStandards] = useState([]);
  const [recording, setRecording] = useState(false);
  const [audioUri, setAudioUri] = useState(null);

  useEffect(() => {
    if (child?.id) {
      fetchPortfolioItems();
      loadStandards();
    }
  }, [child?.id]);

  const fetchPortfolioItems = async () => {
    if (!child?.id) return;
    
    try {
      setLoading(true);
      
      const { data: uploads, error } = await supabase
        .from('uploads')
        .select(`
          id, storage_path, title, url, kind, created_at, caption, subject_id, filename,
          is_voice_note, voice_duration_seconds, auto_caption, auto_tags
        `)
        .eq('child_id', child.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        if (!shouldSuppressError(error) && error.code !== 'PGRST116') throw error;
      }

      if (!uploads || uploads.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Fetch linked standards for each upload
      const uploadIds = uploads.map(u => u.id);
      const { data: links } = await supabase
        .from('portfolio_evidence_links')
        .select('upload_id, link_type, linked_id')
        .in('upload_id', uploadIds)
        .eq('link_type', 'standard');

      const linksByUpload = {};
      (links || []).forEach(link => {
        if (!linksByUpload[link.upload_id]) {
          linksByUpload[link.upload_id] = [];
        }
        linksByUpload[link.upload_id].push(link.linked_id);
      });

      // Fetch subject names
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

      // Helper to validate if URL is valid (not just a UUID)
      const isValidUrl = (url) => {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (!trimmed) return false;
        
        // Check if it's just a UUID (invalid URL format)
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidPattern.test(trimmed)) {
          return false; // It's just a UUID, not a valid URL
        }
        
        // Valid URLs must start with http://, https://, or data:
        return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:');
      };

      const formattedItems = uploads.map(upload => {
        const filename = upload.filename || (upload.storage_path ? upload.storage_path.split('/').pop() : '');
        const fileExt = filename?.split('.').pop()?.toLowerCase() || '';
        let type = 'File';
        if (upload.is_voice_note) {
          type = 'Voice Note';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
          type = 'Photo';
        } else if (fileExt === 'pdf') {
          type = 'PDF';
        } else if (['mp4', 'mov', 'avi'].includes(fileExt)) {
          type = 'Video';
        }

        // Only use upload.url if it's a valid URL (not a UUID)
        const validUrl = upload.url && isValidUrl(upload.url) ? upload.url : null;

        return {
          id: upload.id,
          type,
          subject: upload.subject_id ? (subjectLookup[upload.subject_id] || 'Unassigned') : 'Unassigned',
          title: upload.auto_caption || upload.caption || upload.title || filename || 'Untitled',
          date: new Date(upload.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          thumbnailUrl: type === 'Photo' ? validUrl : null,
          url: validUrl,
          storage_path: upload.storage_path, // Include storage_path for creating signed URLs if needed
          isVoiceNote: upload.is_voice_note,
          voiceDuration: upload.voice_duration_seconds,
          autoTags: upload.auto_tags || [],
          linkedStandards: linksByUpload[upload.id] || [],
        };
      });

      setItems(formattedItems);
    } catch (error) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStandards = async () => {
    try {
      const { data } = await supabase
        .from('standards')
        .select('id, standard_code, standard_text')
        .limit(100);
      
      setStandards(data || []);
    } catch (error) {
    }
  };

  const handleLinkStandards = async () => {
    if (!selectedItem || selectedStandards.length === 0) return;

    try {
      // Remove existing links
      await supabase
        .from('portfolio_evidence_links')
        .delete()
        .eq('upload_id', selectedItem.id)
        .eq('link_type', 'standard');

      // Add new links
      const links = selectedStandards.map(standardId => ({
        upload_id: selectedItem.id,
        child_id: child.id,
        link_type: 'standard',
        linked_id: standardId,
      }));

      await supabase
        .from('portfolio_evidence_links')
        .insert(links);

      await fetchPortfolioItems();
      setShowLinkModal(false);
      setSelectedItem(null);
      setSelectedStandards([]);
      Alert.alert('Success', 'Standards linked successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to link standards');
    }
  };

  const handleExportPortfolio = async () => {
    Alert.alert(
      'Export Portfolio',
      'This will create a PDF export of the portfolio. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            try {
              // Create export record
              const { data, error } = await supabase
                .from('portfolio_exports')
                .insert({
                  child_id: child.id,
                  family_id: familyId,
                  export_type: 'pdf',
                  status: 'pending',
                })
                .select()
                .single();

              if (error) throw error;

              Alert.alert(
                'Export Started',
                'Your portfolio export is being prepared. You will be notified when it\'s ready.',
                [{ text: 'OK' }]
              );

              // In a real implementation, this would trigger a background job
              // For now, we'll just mark it as processing
            } catch (error) {
              Alert.alert('Error', 'Failed to start export');
            }
          },
        },
      ]
    );
  };

  const handleRecordVoiceNote = async () => {
    // This would integrate with a voice recording library
    // For React Native: react-native-audio-recorder-player or expo-av
    // For web: MediaRecorder API
    Alert.alert(
      'Voice Recording',
      'Voice recording functionality requires audio recording library integration.',
      [{ text: 'OK' }]
    );
  };

  const renderItem = (item) => {
    return (
      <View key={item.id} style={styles.itemCard}>
        {item.thumbnailUrl ? (
          <Image 
            source={{ uri: item.thumbnailUrl }} 
            style={styles.thumbnail}
            onError={(e) => {
              // Suppress 404 errors for missing images - they're harmless
              if (Platform.OS === 'web' && e.nativeEvent) {
                e.preventDefault?.();
              }
            }}
          />
        ) : item.isVoiceNote ? (
          <View style={[styles.thumbnail, styles.voiceThumbnail]}>
            <Mic size={32} color={colors.text} />
            {item.voiceDuration && (
              <Text style={styles.voiceDuration}>
                {Math.floor(item.voiceDuration / 60)}:{(item.voiceDuration % 60).toString().padStart(2, '0')}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.thumbnail} />
        )}
        
        <View style={styles.itemInfo}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{item.type}</Text>
            </View>
          </View>
          
          <Text style={styles.itemMeta}>
            {item.subject} • {item.date}
          </Text>

          {item.linkedStandards.length > 0 && (
            <View style={styles.standardsBadge}>
              <Award size={12} color={colors.muted} />
              <Text style={styles.standardsText}>
                {item.linkedStandards.length} standard{item.linkedStandards.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}

          {item.autoTags.length > 0 && (
            <View style={styles.tagsContainer}>
              {item.autoTags.slice(0, 3).map((tag, idx) => (
                <View key={idx} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.itemActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                setSelectedItem(item);
                setSelectedStandards(item.linkedStandards);
                setShowLinkModal(true);
              }}
            >
              <Link2 size={14} color={colors.muted} />
              <Text style={styles.actionText}>Link Standards</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
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
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleRecordVoiceNote}
          >
            <Mic size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleExportPortfolio}
          >
            <Download size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => {
              // TODO: Open upload modal
}}
          >
            <Plus size={14} color={colors.card} />
            <Text style={styles.addButtonText}>Upload</Text>
          </TouchableOpacity>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Upload photos, scans, files, or record voice notes from {child.first_name}'s work.
          </Text>
        </View>
      ) : (
        <View style={styles.itemsGrid}>
          {items.map(renderItem)}
        </View>
      )}

      {/* Link Standards Modal */}
      <Modal
        visible={showLinkModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowLinkModal(false);
          setSelectedItem(null);
          setSelectedStandards([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Link Standards</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowLinkModal(false);
                  setSelectedItem(null);
                  setSelectedStandards([]);
                }}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalText}>
              Select standards that this portfolio item demonstrates:
            </Text>

            <ScrollView style={styles.standardsList}>
              {standards.map(standard => {
                const isSelected = selectedStandards.includes(standard.id);
                return (
                  <TouchableOpacity
                    key={standard.id}
                    style={[
                      styles.standardOption,
                      isSelected && styles.standardOptionSelected
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedStandards(selectedStandards.filter(id => id !== standard.id));
                      } else {
                        setSelectedStandards([...selectedStandards, standard.id]);
                      }
                    }}
                  >
                    <Text style={styles.standardCode}>{standard.standard_code}</Text>
                    <Text style={styles.standardText} numberOfLines={2}>
                      {standard.standard_text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setShowLinkModal(false);
                  setSelectedItem(null);
                  setSelectedStandards([]);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleLinkStandards}
              >
                <Text style={styles.saveButtonText}>Link Standards</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  voiceThumbnail: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  voiceDuration: {
    fontSize: 12,
    color: colors.muted,
  },
  itemInfo: {
    gap: 6,
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
  standardsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  standardsText: {
    fontSize: 11,
    color: colors.muted,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  tag: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 10,
    color: colors.muted,
  },
  itemActions: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 12,
    color: colors.muted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 600,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalText: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  standardsList: {
    maxHeight: 400,
    marginBottom: 16,
  },
  standardOption: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  standardOptionSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  standardCode: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  standardText: {
    fontSize: 13,
    color: colors.muted,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: colors.bgSubtle,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.text,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.card,
  },
});

