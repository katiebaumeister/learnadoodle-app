import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Alert, Modal, Text } from 'react-native';
import { Plug, Chrome, Apple, Check, X } from 'lucide-react';

const PROVIDERS = [
  { id: 'google', label: 'Google', Icon: Chrome, color: '#2563eb' },
  { id: 'apple', label: 'Apple', Icon: Apple, color: '#111827' },
];

export default function ProviderConnectButton({
  context = 'integration',
  direction = 'down',
  triggerStyle,
  triggerActiveStyle,
  menuStyle,
  accessibilityLabel = 'Connect provider',
  iconColor = '#2563eb',
  activeIconColor = '#2563eb',
  triggerIconSize = 16,
  onProviderSelect = null,
  connectedProviderIds = [],
  onAlreadyConnected = null,
}) {
  const [open, setOpen] = useState(false);
  const [connectedModalProviderLabel, setConnectedModalProviderLabel] = useState(null);
  const containerRef = useRef(null);
  const normalizedConnectedProviderIds = Array.isArray(connectedProviderIds)
    ? connectedProviderIds.map((value) => String(value || '').trim().toLowerCase())
    : [];

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const handleOutsideClick = (event) => {
      const node = containerRef.current;
      if (!node || typeof node.contains !== 'function') {
        setOpen(false);
        return;
      }
      if (!node.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const showPlaceholderMessage = (providerLabel) => {
    const message = `${providerLabel} ${context} coming soon.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message);
      return;
    }
    Alert.alert('Coming soon', message);
  };

  const handleSelect = (provider) => {
    setOpen(false);
    const providerKey = String(provider.id || '').trim().toLowerCase();
    const isAlreadyConnected = normalizedConnectedProviderIds.includes(providerKey);
    if (isAlreadyConnected) {
      if (typeof onAlreadyConnected === 'function') {
        onAlreadyConnected(provider.id, provider.label);
      }
      setConnectedModalProviderLabel(provider.label);
      return;
    }
    if (typeof onProviderSelect === 'function') {
      onProviderSelect(provider.id, provider.label);
      return;
    }
    showPlaceholderMessage(provider.label);
  };

  return (
    <View ref={containerRef} style={styles.anchor}>
      <TouchableOpacity
        style={[styles.trigger, triggerStyle, open && triggerActiveStyle]}
        onPress={() => setOpen((prev) => !prev)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Plug size={triggerIconSize} color={open ? activeIconColor : iconColor} />
      </TouchableOpacity>
      {open && (
        <View
          style={[
            styles.menu,
            direction === 'left' ? styles.menuLeft : styles.menuDown,
            menuStyle,
          ]}
        >
          {PROVIDERS.map((provider) => {
            const Icon = provider.Icon;
            const providerKey = String(provider.id || '').trim().toLowerCase();
            const isConnected = normalizedConnectedProviderIds.includes(providerKey);
            return (
              <TouchableOpacity
                key={provider.id}
                style={[styles.providerButton, isConnected && styles.providerButtonConnected]}
                onPress={() => handleSelect(provider)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Connect ${provider.label}`}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Icon size={16} color={provider.color} />
                {isConnected && (
                  <View style={styles.connectedCheckBadge}>
                    <Check size={10} color="#ffffff" strokeWidth={2.6} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <Modal
        visible={!!connectedModalProviderLabel}
        transparent
        animationType="fade"
        onRequestClose={() => setConnectedModalProviderLabel(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setConnectedModalProviderLabel(null)}
        >
          <TouchableOpacity
            style={styles.modalSheet}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Already connected</Text>
              <TouchableOpacity
                onPress={() => setConnectedModalProviderLabel(null)}
                style={styles.modalCloseButton}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalText}>
              {connectedModalProviderLabel} is already connected for this family.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalPrimaryButton}
                onPress={() => setConnectedModalProviderLabel(null)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.modalPrimaryButtonText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
    overflow: 'visible',
  },
  trigger: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 6px 16px rgba(15, 23, 42, 0.14)',
    }),
  },
  menuDown: {
    top: '100%',
    right: 0,
    marginTop: 6,
  },
  menuLeft: {
    right: '100%',
    top: 0,
    marginRight: 8,
  },
  providerButton: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerButtonConnected: {
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  connectedCheckBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 40px rgba(15, 23, 42, 0.22)',
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4b5563',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalPrimaryButton: {
    backgroundColor: '#85C4F2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 10px rgba(133,196,242,0.35)',
    }),
  },
  modalPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
