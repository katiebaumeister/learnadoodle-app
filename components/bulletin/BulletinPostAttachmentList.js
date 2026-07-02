import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { FileText } from 'lucide-react';
import MaterialDocViewerModal, {
  inferMaterialViewerKind,
  resolveMaterialDocViewerUrl,
} from '../materials/MaterialDocViewerModal';
import { formatAttachmentLabel } from '../../lib/bulletinAttachmentLabel';

export default function BulletinPostAttachmentList({ materials = [], style = null }) {
  const [openingMaterialId, setOpeningMaterialId] = useState(null);
  const [viewer, setViewer] = useState({
    visible: false,
    url: '',
    title: '',
    viewerKind: 'pdf',
  });

  const closeViewer = useCallback(() => {
    setViewer({ visible: false, url: '', title: '', viewerKind: 'pdf' });
  }, []);

  const openMaterial = useCallback(async (material, materialId, event) => {
    if (Platform.OS === 'web' && event?.stopPropagation) {
      event.stopPropagation();
    }

    const id = material?.id || materialId;
    if (!id || openingMaterialId) return;

    setOpeningMaterialId(String(id));
    try {
      const resolved = await resolveMaterialDocViewerUrl(id);
      if (resolved.error || !resolved.url) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          console.warn('[BulletinPostAttachmentList]', resolved.error || 'Unable to open attachment.');
        }
        return;
      }
      setViewer({
        visible: true,
        url: resolved.url,
        title: resolved.title || material?.title || 'Attachment',
        viewerKind: resolved.viewerKind || inferMaterialViewerKind(material),
      });
    } finally {
      setOpeningMaterialId(null);
    }
  }, [openingMaterialId]);

  if (!materials?.length) return null;

  return (
    <>
      <View style={[styles.chipList, style]}>
        {materials.map(({ material, materialId }) => {
          const isOpening = openingMaterialId === String(material?.id || materialId);
          const label = formatAttachmentLabel(material);
          return (
            <TouchableOpacity
              key={materialId}
              style={[styles.chip, isOpening && styles.chipOpening]}
              onPress={(event) => openMaterial(material, materialId, event)}
              disabled={isOpening}
              accessibilityRole="button"
              accessibilityLabel={`Open ${label}`}
              activeOpacity={0.85}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={styles.chipIconWrap}>
                {isOpening ? (
                  <ActivityIndicator size="small" color="#64748B" />
                ) : (
                  <FileText size={14} color="#64748B" strokeWidth={2.25} />
                )}
              </View>
              <Text style={styles.chipText} numberOfLines={2}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <MaterialDocViewerModal
        visible={viewer.visible}
        onClose={closeViewer}
        url={viewer.url}
        title={viewer.title}
        viewerKind={viewer.viewerKind}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chipList: {
    marginTop: 14,
    gap: 8,
    alignSelf: 'stretch',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.12s ease, border-color 0.12s ease',
      ':hover': {
        backgroundColor: '#E2E8F0',
        borderColor: '#CBD5E1',
      },
    }),
  },
  chipOpening: {
    opacity: 0.85,
  },
  chipIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
