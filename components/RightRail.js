import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform, ScrollView } from 'react-native';
import { Calendar, ListChecks, Target, Puzzle } from 'lucide-react';

const TAB_CONFIG = [
  { key: 'search', label: 'Search', icon: Calendar },
  { key: 'backlog', label: 'Backlog', icon: ListChecks },
  { key: 'objectives', label: 'Objectives', icon: Target },
  { key: 'integrations', label: 'Integrations', icon: Puzzle },
];

export default function RightRail({
  defaultTab = 'search',
  activeTab: activeTabProp,
  onTabChange,
  onSchedule,
  searchContent,
  onConnectGoogle,
  onSubscribeIcs,
}) {
  const [activeTab, setActiveTab] = useState(activeTabProp ?? defaultTab);
  const [objectives, setObjectives] = useState([
    { id: 'math', label: 'Math: 3 practice blocks', completed: false },
    { id: 'reading', label: 'Reading: 2 stories logged', completed: true },
    { id: 'science', label: 'Science: finish lab notes', completed: false },
  ]);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (activeTabProp && activeTabProp !== activeTab) {
      setActiveTab(activeTabProp);
    }
  }, [activeTabProp]);

  useEffect(() => {
    if (activeTab === 'search' && searchInputRef.current?.focus && Platform.OS === 'web') {
      searchInputRef.current.focus();
    }
  }, [activeTab]);

  const backlogItems = useMemo(
    () => [
      { id: 'bk-1', label: 'History project planning', due: 'Nov 8' },
      { id: 'bk-2', label: 'Writing: persuasive essay', due: 'Nov 10' },
      { id: 'bk-3', label: 'Science: group lab sync', due: 'Nov 12' },
    ],
    []
  );

  const handleToggleObjective = (id) => {
    setObjectives((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const renderSearchPanel = () => (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Quick Search</Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={searchInputRef}
          placeholder="Find lessons, events, evidence…"
          placeholderTextColor="rgba(15,23,42,0.45)"
          style={styles.textInput}
          accessibilityRole="search"
        />
      </View>
      {searchContent || (
        <View style={styles.list}>
          <Text style={styles.listHeader}>Recent Searches</Text>
          <Text style={styles.listItem}>Planner: Lilly week view</Text>
          <Text style={styles.listItem}>Evidence: Reading uploads</Text>
          <Text style={styles.listItem}>Objectives: November goals</Text>
        </View>
      )}
    </View>
  );

  const renderBacklogPanel = () => (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Backlog</Text>
      <Text style={styles.panelSubtitle}>Drag to schedule or quick add</Text>
      {backlogItems.map((item) => (
        <View key={item.id} style={styles.backlogRow}>
          <View style={styles.backlogInfo}>
            <Text style={styles.backlogLabel}>{item.label}</Text>
            <Text style={styles.backlogMeta}>Due {item.due}</Text>
          </View>
          <TouchableOpacity
            className="btn"
            onPress={() => onSchedule?.(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Schedule ${item.label}`}
          >
            <Text style={styles.backlogButton}>Schedule</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  const renderObjectivesPanel = () => (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Weekly Objectives</Text>
      <Text style={styles.panelSubtitle}>Track and celebrate progress</Text>
      {objectives.map((objective) => (
        <TouchableOpacity
          key={objective.id}
          style={[styles.objectiveRow, objective.completed && styles.objectiveComplete]}
          onPress={() => handleToggleObjective(objective.id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: objective.completed }}
        >
          <View style={styles.checkbox}>
            {objective.completed ? <Text style={styles.checkboxTick}>✓</Text> : null}
          </View>
          <Text
            style={[
              styles.objectiveLabel,
              objective.completed && styles.objectiveLabelComplete,
            ]}
          >
            {objective.label}
          </Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity className="btn" onPress={() => {}}>
        <Text style={styles.addObjective}>Add Objective</Text>
      </TouchableOpacity>
    </View>
  );

  const renderIntegrationsPanel = () => (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Integrations</Text>
      <TouchableOpacity
        className="btn btn-primary"
        onPress={onConnectGoogle}
        accessibilityRole="button"
        accessibilityLabel="Connect Google account"
      >
        <Text style={styles.integrationButton}>Connect Google Classroom</Text>
      </TouchableOpacity>
      <View style={styles.integrationField}>
        <Text style={styles.integrationLabel}>Subscribe via ICS</Text>
        <TextInput
          placeholder="Paste calendar link"
          placeholderTextColor="rgba(15,23,42,0.45)"
          style={styles.textInput}
          onSubmitEditing={(event) => onSubscribeIcs?.(event.nativeEvent.text)}
        />
      </View>
    </View>
  );

  const renderPanel = () => {
    switch (activeTab) {
      case 'search':
        return renderSearchPanel();
      case 'backlog':
        return renderBacklogPanel();
      case 'objectives':
        return renderObjectivesPanel();
      case 'integrations':
        return renderIntegrationsPanel();
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.tabRow}
        role="tablist"
        aria-label="Right rail"
      >
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => {
                if (activeTabProp && onTabChange) {
                  onTabChange(key);
                } else {
                  setActiveTab(key);
                  onTabChange?.(key);
                }
              }}
            >
              <Icon size={16} color={isActive ? 'var(--ld-accent-core)' : 'rgba(15,23,42,0.6)'} />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        bounces={false}
      >
        {renderPanel()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: Platform.OS === 'web' ? 1 : StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabButtonActive: {
    borderColor: 'rgba(99, 102, 241, 0.25)',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  tabLabel: {
    fontSize: 13,
    color: 'rgba(15,23,42,0.6)',
  },
  tabLabelActive: {
    color: 'var(--ld-accent-core)',
    fontWeight: '600',
  },
  panelScroll: {
    flex: 1,
    ...(Platform.OS === 'web' ? { overflowY: 'auto' } : {}),
  },
  panelScrollContent: {
    padding: 20,
  },
  panel: {
    marginBottom: 24,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'var(--ld-ink)',
  },
  panelSubtitle: {
    fontSize: 13,
    color: 'rgba(15,23,42,0.6)',
  },
  inputRow: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textInput: {
    fontSize: 14,
    color: 'var(--ld-ink)',
    fontFamily: Platform.select({
      web: 'var(--ld-font-sans)',
      default: 'Inter',
    }),
    outlineStyle: 'none',
  },
  list: {
    marginTop: 12,
  },
  listHeader: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: 'rgba(15,23,42,0.55)',
    letterSpacing: 1,
  },
  listItem: {
    fontSize: 14,
    color: 'rgba(15,23,42,0.72)',
  },
  backlogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  backlogInfo: {
    flex: 1,
    marginRight: 12,
  },
  backlogLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.85)',
  },
  backlogMeta: {
    fontSize: 12,
    color: 'rgba(15,23,42,0.6)',
  },
  backlogButton: {
    fontSize: 13,
    color: 'var(--ld-ink)',
  },
  objectiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
  },
  objectiveComplete: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'var(--ld-accent-core)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTick: {
    color: 'var(--ld-accent-core)',
    fontSize: 14,
    fontWeight: '700',
  },
  objectiveLabel: {
    fontSize: 14,
    color: 'rgba(15,23,42,0.8)',
    flex: 1,
    marginLeft: 10,
  },
  objectiveLabelComplete: {
    textDecorationLine: 'line-through',
    color: 'rgba(15,23,42,0.6)',
  },
  addObjective: {
    fontSize: 14,
    color: 'var(--ld-ink)',
    fontWeight: '600',
  },
  integrationButton: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  integrationField: {
    marginTop: 12,
  },
  integrationLabel: {
    fontSize: 13,
    color: 'rgba(15,23,42,0.65)',
  },
});

