import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';

export default function ProjectsTab({ child }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, [child.id]);

  const fetchProjects = async () => {
    if (!child?.id) return;
    
    try {
      setLoading(true);
      
      // Fetch backlog items (projects) for this child
      const { data: backlogItems, error } = await supabase
        .from('backlog_items')
        .select('id, title, notes, due_ts, estimated_minutes, priority, subject_id')
        .eq('child_id', child.id)
        .order('due_ts', { ascending: true });

      if (error && error.code !== 'PGRST116') throw error;

      // Also fetch events that might be projects (longer duration events)
      const { data: projectEvents, error: eventsError } = await supabase
        .from('events')
        .select('id, title, description, due_ts, start_ts, end_ts, status, subject_id')
        .eq('child_id', child.id)
        .not('due_ts', 'is', null)
        .order('due_ts', { ascending: true });

      if (eventsError) throw eventsError;

      // Fetch subject names separately
      const allSubjectIds = [
        ...(backlogItems || []).map(i => i.subject_id),
        ...(projectEvents || []).map(e => e.subject_id)
      ].filter(Boolean);
      const subjectIds = [...new Set(allSubjectIds)];
      const subjectLookup = {};
      
      if (subjectIds.length > 0) {
        const { data: subjects } = await supabase
          .from('subject')
          .select('id, name')
          .in('id', subjectIds);
        
        (subjects || []).forEach(s => {
          subjectLookup[s.id] = s.name;
        });
      }

      const formattedProjects = [];

      // Process backlog items
      (backlogItems || []).forEach(item => {
        const dueDate = item.due_ts ? new Date(item.due_ts) : null;
        formattedProjects.push({
          id: item.id,
          name: item.title,
          subject: item.subject_id ? (subjectLookup[item.subject_id] || 'Unassigned') : 'Unassigned',
          due: dueDate ? dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date',
          progressPct: 0, // Backlog items start at 0%
          status: 'Planned',
          nextStep: item.notes || 'Get started',
        });
      });

      // Process project events (events with due dates that are longer-term)
      (projectEvents || []).forEach(event => {
        const duration = event.end_ts && event.start_ts 
          ? (new Date(event.end_ts) - new Date(event.start_ts)) / (1000 * 60 * 60 * 24) // days
          : 0;
        
        // Consider events with duration > 7 days as projects
        if (duration > 7 || event.description?.length > 100) {
          const dueDate = event.due_ts ? new Date(event.due_ts) : null;
          const isDone = event.status === 'done';
          
          formattedProjects.push({
            id: `event-${event.id}`,
            name: event.title,
            subject: event.subject_id ? (subjectLookup[event.subject_id] || 'Unassigned') : 'Unassigned',
            due: dueDate ? dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date',
            progressPct: isDone ? 100 : 50, // Estimate based on status
            status: isDone ? 'Completed' : event.status === 'in_progress' ? 'In progress' : 'Planned',
            nextStep: event.description || 'Continue working',
          });
        }
      });

      setProjects(formattedProjects);
    } catch (error) {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Projects for {child.first_name}</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => {
            // TODO: Open add project modal
}}
        >
          <Plus size={14} color={colors.card} />
          <Text style={styles.addButtonText}>Add project</Text>
        </TouchableOpacity>
      </View>

      {projects.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Bigger, multi-week projects will show up here with milestones and progress.
          </Text>
        </View>
      ) : (
        <View style={styles.projectsGrid}>
          {projects.map((p) => (
            <View key={p.id} style={styles.projectCard}>
              <View style={styles.projectHeader}>
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName}>{p.name}</Text>
                  <Text style={styles.projectMeta}>
                    {p.subject} • Due {p.due}
                  </Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{p.status}</Text>
                </View>
              </View>

              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Progress</Text>
                  <Text style={styles.progressPct}>{p.progressPct}%</Text>
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[styles.progressFill, { width: `${p.progressPct}%` }]}
                  />
                </View>
              </View>

              {p.nextStep && (
                <Text style={styles.nextStep}>
                  <Text style={styles.nextStepLabel}>Next step:</Text> {p.nextStep}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.card,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    margin: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  projectsGrid: {
    padding: 16,
    gap: 16,
  },
  projectCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  projectMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  statusBadge: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.muted,
  },
  progressSection: {
    gap: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  progressPct: {
    fontSize: 12,
    color: colors.muted,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 999,
  },
  nextStep: {
    fontSize: 12,
    color: colors.muted,
  },
  nextStepLabel: {
    fontWeight: '600',
    color: colors.text,
  },
});

