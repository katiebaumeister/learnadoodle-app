/**
 * Child Navigator
 * 
 * Simplified, motivating, action-oriented experience for children/students:
 * - Home (today + prompts)
 * - Calendar
 * - Subjects
 * - Assignments
 * - Ask for Help (or inside Home)
 * 
 * Hidden:
 * - Family management
 * - Invite flows
 * - Full analytics/admin settings
 * - Other children
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useSession } from '../../contexts/SessionContext';
import { Home, Calendar, BookOpen, FileText, HelpCircle } from 'lucide-react';
import ChildHomeScreen from '../child/ChildHomeScreen';
import ChildAssignmentsScreen from '../child/ChildAssignmentsScreen';
import WebLayout from '../WebLayout';

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'subjects', label: 'Learning', icon: BookOpen },
  { id: 'assignments', label: 'Assignments', icon: FileText },
];

export default function ChildNavigator({ session: propSession, user, ...props }) {
  const contextSession = useSession();
  const session = propSession || contextSession;
  const [activeTab, setActiveTab] = useState('home');
  const familyId = session?.family_id;

  // For now, use simplified navigation with child-specific screens
  // In the future, this could be a completely custom navigator
  
  const handleNavigate = (tab) => {
    setActiveTab(tab);
    // For now, navigate within this component
    // Later, this could use React Navigation or similar
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <ChildHomeScreen
            familyId={familyId}
            onNavigate={handleNavigate}
          />
        );
      case 'assignments':
        return (
          <ChildAssignmentsScreen
            familyId={familyId}
            onNavigate={handleNavigate}
          />
        );
      case 'calendar':
      case 'subjects':
        // For now, use WebLayout for these tabs with child role
        // Later, create child-specific screens
        return (
          <WebLayout
            {...props}
            session={session}
            user={user}
            userRole="child"
            navigation={{ navigate: handleNavigate }}
            routeParams={{ activeTab }}
          />
        );
      default:
        return (
          <ChildHomeScreen
            familyId={familyId}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Main Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Bottom Tab Navigation */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handleNavigate(tab.id)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Icon
                size={20}
                color={isActive ? '#887DEE' : '#9ca3af'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  isActive && styles.tabLabelActive,
                ]}
              >
                {tab.label}
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
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'web' ? 8 : 24,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 -1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  tabActive: {
    // Active state styling
  },
  tabLabel: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabLabelActive: {
    color: '#887DEE',
    fontWeight: '600',
  },
});
