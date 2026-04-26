import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { X, Check, ExternalLink } from 'lucide-react';
import StableImage from '../ui/StableImage';

const FG = 'rgba(15,23,42,0.9)';
const MUTED = 'rgba(15,23,42,0.6)';
const BORDER = 'rgba(15,23,42,0.08)';
const ACCENT = '#3b82f6';

const PROVIDERS = [
  {
    id: 'google',
    name: 'Google Calendar',
    image: require('../../assets/google.png'),
  },
  {
    id: 'apple',
    name: 'Apple Calendar',
    image: require('../../assets/apple.png'),
    iconShellStyle: { width: 38, height: 38 },
    imageStyle: { width: 38, height: 38, transform: [{ translateY: 1 }] },
    imageResizeMode: 'contain',
  },
];

export default function PlannerSettingsPopover({
  visible,
  onClose,
  position,
  onOpenFullSettings,
  onConnectProvider,
  connectedProviderIds = [],
}) {
  if (!visible) return null;

  const connectedSet = new Set((connectedProviderIds || []).map((id) => String(id).toLowerCase()));

  return (
    <View
      style={{
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: 340,
        maxHeight: 420,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: BORDER,
        zIndex: 1001,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(15,23,42,0.06)',
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: FG,
            fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          Connect accounts
        </Text>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
          <X size={20} color={MUTED} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        {PROVIDERS.map((provider) => {
          const connected = connectedSet.has(provider.id);
          const actionLabel = connected ? 'Connected' : 'Connect';
          return (
            <View
              key={provider.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 12,
                paddingHorizontal: 6,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(15,23,42,0.06)',
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <StableImage
                  source={provider.image}
                  resizeMode={provider.imageResizeMode || 'contain'}
                  shellStyle={{
                    width: 24,
                    height: 24,
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 8,
                    ...(provider.iconShellStyle || {}),
                  }}
                  imageStyle={{
                    width: '100%',
                    height: '100%',
                    ...(provider.imageStyle || {}),
                  }}
                  placeholderStyle={{
                    borderRadius: 8,
                    backgroundColor: 'rgba(15, 23, 42, 0.08)',
                  }}
                  fadeDuration={0}
                />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: FG }}>{provider.name}</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => onConnectProvider?.(provider.id, provider.name, { alreadyConnected: connected })}
                style={{
                  paddingHorizontal: 12,
                  height: 30,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: connected ? 'rgba(16,185,129,0.45)' : 'rgba(15,23,42,0.12)',
                  backgroundColor: connected ? 'rgba(16,185,129,0.08)' : '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 4,
                  ...(Platform.OS === 'web' && { cursor: 'pointer' }),
                }}
                activeOpacity={0.8}
              >
                {connected ? <Check size={12} color="#059669" /> : null}
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: connected ? '#047857' : FG,
                  }}
                >
                  {actionLabel}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={() => {
            onClose?.();
            onOpenFullSettings?.();
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, ...(Platform.OS === 'web' && { cursor: 'pointer' }) }}
        >
          <Text
            style={{
              fontSize: 15,
              color: ACCENT,
              fontWeight: '500',
              fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            Open full integrations settings
          </Text>
          <ExternalLink size={16} color={ACCENT} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

