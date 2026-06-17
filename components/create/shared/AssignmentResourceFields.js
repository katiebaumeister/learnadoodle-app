import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { FileText, X } from 'lucide-react';
import EventAttachmentsField from './EventAttachmentsField';
import MaterialDocViewerModal, { resolveMaterialDocViewerUrl } from '../../materials/MaterialDocViewerModal';
import { getMaterials } from '../../../lib/services/materialsClient';
import { useToast } from '../../Toast';
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
  const toast = useToast();
  const [materials, setMaterials] = useState([]);
  const [openingMaterialId, setOpeningMaterialId] = useState(null);
  const [viewerState, setViewerState] = useState({
    visible: false,
    url: '',
    title: '',
    kind: 'pdf',
  });
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

  const closeMaterialViewer = useCallback(() => {
    setViewerState({ visible: false, url: '', title: '', kind: 'pdf' });
  }, []);

  const openMaterialViewer = useCallback(async (materialId, fallbackTitle) => {
    if (!materialId || openingMaterialId) return;
    setOpeningMaterialId(String(materialId));
    try {
      const { url, title, error, viewerKind } = await resolveMaterialDocViewerUrl(materialId);
      if (error || !url) {
        const isInfo = error
          && /cannot be viewed|does not have a viewable|isn’t available|isn't available|Preview isn’t/i.test(error);
        toast.push(error || 'Could not open this attachment.', isInfo ? 'info' : 'error');
        return;
      }
      setViewerState({
        visible: true,
        url,
        title: title || fallbackTitle || 'Attachment',
        kind: viewerKind || 'pdf',
      });
    } catch (_) {
      toast.push('Failed to load attachment. Please try again.', 'error');
    } finally {
      setOpeningMaterialId(null);
    }
  }, [openingMaterialId, toast]);

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
            <TouchableOpacity
              key={material.id}
              style={[
                styles.attachmentChip,
                openingMaterialId === String(material.id) && styles.attachmentChipOpening,
              ]}
              onPress={() => openMaterialViewer(material.id, material.title)}
              accessibilityRole="button"
              accessibilityLabel={`View ${material.title}`}
              activeOpacity={0.85}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <FileText size={14} color="#6BB3E8" />
              <Text style={styles.attachmentChipText} numberOfLines={1}>
                {material.title}
              </Text>
              <TouchableOpacity
                onPress={(ev) => {
                  if (ev?.stopPropagation) ev.stopPropagation();
                  removeMaterial(material.id);
                }}
                accessibilityLabel={`Remove ${material.title}`}
                accessibilityRole="button"
                hitSlop={8}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={14} color="#94A3B8" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <MaterialDocViewerModal
        visible={viewerState.visible && !!viewerState.url}
        onClose={closeMaterialViewer}
        url={viewerState.url}
        title={viewerState.title}
        viewerKind={viewerState.kind}
      />
    </View>
  );
}
