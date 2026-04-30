import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function ModalSectionCard({
  Icon,
  title,
  subtitle,
  expanded,
  onPress,
  children,
  accent = '#7C70F4',
  allowOverflow = false,
}) {
  return (
    <View style={[styles.wrap, allowOverflow && styles.wrapOverflowVisible]}>
      <TouchableOpacity style={styles.header} onPress={onPress} activeOpacity={0.85}>
        <View style={styles.left}>
          <View style={styles.iconWrap}>
            {Icon ? <Icon size={17} color={accent} /> : null}
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && !expanded && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>

        {expanded ? (
          <ChevronUp size={18} color="#98A2B3" />
        ) : (
          <ChevronDown size={18} color="#98A2B3" />
        )}
      </TouchableOpacity>

      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    backgroundColor: '#F8F9FC',
    borderWidth: 1,
    borderColor: '#EEF1F6',
    overflow: 'hidden',
    // Keep a small visual gap between stacked collapsible cards.
    marginBottom: 8,
  },
  wrapOverflowVisible: {
    overflow: 'visible',
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  titleWrap: {
    flexShrink: 1,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2B3345',
  },
  subtitle: {
    fontSize: 14,
    color: '#7B869A',
    marginTop: 3,
  },
  body: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 2,
  },
});

