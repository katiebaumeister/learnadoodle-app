import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Alert } from 'react-native';
import { UserPlus, Copy, Check, X } from 'lucide-react';
import { colors } from '../../theme/colors';
import { createChildInvite } from '../../lib/apiClient';
import { useToast } from '../Toast';

/**
 * InviteChildButton
 * Parent UI for inviting a child to log in
 */
export default function InviteChildButton({ childId, childName, onInviteCreated }) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleInvite = async () => {
    if (!childId) return;
    
    setLoading(true);
    try {
      const { data, error } = await createChildInvite(childId);
      
      if (error) throw error;
      
      setInviteData(data);
      setShowModal(true);
      
      if (onInviteCreated) {
        onInviteCreated(data);
      }
    } catch (error) {
      toast.push('Failed to create invite', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!inviteData?.invite_url) return;
    
    const fullUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}${inviteData.invite_url}`
      : inviteData.invite_url;
    
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fullUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.push('Invite link copied!', 'success');
      });
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={handleInvite}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <>
            <UserPlus size={16} color="#ffffff" />
            <Text style={styles.buttonText}>Invite {childName} to Log In</Text>
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowModal(false);
          setInviteData(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <UserPlus size={20} color={colors.accent} />
                <Text style={styles.modalTitle}>Invite Created!</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  setInviteData(null);
                }}
              >
                <X size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <Text style={styles.modalText}>
                Share this link with {childName} so they can create their account:
              </Text>

              <View style={styles.linkContainer}>
                <Text style={styles.linkText} numberOfLines={1}>
                  {typeof window !== 'undefined' 
                    ? `${window.location.origin}${inviteData?.invite_url || ''}`
                    : inviteData?.invite_url || ''}
                </Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopyLink}
                >
                  {copied ? (
                    <Check size={16} color={colors.accent} />
                  ) : (
                    <Copy size={16} color={colors.accent} />
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  • The invite expires in 30 days{'\n'}
                  • {childName} will be able to log in and see their own dashboard{'\n'}
                  • You can control what they see in Student Settings
                </Text>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setShowModal(false);
                  setInviteData(null);
                }}
              >
                <Text style={styles.closeButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalContent: {
    padding: 20,
  },
  modalText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 16,
    lineHeight: 20,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: 4,
  },
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  infoText: {
    fontSize: 13,
    color: '#0369a1',
    lineHeight: 20,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

