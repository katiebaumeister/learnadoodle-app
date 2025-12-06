import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import { 
  X, Search, ArrowUpDown, LayoutGrid, MoreVertical, Plus,
  CheckCircle, Edit, ArrowRight, Trash2, ChevronDown, ChevronRight,
  Package, FileText, BookOpen, Download
} from 'lucide-react';
import ChipsBar from './ChipsBar';
import { getSubjectAccent } from '../theme/designTokens';

const BACKLOG_SECTIONS = [
  { key: 'ideas', label: 'Ideas', icon: Package },
  { key: 'to_assign', label: 'To Assign', icon: FileText },
  { key: 'waiting', label: 'Waiting on child', icon: BookOpen },
  { key: 'deferred', label: 'Deferred', icon: ArrowRight },
];

const LABEL_ICONS = {
  projects: Package,
  homework: FileText,
  lessons: BookOpen,
};

export default function BacklogPane({
  tasks = [],
  children = [],
  activeChildIds = [],
  onToggleChild,
  activeLabels = [],
  onToggleLabel,
  onClose,
  onOpenKanban,
  onAddTask,
  onEditTask,
  onMoveToSchedule,
  onMarkReady,
  onDeleteTask,
}) {
  const [quickAddText, setQuickAddText] = useState('');
  const [hoveredTask, setHoveredTask] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    ideas: true,
    to_assign: true,
    waiting: true,
    deferred: true,
  });

  // Group tasks by section (for now, all go to 'to_assign' unless they have a section field)
  const groupedTasks = useMemo(() => {
    const groups = {
      ideas: [],
      to_assign: [],
      waiting: [],
      deferred: [],
    };

    tasks.forEach(task => {
      const section = task.section || 'to_assign';
      if (groups[section]) {
        groups[section].push(task);
      } else {
        groups.to_assign.push(task);
      }
    });

    return groups;
  }, [tasks]);

  const handleQuickAdd = () => {
    const text = quickAddText.trim();
    if (text && onAddTask) {
      onAddTask(text);
      setQuickAddText('');
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const hasTasks = tasks.length > 0;

  return (
    <View style={styles.container}>
      {/* Pastel gradient accent */}
      <View style={styles.gradientAccent} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Backlog</Text>
            <Text style={styles.headerSubtitle}>Unschedule tasks you'll assign later</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Quick Actions Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolbarButton}
            {...(Platform.OS === 'web' && { title: 'Search' })}
          >
            <Search size={16} color="#6b7280" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolbarButton}
            {...(Platform.OS === 'web' && { title: 'Sort' })}
          >
            <ArrowUpDown size={16} color="#6b7280" />
          </TouchableOpacity>
          {onOpenKanban && (
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={onOpenKanban}
              {...(Platform.OS === 'web' && { title: 'Kanban' })}
            >
              <LayoutGrid size={16} color="#6b7280" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.toolbarButton}
            {...(Platform.OS === 'web' && { title: 'More' })}
          >
            <MoreVertical size={16} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Soft divider */}
        <View style={styles.divider} />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
      >
        {/* Quick Add Input */}
        <View style={styles.quickAddSection}>
          <View style={styles.quickAddContainer}>
            <Plus size={18} color="#9ca3af" style={{ marginRight: 10, opacity: 0.7 }} />
            <TextInput
              style={styles.quickAddInput}
              placeholder="Add a quick task… e.g. 'Write essay intro'"
              placeholderTextColor="#9ca3af"
              value={quickAddText}
              onChangeText={setQuickAddText}
              onSubmitEditing={handleQuickAdd}
              returnKeyType="done"
            />
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

        {/* Backlog Sections */}
        {hasTasks ? (
          <View style={styles.sectionsContainer}>
            {BACKLOG_SECTIONS.map((section) => {
              const sectionTasks = groupedTasks[section.key] || [];
              const isExpanded = expandedSections[section.key];
              const IconComponent = section.icon;

              return (
                <View key={section.key} style={styles.section}>
                  <TouchableOpacity
                    style={styles.sectionHeader}
                    onPress={() => toggleSection(section.key)}
                  >
                    {isExpanded ? (
                      <ChevronDown size={16} color="#6b7280" />
                    ) : (
                      <ChevronRight size={16} color="#6b7280" />
                    )}
                    <IconComponent size={16} color="#6b7280" style={{ marginLeft: 6, marginRight: 8 }} />
                    <Text style={styles.sectionTitle}>{section.label}</Text>
                    <Text style={styles.sectionCount}>{sectionTasks.length}</Text>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.sectionContent}>
                      {sectionTasks.length > 0 ? (
                        sectionTasks.map((task, idx) => (
                          <BacklogItem
                            key={task.id || idx}
                            task={task}
                            children={children}
                            isHovered={hoveredTask === task.id}
                            onHover={setHoveredTask}
                            onEdit={onEditTask}
                            onMoveToSchedule={onMoveToSchedule}
                            onMarkReady={onMarkReady}
                            onDelete={onDeleteTask}
                          />
                        ))
                      ) : (
                        <View style={styles.sectionEmpty}>
                          <Text style={styles.sectionEmptyText}>No tasks in this section</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIcon}>
                <Download size={48} color="#d1d5db" style={{ opacity: 0.3 }} />
              </View>
              <Text style={styles.emptyStateTitle}>Drag tasks here</Text>
              <Text style={styles.emptyStateSubtitle}>or add new tasks above</Text>
            </View>
            <View style={styles.emptyStateMessage}>
              <Text style={styles.emptyStateText}>Your backlog is empty</Text>
              <Text style={styles.emptyStateHint}>
                This is where you store ideas and unscheduled tasks.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function BacklogItem({
  task,
  children = [],
  isHovered = false,
  onHover,
  onEdit,
  onMoveToSchedule,
  onMarkReady,
  onDelete,
}) {
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
    return null;
  };

  const subject = getSubject();
  const subjectAccent = subject ? getSubjectAccent(subject) : null;
  const subjectColor = subjectAccent?.bold || '#6b7280';
  const child = children.find(c => c.id === task.childId);

  return (
    <View
      style={styles.backlogItem}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => onHover?.(task.id),
        onMouseLeave: () => onHover?.(null),
      })}
    >
      {/* Subject indicator stripe */}
      {subject && (
        <View style={[styles.subjectStripe, { backgroundColor: subjectColor }]} />
      )}

      <View style={styles.backlogItemContent}>
        <View style={styles.backlogItemLeft}>
          <Text style={styles.backlogItemTitle}>{task.title || 'Untitled Task'}</Text>
          <View style={styles.backlogItemMeta}>
            {child && (
              <Text style={styles.backlogItemMetaText}>{child.first_name || child.name}</Text>
            )}
            {subject && (
              <View style={[styles.backlogItemSubject, { backgroundColor: subjectAccent?.soft || '#f3f4f6' }]}>
                <Text style={[styles.backlogItemSubjectText, { color: subjectColor }]}>
                  {subject}
                </Text>
              </View>
            )}
            {task.labels && task.labels.length > 0 && (
              <View style={styles.backlogItemLabels}>
                {task.labels.slice(0, 2).map((label, idx) => {
                  const LabelIcon = LABEL_ICONS[label.toLowerCase()];
                  return (
                    <View key={idx} style={styles.backlogItemLabel}>
                      {LabelIcon && <LabelIcon size={12} color="#6b7280" style={{ marginRight: 4 }} />}
                      <Text style={styles.backlogItemLabelText}>#{label}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* Hover Actions */}
        {isHovered && Platform.OS === 'web' && (
          <View style={styles.backlogItemActions}>
            {onMarkReady && (
              <TouchableOpacity
                style={styles.backlogItemAction}
                onPress={(e) => {
                  e.stopPropagation();
                  onMarkReady(task);
                }}
                {...(Platform.OS === 'web' && { title: 'Mark ready' })}
              >
                <CheckCircle size={14} color="#6b7280" />
              </TouchableOpacity>
            )}
            {onEdit && (
              <TouchableOpacity
                style={styles.backlogItemAction}
                onPress={(e) => {
                  e.stopPropagation();
                  onEdit(task);
                }}
                {...(Platform.OS === 'web' && { title: 'Edit' })}
              >
                <Edit size={14} color="#6b7280" />
              </TouchableOpacity>
            )}
            {onMoveToSchedule && (
              <TouchableOpacity
                style={styles.backlogItemAction}
                onPress={(e) => {
                  e.stopPropagation();
                  onMoveToSchedule(task);
                }}
                {...(Platform.OS === 'web' && { title: 'Move to schedule' })}
              >
                <ArrowRight size={14} color="#6b7280" />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.backlogItemAction}
                onPress={(e) => {
                  e.stopPropagation();
                  onDelete(task);
                }}
                {...(Platform.OS === 'web' && { title: 'Delete' })}
              >
                <Trash2 size={14} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
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
    backgroundColor: 'rgba(109, 139, 255, 0.04)',
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
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  quickAddSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  quickAddContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    height: 42,
    ...(Platform.OS === 'web' && {
      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.2s ease',
      ':focus-within': {
        borderColor: '#7c8cff',
        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05), 0 0 0 3px rgba(124, 140, 255, 0.1)',
      },
    }),
  },
  quickAddInput: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    padding: 0,
    margin: 0,
  },
  chipsSection: {
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
  },
  sectionsContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  section: {
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      ':hover': {
        backgroundColor: '#f9fafb',
      },
    }),
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  sectionCount: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },
  sectionContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  sectionEmpty: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  sectionEmptyText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  backlogItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      ':hover': {
        borderColor: '#e5e7eb',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
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
  backlogItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  backlogItemLeft: {
    flex: 1,
  },
  backlogItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 6,
  },
  backlogItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  backlogItemMetaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  backlogItemSubject: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  backlogItemSubjectText: {
    fontSize: 11,
    fontWeight: '500',
  },
  backlogItemLabels: {
    flexDirection: 'row',
    gap: 6,
  },
  backlogItemLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  backlogItemLabelText: {
    fontSize: 11,
    color: '#6b7280',
  },
  backlogItemActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  backlogItemAction: {
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    minHeight: 400,
  },
  emptyStateCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#f7f8ff',
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e0e7ff',
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyStateIcon: {
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  emptyStateMessage: {
    alignItems: 'center',
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
});

