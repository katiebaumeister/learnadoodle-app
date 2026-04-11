import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { Plug, Chrome, Apple } from 'lucide-react';

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
  const containerRef = useRef(null);
  const normalizedConnectedProviderIds = Array.isArray(connectedProviderIds)
    ? connectedProviderIds.map((value) => String(value || '').trim().toLowerCase())
    : [];
  const hasAnyConnectedProvider = normalizedConnectedProviderIds.length > 0;

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
        return;
      }
      const message = `${provider.label} is already connected.`;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message);
      } else {
        Alert.alert('Connected', message);
      }
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
        style={[styles.trigger, triggerStyle, (open || hasAnyConnectedProvider) && triggerActiveStyle]}
        onPress={() => setOpen((prev) => !prev)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Plug size={triggerIconSize} color={(open || hasAnyConnectedProvider) ? activeIconColor : iconColor} />
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
              </TouchableOpacity>
            );
          })}
        </View>
      )}
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
});
