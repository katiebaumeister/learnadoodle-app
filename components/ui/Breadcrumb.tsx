import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { ChevronRight } from 'lucide-react';

export type Crumb = {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  tag?: string;
  onPress?: () => void;
};

type Props = {
  items: Crumb[];
  style?: any;
  separatorColor?: string;
};

export function Breadcrumb({ items, style, separatorColor = 'rgba(203,213,225,1)' }: Props) {
  if (!items?.length) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {items.map((crumb, index) => {
        const last = index === items.length - 1;
        const content = (
          <View style={styles.crumbContent}>
            {crumb.icon ? <View style={styles.icon}>{crumb.icon}</View> : null}
            <Text style={[styles.label, last ? styles.labelActive : styles.labelDefault]}>
              {crumb.label}
            </Text>
            {crumb.tag ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{crumb.tag}</Text>
              </View>
            ) : null}
          </View>
        );

        const handlePress = () => {
          if (crumb.onPress) {
            crumb.onPress();
            return;
          }
          if (crumb.href && Platform.OS === 'web') {
            window.location.assign(crumb.href);
          }
        };

        return (
          <View key={`${crumb.label}-${index}`} style={styles.crumb}>
            {crumb.href && !last ? (
              <Pressable onPress={handlePress} style={styles.linkWrapper}>
                {content}
              </Pressable>
            ) : (
              content
            )}
            {!last ? (
              <ChevronRight
                size={14}
                color={separatorColor}
                style={{ marginHorizontal: 6, marginTop: 1 }}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumbContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    color: 'rgba(107,114,128,1)',
    marginRight: 6,
  },
  label: {
    fontSize: 13,
  },
  labelDefault: {
    color: 'var(--ld-muted)',
  },
  labelActive: {
    color: 'var(--ld-text)',
    fontWeight: '600',
  },
  tag: {
    marginLeft: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 11,
    color: 'rgba(107,114,128,1)',
    lineHeight: 12,
  },
  linkWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default Breadcrumb;

