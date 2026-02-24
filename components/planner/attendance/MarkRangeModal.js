import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import { X } from 'lucide-react';

export default function MarkRangeModal({
  visible,
  children = [],
  onClose,
  onConfirm,
}) {
  const [childId, setChildId] = useState(children[0]?.id || null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleConfirm = () => {
    onConfirm && onConfirm({ childId, fromDate, toDate });
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.box} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Mark attendance</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.body}>
            <Text style={styles.label}>Child</Text>
            <View style={styles.childRow}>
              {children.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.childChip, childId === c.id && styles.childChipActive]}
                  onPress={() => setChildId(c.id)}
                >
                  <Text style={[styles.childChipText, childId === c.id && styles.childChipTextActive]}>
                    {c.first_name || c.name || 'Child'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>From</Text>
            <TextInput
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="YYYY-MM-DD"
              style={styles.input}
            />
            <Text style={styles.label}>To</Text>
            <TextInput
              value={toDate}
              onChangeText={setToDate}
              placeholder="YYYY-MM-DD"
              style={styles.input}
            />
          </View>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, (!fromDate || !toDate) && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!fromDate || !toDate}
            >
              <Text style={styles.confirmBtnText}>Mark all scheduled events attended</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxWidth: 400,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  body: { padding: 20 },
  label: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 },
  childRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  childChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  childChipActive: { backgroundColor: 'rgba(167, 139, 250, 0.2)' },
  childChipText: { fontSize: 14, color: '#374151' },
  childChipTextActive: { color: '#6D28D9', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginBottom: 16,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelBtnText: { fontSize: 14, color: '#6B7280' },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
