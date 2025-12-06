import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { colors, shadows } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';
import { getNotes } from '../../lib/services/recordsClient';

export default function DailyConnectionUnified({ 
  familyId, 
  children = [],
  learning = [],
  preloadedStarters = null,
  selectedDate = new Date(),
  selectedChildIds = null,
}) {
  const [connections, setConnections] = useState([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [notes, setNotes] = useState([]);

  const generateFallbackConnections = useCallback(() => {
    const fallback = children.map((child, index) => {
      const childLearning = learning.filter(l => l.child_id === child.id);
      const subjects = [...new Set(childLearning.map(l => l.subject))];
      const primarySubject = subjects[0] || 'Learning';
      const childName = child.first_name || child.name || 'Child';
      
      // Use varied prompts for better copy
      const prompts = [
        `They've been especially curious in ${primarySubject.toLowerCase()} lately.`,
        `He's been diving into ${primarySubject.toLowerCase()} this week.`,
        `She's in a creative groove with ${primarySubject.toLowerCase()}.`,
      ];
      const details = [
        `Ask what question grabbed their attention recently.`,
        `Invite them to tell you one thing that surprised them.`,
        `Ask what part of their project they're most excited to finish.`,
      ];
      const promptIndex = index % prompts.length;

      return {
        childId: child.id,
        childName,
        prompt: prompts[promptIndex],
        detail: details[promptIndex],
        subject: primarySubject,
      };
    });

    setConnections(fallback);
  }, [children, learning]);

  const transformConnections = useCallback((starters) => {
    const transformed = (starters || []).map((starter, index) => {
      const childLearning = learning.filter(l => l.child_id === starter.child_id);
      const subjects = [...new Set(childLearning.map(l => l.subject))];
      const primarySubject = subjects[0] || 'Learning';

      // Transform API starter to match desired format
      const prompt = starter.prompt || `They've been especially curious in ${primarySubject.toLowerCase()} lately.`;
      const detail = starter.context || `Ask what question grabbed their attention recently.`;
      
      return {
        childId: starter.child_id,
        childName: starter.child_name,
        prompt,
        detail,
        subject: primarySubject,
      };
    });

    // Ensure every child gets a card - fill in missing ones with fallbacks
    if (transformed.length === 0) {
      generateFallbackConnections();
    } else {
      // Find children that don't have starters
      const childIdsWithStarters = new Set(transformed.map(t => t.childId));
      const missingChildren = children.filter(child => !childIdsWithStarters.has(child.id));
      
      // Generate fallback cards for missing children
      const fallbackCards = missingChildren.map((child) => {
        const childLearning = learning.filter(l => l.child_id === child.id);
        const subjects = [...new Set(childLearning.map(l => l.subject))];
        const primarySubject = subjects[0] || 'Learning';
        
        // Generate fallback connection with better copy
        const childName = child.first_name || child.name || 'Child';
        const prompts = [
          `They've been especially curious in ${primarySubject.toLowerCase()} lately.`,
          `He's been diving into ${primarySubject.toLowerCase()} this week.`,
          `She's in a creative groove with ${primarySubject.toLowerCase()}.`,
        ];
        const details = [
          `Ask what question grabbed their attention recently.`,
          `Invite them to tell you one thing that surprised them.`,
          `Ask what part of their project they're most excited to finish.`,
        ];
        const index = Math.floor(Math.random() * prompts.length);
        
        return {
          childId: child.id,
          childName,
          prompt: prompts[index],
          detail: details[index],
          subject: primarySubject,
        };
      });
      
      // Combine API starters with fallback cards
      setConnections([...transformed, ...fallbackCards]);
    }
  }, [children, learning, generateFallbackConnections]);

  const loadConnections = useCallback(async () => {
    setConnectionsLoading(true);
    try {
      const params = new URLSearchParams();
      
      const { data, error } = await apiRequest(
        `/api/conversation/starters?${params.toString()}`,
        { method: 'GET' }
      );
      
      if (error) {
        console.error('[DailyConnectionUnified] Error loading starters:', error);
        generateFallbackConnections();
        return;
      }

      transformConnections(data);
    } catch (err) {
      console.error('[DailyConnectionUnified] Error:', err);
      generateFallbackConnections();
    } finally {
      setConnectionsLoading(false);
    }
  }, [transformConnections, generateFallbackConnections]);

  // Load notes for reflection prompts
  useEffect(() => {
    if (!familyId || !selectedChildIds || selectedChildIds.length === 0) {
      setNotes([]);
      return;
    }
    
    const loadNotesForReflection = async () => {
      try {
        const weekStart = new Date(selectedDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        // Try to get notes, but don't show errors if endpoint doesn't exist
        const notesData = await getNotes(familyId, selectedChildIds, {
          start: weekStart,
          end: weekEnd,
        }).catch((err) => {
          // Silently fail if notes endpoint doesn't exist (404 is expected)
          if (err?.status === 404 || err?.message?.includes('404')) {
            return [];
          }
          console.warn('Error loading notes for reflection:', err);
          return [];
        });
        
        setNotes(Array.isArray(notesData) ? notesData : []);
      } catch (error) {
        // Don't log errors for missing endpoints
        if (error?.status !== 404 && !error?.message?.includes('404')) {
          console.warn('Error loading notes for reflection:', error);
        }
        setNotes([]);
      }
    };
    
    loadNotesForReflection();
  }, [familyId, selectedDate, selectedChildIds]);
  
  useEffect(() => {
    // If preloaded starters are provided, use them immediately
    if (preloadedStarters && preloadedStarters.length > 0) {
      transformConnections(preloadedStarters);
      setConnectionsLoading(false);
    } else if (familyId && children.length > 0) {
      loadConnections();
    } else {
      setConnectionsLoading(false);
    }
  }, [familyId, children.length, preloadedStarters, transformConnections, loadConnections]);

  return (
    <View style={styles.container}>
      {/* Daily Connection Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Daily connection</Text>

        {connectionsLoading ? (
          <ActivityIndicator size="small" color={colors.muted} style={styles.loader} />
        ) : (
          <View>
            {connections.length > 0 && (
              <View style={styles.connectionsList}>
                {connections.map((connection, index) => (
                  <View key={connection.childId} style={styles.connectionCard}>
                    {/* Gradient top border */}
                    <View style={styles.gradientBorder} />
                    <View style={styles.connectionHeader}>
                        <Text style={styles.childName}>{connection.childName}</Text>
                    </View>
                    <Text style={styles.prompt}>{connection.prompt}</Text>
                    <Text style={styles.detail}>{connection.detail}</Text>
                  </View>
                ))}
              </View>
            )}
            
            {/* Show recent notes as reflection prompts */}
            {notes.length > 0 && (
              <View style={styles.notesSection}>
                <Text style={styles.notesTitle}>Recent reflections</Text>
                {notes.slice(0, 2).map((note) => {
                  const child = children.find(c => c.id === note.child_id);
                  return (
                    <View key={note.id} style={styles.noteCard}>
                      <Text style={styles.noteChild}>{child?.first_name || child?.name || 'Child'}</Text>
                      <Text style={styles.noteText}>{note.text || note.description || ''}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
    marginBottom: 16,
  },
  section: {
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  loader: {
    marginVertical: 12,
  },
  connectionsList: {
    gap: 8,
    marginTop: 0,
  },
  connectionCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    paddingVertical: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    overflow: 'hidden',
  },
  gradientBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    ...Platform.select({
      web: {
        // Use backgroundImage so React Native Web doesn't warn about "background"
        backgroundImage: 'linear-gradient(90deg, #fef9e7 0%, #fef3c7 25%, #fde68a 50%, #fef3c7 75%, #fef9e7 100%)',
      },
      default: {
        backgroundColor: '#fef3c7', // Fallback for native - pastel yellow
      },
    }),
  },
  connectionHeader: {
    marginBottom: 6,
    marginTop: 2,
  },
  childName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b', // slate-800
  },
  prompt: {
    fontSize: 14,
    color: '#334155', // slate-700
    lineHeight: 20,
    marginBottom: 6,
  },
  detail: {
    fontSize: 12,
    color: '#94a3b8', // slate-400
  },
  notesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notesTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  noteCard: {
    padding: 10,
    backgroundColor: colors.panel,
    borderRadius: 6,
    marginBottom: 8,
  },
  noteChild: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  noteText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});

