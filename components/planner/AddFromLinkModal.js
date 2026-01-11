import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { Link, X } from 'lucide-react';
import { addFromLink } from '../../lib/apiClient';
import { useToast } from '../Toast';
import ExploreNoticeBanner from '../explore/ExploreNoticeBanner';
import { colors } from '../../theme/colors';

export default function AddFromLinkModal({ 
  visible, 
  onClose, 
  familyId, 
  children = [], 
  onCreated 
}) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const isValidUrl = (url) => {
    if (!url || url.trim().length === 0) return false;
    const urlLower = url.toLowerCase().trim();
    return (
      /youtube\.com|youtu\.be/.test(urlLower) ||
      /khanacademy\.org/.test(urlLower) ||
      /coursera\.org/.test(urlLower) ||
      /^https?:\/\//.test(urlLower)
    );
  };

  const urlIsValid = isValidUrl(url);

  const handleSubmit = async () => {
    if (!urlIsValid) {
      toast.push('Please paste a valid URL (YouTube, Khan Academy, Coursera, or educational link)', 'error');
      return;
    }

    if (!familyId) {
      toast.push('Family ID is required', 'error');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await addFromLink({
        familyId,
        url: url.trim(),
      });

      if (error) {
        let errorMsg = 'Failed to add from link';
        if (error.detail) {
          errorMsg = error.detail;
        } else if (error.message) {
          errorMsg = error.message;
        }
        if (errorMsg.includes('Family ID')) {
          errorMsg = 'Family ID mismatch. Please refresh the page.';
        } else if (errorMsg.includes('authentication') || errorMsg.includes('login')) {
          errorMsg = 'This page requires login. Only public pages can be parsed.';
        } else if (errorMsg.includes('paywall')) {
          errorMsg = 'This page is behind a paywall. Only public content can be parsed.';
        } else if (errorMsg.includes('Invalid') || errorMsg.includes('not recognized')) {
          errorMsg = `Unable to parse this URL. Supported: YouTube, Khan Academy courses/units/lessons, Coursera courses, or general educational links.`;
        }
        toast.push(errorMsg, 'error');
        return;
      }

      if (!data) {
        toast.push('No data returned from server', 'error');
        return;
      }

      const previewTitle = data.preview_title || data.title || 'Course';
      const lessonCount = data.created_lessons || data.preview_count || 0;
      const totalMinutes = data.preview_total_minutes;
      
      const message = totalMinutes 
        ? `Added "${previewTitle}" with ${lessonCount} lesson${lessonCount !== 1 ? 's' : ''} (${totalMinutes} min total)`
        : `Added "${previewTitle}" with ${lessonCount} lesson${lessonCount !== 1 ? 's' : ''}`;
      
      toast.push(message, 'success');
      setUrl('');
      
      if (onCreated) {
        onCreated({ course_id: data.item_id || data.id, ...data });
      }
      
      onClose();
    } catch (err) {
      toast.push('Failed to add from link', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Link size={20} color={colors.accent} />
              <Text style={styles.title}>Add from Link</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.description}>
              Paste a URL from YouTube, Khan Academy, Coursera, or any educational link to turn it into lessons.
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                style={[styles.urlInput, !urlIsValid && url.length > 0 && styles.urlInputError]}
                placeholder="https://www.youtube.com/watch?v=... or https://www.khanacademy.org/..."
                placeholderTextColor="#9ca3af"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <TouchableOpacity
                style={[styles.submitButton, (!urlIsValid || loading) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!urlIsValid || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitButtonText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.helperText}>
              We only save titles, links, and durations. Content is viewed on the original provider&apos;s website under their Terms.
            </Text>

            {/* Third-Party Educational Content Notice */}
            <ExploreNoticeBanner />
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  description: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  urlInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    ...Platform.select({
      web: {
        outlineWidth: 0,
        outlineColor: 'transparent',
      },
    }),
  },
  urlInputError: {
    borderColor: '#ef4444',
  },
  submitButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
    minWidth: 70,
  },
  submitButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 16,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
});






