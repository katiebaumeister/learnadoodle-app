import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Sparkles, ExternalLink, CheckCircle, X, Clock, BookOpen, Video, FileText, Award, RefreshCw } from 'lucide-react';
import { inspireLearning, getLearningSuggestions, approveSuggestion, rejectSuggestion } from '../../lib/apiClient';
import { useToast } from '../Toast';

export default function InspireLearning({ familyId, children = [] }) {
  const [selectedChildId, setSelectedChildId] = useState(children[0]?.id || null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (selectedChildId) {
      loadSuggestions();
    }
  }, [selectedChildId]);

  const loadSuggestions = async () => {
    if (!selectedChildId) return;
    setLoading(true);
    try {
      const { data, error } = await getLearningSuggestions(selectedChildId, false);
      if (error) throw error;
      setSuggestions(data || []);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      toast.push('Failed to load suggestions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedChildId) {
      toast.push('Please select a child', 'error');
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await inspireLearning(selectedChildId);
      if (error) throw error;
      
      toast.push(`Generated ${data.suggestions?.length || 0} suggestions`, 'success');
      loadSuggestions(); // Reload to show new suggestions
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast.push('Failed to generate suggestions', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (suggestionId) => {
    try {
      const { error } = await approveSuggestion(suggestionId);
      if (error) throw error;
      toast.push('Suggestion approved', 'success');
      loadSuggestions();
    } catch (error) {
      console.error('Error approving suggestion:', error);
      toast.push('Failed to approve suggestion', 'error');
    }
  };

  const handleReject = async (suggestionId) => {
    try {
      const { error } = await rejectSuggestion(suggestionId);
      if (error) throw error;
      toast.push('Suggestion removed', 'success');
      loadSuggestions();
    } catch (error) {
      console.error('Error rejecting suggestion:', error);
      toast.push('Failed to reject suggestion', 'error');
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'video':
        return <Video size={16} color="#ef4444" />;
      case 'article':
        return <FileText size={16} color="#3b82f6" />;
      case 'project':
        return <Award size={16} color="#f59e0b" />;
      case 'course':
        return <BookOpen size={16} color="#10b981" />;
      default:
        return <BookOpen size={16} color="#6b7280" />;
    }
  };

  const selectedChild = children.find(c => c.id === selectedChildId);
  const approvedCount = suggestions.filter(s => s.approved_by_parent).length;
  const pendingCount = suggestions.filter(s => !s.approved_by_parent).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Sparkles size={16} color="#8b5cf6" />
          <Text style={styles.title}>Inspire Learning</Text>
        </View>
        {selectedChild && (
          <Text style={styles.subtitle}>For {selectedChild.first_name || selectedChild.name}</Text>
        )}
      </View>

      {children.length > 1 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.childSelector}
          contentContainerStyle={styles.childChips}
        >
          {children.map((child) => (
            <TouchableOpacity
              key={child.id}
              style={[
                styles.childChip,
                selectedChildId === child.id && styles.childChipActive
              ]}
              onPress={() => setSelectedChildId(child.id)}
            >
              <Text style={[
                styles.childChipText,
                selectedChildId === child.id && styles.childChipTextActive
              ]}>
                {child.first_name || child.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, generating && styles.buttonDisabled]}
          onPress={handleGenerate}
          disabled={generating || !selectedChildId}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <RefreshCw size={16} color="#ffffff" />
          )}
          <Text style={styles.buttonText}>Generate Suggestions</Text>
        </TouchableOpacity>
      </View>

      {(approvedCount > 0 || pendingCount > 0) && (
        <View style={styles.stats}>
          <Text style={styles.statsText}>
            {approvedCount} approved • {pendingCount} pending
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading suggestions...</Text>
        </View>
      ) : suggestions.length === 0 ? (
        <View style={styles.emptyState}>
          <Sparkles size={48} color="#9ca3af" />
          <Text style={styles.emptyText}>No suggestions yet</Text>
          <Text style={styles.emptySubtext}>Click "Generate Suggestions" to get AI-powered recommendations</Text>
        </View>
      ) : (
        <ScrollView style={styles.suggestionsList}>
          {suggestions.map((suggestion) => (
            <View
              key={suggestion.id}
              style={[
                styles.suggestionCard,
                suggestion.approved_by_parent && styles.suggestionCardApproved
              ]}
            >
              <View style={styles.suggestionHeader}>
                <View style={styles.suggestionInfo}>
                  {getTypeIcon(suggestion.type)}
                  <View style={styles.suggestionTitleBlock}>
                    <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                    <View style={styles.suggestionMeta}>
                      <Text style={styles.suggestionSource}>{suggestion.source}</Text>
                      {suggestion.duration_min && (
                        <>
                          <Text style={styles.metaSeparator}>•</Text>
                          <View style={styles.duration}>
                            <Clock size={12} color="#6b7280" />
                            <Text style={styles.durationText}>{suggestion.duration_min} min</Text>
                          </View>
                        </>
                      )}
                    </View>
                  </View>
                </View>
                {suggestion.approved_by_parent ? (
                  <CheckCircle size={20} color="#10b981" />
                ) : (
                  <View style={styles.approvalPending}>
                    <Text style={styles.approvalPendingText}>Pending</Text>
                  </View>
                )}
              </View>

              {suggestion.description && (
                <Text style={styles.suggestionDescription}>{suggestion.description}</Text>
              )}

              <View style={styles.suggestionActions}>
                {suggestion.link && (
                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        window.open(suggestion.link, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    <ExternalLink size={14} color="#3b82f6" />
                    <Text style={styles.linkButtonText}>Open</Text>
                  </TouchableOpacity>
                )}
                {!suggestion.approved_by_parent ? (
                  <TouchableOpacity
                    style={[styles.approveButton, styles.approveButtonPrimary]}
                    onPress={() => handleApprove(suggestion.id)}
                  >
                    <CheckCircle size={14} color="#ffffff" />
                    <Text style={styles.approveButtonText}>Approve</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.approveButton, styles.approveButtonSecondary]}
                    onPress={() => handleReject(suggestion.id)}
                  >
                    <X size={14} color="#6b7280" />
                    <Text style={styles.approveButtonTextSecondary}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  childSelector: {
    marginBottom: 12,
  },
  childChips: {
    flexDirection: 'row',
    gap: 8,
  },
  childChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  childChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  childChipText: {
    fontSize: 12,
    color: '#374151',
  },
  childChipTextActive: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  actions: {
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  buttonPrimary: {
    backgroundColor: '#8b5cf6',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  stats: {
    marginBottom: 12,
  },
  statsText: {
    fontSize: 12,
    color: '#6b7280',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  suggestionsList: {
    maxHeight: 400,
  },
  suggestionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestionCardApproved: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  suggestionInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  suggestionTitleBlock: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  suggestionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  suggestionSource: {
    fontSize: 12,
    color: '#6b7280',
  },
  metaSeparator: {
    fontSize: 12,
    color: '#d1d5db',
  },
  duration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    fontSize: 12,
    color: '#6b7280',
  },
  approvalPending: {
    backgroundColor: '#fef3c7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  approvalPendingText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#f59e0b',
  },
  suggestionDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 12,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  },
  linkButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3b82f6',
  },
  approveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  approveButtonPrimary: {
    backgroundColor: '#10b981',
  },
  approveButtonSecondary: {
    backgroundColor: '#f3f4f6',
  },
  approveButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  approveButtonTextSecondary: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
});

