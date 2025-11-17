import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Plus, Home, CalendarDays, Search, Compass, FileText } from 'lucide-react';

const COLLAPSE_STORAGE_KEY = 'ld.mainNavCollapsed';

const avatarSources = {
  prof1: require('../assets/prof1.png'),
  prof2: require('../assets/prof2.png'),
  prof3: require('../assets/prof3.png'),
  prof4: require('../assets/prof4.png'),
  prof5: require('../assets/prof5.png'),
  prof6: require('../assets/prof6.png'),
  prof7: require('../assets/prof7.png'),
  prof8: require('../assets/prof8.png'),
  prof9: require('../assets/prof9.png'),
  prof10: require('../assets/prof10.png'),
};

const resolveAvatarSource = (avatarKey) => {
  if (!avatarKey) {
    return avatarSources.prof1;
  }
  const normalized = String(avatarKey)
    .toLowerCase()
    .replace(/.*\//, '')
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
  return avatarSources[normalized] || avatarSources.prof1;
};

const SIDEBAR_COLORS = {
  background: '#F4F6F8',
  border: 'rgba(148, 163, 184, 0.24)',
  accent: '#475569',
  accentSoft: 'rgba(71, 85, 105, 0.18)',
  accentSofter: 'rgba(71, 85, 105, 0.12)',
  avatar: 'rgba(148, 163, 184, 0.28)',
};

const CHILD_SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'projects', label: 'Projects' },
  { key: 'syllabus', label: 'Syllabus' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'notes', label: 'Notes' },
];

export default function LeftRail({
  topActive,
  onSelectTop,
  childrenList = [],
  activeChildId,
  activeChildSection = 'overview',
  onSelectChild,
  onSelectChildSection,
  onOpenNew,
  onOpenSearch,
  onAvatarPress,
  user,
  userRole = 'parent',
}) {
  const [isCollapsed] = useState(false);

  const handleNewPress = useCallback(
    (event) => {
      if (Platform.OS === 'web' && event?.currentTarget?.getBoundingClientRect) {
        const rect = event.currentTarget.getBoundingClientRect();
        onOpenNew?.({
          x: rect.right + window.scrollX,
          y: rect.top + rect.height / 2 + window.scrollY,
          height: rect.height,
        });
        return;
      }
      onOpenNew?.();
    },
    [onOpenNew]
  );

  const topNavItems = useMemo(
    () => {
      const allItems = [
        { key: 'home', label: 'Home', icon: Home },
        { key: 'planner', label: 'Planner', icon: CalendarDays },
        { key: 'explore', label: 'Explore', icon: Compass },
        { key: 'records', label: 'Records', icon: FileText },
      ];

      // Filter based on role
      if (userRole === 'child') {
        // Children only see Home
        return allItems.filter(item => item.key === 'home');
      } else if (userRole === 'tutor') {
        // Tutors see Home, Planner, Explore (no Records)
        return allItems.filter(item => item.key !== 'records');
      } else {
        // Parents see everything
        return allItems;
      }
    },
    [userRole]
  );

  const renderChildAvatar = (child) => {
    if (child.avatar_url) {
      return <Image source={{ uri: child.avatar_url }} style={styles.childAvatar} />;
    }

    const source = resolveAvatarSource(child.avatar);
    return <Image source={source} style={styles.childAvatar} />;
  };

  return (
    <View style={[styles.container, isCollapsed ? styles.collapsed : styles.expanded]}>
      <View style={[styles.wrap, isCollapsed && styles.wrapCollapsed]}>
        {!isCollapsed && (
          <TouchableOpacity
            onPress={onAvatarPress}
            accessibilityRole="button"
            accessibilityLabel="Account and settings"
            disabled={!onAvatarPress}
          >
            <Text style={styles.brandHeading}>Learnadoodle</Text>
          </TouchableOpacity>
        )}

        <View style={styles.sectionGroup}>
          {topNavItems.map((item) => {
            const Icon = item.icon;
            const active = topActive === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.navItem,
                  active && styles.navItemActive,
                  isCollapsed && styles.navItemCollapsed,
                ]}
                onPress={() => onSelectTop?.(item.key)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Icon size={18} color={active ? SIDEBAR_COLORS.accent : 'rgba(15,23,42,0.6)'} />
                {!isCollapsed && (
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                )}
              </TouchableOpacity>
            );
          })}

          {onOpenSearch ? (
            <TouchableOpacity
              style={[
                styles.navItem,
                isCollapsed && styles.navItemCollapsed,
              ]}
              onPress={onOpenSearch}
              accessibilityRole="button"
              accessibilityLabel="Open search"
            >
              <Search size={18} color="rgba(15,23,42,0.6)" />
              {!isCollapsed && <Text style={styles.navLabel}>Search</Text>}
            </TouchableOpacity>
          ) : null}

          {onOpenNew && userRole !== 'child' ? (
            <TouchableOpacity
              style={[
                styles.navItem,
                isCollapsed && styles.navItemCollapsed,
              ]}
              onPress={handleNewPress}
              accessibilityRole="button"
              accessibilityLabel="Create new item"
            >
              <Plus size={18} color="rgba(15,23,42,0.6)" />
              {!isCollapsed && <Text style={styles.navLabel}>New</Text>}
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.divider} />

        {!isCollapsed && childrenList.length > 0 && userRole !== 'child' ? (
          <Text style={styles.sectionLabel}>Family</Text>
        ) : null}

        {userRole !== 'child' && (
          <View style={styles.familyGroup}>
            {childrenList.map((child) => {
              const active = activeChildId === child.id;
              return (
                <View key={child.id} style={styles.childBlock}>
                  <TouchableOpacity
                    style={[
                      styles.childItem,
                      active && styles.childItemActive,
                      isCollapsed && styles.childItemCollapsed,
                    ]}
                    onPress={() => onSelectChild?.(child.id)}
                  >
                    {renderChildAvatar(child)}
                    {!isCollapsed && (
                      <View style={styles.childInfo}>
                        <Text style={[styles.childLabel, active && styles.childLabelActive]}>
                          {child.first_name || child.name || 'Student'}
                        </Text>
                        {child.grade ? (
                          <Text style={styles.childSubLabel}>Grade {child.grade}</Text>
                        ) : null}
                      </View>
                    )}
                  </TouchableOpacity>

                  {!isCollapsed && active && (
                    <View style={styles.childSections}>
                      {CHILD_SECTIONS.map((section) => {
                        const sectionActive = activeChildSection === section.key;
                        return (
                          <TouchableOpacity
                            key={`${child.id}-${section.key}`}
                            style={[
                              styles.childSectionButton,
                              sectionActive && styles.childSectionButtonActive,
                            ]}
                            onPress={() => onSelectChildSection?.(child.id, section.key)}
                          >
                            <Text
                              style={[
                                styles.childSectionLabel,
                                sectionActive && styles.childSectionLabelActive,
                              ]}
                            >
                              {section.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: SIDEBAR_COLORS.background,
    borderRightWidth: Platform.OS === 'web' ? 1 : StyleSheet.hairlineWidth,
    borderRightColor: SIDEBAR_COLORS.border,
    paddingVertical: 16,
    flex: 1,
    minHeight: Platform.OS === 'web' ? '100vh' : undefined,
  },
  collapsed: {
    width: 76,
    paddingHorizontal: 8,
  },
  expanded: {
    width: 256,
  },
  wrap: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    gap: 8,
    flex: 1,
  },
  wrapCollapsed: {
    paddingHorizontal: 8,
  },
  brandHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.85)',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  navItemActive: {
    backgroundColor: SIDEBAR_COLORS.accentSofter,
  },
  navItemCollapsed: {
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 14,
    color: 'rgba(15,23,42,0.7)',
    fontWeight: '500',
  },
  navLabelActive: {
    color: SIDEBAR_COLORS.accent,
    fontWeight: '600',
  },
  sectionGroup: {
    flexDirection: 'column',
    gap: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(56, 182, 255, 0.14)',
    alignSelf: 'stretch',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.5)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  familyGroup: {
    flexDirection: 'column',
    gap: 8,
  },
  childBlock: {
    flexDirection: 'column',
    gap: 8,
  },
  childItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  childItemActive: {
    backgroundColor: SIDEBAR_COLORS.accentSofter,
  },
  childItemCollapsed: {
    justifyContent: 'center',
  },
  childAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SIDEBAR_COLORS.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childInfo: {
    flex: 1,
    gap: 2,
  },
  childLabel: {
    fontSize: 14,
    color: 'rgba(15,23,42,0.75)',
    fontWeight: '500',
  },
  childLabelActive: {
    color: SIDEBAR_COLORS.accent,
    fontWeight: '600',
  },
  childSubLabel: {
    fontSize: 12,
    color: 'rgba(148,163,184,1)',
  },
  childSections: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 48,
  },
  childSectionButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: SIDEBAR_COLORS.accentSofter,
  },
  childSectionButtonActive: {
    backgroundColor: SIDEBAR_COLORS.accentSoft,
  },
  childSectionLabel: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.9)',
    fontWeight: '500',
  },
  childSectionLabelActive: {
    color: SIDEBAR_COLORS.accent,
  },
});

