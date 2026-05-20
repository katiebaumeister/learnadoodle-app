/**
 * Tutor Navigator
 * 
 * "Assigned kids only" + instruction support:
 * - Dashboard (today's sessions, progress)
 * - Students (list of assigned children)
 * - Assignments (with feedback capability)
 * - Calendar/Subjects (via WebLayout)
 * 
 * Hidden:
 * - Family billing
 * - Parent-only settings
 * - Any child not in scope
 * - Review/approve assignments (feedback only)
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Home, Users, FileText, Calendar, BookOpen } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import TutorHomeScreen from '../home/TutorHomeScreen';
import TutorStudentsScreen from '../tutor/TutorStudentsScreen';
import TutorAssignmentsScreen from '../tutor/TutorAssignmentsScreen';
import WebLayout from '../WebLayout';
import { colors } from '../../theme/colors';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'assignments', label: 'Assignments', icon: FileText },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'subjects', label: 'Learning', icon: BookOpen },
];

export default function TutorNavigator({ session: propSession, user, ...props }) {
  const contextSession = useSession();
  const session = propSession || contextSession;
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const familyId = session?.family_id;

  const handleNavigate = (tab) => {
    setActiveTab(tab);
  };

  const handleSelectChild = (childId) => {
    setSelectedChildId(childId);
    // Could navigate to child-specific view or filter assignments
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <TutorHomeScreen
            familyId={familyId}
            onNavigate={handleNavigate}
          />
        );
      case 'students':
        return <TutorStudentsScreen onSelectChild={handleSelectChild} />;
      case 'assignments':
        return <TutorAssignmentsScreen familyId={familyId} onNavigate={handleNavigate} />;
      case 'calendar':
      case 'subjects':
        // Use WebLayout for these tabs with tutor role
        return (
          <WebLayout
            {...props}
            session={session}
            user={user}
            userRole="tutor"
            navigation={{ navigate: handleNavigate }}
            routeParams={{ activeTab }}
          />
        );
      default:
        return (
          <TutorHomeScreen
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
                color={isActive ? colors.primary : colors.textSecondary}
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
    backgroundColor: colors.bgSubtle,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    color: colors.textSecondary,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
