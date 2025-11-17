import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

const ConflictsList = ({ conflicts, onConflictResolved, familyId }) => {
  const [resolving, setResolving] = useState({});

  const resolveConflict = async (conflictId, resolution) => {
    try {
      setResolving(prev => ({ ...prev, [conflictId]: true }));
      
      // This would implement the actual conflict resolution logic
      // For now, we'll just simulate it
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      onConflictResolved();
    } catch (error) {
      console.error('Error resolving conflict:', error);
      showAlert('Error', 'Failed to resolve conflict');
    } finally {
      setResolving(prev => ({ ...prev, [conflictId]: false }));
    }
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  const getConflictType = (conflict) => {
    if (conflict.type === 'overlap') return 'Time Overlap';
    if (conflict.type === 'priority') return 'Priority Conflict';
    if (conflict.type === 'override') return 'Override Conflict';
    return 'Unknown Conflict';
  };

  const getConflictSeverity = (conflict) => {
    if (conflict.severity === 'high') return { color: '#ef4444', label: 'High' };
    if (conflict.severity === 'medium') return { color: '#f59e0b', label: 'Medium' };
    if (conflict.severity === 'low') return { color: '#10b981', label: 'Low' };
    return { color: '#6b7280', label: 'Unknown' };
  };

  if (conflicts.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Schedule Conflicts</Text>
      <Text style={styles.subtitle}>
        {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} found
      </Text>
      
      {conflicts.map((conflict, index) => {
        const severity = getConflictSeverity(conflict);
        const isResolving = resolving[conflict.id];
        
        return (
          <View key={conflict.id || index} style={styles.conflictCard}>
            <View style={styles.conflictHeader}>
              <View style={styles.conflictTypeContainer}>
                <Text style={styles.conflictType}>
                  {getConflictType(conflict)}
                </Text>
                <View style={[styles.severityBadge, { backgroundColor: severity.color }]}>
                  <Text style={styles.severityText}>{severity.label}</Text>
                </View>
              </View>
              <Text style={styles.conflictDate}>
                {formatDate(conflict.date)}
              </Text>
            </View>
            
            <Text style={styles.conflictDescription}>
              {conflict.description}
            </Text>
            
            {conflict.affected_items && (
              <View style={styles.affectedItems}>
                <Text style={styles.affectedItemsTitle}>Affected Items:</Text>
                {conflict.affected_items.map((item, itemIndex) => (
                  <Text key={itemIndex} style={styles.affectedItem}>
                    • {item}
                  </Text>
                ))}
              </View>
            )}
            
            {conflict.suggested_resolution && (
              <View style={styles.suggestedResolution}>
                <Text style={styles.suggestedResolutionTitle}>Suggested Resolution:</Text>
                <Text style={styles.suggestedResolutionText}>
                  {conflict.suggested_resolution}
                </Text>
              </View>
            )}
            
            <View style={styles.conflictActions}>
              <TouchableOpacity
                style={styles.autoResolveButton}
                onPress={() => resolveConflict(conflict.id, 'auto')}
                disabled={isResolving}
              >
                <Text style={styles.autoResolveButtonText}>
                  {isResolving ? 'Resolving...' : 'Auto-Resolve'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.manualResolveButton}
                onPress={() => {
                  showAlert('Manual Resolution', 'Manual resolution interface would open here');
                }}
                disabled={isResolving}
              >
                <Text style={styles.manualResolveButtonText}>
                  Resolve Manually
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      
      <View style={styles.bulkActions}>
        <TouchableOpacity
          style={styles.resolveAllButton}
          onPress={() => {
            showAlert('Bulk Resolution', 'Would resolve all conflicts automatically');
          }}
        >
          <Text style={styles.resolveAllButtonText}>
            Resolve All Conflicts
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#991b1b',
    marginBottom: 16,
  },
  conflictCard: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  conflictHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  conflictTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conflictType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  conflictDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  conflictDescription: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  affectedItems: {
    marginBottom: 8,
  },
  affectedItemsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  affectedItem: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8,
  },
  suggestedResolution: {
    backgroundColor: '#f0f9ff',
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  suggestedResolutionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: 4,
  },
  suggestedResolutionText: {
    fontSize: 12,
    color: '#075985',
    lineHeight: 16,
  },
  conflictActions: {
    flexDirection: 'row',
    gap: 8,
  },
  autoResolveButton: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  autoResolveButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  manualResolveButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  manualResolveButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  bulkActions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
  },
  resolveAllButton: {
    backgroundColor: '#dc2626',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  resolveAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default ConflictsList;
