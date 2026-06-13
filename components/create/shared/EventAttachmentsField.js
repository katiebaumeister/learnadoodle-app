import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ChevronDown, Plus } from 'lucide-react';
import { getMaterials } from '../../../lib/services/materialsClient';
import { createModalStyles as styles, MUTED, PLACEHOLDER } from './createModalStyles';

export default function EventAttachmentsField({
  familyId,
  selectedMaterialId,
  onMaterialChange,
  onAddNew,
  label = 'Attachments',
}) {
  const [materials, setMaterials] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    setLoading(true);
    getMaterials(familyId)
      .then((rows) => {
        if (!cancelled) setMaterials(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setMaterials([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  const selected = materials.find((m) => String(m.id) === String(selectedMaterialId));

  return (
    <View style={styles.formGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TouchableOpacity
          style={[styles.select, { flex: 1 }]}
          onPress={() => setOpen((v) => !v)}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={[styles.selectText, !selected && !loading && styles.selectPlaceholder, loading && { color: PLACEHOLDER }]}>
            {loading ? 'Loading…' : selected?.title || selected?.name || 'Select attachment…'}
          </Text>
          <ChevronDown size={16} color={MUTED} />
        </TouchableOpacity>
        {onAddNew ? (
          <TouchableOpacity
            onPress={onAddNew}
            style={[styles.dropdownOption, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={14} color="#2563EB" />
            <Text style={[styles.dropdownOptionText, { color: '#2563EB' }]}>Add New</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {open ? (
        <View style={{ marginTop: 4, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, maxHeight: 220, backgroundColor: '#fff' }}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <TouchableOpacity
              onPress={() => {
                onMaterialChange?.(null);
                setOpen(false);
              }}
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 14, color: MUTED }}>None</Text>
            </TouchableOpacity>
            {materials.map((material) => {
              const active = String(material.id) === String(selectedMaterialId);
              return (
                <TouchableOpacity
                  key={String(material.id)}
                  onPress={() => {
                    onMaterialChange?.(material.id);
                    setOpen(false);
                  }}
                  style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: active ? '#EFF6FF' : '#fff' }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={{ fontSize: 14, color: active ? '#1D4ED8' : '#111827' }}>
                    {material.title || material.name || 'Untitled'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function materialIdsFromSelection(selectedMaterialId) {
  return selectedMaterialId ? [selectedMaterialId] : [];
}
