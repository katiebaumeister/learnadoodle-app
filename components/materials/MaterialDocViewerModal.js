/**
 * Full-screen doc/PDF viewer (same UX as Materials Library). URL resolution shared with library list.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { X, ExternalLink } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { getMaterial } from '../../lib/services/materialsClient';

const isUUID = (str) => {
  if (!str || typeof str !== 'string') return false;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(str.trim());
};

export const isValidDocViewerUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  if (isUUID(url)) return false;
  return url.startsWith('http://') || url.startsWith('https://');
};

const PDFIframe = ({ src, title }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current || !src || typeof document === 'undefined') return;
    if (!isValidDocViewerUrl(src)) {
      console.warn('[MaterialDocViewerModal] Invalid URL:', src);
      return;
    }
    const domElement = containerRef.current;
    if (domElement.innerHTML !== undefined) {
      domElement.innerHTML = '';
    } else if (domElement.removeChild) {
      while (domElement.firstChild) {
        domElement.removeChild(domElement.firstChild);
      }
    }
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = title || 'Document';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.setAttribute('allow', 'fullscreen');
    iframe.onerror = (e) => {
      e.preventDefault?.();
      e.stopPropagation?.();
    };
    domElement.appendChild(iframe);
  }, [src, title]);

  return <View ref={containerRef} style={styles.pdfIframeHost} />;
};

/**
 * Load viewable URL for a material (PDF in storage, or provider link).
 * @returns {{ url: string|null, title: string, error: string|null }}
 */
export async function resolveMaterialDocViewerUrl(materialId) {
  if (!materialId) {
    return { url: null, title: '', error: 'Missing material.' };
  }
  try {
    const material = await getMaterial(materialId);
    if (!material) {
      return { url: null, title: '', error: 'Material not found.' };
    }
    const title = material.title || material.provider_name || 'Material';

    if (material.storage_path) {
      const isPdf =
        material.mime?.includes('pdf') ||
        material.filename?.toLowerCase().endsWith('.pdf') ||
        (material.title && material.title.toLowerCase().endsWith('.pdf'));

      if (!isPdf) {
        return {
          url: null,
          title,
          error: 'This file type cannot be viewed in the document viewer.',
        };
      }

      const { data: signedUrlData, error: signedError } = await supabase.storage
        .from('evidence')
        .createSignedUrl(material.storage_path, 3600);

      if (signedError || !signedUrlData?.signedUrl) {
        return {
          url: null,
          title,
          error: 'Unable to access the file. Please try again later.',
        };
      }
      return { url: signedUrlData.signedUrl, title, error: null };
    }

    if (material.provider_url && isValidDocViewerUrl(material.provider_url)) {
      return { url: material.provider_url, title, error: null };
    }

    return {
      url: null,
      title,
      error: 'This material does not have a viewable document.',
    };
  } catch (err) {
    console.error('[resolveMaterialDocViewerUrl]', err);
    return {
      url: null,
      title: '',
      error: err?.message || 'Failed to load material.',
    };
  }
}

export default function MaterialDocViewerModal({ visible, onClose, url, title }) {
  if (!visible || !url) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pdfModalOverlay}>
        <TouchableOpacity style={styles.pdfModalOverlayTouchable} activeOpacity={1} onPress={onClose} />
        <View style={styles.pdfModalContainer} onStartShouldSetResponder={() => true}>
          <View style={styles.pdfModalHeader}>
            <Text style={styles.pdfModalTitle} numberOfLines={1}>
              {title || 'Document'}
            </Text>
            <View style={styles.pdfModalActions}>
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={styles.pdfModalButton}
                  onPress={() => {
                    if (typeof window !== 'undefined') window.open(url, '_blank');
                  }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <ExternalLink size={18} color={colors.accent} />
                  <Text style={styles.pdfModalButtonText}>Open in new tab</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.pdfModalCloseButton}
                onPress={onClose}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.pdfViewerContainer}>
            {Platform.OS === 'web' ? (
              <PDFIframe src={url} title={title} />
            ) : (
              <View style={styles.pdfFallback}>
                <Text style={styles.pdfFallbackText}>Document viewing is available on web.</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pdfIframeHost: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  pdfModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
      },
    }),
  },
  pdfModalOverlayTouchable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pdfModalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: Platform.OS === 'web' ? '90%' : '100%',
    maxWidth: 1200,
    maxHeight: '85%',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  pdfModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#ffffff',
  },
  pdfModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pdfModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pdfModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  pdfModalButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pdfModalCloseButton: {
    padding: 4,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  pdfViewerContainer: {
    height: Platform.OS === 'web' ? 'calc(85vh - 80px)' : '100%',
    minHeight: 400,
    backgroundColor: '#f9fafb',
    ...Platform.select({
      web: {
        maxHeight: 'calc(85vh - 80px)',
      },
    }),
  },
  pdfFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pdfFallbackText: {
    fontSize: 14,
    color: colors.muted,
  },
});
