import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal } from 'react-native';

const TaskItem = ({ task, onChange, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  const categories = ['Admin', 'Curriculum', 'Errands', 'Planning'];

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleCompleteToggle = () => {
    onChange({ ...task, completed: !task.completed });
  };

  const handleTitleEdit = () => {
    setIsEditing(true);
    setEditTitle(task.title);
  };

  const handleTitleSave = () => {
    if (editTitle.trim()) {
      onChange({ ...task, title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  const handleTitleCancel = () => {
    setEditTitle(task.title);
    setIsEditing(false);
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleTitleSave();
    } else if (event.key === 'Escape') {
      handleTitleCancel();
    }
  };

  const handleCategoryChange = (category) => {
    onChange({ ...task, category });
    setShowCategoryMenu(false);
  };

  const handleDateChange = (date) => {
    onChange({ ...task, dueISO: new Date(date).toISOString() });
    setShowDatePicker(false);
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const isOverdue = new Date(task.dueISO) < new Date() && !task.completed;

  return (
    <View style={[
      styles.taskItem,
      task.completed && styles.taskItemCompleted
    ]}>
      {/* Checkbox */}
      <TouchableOpacity
        style={[
          styles.checkbox,
          task.completed && styles.checkboxChecked
        ]}
        onPress={handleCompleteToggle}
        accessibilityLabel={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
        accessibilityRole="checkbox"
        accessibilityChecked={task.completed}
      >
        {task.completed && (
          <Text style={styles.checkmark}>✓</Text>
        )}
      </TouchableOpacity>

      {/* Title */}
      <View style={styles.titleContainer}>
        {isEditing ? (
          <TextInput
            ref={inputRef}
            style={styles.titleInput}
            value={editTitle}
            onChangeText={setEditTitle}
            onBlur={handleTitleSave}
            onKeyPress={handleKeyPress}
            selectTextOnFocus
          />
        ) : (
          <TouchableOpacity onPress={handleTitleEdit}>
            <Text style={[
              styles.title,
              task.completed && styles.titleCompleted
            ]}>
              {task.title}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category */}
      <TouchableOpacity
        style={[
          styles.categoryPill,
          { backgroundColor: getCategoryColor(task.category) }
        ]}
        onPress={() => setShowCategoryMenu(true)}
        accessibilityLabel={`Category: ${task.category}`}
      >
        <Text style={styles.categoryText}>{task.category}</Text>
      </TouchableOpacity>

      {/* Due Date */}
      <TouchableOpacity
        style={[
          styles.dueDate,
          isOverdue && styles.dueDateOverdue
        ]}
        onPress={() => setShowDatePicker(true)}
        accessibilityLabel={`Due: ${formatDate(task.dueISO)}`}
      >
        <Text style={[
          styles.dueDateText,
          isOverdue && styles.dueDateTextOverdue
        ]}>
          {formatDate(task.dueISO)}
        </Text>
      </TouchableOpacity>

      {/* Attachments */}
      <TouchableOpacity
        style={styles.attachmentButton}
        onPress={() => setShowAttachments(true)}
        accessibilityLabel={`${task.attachments.length} attachments`}
      >
        <Text style={styles.attachmentIcon}>📎</Text>
        {task.attachments.length > 0 && (
          <Text style={styles.attachmentCount}>{task.attachments.length}</Text>
        )}
      </TouchableOpacity>

      {/* Category Menu */}
      {showCategoryMenu && (
        <Modal
          visible={true}
          transparent={true}
          animationType="none"
          onRequestClose={() => setShowCategoryMenu(false)}
        >
          <View style={styles.menuOverlay}>
            <View ref={menuRef} style={styles.categoryMenu}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category}
                  style={styles.categoryMenuItem}
                  onPress={() => handleCategoryChange(category)}
                >
                  <Text style={styles.categoryMenuText}>{category}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      )}

      {/* Attachments Popover */}
      {showAttachments && (
        <Modal
          visible={true}
          transparent={true}
          animationType="none"
          onRequestClose={() => setShowAttachments(false)}
        >
          <View style={styles.menuOverlay}>
            <View style={styles.attachmentsMenu}>
              <Text style={styles.attachmentsTitle}>Attachments</Text>
              {task.attachments.length > 0 ? (
                task.attachments.map((attachment, index) => (
                  <Text key={index} style={styles.attachmentItem}>
                    {attachment}
                  </Text>
                ))
              ) : (
                <Text style={styles.noAttachments}>No attachments</Text>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* Date Picker */}
      {showDatePicker && (
        <Modal
          visible={true}
          transparent={true}
          animationType="none"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.menuOverlay}>
            <View style={styles.datePickerMenu}>
              <Text style={styles.datePickerTitle}>Set Due Date</Text>
              <input
                type="date"
                defaultValue={task.dueISO.split('T')[0]}
                onChange={(e) => handleDateChange(e.target.value)}
                style={styles.dateInput}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const getCategoryColor = (category) => {
  const colors = {
    'Admin': '#fef3c7',
    'Curriculum': '#dbeafe',
    'Errands': '#fce7f3',
    'Planning': '#dcfce7'
  };
  return colors[category] || '#f3f4f6';
};

const styles = {
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  taskItemCompleted: {
    opacity: 0.6,
    backgroundColor: '#f9fafb',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    lineHeight: 20,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  titleInput: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    backgroundColor: '#f9fafb',
    padding: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  dueDate: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  dueDateOverdue: {
    backgroundColor: '#fee2e2',
  },
  dueDateText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  dueDateTextOverdue: {
    color: '#dc2626',
  },
  attachmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  attachmentIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  attachmentCount: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  menuOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  categoryMenu: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 120,
  },
  categoryMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  categoryMenuText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  attachmentsMenu: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    minWidth: 200,
  },
  attachmentsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  attachmentItem: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  noAttachments: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  datePickerMenu: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  datePickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  dateInput: {
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    fontSize: 14,
  },
};

export default TaskItem;
