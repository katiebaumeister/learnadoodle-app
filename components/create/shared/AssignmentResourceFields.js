import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { FileText, X } from 'lucide-react';
import EventAttachmentsField from './EventAttachmentsField';
import { getMaterials } from '../../../lib/services/materialsClient';
import { createModalStyles as styles } from './createModalStyles';

function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter(Boolean).map(String))];
}

export default function AssignmentResourceFields({
  familyId,
  materialIds = [],
  onMaterialIdsChange,
  onAddMaterial,
  hideLabel = false,
}) {
  const [materials, setMaterials] = useState([]);
  const selectedIds = useMemo(() => normalizeIds(materialIds), [materialIds]);

  useEffect(() => {
    if (!familyId) {
      setMaterials([]);
      return undefined;
    }
    let cancelled = false;
    getMaterials(familyId)
      .then((rows) => {
        if (!cancelled) setMaterials(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setMaterials([]);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  const attachedMaterials = useMemo(() => {
    const byId = new Map(
      (materials || []).map((row) => [String(row.id), row]),
    );
    return selectedIds.map((id) => {
      const row = byId.get(String(id));
      return {
        id,
        title: row?.title || row?.name || 'Attachment',
      };
    });
  }, [materials, selectedIds]);

  const addMaterial = (material) => {
    if (!material?.id) return;
    const nextId = String(material.id);
    if (selectedIds.includes(nextId)) return;
    onMaterialIdsChange?.([...selectedIds, nextId]);
  };

  const removeMaterial = (materialId) => {
    onMaterialIdsChange?.(selectedIds.filter((id) => String(id) !== String(materialId)));
  };

  if (!familyId) return null;

  return (
    <View style={styles.formGroup}>
      <EventAttachmentsField
        familyId={familyId}
        allowMultiple
        selectedMaterialIds={selectedIds}
        onAddExistingMaterial={addMaterial}
        onAddNew={onAddMaterial}
        label={hideLabel ? null : 'Attach'}
        placeholder="Select attachment…"
      />

      {attachedMaterials.length > 0 ? (
        <View style={styles.attachmentChipList}>
          {attachedMaterials.map((material) => (
            <View key={material.id} style={styles.attachmentChip}>
              <FileText size={14} color="#6BB3E8" />
              <Text style={styles.attachmentChipText} numberOfLines={1}>
                {material.title}
              </Text>
              <TouchableOpacity
                onPress={() => removeMaterial(material.id)}
                accessibilityLabel={`Remove ${material.title}`}
                accessibilityRole="button"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={14} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
