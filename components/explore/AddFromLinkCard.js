import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Link, Calendar } from 'lucide-react';
import { addFromLink } from '../../lib/apiClient';
import { useToast } from '../Toast';

export default function AddFromLinkCard({ familyId, children = [], onCreated }) {
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
        console.error('Error adding from link:', error);
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
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      toast.push('Failed to add from link', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Add from link</Text>
      </View>
      
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

      {children.length > 0 && (
        <TouchableOpacity
          style={styles.scheduleLink}
          onPress={() => {
            // This can link to planner settings or trigger scheduling flow
            // For now, just show a toast - can be enhanced later
            toast.push('Schedule automatically settings coming soon', 'info');
          }}
        >
          <Calendar size={12} color="#3b82f6" />
          <Text style={styles.scheduleLinkText}>Schedule automatically</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  description: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  urlInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
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
    backgroundColor: '#3b82f6',
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
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 8,
    lineHeight: 16,
  },
  scheduleLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
  },
  scheduleLinkText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
});

