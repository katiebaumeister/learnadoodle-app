import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import { X, LogOut, Key, User } from 'lucide-react'

export default function AuthSettingsModal({ visible, onClose, user }) {
  const { signOut, resetPassword } = useAuth()
  const [resetEmail, setResetEmail] = useState('')
  const [showResetForm, setShowResetForm] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const handleSignOut = async () => {
    try {
      const { error } = await signOut()
      if (error) {
        Alert.alert('Error', 'Failed to sign out: ' + error.message)
      } else {
        onClose()
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred while signing out')
    }
  }

  const handleResetPassword = async () => {
    if (!resetEmail.trim()) {
      Alert.alert('Error', 'Please enter your email address')
      return
    }

    setIsResetting(true)
    try {
      const { error } = await resetPassword(resetEmail.trim())
      if (error) {
        Alert.alert('Error', 'Failed to send reset email: ' + error.message)
      } else {
        Alert.alert(
          'Success', 
          'Password reset email sent! Please check your inbox.',
          [{ text: 'OK', onPress: () => {
            setShowResetForm(false)
            setResetEmail('')
            onClose()
          }}]
        )
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred while sending reset email')
    } finally {
      setIsResetting(false)
    }
  }

  const handleClose = () => {
    setShowResetForm(false)
    setResetEmail('')
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Account Settings</Text>
            <TouchableOpacity style={styles.modalClose} onPress={handleClose}>
              <X size={20} color="#666666" />
            </TouchableOpacity>
          </View>

          {/* User Info */}
          <View style={styles.userInfo}>
            <View style={styles.userAvatar}>
              <User size={24} color="#1a1a1a" />
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.userEmail}>{user?.email || 'User'}</Text>
              <Text style={styles.userStatus}>Signed In</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {/* Sign Out Button */}
            <TouchableOpacity style={styles.actionButton} onPress={handleSignOut}>
              <LogOut size={20} color="#dc2626" />
              <Text style={styles.actionButtonText}>Sign Out</Text>
            </TouchableOpacity>

            {/* Reset Password Button */}
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => setShowResetForm(true)}
            >
              <Key size={20} color="#1a1a1a" />
              <Text style={styles.actionButtonText}>Reset Password</Text>
            </TouchableOpacity>
          </View>

          {/* Reset Password Form */}
          {showResetForm && (
            <View style={styles.resetForm}>
              <Text style={styles.resetFormTitle}>Reset Password</Text>
              <Text style={styles.resetFormSubtitle}>
                Enter your email address and we'll send you a link to reset your password.
              </Text>
              
              <TextInput
                style={styles.resetInput}
                placeholder="Enter your email"
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              
              <View style={styles.resetFormActions}>
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={() => setShowResetForm(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.resetButton} 
                  onPress={handleResetPassword}
                  disabled={isResetting}
                >
                  <Text style={styles.resetButtonText}>
                    {isResetting ? 'Sending...' : 'Send Reset Email'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 0,
    maxWidth: 480,
    width: '90%',
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 25px 80px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
    backgroundColor: '#fafbfc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    letterSpacing: '-0.02em',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  modalCloseHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
    transform: 'scale(1.05)',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  userDetails: {
    flex: 1,
  },
  userEmail: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  userStatus: {
    fontSize: 14,
    color: '#16a34a',
    fontWeight: '500',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  actions: {
    padding: 24,
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  actionButtonHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
    transform: 'translateY(-1px)',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginLeft: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  resetForm: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    backgroundColor: '#fafbfc',
  },
  resetFormTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  resetFormSubtitle: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  resetInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: '#ffffff',
    marginBottom: 20,
    transition: 'all 0.2s ease',
  },
  resetInputFocus: {
    borderColor: '#1a1a1a',
    boxShadow: '0 0 0 3px rgba(26, 26, 26, 0.1)',
  },
  resetFormActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  cancelButtonHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  resetButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  resetButtonHover: {
    backgroundColor: '#000000',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(26, 26, 26, 0.2)',
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
})
