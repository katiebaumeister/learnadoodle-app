import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function LeftMenu({
  menuItems = [],
  activeItem,
  activeSubItem,
  isExpanded,
  onSelectItem,
  onSelectSubItem,
}) {
  return (
    <View style={styles.container}>
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeItem === item.key;
        const showLabels = isExpanded;

        return (
          <View key={item.key}>
            <TouchableOpacity
              style={[
                styles.item,
                isActive && styles.itemActive,
                showLabels ? styles.expanded : styles.collapsed,
              ]}
              onPress={() => onSelectItem?.(item.key)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
            >
              <View style={styles.iconWrapper}>
                <Icon size={22} color={isActive ? 'var(--ld-accent-core)' : 'rgba(15,23,42,0.6)'} />
              </View>
              {showLabels ? (
                <Text style={[styles.label, isActive && styles.labelActive]}>{item.label}</Text>
              ) : null}
            </TouchableOpacity>
            {isActive && item.children?.length ? (
              <View style={[styles.secondary, !showLabels && styles.secondaryCollapsed]}>
                {item.children.map((child) => {
                  const childActive = activeSubItem === child.key;
                  return (
                    <TouchableOpacity
                      key={child.key}
                      style={[styles.childItem, childActive && styles.childActive]}
                      onPress={() => onSelectSubItem?.(item.key, child.key)}
                      accessibilityLabel={child.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected: childActive }}
                    >
                      <Text style={styles.childBullet}>•</Text>
                      <Text style={[styles.childLabel, childActive && styles.childLabelActive]}>
                        {child.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginLeft: 8,
    marginRight: 4,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 4,
    transitionProperty: 'background-color',
    transitionDuration: '180ms',
  },
  itemActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  collapsed: {
    justifyContent: 'center',
  },
  expanded: {
    justifyContent: 'flex-start',
  },
  iconWrapper: {
    width: 28,
    alignItems: 'center',
    marginRight: 12,
  },
  label: {
    fontSize: 15,
    color: 'rgba(15, 23, 42, 0.72)',
    fontWeight: '600',
  },
  labelActive: {
    color: 'var(--ld-accent-core)',
  },
  secondary: {
    marginLeft: 16,
    marginTop: 6,
  },
  secondaryCollapsed: {
    display: 'none',
  },
  childItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 4,
  },
  childActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
  },
  childBullet: {
    color: 'rgba(99, 102, 241, 0.8)',
    fontSize: 12,
    marginRight: 8,
  },
  childLabel: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.68)',
  },
  childLabelActive: {
    color: 'var(--ld-accent-core)',
    fontWeight: '600',
  },
});

