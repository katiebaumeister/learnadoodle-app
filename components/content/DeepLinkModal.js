/**
 * Deep Link Modal Component
 * Allows users to share course deep links with QR codes and copy functionality
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { X, Copy, Share2, Mail, MessageSquare, QrCode, ExternalLink } from 'lucide-react';
import { colors } from '../../theme/colors';
import { useToast } from '../Toast';

export default function DeepLinkModal({
  visible,
  courseId,
  courseTitle,
  childId,
  childName,
  lessonId = null,
  onClose,
}) {
  const [deepLink, setDeepLink] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (visible && courseId && childId) {
      generateDeepLink();
    }
  }, [visible, courseId, childId, lessonId]);

  const generateDeepLink = async () => {
    try {
      // Try to generate via API first
      const { generateDeepLink: genDeepLink } = await import('../../lib/apiClient');
      const result = await genDeepLink(courseId, childId, lessonId);
      
      if (result.data && !result.error) {
        setDeepLink(result.data.deep_link);
        setQrCodeUrl(result.data.qr_code_url);
        return;
      }
    } catch (err) {
      console.error('Error generating deep link via API:', err);
    }
    
    // Fallback: Generate locally
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : 'https://app.learnadoodle.com';
    
    let link = `${baseUrl}/continue/${courseId}?child=${childId}`;
    if (lessonId) {
      link += `&lesson=${lessonId}`;
    }
    
    setDeepLink(link);
    
    // Generate QR code URL
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
    setQrCodeUrl(qrUrl);
  };

  const copyToClipboard = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(deepLink);
        toast.push('Link copied to clipboard!', 'success');
      } catch (err) {
        console.error('Failed to copy:', err);
        toast.push('Failed to copy link', 'error');
      }
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = deepLink;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.push('Link copied to clipboard!', 'success');
      } catch (err) {
        toast.push('Failed to copy link', 'error');
      }
      document.body.removeChild(textArea);
    }
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent(`Continue Learning: ${courseTitle || 'Course'}`);
    const body = encodeURIComponent(
      `Hi,\n\n${childName} is learning "${courseTitle || 'this course'}". ` +
      `Continue from where they left off:\n\n${deepLink}\n\n` +
      `Or scan the QR code in the app to resume.`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareViaText = () => {
    const text = encodeURIComponent(
      `${childName} is learning "${courseTitle || 'this course'}". ` +
      `Continue here: ${deepLink}`
    );
    window.open(`sms:?body=${text}`);
  };

  const openInApp = () => {
    if (typeof window !== 'undefined') {
      window.location.href = deepLink;
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Share Course Link</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Course Info */}
            {courseTitle && (
              <View style={styles.courseInfo}>
                <Text style={styles.courseTitle}>{courseTitle}</Text>
                {childName && (
                  <Text style={styles.childName}>for {childName}</Text>
                )}
              </View>
            )}

            {/* QR Code */}
            {qrCodeUrl && (
              <View style={styles.qrSection}>
                <QrCode size={24} color={colors.accent} />
                <Text style={styles.qrLabel}>Scan to continue</Text>
                <View style={styles.qrContainer}>
                  <img 
                    src={qrCodeUrl} 
                    alt="QR Code" 
                    style={styles.qrImage}
                  />
                </View>
              </View>
            )}

            {/* Deep Link URL */}
            <View style={styles.linkSection}>
              <Text style={styles.linkLabel}>Share this link:</Text>
              <View style={styles.linkContainer}>
                <TextInput
                  style={styles.linkInput}
                  value={deepLink}
                  editable={false}
                  selectTextOnFocus={true}
                />
                <TouchableOpacity
                  onPress={copyToClipboard}
                  style={styles.copyButton}
                >
                  <Copy size={16} color={colors.accent} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Share Buttons */}
            <View style={styles.shareSection}>
              <Text style={styles.shareLabel}>Share via:</Text>
              <View style={styles.shareButtons}>
                <TouchableOpacity
                  onPress={copyToClipboard}
                  style={styles.shareButton}
                >
                  <Copy size={18} color={colors.accent} />
                  <Text style={styles.shareButtonText}>Copy</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={shareViaEmail}
                  style={styles.shareButton}
                >
                  <Mail size={18} color={colors.accent} />
                  <Text style={styles.shareButtonText}>Email</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={shareViaText}
                  style={styles.shareButton}
                >
                  <MessageSquare size={18} color={colors.accent} />
                  <Text style={styles.shareButtonText}>Text</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Open in App Button */}
            <TouchableOpacity
              onPress={openInApp}
              style={styles.openButton}
            >
              <ExternalLink size={18} color="#ffffff" />
              <Text style={styles.openButtonText}>Open in App</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  courseInfo: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  courseTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  childName: {
    fontSize: 14,
    color: colors.muted,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginTop: 8,
    marginBottom: 16,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  linkSection: {
    marginBottom: 24,
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.bg,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
  },
  copyButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.accent + '20',
  },
  shareSection: {
    marginBottom: 24,
  },
  shareLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  shareButtons: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  shareButton: {
    flex: 1,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  openButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

