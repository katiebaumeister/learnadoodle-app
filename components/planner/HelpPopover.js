import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { X, ChevronDown, ExternalLink } from 'lucide-react';

const PLANNER_FAQ = [
  { id: 'pl-1', q: 'How does the planner work?', a: 'You can view lessons and activities in daily, weekly, or monthly calendar formats. Add tasks, field trips, enrichment activities, and checkpoints directly into the calendar.' },
  { id: 'pl-2', q: 'What if plans change?', a: 'You can reschedule, skip, or drag events, and Learnadoodle\'s adaptive structure helps keep pacing and records aligned with real life.' },
  { id: 'pl-3', q: 'Does Learnadoodle integrate with my device calendars?', a: 'Calendar integration is part of the planning workflow; connections to external calendars help keep family schedules synchronized.' },
];

export default function HelpPopover({ visible, onClose, position, helpForumHref = '/help/faqs' }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!visible) return null;

  return (
    <View
      style={{
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: 320,
        maxHeight: 400,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(15,23,42,0.08)',
        zIndex: 1001,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}
    >
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(15,23,42,0.06)',
      }}>
        <Text style={{
          fontSize: 18,
          fontWeight: '600',
          color: 'rgba(15,23,42,0.9)',
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          Help
        </Text>
        <TouchableOpacity
          onPress={onClose}
          style={{ padding: 4 }}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <X size={20} color="rgba(15,23,42,0.6)" />
        </TouchableOpacity>
      </View>

      {/* FAQ list */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        {PLANNER_FAQ.map((item, index) => {
            const isExpanded = expandedId === item.id;
            return (
              <View
                key={item.id}
                style={{
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: 'rgba(15,23,42,0.06)',
                }}
              >
                <TouchableOpacity
                  onPress={() => setExpandedId(isExpanded ? null : item.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                  }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={{
                    flex: 1,
                    fontSize: 15,
                    color: 'rgba(15,23,42,0.9)',
                    fontWeight: '500',
                    paddingRight: 12,
                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }}>
                    {item.q}
                  </Text>
                  <View style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}>
                    <ChevronDown size={18} color="rgba(15,23,42,0.5)" />
                  </View>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={{ paddingBottom: 12, paddingRight: 24 }}>
                    <Text style={{
                      fontSize: 14,
                      color: 'rgba(15,23,42,0.65)',
                      lineHeight: 20,
                      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }}>
                      {item.a}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
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
            color: '#3b82f6',
            fontWeight: '500',
            fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}>
            Visit help forum
          </Text>
          <ExternalLink size={16} color="#3b82f6" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
