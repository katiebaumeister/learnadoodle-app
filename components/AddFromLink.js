import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import { Link, Plus } from 'lucide-react';
import { addFromLink } from '../lib/apiClient';
import { useToast } from './Toast';

export default function AddFromLink({ familyId, children = [], onCreated }) {
  const [url, setUrl] = useState('');
  const [childId, setChildId] = useState(children[0]?.id || null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [sessionsPerDay, setSessionsPerDay] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const toast = useToast();

  // Validate URLs for supported providers: YouTube, Khan Academy, Coursera, or general educational links
  const isValidUrl = (url) => {
    if (!url || url.trim().length === 0) return false;
    const urlLower = url.toLowerCase().trim();
    return (
      /youtube\.com|youtu\.be/.test(urlLower) ||
      /khanacademy\.org/.test(urlLower) ||
      /coursera\.org/.test(urlLower) ||
      /^https?:\/\//.test(urlLower) // General HTTP/HTTPS URL
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
      // Use addFromLink endpoint which supports YouTube, Khan Academy, Coursera, and general links
      const { data, error } = await addFromLink({
        familyId,
        url: url.trim(),
        childId: childId || undefined,
        startDate: expanded && childId ? startDate : undefined,
        daysPerWeek: expanded ? daysPerWeek : undefined,
        sessionsPerDay: expanded ? sessionsPerDay : undefined,
      });

      if (error) {
        // Extract detailed error message
        let errorMsg = 'Failed to add from link';
        if (error.detail) {
          errorMsg = error.detail;
        } else if (error.message) {
          errorMsg = error.message;
        }
        // Show more helpful error messages
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
      setExpanded(false);
      
      if (onCreated) {
        onCreated({ course_id: data.item_id || data.id, ...data });
      }
    } catch (err) {
      toast.push('Failed to add from link', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Link size={16} color="#6b7280" />
        <Text style={styles.title}>Add From Link</Text>
      </View>
      
      <Text style={styles.description}>
        Paste a URL from YouTube, Khan Academy, Coursera, or any educational link to turn it into lessons. Links open externally; we store metadata only.
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
          <Text style={styles.submitButtonText}>{loading ? 'Adding…' : 'Add'}</Text>
        </TouchableOpacity>
      </View>

      {children.length > 0 && (
        <TouchableOpacity
          style={styles.expandButton}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={styles.expandButtonText}>
            {expanded ? '−' : '+'} Schedule automatically
          </Text>
        </TouchableOpacity>
      )}

      {expanded && children.length > 0 && (
        <View style={styles.scheduleOptions}>
          <View style={styles.formRow}>
            <Text style={styles.label}>Child:</Text>
            <View style={styles.chipRow}>
              {children.map((child) => (
                <TouchableOpacity
                  key={child.id}
                  style={[styles.chip, childId === child.id && styles.chipActive]}
                  onPress={() => setChildId(child.id)}
                >
                  <Text style={[styles.chipText, childId === child.id && styles.chipTextActive]}>
                    {child.first_name || child.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formRow}>
            <Text style={styles.label}>Start Date:</Text>
            <TextInput
              style={styles.dateInput}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.formRow}>
            <Text style={styles.label}>Days per Week:</Text>
            <TextInput
              style={styles.numberInput}
              value={String(daysPerWeek)}
              onChangeText={(text) => {
                const num = parseInt(text, 10);
                if (!isNaN(num) && num >= 1 && num <= 7) {
                  setDaysPerWeek(num);
                } else if (text === '') {
                  setDaysPerWeek(1);
                }
              }}
              keyboardType="numeric"
              placeholder="4"
            />
          </View>

          <View style={styles.formRow}>
            <Text style={styles.label}>Sessions per Day:</Text>
            <TextInput
              style={styles.numberInput}
              value={String(sessionsPerDay)}
              onChangeText={(text) => {
                const num = parseInt(text, 10);
                if (!isNaN(num) && num >= 1 && num <= 4) {
                  setSessionsPerDay(num);
                } else if (text === '') {
                  setSessionsPerDay(1);
                }
              }}
              keyboardType="numeric"
              placeholder="1"
            />
          </View>
        </View>
      )}

      <Text style={styles.footer}>
        We only save titles, links, and durations. Content is viewed on the original provider's website under their Terms.
      </Text>
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
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    marginBottom: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    minWidth: 60,
  },
  submitButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  expandButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  expandButtonText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '500',
  },
  scheduleOptions: {
    gap: 12,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    minWidth: 100,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  chipActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  chipText: {
    fontSize: 13,
    color: '#4b5563',
  },
  chipTextActive: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    minWidth: 140,
    ...Platform.select({
      web: {
        outlineWidth: 0,
        outlineColor: 'transparent',
      },
    }),
  },
  numberInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    minWidth: 80,
    ...Platform.select({
      web: {
        outlineWidth: 0,
        outlineColor: 'transparent',
      },
    }),
  },
  footer: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 8,
    lineHeight: 16,
  },
});

