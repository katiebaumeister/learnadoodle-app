import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import { Link, Plus } from 'lucide-react';
import { addFromLink, addExternalLink } from '../lib/apiClient';
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

  const isValidUrl = /youtube\.com|youtu\.be/.test(url);

  const handleSubmit = async () => {
    if (!isValidUrl) {
      toast.push('Please paste a valid YouTube video or playlist URL', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        familyId,
        url: url.trim(),
        childId: childId || undefined,
        startDate: expanded && childId ? startDate : undefined,
        daysPerWeek: expanded ? daysPerWeek : undefined,
        sessionsPerDay: expanded ? sessionsPerDay : undefined,
      };

      // Use new addExternalLink endpoint (for external_courses) instead of addFromLink (family_youtube_items)
      const { data, error } = await addExternalLink({
        childId: childId || children[0]?.id,
        url: url.trim(),
      });

      if (error) {
        console.error('Error adding from link:', error);
        toast.push(error.message || 'Failed to add from link', 'error');
        return;
      }

      const message = `Added "${data.title}" to backlog${data.duration_sec ? ` (${Math.ceil(data.duration_sec / 60)} min)` : ''}`;
      
      toast.push(message, 'success');
      setUrl('');
      setExpanded(false);
      
      if (onCreated) {
        onCreated(data);
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
        <Link size={16} color="#6b7280" />
        <Text style={styles.title}>Add From Link</Text>
      </View>
      
      <Text style={styles.description}>
        Paste a YouTube video or playlist URL to turn it into lessons. Links open externally; we store metadata only.
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.urlInput, !isValidUrl && url.length > 0 && styles.urlInputError]}
          placeholder="https://www.youtube.com/watch?v=..."
          placeholderTextColor="#9ca3af"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.submitButton, (!isValidUrl || loading) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!isValidUrl || loading}
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
        We only save titles, links, and durations. Content is viewed on YouTube under their Terms.
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

