import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { COMMON_LABELS } from '../lib/toolTypes';
import { User, Package, FileText, BookOpen } from 'lucide-react';
import { safeImageUri } from '../lib/safeImageUri';

const LABEL_ICONS = {
  projects: Package,
  homework: FileText,
  lessons: BookOpen,
};

export default function ChipsBar({
  childrenList = [],
  activeChildIds = [],
  onToggleChild,
  activeLabels = [],
  onToggleLabel,
}) {
  const allChildrenSelected = activeChildIds.length === 0 || activeChildIds.length === childrenList.length;

  const handleToggleAll = () => {
    if (allChildrenSelected) {
      // If all selected, deselect all (set to empty array)
      // This means "All children" is active when activeChildIds is empty
      // So we don't need to do anything - it's already showing all
    } else {
      // If not all selected, select all by toggling each unselected child
      childrenList.forEach(child => {
        if (!activeChildIds.includes(child.id)) {
          onToggleChild?.(child.id);
        }
      });
    }
  };

  const getChildAvatarColor = (childId) => {
    // Generate a consistent pastel color based on child ID
    const colors = [
      '#eef2ff', // Indigo
      '#f3e8ff', // Purple
      '#ecfdf3', // Green
      '#fde2f4', // Pink
      '#e0f2fe', // Sky
      '#fff6ed', // Orange
    ];
    const index = childId ? parseInt(childId.slice(-1), 16) % colors.length : 0;
    return colors[index];
  };

  const getChildBorderColor = (childId) => {
    const colors = [
      '#6366f1', // Indigo
      '#a855f7', // Purple
      '#10b981', // Green
      '#ec4899', // Pink
      '#0ea5e9', // Sky
      '#f97316', // Orange
    ];
    const index = childId ? parseInt(childId.slice(-1), 16) % colors.length : 0;
    return colors[index];
  };

  // Apply chipTray class on web
  const containerClassName = Platform.OS === 'web' ? 'chipTray' : undefined;

  return (
    <View 
      style={styles.container}
      {...(Platform.OS === 'web' && containerClassName ? { className: containerClassName } : {})}
    >
      {/* Child Chips */}
      {childrenList.length > 0 && (
        <View style={styles.chipGroup}>
          {/* All Children Option */}
          <TouchableOpacity
            style={[styles.chip, styles.allChip, allChildrenSelected && styles.chipActive]}
            onPress={handleToggleAll}
            {...(Platform.OS === 'web' ? { 
              'data-active': allChildrenSelected ? 'true' : 'false',
              className: 'chip'
            } : {})}
          >
            <View style={[styles.avatar, styles.allAvatar, allChildrenSelected && { backgroundColor: '#e6eaff', borderColor: '#6d8bff' }]}>
              <User size={12} color={Platform.OS === 'web' && allChildrenSelected ? 'white' : (allChildrenSelected ? '#6d8bff' : '#6b7280')} />
            </View>
            <Text style={[styles.chipText, allChildrenSelected && styles.chipTextActive]}>
              All children
            </Text>
          </TouchableOpacity>

          {childrenList.map((child) => {
            const isActive = activeChildIds.includes(child.id);
            const avatarColor = getChildAvatarColor(child.id);
            const borderColor = getChildBorderColor(child.id);
            
            return (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.chip, 
                  styles.childChip,
                  isActive && styles.chipActive,
                  // Only apply custom colors on native, web uses CSS classes
                  Platform.OS !== 'web' && isActive && { backgroundColor: avatarColor, borderColor: borderColor }
                ]}
                onPress={() => onToggleChild?.(child.id)}
                {...(Platform.OS === 'web' ? { 
                  'data-active': isActive ? 'true' : 'false',
                  className: 'chip'
                } : {})}
              >
                {safeImageUri(child.avatar) ? (
                  <Image 
                    source={{ uri: safeImageUri(child.avatar) }} 
                    style={[styles.avatar, styles.avatarImage, isActive && { borderColor: borderColor }]}
                    onError={(e) => {
                      if (Platform.OS === 'web' && e.nativeEvent) {
                        e.preventDefault?.();
                      }
                    }}
                  />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: avatarColor, borderColor: isActive ? borderColor : 'transparent' }]}>
                    <Text style={[
                      styles.avatarText, 
                      isActive && { 
                        color: Platform.OS === 'web' ? 'white' : borderColor 
                      }
                    ]}>
                      {(child.first_name || child.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {child.first_name || child.name || 'Unknown'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Label Chips */}
      <View style={styles.chipGroup}>
        {COMMON_LABELS.map((label) => {
          const isActive = activeLabels.includes(label);
          const LabelIcon = LABEL_ICONS[label.toLowerCase()];
          return (
            <TouchableOpacity
              key={label}
              style={[
                styles.chip, 
                styles.labelChip, 
                isActive && styles.chipActive, 
                // Only apply custom colors on native, web uses CSS classes
                Platform.OS !== 'web' && isActive && styles.labelChipActive
              ]}
              onPress={() => onToggleLabel?.(label)}
              {...(Platform.OS === 'web' ? { 
                'data-active': isActive ? 'true' : 'false',
                className: 'chip'
              } : {})}
            >
              {LabelIcon && (
                <LabelIcon size={12} color={Platform.OS === 'web' && isActive ? 'white' : (isActive ? '#4f46e5' : '#6b7280')} style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    // On web, let CSS chipTray class handle background
    ...(Platform.OS === 'web' ? {} : {
    backgroundColor: 'rgba(249, 250, 251, 0.5)',
    borderRadius: 8,
    }),
    marginHorizontal: -4,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
    // On web, let CSS chip class handle styling
    ...(Platform.OS === 'web' ? {
      height: 32,
    } : {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: 'transparent',
    }),
    ...(Platform.OS === 'web' && {
      transition: 'all 0.15s ease',
    }),
  },
  allChip: {
    marginRight: 4,
  },
  childChip: {
    gap: 6,
  },
  chipActive: {
    // On web, let CSS handle active state
    ...(Platform.OS === 'web' ? {} : {
    borderWidth: 1.5,
    }),
  },
  labelChip: {
    gap: 4,
    // On web, let CSS handle background
    ...(Platform.OS === 'web' ? {} : {
      backgroundColor: '#f9fafb',
    }),
  },
  labelChipActive: {
    // On web, let CSS handle active state
    ...(Platform.OS === 'web' ? {} : {
    backgroundColor: '#eef2ff', // Pastel purple
    borderColor: '#6366f1',
    }),
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  allAvatar: {
    backgroundColor: '#f3f4f6',
    borderColor: 'transparent',
  },
  avatarImage: {
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    // On web, let CSS handle colors
    ...(Platform.OS === 'web' ? {} : {
      color: '#4b5563',
    }),
  },
  chipTextActive: {
    // On web, let CSS handle active colors
    ...(Platform.OS === 'web' ? {} : {
    color: '#4f46e5',
    fontWeight: '600',
    }),
  },
});
