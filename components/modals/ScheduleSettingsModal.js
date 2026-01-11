import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import { X } from 'lucide-react';
import AvailabilityBuilder from '../AvailabilityBuilder';

/**
 * ScheduleSettingsModal
 * Full editor modal for managing schedule rules
 */
export default function ScheduleSettingsModal({
  visible,
  onClose,
  familyId,
  children = [],
}) {

  if (!visible) return null;

  return (
    <>
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay} onTouchEnd={onClose}>
        <View style={styles.modal} onTouchEnd={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Schedule Settings</Text>
              <Text style={styles.headerSubtitle}>
                Edit your family's weekly schedule and availability.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Full Editor Content */}
          <View style={styles.content}>
            <AvailabilityBuilder
              familyId={familyId}
              children={children}
              hideHeader={true}
            />
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      backdropFilter: 'blur(2px)',
    }),
  },
  modal: {
    width: Platform.OS === 'web' ? '95%' : '95%',
    maxWidth: Platform.OS === 'web' ? 1200 : '95%',
    height: Platform.OS === 'web' ? '90%' : '90%',
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 40px rgba(0, 0, 0, 0.12)',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229, 231, 235, 0.9)',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(10px)',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
    }),
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
    marginLeft: 16,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#f3f4f6',
        borderRadius: 6,
      },
    }),
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
});
