/**
 * IntelligenceHub - EXAMPLE UPDATE
 * This file shows how IntelligenceHub would look after applying the UI consistency patches
 * 
 * Key changes:
 * 1. Uses PageHeader instead of custom header
 * 2. Uses TabBar instead of custom tabs
 * 3. Uses AppContainer for content
 * 4. Uses SectionHeader for section titles
 * 5. Uses Card for analytics cards
 * 6. Uses EmptyState for empty states
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { plannerAIChat, getInsights, applyProposedChanges } from '../../lib/apiClient';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { 
  Brain, 
  Calendar, 
  BarChart3, 
  Lightbulb, 
  AlertTriangle, 
  TrendingUp,
  Sparkles,
  MessageSquare,
  Filter,
  X,
  ChevronRight,
  Flame,
  Target,
  Package,
  RotateCcw,
  FileText,
  UserCircle,
  Layers,
  BookOpen,
} from 'lucide-react';
import { colors } from '../../theme/colors';

// NEW: Import unified UI components
import PageHeader from '../ui/PageHeader';
import TabBar from '../ui/TabBar';
import AppContainer from '../ui/AppContainer';
import SectionHeader from '../ui/SectionHeader';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';

// ... existing imports for modals and components ...

export default function IntelligenceHub({ familyId, children = [] }) {
  // ... existing state management ...

  return (
    <View style={styles.container}>
      {/* UPDATED: Use PageHeader instead of custom header */}
      <PageHeader
        title="Intelligence Hub"
        subtitle="AI-powered planning, analytics, and insights"
        icon={Brain}
        iconColor={colors.indigo}
      />

      {/* Shared Filters Section - Above Tabs */}
      <View style={styles.filtersSection}>
        {/* ... existing filter code ... */}
      </View>

      {/* UPDATED: Use TabBar instead of custom tabs */}
      <TabBar
        tabs={[
          { id: 'planner', label: 'Planner AI', icon: Calendar },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          { id: 'insights', label: 'Insights', icon: Lightbulb },
          { id: 'forecasting', label: 'Forecasting', icon: TrendingUp },
          { id: 'coach', label: 'Coach', icon: UserCircle },
          { id: 'advanced-insights', label: 'Advanced Insights', icon: Layers },
          { id: 'templates', label: 'Templates', icon: BookOpen },
          { id: 'workload', label: 'Workload', icon: BarChart3 },
          { id: 'reviews', label: 'Reviews', icon: RotateCcw },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* UPDATED: Wrap content in AppContainer */}
      <AppContainer paddingVertical={20}>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {activeTab === 'planner' && (
            <PlannerAITab
              // ... props ...
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsTab
              // ... props ...
            />
          )}

          {/* ... other tabs ... */}
        </ScrollView>
      </AppContainer>

      {/* ... existing modals ... */}
    </View>
  );
}

// UPDATED: PlannerAITab with SectionHeader
function PlannerAITab({
  chatMessages,
  chatInput,
  onChatInputChange,
  onSendMessage,
  selectedChildren,
  timeframe,
  proposedChanges = [],
  familyId,
  chatLoading = false,
  chatError = null,
}) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.plannerGrid}>
        <View style={styles.chatColumn}>
          {/* UPDATED: Use SectionHeader */}
          <SectionHeader
            title="Planner AI"
            icon={Sparkles}
            iconColor={colors.indigo}
          />
          
          <View style={styles.chatContainer}>
            {chatMessages.length === 0 ? (
              // UPDATED: Use EmptyState
              <EmptyState
                icon={Sparkles}
                title="Start a conversation to plan your week"
                description='Try: "Plan my week" or "Reschedule missed work"'
                size="default"
              />
            ) : (
              // ... existing chat messages ...
            )}
            
            {/* ... existing chat input ... */}
          </View>
        </View>

        {/* ... preview column ... */}
      </View>
    </View>
  );
}

// UPDATED: AnalyticsTab with Card and SectionHeader
function AnalyticsTab({
  familyId,
  selectedChildren,
  dateRange,
  onPlanYear,
}) {
  const primaryChildId = selectedChildren.length > 0 ? selectedChildren[0] : null;

  return (
    <View style={styles.tabContent}>
      <View style={styles.analyticsGrid}>
        {/* UPDATED: Use Card component */}
        <Card variant="elevated" padding="base">
          <SectionHeader
            title="Curriculum Heatmap"
            icon={BarChart3}
            iconColor={colors.indigo}
          />
          <View style={styles.cardContent}>
            {familyId && dateRange ? (
              <CurriculumHeatmap
                familyId={familyId}
                startDate={dateRange.start.toISOString().split('T')[0]}
                endDate={dateRange.end.toISOString().split('T')[0]}
                onClose={() => {}}
              />
            ) : (
              <Text style={styles.placeholderText}>Select a timeframe to view heatmap</Text>
            )}
          </View>
        </Card>

        {/* ... more cards using Card component ... */}
      </View>
    </View>
  );
}

// UPDATED: InsightsTab with EmptyState
function InsightsTab({
  familyId,
  selectedChildren,
  dateRange,
  onGenerateDigest,
  onApplyInsightChanges,
}) {
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  
  // ... existing fetch logic ...

  return (
    <View style={styles.tabContent}>
      {/* ... digest card ... */}

      <View style={styles.insightsSection}>
        <SectionHeader title="Insights Feed" />
        
        {insightsLoading ? (
          // UPDATED: Use EmptyState for loading
          <EmptyState
            icon={ActivityIndicator}
            title="Loading insights..."
            size="small"
          />
        ) : insightsError ? (
          // UPDATED: Use EmptyState for error
          <EmptyState
            icon={AlertTriangle}
            title="Error loading insights"
            description={insightsError}
            size="default"
          />
        ) : insights.length === 0 ? (
          // UPDATED: Use EmptyState for empty
          <EmptyState
            icon={Lightbulb}
            title="No insights yet"
            description="Insights will appear here as you use the platform"
            size="default"
          />
        ) : (
          // ... existing insights list ...
        )}
      </View>
    </View>
  );
}

// UPDATED: Simplified styles - removed styles now handled by components
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // REMOVED: header, headerContent, headerTitle, headerSubtitle (now PageHeader)
  // REMOVED: tabs, tab, tabActive, tabLabel, tabLabelActive (now TabBar)
  filtersSection: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // ... existing filter styles ...
  content: {
    flex: 1,
  },
  tabContent: {
    gap: 20,
  },
  // REMOVED: sectionTitle (now SectionHeader)
  // REMOVED: analyticsCard (now Card component)
  // REMOVED: emptyState, emptyText, emptySubtext (now EmptyState)
  // ... keep other styles that are still needed ...
});

