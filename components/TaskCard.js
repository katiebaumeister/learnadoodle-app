import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Edit, Eye, CheckCircle, ExternalLink } from 'lucide-react';
import { getSubjectAccent } from '../theme/designTokens';

export default function TaskCard({ 
  task, 
  opacity = 1, 
  children = [],
  onEditTask,
  onViewTask,
  onMarkComplete,
  isHovered = false,
  onHover,
}) {
  const formatTime = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return null;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const taskDate = new Date(d);
      taskDate.setHours(0, 0, 0, 0);
      
      if (taskDate.getTime() === today.getTime()) {
        return 'Today';
      }
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (taskDate.getTime() === tomorrow.getTime()) {
        return 'Tomorrow';
      }
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return null;
    }
  };

  const getDuration = () => {
    if (!task.start || !task.end) return null;
    try {
      const start = new Date(task.start);
      const end = new Date(task.end);
      const minutes = Math.round((end - start) / (1000 * 60));
      if (minutes < 60) return `${minutes}m`;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    } catch {
      return null;
    }
  };

  const getStatus = () => {
    if (task.completedAt) return 'completed';
    if (!task.start) return 'unscheduled';
    const now = new Date();
    const taskDate = new Date(task.start);
    if (taskDate < now) return 'overdue';
    return 'upcoming';
  };

  const getStatusText = () => {
    const status = getStatus();
    if (status === 'completed') return 'Completed';
    if (status === 'overdue') return 'Overdue';
    if (status === 'unscheduled') return 'Unscheduled';
    return 'Upcoming';
  };

  // Get subject from labels or determine from title
  const getSubject = () => {
    if (task.labels && task.labels.length > 0) {
      const subjectLabels = task.labels.filter(l => 
        ['math', 'reading', 'science', 'art', 'history', 'language'].some(s => 
          l.toLowerCase().includes(s)
        )
      );
      if (subjectLabels.length > 0) {
        return subjectLabels[0];
      }
    }
    // Try to infer from title
    const title = (task.title || '').toLowerCase();
    if (title.includes('math') || title.includes('algebra') || title.includes('geometry')) {
      return 'Math';
    }
    if (title.includes('reading') || title.includes('book') || title.includes('literature')) {
      return 'Reading';
    }
    if (title.includes('science') || title.includes('biology') || title.includes('chemistry')) {
      return 'Science';
    }
    return null;
  };

  const subject = getSubject();
  const subjectAccent = subject ? getSubjectAccent(subject) : null;
  const subjectColor = subjectAccent?.bold || '#6b7280';
  const status = getStatus();
  const startTime = formatTime(task.start);
  const endTime = formatTime(task.end);
  const date = formatDate(task.start);
  const duration = getDuration();
  const child = children.find(c => c.id === task.childId);

  return (
    <View 
      style={[styles.card, { opacity }]}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => onHover?.(task.id),
        onMouseLeave: () => onHover?.(null),
      })}
    >
      {/* Subject indicator stripe */}
      {subject && (
        <View style={[styles.subjectStripe, { backgroundColor: subjectColor }]} />
      )}

      <View style={styles.cardContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{task.title || 'Untitled Task'}</Text>
            {subject && (
              <View style={[styles.subjectChip, { backgroundColor: subjectAccent?.soft || '#f3f4f6' }]}>
                <Text style={[styles.subjectChipText, { color: subjectColor }]}>
                  {subject}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Metadata */}
        <View style={styles.metadata}>
          {date && (
            <Text style={styles.metadataText}>
              {date}
              {startTime && endTime && ` · ${startTime}–${endTime}`}
              {duration && ` · ${duration}`}
            </Text>
          )}
          {child && (
            <Text style={styles.metadataText}>
              {child.first_name || child.name}
            </Text>
          )}
        </View>

        {/* Status & Actions */}
        <View style={styles.footer}>
          <View style={styles.statusContainer}>
            <View style={[styles.statusBadge, status === 'completed' && styles.statusBadgeCompleted, status === 'overdue' && styles.statusBadgeOverdue]}>
              <Text style={[styles.statusText, status === 'completed' && styles.statusTextCompleted, status === 'overdue' && styles.statusTextOverdue]}>
                {getStatusText()}
              </Text>
            </View>
          </View>

          {/* Hover Actions */}
          {isHovered && Platform.OS === 'web' && (
            <View style={styles.actions}>
              {onViewTask && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onViewTask(task);
                  }}
                  {...(Platform.OS === 'web' && { title: 'View details' })}
                >
                  <Eye size={14} color="#6b7280" />
                </TouchableOpacity>
              )}
              {onEditTask && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onEditTask(task);
                  }}
                  {...(Platform.OS === 'web' && { title: 'Edit' })}
                >
                  <Edit size={14} color="#6b7280" />
                </TouchableOpacity>
              )}
              {onMarkComplete && status !== 'completed' && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onMarkComplete(task);
                  }}
                  {...(Platform.OS === 'web' && { title: 'Mark done' })}
                >
                  <CheckCircle size={14} color="#6b7280" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.actionButton}
                {...(Platform.OS === 'web' && { title: 'Open in planner' })}
              >
                <ExternalLink size={14} color="#6b7280" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Labels */}
        {task.labels && task.labels.length > 0 && (
          <View style={styles.labels}>
            {task.labels.slice(0, 3).map((label, idx) => (
              <View key={idx} style={styles.label}>
                <Text style={styles.labelText}>#{label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
      transition: 'all 0.2s ease',
      ':hover': {
        borderColor: '#e5e7eb',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.12)',
      },
    }),
  },
  subjectStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardContent: {
    padding: 12, // 10-20% smaller (was 16)
  },
  header: {
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600', // Bold
    color: '#111827',
    flex: 1,
  },
  subjectChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  subjectChipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  metadataText: {
    fontSize: 12,
    color: '#6b7280',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusContainer: {
    flex: 1,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  statusBadgeCompleted: {
    backgroundColor: '#ecfdf3',
  },
  statusBadgeOverdue: {
    backgroundColor: '#fef2f2',
  },
  statusText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  statusTextCompleted: {
    color: '#059669',
  },
  statusTextOverdue: {
    color: '#dc2626',
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#f3f4f6',
      },
    }),
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  label: {
    backgroundColor: '#f9fafb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 10,
    color: '#6b7280',
  },
});
