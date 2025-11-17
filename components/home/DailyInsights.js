import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Sparkles, TrendingUp, Upload, AlertCircle } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { buildDocumentsLink, buildPlannerLink } from '../../lib/url';
import { summarizeProgress } from '../../lib/services/aiClient';

export default function DailyInsights({ 
  insights = null, 
  onGeneratePlan, 
  onViewProgress,
  familyId,
  selectedChildId,
  onUploadEvidence,
  onAddFlexibleTask,
  onNavigate
}) {
  const [lightSubjects, setLightSubjects] = useState([]);
  const [behindSubjects, setBehindSubjects] = useState([]);
  const [aiSummary, setAiSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (!familyId) return;
    if (selectedChildId) {
      loadInsights();
    }
    loadAISummary();
  }, [familyId, selectedChildId]);

  const loadAISummary = async () => {
    if (!familyId) return;
    
    setLoadingSummary(true);
    try {
      // Get last 7 days summary
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      const { data, error } = await summarizeProgress(startStr, endStr);
      
      if (error) {
        console.error('[DailyInsights] Failed to load AI summary:', error);
        // Silently fail - AI summary is optional
      } else if (data && data.summary) {
        setAiSummary(data.summary);
      }
    } catch (err) {
      console.error('[DailyInsights] Error loading AI summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadInsights = async () => {
    try {
      // Load light subjects using RPC
      const { data: lightData, error: lightError } = await supabase.rpc('get_light_evidence_subjects', {
        p_family_id: familyId,
        p_child_id: selectedChildId || null
      });

      if (!lightError && lightData) {
        setLightSubjects(lightData || []);
      } else if (lightError) {
        // RPC might not exist yet - that's okay
        console.log('Light evidence RPC not available:', lightError.message);
      }

      // Load behind vs syllabus (current week) using RPC
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = weekStart.toISOString().split('T')[0];
      
      const { data: behindData, error: behindError } = await supabase.rpc('compare_to_syllabus_week', {
        p_family_id: familyId,
        p_child_id: selectedChildId,
        p_week_start: weekStartStr
      });

      if (!behindError && behindData) {
        // Filter for subjects that are behind
        const behind = (behindData || []).filter(c => {
          if (!c.expected_weekly_minutes || c.done_minutes === null || c.done_minutes === undefined) return false;
          return c.done_minutes < c.expected_weekly_minutes;
        });
        setBehindSubjects(behind);
      } else if (behindError) {
        // RPC might not exist yet - that's okay
        console.log('Syllabus comparison RPC not available:', behindError.message);
      }
    } catch (err) {
      console.error('Error loading insights:', err);
      // Silently fail - insights are optional
      setLightSubjects([]);
      setBehindSubjects([]);
    }
  };

  // Default insight if none provided
  const defaultInsight = {
    text: "All children are on track with their learning goals. Keep up the great work!",
    hasAction: false,
  };

  const displayInsight = insights || defaultInsight;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Sparkles size={16} color={colors.violetBold} />
          <Text style={styles.title}>Daily insights</Text>
        </View>
        <Text style={styles.subtitle}>AI summary</Text>
      </View>

      {loadingSummary ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Generating summary...</Text>
        </View>
      ) : aiSummary ? (
        <Text style={styles.insightText}>{aiSummary}</Text>
      ) : (
        <Text style={styles.insightText}>{displayInsight.text}</Text>
      )}

      {/* Light subjects chips */}
      {lightSubjects.length > 0 && (
        <View style={styles.chipsContainer}>
          {lightSubjects.map((subject) => (
            <TouchableOpacity
              key={subject.subject_id}
              style={styles.chip}
              onPress={() => {
                if (onNavigate) {
                  onNavigate(buildDocumentsLink({ childId: selectedChildId, subjectId: subject.subject_id }));
                } else {
                  onUploadEvidence?.(subject.subject_id);
                }
              }}
            >
              <Upload size={12} color={colors.orangeBold} />
              <Text style={styles.chipText}>
                {subject.subject_name || subject.subject_id} is light on uploads ({subject.file_count || 0}/{subject.target || 4}). Add evidence.
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Behind vs syllabus chips */}
      {behindSubjects.length > 0 && (
        <View style={styles.chipsContainer}>
          {behindSubjects.map((comp) => {
            const minutesBehind = comp.expected_weekly_minutes - comp.done_minutes;
            return (
              <TouchableOpacity
                key={comp.subject_id}
                style={styles.chip}
                onPress={() => {
                  if (onNavigate) {
                    // Navigate to planner with backlog drawer open
                    onNavigate(buildPlannerLink({ childId: selectedChildId, subjectId: comp.subject_id, view: 'week' }));
                    // TODO: Trigger backlog drawer open
                    if (typeof window !== 'undefined') {
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('openBacklogDrawer'));
                      }, 500);
                    }
                  } else {
                    onAddFlexibleTask?.(comp.subject_id, minutesBehind);
                  }
                }}
              >
                <AlertCircle size={12} color={colors.redBold} />
                <Text style={styles.chipText}>
                  {comp.subject_name || comp.subject_id} is {minutesBehind}m behind this week — Add flexible {minutesBehind}m.
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.actions}>
        {displayInsight.hasAction && (
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={onGeneratePlan}
          >
            <Sparkles size={14} color={colors.accentContrast} />
            <Text style={styles.primaryButtonText}>Generate plan tweak</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={onViewProgress}
        >
          <TrendingUp size={14} color={colors.accent} />
          <Text style={styles.secondaryButtonText}>View progress</Text>
        </TouchableOpacity>
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
    padding: 12,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(240, 230, 255, 0.25)', // violetSoft with 25% opacity
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: -16,
    marginTop: -16,
    borderTopLeftRadius: colors.radiusLg,
    borderTopRightRadius: colors.radiusLg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  insightText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    ...shadows.sm,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.accent,
  },
  chipsContainer: {
    marginBottom: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgSubtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: 12,
    color: colors.text,
    flex: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 13,
    color: colors.muted,
  },
});

