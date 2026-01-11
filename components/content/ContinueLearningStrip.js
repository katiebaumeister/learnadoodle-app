import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Play, Clock, Video, BookOpen } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';

/**
 * ContinueLearningStrip
 * Shows events with source_link and resume_position for easy continuation
 */
export default function ContinueLearningStrip({ 
  childId, 
  familyId, 
  limit = 3,
  onResumePositionUpdate 
}) {
  const [resumableEvents, setResumableEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if (familyId) {
      loadResumableEvents();
    } else {
      setLoading(false);
    }
  }, [childId, familyId]);

  const loadResumableEvents = async () => {
    if (!familyId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      let query = supabase
        .from('events')
        .select('id, title, source_link, resume_position, start_ts, status, subject_id')
        .eq('family_id', familyId)
        .not('source_link', 'is', null)
        .not('resume_position', 'is', null)
        .in('status', ['scheduled', 'in_progress'])
        .order('start_ts', { ascending: true })
        .limit(limit);

      if (childId) {
        query = query.eq('child_id', childId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter to only incomplete events or those with resume positions
      const filtered = (data || []).filter(e => 
        e.resume_position && 
        e.source_link && 
        e.status !== 'done' &&
        e.status !== 'canceled'
      );

      setResumableEvents(filtered || []);
    } catch (error) {
      // Silently handle errors - don't spam console with network errors
      const isNetworkError = error.message?.includes('Cannot connect') || error.message?.includes('Failed to fetch');
      if (!isNetworkError) {
      }
      setResumableEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResume = (event) => {
    if (!event.source_link) return;

    // Parse resume position (could be timestamp like "12:34" or "Chapter 3, Lesson 2")
    let url = event.source_link;
    
    // If it's a YouTube URL and we have a timestamp
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const timestamp = parseResumePosition(event.resume_position);
      if (timestamp) {
        // Add timestamp parameter to YouTube URL
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}t=${timestamp}s`;
      }
    }

    // Open in new tab/window
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const parseResumePosition = (position) => {
    if (!position) return null;
    
    // Try to parse as timestamp (e.g., "12:34" -> 754 seconds)
    const timeMatch = position.match(/(\d+):(\d+)/);
    if (timeMatch) {
      const minutes = parseInt(timeMatch[1], 10);
      const seconds = parseInt(timeMatch[2], 10);
      return minutes * 60 + seconds;
    }
    
    // Try to parse as seconds (e.g., "754")
    const secondsMatch = position.match(/^(\d+)s?$/);
    if (secondsMatch) {
      return parseInt(secondsMatch[1], 10);
    }
    
    return null;
  };

  if (loading) {
    return null; // Don't show anything while loading
  }
  
  if (!familyId || resumableEvents.length === 0) {
    return null; // Don't show if no familyId or no events
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Play size={18} color={colors.accent} />
        <Text style={styles.title}>Continue Learning</Text>
      </View>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {resumableEvents.map((event) => (
          <TouchableOpacity
            key={event.id}
            style={styles.card}
            onPress={() => handleResume(event)}
          >
            <View style={styles.cardHeader}>
              {event.source_link?.includes('youtube') ? (
                <Video size={16} color={colors.accent} />
              ) : (
                <BookOpen size={16} color={colors.accent} />
              )}
              <Text style={styles.cardTitle} numberOfLines={1}>
                {event.title || 'Continue Learning'}
              </Text>
            </View>
            
            <View style={styles.cardFooter}>
              <View style={styles.resumeBadge}>
                <Clock size={12} color={colors.muted} />
                <Text style={styles.resumeText}>
                  Resume at {event.resume_position}
                </Text>
              </View>
              
              <View style={styles.playButton}>
                <Play size={14} color="#ffffff" fill="#ffffff" />
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  scrollView: {
    marginHorizontal: -4,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    minWidth: 200,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resumeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  resumeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  playButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

