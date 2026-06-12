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
  hideChevron = false,
  variant = 'card',
}) {
  const isSimple = variant === 'simple';
  return (
    <View style={[
      styles.wrap,
      isSimple && styles.wrapSimple,
      allowOverflow && styles.wrapOverflowVisible,
    ]}>
      <TouchableOpacity
        style={[styles.header, isSimple && styles.headerSimple]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <View style={styles.left}>
          {!isSimple ? (
            <View style={styles.iconWrap}>
              {Icon ? <Icon size={17} color={accent} /> : null}
            </View>
          ) : Icon ? (
            <Icon size={16} color={accent} />
          ) : null}
          <View style={styles.titleWrap}>
            <Text style={[styles.title, isSimple && styles.titleSimple]}>{title}</Text>
            {!!subtitle && !expanded ? (
              <Text style={[styles.subtitle, isSimple && styles.subtitleSimple]}>{subtitle}</Text>
            ) : null}
          </View>
        </View>

        {!hideChevron ? (
          expanded ? (
            <ChevronUp size={18} color="#98A2B3" />
          ) : (
            <ChevronDown size={18} color="#98A2B3" />
          )
        ) : null}
      </TouchableOpacity>

      {expanded ? (
        <View style={[styles.body, isSimple && styles.bodySimple]}>{children}</View>
      ) : null}
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
  wrapSimple: {
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 20,
    marginBottom: 0,
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
  headerSimple: {
    minHeight: 48,
    paddingHorizontal: 0,
    paddingVertical: 12,
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
  titleSimple: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 14,
    color: '#7B869A',
    marginTop: 3,
  },
  subtitleSimple: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 2,
  },
  bodySimple: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 4,
  },
});

