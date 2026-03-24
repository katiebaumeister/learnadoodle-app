/**
 * In-app preview modal: PDF, images, Office (via Microsoft Office Online), video/audio, and generic HTTPS links.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  Image,
  ScrollView,
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

/** @typedef {'pdf'|'image'|'office'|'video'|'audio'|'iframe'|'download'|'unsupported'} ViewerKind */

const OFFICE_ONLINE_EMBED = (fileUrl) =>
  `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;

function extensionFromString(s) {
  if (!s || typeof s !== 'string') return '';
  const base = s.split('?')[0].split('#')[0].toLowerCase();
  const m = base.match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

/**
 * Decide how to render a file in the in-app viewer.
 * @param {object} material — row from `materials` (mime, filename, title, storage_path, provider_url, …)
 * @returns {ViewerKind}
 */
export function inferMaterialViewerKind(material) {
  if (!material) return 'unsupported';
  const mime = (material.mime || '').toLowerCase();
  const ext =
    extensionFromString(material.filename) ||
    extensionFromString(material.title) ||
    extensionFromString(material.storage_path) ||
    extensionFromString(material.provider_url || '');

  if (mime.includes('pdf') || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'].includes(ext)) {
    return 'image';
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';

  const officeExt = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'ods', 'odp', 'rtf'];
  const officeMime =
    /word|excel|powerpoint|spreadsheet|presentation|officedocument|msword|ms-powerpoint|ms-excel/.test(mime);
  if (officeMime || officeExt.includes(ext)) return 'office';

  if (material.storage_path) {
    return 'download';
  }

  if (material.provider_url && isValidDocViewerUrl(material.provider_url)) {
    return 'iframe';
  }

  return 'unsupported';
}

function WebMediaMount({ viewerKind, url, title }) {
  const hostRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !url || !isValidDocViewerUrl(url)) return;

    const getDomNode = () => {
      const n = hostRef.current;
      if (!n) return null;
      if (n.nodeType === 1) return n;
      return n._nativeNode ?? n.getNativeNode?.() ?? n;
    };

    const mount = () => {
      const native = getDomNode();
      if (!native) return;
      if (native.innerHTML !== undefined) {
        native.innerHTML = '';
      } else if (typeof native.appendChild === 'function') {
        while (native.firstChild) {
          native.removeChild(native.firstChild);
        }
      } else {
        return;
      }

      if (viewerKind === 'image') {
        const img = document.createElement('img');
        img.src = url;
        img.alt = title || 'Preview';
        Object.assign(img.style, {
          maxWidth: '100%',
          maxHeight: 'calc(85vh - 120px)',
          objectFit: 'contain',
          display: 'block',
          margin: '0 auto',
        });
        if (typeof native.appendChild === 'function') native.appendChild(img);
        return;
      }

      if (viewerKind === 'video') {
        const v = document.createElement('video');
        v.src = url;
        v.controls = true;
        v.setAttribute('playsinline', '');
        Object.assign(v.style, { width: '100%', maxHeight: 'calc(85vh - 120px)', backgroundColor: '#000' });
        if (typeof native.appendChild === 'function') native.appendChild(v);
        return;
      }

      if (viewerKind === 'audio') {
        const a = document.createElement('audio');
        a.src = url;
        a.controls = true;
        Object.assign(a.style, { width: '100%', maxWidth: 560, marginTop: 32 });
        if (typeof native.appendChild === 'function') native.appendChild(a);
        return;
      }

      let iframeSrc = null;
      if (viewerKind === 'office') {
        iframeSrc = OFFICE_ONLINE_EMBED(url);
      } else if (viewerKind === 'pdf' || viewerKind === 'iframe') {
        iframeSrc = url;
      }

      if (iframeSrc) {
        const iframe = document.createElement('iframe');
        iframe.src = iframeSrc;
        iframe.title = title || 'Document';
        Object.assign(iframe.style, {
          width: '100%',
          height: '100%',
          minHeight: 'min(480px, 70vh)',
          border: 'none',
          flex: '1',
        });
        iframe.setAttribute('allow', 'fullscreen');
        if (typeof native.appendChild === 'function') native.appendChild(iframe);
      }
    };

    const t = requestAnimationFrame(() => mount());
    return () => {
      cancelAnimationFrame(t);
      const native = getDomNode();
      if (native && typeof native.removeChild === 'function') {
        while (native.firstChild) {
          try {
            native.removeChild(native.firstChild);
          } catch {
            break;
          }
        }
      }
    };
  }, [viewerKind, url, title]);

  return <View ref={hostRef} style={styles.webMediaHost} />;
}

/**
 * @returns {{ url: string|null, title: string, error: string|null, viewerKind: ViewerKind }}
 */
export async function resolveMaterialDocViewerUrl(materialId) {
  if (!materialId) {
    return { url: null, title: '', error: 'Missing material.', viewerKind: 'unsupported' };
  }
  try {
    const material = await getMaterial(materialId);
    if (!material) {
      return { url: null, title: '', error: 'Material not found.', viewerKind: 'unsupported' };
    }
    const title = material.title || material.provider_name || 'Material';
    const viewerKind = inferMaterialViewerKind(material);

    if (material.storage_path) {
      const { data: signedUrlData, error: signedError } = await supabase.storage
        .from('evidence')
        .createSignedUrl(material.storage_path, 3600);

      if (signedError || !signedUrlData?.signedUrl) {
        return {
          url: null,
          title,
          error: 'Unable to access the file. Please try again later.',
          viewerKind: 'unsupported',
        };
      }
      return { url: signedUrlData.signedUrl, title, error: null, viewerKind };
    }

    if (material.provider_url && isValidDocViewerUrl(material.provider_url)) {
      return { url: material.provider_url, title, error: null, viewerKind };
    }

    return {
      url: null,
      title,
      error: 'This material does not have a viewable document.',
      viewerKind: 'unsupported',
    };
  } catch (err) {
    console.error('[resolveMaterialDocViewerUrl]', err);
    return {
      url: null,
      title: '',
      error: err?.message || 'Failed to load material.',
      viewerKind: 'unsupported',
    };
  }
}

export default function MaterialDocViewerModal({
  visible,
  onClose,
  url,
  title,
  viewerKind = 'pdf',
}) {
  if (!visible || !url) return null;

  const openExternal = () => {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  };

  const webInteractiveKinds = ['pdf', 'office', 'image', 'video', 'audio', 'iframe'];
  const useWebHost = Platform.OS === 'web' && webInteractiveKinds.includes(viewerKind);
  const useDownloadPanel = viewerKind === 'download' || viewerKind === 'unsupported';

  const subtitle =
    viewerKind === 'office'
      ? 'Preview is provided by Microsoft Office Online. If it does not load, use “Open in new tab”.'
      : null;

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
                  onPress={openExternal}
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
          {subtitle ? (
            <Text style={styles.viewerHint} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
          <View style={styles.pdfViewerContainer}>
            {useWebHost ? (
              <WebMediaMount viewerKind={viewerKind} url={url} title={title} />
            ) : useDownloadPanel ? (
              <View style={styles.pdfFallback}>
                <Text style={styles.pdfFallbackText}>
                  {viewerKind === 'download'
                    ? 'This file type can’t be previewed in the app. You can open or download it in a new tab.'
                    : 'Preview isn’t available for this item.'}
                </Text>
                {Platform.OS === 'web' ? (
                  <TouchableOpacity style={styles.primaryOpenButton} onPress={openExternal}>
                    <Text style={styles.primaryOpenButtonText}>Open or download</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : viewerKind === 'image' ? (
              <ScrollView contentContainerStyle={styles.imageScroll}>
                <Image source={{ uri: url }} style={styles.nativeImage} resizeMode="contain" />
              </ScrollView>
            ) : (
              <View style={styles.pdfFallback}>
                <Text style={styles.pdfFallbackText}>Document preview is available on the web app.</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webMediaHost: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    alignSelf: 'stretch',
  },
  viewerHint: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
    paddingHorizontal: 20,
    paddingBottom: 8,
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryOpenButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.accent || '#d4a256',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  primaryOpenButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  imageScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  nativeImage: {
    width: '100%',
    minHeight: 280,
    maxHeight: 600,
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
        display: 'flex',
        flexDirection: 'column',
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
    flex: 1,
    height: Platform.OS === 'web' ? 'calc(85vh - 80px)' : 480,
    minHeight: 400,
    backgroundColor: '#f9fafb',
    ...Platform.select({
      web: {
        maxHeight: 'calc(85vh - 80px)',
        display: 'flex',
        flexDirection: 'column',
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
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 20,
  },
});
