import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { 
  Activity, Award, BookOpen, FileText, GraduationCap, 
  BarChart3, Heart, Shield, ShoppingBag, Download,
  User, Calendar, TrendingUp, Sparkles, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { supabase } from '../../lib/supabase';
import GeistCard from '../GeistCard';
import TabBar from '../ui/TabBar';

// Import all profile feature components
import ExtracurricularLog from './ExtracurricularLog';
import VolunteerHours from './VolunteerHours';
import BadgesCertificates from './BadgesCertificates';
import IDCardView from './IDCardView';
import StudentProgressReport from './StudentProgressReport';
import LearningBiography from '../child/tabs/LearningBiography';
import SkillRadarChart from './SkillRadarChart';
import StrengthsInterestsRecord from './StrengthsInterestsRecord';
import Compliance from './Compliance';
import BooksPurchased from './BooksPurchased';
import ProfileExport from './ProfileExport';
import PrintablePortfolioView from './PrintablePortfolioView';
import TranscriptBuilder from './TranscriptBuilder';

const PROFILE_TABS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'extracurricular', label: 'Extracurricular', icon: Activity },
  { id: 'volunteer', label: 'Volunteer Hours', icon: Heart },
  { id: 'badges', label: 'Badges & Certificates', icon: Award },
  { id: 'id-card', label: 'ID Card', icon: FileText },
  { id: 'progress', label: 'Progress Report', icon: TrendingUp },
  { id: 'biography', label: 'Learning Biography', icon: BookOpen },
  { id: 'skills', label: 'Skills Radar', icon: BarChart3 },
  { id: 'strengths', label: 'Strengths & Interests', icon: Sparkles },
  { id: 'compliance', label: 'Compliance', icon: Shield },
  { id: 'books', label: 'Books Purchased', icon: ShoppingBag },
  { id: 'portfolio', label: 'Portfolio View', icon: FileText },
  { id: 'transcript', label: 'Transcript', icon: GraduationCap },
  { id: 'export', label: 'Export', icon: Download },
];

export default function ComprehensiveProfile({ childId, familyId, children = [] }) {
  const { user } = useAuth();
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [activeTab, setActiveTab] = useState('overview');
  const [child, setChild] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedChildId, setSelectedChildId] = useState(childId);

  useEffect(() => {
    if (childId) {
      setSelectedChildId(childId);
    } else if (children && children.length > 0) {
      setSelectedChildId(children[0].id);
    }
  }, [childId, children]);

  useEffect(() => {
    if (selectedChildId) {
      loadChild();
    } else {
      setChild(null);
      setLoading(false);
    }
  }, [selectedChildId]);

  const loadChild = async () => {
    if (!selectedChildId) {
      setChild(null);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('id', selectedChildId)
        .single();
      
      if (error) throw error;
      setChild(data);
    } catch (error) {
      console.error('Error loading child:', error);
      setChild(null);
    } finally {
      setLoading(false);
    }
  };

  const renderTabContent = () => {
    if (!child) {
      // Show child selector if no child selected
      if (children && children.length > 0) {
        return (
          <View style={styles.childSelector}>
            <Text style={[styles.selectorTitle, { color: tokens.text }]}>
              Select a child to view their profile
            </Text>
            <View style={styles.childrenList}>
              {children.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.childOption,
                    { 
                      backgroundColor: selectedChildId === c.id ? tokens.accent : tokens.bg,
                      borderColor: tokens.border,
                    }
                  ]}
                  onPress={() => setSelectedChildId(c.id)}
                >
                  <Text style={[
                    styles.childOptionText,
                    { color: selectedChildId === c.id ? tokens.surface : tokens.text }
                  ]}>
                    {c.first_name || c.name} {c.grade ? `(Grade ${c.grade})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      }
      return (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
            No children found. Add a child to view their profile.
          </Text>
        </View>
      );
    }

    switch (activeTab) {
      case 'overview':
        return <ProfileOverview child={child} familyId={familyId} />;
      case 'extracurricular':
        return <ExtracurricularLog childId={selectedChildId} familyId={familyId} />;
      case 'volunteer':
        return <VolunteerHours childId={selectedChildId} familyId={familyId} />;
      case 'badges':
        return <BadgesCertificates childId={selectedChildId} familyId={familyId} />;
      case 'id-card':
        return <IDCardView child={child} familyId={familyId} />;
      case 'progress':
        return <StudentProgressReport childId={selectedChildId} familyId={familyId} />;
      case 'biography':
        return <LearningBiography childId={selectedChildId} childName={child.first_name || child.name} />;
      case 'skills':
        return <SkillRadarChart childId={selectedChildId} familyId={familyId} />;
      case 'strengths':
        return <StrengthsInterestsRecord childId={selectedChildId} familyId={familyId} />;
      case 'compliance':
        return <Compliance childId={selectedChildId} familyId={familyId} />;
      case 'books':
        return <BooksPurchased childId={selectedChildId} familyId={familyId} />;
      case 'portfolio':
        return <PrintablePortfolioView childId={selectedChildId} familyId={familyId} />;
      case 'transcript':
        return <TranscriptBuilder childId={selectedChildId} familyId={familyId} />;
      case 'export':
        return <ProfileExport childId={selectedChildId} familyId={familyId} child={child} />;
      default:
        return <ProfileOverview child={child} familyId={familyId} />;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg }]}>
        <Text style={[styles.loadingText, { color: tokens.text }]}>Loading profile...</Text>
      </View>
    );
  }

  if (!child) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg }]}>
        <Text style={[styles.errorText, { color: tokens.text }]}>Child not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      {/* Profile Header */}
      <GeistCard variant="medium" style={styles.headerCard}>
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            {child ? (
              <>
                <Text style={[styles.name, { color: tokens.text }]}>
                  {child.first_name || child.name}'s Profile
                </Text>
                {child.grade && (
                  <Text style={[styles.grade, { color: tokens.textSecondary }]}>
                    Grade {child.grade}
                  </Text>
                )}
              </>
            ) : (
              <Text style={[styles.name, { color: tokens.text }]}>
                Student Profile
              </Text>
            )}
          </View>
          {children && children.length > 1 && (
            <View style={styles.childSwitcher}>
              <Text style={[styles.switcherLabel, { color: tokens.textSecondary }]}>Child:</Text>
              <View style={styles.switcherButtons}>
                {children.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.switcherButton,
                      {
                        backgroundColor: selectedChildId === c.id ? tokens.accent : tokens.bg,
                        borderColor: tokens.border,
                      }
                    ]}
                    onPress={() => setSelectedChildId(c.id)}
                  >
                    <Text style={[
                      styles.switcherButtonText,
                      { color: selectedChildId === c.id ? tokens.surface : tokens.text }
                    ]}>
                      {c.first_name || c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </GeistCard>

      {/* Tabs */}
      <TabBar
        tabs={PROFILE_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        containerStyle={styles.tabBar}
      />

      {/* Tab Content */}
      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {renderTabContent()}
      </ScrollView>
    </View>
  );
}

// Overview Component
function ProfileOverview({ child, familyId }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadStats();
  }, [child.id]);

  const loadStats = async () => {
    // Load quick stats for overview
    // This would aggregate data from various tables
    setStats({
      totalHours: 0,
      attendanceDays: 0,
      badges: 0,
      volunteerHours: 0,
    });
  };

  return (
    <View style={styles.overview}>
      <Text style={[styles.sectionTitle, { color: tokens.text }]}>Profile Overview</Text>
      <Text style={[styles.sectionDescription, { color: tokens.textSecondary }]}>
        Complete student profile with all records, achievements, and documentation.
      </Text>
      
      {/* Quick Stats Grid */}
      <View style={styles.statsGrid}>
        <GeistCard variant="small" hoverable>
          <View style={styles.statItem}>
            <Activity size={24} color={tokens.accent} />
            <Text style={[styles.statValue, { color: tokens.text }]}>0</Text>
            <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>Activities</Text>
          </View>
        </GeistCard>
        
        <GeistCard variant="small" hoverable>
          <View style={styles.statItem}>
            <Heart size={24} color={tokens.accent} />
            <Text style={[styles.statValue, { color: tokens.text }]}>0</Text>
            <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>Volunteer Hours</Text>
          </View>
        </GeistCard>
        
        <GeistCard variant="small" hoverable>
          <View style={styles.statItem}>
            <Award size={24} color={tokens.accent} />
            <Text style={[styles.statValue, { color: tokens.text }]}>0</Text>
            <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>Badges</Text>
          </View>
        </GeistCard>
        
        <GeistCard variant="small" hoverable>
          <View style={styles.statItem}>
            <CheckCircle2 size={24} color={tokens.accent} />
            <Text style={[styles.statValue, { color: tokens.text }]}>0%</Text>
            <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>Compliance</Text>
          </View>
        </GeistCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
  },
  headerCard: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  headerInfo: {
    flex: 1,
    minWidth: 200,
  },
  childSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  switcherLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  switcherButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  switcherButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  switcherButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  grade: {
    fontSize: 16,
  },
  tabBar: {
    marginBottom: spacing.lg,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: spacing['4xl'],
  },
  overview: {
    gap: spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statItem: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    minWidth: 120,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    padding: spacing.xl,
  },
  childSelector: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
  childrenList: {
    width: '100%',
    maxWidth: 400,
    gap: spacing.md,
  },
  childOption: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  childOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

