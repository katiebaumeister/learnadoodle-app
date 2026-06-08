import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { ChevronRight, Pencil } from 'lucide-react';
import LearnerProfileSettings from '../LearnerProfileSettings';
import StudentSettings from '../settings/StudentSettings';
import { getChildDisplayName } from './familySectionRouting';
import { familyCardStyle, familyStyles } from './familyDesignTokens';

const CHILD_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'preferences', label: 'Learning Preferences' },
  { key: 'goals', label: 'Goals' },
];

function ChildOverviewTab({ child, onEditChild, onViewAsChild }) {
  const name = getChildDisplayName(child);
  const grade = child?.grade != null && child?.grade !== '' ? `Grade ${child.grade}` : null;
  const age = child?.age != null ? `Age ${child.age}` : null;
  const meta = [grade, age].filter(Boolean).join(' · ');

  return (
    <View style={styles.tabBody}>
      <View style={styles.profileCard}>
        <View style={[styles.avatar, { backgroundColor: child?.avatar_color || '#94A3B8' }]}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.profileMeta}>
          <Text style={styles.profileName}>{name}</Text>
          {meta ? <Text style={styles.profileDetail}>{meta}</Text> : null}
          {child?.email ? <Text style={styles.profileDetail}>{child.email}</Text> : null}
        </View>
        <View style={styles.profileActions}>
          {typeof onViewAsChild === 'function' ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onViewAsChild(child.id)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.secondaryButtonText}>View as</Text>
            </TouchableOpacity>
          ) : null}
          {typeof onEditChild === 'function' ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => onEditChild(child)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Pencil size={16} color="#374151" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <Text style={styles.helperText}>
        See how {name} experiences Learnadoodle, or edit their profile details.
      </Text>
    </View>
  );
}

function ChildGoalsTab({ childName, onNavigateLearning }) {
  return (
    <View style={styles.tabBody}>
      <Text style={styles.goalsTitle}>Goals</Text>
      <Text style={styles.helperText}>
        Subject goals and pacing live in Learning. Open a subject to set units, targets, and track progress for {childName}.
      </Text>
      {typeof onNavigateLearning === 'function' ? (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onNavigateLearning}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.primaryButtonText}>Go to Learning</Text>
          <ChevronRight size={16} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function FamilyChildView({
  child,
  familyId,
  activeTab = 'overview',
  onTabChange,
  onEditChild,
  onViewAsChild,
  onNavigateLearning,
  hideHeader = false,
}) {
  const childName = useMemo(() => getChildDisplayName(child), [child]);

  if (!child?.id) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Child not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!hideHeader ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>{childName}</Text>
          </View>
          <View style={styles.tabsRow}>
            {CHILD_TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => onTabChange?.(tab.key)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'overview' ? (
          <ChildOverviewTab child={child} onEditChild={onEditChild} onViewAsChild={onViewAsChild} />
        ) : null}
        {activeTab === 'preferences' ? (
          <View style={styles.tabBody}>
            <LearnerProfileSettings childId={child.id} childName={childName} familyId={familyId} />
            <View style={styles.settingsDivider} />
            <StudentSettings childId={child.id} childName={childName} />
          </View>
        ) : null}
        {activeTab === 'goals' ? (
          <ChildGoalsTab childName={childName} onNavigateLearning={onNavigateLearning} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.24)',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: {
    borderBottomColor: '#2563EB',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(15, 23, 42, 0.55)',
  },
  tabTextActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  tabBody: {
    ...familyStyles.pageContent,
    paddingTop: 0,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...familyCardStyle,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileMeta: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  profileDetail: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.62)',
  },
  profileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(15, 23, 42, 0.62)',
  },
  goalsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2563EB',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingsDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    marginVertical: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.55)',
  },
});
