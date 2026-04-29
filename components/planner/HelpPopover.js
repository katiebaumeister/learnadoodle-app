import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { ExternalLink } from 'lucide-react';

export default function HelpPopover({
  visible,
  onClose,
  position,
  helpForumHref = '/help/faqs',
  descriptionText = `Welcome to your family's shared schedule. Add events quickly with the "+ NEW" button. Right click event chips for event actions. As your day goes on, check events to mark them done. Bulk mark attendance, build out structured class plans, and view per-subject analytics by switching to the Subjects tab in the left sidebar.`,
  onMouseEnter,
  onMouseLeave,
}) {
  if (!visible) return null;

  return (
    <View
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: 280,
        maxHeight: 480,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(15,23,42,0.08)',
        zIndex: 10001,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
        <Text
          style={{
            fontSize: 14,
            color: 'rgba(15,23,42,0.75)',
            lineHeight: 21,
            fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          {descriptionText}
        </Text>
      </View>

      {/* Visit help forum link */}
      <View style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(15,23,42,0.06)',
      }}>
        <TouchableOpacity
          onPress={() => {
            onClose();
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.location.href = helpForumHref;
            }
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={{
            fontSize: 15,
            color: '#6BB3E8',
            fontWeight: '500',
            fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}>
            Visit help forum
          </Text>
          <ExternalLink size={16} color="#6BB3E8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
