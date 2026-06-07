import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';

export default function SecondaryNavShell({
  title,
  sections = [],
  activeSection,
  onSectionChange,
}) {
  return (
    <View style={styles.shell}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {sections.map((section) => {
          const active = activeSection === section.key;
          const disabled = section.future === true;
          return (
            <TouchableOpacity
              key={section.key}
              style={[
                styles.item,
                active && styles.itemActive,
                disabled && styles.itemFuture,
              ]}
              onPress={() => {
                if (disabled) return;
                onSectionChange?.(section.key);
              }}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              {...(Platform.OS === 'web' && !disabled ? { cursor: 'pointer' } : {})}
            >
              <Text
                style={[
                  styles.itemText,
                  active && styles.itemTextActive,
                  disabled && styles.itemTextFuture,
                ]}
              >
                {section.label}
                {disabled ? ' (future)' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: 220,
    flex: 1,
    alignSelf: 'stretch',
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#FFFFFF',
    paddingTop: 16,
    paddingBottom: 16,
    ...(Platform.OS === 'web' && {
      minHeight: '100%',
      height: '100%',
    }),
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(15, 23, 42, 0.45)',
    paddingHorizontal: 16,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    flex: 1,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.15s ease',
    }),
  },
  itemActive: {
    backgroundColor: '#FAFAFA',
  },
  itemFuture: {
    opacity: 0.55,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(15, 23, 42, 0.65)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemTextActive: {
    color: '#0F172A',
    fontWeight: '600',
  },
  itemTextFuture: {
    fontStyle: 'italic',
  },
});
