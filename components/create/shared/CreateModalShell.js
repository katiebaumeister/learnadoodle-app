import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import AppModalShell from '../../ui/AppModalShell';
import { ModalFooter } from '../../ui/ModalFooter';
import { createModalStyles as styles, CREATE_MODAL_MAX_WIDTH } from './createModalStyles';

export default function CreateModalShell({
  title,
  onClose,
  children,
  onSave,
  saving = false,
  saveLabel = 'Save changes',
  saveDisabled = false,
  validationBanner = null,
  maxWidth = CREATE_MODAL_MAX_WIDTH,
  footer = null,
}) {
  return (
    <View style={shellStyles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[shellStyles.modalWrap, { maxWidth }]}>
        <AppModalShell
          title={title}
          onClose={onClose}
          shellStyle={styles.compactShell}
          titleRowStyle={styles.compactTitleRow}
          contentContainerStyle={styles.contentContainer}
          bodyStyle={styles.shellBody}
          footer={footer ?? (
            <ModalFooter
              mode="edit"
              primaryLabel={saving ? 'Saving…' : saveLabel}
              onCancel={onClose}
              onPrimary={onSave}
              accent="#9ECFFB"
              disabled={saving}
              visuallyDisabled={saveDisabled}
              loading={saving}
            />
          )}
        >
          {validationBanner ? (
            <View style={styles.validationBannerContainer}>
              <Text style={styles.validationBannerText}>{validationBanner}</Text>
            </View>
          ) : null}
          {children}
        </AppModalShell>
      </TouchableOpacity>
    </View>
  );
}

const shellStyles = StyleSheet.create({
  overlay: {
    ...(Platform.OS === 'web'
      ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10050 }
      : { flex: 1 }),
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrap: {
    width: '100%',
    maxWidth: CREATE_MODAL_MAX_WIDTH,
  },
});
