import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Check, X, Edit2, Calendar } from 'lucide-react';
import { colors } from '../../theme/colors';
import { formatDate } from '../../lib/apiClient';

export default function PlanReviewTable({ items, onAccept, onCancel }) {
  const [editedItems, setEditedItems] = useState(items || []);
  const [editingId, setEditingId] = useState(null);

  const handleEdit = (id, field, value) => {
    setEditedItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleToggleFlexible = (id) => {
    setEditedItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, is_flexible: !item.is_flexible } : item
      )
    );
  };

  const handleAccept = () => {
    onAccept?.(editedItems);
  };

  if (!items || items.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No plan suggestions to review</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Review Plan Suggestions</Text>
        <Text style={styles.subtitle}>Edit minutes, target day, or mark as flexible before accepting</Text>
      </View>

      <ScrollView style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.headerCell}>Section</Text>
          <Text style={styles.headerCell}>Minutes</Text>
          <Text style={styles.headerCell}>Target Day</Text>
          <Text style={styles.headerCell}>Flexible</Text>
        </View>

        {editedItems.map((item) => (
          <View key={item.id} style={styles.tableRow}>
            <View style={styles.sectionCell}>
              <Text style={styles.sectionTitle}>{item.title || 'Untitled'}</Text>
              {item.description && (
                <Text style={styles.sectionDescription} numberOfLines={1}>
                  {item.description}
                </Text>
              )}
            </View>

            <View style={styles.inputCell}>
              {editingId === item.id ? (
                <TextInput
                  style={styles.input}
                  value={String(item.estimated_minutes || '')}
                  onChangeText={(text) => handleEdit(item.id, 'estimated_minutes', parseInt(text) || 0)}
                  keyboardType="numeric"
                  onBlur={() => setEditingId(null)}
                />
              ) : (
                <TouchableOpacity
                  style={styles.editableValue}
                  onPress={() => setEditingId(item.id)}
                >
                  <Text style={styles.valueText}>{item.estimated_minutes || 0}</Text>
                  <Edit2 size={12} color={colors.muted} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.inputCell}>
              {editingId === item.id ? (
                <TextInput
                  style={styles.input}
                  value={item.target_day || ''}
                  onChangeText={(text) => handleEdit(item.id, 'target_day', text)}
                  placeholder="YYYY-MM-DD"
                  onBlur={() => setEditingId(null)}
                />
              ) : (
                <TouchableOpacity
                  style={styles.editableValue}
                  onPress={() => setEditingId(item.id)}
                >
                  <Calendar size={12} color={colors.muted} />
                  <Text style={styles.valueText}>
                    {item.target_day ? formatDate(item.target_day) : 'Not set'}
                  </Text>
                  <Edit2 size={12} color={colors.muted} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.toggleCell}>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  item.is_flexible && styles.toggleActive
                ]}
                onPress={() => handleToggleFlexible(item.id)}
              >
                {item.is_flexible && <Check size={12} color={colors.white} />}
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
        >
          <X size={16} color={colors.text} />
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={handleAccept}
        >
          <Check size={16} color={colors.white} />
          <Text style={styles.acceptButtonText}>Accept Plan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  table: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.panel,
  },
  headerCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  sectionCell: {
    flex: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 12,
    color: colors.muted,
  },
  inputCell: {
    flex: 1,
  },
  editableValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
    backgroundColor: colors.panel,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  valueText: {
    fontSize: 14,
    color: colors.text,
  },
  input: {
    fontSize: 14,
    color: colors.text,
    padding: 8,
    backgroundColor: colors.panel,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  toggleCell: {
    flex: 0.5,
    alignItems: 'center',
  },
  toggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
    gap: 8,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
});

