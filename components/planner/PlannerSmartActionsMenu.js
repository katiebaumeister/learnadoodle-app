import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Dropdown from '../ui/Dropdown';
import { PLANNER_SMART_ACTION_SECTIONS, PLANNER_SMART_ACTION_TOOLS, PLANNER_SMART_ACTION_UTILITIES, dispatchPlannerSmartAction } from './plannerSmartActionsConfig';

const LEAGUE_SPARTAN =
  Platform.OS === 'web'
    ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
    : {};

export default function PlannerSmartActionsMenu({ visible, triggerRef, onClose, showExport = false }) {
  const handleSelect = (modeId) => {
    onClose?.();
    dispatchPlannerSmartAction(modeId);
  };

  const utilities = [
    ...PLANNER_SMART_ACTION_TOOLS,
    ...(showExport ? PLANNER_SMART_ACTION_UTILITIES : []),
  ];

  return (
    <Dropdown
      visible={visible}
      triggerRef={triggerRef}
      onClose={onClose}
      placement="bottom-end"
      width={320}
      maxHeight={520}
    >
      <View style={styles.menu}>
        {PLANNER_SMART_ACTION_SECTIONS.map((section, sectionIndex) => (
          <View
            key={section.id}
            style={[styles.section, sectionIndex > 0 && styles.sectionBorder]}
          >
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.modeList}>
              {section.modes.map((mode) => (
                <TouchableOpacity
                  key={mode.id}
                  style={styles.modeButton}
                  onPress={() => handleSelect(mode.id)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.modeButtonText}>{mode.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
        {utilities.length > 0 ? (
          <View style={[styles.section, styles.sectionBorder]}>
            <Text style={styles.sectionTitle}>Tools</Text>
            <View style={styles.modeList}>
              {utilities.map((mode) => (
                <TouchableOpacity
                  key={mode.id}
                  style={styles.modeButton}
                  onPress={() => handleSelect(mode.id)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.modeButtonText}>{mode.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Dropdown>
  );
}

const styles = StyleSheet.create({
  menu: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  section: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  sectionBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    ...LEAGUE_SPARTAN,
  },
  modeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  modeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 193, 225, 0.18)',
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    ...LEAGUE_SPARTAN,
  },
});
