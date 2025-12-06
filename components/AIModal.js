import React, { useState, useEffect, useRef } from 'react';
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
  const hasRunRef = useRef(false);
  const timeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Reset when modal closes
    if (!open) {
      hasRunRef.current = false;
      setSuggestions([]);
      setError(null);
      setLoading(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Wait for run function to be available, then execute
    if (open && !hasRunRef.current) {
      if (!run) {
        // If run is not available yet, wait a bit and check again
        const checkRun = setTimeout(() => {
          if (open && run && !hasRunRef.current && isMountedRef.current) {
            hasRunRef.current = true;
            setLoading(true);
            setError(null);
            setSuggestions([]);
            executeRunFunction();
          }
        }, 100);
        return () => clearTimeout(checkRun);
      }
      
      // Run function is available, execute immediately
      hasRunRef.current = true;
      setLoading(true);
      setError(null);
      setSuggestions([]);
      executeRunFunction();
    }
    
    function executeRunFunction() {
      if (!run) {
        setError('Run function not available');
        setLoading(false);
        return;
      }
      
      // Add timeout (60 seconds)
      timeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setError('Request timed out. The AI is taking longer than expected. Please try again.');
          setLoading(false);
          toast.push('Request timed out', 'error');
        }
      }, 60000);
      
      // Wrap in try-catch to ensure we always set loading to false
      const executeRun = async () => {
        const runStartTime = Date.now();
        try {
          console.log('[AIModal] Calling run function...', { hasRun: !!run, runType: typeof run });
          
          if (!run) {
            throw new Error('Run function is not available');
          }
          
          console.log('[AIModal] Awaiting run()...');
          const results = await run();
          const runDuration = Date.now() - runStartTime;
          
          console.log('[AIModal] Run completed in', runDuration, 'ms, results:', results);
          
          // Clear timeout on success
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          if (!isMountedRef.current) {
            console.log('[AIModal] Component unmounted, skipping state update');
            return;
          }
          
          const suggestions = results || [];
          console.log('[AIModal] Setting suggestions:', suggestions.length);
          
          // Update state in a single batch to prevent intermediate renders
          setSuggestions(suggestions);
          setLoading(false);
          console.log('[AIModal] Loading set to false, suggestions count:', suggestions.length);
          
          if (suggestions.length > 0) {
            toast.push('Suggestions ready', 'success');
          } else {
            console.log('[AIModal] No suggestions returned');
          }
        } catch (err) {
          const runDuration = Date.now() - runStartTime;
          console.error('[AIModal] Run error after', runDuration, 'ms:', err);
          
          // Clear timeout on error
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          if (!isMountedRef.current) {
            console.log('[AIModal] Component unmounted during error, skipping state update');
            return;
          }
          
          const errorMessage = err.message || 'AI error — try again';
          setError(errorMessage);
          setLoading(false);
          toast.push(errorMessage, 'error');
        }
      };
      
      executeRun();
    }
  }, [open, run, toast]); // Include run but use hasRunRef to prevent re-execution

  // Reset hasRunRef when run function changes (but only if modal is closed)
  useEffect(() => {
    if (!open && run) {
      hasRunRef.current = false;
    }
  }, [run, open]);

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
              <Text style={styles.loadingSubtext}>This may take 20-30 seconds</Text>
            </View>
          )}

          {error && (
            <View style={styles.error}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setError(null);
                  setLoading(true);
                  setSuggestions([]);
                  if (run) {
                    run()
                      .then((results) => {
                        const suggestions = results || [];
                        setSuggestions(suggestions);
                        if (suggestions.length > 0) {
                          toast.push('Suggestions ready', 'success');
                        }
                      })
                      .catch((err) => {
                        setError(err.message || 'AI error — try again');
                        toast.push(err.message || 'AI error — try again', 'error');
                      })
                      .finally(() => {
                        setLoading(false);
                      });
                  }
                }}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && suggestions.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No suggestions available</Text>
              <Text style={styles.emptySubtext}>
                The AI analyzed your schedule but didn't find any changes to suggest. This could mean:
                {'\n\n'}
                • Your schedule is already well-balanced
                • There are no conflicts or imbalances to fix
                • You may need to set up syllabi/subject goals for more specific recommendations
              </Text>
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
    zIndex: Platform.OS === 'web' ? 10001 : 10000, // Higher than main modal
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
    fontWeight: '500',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
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
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  empty: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
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

