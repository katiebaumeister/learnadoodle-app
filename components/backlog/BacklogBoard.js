/**
 * Trello-style Backlog Board Component
 * Drag-and-drop board for managing unfinished tasks
 */
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import { 
  X, Plus, MoreVertical, GripVertical, Calendar, User, Tag,
  ArrowRight, CheckCircle, Clock, AlertCircle
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getSubjectAccent } from '../../theme/designTokens';

const COLUMNS = [
  { id: 'ideas', title: 'Ideas', color: '#e0e7ff' },
  { id: 'to_assign', title: 'To Assign', color: '#fef3c7' },
  { id: 'in_progress', title: 'In Progress', color: '#dbeafe' },
  { id: 'waiting', title: 'Waiting', color: '#fce7f3' },
  { id: 'done', title: 'Done', color: '#d1fae5' },
];

export default function BacklogBoard({
  tasks = [],
  children = [],
  activeChildIds = [],
  onToggleChild,
  activeLabels = [],
  onToggleLabel,
  onClose,
  onAddTask,
  onEditTask,
  onMoveTask,
  onDeleteTask,
  onUpdateTaskStatus,
}) {
  const [draggedTask, setDraggedTask] = useState(null);
  const [draggedOverColumn, setDraggedOverColumn] = useState(null);
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddColumn, setQuickAddColumn] = useState(null);

  // Group tasks by column
  const tasksByColumn = useMemo(() => {
    const grouped = {};
    COLUMNS.forEach(col => {
      grouped[col.id] = [];
    });

    tasks.forEach(task => {
      const column = task.status || task.section || 'to_assign';
      if (grouped[column]) {
        grouped[column].push(task);
      } else {
        grouped.to_assign.push(task);
      }
    });

    return grouped;
  }, [tasks]);

  const handleQuickAdd = (columnId) => {
    const text = quickAddText.trim();
    if (text && onAddTask) {
      onAddTask(text, columnId);
      setQuickAddText('');
      setQuickAddColumn(null);
    }
  };

  const handleDragStart = (task, columnId) => {
    setDraggedTask({ task, fromColumn: columnId });
  };

  const handleDragOver = (columnId) => {
    if (draggedTask && draggedTask.fromColumn !== columnId) {
      setDraggedOverColumn(columnId);
    }
  };

  const handleDragEnd = () => {
    if (draggedTask && draggedOverColumn && onMoveTask) {
      onMoveTask(draggedTask.task, draggedTask.fromColumn, draggedOverColumn);
    }
    setDraggedTask(null);
    setDraggedOverColumn(null);
  };

  const handleDrop = (columnId) => {
    if (draggedTask && onUpdateTaskStatus) {
      onUpdateTaskStatus(draggedTask.task, columnId);
    }
    handleDragEnd();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Backlog Board</Text>
          <Text style={styles.headerSubtitle}>Drag tasks between columns to organize</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <X size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        horizontal 
        style={styles.boardContainer}
        contentContainerStyle={styles.boardContent}
        showsHorizontalScrollIndicator={false}
      >
        {COLUMNS.map((column) => {
          const columnTasks = tasksByColumn[column.id] || [];
          const isDraggedOver = draggedOverColumn === column.id;
          const isQuickAdd = quickAddColumn === column.id;

          return (
            <View 
              key={column.id} 
              style={[
                styles.column,
                isDraggedOver && styles.columnDraggedOver,
              ]}
              onMouseEnter={() => handleDragOver(column.id)}
              onMouseLeave={() => setDraggedOverColumn(null)}
              onMouseUp={() => handleDrop(column.id)}
            >
              {/* Column Header */}
              <View style={[styles.columnHeader, { backgroundColor: column.color }]}>
                <Text style={styles.columnTitle}>{column.title}</Text>
                <View style={styles.columnCount}>
                  <Text style={styles.columnCountText}>{columnTasks.length}</Text>
                </View>
              </View>

              {/* Quick Add */}
              {isQuickAdd ? (
                <View style={styles.quickAddContainer}>
                  <TextInput
                    style={styles.quickAddInput}
                    placeholder="Task title..."
                    placeholderTextColor="#9ca3af"
                    value={quickAddText}
                    onChangeText={setQuickAddText}
                    onSubmitEditing={() => handleQuickAdd(column.id)}
                    autoFocus
                    onBlur={() => {
                      if (!quickAddText.trim()) {
                        setQuickAddColumn(null);
                      }
                    }}
                  />
                  <View style={styles.quickAddActions}>
                    <TouchableOpacity
                      style={styles.quickAddButton}
                      onPress={() => handleQuickAdd(column.id)}
                    >
                      <Text style={styles.quickAddButtonText}>Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickAddCancel}
                      onPress={() => {
                        setQuickAddColumn(null);
                        setQuickAddText('');
                      }}
                    >
                      <X size={16} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.addCardButton}
                  onPress={() => setQuickAddColumn(column.id)}
                >
                  <Plus size={16} color="#6b7280" />
                  <Text style={styles.addCardText}>Add a card</Text>
                </TouchableOpacity>
              )}

              {/* Tasks */}
              <ScrollView 
                style={styles.columnContent}
                contentContainerStyle={styles.columnContentInner}
              >
                {columnTasks.map((task, idx) => (
                  <BacklogCard
                    key={task.id || idx}
                    task={task}
                    children={children}
                    onEdit={onEditTask}
                    onDelete={onDeleteTask}
                    onDragStart={() => handleDragStart(task, column.id)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function BacklogCard({ task, children = [], onEdit, onDelete, onDragStart, onDragEnd }) {
  const [isHovered, setIsHovered] = useState(false);
  const child = children.find(c => c.id === task.childId);
  const subject = task.subject_id || task.subject;
  const subjectAccent = subject ? getSubjectAccent(subject) : null;

  const formatDue = (dueTs) => {
    if (!dueTs) return null;
    const due = new Date(dueTs);
    const today = new Date();
    const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    
    if (days < 0) return { text: `Overdue ${Math.abs(days)}d`, urgent: true };
    if (days === 0) return { text: 'Due today', urgent: true };
    if (days === 1) return { text: 'Due tomorrow', urgent: false };
    if (days <= 7) return { text: `Due ${days}d`, urgent: false };
    return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false };
  };

  const dueInfo = task.due_ts ? formatDue(task.due_ts) : null;

  return (
    <View
      style={[
        styles.card,
        isHovered && styles.cardHovered,
        subjectAccent && { borderLeftColor: subjectAccent.bold },
      ]}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        onMouseDown: onDragStart,
        onMouseUp: onDragEnd,
        style: {
          ...styles.card,
          ...(isHovered && styles.cardHovered),
          ...(subjectAccent && { borderLeftColor: subjectAccent.bold }),
          cursor: 'grab',
        },
      })}
    >
      {subjectAccent && (
        <View style={[styles.cardSubjectStripe, { backgroundColor: subjectAccent.bold }]} />
      )}

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={3}>
            {task.title || 'Untitled Task'}
          </Text>
          {isHovered && (
            <View style={styles.cardActions}>
              {onEdit && (
                <TouchableOpacity
                  style={styles.cardAction}
                  onPress={() => onEdit(task)}
                >
                  <Text style={styles.cardActionText}>Edit</Text>
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity
                  style={styles.cardAction}
                  onPress={() => onDelete(task)}
                >
                  <Text style={styles.cardActionText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {task.description && (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {task.description}
          </Text>
        )}

        <View style={styles.cardMeta}>
          {child && (
            <View style={styles.cardMetaItem}>
              <User size={12} color="#6b7280" />
              <Text style={styles.cardMetaText}>{child.first_name || child.name}</Text>
            </View>
          )}

          {dueInfo && (
            <View style={[styles.cardMetaItem, dueInfo.urgent && styles.cardMetaUrgent]}>
              <Clock size={12} color={dueInfo.urgent ? '#dc2626' : '#6b7280'} />
              <Text style={[styles.cardMetaText, dueInfo.urgent && styles.cardMetaTextUrgent]}>
                {dueInfo.text}
              </Text>
            </View>
          )}

          {task.labels && task.labels.length > 0 && (
            <View style={styles.cardLabels}>
              {task.labels.slice(0, 2).map((label, idx) => (
                <View key={idx} style={styles.cardLabel}>
                  <Tag size={10} color="#6b7280" />
                  <Text style={styles.cardLabelText}>{label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardDragHandle}>
        <GripVertical size={14} color="#d1d5db" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  closeButton: {
    padding: 8,
  },
  boardContainer: {
    flex: 1,
  },
  boardContent: {
    padding: 16,
    paddingBottom: 32,
  },
  column: {
    width: 300,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginRight: 16,
    maxHeight: 'calc(100vh - 200px)',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  columnDraggedOver: {
    backgroundColor: '#e0e7ff',
    borderWidth: 2,
    borderColor: '#6366f1',
    borderStyle: 'dashed',
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  columnCount: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  columnCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  quickAddContainer: {
    padding: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
  },
  quickAddInput: {
    fontSize: 14,
    color: '#111827',
    padding: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    marginBottom: 8,
  },
  quickAddActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  quickAddButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  quickAddButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  quickAddCancel: {
    padding: 4,
  },
  addCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      ':hover': {
        backgroundColor: '#f9fafb',
      },
    }),
  },
  addCardText: {
    fontSize: 13,
    color: '#6b7280',
  },
  columnContent: {
    flex: 1,
  },
  columnContentInner: {
    paddingBottom: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      ':hover': {
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  cardHovered: {
    borderColor: '#3b82f6',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    }),
  },
  cardSubjectStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardContent: {
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cardAction: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
  },
  cardActionText: {
    fontSize: 11,
    color: '#6b7280',
  },
  cardDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaUrgent: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardMetaText: {
    fontSize: 11,
    color: '#6b7280',
  },
  cardMetaTextUrgent: {
    color: '#dc2626',
    fontWeight: '600',
  },
  cardLabels: {
    flexDirection: 'row',
    gap: 4,
  },
  cardLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardLabelText: {
    fontSize: 10,
    color: '#6b7280',
  },
  cardDragHandle: {
    position: 'absolute',
    right: 8,
    top: 8,
    opacity: 0.5,
  },
});

