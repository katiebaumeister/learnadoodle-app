/**
 * TabBar Component
 * Unified tab bar for Records, Intelligence, Planner, and other sections
 * 
 * Usage:
 * <TabBar
 *   tabs={[
 *     { id: 'tab1', label: 'Tab 1', icon: Calendar },
 *     { id: 'tab2', label: 'Tab 2', icon: BarChart },
 *   ]}
 *   activeTab="tab1"
 *   onTabChange={(id) => setActiveTab(id)}
 * />
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { colors } from '../../theme/colors';
import { designTokens } from '../../theme/designTokens';
import { getModeTokens } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';

export default function TabBar({ 
  tabs = [],
  activeTab,
  onTabChange,
  showScrollIndicator = false,
  containerStyle,
}) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const styles = createStyles(tokens);

  return (
    <View style={[styles.container, containerStyle]}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={showScrollIndicator}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabChange(tab.id)}
            >
              {Icon && (
                <Icon 
                  size={16} 
                  color={isActive ? '#4285f4' : tokens.textSecondary} 
                />
              )}
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(tokens) {
  return StyleSheet.create({
    container: {
      backgroundColor: tokens.card,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border,
      ...(Platform.OS === 'web' && {
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }),
    },
    scrollContent: {
      flexDirection: 'row',
      paddingHorizontal: 16, // px-4
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6, // gap-1.5
      paddingHorizontal: 16, // px-4
      paddingVertical: 12, // py-3
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        ':hover': {
          backgroundColor: tokens.bgSubtle,
        },
      }),
    },
    tabActive: {
      borderBottomColor: '#4285f4',
    },
    tabLabel: {
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      color: tokens.textSecondary,
      lineHeight: 20,
      ...Platform.select({
        web: {
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        default: {
          fontFamily: designTokens.fonts.sans,
        },
      }),
    },
    tabLabelActive: {
      color: '#4285f4',
      fontWeight: '700',
    },
  });
}

