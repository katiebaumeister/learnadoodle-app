import React from 'react';
import { View, TouchableOpacity, StyleSheet, Modal as RNModal, Platform } from 'react-native';
import { MODAL_SIZE, MODAL_SIZE_STYLES, modalSystemStyles } from './modalSystem';

/**
 * Centered modal overlay — use for all creation/editing modals.
 * Panels (Create, Messages) slide from the side and do NOT use this.
 */
export default function AppModalOverlay({
  visible,
  onClose,
  children,
  size = MODAL_SIZE.standard,
  blockBackdropClose = false,
  overlayRef = null,
}) {
  const isFullscreen = size === MODAL_SIZE.fullscreen;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        ref={overlayRef}
        style={[
          modalSystemStyles.overlay,
          isFullscreen && modalSystemStyles.overlayFullscreen,
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={blockBackdropClose ? undefined : onClose}
        />
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e?.stopPropagation?.()}
          style={[
            modalSystemStyles.wrap,
            MODAL_SIZE_STYLES[size],
            isFullscreen && modalSystemStyles.wrapFullscreen,
          ]}
        >
          {children}
        </TouchableOpacity>
      </View>
    </RNModal>
  );
}
