import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { 
  X, Search, Plus, LayoutGrid, ArrowUpDown, Calendar, 
  BookOpen, FileText, Package, CheckCircle2, Clock, AlertCircle
} from 'lucide-react';
import ChipsBar from './ChipsBar';
import TaskList from './TaskList';
import { getSubjectAccent } from '../theme/designTokens';

export default function TasksPane({
  tasks = [],
  children = [],
  activeChildIds = [],
  onToggleChild,
  activeLabels = [],
  onToggleLabel,
  onClose,
  onOpenKanban,
  onAddTask,
  onSearchTasks,
  onEditTask,
  onViewTask,
  onMarkComplete,
}) {
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('time');
  const [hoveredTask, setHoveredTask] = useState(null);

  // Calculate overview stats
  const overview = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + (7 - today.getDay()));

    const todayTasks = tasks.filter(task => {
      if (!task.start) return false;
      const taskDate = new Date(task.start);
      return taskDate >= today && taskDate < tomorrow;
    });

    const weekTasks = tasks.filter(task => {
      if (!task.start) return false;
      const taskDate = new Date(task.start);
      return taskDate >= today && taskDate < weekEnd;
    });

    const missedTasks = tasks.filter(task => {
      if (!task.start || task.completedAt) return false;
      const taskDate = new Date(task.start);
      return taskDate < today;
    });

    return {
      today: todayTasks.length,
      week: weekTasks.length,
      missed: missedTasks.length,
    };
  }, [tasks]);

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];

    // Apply status filter
    if (statusFilter === 'Upcoming') {
      const now = new Date();
      filtered = filtered.filter(task => {
        if (!task.start) return false;
        return new Date(task.start) >= now && !task.completedAt;
      });
    } else if (statusFilter === 'Overdue') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter(task => {
        if (!task.start || task.completedAt) return false;
        return new Date(task.start) < today;
      });
    } else if (statusFilter === 'Completed') {
      filtered = filtered.filter(task => task.completedAt);
    }

    // Apply sorting
    if (sortBy === 'time') {
      filtered.sort((a, b) => {
        if (!a.start && !b.start) return 0;
        if (!a.start) return 1;
        if (!b.start) return -1;
        return new Date(a.start) - new Date(b.start);
      });
    } else if (sortBy === 'title') {
      filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortBy === 'child') {
      filtered.sort((a, b) => {
        const aChild = children.find(c => c.id === a.childId);
        const bChild = children.find(c => c.id === b.childId);
        const aName = aChild?.first_name || '';
        const bName = bChild?.first_name || '';
        return aName.localeCompare(bName);
      });
    }

    return filtered;
  }, [tasks, statusFilter, sortBy, children]);

  const hasTasks = filteredTasks.length > 0;
  const hasNoTasks = tasks.length === 0;

  return (
    <View style={styles.container}>
      {/* Pastel gradient accent */}
      <View style={styles.gradientAccent} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Tasks</Text>
            <Text style={styles.headerSubtitle}>All upcoming tasks across all children</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Quick Actions Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={onSearchTasks}
            {...(Platform.OS === 'web' && { title: 'Search Tasks' })}
          >
            <Search size={16} color="#6b7280" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={onAddTask}
            {...(Platform.OS === 'web' && { title: 'Add Task' })}
          >
            <Plus size={16} color="#6b7280" />
          </TouchableOpacity>
          {onOpenKanban && (
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={onOpenKanban}
              {...(Platform.OS === 'web' && { title: 'Open Kanban' })}
            >
              <LayoutGrid size={16} color="#6b7280" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.toolbarButton}
            {...(Platform.OS === 'web' && { title: 'Sort' })}
          >
            <ArrowUpDown size={16} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Soft divider */}
        <View style={styles.divider} />
      </View>

      {/* Today Overview */}
      {!hasNoTasks && (
        <View style={styles.overview}>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>Today:</Text>
            <Text style={styles.overviewValue}>{overview.today} tasks</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>This week:</Text>
            <Text style={styles.overviewValue}>{overview.week} tasks</Text>
          </View>
          {overview.missed > 0 && (
            <View style={[styles.overviewItem, styles.overviewItemMissed]}>
              <Text style={styles.overviewLabel}>Missed:</Text>
              <Text style={[styles.overviewValue, styles.overviewValueMissed]}>{overview.missed}</Text>
            </View>
          )}
        </View>
      )}

      {/* Status Filter & Sort */}
      <View style={styles.filtersSection}>
        <View style={styles.statusFilter}>
          {['All', 'Upcoming', 'Overdue', 'Completed'].map((status) => (
            <TouchableOpacity
              key={status}
              style={[styles.statusButton, statusFilter === status && styles.statusButtonActive]}
              onPress={() => setStatusFilter(status)}
            >
              <Text style={[styles.statusButtonText, statusFilter === status && styles.statusButtonTextActive]}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sortContainer}>
          <Text style={styles.sortLabel}>Sort:</Text>
          <TouchableOpacity 
            style={styles.sortButton}
            onPress={() => {
              // Cycle through sort options
              const options = ['time', 'title', 'child'];
              const currentIndex = options.indexOf(sortBy);
              const nextIndex = (currentIndex + 1) % options.length;
              setSortBy(options[nextIndex]);
            }}
          >
            <Text style={styles.sortButtonText}>
              {sortBy === 'time' ? 'By time' : sortBy === 'title' ? 'By title' : 'By child'}
            </Text>
            <ArrowUpDown size={14} color="#6b7280" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Child & Label Filters */}
      <View style={styles.chipsSection}>
        <ChipsBar
          childrenList={children}
          activeChildIds={activeChildIds}
          onToggleChild={onToggleChild}
          activeLabels={activeLabels}
          onToggleLabel={onToggleLabel}
        />
      </View>

      {/* Task List */}
      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
      >
        {hasNoTasks ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Nothing scheduled for today ✨</Text>
            <Text style={styles.emptyStateHint}>Try: "Add new task"</Text>
          </View>
        ) : !hasTasks ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No {statusFilter.toLowerCase()} tasks found</Text>
            {statusFilter !== 'All' && (
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => setStatusFilter('All')}
              >
                <Text style={styles.emptyStateButtonText}>Show all tasks</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TaskList 
            tasks={filteredTasks} 
            emptyText="No tasks found"
            children={children}
            onEditTask={onEditTask}
            onViewTask={onViewTask}
            onMarkComplete={onMarkComplete}
            hoveredTask={hoveredTask}
            onHoverTask={setHoveredTask}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(229, 231, 235, 0.6)',
    ...(Platform.OS === 'web' && {
      boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.04)',
    }),
  },
  gradientAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(109, 139, 255, 0.04)', // 4% opacity pastel blue
    zIndex: 1,
  },
  header: {
    paddingTop: 4,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fafafa',
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }),
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  toolbarButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#e5e7eb',
      },
    }),
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(243, 244, 246, 0.7)',
    marginTop: 4,
  },
  overview: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(243, 244, 246, 0.7)',
  },
  overviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overviewItemMissed: {
    marginLeft: 'auto',
  },
  overviewLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  overviewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  overviewValueMissed: {
    color: '#dc2626',
  },
  filtersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(243, 244, 246, 0.7)',
  },
  statusFilter: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 2,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusButtonActive: {
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    }),
  },
  statusButtonText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  statusButtonTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#e5e7eb',
      },
    }),
  },
  sortButtonText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  chipsSection: {
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    minHeight: 300,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateHint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyStateButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  emptyStateButtonText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
});

