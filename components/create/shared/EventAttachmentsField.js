import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ChevronDown, Plus } from 'lucide-react';
import { getMaterials } from '../../../lib/services/materialsClient';
import Dropdown from '../../ui/Dropdown';
import { createModalStyles as styles, MUTED, PLACEHOLDER, ACCENT_TEXT, FG } from './createModalStyles';

export default function EventAttachmentsField({
  familyId,
  selectedMaterialId,
  onMaterialChange,
  onAddNew,
  label = 'Attachments',
  placeholder = 'Select attachment…',
  allowMultiple = false,
  selectedMaterialIds = [],
  onAddExistingMaterial = null,
  materialFilter = null,
}) {
  const [materials, setMaterials] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    setLoading(true);
    getMaterials(familyId)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setMaterials(typeof materialFilter === 'function' ? list.filter(materialFilter) : list);
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
  }, [familyId, materialFilter]);

  useEffect(() => {
    setOpen(false);
  }, [selectedMaterialId, selectedMaterialIds?.length]);

  const selected = materials.find((m) => String(m.id) === String(selectedMaterialId));
  const attachedIdSet = new Set((selectedMaterialIds || []).map(String));
  const availableMaterials = allowMultiple
    ? materials.filter((material) => !attachedIdSet.has(String(material.id)))
    : materials;
  const selectLabel = loading
    ? 'Loading…'
    : allowMultiple
      ? placeholder
      : (selected?.title || selected?.name || placeholder);

  return (
    <View style={styles.formGroup}>
      {label != null && label !== '' ? (
        <Text style={styles.fieldLabel}>{label}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TouchableOpacity
          ref={triggerRef}
          style={[styles.select, { flex: 1 }]}
          onPress={() => setOpen((v) => !v)}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={[styles.selectText, (!selected || allowMultiple) && !loading && styles.selectPlaceholder, loading && { color: PLACEHOLDER }]}>
            {selectLabel}
          </Text>
          <ChevronDown size={16} color={MUTED} />
        </TouchableOpacity>
        {onAddNew ? (
          <TouchableOpacity
            onPress={onAddNew}
            style={[styles.dropdownOption, styles.addNewButton]}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={14} color={ACCENT_TEXT} />
            <Text style={styles.addNewButtonText}>Add New</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Dropdown
        visible={open}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        matchTriggerWidth
        maxHeight={220}
        offset={4}
      >
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 216 }}
          {...(Platform.OS === 'web' && {
            style: { maxHeight: 216, overflowY: 'auto' },
          })}
        >
          {!allowMultiple ? (
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
          ) : null}
          {availableMaterials.length === 0 ? (
            <View style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 14, color: MUTED }}>
                {materials.length === 0 ? 'No materials yet' : 'All materials attached'}
              </Text>
            </View>
          ) : null}
          {availableMaterials.map((material) => {
            const active = !allowMultiple && String(material.id) === String(selectedMaterialId);
            return (
              <TouchableOpacity
                key={String(material.id)}
                onPress={() => {
                  if (allowMultiple) {
                    onAddExistingMaterial?.(material);
                  } else {
                    onMaterialChange?.(material.id);
                  }
                  setOpen(false);
                }}
                style={[
                  { paddingVertical: 10, paddingHorizontal: 12 },
                  active ? styles.dropdownListItemActive : { backgroundColor: '#fff' },
                ]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={{ fontSize: 14, color: active ? ACCENT_TEXT : FG }}>
                  {material.title || material.name || 'Untitled'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Dropdown>
    </View>
  );
}

export function materialIdsFromSelection(selectedMaterialId) {
  if (Array.isArray(selectedMaterialId)) {
    return selectedMaterialId.filter(Boolean).map(String);
  }
  return selectedMaterialId ? [String(selectedMaterialId)] : [];
}
