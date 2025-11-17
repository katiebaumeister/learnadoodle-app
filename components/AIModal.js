import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { X, Check } from 'lucide-react';
import { useToast } from './Toast';

export default function AIModal({
  title,
  open,
  onClose,
  run,
  onAccept,
  description,
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (open && run) {
      setLoading(true);
      setError(null);
      setSuggestions([]);
      
      run()
        .then((results) => {
          setSuggestions(results || []);
          if (results && results.length > 0) {
            toast.push('Suggestions ready', 'success');
          }
        })
        .catch((err) => {
          setError(err.message || 'AI error — try again');
          toast.push('AI error — try again', 'error');
        })
        .finally(() => {
          setLoading(false);
        });
    } else if (!open) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
    }
  }, [open, run, toast]);

  // Handle Esc key
  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const handleAccept = async (suggestion) => {
    try {
      await onAccept?.(suggestion);
      toast.push('Added to calendar', 'success');
    } catch (err) {
      toast.push('Failed to add to calendar', 'error');
    }
  };

  return (
    <View style={styles.overlay} onTouchEnd={onClose}>
      <View style={styles.modal} onTouchEnd={(e) => e.stopPropagation()}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {description && (
          <Text style={styles.description}>{description}</Text>
        )}

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {loading && (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>Running AI...</Text>
            </View>
          )}

          {error && (
            <View style={styles.error}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!loading && !error && suggestions.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No suggestions available</Text>
            </View>
          )}

          {!loading && !error && suggestions.length > 0 && (
            <View style={styles.suggestions}>
              {suggestions.map((suggestion, idx) => (
                <View key={suggestion.id || idx} style={styles.suggestion}>
                  <View style={styles.suggestionContent}>
                    <Text style={styles.suggestionTitle}>
                      {suggestion.title || 'Untitled'}
                    </Text>
                    {suggestion.notes && (
                      <Text style={styles.suggestionNotes}>{suggestion.notes}</Text>
                    )}
                    {(suggestion.proposedStart || suggestion.proposedEnd) && (
                      <Text style={styles.suggestionTime}>
                        {suggestion.proposedStart && new Date(suggestion.proposedStart).toLocaleString()}
                        {suggestion.proposedEnd && ` - ${new Date(suggestion.proposedEnd).toLocaleString()}`}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleAccept(suggestion)}
                  >
                    <Check size={16} color="#ffffff" />
                    <Text style={styles.acceptButtonText}>Accept & Add</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: Platform.OS === 'web' ? '90%' : '100%',
    maxWidth: 600,
    maxHeight: '80%',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  description: {
    padding: 16,
    paddingTop: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  loading: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
  },
  error: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  empty: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  suggestions: {
    gap: 12,
  },
  suggestion: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestionContent: {
    marginBottom: 12,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  suggestionNotes: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  suggestionTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});

