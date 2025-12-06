import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Alert, TextInput } from 'react-native';
import { FileText, Copy, X, Search, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

/**
 * PDF Viewer Component with Copy/Paste functionality
 * Shows PDF preview and allows copying extracted text
 */
export default function PDFViewer({ uploadId, familyId, bucket = 'evidence' }) {
  const [extractedText, setExtractedText] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedText, setHighlightedText] = useState('');

  const handleExtractText = async () => {
    setLoading(true);
    try {
      const { data, error } = await apiRequest('/api/content/extract-pdf-text', {
        method: 'POST',
        body: JSON.stringify({
          upload_id: uploadId,
          bucket: bucket,
        }),
      });

      if (error) throw error;

      if (data.success && data.text) {
        setExtractedText(data.text);
        setShowTextModal(true);
      } else {
        Alert.alert('Error', data.error || 'Failed to extract text from PDF');
      }
    } catch (error) {
      console.error('Error extracting PDF text:', error);
      Alert.alert('Error', 'Failed to extract text from PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = async () => {
    if (!extractedText) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(extractedText);
        Alert.alert('Success', 'Text copied to clipboard');
      } else {
        // Fallback for React Native
        // You would use Clipboard from @react-native-clipboard/clipboard
        Alert.alert('Info', 'Copy functionality requires clipboard API');
      }
    } catch (error) {
      console.error('Error copying text:', error);
      Alert.alert('Error', 'Failed to copy text');
    }
  };

  const handleSearch = () => {
    if (!extractedText || !searchQuery.trim()) {
      setHighlightedText('');
      return;
    }

    // Simple text highlighting (case-insensitive)
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    const parts = extractedText.split(regex);
    
    // Store search query for highlighting in render
    setHighlightedText(searchQuery);
  };

  const renderTextWithHighlight = () => {
    if (!extractedText) return null;
    if (!highlightedText) {
      return <Text style={styles.textContent}>{extractedText}</Text>;
    }

    const regex = new RegExp(`(${highlightedText})`, 'gi');
    const parts = extractedText.split(regex);
    
    return (
      <Text style={styles.textContent}>
        {parts.map((part, index) => 
          regex.test(part) ? (
            <Text key={index} style={styles.highlightedText}>
              {part}
            </Text>
          ) : (
            part
          )
        )}
      </Text>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.extractButton}
        onPress={handleExtractText}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <FileText size={16} color={colors.text} />
        )}
        <Text style={styles.extractButtonText}>
          {loading ? 'Extracting...' : 'Extract & Copy Text'}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showTextModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTextModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>PDF Text Content</Text>
              <TouchableOpacity onPress={() => setShowTextModal(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
              <View style={styles.searchInputContainer}>
                <Search size={16} color={colors.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search in text..."
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    if (!text.trim()) {
                      setHighlightedText('');
                    }
                  }}
                  onSubmitEditing={handleSearch}
                />
              </View>
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearch}
              >
                <Text style={styles.searchButtonText}>Search</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.textContainer}>
              {renderTextWithHighlight()}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.copyButton]}
                onPress={handleCopyText}
              >
                <Copy size={16} color={colors.card} />
                <Text style={styles.copyButtonText}>Copy All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.closeButton]}
                onPress={() => setShowTextModal(false)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  extractButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  extractButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
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
    maxWidth: 800,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  searchBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.bgSubtle,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  searchButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.text,
    borderRadius: 8,
  },
  searchButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.card,
  },
  textContainer: {
    flex: 1,
    minHeight: 300,
    maxHeight: 400,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  textContent: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontFamily: 'monospace',
  },
  highlightedText: {
    backgroundColor: '#FFEB3B',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  copyButton: {
    backgroundColor: colors.text,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.card,
  },
  closeButton: {
    backgroundColor: colors.bgSubtle,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
});

