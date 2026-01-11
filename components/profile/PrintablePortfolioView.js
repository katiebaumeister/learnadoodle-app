import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, Alert, Image, Animated, Easing, ActivityIndicator, Modal, TextInput } from 'react-native';
import { BookOpen, FileText, Plus, Calendar, Settings, Users, MessageSquare, Clock, Target, TrendingUp, Upload, BarChart3, Shield, X, ExternalLink, CheckCircle2, MapPin, TrendingDown, Award, AlertCircle, Activity, ChevronDown, ChevronUp, Download, TrendingDown as TrendingDownIcon } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { designTokens } from '../../theme/designTokens';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { apiRequest } from '../../lib/apiClient';
import { getSkillHeatmap, getStrengthsWeaknesses, getSkillGraph } from '../../lib/services/skillsClient';
import { getPortfolioUploads, getPortfolioTimelineEvents, addGrade } from '../../lib/services/recordsClient';
import GeistCard from '../GeistCard';
import AddSubjectModal from '../AddSubjectModal';
import PlanYearWizard from '../year/PlanYearWizard';
import AddMaterialModal from '../materials/AddMaterialModal';
import ProgressForecastModal from '../planner/modals/ProgressForecastModal';
import ComplianceDashboard from '../compliance/ComplianceDashboard';

// Simple cache for ProfileOverview data (keyed by childId-familyId)
const profileOverviewCache = new Map();

// Image assets for sidebar cards
const buildImage = require('../../assets/build.png');
const subjectImage = require('../../assets/subject.png');

// Avatar sources
const avatarSources = {
  prof1: require('../../assets/prof1.png'),
  prof2: require('../../assets/prof2.png'),
  prof3: require('../../assets/prof3.png'),
  prof4: require('../../assets/prof4.png'),
  prof5: require('../../assets/prof5.png'),
  prof6: require('../../assets/prof6.png'),
  prof7: require('../../assets/prof7.png'),
  prof8: require('../../assets/prof8.png'),
  prof9: require('../../assets/prof9.png'),
  prof10: require('../../assets/prof10.png'),
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

// Helper to validate URLs
const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// PDF Iframe component for web
const PDFIframe = ({ src, title }) => {
  if (Platform.OS !== 'web') return null;
  
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (containerRef.current && src && typeof document !== 'undefined') {
      if (!isValidUrl(src)) {
        console.warn('[PDFIframe] Invalid URL provided, skipping iframe creation:', src);
        return;
      }

      const domElement = containerRef.current;
      
      if (domElement.innerHTML !== undefined) {
        domElement.innerHTML = '';
      } else if (domElement.removeChild) {
        while (domElement.firstChild) {
          domElement.removeChild(domElement.firstChild);
        }
      }
      
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = title || 'PDF Viewer';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.setAttribute('allow', 'fullscreen');
      
      iframe.onerror = (e) => {
        console.warn('[PDFIframe] Error loading PDF:', src);
        e.preventDefault();
        e.stopPropagation();
      };
      
      domElement.appendChild(iframe);
    }
  }, [src, title]);
  
  return (
    <View
      ref={containerRef}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
      }}
    />
  );
};

function createOverviewStyles(tokens) {
  return StyleSheet.create({
    overviewContainer: {
      flex: 1,
      minHeight: '100%',
      padding: spacing.xl,
      width: '100%',
    },
    overview: {
      flex: 1,
      width: '100%',
      maxWidth: '100%',
      gap: spacing.lg,
    },
    sidebarCard: {
      backgroundColor: tokens.card || '#ffffff',
      borderRadius: 12,
      padding: 20,
      borderWidth: 1.5,
      borderColor: tokens.border || '#e5e7eb',
      minHeight: 200,
      flexDirection: 'column',
      justifyContent: 'space-between',
    },
    sidebarCardContent: {
      flex: 1,
      flexDirection: 'column',
      gap: 16,
    },
    sidebarCardIconContainer: {
      width: '100%',
      height: 160,
      alignItems: 'center',
      justifyContent: 'flex-start',
      overflow: 'hidden',
      marginBottom: 8,
    },
    sidebarCardIconContainerSmall: {
      width: 80,
      height: 80,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      overflow: 'hidden',
    },
    sidebarCardTextContainer: {
      flex: 1,
      minWidth: 0,
    },
    sidebarCardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: tokens.text || colors.text,
      marginBottom: 8,
      fontFamily: designTokens.fonts.display,
      textTransform: 'uppercase',
    },
    sidebarCardDescription: {
      fontSize: 13,
      color: tokens.text || colors.text,
      lineHeight: 18,
      opacity: 0.8,
      fontFamily: designTokens.fonts.sans,
    },
    sidebarCardButton: {
      backgroundColor: '#FEFCE8',
      borderRadius: 24,
      paddingVertical: 12,
      paddingHorizontal: 16,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#B8860B',
      marginTop: 'auto',
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    sidebarCardButtonText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#B8860B',
      textTransform: 'uppercase',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    statsContainer: {
      marginTop: 8,
      gap: 4,
    },
    statText: {
      fontSize: 13,
      color: tokens.textSecondary || colors.textSecondary,
      opacity: 0.8,
      fontFamily: designTokens.fonts.sans,
    },
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      ...Platform.select({
        web: {
          width: '100%',
        },
      }),
    },
    headerLeft: {
      flex: 1,
    },
    headerText: {
      fontSize: 26,
      fontWeight: '700',
      color: tokens.text || '#111827',
      ...Platform.select({
        web: {
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    divider: {
      height: 1,
      backgroundColor: tokens.border || 'rgba(0, 0, 0, 0.1)',
      marginVertical: spacing.lg,
    },
    childChipsRow: {
      marginBottom: spacing.xl,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
    },
    childrenLabelContainer: {
      paddingHorizontal: 0,
      paddingBottom: 8,
    },
    childrenLabelText: {
      fontSize: 15,
      fontWeight: '700',
      color: tokens.text,
      ...Platform.select({
        web: {
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    chipScroll: {
      flexGrow: 0,
    },
    segmentedControl: {
      flexDirection: 'row',
      backgroundColor: 'transparent',
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      padding: 4,
      gap: 0,
      alignSelf: 'center',
      position: 'relative',
      ...Platform.select({
        web: {
          display: 'inline-flex',
          width: 'fit-content',
        },
      }),
    },
    segmentedControlIndicator: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      backgroundColor: '#dbeafe', // Light blue background for active
      borderRadius: 9999,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    segmentedControlSegment: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 100,
      backgroundColor: 'transparent',
      zIndex: 1,
    },
    segmentedControlText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#6b7280', // Dark grey text for inactive
      fontFamily: designTokens.fonts.sans,
    },
    segmentedControlTextActive: {
      color: '#1e40af', // Dark blue text for active
      fontWeight: '600',
    },
    avatarContainer: {
      paddingHorizontal: spacing.xl,
      marginTop: spacing.xl,
      marginBottom: spacing.xl,
      alignItems: 'center',
      gap: spacing.md,
    },
    avatarFlipContainer: {
      width: 120,
      height: 120,
      ...Platform.select({
        web: {
          perspective: 800,
        },
      }),
    },
    avatarImage: {
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 2,
      borderColor: tokens.border || 'rgba(0, 0, 0, 0.15)',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        web: {
          backfaceVisibility: 'hidden',
        },
      }),
    },
    avatarImageInner: {
      width: '100%',
      height: '100%',
    },
    childInfoContainer: {
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    childName: {
      fontSize: 18,
      fontWeight: '800',
      color: tokens.text,
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      textTransform: 'uppercase',
    },
    childInfoRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'center',
    },
    childInfoText: {
      fontSize: 14,
      fontWeight: '650',
      color: tokens.textSecondary,
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      textTransform: 'uppercase',
    },
    tabsContainer: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border || 'rgba(0, 0, 0, 0.1)',
    },
    tab: {
      paddingBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
      marginBottom: -1,
    },
    tabActive: {
      borderBottomColor: tokens.accent || colors.accent,
    },
    tabText: {
      fontSize: 15,
      fontWeight: '500',
      color: tokens.textSecondary || '#6b7280',
      ...Platform.select({
        web: {
          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    tabTextActive: {
      color: tokens.text || '#111827',
      fontWeight: '600',
    },
    tabContent: {
      marginTop: spacing.md,
    },
    // Chart Tab Styles
    subjectList: {
      flexDirection: 'column',
      marginBottom: spacing.xl,
    },
    subjectListItem: {
      width: '100%',
      ...Platform.select({
        web: {
          transition: 'background-color 0.2s ease',
        },
      }),
    },
    subjectListItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: 0,
    },
    subjectListItemMain: {
      flex: 1,
      flexDirection: 'column',
      gap: spacing.xs,
    },
    subjectListItemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: tokens.text,
      marginBottom: 2,
    },
    subjectListItemValue: {
      fontSize: 13,
      color: tokens.textSecondary,
      lineHeight: 18,
    },
    subjectListItemDate: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    subjectListItemDateText: {
      fontSize: 12,
      color: tokens.textSecondary,
    },
    subjectListDivider: {
      height: 1,
      backgroundColor: tokens.border || '#e5e7eb',
      width: '100%',
    },
    needsInputBadge: {
      backgroundColor: '#fef3c7',
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.sm,
      marginLeft: spacing.xs,
    },
    needsInputText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#92400e',
      textTransform: 'uppercase',
    },
    tileProgress: {
      marginBottom: spacing.sm,
    },
    progressBar: {
      height: 8,
      backgroundColor: tokens.border || '#e5e7eb',
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: spacing.xs,
    },
    progressFill: {
      height: '100%',
      backgroundColor: tokens.accent || colors.accent,
      borderRadius: 4,
    },
    progressText: {
      fontSize: 12,
      color: tokens.textSecondary,
    },
    tileSection: {
      marginBottom: spacing.md,
    },
    tileLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: tokens.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    tileValue: {
      fontSize: 14,
      color: tokens.text,
      lineHeight: 20,
    },
    tipText: {
      fontSize: 12,
      color: tokens.textSecondary,
      fontStyle: 'italic',
    },
    tileDate: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    tileDateText: {
      fontSize: 12,
      color: tokens.textSecondary,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginLeft: spacing.md,
      alignItems: 'center',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: 9999, // Fully rounded (pill shape)
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
      }),
    },
    chipHovered: {
      backgroundColor: '#dbeafe', // Light blue background
      borderColor: '#2563eb', // Darker blue border
    },
    chipText: {
      fontSize: 13,
      color: tokens.textSecondary,
    },
    chipTextHovered: {
      color: '#2563eb', // Darker blue text
    },
    tileConfidence: {
      marginTop: spacing.xs,
    },
    confidenceBars: {
      flexDirection: 'row',
      gap: 2,
      marginTop: 4,
    },
    confidenceBar: {
      height: 4,
      borderRadius: 2,
    },
    diagnosticsRow: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: tokens.border || '#e5e7eb',
    },
    diagnosticsTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: tokens.text,
      marginBottom: spacing.sm,
    },
    diagnosticsScroll: {
      flexGrow: 0,
    },
    diagnosticsChips: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    diagnosticChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    diagnosticChipText: {
      fontSize: 12,
      fontWeight: '500',
    },
    // Reading Tab Styles
    readingContent: {
      flex: 1,
    },
    readingSection: {
      marginBottom: spacing.xl,
    },
    readingSectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: tokens.text,
      marginBottom: spacing.sm,
      ...Platform.select({
        web: {
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    readingSectionText: {
      fontSize: 15,
      lineHeight: 24,
      color: tokens.text,
      ...Platform.select({
        web: {
          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    promptPanel: {
      backgroundColor: tokens.bgSubtle || '#f9fafb',
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
      alignItems: 'center',
    },
    promptText: {
      fontSize: 14,
      color: tokens.textSecondary,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    promptButton: {
      backgroundColor: tokens.accent || colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    promptButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
    bulletList: {
      gap: spacing.xs,
    },
    bulletItem: {
      fontSize: 15,
      lineHeight: 24,
      color: tokens.text,
      ...Platform.select({
        web: {
          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    linksStrip: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: tokens.border || '#e5e7eb',
    },
    linkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
      backgroundColor: tokens.bg || '#ffffff',
    },
    linkButtonText: {
      fontSize: 13,
      fontWeight: '500',
      color: tokens.text,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexShrink: 0,
    },
    headerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
      }),
    },
    headerButtonSecondary: {
      borderWidth: 1,
      backgroundColor: 'transparent',
    },
    headerButtonText: {
      fontSize: 13,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
    },
    headerButtonTextSecondary: {
      // Text color is set inline based on accent color
    },
    subjectsContainer: {
      gap: spacing.xl,
    },
    subjectGroup: {
      marginBottom: spacing.xl,
    },
    groupTitle: {
      fontSize: 18,
      fontWeight: '600',
      fontFamily: designTokens.fonts.display,
      marginBottom: spacing.md,
      color: tokens.text,
    },
    subjectsGrid: {
      flexDirection: 'column',
      gap: spacing.md,
    },
    subjectCard: {
      width: '100%',
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    subjectCardContent: {
      gap: spacing.sm,
      padding: spacing.md,
    },
    subjectHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.xs,
    },
    subjectHeaderLeft: {
      flex: 1,
      gap: spacing.xs,
    },
    subjectName: {
      fontSize: 18,
      fontWeight: '600',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
    },
    scopeBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    scopeBadgeText: {
      fontSize: 11,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    statusIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    subjectMetadata: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    assignedChildren: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    childAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#f3f4f6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    childAvatarText: {
      fontSize: 12,
      fontWeight: '600',
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
    },
    familyWideIndicator: {
      paddingHorizontal: spacing.xs,
    },
    familyWideText: {
      fontSize: 12,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    gradeText: {
      fontSize: 12,
      fontWeight: '400',
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    weeklyStats: {
      paddingHorizontal: spacing.xs,
    },
    weeklyStatsText: {
      fontSize: 12,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    cognitiveLoadTag: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    cognitiveLoadText: {
      fontSize: 11,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
    },
    quickActionsContainer: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    quickActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.sm,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
      }),
    },
    quickActionText: {
      fontSize: 12,
      fontWeight: '500',
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
    },
    insightRow: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
    },
    insightText: {
      fontSize: 13,
      fontFamily: designTokens.fonts.sans,
      fontStyle: 'italic',
      lineHeight: 18,
      color: tokens.textSecondary,
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
    },
    loadingText: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    emptyContainer: {
      padding: spacing.xl,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      textAlign: 'center',
      color: tokens.textSecondary,
    },
    // Mastery Charts Styles
    masterySection: {
      marginTop: spacing['2xl'],
    },
    masteryLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.xl,
    },
    masteryLoadingText: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    masteryCard: {
      backgroundColor: '#ffffff',
      borderRadius: radius.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
      overflow: 'hidden',
    },
    masteryCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    masteryCardTitle: {
      fontSize: 18,
      fontWeight: '700',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
      textTransform: 'uppercase',
      ...Platform.select({
        web: {
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    masteryCardSubtitle: {
      fontSize: 13,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    masteryCardContent: {
      padding: spacing.lg,
    },
    masteryChartContainer: {
      marginTop: spacing.sm,
    },
    masteryMetrics: {
      gap: spacing.md,
    },
    masteryMetric: {
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    masteryMetricLabel: {
      fontSize: 12,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
    },
    masteryMetricValue: {
      fontSize: 32,
      fontWeight: '700',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
    },
    masteryBars: {
      gap: spacing.sm,
    },
    masteryBar: {
      gap: spacing.xs,
    },
    masteryBarLabel: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    masteryBarText: {
      fontSize: 13,
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
      fontWeight: '500',
    },
    masteryBarCount: {
      fontSize: 13,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
      fontWeight: '600',
    },
    masteryBarTrack: {
      height: 8,
      backgroundColor: tokens.border || '#e5e7eb',
      borderRadius: 4,
      overflow: 'hidden',
    },
    masteryBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    masteryEmptyState: {
      alignItems: 'center',
      padding: spacing.xl,
      textAlign: 'center',
    },
    masteryEmpty: {
      padding: spacing.lg,
      alignItems: 'center',
    },
    masteryEmptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
      marginBottom: spacing.sm,
    },
    masteryEmptyText: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    masteryTip: {
      fontSize: 13,
      fontFamily: designTokens.fonts.sans,
      fontStyle: 'italic',
      color: tokens.textSecondary,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
      lineHeight: 18,
    },
    masteryTipLabel: {
      fontWeight: '600',
      fontStyle: 'italic',
    },
    // Attendance Styles (similar to mastery)
    attendanceSection: {
      marginTop: spacing.lg,
    },
    attendanceCard: {
      backgroundColor: '#ffffff',
      borderRadius: radius.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
      overflow: 'hidden',
    },
    attendanceCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    attendanceCardTitle: {
      fontSize: 18,
      fontWeight: '700',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
      textTransform: 'uppercase',
      ...Platform.select({
        web: {
          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }),
    },
    attendanceCardSubtitle: {
      fontSize: 13,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    attendanceCardContent: {
      padding: spacing.lg,
    },
    attendanceChartContainer: {
      marginTop: spacing.sm,
    },
    attendanceMetrics: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: spacing.lg,
    },
    attendanceMetric: {
      alignItems: 'center',
      flex: 1,
    },
    attendanceMetricLabel: {
      fontSize: 12,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
      fontWeight: '700',
    },
    attendanceMetricValue: {
      fontSize: 24,
      fontWeight: '700',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
    },
    attendanceBars: {
      gap: spacing.sm,
    },
    attendanceBar: {
      gap: spacing.xs,
    },
    attendanceBarLabel: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    attendanceBarText: {
      fontSize: 13,
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
      fontWeight: '500',
    },
    attendanceBarCount: {
      fontSize: 13,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
      fontWeight: '600',
    },
    attendanceBarTrack: {
      height: 8,
      backgroundColor: tokens.border || '#e5e7eb',
      borderRadius: 4,
      overflow: 'hidden',
    },
    attendanceBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    attendanceEmptyState: {
      alignItems: 'center',
      padding: spacing.xl,
      textAlign: 'center',
    },
    attendanceEmptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
      marginBottom: spacing.sm,
    },
    attendanceEmptyText: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    attendanceViewAllButton: {
      marginTop: spacing.md,
      padding: spacing.sm,
      alignItems: 'center',
    },
    attendanceViewAllText: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      color: tokens.accent || '#9333ea',
      fontWeight: '600',
    },
    // Activity Log Modal Styles
    activitySection: {
      backgroundColor: tokens.card || '#ffffff',
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
    },
    activitySectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border || '#e5e7eb',
    },
    activitySectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginLeft: spacing.sm,
    },
    activityItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xs,
      backgroundColor: tokens.background || '#f9fafb',
      borderRadius: radius.md,
    },
    weeklySummaryCard: {
      backgroundColor: tokens.card || '#ffffff',
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
    },
    weeklySummaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    weeklySummaryTitle: {
      fontSize: 16,
      fontWeight: '600',
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
    },
    weeklySummaryStats: {
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    weeklySummaryStat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    weeklySummaryStatText: {
      fontSize: 14,
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
    },
    weeklySummaryTotal: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: tokens.border || '#e5e7eb',
    },
    weeklySummaryTotalText: {
      fontSize: 15,
      fontWeight: '600',
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
    },
    attendanceStrip: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.lg,
    },
    attendanceDay: {
      alignItems: 'center',
      flex: 1,
      gap: spacing.xs,
    },
    attendanceDayDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    attendanceDayLabel: {
      fontSize: 10,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
      textTransform: 'uppercase',
    },
    timelineDayGroup: {
      marginBottom: spacing.xl,
    },
    timelineDayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border || '#e5e7eb',
    },
    timelineDayTitle: {
      fontSize: 14,
      fontWeight: '700',
      fontFamily: designTokens.fonts.display,
      color: tokens.text,
      marginLeft: spacing.sm,
    },
    timelineItem: {
      backgroundColor: tokens.card || '#ffffff',
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
    },
    timelineItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    timelineItemTitle: {
      fontSize: 15,
      fontWeight: '600',
      fontFamily: designTokens.fonts.sans,
      color: tokens.text,
      flex: 1,
    },
    timelineItemStatus: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.sm,
      marginLeft: spacing.sm,
    },
    timelineItemStatusText: {
      fontSize: 11,
      fontWeight: '600',
      fontFamily: designTokens.fonts.sans,
      textTransform: 'uppercase',
    },
    timelineItemMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    timelineItemContext: {
      fontSize: 12,
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
      fontStyle: 'italic',
      marginTop: spacing.xs,
    },
    collapsedSection: {
      marginBottom: spacing.lg,
    },
    collapsedSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      backgroundColor: tokens.background || '#f9fafb',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: tokens.border || '#e5e7eb',
    },
    collapsedSectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      fontFamily: designTokens.fonts.sans,
      color: tokens.textSecondary,
    },
    // PDF Modal Styles
    pdfModalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      ...Platform.select({
        web: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10000,
        },
      }),
    },
    pdfModalOverlayTouchable: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    pdfModalContainer: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      width: Platform.OS === 'web' ? '90%' : '100%',
      maxWidth: 1200,
      maxHeight: '85%',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 1,
      ...Platform.select({
        web: {
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
        },
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    pdfModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: '#ffffff',
    },
    pdfModalTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginRight: 16,
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    pdfModalActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    pdfModalButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: '#ffffff',
      ...Platform.select({
        web: { cursor: 'pointer' },
      }),
    },
    pdfModalButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.accent,
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    pdfModalCloseButton: {
      padding: 4,
      ...Platform.select({
        web: { cursor: 'pointer' },
      }),
    },
    pdfViewerContainer: {
      height: Platform.OS === 'web' ? 'calc(85vh - 80px)' : '100%',
      minHeight: 400,
      width: '100%',
    },
    pdfFallback: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
      gap: spacing.md,
    },
    pdfFallbackText: {
      fontSize: 14,
      color: tokens.textSecondary,
      textAlign: 'center',
    },
    // Lesson Plan List Modal Styles
    lessonPlanListContainer: {
      maxHeight: Platform.OS === 'web' ? 'calc(85vh - 80px)' : '100%',
      padding: spacing.md,
    },
    lessonPlanListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border || '#e5e7eb',
      backgroundColor: '#ffffff',
      width: '100%',
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'background-color 0.2s ease',
        },
      }),
    },
    lessonPlanListItemContent: {
      flex: 1,
      minWidth: 0,
      marginLeft: 12,
    },
    lessonPlanListItemTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    lessonPlanListItemTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: tokens.text,
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    lessonPlanListItemType: {
      fontSize: 14,
      color: tokens.textSecondary,
      fontWeight: '400',
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    lessonPlanListItemSubtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    lessonPlanChildDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      flexShrink: 0,
    },
    lessonPlanListItemSubtitle: {
      fontSize: 15,
      color: tokens.textSecondary,
      fontWeight: '400',
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    lessonPlanListItemDate: {
      fontSize: 14,
      color: tokens.textSecondary,
      marginLeft: 12,
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    syllabusListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border || '#e5e7eb',
      backgroundColor: '#ffffff',
      width: '100%',
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'background-color 0.2s ease',
        },
      }),
    },
    syllabusListItemContent: {
      flex: 1,
      minWidth: 0,
      marginLeft: 12,
    },
    syllabusListItemTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    syllabusListItemTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: tokens.text,
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    syllabusListItemType: {
      fontSize: 14,
      color: tokens.textSecondary,
      fontWeight: '400',
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    syllabusListItemSubtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    syllabusChildDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      flexShrink: 0,
    },
    syllabusListItemSubtitle: {
      fontSize: 15,
      color: tokens.textSecondary,
      fontWeight: '400',
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    syllabusListItemDate: {
      fontSize: 14,
      color: tokens.textSecondary,
      marginLeft: 12,
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // No Syllabus Modal Styles
    noSyllabusContent: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 200,
      width: '100%',
      paddingTop: spacing['5xl'],
      paddingBottom: spacing.xl,
      paddingHorizontal: spacing.xl,
    },
    noSyllabusText: {
      fontSize: 16,
      fontWeight: '700',
      color: tokens.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    noSyllabusSubtext: {
      fontSize: 14,
      color: tokens.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.sm,
      lineHeight: 20,
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    addSyllabusButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: 9999, // Fully rounded (pill shape)
      backgroundColor: '#000000',
      minWidth: 160,
      height: 44,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
      }),
    },
    addSyllabusButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#ffffff',
      textTransform: 'uppercase',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    noSyllabusButtonsRow: {
      flexDirection: 'row',
      gap: spacing.md,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    materialsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: 9999, // Fully rounded (pill shape)
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderColor: '#000000',
      minWidth: 160,
      height: 44,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
      }),
    },
    materialsButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#000000',
      textTransform: 'uppercase',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    noSyllabusModalContainer: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      width: Platform.OS === 'web' ? 'auto' : 'auto',
      maxWidth: 480,
      padding: spacing.xl,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 1,
      ...Platform.select({
        web: {
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
        },
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    syllabusListModalContainer: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      width: Platform.OS === 'web' ? '90%' : '90%',
      maxWidth: 600,
      maxHeight: '85%',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 1,
      ...Platform.select({
        web: {
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
        },
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: {
          elevation: 8,
        },
      }),
    },
  });
}

export default function PrintablePortfolioView({ childId, familyId, child, children = [], onOpenSettings, onOpenFeedback, onChildChange, backgroundColor, onTabChange, onEditChild }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const overviewStyles = createOverviewStyles(tokens);
  
  // Animated values for the fluid indicator
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(0)).current;
  const containerRef = useRef(null);
  const segmentPositions = useRef(new Map());
  
  // Get all children for the year planning wizard
  const allChildren = children.length > 0 ? children : (child ? [child] : []);
  
  // Default to first child alphabetically if no childId is selected
  const sortedChildren = [...children].sort((a, b) => {
    const nameA = (a.first_name || a.name || '').toLowerCase();
    const nameB = (b.first_name || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  const effectiveChildId = childId || (sortedChildren.length > 0 ? sortedChildren[0].id : null);
  
  // Animated value for avatar flip animation (must be after effectiveChildId is defined)
  const avatarFlipAnim = useRef(new Animated.Value(0)).current;
  const prevChildIdRef = useRef(effectiveChildId);
  // Refs to track current selected subjects for event listeners
  const selectedSubjectForSyllabusRef = useRef(null);
  const selectedSubjectForLessonPlanRef = useRef(null);
  
  // Initialize with cached data if available (using effectiveChildId)
  const getInitialSubjects = () => {
    if (effectiveChildId && familyId) {
      const key = `${effectiveChildId}-${familyId}`;
      const cached = profileOverviewCache.get(key);
      return cached?.subjects || [];
    }
    return [];
  };

  const initialSubjects = getInitialSubjects();
  const [subjects, setSubjects] = useState(initialSubjects);
  const [expandedSubjectId, setExpandedSubjectId] = useState(null);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showPlanYearWizard, setShowPlanYearWizard] = useState(false);
  // If we have cached data, mark as loaded so we show it immediately
  const [hasLoadedOnce, setHasLoadedOnce] = useState(initialSubjects.length > 0);
  const [activeTab, setActiveTab] = useState('chart'); // 'chart'
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [childPreferences, setChildPreferences] = useState(null);
  const [childStandards, setChildStandards] = useState([]);
  const [hoveredSubjectId, setHoveredSubjectId] = useState(null);
  const [hoveredChipId, setHoveredChipId] = useState(null);
  const [gradesByChild, setGradesByChild] = useState({});
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [showLessonPlanList, setShowLessonPlanList] = useState(false);
  const [lessonPlanMaterials, setLessonPlanMaterials] = useState([]);
  const [selectedSubjectForLessonPlan, setSelectedSubjectForLessonPlan] = useState(null);
  const [showSyllabusList, setShowSyllabusList] = useState(false);
  const [syllabusMaterials, setSyllabusMaterials] = useState([]);
  const [selectedSubjectForSyllabus, setSelectedSubjectForSyllabus] = useState(null);
  const [showNoSyllabusModal, setShowNoSyllabusModal] = useState(false);
  const [showNoLessonPlanModal, setShowNoLessonPlanModal] = useState(false);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [selectedSubjectForMaterial, setSelectedSubjectForMaterial] = useState(null);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [showProjectsList, setShowProjectsList] = useState(false);
  const [projectEvents, setProjectEvents] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedSubjectForProjects, setSelectedSubjectForProjects] = useState(null);
  const [showGradesList, setShowGradesList] = useState(false);
  const [gradesList, setGradesList] = useState([]);
  const [loadingGradesList, setLoadingGradesList] = useState(false);
  const [selectedSubjectForGrades, setSelectedSubjectForGrades] = useState(null);
  const [showPacingModal, setShowPacingModal] = useState(false);
  const [selectedSubjectForPacing, setSelectedSubjectForPacing] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  // Activity Log modal data
  const [activityEvents, setActivityEvents] = useState([]);
  const [loadingActivityEvents, setLoadingActivityEvents] = useState(false);
  const [portfolioUploads, setPortfolioUploads] = useState([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [goalsData, setGoalsData] = useState([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [showFullAttendanceLog, setShowFullAttendanceLog] = useState(false);
  const [showComplianceChecklist, setShowComplianceChecklist] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [showGenerateLogModal, setShowGenerateLogModal] = useState(false);
  const [logSamples, setLogSamples] = useState({
    lessons: [],
    activities: [],
    materials: [],
    assignments: []
  });
  const [loadingLogSamples, setLoadingLogSamples] = useState(false);
  // Helper to get default term label (matching planner format)
  const getDefaultTermLabel = () => {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const year = now.getFullYear();
    
    let termName = 'Fall Term';
    if (month >= 0 && month <= 4) termName = 'Spring Term'; // January - May
    else if (month >= 5 && month <= 7) termName = 'Summer Term'; // June - August
    else if (month >= 8 && month <= 11) termName = 'Fall Term'; // September - December
    
    let schoolYearStart = year;
    if (month >= 8) {
      schoolYearStart = year;
    } else {
      schoolYearStart = year - 1;
    }
    const schoolYearEnd = schoolYearStart + 1;
    const schoolYearShort = `${String(schoolYearStart).slice(-2)}/${String(schoolYearEnd).slice(-2)}`;
    
    return `${termName} ${schoolYearShort} School Year`;
  };

  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [transcriptData, setTranscriptData] = useState([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [showReportCardModal, setShowReportCardModal] = useState(false);
  const [reportCardData, setReportCardData] = useState([]);
  const [loadingReportCard, setLoadingReportCard] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState(getDefaultTermLabel());
  const [behaviorComment, setBehaviorComment] = useState('');
  const [availableTerms, setAvailableTerms] = useState([]);
  const [complianceStateCode, setComplianceStateCode] = useState('CA'); // Default to California
  const [complianceGrade, setComplianceGrade] = useState('6'); // Default grade
  const [complianceCoverage, setComplianceCoverage] = useState(92);
  const [complianceCredits, setComplianceCredits] = useState({ earned: 4.5, required: 6 });
  const [complianceData, setComplianceData] = useState([]);
  const [childStateCode, setChildStateCode] = useState(null);
  // Analytics data
  const [skillsData, setSkillsData] = useState([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [strengthsWeaknesses, setStrengthsWeaknesses] = useState([]);
  const [loadingStrengths, setLoadingStrengths] = useState(false);
  const [masteryOverTime, setMasteryOverTime] = useState([]);
  const [loadingMasteryTime, setLoadingMasteryTime] = useState(false);
  const [userRole, setUserRole] = useState('parent'); // Default to parent
  const [showAddGradeModal, setShowAddGradeModal] = useState(false);
  
  const [newGrade, setNewGrade] = useState({
    term_label: getDefaultTermLabel(),
    subject_id: null,
    grade: '',
    score: null,
    credits: null,
    notes: '',
  });

  // Trigger flip animation when child changes
  useEffect(() => {
    if (prevChildIdRef.current !== effectiveChildId && prevChildIdRef.current !== null) {
      // Flip animation - use useNativeDriver: false for web compatibility
      Animated.sequence([
        Animated.timing(avatarFlipAnim, {
          toValue: 1,
          duration: 150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false, // Changed to false for web compatibility
        }),
        Animated.timing(avatarFlipAnim, {
          toValue: 0,
          duration: 100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false, // Changed to false for web compatibility
        }),
      ]).start();
    }
    prevChildIdRef.current = effectiveChildId;
  }, [effectiveChildId]);

  // Load child preferences and standards
  useEffect(() => {
    if (effectiveChildId && familyId) {
      const loadChildData = async () => {
        try {
          // Load child preferences (try child_prefs first, then child_learner_profile)
          const [prefsResult, learnerProfileResult] = await Promise.all([
            supabase
              .from('child_prefs')
              .select('*')
              .eq('child_id', effectiveChildId)
              .single(),
            supabase
              .from('child_learner_profile')
              .select('*')
              .eq('child_id', effectiveChildId)
              .single()
          ]);
          
          // Combine preferences from both sources
          const prefs = prefsResult.data || {};
          const profile = learnerProfileResult.data || {};
          
          // Merge interests and learning style from both sources
          const combinedPrefs = {
            ...prefs,
            interests: profile.interests && profile.interests.length > 0 
              ? profile.interests.join(', ') 
              : (prefs.interests || null),
            learning_style: profile.learning_preferences?.style 
              || prefs.learning_style 
              || null,
          };
          
          setChildPreferences(combinedPrefs);

          // Load state standards preferences for this child
          const { data: standardsPrefsData } = await supabase
            .from('user_standards_preferences')
            .select('state_code, grade_level, standards_set')
            .eq('child_id', effectiveChildId)
            .eq('is_active', true);
          
          setChildStandards(standardsPrefsData || []);
        } catch (error) {
          console.warn('[PrintablePortfolioView] Error loading child data:', error);
          setChildPreferences(null);
          setChildStandards([]);
        }
      };
      
      loadChildData();
    } else {
      setChildPreferences(null);
      setChildStandards([]);
    }
  }, [effectiveChildId, familyId]);

  // Load child's state from database - use standards or standards_state field (same as Edit Child modal)
  useEffect(() => {
    if (effectiveChildId) {
      const loadChildState = async () => {
        try {
          const { data, error } = await supabase
            .from('children')
            .select('state_code, state, standards, standards_state')
            .eq('id', effectiveChildId)
            .single();
          
          if (!error && data) {
            // Use standards_state or standards field (same as Edit Child modal uses)
            const state = data.standards || data.standards_state || data.state_code || data.state || null;
            setChildStateCode(state);
          }
        } catch (error) {
          console.warn('[PrintablePortfolioView] Error loading child state:', error);
          setChildStateCode(null);
        }
      };
      
      loadChildState();
    } else {
      setChildStateCode(null);
    }
  }, [effectiveChildId]);

  useEffect(() => {
    if (familyId && effectiveChildId) {
      // Load fresh data immediately for the effective child
      loadCurrentSubjects();
    }
  }, [effectiveChildId, familyId, children]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize compliance checklist if it doesn't exist for this child/state
  // This ensures state-specific requirements are loaded from the database
  useEffect(() => {
    const initializeComplianceChecklist = async () => {
      if (!effectiveChildId || !familyId || !complianceData) return;

      // Determine child's state
      const effectiveChild = child || sortedChildren.find(c => c.id === effectiveChildId);
      if (!effectiveChild) return;

      const childState = effectiveChild.standards || effectiveChild.standards_state || effectiveChild.state_code || effectiveChild.state || childStateCode || complianceStateCode || 'CA';
      
      // Check if items already exist for this child/state
      const existingItems = (complianceData || []).filter(item => 
        item.child_id === effectiveChildId && 
        item.state_code === childState
      );
      
      if (existingItems.length > 0) {
        return; // Already initialized
      }

      try {
        // Get state requirements from database
        const { data: stateRequirements, error: reqError } = await supabase
          .from('state_requirements')
          .select('*')
          .eq('state_code', childState)
          .eq('is_common', true);

        if (reqError) {
          console.warn('[Compliance] Error fetching state requirements:', reqError);
          return;
        }

        // Also get generic US requirements if no state-specific ones found
        let requirements = stateRequirements || [];
        if (requirements.length === 0 && childState !== 'US') {
          const { data: usRequirements } = await supabase
            .from('state_requirements')
            .select('*')
            .eq('state_code', 'US')
            .eq('is_common', true);
          requirements = usRequirements || [];
        }

        if (requirements.length > 0) {
          // Create checklist items
          const checklistItems = requirements.map(req => ({
            family_id: familyId,
            child_id: effectiveChildId,
            state_code: childState,
            requirement_id: req.id,
            status: 'pending',
          }));

          const { error: insertError } = await supabase
            .from('family_compliance_checklist')
            .insert(checklistItems);

          if (insertError && !insertError.message.includes('duplicate') && !insertError.message.includes('unique')) {
            console.warn('[Compliance] Error initializing checklist:', insertError);
          } else if (!insertError) {
            // Reload compliance data after initialization
            const { data: reloadedData } = await supabase
              .from('family_compliance_checklist')
              .select('id, child_id, status, requirement_id, requirement:state_requirements(id, requirement_type, requirement_title, requirement_description, is_common, state_code), completed_at, notes, evidence_upload_ids')
              .eq('family_id', familyId);
            
            if (reloadedData) {
              setComplianceData(reloadedData);
            }
          }
        }
      } catch (error) {
        console.warn('[Compliance] Error initializing checklist:', error);
      }
    };

    initializeComplianceChecklist();
  }, [effectiveChildId, familyId, complianceData?.length, child, sortedChildren, childStateCode, complianceStateCode]);

  // Load grades for all children to show mastery charts
  useEffect(() => {
    if (familyId && children && children.length > 0) {
      loadGradesForAllChildren();
    }
  }, [familyId, children]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch user role
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;
        
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();
        
        if (profileData) {
          setUserRole(profileData.role || 'parent');
        }
      } catch (error) {
        console.warn('[PrintablePortfolioView] Error fetching user role:', error);
        setUserRole('parent'); // Default fallback
      }
    };
    fetchUserRole();
  }, []);

  const loadAttendanceData = async () => {
    if (!familyId || !effectiveChildId) return;
    
    setLoadingAttendance(true);
    try {
      // Load attendance for last 90 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 90);
      
      const { data: attendanceRecords, error } = await supabase
        .from('attendance_records')
        .select('id, child_id, day_date, minutes, status, note')
        .eq('family_id', familyId)
        .eq('child_id', effectiveChildId)
        .gte('day_date', startDate.toISOString().split('T')[0])
        .lte('day_date', endDate.toISOString().split('T')[0])
        .order('day_date', { ascending: false });

      if (error) throw error;

      setAttendanceData(attendanceRecords || []);
    } catch (error) {
      console.warn('[PrintablePortfolioView] Error loading attendance:', error);
      setAttendanceData([]);
    } finally {
      setLoadingAttendance(false);
    }
  };

  // Load attendance when child changes
  useEffect(() => {
    if (familyId && effectiveChildId) {
      loadAttendanceData();
    }
  }, [familyId, effectiveChildId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load goals for Grades & Goals container
  const loadGoalsData = async () => {
    if (!effectiveChildId || !familyId) return;
    
    setLoadingGoals(true);
    try {
      // Load from goals table
      const [goalsResult, subjectGoalsResult] = await Promise.all([
        supabase
          .from('goals')
          .select('*')
          .eq('child_id', effectiveChildId)
          .eq('family_id', familyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('subject_goals')
          .select(`
            *,
            subject:subject_id (id, name)
          `)
          .eq('child_id', effectiveChildId)
          .eq('is_active', true)
          .order('priority', { ascending: false })
      ]);
      
      const goals = [];
      
      // Add goals from goals table
      if (goalsResult.data && !goalsResult.error) {
        goals.push(...goalsResult.data.map(g => ({
          ...g,
          source: 'goals_table'
        })));
      }
      
      // Add goals from subject_goals table (convert to goals format)
      if (subjectGoalsResult.data && !subjectGoalsResult.error) {
        goals.push(...subjectGoalsResult.data.map(sg => ({
          id: sg.id,
          child_id: sg.child_id,
          subject_id: sg.subject_id,
          title: `${sg.subject?.name || 'Subject'} - ${sg.minutes_per_week || 0} min/week`,
          description: `Weekly goal: ${sg.minutes_per_week || 0} minutes`,
          target_date: null,
          created_at: sg.created_at,
          source: 'subject_goals_table'
        })));
      }
      
      setGoalsData(goals);
    } catch (error) {
      console.warn('[PrintablePortfolioView] Error loading goals:', error);
      setGoalsData([]);
    } finally {
      setLoadingGoals(false);
    }
  };

  // Load goals when child changes
  useEffect(() => {
    if (effectiveChildId && familyId) {
      loadGoalsData();
    }
  }, [effectiveChildId, familyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load activity log data when modal opens
  const loadActivityLogData = async () => {
    if (!effectiveChildId || !familyId) return;

    // Load events/lessons timeline (last 30 days)
    setLoadingActivityEvents(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30);
      
      const events = await getPortfolioTimelineEvents(
        effectiveChildId,
        startDate.toISOString(),
        endDate.toISOString()
      );
      setActivityEvents(events || []);
    } catch (error) {
      console.warn('[PrintablePortfolioView] Error loading activity events:', error);
      setActivityEvents([]);
    } finally {
      setLoadingActivityEvents(false);
    }

    // Load portfolio uploads
    setLoadingPortfolio(true);
    try {
      const uploads = await getPortfolioUploads(effectiveChildId);
      setPortfolioUploads(uploads || []);
    } catch (error) {
      console.warn('[PrintablePortfolioView] Error loading portfolio uploads:', error);
      setPortfolioUploads([]);
    } finally {
      setLoadingPortfolio(false);
    }
  };

  // Load activity log data when modal opens
  useEffect(() => {
    if (showAttendanceModal && effectiveChildId && familyId) {
      loadActivityLogData();
    }
  }, [showAttendanceModal, effectiveChildId, familyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load report card data for the selected child and term
  const loadReportCardData = async () => {
    if (!effectiveChildId || !familyId || !selectedTerm) return;
    
    setLoadingReportCard(true);
    try {
      // Helper to convert grade to numeric value (same as Grades & Goals)
      const gradeToNumeric = (grade) => {
        if (!grade) return null;
        if (typeof grade === 'number') return grade;
        if (typeof grade === 'string') {
          const percentMatch = grade.match(/(\d+(?:\.\d+)?)%/);
          if (percentMatch) return parseFloat(percentMatch[1]);
          const letterGrade = grade.toUpperCase().trim();
          if (letterGrade === 'A' || letterGrade === 'A+') return 95;
          if (letterGrade === 'A-') return 90;
          if (letterGrade === 'B' || letterGrade === 'B+') return 85;
          if (letterGrade === 'B-') return 80;
          if (letterGrade === 'C' || letterGrade === 'C+') return 75;
          if (letterGrade === 'C-') return 70;
          if (letterGrade === 'D' || letterGrade === 'D+') return 65;
          if (letterGrade === 'D-') return 60;
          if (letterGrade === 'F') return 55;
          const num = parseFloat(grade);
          if (!isNaN(num)) return num;
        }
        return null;
      };

      // Convert numeric grade back to letter grade (same as Grades & Goals)
      const numericToLetterGrade = (numeric) => {
        if (numeric === null || numeric === undefined || isNaN(numeric)) return null;
        if (numeric >= 97) return 'A+';
        if (numeric >= 93) return 'A';
        if (numeric >= 90) return 'A-';
        if (numeric >= 87) return 'B+';
        if (numeric >= 83) return 'B';
        if (numeric >= 80) return 'B-';
        if (numeric >= 77) return 'C+';
        if (numeric >= 73) return 'C';
        if (numeric >= 70) return 'C-';
        if (numeric >= 67) return 'D+';
        if (numeric >= 63) return 'D';
        if (numeric >= 60) return 'D-';
        return 'F';
      };

      // Query grades table (filtered by term)
      const { data: gradesData, error: gradesError } = await supabase
        .from('grades')
        .select(`
          id,
          subject_id,
          term_label,
          score,
          grade,
          notes,
          created_at,
          subject:subject_id (id, name)
        `)
        .eq('child_id', effectiveChildId)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });

      if (gradesError) {
        console.error('[PrintablePortfolioView] Error loading grades for report card:', gradesError);
      }

      // Filter by term label
      const filteredGradesTable = (gradesData || []).filter(grade => {
        if (grade.term_label === selectedTerm) return true;
        if (!grade.term_label && selectedTerm === getDefaultTermLabel()) return true;
        return false;
      });

      // Query events table for grades (same as Grades & Goals does)
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, child_id, subject_id, grade, created_at, updated_at')
        .eq('family_id', familyId)
        .eq('child_id', effectiveChildId)
        .not('grade', 'is', null)
        .neq('grade', '')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (eventsError) {
        console.warn('[PrintablePortfolioView] Error loading events for report card:', eventsError);
      }

      // Convert events to grade format
      const gradesFromEvents = (eventsData || []).map(event => ({
        id: `event-${event.id}`,
        child_id: event.child_id,
        subject_id: event.subject_id,
        grade: event.grade,
        score: null,
        created_at: event.updated_at || event.created_at || new Date().toISOString(),
        source: 'events_table'
      }));

      // Combine grades from both sources
      const allGrades = [
        ...filteredGradesTable.map(g => ({ ...g, source: 'grades_table' })),
        ...gradesFromEvents
      ];

      // Fetch subject names
      const subjectIds = [...new Set(allGrades.map(g => g.subject_id).filter(Boolean))];
      const subjectMap = {};
      if (subjectIds.length > 0) {
        const { data: subjectsData } = await supabase
          .from('subject')
          .select('id, name')
          .eq('family_id', familyId)
          .in('id', subjectIds);
        
        (subjectsData || []).forEach(s => { subjectMap[s.id] = s.name; });
      }

      // Group by subject and calculate average (same logic as Grades & Goals)
      const subjectAverages = {};
      subjectIds.forEach(subjectId => {
        const subjectGrades = allGrades.filter(g => String(g.subject_id || '') === String(subjectId || ''));
        if (subjectGrades.length === 0) return;

        // Convert all grades to numeric values
        const numericGrades = subjectGrades.map(g => {
          const num = gradeToNumeric(g.grade) || gradeToNumeric(g.score);
          return num;
        }).filter(n => n !== null);

        if (numericGrades.length === 0) {
          // If no numeric grades, use most recent grade as-is
          const sorted = subjectGrades.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          subjectAverages[subjectId] = sorted[0].grade || sorted[0].score || null;
        } else {
          // Calculate average and convert back to letter grade
          const average = numericGrades.reduce((sum, n) => sum + n, 0) / numericGrades.length;
          subjectAverages[subjectId] = numericToLetterGrade(average);
        }
      });

      // Format for display
      const formattedGrades = Object.entries(subjectAverages).map(([subjectId, averageGrade]) => ({
        id: `subject-${subjectId}`,
        subjectId,
        subjectName: subjectMap[subjectId] || 'Unknown Subject',
        grade: averageGrade || '-',
      }));

      console.log('[PrintablePortfolioView] Report card data:', {
        gradesFromTable: filteredGradesTable.length,
        gradesFromEvents: gradesFromEvents.length,
        totalGrades: allGrades.length,
        subjectAverages: formattedGrades.length
      });

      setReportCardData(formattedGrades);

      // Load behavior comment if it exists (stored in localStorage for now)
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const savedComment = localStorage.getItem(`report_card_comment_${effectiveChildId}_${selectedTerm}`);
        if (savedComment) {
          setBehaviorComment(savedComment);
        } else {
          setBehaviorComment('');
        }
      }
    } catch (error) {
      console.error('[PrintablePortfolioView] Error loading report card data:', error);
      setReportCardData([]);
    } finally {
      setLoadingReportCard(false);
    }
  };

  // Load available terms for the child
  const loadAvailableTerms = async () => {
    if (!effectiveChildId || !familyId) return;
    
    try {
      const { data: gradesData } = await supabase
        .from('grades')
        .select('term_label')
        .eq('child_id', effectiveChildId)
        .eq('family_id', familyId);

      // Get all term labels (including null ones for fallback)
      const uniqueTerms = [...new Set((gradesData || []).map(g => g.term_label).filter(Boolean))];
      uniqueTerms.sort().reverse(); // Most recent first
      
      // Add current default term if not already in list
      const defaultTerm = getDefaultTermLabel();
      if (!uniqueTerms.includes(defaultTerm)) {
        uniqueTerms.unshift(defaultTerm);
      }
      
      // If no terms found, use default term
      if (uniqueTerms.length === 0) {
        uniqueTerms.push(defaultTerm);
      }
      
      console.log('[PrintablePortfolioView] Available terms:', uniqueTerms);
      setAvailableTerms(uniqueTerms);
    } catch (error) {
      console.error('[PrintablePortfolioView] Error loading available terms:', error);
      setAvailableTerms([getDefaultTermLabel()]);
    }
  };

  // Save behavior comment
  const saveBehaviorComment = async () => {
    if (!effectiveChildId || !selectedTerm) return;
    
    try {
      // For now, save to localStorage - can be enhanced to store in database later
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(`report_card_comment_${effectiveChildId}_${selectedTerm}`, behaviorComment);
        Alert.alert('Success', 'Behavior comment saved.');
      }
    } catch (error) {
      console.error('[PrintablePortfolioView] Error saving behavior comment:', error);
      Alert.alert('Error', 'Failed to save behavior comment.');
    }
  };

  // Load transcript data for the selected child
  const loadTranscriptData = async () => {
    if (!effectiveChildId || !familyId) return;
    
    setLoadingTranscript(true);
    try {
      // Fetch all events for the child with subject_id and grades
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, subject_id, start_ts, end_ts, grade, event_type, description')
        .eq('family_id', familyId)
        .eq('child_id', effectiveChildId)
        .not('subject_id', 'is', null)
        .is('deleted_at', null)
        .order('start_ts', { ascending: true });

      if (eventsError) {
        console.error('[PrintablePortfolioView] Error loading events for transcript:', eventsError);
        setTranscriptData([]);
        return;
      }

      // Fetch all subjects for mapping
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId);

      const subjectMap = new Map((subjectsData || []).map(s => [s.id, s.name]));

      // Group events by subject
      const coursesMap = new Map();
      
      (eventsData || []).forEach(event => {
        const subjectId = event.subject_id;
        const subjectName = subjectMap.get(subjectId) || 'Unknown Subject';
        
        if (!coursesMap.has(subjectId)) {
          coursesMap.set(subjectId, {
            subjectId,
            subjectName,
            events: [],
            grades: [],
            startDate: null,
            endDate: null,
          });
        }
        
        const course = coursesMap.get(subjectId);
        course.events.push(event);
        
        if (event.grade) {
          course.grades.push(event.grade);
        }
        
        // Track date range
        if (event.start_ts) {
          const startDate = new Date(event.start_ts);
          if (!course.startDate || startDate < course.startDate) {
            course.startDate = startDate;
          }
        }
        
        if (event.end_ts) {
          const endDate = new Date(event.end_ts);
          if (!course.endDate || endDate > course.endDate) {
            course.endDate = endDate;
          }
        } else if (event.start_ts) {
          // Use start_ts as fallback for endDate
          const startDate = new Date(event.start_ts);
          if (!course.endDate || startDate > course.endDate) {
            course.endDate = startDate;
          }
        }
      });

      // Convert to array and format for display
      const courses = Array.from(coursesMap.values()).map(course => {
        // Calculate average grade if multiple grades exist
        let finalGrade = null;
        if (course.grades.length > 0) {
          // For now, use the latest grade or average if numeric
          finalGrade = course.grades[course.grades.length - 1];
        }

        // Format dates
        const startDateStr = course.startDate 
          ? course.startDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : null;
        const endDateStr = course.endDate
          ? course.endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : null;

        return {
          subjectName: course.subjectName,
          startDate: startDateStr,
          endDate: endDateStr,
          dateRange: startDateStr && endDateStr ? `${startDateStr} - ${endDateStr}` : (startDateStr || endDateStr || 'Date not specified'),
          grade: finalGrade,
          credit: null, // TODO: Calculate credit if needed
        };
      });

      // Sort by subject name
      courses.sort((a, b) => a.subjectName.localeCompare(b.subjectName));

      setTranscriptData(courses);
    } catch (error) {
      console.error('[PrintablePortfolioView] Error loading transcript data:', error);
      setTranscriptData([]);
    } finally {
      setLoadingTranscript(false);
    }
  };

  // Load log samples for compliance log generation
  const loadLogSamples = async () => {
    if (!effectiveChildId || !familyId) return;
    
    setLoadingLogSamples(true);
    try {
      // Helper function to filter events by child
      // Note: For now we only filter by child_id since child_ids might not be in the select
      const filterEventsByChild = (events) => {
        return (events || []).filter(event => 
          event.child_id === effectiveChildId
        );
      };

      // Load ALL events for the family (avoid query syntax issues), then filter in JavaScript
      // Try with just child_id first, then we'll handle child_ids separately if needed
      const { data: allEventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, description, subject_id, unit, grade, start_ts, child_id, event_type')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .order('start_ts', { ascending: false })
        .limit(200); // Reduced limit to avoid query issues

      let lessonsData = [];
      let activitiesData = [];
      let assignmentsData = [];

      if (eventsError) {
        console.error('[PrintablePortfolioView] Error loading events:', eventsError);
      } else {
        // Filter events by child and type in JavaScript
        const allEvents = allEventsData || [];
        const childEvents = filterEventsByChild(allEvents);
        
        const lessonsFiltered = childEvents
          .filter(e => e.event_type === 'Lesson')
          .slice(0, 20);
        
        const activitiesFiltered = childEvents
          .filter(e => e.event_type === 'Activity')
          .slice(0, 15);
        
        const assignmentsFiltered = childEvents
          .filter(e => ['Project', 'Exam', 'Assignment', 'Assessment'].includes(e.event_type))
          .slice(0, 15);
        
        // Fetch subject names for all events
        const allSubjectIds = [...new Set([
          ...lessonsFiltered.map(l => l.subject_id),
          ...activitiesFiltered.map(a => a.subject_id),
          ...assignmentsFiltered.map(a => a.subject_id)
        ].filter(Boolean))];
        
        const subjectMap = {};
        if (allSubjectIds.length > 0) {
          const { data: subjectsData } = await supabase
            .from('subject')
            .select('id, name')
            .in('id', allSubjectIds);
          (subjectsData || []).forEach(s => { subjectMap[s.id] = s; });
        }
        
        lessonsData = lessonsFiltered.map(lesson => ({
          ...lesson,
          notes: lesson.description || lesson.notes || '', // Map description to notes for modal display
          subject: lesson.subject_id ? subjectMap[lesson.subject_id] : null
        }));
        
        activitiesData = activitiesFiltered.map(activity => ({
          ...activity,
          notes: activity.description || activity.notes || '', // Map description to notes for modal display
          subject: activity.subject_id ? subjectMap[activity.subject_id] : null
        }));
        
        assignmentsData = assignmentsFiltered.map(assignment => ({
          ...assignment,
          notes: assignment.description || assignment.notes || '', // Map description to notes for modal display
          subject: assignment.subject_id ? subjectMap[assignment.subject_id] : null
        }));
      }

      // Load materials connected to this child via material_children table
      // First get material IDs for this child
      const { data: materialChildrenData } = await supabase
        .from('material_children')
        .select('material_id')
        .eq('child_id', effectiveChildId)
        .eq('family_id', familyId);

      const materialIds = materialChildrenData?.map(mc => mc.material_id) || [];

      let materialsData = [];
      if (materialIds.length > 0) {
        const { data: materials, error: materialsError } = await supabase
          .from('materials')
          .select(`
            id,
            title,
            type,
            subject_id,
            created_at
          `)
          .eq('family_id', familyId)
          .in('id', materialIds)
          .order('created_at', { ascending: false })
          .limit(20);

        if (materialsError) {
          console.error('[PrintablePortfolioView] Error loading materials:', materialsError);
        } else {
          // Fetch subject names for materials
          const materialSubjectIds = [...new Set((materials || []).map(m => m.subject_id).filter(Boolean))];
          const materialSubjectMap = {};
          if (materialSubjectIds.length > 0) {
            const { data: materialSubjectsData } = await supabase
              .from('subject')
              .select('id, name')
              .in('id', materialSubjectIds);
            (materialSubjectsData || []).forEach(s => { materialSubjectMap[s.id] = s; });
          }
          
          materialsData = (materials || []).map(material => ({
            ...material,
            subject: material.subject_id ? materialSubjectMap[material.subject_id] : null
          }));
        }
      }

      console.log('[PrintablePortfolioView] Loaded log samples:', {
        lessons: lessonsData.length,
        activities: activitiesData.length,
        assignments: assignmentsData.length,
        materials: materialsData.length,
        totalEvents: allEventsData?.length || 0,
        hasError: !!eventsError
      });

      setLogSamples({
        lessons: lessonsData,
        activities: activitiesData,
        materials: materialsData,
        assignments: assignmentsData
      });
    } catch (error) {
      console.error('[PrintablePortfolioView] Error loading log samples:', error);
      setLogSamples({
        lessons: [],
        activities: [],
        materials: [],
        assignments: []
      });
    } finally {
      setLoadingLogSamples(false);
    }
  };

  // Load analytics data when child changes and has enough grades
  const loadAnalyticsData = async () => {
    if (!familyId || !effectiveChildId) return;
    
    const childGrades = gradesByChild[effectiveChildId] || [];
    const hasEnoughData = childGrades.length >= 20;
    
    if (!hasEnoughData) {
      setSkillsData([]);
      setStrengthsWeaknesses([]);
      setMasteryOverTime([]);
      return;
    }

    // Load skills overview (learning map)
    setLoadingSkills(true);
    try {
      const { data, error } = await getSkillGraph(effectiveChildId, { days_back: 365 });
      if (error) throw error;
      setSkillsData(data || []);
    } catch (error) {
      console.warn('[PrintablePortfolioView] Error loading skills:', error);
      setSkillsData([]);
    } finally {
      setLoadingSkills(false);
    }

    // Load strengths & weaknesses
    setLoadingStrengths(true);
    try {
      const { data, error } = await getStrengthsWeaknesses(effectiveChildId);
      if (error) throw error;
      setStrengthsWeaknesses(data || []);
    } catch (error) {
      console.warn('[PrintablePortfolioView] Error loading strengths/weaknesses:', error);
      setStrengthsWeaknesses([]);
    } finally {
      setLoadingStrengths(false);
    }

    // Load mastery over time (heatmap)
    setLoadingMasteryTime(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 180);
      
      const { data, error } = await getSkillHeatmap(effectiveChildId, {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        group_by: 'week'
      });
      if (error) throw error;
      setMasteryOverTime(data || []);
    } catch (error) {
      console.warn('[PrintablePortfolioView] Error loading mastery over time:', error);
      setMasteryOverTime([]);
    } finally {
      setLoadingMasteryTime(false);
    }
  };

  useEffect(() => {
    if (familyId && effectiveChildId && Object.keys(gradesByChild).length > 0) {
      loadAnalyticsData();
    }
  }, [familyId, effectiveChildId, gradesByChild]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for event deletions to refresh subjects data (including Projects chip)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleEventDeleted = async (event) => {
      const deletedEventId = event.detail?.eventId || event.detail?.id;
      if (!deletedEventId) return;
      
      console.log('[PrintablePortfolioView] Event deleted, refreshing subjects data:', deletedEventId);
      
      // Clear cache to ensure fresh data is loaded
      if (effectiveChildId && familyId) {
        const cacheKey = `${effectiveChildId}-${familyId}`;
        profileOverviewCache.delete(cacheKey);
      }
      
      // Refresh subjects data to update hasProjects flag
      if (familyId && effectiveChildId) {
        await loadCurrentSubjects();
      }
      
      // Refresh grades list if modal is open
      if (showGradesList && selectedSubjectForGrades && familyId && effectiveChildId) {
        // Refresh by calling handleOpenGrades with the current subject
        // Note: handleOpenGrades is defined in the component, so we can call it here
        // eslint-disable-next-line react-hooks/exhaustive-deps
        handleOpenGrades(selectedSubjectForGrades).catch(error => {
          console.error('[PrintablePortfolioView] Error refreshing grades list:', error);
        });
      }
    };
    
    window.addEventListener('eventDeleted', handleEventDeleted);
    
    return () => {
      window.removeEventListener('eventDeleted', handleEventDeleted);
    };
  }, [familyId, effectiveChildId, showGradesList, selectedSubjectForGrades]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for event updates to refresh grades list
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleEventUpdated = async () => {
      console.log('[PrintablePortfolioView] Event updated, refreshing grades list if modal is open');
      
      // Refresh grades list if modal is open - call handleOpenGrades directly
      if (showGradesList && selectedSubjectForGrades && familyId && effectiveChildId) {
        // Refresh by calling handleOpenGrades with the current subject
        // Note: handleOpenGrades is defined in the component, so we can call it here
        // eslint-disable-next-line react-hooks/exhaustive-deps
        handleOpenGrades(selectedSubjectForGrades).catch(error => {
          console.error('[PrintablePortfolioView] Error refreshing grades on event update:', error);
        });
      }
    };
    
    window.addEventListener('refreshCalendar', handleEventUpdated);
    window.addEventListener('eventUpdated', handleEventUpdated);
    
    return () => {
      window.removeEventListener('refreshCalendar', handleEventUpdated);
      window.removeEventListener('eventUpdated', handleEventUpdated);
    };
  }, [showGradesList, selectedSubjectForGrades, familyId, effectiveChildId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for material updates/deletions to refresh syllabus and lesson plan lists
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleMaterialUpdated = async () => {
      console.log('[PrintablePortfolioView] Material updated/deleted, refreshing subjects and lists');
      
      // Clear cache to ensure fresh data is loaded
      if (effectiveChildId && familyId) {
        const cacheKey = `${effectiveChildId}-${familyId}`;
        profileOverviewCache.delete(cacheKey);
      }
      
      // Refresh subjects data to update hasSyllabus/hasLessonPlan flags and materials
      if (familyId && effectiveChildId) {
        await loadCurrentSubjects();
      }
      
      // Refresh syllabus list if modal is open - use refs to get latest values
      const currentSyllabusSubject = selectedSubjectForSyllabusRef.current;
      if (showSyllabusList && currentSyllabusSubject) {
        handleOpenSyllabusMaterials(currentSyllabusSubject).catch(error => {
          console.error('[PrintablePortfolioView] Error refreshing syllabus list:', error);
        });
      }
      
      // Refresh lesson plan list if modal is open - use refs to get latest values
      const currentLessonPlanSubject = selectedSubjectForLessonPlanRef.current;
      if (showLessonPlanList && currentLessonPlanSubject) {
        handleOpenLessonPlan(currentLessonPlanSubject).catch(error => {
          console.error('[PrintablePortfolioView] Error refreshing lesson plan list:', error);
        });
      }
    };
    
    // Listen for material-related events
    window.addEventListener('materialDeleted', handleMaterialUpdated);
    window.addEventListener('materialUpdated', handleMaterialUpdated);
    window.addEventListener('materialMoved', handleMaterialUpdated);
    // Also listen for general refresh events that might include material updates
    window.addEventListener('refreshMaterials', handleMaterialUpdated);
    window.addEventListener('refreshCalendar', handleMaterialUpdated); // Materials can be attached to events
    
    return () => {
      window.removeEventListener('materialDeleted', handleMaterialUpdated);
      window.removeEventListener('materialUpdated', handleMaterialUpdated);
      window.removeEventListener('materialMoved', handleMaterialUpdated);
      window.removeEventListener('refreshMaterials', handleMaterialUpdated);
      window.removeEventListener('refreshCalendar', handleMaterialUpdated);
    };
  }, [familyId, effectiveChildId, showSyllabusList, showLessonPlanList]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddGrade = async () => {
    if (!effectiveChildId || !familyId) {
      Alert.alert('Error', 'Please select a child to add a grade for.');
      return;
    }

    if (!newGrade.grade && !newGrade.score) {
      Alert.alert('Error', 'Please enter either a grade or a score.');
      return;
    }

    try {
      await addGrade({
        child_id: effectiveChildId,
        subject_id: newGrade.subject_id || null,
        term_label: newGrade.term_label || null,
        grade: newGrade.grade || null,
        score: newGrade.score || null,
        credits: newGrade.credits || null,
        notes: newGrade.notes || null,
      });

      // Reset form
      setNewGrade({
        term_label: getDefaultTermLabel(),
        subject_id: null,
        grade: '',
        score: null,
        credits: null,
        notes: '',
      });
      setShowAddGradeModal(false);

      // Reload grades
      await loadGradesForAllChildren();

      Alert.alert('Success', 'Grade added successfully!');
    } catch (error) {
      console.error('[PrintablePortfolioView] Error adding grade:', error);
      Alert.alert('Error', error.message || 'Failed to add grade. Please try again.');
    }
  };

  const loadGradesForAllChildren = async () => {
    if (!familyId || !children || children.length === 0) return;
    
    setLoadingGrades(true);
    try {
      const childIds = children.map(c => c.id);
      
      // Load from grades table
      const { data: gradesData, error: gradesError } = await supabase
        .from('grades')
        .select(`
          id,
          child_id,
          grade,
          score,
          subject_id,
          created_at,
          subject:subject_id (id, name)
        `)
        .in('child_id', childIds)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });

      // Load from events table (grades stored directly on events)
      // Query events for each child individually to avoid RLS/complexity issues
      // Filter for events with grades in memory to avoid query syntax issues
      const eventsWithGradesPromises = childIds.map(async (cid) => {
        const { data, error } = await supabase
          .from('events')
          .select('id, title, child_id, child_ids, subject_id, grade, created_at, updated_at')
          .eq('family_id', familyId)
          .eq('child_id', cid)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        
        if (error) {
          console.warn(`[Grades & Goals] Error loading events for child ${cid}:`, error);
          return [];
        }
        // Filter to only events with grades
        return (data || []).filter(e => e.grade != null && e.grade !== '');
      });
      
      const eventsResults = await Promise.all(eventsWithGradesPromises);
      const eventsData = eventsResults.flat();

      if (gradesError) {
        console.warn('[PrintablePortfolioView] Error loading grades from grades table:', gradesError);
      }
      

      // Convert events with grades to grade format
      // Events are already filtered by child_id and have grades (not null)
      const gradesFromEvents = eventsData.map(event => ({
        id: `event-${event.id}`,
        child_id: event.child_id,
        subject_id: event.subject_id,
        grade: event.grade,
        score: null,
        created_at: event.updated_at || event.created_at || new Date().toISOString(),
        source: 'events_table'
      }));
      
      console.log('[Grades & Goals] Events with grades found:', {
        totalEvents: eventsData.length,
        sample: eventsData.slice(0, 3).map(e => ({
          id: e.id,
          title: e.title,
          child_id: e.child_id,
          subject_id: e.subject_id,
          grade: e.grade
        }))
      });

      // Combine grades from both sources
      const allGrades = [
        ...(gradesData || []).map(g => ({ ...g, source: 'grades_table' })),
        ...gradesFromEvents
      ];

      console.log('[Grades & Goals] Loaded grades:', {
        fromGradesTable: (gradesData || []).length,
        fromEvents: gradesFromEvents.length,
        total: allGrades.length,
        sampleGrades: allGrades.slice(0, 3).map(g => ({
          id: g.id,
          child_id: g.child_id,
          subject_id: g.subject_id,
          grade: g.grade,
          source: g.source
        }))
      });

      // Group grades by child_id
      const gradesByChildMap = {};
      children.forEach(child => {
        const childGrades = allGrades.filter(g => {
          // Handle both single child_id and child_ids array
          if (g.child_id === child.id) return true;
          if (Array.isArray(g.child_ids) && g.child_ids.includes(child.id)) return true;
          return false;
        });
        // Sort by created_at, most recent first
        childGrades.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        gradesByChildMap[child.id] = childGrades;
      });

      console.log('[Grades & Goals] Grades grouped by child:', Object.keys(gradesByChildMap).map(childId => ({
        childId,
        count: gradesByChildMap[childId].length
      })));

      setGradesByChild(gradesByChildMap);
    } catch (error) {
      console.warn('[PrintablePortfolioView] Error loading grades:', error);
      setGradesByChild({});
    } finally {
      setLoadingGrades(false);
    }
  };

  const loadCurrentSubjects = async () => {
    if (!familyId) {
      return;
    }
    try {
      // If childId is null, show all subjects for all children
      // Otherwise, show subjects for the specific child + family-wide subjects
      let subjectsQuery;
      
      // Always use effectiveChildId (defaults to first child alphabetically)
      const targetChildId = effectiveChildId;
      if (targetChildId) {
        // Specific child: show their subjects + family-wide
        subjectsQuery = supabase
          .from('subject')
          .select('id, name, child_id, grade, notes, family_year_id, created_at, updated_at')
          .eq('family_id', familyId)
          .or(`child_id.eq.${targetChildId},child_id.is.null`)
          .order('name');
      } else {
        // No children available
        setSubjects([]);
        setHasLoadedOnce(true);
        return;
      }
      
      const { data: allSubjectsData, error: subjectsError } = await subjectsQuery;

      if (subjectsError) {
        console.warn('[PrintablePortfolioView] Error loading subjects:', subjectsError);
        setSubjects([]);
        setHasLoadedOnce(true);
        return;
      }

      // Deduplicate subjects by name, preferring child-specific over family-wide
      const subjectMap = new Map();
      
      (allSubjectsData || []).forEach(subject => {
        const existing = subjectMap.get(subject.name);
        
        // If no existing entry, add this one
        if (!existing) {
          subjectMap.set(subject.name, subject);
        } 
        // If existing is family-wide and this is child-specific, replace it (prefer child-specific)
        else if (existing.child_id === null && subject.child_id !== null) {
          subjectMap.set(subject.name, subject);
        }
        // If existing is child-specific and this is also child-specific, prefer the one matching targetChildId
        else if (existing.child_id !== null && subject.child_id !== null) {
          if (subject.child_id === targetChildId && existing.child_id !== targetChildId) {
            subjectMap.set(subject.name, subject);
          }
        }
        // If both are family-wide, keep the first one (already added)
      });

      // Mark subjects as family-wide or child-specific
      const uniqueSubjects = Array.from(subjectMap.values()).map(s => ({
        ...s,
        isFamilyWide: s.child_id === null
      }));

      const subjectIds = uniqueSubjects.map(s => s.id);

      // If no subjects, set state and return early
      if (subjectIds.length === 0) {
        setSubjects([]);
        setHasLoadedOnce(true);
        return;
      }

      // Fetch all related data in parallel for much faster loading
      // Use effectiveChildId (always a specific child)
      const childIds = targetChildId ? [targetChildId] : [];
      
      // First, get material_ids from material_children for the target child
      let materialIdsForChild = [];
      if (childIds.length > 0) {
        const { data: mcData } = await supabase
          .from('material_children')
          .select('material_id')
          .in('child_id', childIds)
          .eq('family_id', familyId);
        materialIdsForChild = mcData?.map(mc => mc.material_id) || [];
      }

      const [
        { data: coverageData },
        { data: cognitiveLoadData },
        { data: goalsData },
        { data: materialsData, error: materialsError },
        { data: eventsCountData },
        { data: syllabiData, error: syllabiError },
        { data: lessonPlansData, error: lessonPlansError },
        { data: gradesData, error: gradesError },
        { data: complianceData, error: complianceError }
      ] = await Promise.all([
        childIds.length > 0 ? supabase
          .from('subject_coverage_tracking')
          .select('*')
          .in('child_id', childIds)
          .in('subject_id', subjectIds)
          .order('computed_for_date', { ascending: false }) : Promise.resolve({ data: [] }),
        supabase
          .from('subject_cognitive_load')
          .select('*')
          .in('subject_id', subjectIds),
        childIds.length > 0 ? supabase
          .from('subject_goals')
          .select('*')
          .in('child_id', childIds)
          .in('subject_id', subjectIds) : Promise.resolve({ data: [] }),
        // Query all materials for the family, filter by subject in code
        // This avoids issues with .in() on potentially null subject_ids
        (async () => {
          try {
            // Try with deleted_at filter first
            // Note: child_id column doesn't exist - materials are connected via material_children table
            const result = await supabase
              .from('materials')
              .select('id, title, type, subject_id, storage_path, url, mime, tags, created_at, material_children(child_id)')
              .eq('family_id', familyId)
              .is('deleted_at', null);
            
            // If column doesn't exist error, try without deleted_at filter
            if (result.error && (result.error.code === '42703' || result.error.message?.includes('column') || result.error.message?.includes('does not exist'))) {
              console.warn('[PrintablePortfolioView] deleted_at column may not exist, querying without filter');
              return await supabase
                .from('materials')
                .select('id, title, type, subject_id, storage_path, url, mime, tags, created_at, material_children(child_id)')
                .eq('family_id', familyId);
            }
            
            return result;
          } catch (err) {
            console.error('[PrintablePortfolioView] Materials query error:', err);
            // Fallback: try query without deleted_at filter
            try {
              return await supabase
                .from('materials')
                .select('id, title, type, subject_id, storage_path, url, mime, tags, created_at, material_children(child_id)')
                .eq('family_id', familyId);
            } catch (fallbackErr) {
              console.error('[PrintablePortfolioView] Materials query fallback error:', fallbackErr);
              return { data: [], error: fallbackErr };
            }
          }
        })(),
        childIds.length > 0 ? supabase
          .from('events')
          .select('id, subject_id, title, start_ts, end_ts, event_type, type, is_complete')
          .in('child_id', childIds)
          .eq('family_id', familyId)
          .in('subject_id', subjectIds)
          .is('deleted_at', null)
          .order('start_ts', { ascending: true }) : Promise.resolve({ data: [] }),
        childIds.length > 0 ? supabase
          .from('syllabi')
          .select('id, subject_id, title, upload_id')
          .in('child_id', childIds)
          .eq('family_id', familyId)
          .in('subject_id', subjectIds)
          .order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
        // lesson_plans may not be accessible, handle gracefully
        subjectIds.length > 0 ? supabase
          .from('lesson_plans')
          .select('id, subject_id, title')
          .eq('family_id', familyId)
          .in('subject_id', subjectIds) : Promise.resolve({ data: [], error: null }),
        childIds.length > 0 ? supabase
          .from('grades')
          .select('id, subject_id')
          .in('child_id', childIds)
          .in('subject_id', subjectIds) : Promise.resolve({ data: [] }),
        // family_compliance_checklist doesn't have subject_id, filter by child_id only
        // Load with requirement details for proper display
        childIds.length > 0 ? supabase
          .from('family_compliance_checklist')
          .select('id, child_id, status, requirement_id, requirement:state_requirements(id, requirement_type, requirement_title, requirement_description, is_common), completed_at, notes, evidence_upload_ids')
          .in('child_id', childIds)
          .eq('family_id', familyId) : Promise.resolve({ data: [] })
      ]);

      // Fetch syllabus sections after we have syllabi data
      let syllabusSectionsData = [];
      if (syllabiData && syllabiData.length > 0 && childIds.length > 0) {
        const { data: sectionsData, error: sectionsError } = await supabase
          .from('syllabus_sections')
          .select('id, syllabus_id, position, section_type, heading, notes')
          .in('syllabus_id', syllabiData.map(s => s.id))
          .order('position', { ascending: true });
        
        if (sectionsError) {
          console.warn('[PrintablePortfolioView] Error loading syllabus sections:', sectionsError);
        } else {
          syllabusSectionsData = sectionsData || [];
        }
      }

      if (syllabiError) {
        console.warn('[PrintablePortfolioView] Error loading syllabi:', syllabiError);
      }
      if (lessonPlansError) {
        console.warn('[PrintablePortfolioView] Error loading lesson plans:', lessonPlansError);
      }
      if (gradesError) {
        console.warn('[PrintablePortfolioView] Error loading grades:', gradesError);
      }
      if (complianceError) {
        console.warn('[PrintablePortfolioView] Error loading compliance:', complianceError);
      } else {
        // Store compliance data in state so it's accessible in the compliance section
        setComplianceData(complianceData || []);
      }
      if (materialsError) {
        console.error('[PrintablePortfolioView] Error loading materials:', {
          error: materialsError,
          code: materialsError?.code,
          message: materialsError?.message,
          details: materialsError?.details,
          hint: materialsError?.hint
        });
      }

      // Debug: Log raw materials data
      console.log('[PrintablePortfolioView] Raw materials data:', {
        materialsCount: materialsData?.length || 0,
        materialsError: materialsError ? {
          code: materialsError.code,
          message: materialsError.message,
          details: materialsError.details
        } : null,
        subjectIds: subjectIds,
        subjectIdsLength: subjectIds.length,
        targetChildId: targetChildId,
        materials: materialsData?.slice(0, 10).map(m => ({
          id: m.id,
          title: m.title,
          type: m.type,
          subject_id: m.subject_id,
          hasStoragePath: !!m.storage_path,
          hasUrl: !!m.url
        })) || []
      });

      // Filter materials to only include those:
      // 1. Connected to the target child (via material_children table only - child_id column was removed)
      // 2. Connected to one of the subjects we're displaying
      const filteredMaterialsData = materialsData?.filter(m => {
        if (!targetChildId) return false;
        
        // Must be connected to one of our subjects
        if (!subjectIds.includes(m.subject_id)) {
          return false;
        }
        
        // Check if connected via material_children (this is the only way now - child_id column was removed)
        if (materialIdsForChild.includes(m.id)) {
          return true;
        }
        return false;
      }) || [];

      // Debug: Log materials for troubleshooting
      if (targetChildId && filteredMaterialsData.length > 0) {
        console.log('[PrintablePortfolioView] Filtered materials for child:', {
          childId: targetChildId,
          materialIdsForChild,
          materialsCount: filteredMaterialsData.length,
          materials: filteredMaterialsData.map(m => ({
            id: m.id,
            title: m.title,
            type: m.type,
            subject_id: m.subject_id,
            hasStoragePath: !!m.storage_path,
            hasUrl: !!m.url
          }))
        });
      }

      // Combine all data
      const enrichedSubjects = uniqueSubjects.map(subject => {
        // Always use targetChildId (specific child)
        const coverage = targetChildId 
          ? coverageData?.find(c => c.subject_id === subject.id && c.child_id === targetChildId)
          : null;
        const cognitiveLoad = cognitiveLoadData?.find(cl => cl.subject_id === subject.id);
        const goal = targetChildId
          ? goalsData?.find(g => g.subject_id === subject.id && g.child_id === targetChildId)
          : null;
        const materialsCount = filteredMaterialsData.filter(m => m.subject_id === subject.id).length || 0;
        const allEvents = eventsCountData?.filter(e => e.subject_id === subject.id) || [];
        const upcomingEventsCount = allEvents.filter(e => e.start_ts && new Date(e.start_ts) >= new Date()).length || 0;
        
        // Get upcoming/overdue assignments, projects, and assessments
        const now = new Date();
        const subjectEvents = allEvents.filter(e => {
          const eventDate = e.start_ts ? new Date(e.start_ts) : null;
          if (!eventDate) return false;
          const eventType = (e.event_type || e.type || '').toLowerCase();
          return (eventType === 'assignment' || eventType === 'project' || eventType === 'assessment') &&
                 (eventDate >= now || (eventDate < now && !e.is_complete));
        }).sort((a, b) => {
          const dateA = a.start_ts ? new Date(a.start_ts) : new Date(0);
          const dateB = b.start_ts ? new Date(b.start_ts) : new Date(0);
          return dateA - dateB;
        });
        
        const nextEvent = subjectEvents.length > 0 ? subjectEvents[0] : null;
        const hasOverdue = subjectEvents.some(e => {
          const eventDate = e.start_ts ? new Date(e.start_ts) : null;
          return eventDate && eventDate < now && !e.is_complete;
        });
        
        const syllabus = targetChildId
          ? syllabiData?.find(s => s.subject_id === subject.id && s.child_id === targetChildId)
          : null;
        // Find materials that are syllabi - check both type and title
        // filteredMaterialsData already contains only materials connected to the child
        // First, log all materials for this subject to debug
        const materialsForSubject = filteredMaterialsData.filter(m => m.subject_id === subject.id);
        if (materialsForSubject.length > 0) {
          console.log('[PrintablePortfolioView] Materials for subject:', {
            subjectName: subject.name,
            subjectId: subject.id,
            materialsCount: materialsForSubject.length,
            materials: materialsForSubject.map(m => ({
              id: m.id,
              title: m.title,
              type: m.type,
              subject_id: m.subject_id,
              mime: m.mime,
              typeIncludesSyllabus: m.type && m.type.toLowerCase().includes('syllabus'),
              titleIncludesSyllabus: m.title && m.title.toLowerCase().includes('syllabus')
            }))
          });
        }
        
        // Find ALL syllabus materials (similar to lesson plan materials)
        const syllabusMaterials = targetChildId && filteredMaterialsData.length > 0
          ? filteredMaterialsData.filter(m => {
              if (m.subject_id !== subject.id) return false;
              
              // Check tags array for 'role:syllabus' (this is how syllabi are marked)
              const hasSyllabusTag = m.tags && Array.isArray(m.tags) && m.tags.includes('role:syllabus');
              
              // Check type field (case-insensitive, handle variations like "Syllabus (PDF)")
              const typeMatch = m.type && (
                m.type.toLowerCase().includes('syllabus') ||
                m.type.toLowerCase() === 'syllabus'
              );
              // Check title field (case-insensitive)
              const titleMatch = m.title && m.title.toLowerCase().includes('syllabus');
              // Check mime type for PDFs that might be syllabi
              const mimeMatch = m.mime && m.mime.toLowerCase().includes('pdf') && (
                m.type?.toLowerCase().includes('syllabus') ||
                m.title?.toLowerCase().includes('syllabus')
              );
              
              const isMatch = hasSyllabusTag || typeMatch || titleMatch || mimeMatch;
              if (isMatch) {
                console.log('[PrintablePortfolioView] Found syllabus material:', {
                  id: m.id,
                  title: m.title,
                  type: m.type,
                  tags: m.tags,
                  subject_id: m.subject_id,
                  hasStoragePath: !!m.storage_path,
                  hasUrl: !!m.url,
                  mime: m.mime,
                  matchedBy: hasSyllabusTag ? 'tag' : (typeMatch ? 'type' : (titleMatch ? 'title' : 'mime'))
                });
              }
              return isMatch;
            })
          : [];
        
        // Keep the first one for backward compatibility (syllabusMaterial)
        const syllabusMaterial = syllabusMaterials.length > 0 ? syllabusMaterials[0] : null;
        
        // Find lesson plan materials (similar to syllabus materials)
        const lessonPlanMaterials = targetChildId && filteredMaterialsData.length > 0
          ? filteredMaterialsData.filter(m => {
              if (m.subject_id !== subject.id) return false;
              
              // Check tags array for 'role:lesson_plan' or 'role:lesson'
              const hasLessonPlanTag = m.tags && Array.isArray(m.tags) && (
                m.tags.includes('role:lesson_plan') ||
                m.tags.includes('role:lesson')
              );
              
              // Check type field (case-insensitive)
              const typeMatch = m.type && (
                m.type.toLowerCase().includes('lesson') ||
                m.type.toLowerCase().includes('lesson plan') ||
                m.type.toLowerCase() === 'lesson_plan'
              );
              
              // Check title field (case-insensitive)
              const titleMatch = m.title && (
                m.title.toLowerCase().includes('lesson plan') ||
                m.title.toLowerCase().includes('lessonplan')
              );
              
              // Check mime type for PDFs that might be lesson plans
              const mimeMatch = m.mime && m.mime.toLowerCase().includes('pdf') && (
                m.type?.toLowerCase().includes('lesson') ||
                m.title?.toLowerCase().includes('lesson')
              );
              
              const isMatch = hasLessonPlanTag || typeMatch || titleMatch || mimeMatch;
              if (isMatch) {
                console.log('[PrintablePortfolioView] Found lesson plan material:', {
                  id: m.id,
                  title: m.title,
                  type: m.type,
                  tags: m.tags,
                  subject_id: m.subject_id,
                  hasStoragePath: !!m.storage_path,
                  hasUrl: !!m.url,
                  mime: m.mime,
                  matchedBy: hasLessonPlanTag ? 'tag' : (typeMatch ? 'type' : (titleMatch ? 'title' : 'mime'))
                });
              }
              return isMatch;
            })
          : [];
        
        const lessonPlan = lessonPlansData?.find(lp => lp.subject_id === subject.id);
        const hasGradesForSubject = gradesData?.some(g => g.subject_id === subject.id) || false;
        // family_compliance_checklist doesn't have subject_id, just check if there's any compliance data for the child
        const hasComplianceForSubject = complianceData && complianceData.length > 0;
        
        // Check if there are any projects or assessments (not just the next event)
        const hasProjects = allEvents.some(e => {
          const eventType = (e.event_type || e.type || '').toLowerCase();
          return eventType === 'project';
        });
        const hasKeyDates = allEvents.some(e => {
          const eventType = (e.event_type || e.type || '').toLowerCase();
          return eventType === 'assessment';
        });
        
        // Get current focus from syllabus_sections (first incomplete unit/lesson)
        let currentFocusFromSections = null;
        if (syllabus && syllabusSectionsData) {
          const sectionsForSyllabus = syllabusSectionsData.filter(s => s.syllabus_id === syllabus.id);
          const currentSection = sectionsForSyllabus.find(s => s.section_type === 'unit' || s.section_type === 'lesson');
          if (currentSection) {
            currentFocusFromSections = currentSection.heading || currentSection.notes;
          }
        }
        
        // Check if we need to show tip for missing syllabus/goal
        const hasSyllabus = !!syllabus || !!syllabusMaterial;
        const hasGoal = !!goal;
        // core_goal and current_focus don't exist in syllabi table, use sections data instead
        const currentFocus = currentFocusFromSections || null;
        const needsSyllabusTip = !hasSyllabus;
        const needsGoalTip = !hasGoal;
        const showTip = needsSyllabusTip || needsGoalTip;
        
        // Get children assigned to this subject (for family-wide, just show the target child)
        let assignedChildren = [];
        if (subject.isFamilyWide) {
          // For family-wide subjects, show only the target child
          const targetChild = children.find(c => c.id === targetChildId);
          assignedChildren = targetChild ? [targetChild] : [];
        } else {
          // For child-specific, find which child this belongs to
          const subjectChild = children.find(c => c.id === subject.child_id);
          assignedChildren = subjectChild ? [subjectChild] : [];
        }

        return {
          ...subject,
          coverage: coverage || null,
          cognitiveLoad: cognitiveLoad?.load_level || 'medium',
          goal: goal || null,
          materialsCount,
          upcomingEventsCount,
          assignedChildren,
          syllabus: syllabus || null,
          syllabusMaterial: syllabusMaterial || null,
          syllabusMaterials: syllabusMaterials || [],
          lessonPlan: lessonPlan || null,
          lessonPlanMaterials: lessonPlanMaterials || [],
          nextEvent: nextEvent || null,
          hasOverdue: hasOverdue,
          showTip: showTip,
          needsSyllabusTip: needsSyllabusTip,
          needsGoalTip: needsGoalTip,
          coreGoal: null, // core_goal column doesn't exist in syllabi table
          currentFocus: currentFocus,
          hasGrades: hasGradesForSubject,
          hasCompliance: hasComplianceForSubject,
          hasProjects: hasProjects,
          hasKeyDates: hasKeyDates,
          // Generate insight
          insight: generateInsight(subject, coverage, goal, materialsCount, upcomingEventsCount),
        };
      });

      const sortedSubjects = enrichedSubjects.sort((a, b) => a.name.localeCompare(b.name));
      setSubjects(sortedSubjects);
      setHasLoadedOnce(true);
      
      // Cache the loaded data
      if (targetChildId && familyId) {
        const key = `${targetChildId}-${familyId}`;
        profileOverviewCache.set(key, { subjects: sortedSubjects });
        // Limit cache size to prevent memory leaks (keep last 10 entries)
        if (profileOverviewCache.size > 10) {
          const firstKey = profileOverviewCache.keys().next().value;
          profileOverviewCache.delete(firstKey);
        }
      }
    } catch (error) {
      console.warn('[PrintablePortfolioView] Error loading subjects:', error);
      setSubjects([]);
      setHasLoadedOnce(true);
    }
  };

  const generateInsight = (subject, coverage, goal, materialsCount, upcomingEventsCount) => {
    if (!coverage && !goal) return null;
    
    const target = goal?.goal_minutes_per_week || goal?.minutes_per_week || coverage?.target_minutes_per_week || 0;
    const actual = coverage?.actual_minutes_last_7_days || 0;
    const diff = actual - target;
    const status = coverage?.coverage_status || 'on_track';

    if (status === 'low' && diff < 0) {
      return `${subject.name} is slightly under target this week (${diff} min).`;
    } else if (status === 'ahead' && diff > 0) {
      return `${subject.name} is ahead — consider lighter days next week.`;
    } else if (materialsCount === 0) {
      return `${subject.name} has no materials attached.`;
    } else if (upcomingEventsCount === 0) {
      return `${subject.name} has no upcoming events scheduled.`;
    }
    return null;
  };

  const handleOpenMaterial = async (material) => {
    console.log('[PrintablePortfolioView] handleOpenMaterial called with:', {
      id: material?.id,
      title: material?.title,
      hasUrl: !!material?.url,
      hasStoragePath: !!material?.storage_path,
      storage_path: material?.storage_path,
      url: material?.url,
      mime: material?.mime
    });

    if (!material) {
      console.warn('[PrintablePortfolioView] No material provided');
      return;
    }

    try {
      // Get the file URL
      let fileUrl = material.url;
      
      // If no URL but we have storage_path, get signed URL (better for private buckets)
      if (!fileUrl && material.storage_path) {
        try {
          // Try to get a signed URL first (this will properly detect bucket errors)
          const { data: signedData, error: signedError } = await supabase.storage
            .from('evidence')
            .createSignedUrl(material.storage_path, 3600); // 1 hour expiry
          
          if (signedError) {
            // Check if it's a bucket not found error
            const isBucketError = 
              signedError.message?.includes('Bucket not found') ||
              signedError.message?.includes('bucket') ||
              signedError.error === 'Bucket not found' ||
              signedError.statusCode === 404 ||
              (signedError.statusCode && String(signedError.statusCode).startsWith('4'));
            
            console.error('[PrintablePortfolioView] Storage error:', signedError);
            Alert.alert(
              'Storage Error',
              'The storage bucket is not configured or cannot be accessed. Please check your Supabase storage setup or contact support.'
            );
            return;
          }
          
          if (signedData?.signedUrl) {
            fileUrl = signedData.signedUrl;
          } else {
            // Fallback to public URL (but this shouldn't be needed if signed URL worked)
            const { data: urlData } = supabase.storage
              .from('evidence')
              .getPublicUrl(material.storage_path);
            fileUrl = urlData?.publicUrl;
          }
        } catch (error) {
          console.error('[PrintablePortfolioView] Error accessing storage:', error);
          Alert.alert(
            'Storage Error',
            `Unable to access file: ${error.message || 'Storage bucket not configured'}. Please check your Supabase storage setup.`
          );
          return;
        }
      }

      if (!fileUrl) {
        console.warn('[PrintablePortfolioView] No file URL found for material:', material);
        Alert.alert('Error', 'No file URL available for this material');
        return;
      }

      // Open in PDF modal instead of new tab
      setPdfUrl(fileUrl);
      setPdfTitle(material.title || 'Syllabus');
      setShowPdfViewer(true);
    } catch (error) {
      console.error('[PrintablePortfolioView] Error opening material:', error);
      Alert.alert('Error', `Unable to open material: ${error.message || 'Unknown error'}`);
    }
  };

  const handleOpenSyllabus = async (syllabus) => {
    if (!syllabus?.upload_id) {
      console.warn('[PrintablePortfolioView] Syllabus missing upload_id:', syllabus);
      return;
    }

    try {
      // Fetch the material record (upload_id now points to materials.id)
      const { data: material, error: materialError } = await supabase
        .from('materials')
        .select('id, title, storage_path, url, mime')
        .eq('id', syllabus.upload_id)
        .is('deleted_at', null)
        .single();

      if (materialError) {
        console.error('[PrintablePortfolioView] Error fetching material:', materialError);
        return;
      }

      if (!material) {
        console.warn('[PrintablePortfolioView] Material not found for syllabus:', syllabus.upload_id);
        return;
      }

      // Use handleOpenMaterial to open the material
      await handleOpenMaterial(material);
    } catch (error) {
      console.error('[PrintablePortfolioView] Error opening syllabus:', error);
    }
  };

  const handleOpenSyllabusMaterials = async (subject) => {
    console.log('[PrintablePortfolioView] handleOpenSyllabusMaterials called with:', {
      subjectName: subject.name,
      subjectId: subject.id,
      hasSyllabus: !!subject.syllabus,
      syllabusMaterialsCount: subject.syllabusMaterials?.length || 0,
      syllabusMaterials: subject.syllabusMaterials
    });

    const materials = subject.syllabusMaterials || [];
    
    // Check if there's a syllabus from syllabi table
    if (subject.syllabus) {
      // If there are also materials, combine them
      if (materials.length > 0) {
        // Show list with both syllabus from table and materials
        // For syllabus from table, we'll need to fetch the material to get full info
        const allSyllabi = [
          { id: subject.syllabus.id, title: subject.syllabus.title, type: 'syllabus', fromTable: true, syllabus: subject.syllabus, subjectName: subject.name },
          ...materials.map(m => ({ ...m, fromTable: false, subjectName: subject.name }))
        ];
        setSyllabusMaterials(allSyllabi);
        setSelectedSubjectForSyllabus(subject);
        selectedSubjectForSyllabusRef.current = subject;
        setShowSyllabusList(true);
        return;
      } else {
        // Only syllabus from table, open directly
        await handleOpenSyllabus(subject.syllabus);
        return;
      }
    }
    
    // No syllabus from table, check materials
    if (materials.length === 0) {
      // No syllabus found - show modal to add one
      setSelectedSubjectForMaterial(subject);
      setShowNoSyllabusModal(true);
      return;
    }
    
    if (materials.length === 1) {
      // Single syllabus material - open directly in PDF modal
      await handleOpenMaterial(materials[0]);
    } else {
      // Multiple syllabus materials - show list modal
      setSyllabusMaterials(materials.map(m => ({ ...m, fromTable: false, subjectName: subject.name })));
      setSelectedSubjectForSyllabus(subject);
      selectedSubjectForSyllabusRef.current = subject;
      setShowSyllabusList(true);
    }
  };
  
  const handleSelectSyllabusMaterial = async (item) => {
    setShowSyllabusList(false);
    setSelectedSubjectForSyllabus(null);
    selectedSubjectForSyllabusRef.current = null;
    if (item.fromTable && item.syllabus) {
      // It's from the syllabi table
      await handleOpenSyllabus(item.syllabus);
    } else {
      // It's a material
      await handleOpenMaterial(item);
    }
  };

  const handleOpenLessonPlan = async (subject) => {
    console.log('[PrintablePortfolioView] handleOpenLessonPlan called with:', {
      subjectName: subject.name,
      subjectId: subject.id,
      hasLessonPlan: !!subject.lessonPlan,
      lessonPlanMaterialsCount: subject.lessonPlanMaterials?.length || 0,
      lessonPlanMaterials: subject.lessonPlanMaterials
    });

    const materials = subject.lessonPlanMaterials || [];
    
    if (materials.length === 0) {
      // No lesson plan materials found - show modal to add one
      setSelectedSubjectForMaterial(subject);
      setShowNoLessonPlanModal(true);
      return;
    }
    
    if (materials.length === 1) {
      // Single lesson plan material - open directly in PDF modal
      await handleOpenMaterial(materials[0]);
    } else {
      // Multiple lesson plan materials - show list modal
      setLessonPlanMaterials(materials.map(m => ({ ...m, subjectName: subject.name })));
      setSelectedSubjectForLessonPlan(subject);
      selectedSubjectForLessonPlanRef.current = subject;
      setShowLessonPlanList(true);
    }
  };
  
  const handleSelectLessonPlanMaterial = async (material) => {
    setShowLessonPlanList(false);
    setSelectedSubjectForLessonPlan(null);
    selectedSubjectForLessonPlanRef.current = null;
    await handleOpenMaterial(material);
  };

  const handleOpenProjects = async (subject) => {
    console.log('[PrintablePortfolioView] handleOpenProjects called for subject:', {
      subjectId: subject?.id,
      subjectName: subject?.name
    });
    
    if (!subject || !subject.id) {
      console.warn('[PrintablePortfolioView] No subject provided to handleOpenProjects');
      return;
    }
    
    // Store the selected subject for display in the modal
    setSelectedSubjectForProjects(subject);
    setLoadingProjects(true);
    
    try {
      // Fetch Project events that have both child_id/child_ids and the specific subject_id
      // Events must be:
      // 1. event_type = 'Project'
      // 2. subject_id = the clicked subject's ID
      // 3. Have child_id OR child_ids array with at least one element
      
      // Get all children IDs we're interested in
      const targetChildIds = effectiveChildId 
        ? [effectiveChildId] 
        : (children.length > 0 ? children.map(c => c.id) : []);
      
      if (targetChildIds.length === 0) {
        // No children available, return empty
        setProjectEvents([]);
        setShowProjectsList(true);
        setLoadingProjects(false);
        return;
      }
      
      // Fetch Project events filtered by the specific subject_id
      // First, let's also check for case variations of 'Project'
      console.log('[PrintablePortfolioView] Querying for Project events:', {
        subjectId: subject.id,
        subjectName: subject.name,
        targetChildIds,
        queryParams: {
          event_type: 'Project',
          subject_id: subject.id
        }
      });
      
      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, description, start_ts, end_ts, child_id, child_ids, subject_id, status, created_at, updated_at, event_type')
        .eq('event_type', 'Project')
        .eq('subject_id', subject.id)
        .is('deleted_at', null)
        .order('start_ts', { ascending: false });
      
      console.log('[PrintablePortfolioView] Raw query result:', {
        eventsCount: events?.length || 0,
        error: error?.message || null,
        events: events?.map(e => ({
          id: e.id,
          title: e.title,
          event_type: e.event_type,
          child_id: e.child_id,
          child_ids: e.child_ids,
          subject_id: e.subject_id
        })) || []
      });
      
      if (error) {
        console.error('[PrintablePortfolioView] Error fetching project events:', error);
        setProjectEvents([]);
      } else {
        // Filter to only include events that:
        // 1. Have a child connection (child_id matches OR child_ids array contains one of our child IDs)
        // 2. Subject_id is already filtered by the query, but double-check
        const filteredEvents = (events || []).filter(event => {
          // Double-check subject_id matches (should already be filtered, but just in case)
          if (!event.subject_id || event.subject_id !== subject.id) {
            console.log('[PrintablePortfolioView] Event filtered out - subject_id mismatch:', {
              eventId: event.id,
              eventSubjectId: event.subject_id,
              expectedSubjectId: subject.id
            });
            return false;
          }
          
          // Check if event is connected to one of our target children
          const hasChildIdMatch = event.child_id && targetChildIds.includes(event.child_id);
          const hasChildIdsMatch = event.child_ids && Array.isArray(event.child_ids) && 
            event.child_ids.some(childId => targetChildIds.includes(childId));
          
          if (!hasChildIdMatch && !hasChildIdsMatch) {
            console.log('[PrintablePortfolioView] Event filtered out - no child match:', {
              eventId: event.id,
              eventTitle: event.title,
              eventChildId: event.child_id,
              eventChildIds: event.child_ids,
              targetChildIds
            });
          }
          
          return hasChildIdMatch || hasChildIdsMatch;
        });
        
        console.log('[PrintablePortfolioView] Final filtered project events for subject:', {
          subjectId: subject.id,
          subjectName: subject.name,
          totalFromDB: events?.length || 0,
          afterChildFilter: filteredEvents.length,
          targetChildIds,
          filteredEvents: filteredEvents.map(e => ({
            id: e.id,
            title: e.title,
            child_id: e.child_id,
            child_ids: e.child_ids,
            subject_id: e.subject_id,
            start_ts: e.start_ts
          }))
        });
        
        setProjectEvents(filteredEvents);
      }
      
      setShowProjectsList(true);
    } catch (error) {
      console.error('[PrintablePortfolioView] Error in handleOpenProjects:', error);
      setProjectEvents([]);
      setShowProjectsList(true);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleSelectProjectEvent = async (event) => {
    console.log('[PrintablePortfolioView] Project event selected:', event);
    
    // Close the projects list modal
    setShowProjectsList(false);
    setSelectedSubjectForProjects(null);
    
    // Dispatch event to open the event details modal
    // WebContent will listen for this event and open the EventModal
    if (Platform.OS === 'web' && typeof window !== 'undefined' && event?.id) {
      window.dispatchEvent(new CustomEvent('openEventModal', {
        detail: {
          eventId: event.id,
          initialEvent: event
        }
      }));
    }
  };

  const handleSelectGradeEvent = (gradeItem) => {
    console.log('[PrintablePortfolioView] Grade event selected:', gradeItem);
    
    // Only open event details if this grade is from an event (not from grades table)
    const isFromEvent = gradeItem.source === 'event_outcomes' || gradeItem.source === 'events_table';
    
    if (isFromEvent && gradeItem.event?.id) {
      // Close the grades list modal
      setShowGradesList(false);
      setSelectedSubjectForGrades(null);
      
      // Dispatch event to open the event details modal
      // WebContent will listen for this event and open the EventModal
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('openEventModal', {
          detail: {
            eventId: gradeItem.event.id,
            initialEvent: gradeItem.event
          }
        }));
      }
    }
  };

  const handleOpenGrades = async (subject) => {
    console.log('[PrintablePortfolioView] handleOpenGrades called for subject:', {
      subjectId: subject?.id,
      subjectName: subject?.name,
      effectiveChildId
    });
    
    if (!subject || !subject.id) {
      console.warn('[PrintablePortfolioView] No subject provided to handleOpenGrades');
      return;
    }
    
    if (!effectiveChildId) {
      console.warn('[PrintablePortfolioView] No child selected to view grades for');
      Alert.alert('No Child Selected', 'Please select a child to view grades.');
      return;
    }
    
    // Store the selected subject for display in the modal
    setSelectedSubjectForGrades(subject);
    setLoadingGradesList(true);
    
    try {
      // Fetch grades from both sources:
      // 1. grades table (formal grades)
      // 2. event_outcomes table (grades from projects/exams/assignments)
      
      // Fetch from grades table
      const gradesResult = await supabase
        .from('grades')
        .select(`
          id,
          child_id,
          subject_id,
          term_label,
          score,
          grade,
          rubric,
          notes,
          assignment_id,
          created_at,
          assignments!assignment_id (
            id,
            title
          )
        `)
        .eq('child_id', effectiveChildId)
        .eq('subject_id', subject.id)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });
      
      // Fetch from events table (grades stored directly on events)
      // Events can have either child_id OR child_ids array, so we need to query more broadly and filter in memory
      // Also check event_outcomes table for grades stored there
      // Include ALL events (assignments) for this subject/child, even if ungraded
      const eventsQuery = supabase
        .from('events')
        .select('id, title, event_type, start_ts, end_ts, child_id, child_ids, grade, unit, percent_of_total_grade, created_at, updated_at')
        .eq('subject_id', subject.id)
        .eq('family_id', familyId)
        .is('deleted_at', null);
      
      const eventsResult = await eventsQuery;
      
      if (gradesResult.error) {
        console.error('[PrintablePortfolioView] Error fetching grades from grades table:', gradesResult.error);
      }
      
      if (eventsResult.error) {
        console.error('[PrintablePortfolioView] Error fetching events:', eventsResult.error);
      }
      
      // Combine both sources
      const gradesFromTable = (gradesResult.data || []).map(g => ({
        ...g,
        source: 'grades_table',
        assignment: g.assignments
      }));
      
      // Filter events to only those that belong to the selected child
      // Events can have child_id OR child_ids array
      // Include ALL events (assignments), even if ungraded
      const relevantEvents = (eventsResult.data || []).filter(event => {
        const hasChildIdMatch = event.child_id && event.child_id === effectiveChildId;
        const hasChildIdsMatch = event.child_ids && Array.isArray(event.child_ids) && 
          event.child_ids.includes(effectiveChildId);
        return hasChildIdMatch || hasChildIdsMatch;
      });
      
      console.log('[PrintablePortfolioView] Events for grades:', {
        totalEvents: eventsResult.data?.length || 0,
        relevantEvents: relevantEvents.length,
        childId: effectiveChildId,
        eventsWithGrade: relevantEvents.filter(e => e.grade).length,
        eventsWithPercent: relevantEvents.filter(e => e.percent_of_total_grade).length
      });
      
      // Get ALL events (assignments) for this subject/child, including ungraded ones
      const assignmentsFromEvents = relevantEvents.map(event => {
        const hasGrade = !!event.grade;
        const dueDate = event.end_ts || event.start_ts;
        const formattedDueDate = dueDate 
          ? new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : null;
        
        return {
          id: `event-${event.id}`,
          child_id: event.child_id || effectiveChildId,
          subject_id: subject.id,
          grade: event.grade || null,
          isUngraded: !hasGrade,
          dueDate: dueDate,
          formattedDueDate: formattedDueDate,
          percent_of_total_grade: event.percent_of_total_grade || null,
          notes: event.unit || null,
          created_at: event.updated_at || event.created_at || new Date().toISOString(),
          source: 'events_table',
          event: event,
          event_title: event.title || null,
          event_type: event.event_type || null
        };
      });
      
      // Also try to fetch from event_outcomes table (may have RLS issues, so handle gracefully)
      // Merge event_outcomes with assignments - update existing assignments if they have grades from outcomes
      const eventIds = relevantEvents.map(e => e.id).filter(Boolean);
      
      if (eventIds.length > 0) {
        try {
          // Query outcomes by event_id (this approach works better with RLS)
          const eventOutcomesResult = await supabase
            .from('event_outcomes')
            .select('id, child_id, subject_id, event_id, grade, note, created_at')
            .in('event_id', eventIds)
            .not('grade', 'is', null)
            .order('created_at', { ascending: false });
          
          if (eventOutcomesResult.error) {
            console.warn('[PrintablePortfolioView] Could not fetch grades from event_outcomes (RLS may be blocking):', eventOutcomesResult.error);
          } else {
            console.log('[PrintablePortfolioView] Event outcomes with grades:', {
              eventIds: eventIds.length,
              outcomes: eventOutcomesResult.data?.length || 0
            });
            
            // Create events map for quick lookup
            const eventsMap = relevantEvents.reduce((acc, event) => {
              acc[event.id] = event;
              return acc;
            }, {});
            
            // Merge event_outcomes with assignments - update existing assignments if they have grades from outcomes
            eventOutcomesResult.data?.forEach(eo => {
              const existingAssignment = assignmentsFromEvents.find(a => a.event?.id === eo.event_id);
              if (existingAssignment) {
                // Update with grade from event_outcomes (prefer event_outcomes grade if exists)
                existingAssignment.grade = eo.grade;
                existingAssignment.isUngraded = false;
                existingAssignment.notes = eo.note || existingAssignment.notes;
                existingAssignment.created_at = eo.created_at || existingAssignment.created_at;
                existingAssignment.source = 'event_outcomes';
              } else {
                // Add new grade from event_outcomes if event exists
                const event = eventsMap[eo.event_id];
                if (event) {
                  const dueDate = event.end_ts || event.start_ts;
                  const formattedDueDate = dueDate 
                    ? new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    : null;
                  assignmentsFromEvents.push({
                    id: eo.id,
                    child_id: eo.child_id,
                    subject_id: eo.subject_id,
                    grade: eo.grade,
                    isUngraded: false,
                    dueDate: dueDate,
                    formattedDueDate: formattedDueDate,
                    percent_of_total_grade: event.percent_of_total_grade || null,
                    notes: eo.note,
                    created_at: eo.created_at,
                    source: 'event_outcomes',
                    event: event,
                    event_title: event?.title || null,
                    event_type: event?.event_type || null
                  });
                }
              }
            });
          }
        } catch (error) {
          console.warn('[PrintablePortfolioView] Error fetching from event_outcomes (will use events.grade only):', error);
        }
      }
      
      // Combine all: grades from table + all assignments (graded and ungraded) from events
      // Sort by due date (if available) or created_at, most recent first
      const allAssignments = [...gradesFromTable, ...assignmentsFromEvents].sort((a, b) => {
        // Sort by due date first (if available), then by created_at
        const dateA = a.dueDate ? new Date(a.dueDate) : new Date(a.created_at);
        const dateB = b.dueDate ? new Date(b.dueDate) : new Date(b.created_at);
        return dateB - dateA; // Most recent first
      });
      
      console.log('[PrintablePortfolioView] Assignments fetched:', {
        subjectId: subject.id,
        subjectName: subject.name,
        childId: effectiveChildId,
        fromGradesTable: gradesFromTable.length,
        assignmentsFromEvents: assignmentsFromEvents.length,
        graded: assignmentsFromEvents.filter(a => !a.isUngraded).length,
        ungraded: assignmentsFromEvents.filter(a => a.isUngraded).length,
        withPercent: assignmentsFromEvents.filter(a => a.percent_of_total_grade).length,
        total: allAssignments.length
      });
      
      setGradesList(allAssignments);
      setShowGradesList(true);
    } catch (error) {
      console.error('[PrintablePortfolioView] Error in handleOpenGrades:', error);
      setGradesList([]);
      setShowGradesList(true);
    } finally {
      setLoadingGradesList(false);
    }
  };

  const handleOpenPacing = (subject) => {
    if (!subject || !subject.id) {
      console.warn('[PrintablePortfolioView] No subject provided to handleOpenPacing');
      return;
    }
    
    if (!effectiveChildId) {
      console.warn('[PrintablePortfolioView] No child selected to view pacing for');
      Alert.alert('No Child Selected', 'Please select a child to view pacing.');
      return;
    }
    
    setSelectedSubjectForPacing(subject);
    setShowPacingModal(true);
  };

  const handleChipPress = (chipType, subject) => {
    let hasData = false;
    let handler = null;

    switch (chipType) {
      case 'syllabus':
        // Check for both syllabus from syllabi table and syllabus materials from materials table
        hasData = !!subject.syllabus || (subject.syllabusMaterials && subject.syllabusMaterials.length > 0);
        console.log('[PrintablePortfolioView] Syllabus chip pressed:', {
          subjectName: subject.name,
          subjectId: subject.id,
          hasSyllabus: !!subject.syllabus,
          syllabusMaterialsCount: subject.syllabusMaterials?.length || 0,
          syllabusMaterials: subject.syllabusMaterials
        });
        // Always set a handler - either to open existing syllabus or show "add" modal
        if (hasData) {
          handler = () => handleOpenSyllabusMaterials(subject);
        } else {
          // No syllabus found - show modal to add one
          handler = () => {
            console.log('[PrintablePortfolioView] No syllabus found, showing add modal for subject:', subject.name);
            setSelectedSubjectForMaterial(subject);
            setShowNoSyllabusModal(true);
          };
        }
        break;
      case 'lessonPlans':
        hasData = !!subject.lessonPlan || (subject.lessonPlanMaterials && subject.lessonPlanMaterials.length > 0);
        if (hasData) {
          handler = () => handleOpenLessonPlan(subject);
        } else {
          // No lesson plan found - show modal to add one
          handler = () => {
            console.log('[PrintablePortfolioView] No lesson plan found, showing add modal for subject:', subject.name);
            setSelectedSubjectForMaterial(subject);
            setShowNoLessonPlanModal(true);
          };
        }
        break;
      case 'projects':
        // For projects, always try to open the modal and fetch projects for this specific subject
        // We fetch fresh data from the database rather than relying on hasProjects flag
        // Only show projects that are tagged with this subject (subject_id matches)
        hasData = subject.hasProjects || false;
        handler = () => handleOpenProjects(subject);
        break;
      case 'keyDates':
        hasData = subject.hasKeyDates || false;
        if (hasData) {
          handler = () => setSelectedSubjectId(subject.id);
        }
        break;
      case 'grades':
        // For grades, always try to open the modal and fetch grades for this specific subject and child
        // We fetch fresh data from the database rather than relying on hasGrades flag
        hasData = subject.hasGrades || false;
        handler = () => handleOpenGrades(subject);
        break;
      case 'pacing':
        // Always show pacing modal for the selected child and subject
        hasData = !!subject.coverage;
        handler = () => handleOpenPacing(subject);
        break;
      case 'compliance':
        hasData = subject.hasCompliance || false;
        if (hasData) {
          handler = () => setSelectedSubjectId(subject.id);
        }
        break;
      case 'skills':
        hasData = subject.hasSkills || false;
        if (hasData) {
          handler = () => setSelectedSubjectId(subject.id);
        }
        break;
    }

    // For syllabus, we want to show the modal even when there's no data
    // So check handler first, then fall back to the generic alert
    if (handler) {
      handler();
    } else if (!hasData) {
      Alert.alert('Start adding data', 'Start adding data to see updates here');
    }
  };

  // Group subjects by category
  const groupSubjects = (subjects) => {
    const groups = {
      'Core Academics': [],
      'Enrichment': [],
      'Physical / Life Skills': [],
      'Family-Wide Learning': [],
    };

    const coreKeywords = ['math', 'reading', 'writing', 'science', 'history', 'social studies', 'language', 'english', 'literature'];
    const enrichmentKeywords = ['art', 'music', 'drama', 'theater', 'dance', 'drama', 'creative'];
    const physicalKeywords = ['pe', 'physical', 'gym', 'sports', 'health', 'cooking', 'life skills'];

    subjects.forEach(subject => {
      const nameLower = subject.name.toLowerCase();
      
      if (subject.isFamilyWide) {
        groups['Family-Wide Learning'].push(subject);
      } else if (coreKeywords.some(kw => nameLower.includes(kw))) {
        groups['Core Academics'].push(subject);
      } else if (enrichmentKeywords.some(kw => nameLower.includes(kw))) {
        groups['Enrichment'].push(subject);
      } else if (physicalKeywords.some(kw => nameLower.includes(kw))) {
        groups['Physical / Life Skills'].push(subject);
      } else {
        groups['Core Academics'].push(subject); // Default to Core Academics
      }
    });

    // Remove empty groups
    return Object.entries(groups).filter(([_, subjects]) => subjects.length > 0);
  };

  const groupedSubjects = groupSubjects(subjects);

  const handleSubjectAdded = (newSubject) => {
    // Reload subjects after a new one is added
    loadCurrentSubjects();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'on_track': return '#10b981'; // green
      case 'low': return '#ef4444'; // red
      case 'ahead': return '#3b82f6'; // blue
      default: return tokens.textSecondary;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'on_track': return 'On Track';
      case 'low': return 'Low';
      case 'ahead': return 'Ahead';
      default: return 'Unknown';
    }
  };

  const getCognitiveLoadColor = (load) => {
    switch (load) {
      case 'light': return '#94a3b8';
      case 'medium': return '#f59e0b';
      case 'heavy': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  // Get term and school year for header (matching planner style)
  const getTermAndYear = () => {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const year = now.getFullYear();
    
    // Determine term based on month (matching planner: Spring/Summer/Fall only)
    let termName = 'Fall Term';
    if (month >= 0 && month <= 4) termName = 'Spring Term'; // January - May
    else if (month >= 5 && month <= 7) termName = 'Summer Term'; // June - August
    else if (month >= 8 && month <= 11) termName = 'Fall Term'; // September - December
    
    // Determine school year (e.g., 25/26 for 2025-2026)
    // School year typically runs from Aug/Sep to May/Jun
    let schoolYearStart = year;
    if (month >= 8) { // Sep-Dec, use current year as start
      schoolYearStart = year;
    } else { // Jan-Aug, use previous year as start
      schoolYearStart = year - 1;
    }
    const schoolYearEnd = schoolYearStart + 1;
    
    return { termName, schoolYearStart, schoolYearEnd };
  };

  const { termName, schoolYearStart, schoolYearEnd } = getTermAndYear();
  const effectiveChild = effectiveChildId ? (child || sortedChildren.find(c => c.id === effectiveChildId)) : null;
  const childName = effectiveChild ? (effectiveChild.first_name || effectiveChild.name || '') : '';

  // Measure and animate indicator to active segment
  const animateToSegment = (targetId) => {
    if (!targetId) return; // No "All Children" option
    const position = segmentPositions.current.get(targetId);
    
    if (position) {
      Animated.parallel([
        Animated.spring(indicatorX, {
          toValue: position.x,
          useNativeDriver: false,
          tension: 380,
          friction: 34,
        }),
        Animated.spring(indicatorWidth, {
          toValue: position.width,
          useNativeDriver: false,
          tension: 380,
          friction: 34,
        }),
      ]).start();
    }
  };

  // Update indicator when active child changes
  useEffect(() => {
    // Small delay to ensure layouts are measured
    const timer = setTimeout(() => {
      if (segmentPositions.current.size > 0 && effectiveChildId) {
        animateToSegment(effectiveChildId);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [effectiveChildId, children]);

  // Use backgroundColor prop if provided, otherwise use default white
  const containerBg = backgroundColor || '#ffffff';
  const overviewBg = backgroundColor || '#ffffff';
  
  return (
    <View style={[overviewStyles.overviewContainer, { backgroundColor: containerBg }]}>
      <View style={[overviewStyles.overview, { backgroundColor: overviewBg }]}>
        {/* Child Selector - Pill Segmented Control */}
        {children && children.length > 0 && (
          <View style={overviewStyles.childChipsRow}>
            <View 
              ref={containerRef}
              style={overviewStyles.segmentedControl}
              onLayout={(e) => {
                // Store container layout for reference
              }}
            >
              {/* Animated indicator */}
              <Animated.View
                style={[
                  overviewStyles.segmentedControlIndicator,
                  {
                    left: indicatorX,
                    width: indicatorWidth,
                  },
                ]}
                pointerEvents="none"
              />
              
              {sortedChildren.map((c) => {
                const isSelected = effectiveChildId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={overviewStyles.segmentedControlSegment}
                    onLayout={(e) => {
                      const { x, width } = e.nativeEvent.layout;
                      segmentPositions.current.set(c.id, { x, width });
                      if (isSelected) {
                        // Initialize indicator position if this is the active segment
                        indicatorX.setValue(x);
                        indicatorWidth.setValue(width);
                      }
                    }}
                    onPress={() => {
                      onChildChange && onChildChange(c.id);
                      animateToSegment(c.id);
                    }}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={[
                      overviewStyles.segmentedControlText,
                      isSelected && overviewStyles.segmentedControlTextActive
                    ]}>
                      {c.first_name || c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Avatar for selected child */}
        {effectiveChildId && effectiveChild && (() => {
          // Get child's avatar color for background with lower opacity
          const childColor = getChildColorFromAvatar(effectiveChild.avatar);
          const hexToRgba = (hex, opacity = 1) => {
            if (!hex) return null;
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (!result) return hex;
            const r = parseInt(result[1], 16);
            const g = parseInt(result[2], 16);
            const b = parseInt(result[3], 16);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
          };
          const avatarBgColor = childColor ? hexToRgba(childColor, 0.55) : null;
          
          // Create flip animation style
          const flipInterpolate = avatarFlipAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '180deg'],
          });
          
          // Calculate age from date_of_birth
          const calculateAge = (dateOfBirth) => {
            if (!dateOfBirth) return null;
            const birthDate = new Date(dateOfBirth);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              age--;
            }
            return age;
          };
          
          const age = effectiveChild.date_of_birth ? calculateAge(effectiveChild.date_of_birth) : null;
          const childName = effectiveChild.first_name || effectiveChild.name || '';
          const grade = effectiveChild.grade || effectiveChild.grade_label || null;
          
          // Helper function to clean up interests (handle JSON strings, arrays, nested arrays)
          const formatInterests = (interestsData) => {
            if (!interestsData) return null;
            
            let interestsArray = [];
            
            // If it's already an array, use it
            if (Array.isArray(interestsData)) {
              interestsArray = interestsData;
            } 
            // If it's a string, try to parse it as JSON
            else if (typeof interestsData === 'string') {
              try {
                const parsed = JSON.parse(interestsData);
                interestsArray = Array.isArray(parsed) ? parsed : [parsed];
              } catch (e) {
                // If parsing fails, treat as comma-separated string
                interestsArray = interestsData.split(',').map(s => s.trim()).filter(s => s);
              }
            }
            
            // Flatten nested arrays and clean up each item
            const flattened = [];
            const flatten = (arr) => {
              arr.forEach(item => {
                if (Array.isArray(item)) {
                  flatten(item);
                } else if (typeof item === 'string') {
                  // Remove quotes and brackets from string
                  const cleaned = item.replace(/^["\[\]]+|["\[\]]+$/g, '').trim();
                  if (cleaned) flattened.push(cleaned);
                } else if (item) {
                  flattened.push(String(item));
                }
              });
            };
            flatten(interestsArray);
            
            return flattened.length > 0 ? flattened.join(', ') : null;
          };
          
          // Check child record first (from onboarding), then preferences tables
          const interests = effectiveChild.interests 
            ? formatInterests(effectiveChild.interests)
            : formatInterests(childPreferences?.interests);
          const learningStyle = effectiveChild.learning_style || effectiveChild.style || childPreferences?.learning_style || null;
          
          // Get state standards for this child (if any)
          // First check the child's standards field from onboarding, then check user_standards_preferences
          const childStandardsFromRecord = effectiveChild.standards || effectiveChild.standards_state || null;
          const hasStandardsPrefs = childStandards.length > 0;
          const standardsText = childStandardsFromRecord 
            ? childStandardsFromRecord
            : (hasStandardsPrefs 
              ? childStandards.map(s => `${s.state_code} ${s.grade_level}${s.standards_set ? ` (${s.standards_set})` : ''}`).join(', ')
              : null);
          
          return (
            <View style={overviewStyles.avatarContainer}>
              <TouchableOpacity
                style={overviewStyles.avatarFlipContainer}
                onPress={() => {
                  // Open settings modal to family page
                  if (onOpenSettings) {
                    onOpenSettings('family');
                  }
                  // Open edit child modal for the selected child
                  if (onEditChild && effectiveChild) {
                    onEditChild(effectiveChild);
                  }
                }}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                })}
              >
                <Animated.View
                  style={[
                    overviewStyles.avatarImage,
                    avatarBgColor && { backgroundColor: avatarBgColor },
                    {
                      transform: [{ rotateY: flipInterpolate }],
                    },
                  ]}
                >
                  <Image
                    source={resolveAvatarSource(effectiveChild.avatar)}
                    style={overviewStyles.avatarImageInner}
                    resizeMode="cover"
                  />
                </Animated.View>
              </TouchableOpacity>
              
              {/* Child Information */}
              <View style={overviewStyles.childInfoContainer}>
                <Text style={overviewStyles.childName}>{childName}</Text>
                
                <View style={overviewStyles.childInfoRow}>
                  {age !== null && (
                    <Text style={overviewStyles.childInfoText}>{age} YEARS OLD</Text>
                  )}
                  {grade && (
                    <>
                      {age !== null && <Text style={overviewStyles.childInfoText}> • </Text>}
                      <Text style={overviewStyles.childInfoText}>GRADE {grade}</Text>
                    </>
                  )}
                </View>
                
                {standardsText && (
                  <Text style={overviewStyles.childInfoText}>STATE STANDARDS: {standardsText.toUpperCase()}</Text>
                )}
                
                {interests && (
                  <Text style={overviewStyles.childInfoText}>INTERESTS: {interests.toUpperCase()}</Text>
                )}
                
                {learningStyle && (
                  <Text style={overviewStyles.childInfoText}>LEARNING STYLE: {learningStyle.toUpperCase()}</Text>
                )}
              </View>
            </View>
          );
        })()}

        {/* Content */}
        <View style={overviewStyles.tabContent}>
            {/* Chart Tab: Subject Overview Grid */}
            {!hasLoadedOnce && subjects.length === 0 ? (
              <View style={overviewStyles.emptyContainer}>
                <Text style={overviewStyles.emptyText}>
                  Loading subjects...
                </Text>
              </View>
            ) : hasLoadedOnce && subjects.length === 0 ? (
              <View style={overviewStyles.emptyContainer}>
                <Text style={overviewStyles.emptyText}>
                  No subjects found. Add events with subjects to see them here.
                </Text>
              </View>
            ) : subjects.length > 0 ? (
              <>
                {/* Header - Term and Year */}
                <View style={overviewStyles.headerContainer}>
                  <View style={overviewStyles.headerLeft}>
                    <Text style={overviewStyles.headerText}>
                      {termName} {schoolYearEnd} - {childName}
                    </Text>
                  </View>
                </View>
                
                {/* Subject Overview List */}
                <View style={overviewStyles.subjectList}>
                {subjects.map((subject, index) => {
                  // Format next event text
                  let nextEventText = null;
                  if (subject.nextEvent) {
                    const eventDate = subject.nextEvent.start_ts ? new Date(subject.nextEvent.start_ts) : null;
                    if (eventDate) {
                      const isOverdue = subject.hasOverdue;
                      const dateStr = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      const eventType = (subject.nextEvent.event_type || subject.nextEvent.type || '').toLowerCase();
                      const eventTitle = subject.nextEvent.title || 'Event';
                      if (eventType === 'assignment' || eventType === 'homework') {
                        nextEventText = isOverdue ? `Overdue: ${eventTitle}` : `Next: ${eventTitle} on ${dateStr}`;
                      } else if (eventType === 'project') {
                        nextEventText = isOverdue ? `Overdue: ${eventTitle}` : `Next: ${eventTitle} on ${dateStr}`;
                      } else if (eventType === 'assessment') {
                        nextEventText = isOverdue ? `Overdue: ${eventTitle}` : `Next: ${eventTitle} on ${dateStr}`;
                      } else {
                        nextEventText = `${eventTitle} on ${dateStr}`;
                      }
                    }
                  }
                  
                  const isHovered = hoveredSubjectId === subject.id;
                  
                  return (
                    <View key={subject.id}>
                      <View
                        style={[
                          overviewStyles.subjectListItem,
                          Platform.OS === 'web' && { cursor: 'pointer' }
                        ]}
                        {...(Platform.OS === 'web' && {
                          onMouseEnter: () => setHoveredSubjectId(subject.id),
                          onMouseLeave: () => setHoveredSubjectId(null),
                        })}
                      >
                        <TouchableOpacity 
                          style={overviewStyles.subjectListItemContent}
                          onPress={() => {
                            setSelectedSubjectId(subject.id);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={overviewStyles.subjectListItemMain}>
                            <Text style={overviewStyles.subjectListItemTitle}>{subject.name}</Text>
                            
                            {/* Core Goal */}
                            {subject.coreGoal && (
                              <Text style={overviewStyles.subjectListItemValue} numberOfLines={1}>
                                {subject.coreGoal}
                              </Text>
                            )}
                            
                            {/* Current Focus */}
                            {subject.currentFocus && (
                              <Text style={overviewStyles.subjectListItemValue} numberOfLines={1}>
                                {subject.currentFocus}
                              </Text>
                            )}
                            
                            {/* Next Event with Clock */}
                            {nextEventText && (
                              <View style={overviewStyles.subjectListItemDate}>
                                <Clock size={12} color={subject.hasOverdue ? '#ef4444' : tokens.textSecondary} />
                                <Text style={[
                                  overviewStyles.subjectListItemDateText,
                                  subject.hasOverdue && { color: '#ef4444' }
                                ]}>
                                  {nextEventText}
                                </Text>
                              </View>
                            )}
                          </View>
                          
                          {/* Chips Row - Only show on hover */}
                          {isHovered && (
                            <View style={overviewStyles.chipsRow}>
                              <TouchableOpacity
                                style={[
                                  overviewStyles.chip,
                                  hoveredChipId === `${subject.id}-syllabus` && overviewStyles.chipHovered
                                ]}
                                onPress={() => handleChipPress('syllabus', subject)}
                                activeOpacity={0.7}
                                {...(Platform.OS === 'web' && {
                                  onMouseEnter: () => setHoveredChipId(`${subject.id}-syllabus`),
                                  onMouseLeave: () => setHoveredChipId(null),
                                })}
                              >
                                <FileText size={14} color={hoveredChipId === `${subject.id}-syllabus` ? '#2563eb' : tokens.textSecondary} />
                                <Text style={[
                                  overviewStyles.chipText,
                                  hoveredChipId === `${subject.id}-syllabus` && overviewStyles.chipTextHovered
                                ]}>Syllabus</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  overviewStyles.chip,
                                  hoveredChipId === `${subject.id}-lessonPlans` && overviewStyles.chipHovered
                                ]}
                                onPress={() => handleChipPress('lessonPlans', subject)}
                                activeOpacity={0.7}
                                {...(Platform.OS === 'web' && {
                                  onMouseEnter: () => setHoveredChipId(`${subject.id}-lessonPlans`),
                                  onMouseLeave: () => setHoveredChipId(null),
                                })}
                              >
                                <BookOpen size={14} color={hoveredChipId === `${subject.id}-lessonPlans` ? '#2563eb' : tokens.textSecondary} />
                                <Text style={[
                                  overviewStyles.chipText,
                                  hoveredChipId === `${subject.id}-lessonPlans` && overviewStyles.chipTextHovered
                                ]}>Lesson Plans</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  overviewStyles.chip,
                                  hoveredChipId === `${subject.id}-projects` && overviewStyles.chipHovered
                                ]}
                                onPress={() => handleChipPress('projects', subject)}
                                activeOpacity={0.7}
                                {...(Platform.OS === 'web' && {
                                  onMouseEnter: () => setHoveredChipId(`${subject.id}-projects`),
                                  onMouseLeave: () => setHoveredChipId(null),
                                })}
                              >
                                <Target size={14} color={hoveredChipId === `${subject.id}-projects` ? '#2563eb' : tokens.textSecondary} />
                                <Text style={[
                                  overviewStyles.chipText,
                                  hoveredChipId === `${subject.id}-projects` && overviewStyles.chipTextHovered
                                ]}>Projects</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  overviewStyles.chip,
                                  hoveredChipId === `${subject.id}-grades` && overviewStyles.chipHovered
                                ]}
                                onPress={() => handleChipPress('grades', subject)}
                                activeOpacity={0.7}
                                {...(Platform.OS === 'web' && {
                                  onMouseEnter: () => setHoveredChipId(`${subject.id}-grades`),
                                  onMouseLeave: () => setHoveredChipId(null),
                                })}
                              >
                                <BarChart3 size={14} color={hoveredChipId === `${subject.id}-grades` ? '#2563eb' : tokens.textSecondary} />
                                <Text style={[
                                  overviewStyles.chipText,
                                  hoveredChipId === `${subject.id}-grades` && overviewStyles.chipTextHovered
                                ]}>Grades</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  overviewStyles.chip,
                                  hoveredChipId === `${subject.id}-pacing` && overviewStyles.chipHovered
                                ]}
                                onPress={() => handleChipPress('pacing', subject)}
                                activeOpacity={0.7}
                                {...(Platform.OS === 'web' && {
                                  onMouseEnter: () => setHoveredChipId(`${subject.id}-pacing`),
                                  onMouseLeave: () => setHoveredChipId(null),
                                })}
                              >
                                <TrendingUp size={14} color={hoveredChipId === `${subject.id}-pacing` ? '#2563eb' : tokens.textSecondary} />
                                <Text style={[
                                  overviewStyles.chipText,
                                  hoveredChipId === `${subject.id}-pacing` && overviewStyles.chipTextHovered
                                ]}>Pacing</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>
                      {/* Divider line - show between items, not after last */}
                      {index < subjects.length - 1 && (
                        <View style={overviewStyles.subjectListDivider} />
                      )}
                    </View>
                  );
                })}
                </View>
              </>
            ) : null}

            {/* Mastery Charts Section - Only show for selected child */}
            {effectiveChildId && children && children.length > 0 && (() => {
              const effectiveChild = child || sortedChildren.find(c => c.id === effectiveChildId);
              if (!effectiveChild) return null;

              return (
                <View style={overviewStyles.masterySection}>
                  {loadingGrades ? (
                    <View style={overviewStyles.masteryLoading}>
                      <ActivityIndicator size="small" color={tokens.accent} />
                      <Text style={overviewStyles.masteryLoadingText}>Loading grades...</Text>
                    </View>
                  ) : (
                    (() => {
                      const childGrades = gradesByChild[effectiveChild.id] || [];
                      const gradeCount = childGrades.length;
                      const hasEnoughGrades = gradeCount >= 20;
                      const childName = effectiveChild.first_name || effectiveChild.name || 'Child';
                      // Use child's own data (from children array or loaded child data)
                      const learningStyle = effectiveChild.learning_style || effectiveChild.style || null;
                      // Handle interests - could be string, array, or JSON string
                      let interests = null;
                      if (effectiveChild.interests) {
                        try {
                          interests = typeof effectiveChild.interests === 'string' ? JSON.parse(effectiveChild.interests) : effectiveChild.interests;
                          if (!Array.isArray(interests)) interests = [interests];
                        } catch {
                          interests = typeof effectiveChild.interests === 'string' ? effectiveChild.interests.split(',').map(i => i.trim()) : effectiveChild.interests;
                        }
                      }
                      const qualities = effectiveChild.qualities || null;

                      // Get child's avatar color for mastery card background
                      const childColor = effectiveChild.avatar ? getChildColorFromAvatar(effectiveChild.avatar) : null;
                      // Blend color with white at 10% color / 90% white ratio for subtle background
                      const blendWithWhite = (hex, ratio = 0.1) => {
                        if (!hex) return null;
                        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        if (!result) return hex;
                        const r = parseInt(result[1], 16);
                        const g = parseInt(result[2], 16);
                        const b = parseInt(result[3], 16);
                        // Blend: 90% white (255) + 10% color
                        const blendedR = Math.round(255 * (1 - ratio) + r * ratio);
                        const blendedG = Math.round(255 * (1 - ratio) + g * ratio);
                        const blendedB = Math.round(255 * (1 - ratio) + b * ratio);
                        return `#${blendedR.toString(16).padStart(2, '0')}${blendedG.toString(16).padStart(2, '0')}${blendedB.toString(16).padStart(2, '0')}`;
                      };
                      const masteryCardBg = childColor ? blendWithWhite(childColor, 0.1) : (tokens.card || '#ffffff');

                      return (
                        <View key={effectiveChild.id} style={overviewStyles.masteryCard}>
                          <View style={[overviewStyles.masteryCardHeader, { backgroundColor: masteryCardBg }]}>
                            <Text style={overviewStyles.masteryCardTitle}>{childName.toUpperCase()}'S MASTERY AND SKILLS</Text>
                            {hasEnoughGrades && (
                              <Text style={overviewStyles.masteryCardSubtitle}>{gradeCount} grades</Text>
                            )}
                          </View>
                          <View style={overviewStyles.masteryCardContent}>

                          {hasEnoughGrades ? (
                            <View style={overviewStyles.masteryChartContainer}>
                              {/* Calculate mastery metrics */}
                              {(() => {
                                const numericGrades = childGrades
                                  .filter(g => g.grade != null)
                                  .map(g => {
                                    // Handle different grade formats
                                    const grade = g.grade;
                                    if (typeof grade === 'number') return grade;
                                    if (typeof grade === 'string') {
                                      // Try to parse percentage (e.g., "85%")
                                      const percentMatch = grade.match(/(\d+(?:\.\d+)?)%/);
                                      if (percentMatch) return parseFloat(percentMatch[1]);
                                      // Try to parse letter grade (A=95, B=85, C=75, D=65, F=55)
                                      const letterGrade = grade.toUpperCase().trim();
                                      if (letterGrade === 'A' || letterGrade === 'A+') return 95;
                                      if (letterGrade === 'A-') return 90;
                                      if (letterGrade === 'B' || letterGrade === 'B+') return 85;
                                      if (letterGrade === 'B-') return 80;
                                      if (letterGrade === 'C' || letterGrade === 'C+') return 75;
                                      if (letterGrade === 'C-') return 70;
                                      if (letterGrade === 'D' || letterGrade === 'D+') return 65;
                                      if (letterGrade === 'D-') return 60;
                                      if (letterGrade === 'F') return 55;
                                      // Try to parse as number
                                      const num = parseFloat(grade);
                                      if (!isNaN(num)) return num;
                                    }
                                    return null;
                                  })
                                  .filter(g => g != null && g >= 0 && g <= 100);

                                if (numericGrades.length === 0) {
                                  return (
                                    <View style={overviewStyles.masteryEmpty}>
                                      <Text style={overviewStyles.masteryEmptyText}>
                                        No valid grades found to calculate mastery.
                                      </Text>
                                    </View>
                                  );
                                }

                                const average = numericGrades.reduce((sum, g) => sum + g, 0) / numericGrades.length;
                                const excellent = numericGrades.filter(g => g >= 90).length;
                                const good = numericGrades.filter(g => g >= 80 && g < 90).length;
                                const needsImprovement = numericGrades.filter(g => g < 80).length;
                                const total = numericGrades.length;

                                // Log feedback about learning style, interests, and qualities
                                if (learningStyle || interests || qualities) {
                                  console.log(`[Mastery Charts] ${childName} - Learning insights:`, {
                                    learningStyle,
                                    interests,
                                    qualities,
                                    averageGrade: average.toFixed(1),
                                    totalGrades: total,
                                    message: 'Learning style, interests, and qualities help personalize instruction and improve results'
                                  });
                                }

                                return (
                                  <View style={overviewStyles.masteryMetrics}>
                                    <View style={overviewStyles.masteryMetric}>
                                      <Text style={overviewStyles.masteryMetricLabel}>Average</Text>
                                      <Text style={overviewStyles.masteryMetricValue}>{average.toFixed(1)}%</Text>
                                    </View>
                                    <View style={overviewStyles.masteryBars}>
                                      <View style={overviewStyles.masteryBar}>
                                        <View style={overviewStyles.masteryBarLabel}>
                                          <Text style={overviewStyles.masteryBarText}>Excellent (90+)</Text>
                                          <Text style={overviewStyles.masteryBarCount}>{excellent}</Text>
                                        </View>
                                        <View style={overviewStyles.masteryBarTrack}>
                                          <View style={[
                                            overviewStyles.masteryBarFill,
                                            { width: `${(excellent / total) * 100}%`, backgroundColor: '#10b981' }
                                          ]} />
                                        </View>
                                      </View>
                                      <View style={overviewStyles.masteryBar}>
                                        <View style={overviewStyles.masteryBarLabel}>
                                          <Text style={overviewStyles.masteryBarText}>Good (80-89)</Text>
                                          <Text style={overviewStyles.masteryBarCount}>{good}</Text>
                                        </View>
                                        <View style={overviewStyles.masteryBarTrack}>
                                          <View style={[
                                            overviewStyles.masteryBarFill,
                                            { width: `${(good / total) * 100}%`, backgroundColor: '#3b82f6' }
                                          ]} />
                                        </View>
                                      </View>
                                      <View style={overviewStyles.masteryBar}>
                                        <View style={overviewStyles.masteryBarLabel}>
                                          <Text style={overviewStyles.masteryBarText}>Needs Improvement (&lt;80)</Text>
                                          <Text style={overviewStyles.masteryBarCount}>{needsImprovement}</Text>
                                        </View>
                                        <View style={overviewStyles.masteryBarTrack}>
                                          <View style={[
                                            overviewStyles.masteryBarFill,
                                            { width: `${(needsImprovement / total) * 100}%`, backgroundColor: '#ef4444' }
                                          ]} />
                                        </View>
                                      </View>
                                    </View>
                                  </View>
                                );
                              })()}

                              {/* Enhanced Analytics Sections - Only show when hasEnoughGrades */}
                              {hasEnoughGrades && (
                                <>
                                  {/* Skills Overview (Learning Map) */}
                                  {skillsData.length > 0 && (
                                    <View style={{ marginTop: spacing.xl, paddingTop: spacing.xl, borderTopWidth: 1, borderTopColor: tokens.border }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
                                        <MapPin size={18} color={tokens.accent} style={{ marginRight: spacing.sm }} />
                                        <Text style={[overviewStyles.masteryMetricLabel, { marginBottom: 0 }]}>SKILLS OVERVIEW (LEARNING MAP)</Text>
                                      </View>
                                      {loadingSkills ? (
                                        <ActivityIndicator size="small" color={tokens.accent} />
                                      ) : (
                                        <View style={{ gap: spacing.sm }}>
                                          <Text style={[overviewStyles.masteryEmptyText, { marginBottom: spacing.sm }]}>
                                            {skillsData.length} skills tracked across subjects
                                          </Text>
                                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                                            {skillsData.slice(0, 10).map((skill, idx) => {
                                              const proficiency = skill.proficiency || 'beginner';
                                              const colorMap = {
                                                beginner: '#ef4444',
                                                developing: '#f59e0b',
                                                proficient: '#3b82f6',
                                                advanced: '#10b981',
                                                expert: '#8b5cf6'
                                              };
                                              const bgColor = colorMap[proficiency] || '#6b7280';
                                              return (
                                                <View
                                                  key={skill.id || idx}
                                                  style={{
                                                    paddingHorizontal: spacing.sm,
                                                    paddingVertical: 4,
                                                    borderRadius: radius.sm,
                                                    backgroundColor: bgColor + '20',
                                                    borderWidth: 1,
                                                    borderColor: bgColor + '40'
                                                  }}
                                                >
                                                  <Text style={{ fontSize: 11, color: bgColor, fontWeight: '600', textTransform: 'capitalize' }}>
                                                    {skill.name || 'Unknown'}
                                                  </Text>
                                                </View>
                                              );
                                            })}
                                            {skillsData.length > 10 && (
                                              <Text style={{ fontSize: 12, color: tokens.textSecondary, alignSelf: 'center' }}>
                                                +{skillsData.length - 10} more
                                              </Text>
                                            )}
                                          </View>
                                        </View>
                                      )}
                                    </View>
                                  )}

                                  {/* Mastery Over Time (Charts/Heatmap) */}
                                  {masteryOverTime.length > 0 && (
                                    <View style={{ marginTop: spacing.xl, paddingTop: spacing.xl, borderTopWidth: 1, borderTopColor: tokens.border }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
                                        <TrendingUp size={18} color={tokens.accent} style={{ marginRight: spacing.sm }} />
                                        <Text style={[overviewStyles.masteryMetricLabel, { marginBottom: 0 }]}>MASTERY OVER TIME</Text>
                                      </View>
                                      {loadingMasteryTime ? (
                                        <ActivityIndicator size="small" color={tokens.accent} />
                                      ) : (
                                        <View style={{ gap: spacing.sm }}>
                                          <Text style={[overviewStyles.masteryEmptyText, { marginBottom: spacing.sm }]}>
                                            Tracking mastery trends over {Math.ceil(masteryOverTime.length / 4)} weeks
                                          </Text>
                                          {/* Simple trend visualization */}
                                          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 60, gap: 2 }}>
                                            {masteryOverTime.slice(-12).map((period, idx) => {
                                              const avgConfidence = parseFloat(period.avg_confidence) || 0;
                                              const height = Math.max((avgConfidence / 5) * 100, 5);
                                              return (
                                                <View
                                                  key={idx}
                                                  style={{
                                                    flex: 1,
                                                    height: '100%',
                                                    alignItems: 'center',
                                                    justifyContent: 'flex-end'
                                                  }}
                                                >
                                                  <View
                                                    style={{
                                                      width: '100%',
                                                      height: `${height}%`,
                                                      backgroundColor: avgConfidence >= 4 ? '#10b981' : avgConfidence >= 3 ? '#3b82f6' : '#f59e0b',
                                                      borderRadius: 2,
                                                      minHeight: 4
                                                    }}
                                                  />
                                                </View>
                                              );
                                            })}
                                          </View>
                                        </View>
                                      )}
                                    </View>
                                  )}

                                  {/* Strengths & Areas for Improvement */}
                                  {strengthsWeaknesses.length > 0 && (
                                    <View style={{ marginTop: spacing.xl, paddingTop: spacing.xl, borderTopWidth: 1, borderTopColor: tokens.border }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
                                        <Target size={18} color={tokens.accent} style={{ marginRight: spacing.sm }} />
                                        <Text style={[overviewStyles.masteryMetricLabel, { marginBottom: 0 }]}>STRENGTHS & AREAS FOR IMPROVEMENT</Text>
                                      </View>
                                      {loadingStrengths ? (
                                        <ActivityIndicator size="small" color={tokens.accent} />
                                      ) : (
                                        <View style={{ gap: spacing.md }}>
                                          {(() => {
                                            const strengths = strengthsWeaknesses.filter(s => s.is_strength).slice(0, 5);
                                            const weaknesses = strengthsWeaknesses.filter(s => s.is_weakness).slice(0, 5);
                                            return (
                                              <>
                                                {strengths.length > 0 && (
                                                  <View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                                                      <Award size={14} color="#10b981" style={{ marginRight: spacing.xs }} />
                                                      <Text style={[overviewStyles.masteryBarText, { color: '#10b981' }]}>Strengths</Text>
                                                    </View>
                                                    <View style={{ gap: spacing.xs }}>
                                                      {strengths.map((skill, idx) => (
                                                        <View key={skill.skill_id || idx} style={overviewStyles.masteryBar}>
                                                          <View style={overviewStyles.masteryBarLabel}>
                                                            <Text style={overviewStyles.masteryBarText}>{skill.skill_name || 'Unknown Skill'}</Text>
                                                            <Text style={[overviewStyles.masteryBarCount, { color: '#10b981' }]}>
                                                              {skill.proficiency || 'proficient'}
                                                            </Text>
                                                          </View>
                                                          <View style={overviewStyles.masteryBarTrack}>
                                                            <View style={[
                                                              overviewStyles.masteryBarFill,
                                                              { width: `${((parseFloat(skill.avg_confidence) || 0) / 5) * 100}%`, backgroundColor: '#10b981' }
                                                            ]} />
                                                          </View>
                                                        </View>
                                                      ))}
                                                    </View>
                                                  </View>
                                                )}
                                                {weaknesses.length > 0 && (
                                                  <View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                                                      <AlertCircle size={14} color="#f59e0b" style={{ marginRight: spacing.xs }} />
                                                      <Text style={[overviewStyles.masteryBarText, { color: '#f59e0b' }]}>Areas for Improvement</Text>
                                                    </View>
                                                    <View style={{ gap: spacing.xs }}>
                                                      {weaknesses.map((skill, idx) => (
                                                        <View key={skill.skill_id || idx} style={overviewStyles.masteryBar}>
                                                          <View style={overviewStyles.masteryBarLabel}>
                                                            <Text style={overviewStyles.masteryBarText}>{skill.skill_name || 'Unknown Skill'}</Text>
                                                            <Text style={[overviewStyles.masteryBarCount, { color: '#f59e0b' }]}>
                                                              {skill.proficiency || 'developing'}
                                                            </Text>
                                                          </View>
                                                          <View style={overviewStyles.masteryBarTrack}>
                                                            <View style={[
                                                              overviewStyles.masteryBarFill,
                                                              { width: `${((parseFloat(skill.avg_confidence) || 0) / 5) * 100}%`, backgroundColor: '#f59e0b' }
                                                            ]} />
                                                          </View>
                                                        </View>
                                                      ))}
                                                    </View>
                                                  </View>
                                                )}
                                              </>
                                            );
                                          })()}
                                        </View>
                                      )}
                                    </View>
                                  )}

                                  {/* Behavior Trends */}
                                  <View style={{ marginTop: spacing.xl, paddingTop: spacing.xl, borderTopWidth: 1, borderTopColor: tokens.border }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
                                      <Activity size={18} color={tokens.accent} style={{ marginRight: spacing.sm }} />
                                      <Text style={[overviewStyles.masteryMetricLabel, { marginBottom: 0 }]}>BEHAVIOR TRENDS</Text>
                                    </View>
                                    <View style={{ gap: spacing.sm }}>
                                      {/* Calculate behavior trends from attendance and grades */}
                                      {(() => {
                                        const recentGrades = childGrades.slice(0, 10);
                                        const recentAttendance = attendanceData.slice(0, 30);
                                        const avgGrade = recentGrades.length > 0 
                                          ? recentGrades.reduce((sum, g) => {
                                              const grade = typeof g.grade === 'number' ? g.grade : parseFloat(g.grade);
                                              return sum + (isNaN(grade) ? 0 : grade);
                                            }, 0) / recentGrades.length
                                          : 0;
                                        const attendanceRate = recentAttendance.length > 0
                                          ? (recentAttendance.filter(a => a.status === 'present').length / recentAttendance.length) * 100
                                          : 0;
                                        
                                        return (
                                          <View style={{ gap: spacing.sm }}>
                                            <View style={overviewStyles.masteryBar}>
                                              <View style={overviewStyles.masteryBarLabel}>
                                                <Text style={overviewStyles.masteryBarText}>Recent Performance</Text>
                                                <Text style={overviewStyles.masteryBarCount}>{avgGrade.toFixed(1)}% avg</Text>
                                              </View>
                                              <View style={overviewStyles.masteryBarTrack}>
                                                <View style={[
                                                  overviewStyles.masteryBarFill,
                                                  { width: `${avgGrade}%`, backgroundColor: avgGrade >= 90 ? '#10b981' : avgGrade >= 80 ? '#3b82f6' : '#f59e0b' }
                                                ]} />
                                              </View>
                                            </View>
                                            <View style={overviewStyles.masteryBar}>
                                              <View style={overviewStyles.masteryBarLabel}>
                                                <Text style={overviewStyles.masteryBarText}>Attendance Rate</Text>
                                                <Text style={overviewStyles.masteryBarCount}>{attendanceRate.toFixed(0)}%</Text>
                                              </View>
                                              <View style={overviewStyles.masteryBarTrack}>
                                                <View style={[
                                                  overviewStyles.masteryBarFill,
                                                  { width: `${attendanceRate}%`, backgroundColor: attendanceRate >= 90 ? '#10b981' : attendanceRate >= 80 ? '#3b82f6' : '#f59e0b' }
                                                ]} />
                                              </View>
                                            </View>
                                          </View>
                                        );
                                      })()}
                                    </View>
                                  </View>
                                </>
                              )}
                            </View>
                          ) : (
                            <View style={overviewStyles.masteryEmptyState}>
                              <BarChart3 size={32} color={tokens.textSecondary} style={{ opacity: 0.5, marginBottom: spacing.sm }} />
                              <Text style={overviewStyles.masteryEmptyTitle}>
                                Need at least 20 grades to show mastery charts
                              </Text>
                              <Text style={overviewStyles.masteryEmptyText}>
                                Currently have {gradeCount} grade{gradeCount !== 1 ? 's' : ''}. Add {20 - gradeCount} more grade{20 - gradeCount !== 1 ? 's' : ''} to see mastery insights.
                              </Text>
                              {/* Tip - shown when there's learning style, interests, or qualities info */}
                              {(learningStyle || interests || qualities) && (
                                <Text style={overviewStyles.masteryTip}>
                                  <Text style={overviewStyles.masteryTipLabel}>Tip: </Text>
                                  Adding information about {childName}'s learning style, interests, and qualities helps personalize instruction and improve results.
                                </Text>
                              )}
                            </View>
                          )}
                          </View>
                        </View>
                      );
                    })()
                  )}

                  {/* Attendance Container - Below Mastery */}
                  {effectiveChildId && children && children.length > 0 && (() => {
                    const effectiveChild = child || sortedChildren.find(c => c.id === effectiveChildId);
                    if (!effectiveChild) {
                      console.log('[Activity Log] No effective child found', { effectiveChildId, child, sortedChildren: sortedChildren.length });
                      return null;
                    }

                    const childName = effectiveChild.first_name || effectiveChild.name || 'Child';
                    const childColor = effectiveChild.avatar ? getChildColorFromAvatar(effectiveChild.avatar) : null;
                    const blendWithWhite = (hex, ratio = 0.1) => {
                      if (!hex) return null;
                      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                      if (!result) return hex;
                      const r = parseInt(result[1], 16);
                      const g = parseInt(result[2], 16);
                      const b = parseInt(result[3], 16);
                      const blendedR = Math.round(255 * (1 - ratio) + r * ratio);
                      const blendedG = Math.round(255 * (1 - ratio) + g * ratio);
                      const blendedB = Math.round(255 * (1 - ratio) + b * ratio);
                      return `#${blendedR.toString(16).padStart(2, '0')}${blendedG.toString(16).padStart(2, '0')}${blendedB.toString(16).padStart(2, '0')}`;
                    };
                    const attendanceCardBg = childColor ? blendWithWhite(childColor, 0.1) : (tokens.card || '#ffffff');

                    // Get attendance for last 30 days
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    const recentAttendance = attendanceData.filter(a => {
                      const dayDate = new Date(a.day_date);
                      return dayDate >= thirtyDaysAgo;
                    });

                    // Calculate stats for last school week (7 days back)
                    const today = new Date();
                    const lastWeekStart = new Date(today);
                    lastWeekStart.setDate(today.getDate() - 7);
                    const lastWeekEnd = new Date(today);
                    
                    const lastWeekAttendance = recentAttendance.filter(a => {
                      const dayDate = new Date(a.day_date);
                      return dayDate >= lastWeekStart && dayDate <= lastWeekEnd;
                    });
                    const loggedDays = new Set(lastWeekAttendance.map(a => a.day_date)).size;
                    
                    // Expected school days - use 5 as default, but could be calculated from actual school schedule
                    // For now, use the higher of: actual logged days or 5 (minimum expected)
                    const expectedDays = Math.max(loggedDays, 5);
                    const attendanceRate = expectedDays > 0 ? Math.round((loggedDays / expectedDays) * 100) : 0;
                    const onTrack = loggedDays >= expectedDays || attendanceRate >= 90;

                    // Calculate weekly compliance for mini-trend (last 4 weeks)
                    const weeklyCompliance = [];
                    for (let i = 3; i >= 0; i--) {
                      const weekStart = new Date();
                      weekStart.setDate(weekStart.getDate() - (i * 7) - 7);
                      const weekEnd = new Date();
                      weekEnd.setDate(weekEnd.getDate() - (i * 7));
                      
                      const weekAttendance = recentAttendance.filter(a => {
                        const dayDate = new Date(a.day_date);
                        return dayDate >= weekStart && dayDate < weekEnd;
                      });
                      
                      const weekLoggedDays = new Set(weekAttendance.map(a => a.day_date)).size;
                      const weekPresentCount = weekAttendance.filter(a => a.status === 'present').length;
                      
                      if (weekLoggedDays === 0) {
                        weeklyCompliance.push(null); // Not required (gray circle)
                      } else {
                        // Compliant if all logged days are present, or high present rate
                        const weekRate = weekAttendance.length > 0 
                          ? Math.round((weekPresentCount / weekAttendance.length) * 100) 
                          : 0;
                        weeklyCompliance.push(weekRate >= 90 || weekPresentCount === weekLoggedDays);
                      }
                    }

                    return (
                      <View style={overviewStyles.attendanceSection}>
                        <View style={overviewStyles.attendanceCard}>
                          <View style={[overviewStyles.attendanceCardHeader, { backgroundColor: attendanceCardBg }]}>
                            <Text style={overviewStyles.attendanceCardTitle}>ACTIVITY LOG</Text>
                            {!loadingAttendance && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                                {onTrack && (
                                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#10B981' }}>✓ On track</Text>
                                )}
                              </View>
                            )}
                          </View>
                          <View style={overviewStyles.attendanceCardContent}>
                            {loadingAttendance ? (
                              <View style={overviewStyles.masteryLoading}>
                                <ActivityIndicator size="small" color={tokens.accent} />
                                <Text style={overviewStyles.masteryLoadingText}>Loading activity log...</Text>
                              </View>
                            ) : (
                              <>
                                {/* Main body - single row, dominant */}
                                <View style={{ marginBottom: spacing.sm }}>
                                  <Text style={{ fontSize: 20, fontWeight: '600', fontFamily: designTokens.fonts.display, color: tokens.text, marginBottom: spacing.xs }}>
                                    {loggedDays} / {expectedDays} school days logged
                                  </Text>
                                  <Text style={{ fontSize: 16, fontWeight: '500', fontFamily: designTokens.fonts.sans, color: tokens.textSecondary }}>
                                    Attendance rate: {attendanceRate}%
                                  </Text>
                                </View>

                                {/* Secondary reassurance */}
                                <Text style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: spacing.md }}>
                                  All required attendance days in the last school week have been logged.
                                </Text>

                                {/* Divider */}
                                <View style={{ height: 1, backgroundColor: tokens.border || '#e5e7eb', marginVertical: spacing.md }} />

                                {/* Optional mini-trend */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: tokens.text, marginRight: spacing.xs }}>Last 4 weeks:</Text>
                                  {weeklyCompliance.map((compliant, index) => {
                                    if (compliant === null) {
                                      // Not required - gray circle
                                      return (
                                        <View key={index} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: tokens.border || '#e5e7eb' }} />
                                      );
                                    } else if (compliant) {
                                      // Compliant - green check
                                      return (
                                        <Text key={index} style={{ fontSize: 14, color: '#10B981', fontWeight: '600' }}>✓</Text>
                                      );
                                    } else {
                                      // Not compliant - gray circle
                                      return (
                                        <View key={index} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: tokens.border || '#e5e7eb' }} />
                                      );
                                    }
                                  })}
                                </View>

                                {/* Footer CTA */}
                                <TouchableOpacity
                                  style={overviewStyles.attendanceViewAllButton}
                                  onPress={() => setShowAttendanceModal(true)}
                                >
                                  <Text style={overviewStyles.attendanceViewAllText}>View detailed attendance →</Text>
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Compliance Dashboard Container */}
                  {effectiveChildId && children && children.length > 0 && (() => {
                    const effectiveChild = child || sortedChildren.find(c => c.id === effectiveChildId);
                    if (!effectiveChild) return null;

                    const childName = effectiveChild.first_name || effectiveChild.name || 'Child';
                    const childColor = effectiveChild.avatar ? getChildColorFromAvatar(effectiveChild.avatar) : null;
                    const blendWithWhite = (hex, ratio = 0.1) => {
                      if (!hex) return null;
                      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                      if (!result) return hex;
                      const r = parseInt(result[1], 16);
                      const g = parseInt(result[2], 16);
                      const b = parseInt(result[3], 16);
                      const blendedR = Math.round(255 * (1 - ratio) + r * ratio);
                      const blendedG = Math.round(255 * (1 - ratio) + g * ratio);
                      const blendedB = Math.round(255 * (1 - ratio) + b * ratio);
                      return `#${blendedR.toString(16).padStart(2, '0')}${blendedG.toString(16).padStart(2, '0')}${blendedB.toString(16).padStart(2, '0')}`;
                    };
                    const complianceCardBg = childColor ? blendWithWhite(childColor, 0.1) : (tokens.card || '#ffffff');

                    // Get state and grade from child details - use standards/standards_state field (same as Edit Child modal)
                    const childState = effectiveChild.standards || effectiveChild.standards_state || effectiveChild.state_code || effectiveChild.state || childStateCode || complianceStateCode || 'CA';
                    const childGrade = effectiveChild.grade ? effectiveChild.grade.replace(/^(K|Kindergarten)$/i, 'K').replace(/(\d+)(st|nd|rd|th)?\s*Grade/i, '$1').trim() : complianceGrade || '6';
                    const stateNames = { 
                      'CA': 'California', 
                      'NY': 'New York', 
                      'TX': 'Texas', 
                      'FL': 'Florida',
                      'DC': 'District of Columbia',
                      'MD': 'Maryland',
                      'VA': 'Virginia'
                    };
                    const stateName = stateNames[childState] || childState;


                    // Get compliance checklist for this child
                    const childComplianceItems = (complianceData || []).filter(item => 
                      item.child_id === effectiveChildId && 
                      (item.requirement?.state_code === childState || !item.requirement?.state_code || item.state_code === childState)
                    );

                    // Calculate coverage from attendance data
                    const childAttendance = attendanceData?.filter(a => a.child_id === effectiveChildId) || [];
                    const totalSchoolDays = 180; // Standard school year
                    const loggedDays = new Set(childAttendance.map(a => a.day_date)).size;
                    const coveragePercent = totalSchoolDays > 0 ? Math.round((loggedDays / totalSchoolDays) * 100) : 0;
                    const isOnTrack = coveragePercent >= 90;

                    // Calculate credits from grades (sum of credits field)
                    const childGradesList = gradesByChild[effectiveChildId] || [];
                    const earnedCredits = childGradesList.reduce((sum, grade) => {
                      const credits = grade.credits ? parseFloat(grade.credits) : 0;
                      return sum + (isNaN(credits) ? 0 : credits);
                    }, 0);
                    const requiredCredits = 6; // Default, could come from state requirements
                    const complianceCredits = {
                      earned: Math.round(earnedCredits * 10) / 10, // Round to 1 decimal
                      required: requiredCredits
                    };

                    // Calculate portfolio evidence count
                    const portfolioEvidenceCount = portfolioUploads?.filter(upload => 
                      upload.child_id === effectiveChildId
                    ).length || 0;
                    const hasPortfolioEvidence = portfolioEvidenceCount > 0;

                    // Build the 4 required compliance checklist items
                    // These are always shown regardless of database state
                    const checklistItems = [
                      {
                        id: 'attendance-logged',
                        item: 'Attendance logged',
                        status: loggedDays >= 180 ? 'completed' : loggedDays > 0 ? 'in_progress' : 'pending',
                        evidence: `${loggedDays}/${totalSchoolDays} days`,
                        category: 'Attendance',
                        evidenceLink: () => {
                          // Open attendance modal when tapped
                          setShowAttendanceModal(true);
                        },
                        tooltip: 'Required for state compliance. Most states require 180 days of instruction per year.'
                      },
                      {
                        id: 'subjects-covered',
                        item: 'Required subjects covered',
                        status: subjects.length >= 3 ? 'completed' : subjects.length > 0 ? 'in_progress' : 'pending',
                        evidence: `${subjects.length} subject${subjects.length !== 1 ? 's' : ''}`,
                        category: 'Subjects',
                        evidenceLink: () => {
                          // Could navigate to subjects view
                        },
                        tooltip: 'Ensure core subjects are covered according to your state requirements.'
                      },
                      {
                        id: 'portfolio-evidence',
                        item: 'Portfolio evidence attached',
                        status: hasPortfolioEvidence ? 'completed' : 'pending',
                        evidence: hasPortfolioEvidence ? `${portfolioEvidenceCount} file${portfolioEvidenceCount !== 1 ? 's' : ''}` : 'No files',
                        category: 'Documentation',
                        evidenceLink: () => {
                          // Navigate to portfolio/evidence view
                          onTabChange('records');
                        },
                        tooltip: 'Maintain a portfolio of student work samples for compliance reviews.'
                      },
                      {
                        id: 'standardized-testing',
                        item: 'Standardized testing',
                        status: 'pending',
                        evidence: null,
                        category: 'Assessments',
                        evidenceLink: () => {
                          // Could navigate to assessments view
                        },
                        tooltip: 'Optional in most states, but recommended for tracking academic progress.',
                        isOptional: true
                      }
                    ];

                    // Group by category
                    const checklistByCategory = {
                      'Attendance': [],
                      'Subjects': [],
                      'Documentation': [],
                      'Assessments': []
                    };

                    checklistItems.forEach(item => {
                      if (!checklistByCategory[item.category]) {
                        checklistByCategory[item.category] = [];
                      }
                      checklistByCategory[item.category].push(item);
                    });

                    return (
                      <View style={overviewStyles.attendanceSection}>
                        <View style={overviewStyles.attendanceCard}>
                          <View style={[overviewStyles.attendanceCardHeader, { backgroundColor: complianceCardBg }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={overviewStyles.attendanceCardTitle}>Compliance</Text>
                              <Text style={[overviewStyles.attendanceCardSubtitle, { marginTop: 2, fontSize: 12 }]}>
                                {stateName} · Grade {childGrade}
                              </Text>
                            </View>
                            {isOnTrack && (
                              <Text style={{ fontSize: 14, fontWeight: '600', color: '#10B981' }}>✓ On track</Text>
                            )}
                          </View>
                          <View style={overviewStyles.attendanceCardContent}>
                            {/* Top metrics */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: tokens.border || '#e5e7eb' }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 4 }}>Coverage</Text>
                                <Text style={{ fontSize: 24, fontWeight: '700', fontFamily: designTokens.fonts.display, color: tokens.text }}>
                                  {coveragePercent}%
                                </Text>
                              </View>
                              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 4 }}>Credits</Text>
                                <Text style={{ fontSize: 24, fontWeight: '700', fontFamily: designTokens.fonts.display, color: tokens.text }}>
                                  {complianceCredits.earned} / {complianceCredits.required}
                                </Text>
                                <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 2 }}>required</Text>
                              </View>
                            </View>

                            {/* Progress ring visualization (simplified as progress bar) */}
                            <View style={{ marginBottom: spacing.md }}>
                              <View style={{ height: 8, backgroundColor: tokens.border || '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                                <View style={{ 
                                  height: '100%', 
                                  width: `${coveragePercent}%`, 
                                  backgroundColor: isOnTrack ? '#10B981' : '#3b82f6',
                                  borderRadius: 4
                                }} />
                              </View>
                            </View>

                            {/* Compliance Checklist - Collapsed preview */}
                            <View style={{ marginBottom: spacing.md }}>
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}
                                onPress={() => setShowComplianceChecklist(!showComplianceChecklist)}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '600', color: tokens.text }}>Compliance Checklist</Text>
                                {showComplianceChecklist ? (
                                  <ChevronUp size={16} color={tokens.textSecondary} />
                                ) : (
                                  <ChevronDown size={16} color={tokens.textSecondary} />
                                )}
                              </TouchableOpacity>
                              {!showComplianceChecklist && (
                                <View style={{ gap: spacing.xs }}>
                                  {checklistItems.map((item) => (
                                    <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                                      {item.status === 'completed' ? (
                                        <Text style={{ fontSize: 14, color: '#10B981' }}>✓</Text>
                                      ) : item.status === 'in_progress' ? (
                                        <Text style={{ fontSize: 14, color: '#3b82f6' }}>○</Text>
                                      ) : (
                                        <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: tokens.border || '#e5e7eb' }} />
                                      )}
                                      <Text style={{ fontSize: 12, color: tokens.text, flex: 1 }}>
                                        {item.item} {item.evidence && `(${item.evidence})`} {item.isOptional && '(optional)'}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                              {showComplianceChecklist && (
                                <View style={{ gap: spacing.md }}>
                                  {Object.entries(checklistByCategory).map(([category, items]) => {
                                    if (!items || items.length === 0) return null;
                                    return (
                                      <View key={category} style={{ marginBottom: spacing.sm }}>
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: tokens.textSecondary, textTransform: 'uppercase', marginBottom: spacing.xs }}>
                                          {category}
                                        </Text>
                                        {items.map((item) => (
                                          <TouchableOpacity
                                            key={item.id}
                                            onPress={item.evidenceLink || undefined}
                                            activeOpacity={item.evidenceLink ? 0.7 : 1}
                                            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.xs }}
                                          >
                                            {item.status === 'completed' ? (
                                              <Text style={{ fontSize: 14, color: '#10B981', marginTop: 2 }}>✓</Text>
                                            ) : item.status === 'in_progress' ? (
                                              <Text style={{ fontSize: 14, color: '#3b82f6', marginTop: 2 }}>○</Text>
                                            ) : (
                                              <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: tokens.border || '#e5e7eb', marginTop: 2 }} />
                                            )}
                                            <View style={{ flex: 1 }}>
                                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                                                <Text style={{ fontSize: 12, color: tokens.text }}>
                                                  {item.item} {item.isOptional && <Text style={{ fontSize: 11, color: tokens.textSecondary, fontStyle: 'italic' }}>(optional)</Text>}
                                                </Text>
                                              </View>
                                              {item.evidence && (
                                                <TouchableOpacity
                                                  onPress={item.evidenceLink}
                                                  activeOpacity={0.7}
                                                  style={{ marginTop: 2 }}
                                                >
                                                  <Text style={{ fontSize: 11, color: '#3b82f6', textDecorationLine: 'underline' }}>
                                                    {item.evidence} →
                                                  </Text>
                                                </TouchableOpacity>
                                              )}
                                              {item.tooltip && (
                                                <View style={{ marginTop: 2 }}>
                                                  <Text style={{ fontSize: 9, color: tokens.textSecondary, fontStyle: 'italic' }}>
                                                    {item.tooltip}
                                                  </Text>
                                                </View>
                                              )}
                                            </View>
                                          </TouchableOpacity>
                                        ))}
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>


                            {/* Generate Log */}
                            <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: tokens.border || '#e5e7eb' }}>
                              <View style={{ marginBottom: spacing.sm }}>
                                <Text style={{ fontSize: 11, color: tokens.textSecondary, lineHeight: 16, marginBottom: spacing.sm }}>
                                  Generate a log of highlighted activities completed, lessons taught, materials used, and work completed. We'll compile the collection using the most applicable examples for state reporting purposes.
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={overviewStyles.attendanceViewAllButton}
                                onPress={() => {
                                  setShowGenerateLogModal(true);
                                  loadLogSamples();
                                }}
                              >
                                <Text style={overviewStyles.attendanceViewAllText}>Generate Log →</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Grades & Goals Container */}
                  {effectiveChildId && children && children.length > 0 && (() => {
                    const effectiveChild = child || sortedChildren.find(c => c.id === effectiveChildId);
                    if (!effectiveChild) return null;

                    const childName = effectiveChild.first_name || effectiveChild.name || 'Child';
                    const childColor = effectiveChild.avatar ? getChildColorFromAvatar(effectiveChild.avatar) : null;
                    const blendWithWhite = (hex, ratio = 0.1) => {
                      if (!hex) return null;
                      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                      if (!result) return hex;
                      const r = parseInt(result[1], 16);
                      const g = parseInt(result[2], 16);
                      const b = parseInt(result[3], 16);
                      const blendedR = Math.round(255 * (1 - ratio) + r * ratio);
                      const blendedG = Math.round(255 * (1 - ratio) + g * ratio);
                      const blendedB = Math.round(255 * (1 - ratio) + b * ratio);
                      return `#${blendedR.toString(16).padStart(2, '0')}${blendedG.toString(16).padStart(2, '0')}${blendedB.toString(16).padStart(2, '0')}`;
                    };
                    const gradesCardBg = childColor ? blendWithWhite(childColor, 0.1) : (tokens.card || '#ffffff');

                    // Get child's grades grouped by subject
                    const childGrades = gradesByChild[effectiveChildId] || [];
                    
                    console.log('[Grades & Goals] Debug data:', {
                      effectiveChildId,
                      childGradesCount: childGrades.length,
                      subjectsCount: subjects.length,
                      childGrades: childGrades.slice(0, 5).map(g => ({
                        id: g.id,
                        subject_id: g.subject_id,
                        subject_id_type: typeof g.subject_id,
                        grade: g.grade,
                        source: g.source
                      })),
                      subjectIds: subjects.slice(0, 5).map(s => ({
                        id: s.id,
                        name: s.name,
                        id_type: typeof s.id
                      })),
                      matches: subjects.map(s => {
                        const matchingGrades = childGrades.filter(g => String(g.subject_id || '') === String(s.id || ''));
                        return {
                          subjectName: s.name,
                          subjectId: s.id,
                          hasGrades: matchingGrades.length > 0,
                          gradeCount: matchingGrades.length
                        };
                      }).filter(m => m.hasGrades)
                    });
                    
                    // Get subjects with grades, sorted by most recent grade
                    // Use string comparison to handle UUID matching
                    const subjectsWithGrades = subjects
                      .filter(subj => {
                        return childGrades.some(g => {
                          const gradeSubjectId = String(g.subject_id || '');
                          const subjectId = String(subj.id || '');
                          return gradeSubjectId === subjectId;
                        });
                      })
                      .sort((a, b) => {
                        const aGrades = childGrades.filter(g => String(g.subject_id || '') === String(a.id || ''));
                        const bGrades = childGrades.filter(g => String(g.subject_id || '') === String(b.id || ''));
                        if (aGrades.length === 0 && bGrades.length === 0) return 0;
                        if (aGrades.length === 0) return 1;
                        if (bGrades.length === 0) return -1;
                        const aLatest = new Date(aGrades[0]?.created_at || 0);
                        const bLatest = new Date(bGrades[0]?.created_at || 0);
                        return bLatest - aLatest;
                      });

                    // Helper to convert grade to numeric value for comparison
                    const gradeToNumeric = (grade) => {
                      if (!grade) return null;
                      if (typeof grade === 'number') return grade;
                      if (typeof grade === 'string') {
                        // Try to parse percentage (e.g., "85%")
                        const percentMatch = grade.match(/(\d+(?:\.\d+)?)%/);
                        if (percentMatch) return parseFloat(percentMatch[1]);
                        // Try to parse letter grade (A=95, B=85, C=75, D=65, F=55)
                        const letterGrade = grade.toUpperCase().trim();
                        if (letterGrade === 'A' || letterGrade === 'A+') return 95;
                        if (letterGrade === 'A-') return 90;
                        if (letterGrade === 'B' || letterGrade === 'B+') return 85;
                        if (letterGrade === 'B-') return 80;
                        if (letterGrade === 'C' || letterGrade === 'C+') return 75;
                        if (letterGrade === 'C-') return 70;
                        if (letterGrade === 'D' || letterGrade === 'D+') return 65;
                        if (letterGrade === 'D-') return 60;
                        if (letterGrade === 'F') return 55;
                        // Try to parse as number
                        const num = parseFloat(grade);
                        if (!isNaN(num)) return num;
                      }
                      return null;
                    };

                    // Calculate trend for each subject
                    const getSubjectTrend = (subjectId) => {
                      const subjectIdStr = String(subjectId || '');
                      const subjectGrades = childGrades
                        .filter(g => String(g.subject_id || '') === subjectIdStr)
                        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)); // Most recent first
                      
                      if (subjectGrades.length < 2) return null;
                      
                      // Get last 3-5 grades for trend calculation
                      const recentGrades = subjectGrades.slice(0, Math.min(5, subjectGrades.length));
                      const numericGrades = recentGrades.map(g => {
                        const num = gradeToNumeric(g.grade) || gradeToNumeric(g.score);
                        return num;
                      }).filter(n => n !== null);
                      
                      if (numericGrades.length < 2) return null;
                      
                      // Calculate average of first half vs second half
                      const midPoint = Math.floor(numericGrades.length / 2);
                      const recentAvg = numericGrades.slice(0, midPoint).reduce((sum, n) => sum + n, 0) / midPoint;
                      const olderAvg = numericGrades.slice(midPoint).reduce((sum, n) => sum + n, 0) / (numericGrades.length - midPoint);
                      
                      const diff = recentAvg - olderAvg;
                      if (diff > 3) return 'improving';
                      if (diff < -3) return 'declining';
                      return 'stable';
                    };

                    // Convert numeric grade back to letter grade
                    const numericToLetterGrade = (numeric) => {
                      if (numeric === null || numeric === undefined || isNaN(numeric)) return null;
                      if (numeric >= 97) return 'A+';
                      if (numeric >= 93) return 'A';
                      if (numeric >= 90) return 'A-';
                      if (numeric >= 87) return 'B+';
                      if (numeric >= 83) return 'B';
                      if (numeric >= 80) return 'B-';
                      if (numeric >= 77) return 'C+';
                      if (numeric >= 73) return 'C';
                      if (numeric >= 70) return 'C-';
                      if (numeric >= 67) return 'D+';
                      if (numeric >= 63) return 'D';
                      if (numeric >= 60) return 'D-';
                      return 'F';
                    };

                    // Calculate overall average grade for subject
                    const getLatestGrade = (subjectId) => {
                      const subjectIdStr = String(subjectId || '');
                      const subjectGrades = childGrades
                        .filter(g => String(g.subject_id || '') === subjectIdStr);
                      
                      if (subjectGrades.length === 0) return null;
                      
                      // Convert all grades to numeric values
                      const numericGrades = subjectGrades.map(g => {
                        const num = gradeToNumeric(g.grade) || gradeToNumeric(g.score);
                        return num;
                      }).filter(n => n !== null);
                      
                      if (numericGrades.length === 0) {
                        // If no numeric grades, return the most recent grade as-is
                        const sorted = subjectGrades.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                        return sorted[0].grade || sorted[0].score || null;
                      }
                      
                      // Calculate average
                      const average = numericGrades.reduce((sum, n) => sum + n, 0) / numericGrades.length;
                      
                      // Convert back to letter grade
                      return numericToLetterGrade(average);
                    };

                    // Calculate overall average across all subjects for the child
                    const calculateChildOverallAverage = () => {
                      if (subjectsWithGrades.length === 0) return null;
                      
                      // Get all numeric grades across all subjects
                      const allNumericGrades = [];
                      
                      subjectsWithGrades.forEach(subject => {
                        const subjectGrades = childGrades.filter(g => String(g.subject_id || '') === String(subject.id || ''));
                        const numericGrades = subjectGrades.map(g => {
                          const num = gradeToNumeric(g.grade) || gradeToNumeric(g.score);
                          return num;
                        }).filter(n => n !== null);
                        
                        if (numericGrades.length > 0) {
                          // Calculate average for this subject
                          const subjectAvg = numericGrades.reduce((sum, n) => sum + n, 0) / numericGrades.length;
                          allNumericGrades.push(subjectAvg);
                        }
                      });
                      
                      if (allNumericGrades.length === 0) return null;
                      
                      // Calculate overall average across all subjects
                      const overallAvg = allNumericGrades.reduce((sum, n) => sum + n, 0) / allNumericGrades.length;
                      
                      // Convert to letter grade
                      return numericToLetterGrade(overallAvg);
                    };

                    const childOverallAverage = calculateChildOverallAverage();

                    // Get goals for child
                    const childGoals = goalsData.filter(g => g.child_id === effectiveChildId);

                    return (
                      <View style={overviewStyles.attendanceSection}>
                        <View style={overviewStyles.attendanceCard}>
                          <View style={[overviewStyles.attendanceCardHeader, { backgroundColor: gradesCardBg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                            <Text style={overviewStyles.attendanceCardTitle}>Grades & Goals</Text>
                            {false && userRole === 'parent' && (
                              <TouchableOpacity
                                onPress={() => setShowAddGradeModal(true)}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: spacing.xs,
                                  paddingHorizontal: spacing.sm,
                                  paddingVertical: spacing.xs,
                                  borderRadius: radius.sm,
                                  borderWidth: 1,
                                  borderColor: tokens.text || '#000',
                                  backgroundColor: 'transparent',
                                }}
                              >
                                <Plus size={16} color={tokens.text || '#000'} />
                                <Text style={{
                                  fontSize: 12,
                                  fontWeight: '600',
                                  color: tokens.text || '#000',
                                  fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  textTransform: 'uppercase',
                                }}>
                                  Add Grade
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <View style={overviewStyles.attendanceCardContent}>
                            {subjectsWithGrades.length === 0 && childGoals.length === 0 ? (
                              <Text style={{ fontSize: 12, color: tokens.textSecondary, textAlign: 'center', padding: spacing.md }}>
                                No grades or goals yet. Add grades to track progress.
                              </Text>
                            ) : (
                              <View style={{ gap: spacing.md }}>
                                {/* Grades by subject */}
                                {subjectsWithGrades.slice(0, 5).map((subject) => {
                                  const latestGrade = getLatestGrade(subject.id);
                                  const trend = getSubjectTrend(subject.id);
                                  const trendArrow = trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : null;
                                  const trendText = trend === 'improving' ? 'improving' : trend === 'declining' ? 'needs attention' : 'on track';

                                  return (
                                    <TouchableOpacity
                                      key={subject.id}
                                      style={{
                                        padding: spacing.md,
                                        borderRadius: radius.md,
                                        borderWidth: 1,
                                        borderColor: tokens.border || '#e5e7eb',
                                        backgroundColor: 'transparent'
                                      }}
                                      onPress={() => {
                                        // Open grades modal for this subject (same as clicking the grades chip)
                                        handleOpenGrades(subject);
                                      }}
                                    >
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View style={{ flex: 1 }}>
                                          <Text style={{ fontSize: 14, fontWeight: '500', fontFamily: designTokens.fonts.sans, color: tokens.text }}>
                                            <Text style={{ fontSize: 14, fontWeight: '500', color: tokens.textSecondary }}>Subject: </Text>
                                            {subject.name}
                                            {latestGrade && (
                                              <>
                                                <Text style={{ fontSize: 14, fontWeight: '500', color: tokens.textSecondary }}>{' · Overall average: '}</Text>
                                                <Text style={{ fontSize: 15, fontWeight: '700', color: tokens.text }}>{latestGrade}</Text>
                                              </>
                                            )}
                                            {trendArrow && (
                                              <Text style={{ fontSize: 13, color: trend === 'improving' ? '#10B981' : '#EF4444', marginLeft: 6, fontWeight: '500' }}>
                                                Status: {trendArrow} {trend === 'improving' ? 'Improving' : 'Needs attention'}
                                              </Text>
                                            )}
                                            {!trendArrow && (
                                              <Text style={{ fontSize: 13, color: tokens.textSecondary, marginLeft: 6, fontWeight: '500' }}>
                                                Status: On track
                                              </Text>
                                            )}
                                          </Text>
                                        </View>
                                      </View>
                                    </TouchableOpacity>
                                  );
                                })}

                                {/* Child Overall Average */}
                                {childOverallAverage && subjectsWithGrades.length > 0 && (
                                  <View style={{
                                    marginTop: spacing.sm,
                                    padding: spacing.md,
                                    borderRadius: radius.md,
                                    borderWidth: 2,
                                    borderColor: tokens.text || '#000',
                                    backgroundColor: 'transparent',
                                  }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <Text style={{ fontSize: 14, fontWeight: '600', fontFamily: designTokens.fonts.sans, color: tokens.text }}>
                                        Overall Average Across All Subjects:
                                      </Text>
                                      <Text style={{ fontSize: 16, fontWeight: '700', color: tokens.text }}>
                                        {childOverallAverage}
                                      </Text>
                                    </View>
                                  </View>
                                )}

                                {/* Goals */}
                                {childGoals.length > 0 && (
                                  <>
                                    {subjectsWithGrades.length > 0 && (
                                      <View style={{ height: 1, backgroundColor: tokens.border || '#e5e7eb', marginVertical: spacing.sm }} />
                                    )}
                                    {childGoals.slice(0, 3).map((goal, idx) => {
                                      const goalSubject = subjects.find(s => s.id === goal.subject_id);
                                      const goalText = goal.title || goal.description || 'Goal';
                                      const goalDate = goal.target_date ? new Date(goal.target_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
                                      
                                      // Determine if goal is on track (simplified - would check actual progress)
                                      const isOnTrack = true; // TODO: Calculate based on progress

                                      return (
                                        <TouchableOpacity
                                          key={goal.id || idx}
                                          style={{
                                            padding: spacing.md,
                                            borderRadius: radius.md,
                                            borderWidth: 1,
                                            borderColor: tokens.border || '#e5e7eb',
                                            backgroundColor: 'transparent'
                                          }}
                                        >
                                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <View style={{ flex: 1 }}>
                                              <Text style={{ fontSize: 14, fontWeight: '500', fontFamily: designTokens.fonts.sans, color: tokens.text }}>
                                                {goalSubject ? goalSubject.name : 'General'} · Goal: {goalText} {goalDate && `by ${goalDate}`}
                                                {isOnTrack && (
                                                  <Text style={{ fontSize: 13, color: tokens.textSecondary, marginLeft: 4, fontWeight: '500' }}>
                                                    {' '}On track
                                                  </Text>
                                                )}
                                              </Text>
                                            </View>
                                          </View>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </>
                                )}

                                {/* Note about average calculations */}
                                {(subjectsWithGrades.length > 0 || childGoals.length > 0) && (
                                  <View style={{
                                    marginTop: spacing.md,
                                  }}>
                                    <Text style={{
                                      fontSize: 11,
                                      color: tokens.textSecondary || '#6b7280',
                                      fontStyle: 'italic',
                                      lineHeight: 16,
                                    }}>
                                      Note: Subject overall averages and child overall averages are calculated by averaging all numeric grades for that subject/child and converting to a letter grade.
                                    </Text>
                                  </View>
                                )}

                                {/* Report Card and Transcript Buttons */}
                                <View style={{
                                  marginTop: spacing.md,
                                  paddingTop: spacing.md,
                                  borderTopWidth: 1,
                                  borderTopColor: tokens.border || '#e5e7eb',
                                  flexDirection: 'row',
                                  gap: spacing.sm,
                                }}>
                                  <TouchableOpacity
                                    onPress={() => {
                                      setShowReportCardModal(true);
                                      loadAvailableTerms();
                                      loadReportCardData();
                                    }}
                                    style={{
                                      flex: 1,
                                      paddingVertical: spacing.sm,
                                      paddingHorizontal: spacing.md,
                                      borderRadius: radius.md,
                                      borderWidth: 1,
                                      borderColor: tokens.border || '#e5e7eb',
                                      backgroundColor: 'transparent',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Text style={{
                                      fontSize: 14,
                                      fontWeight: '500',
                                      color: tokens.text || '#000000',
                                    }}>
                                      Report Card
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => {
                                      setShowTranscriptModal(true);
                                      loadTranscriptData();
                                    }}
                                    style={{
                                      flex: 1,
                                      paddingVertical: spacing.sm,
                                      paddingHorizontal: spacing.md,
                                      borderRadius: radius.md,
                                      borderWidth: 1,
                                      borderColor: tokens.border || '#e5e7eb',
                                      backgroundColor: 'transparent',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Text style={{
                                      fontSize: 14,
                                      fontWeight: '500',
                                      color: tokens.text || '#000000',
                                    }}>
                                      Transcript
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              );
            })()}
          </View>

      </View>

      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={() => setShowAddSubjectModal(false)}
        onSubjectAdded={handleSubjectAdded}
        familyId={familyId}
      />

      <PlanYearWizard
        visible={showPlanYearWizard}
        onClose={() => setShowPlanYearWizard(false)}
        familyId={familyId}
        children={allChildren}
        onComplete={() => {
          setShowPlanYearWizard(false);
          // Optionally reload subjects after year plan creation
          loadCurrentSubjects();
        }}
      />

      {/* No Syllabus Modal */}
      {showNoSyllabusModal && (
        <Modal
          visible={showNoSyllabusModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowNoSyllabusModal(false)}
        >
          <View style={overviewStyles.pdfModalOverlay}>
            <TouchableOpacity
              style={overviewStyles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => setShowNoSyllabusModal(false)}
            />
            <View
              style={overviewStyles.noSyllabusModalContainer}
              onStartShouldSetResponder={() => true}
            >
              <View style={overviewStyles.noSyllabusContent}>
                <TouchableOpacity
                  style={[overviewStyles.pdfModalCloseButton, { position: 'absolute', top: 0, right: 0, zIndex: 1 }]}
                  onPress={() => setShowNoSyllabusModal(false)}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
                <Text style={overviewStyles.noSyllabusText}>
                  No syllabus is currently attached to {selectedSubjectForMaterial?.name || 'this subject'}.
                </Text>
                <Text style={overviewStyles.noSyllabusSubtext}>
                  Add a syllabus material to get started with planning and tracking.
                </Text>
                <View style={overviewStyles.noSyllabusButtonsRow}>
                  <TouchableOpacity
                    style={overviewStyles.materialsButton}
                    onPress={() => {
                      console.log('[PrintablePortfolioView] Materials button pressed, onTabChange:', typeof onTabChange);
                      setShowNoSyllabusModal(false);
                      // Use setTimeout to ensure modal closes before navigation
                      setTimeout(() => {
                        if (onTabChange && typeof onTabChange === 'function') {
                          console.log('[PrintablePortfolioView] Calling onTabChange with "materials"');
                          onTabChange('materials');
                        } else {
                          console.warn('[PrintablePortfolioView] onTabChange is not a function:', onTabChange);
                        }
                      }, 100);
                    }}
                  >
                    <Text style={overviewStyles.materialsButtonText}>Materials</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={overviewStyles.addSyllabusButton}
                    onPress={() => {
                      setShowNoSyllabusModal(false);
                      setShowAddMaterialModal(true);
                    }}
                  >
                    <Plus size={18} color="#ffffff" />
                    <Text style={overviewStyles.addSyllabusButtonText}>Add Syllabus</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* No Lesson Plan Modal */}
      {showNoLessonPlanModal && selectedSubjectForMaterial && (
        <Modal
          visible={showNoLessonPlanModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowNoLessonPlanModal(false)}
        >
          <View style={overviewStyles.pdfModalOverlay}>
            <TouchableOpacity
              style={overviewStyles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => setShowNoLessonPlanModal(false)}
            />
            <View
              style={overviewStyles.noSyllabusModalContainer}
              onStartShouldSetResponder={() => true}
            >
              <View style={overviewStyles.noSyllabusContent}>
                <TouchableOpacity
                  style={[overviewStyles.pdfModalCloseButton, { position: 'absolute', top: 0, right: 0, zIndex: 1 }]}
                  onPress={() => setShowNoLessonPlanModal(false)}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
                <Text style={overviewStyles.noSyllabusText}>
                  No lesson plan is currently attached to {selectedSubjectForMaterial?.name || 'this subject'}.
                </Text>
                <Text style={overviewStyles.noSyllabusSubtext}>
                  Add a lesson plan material to get started with planning and tracking.
                </Text>
                <View style={overviewStyles.noSyllabusButtonsRow}>
                  <TouchableOpacity
                    style={overviewStyles.materialsButton}
                    onPress={() => {
                      console.log('[PrintablePortfolioView] Materials button pressed (lesson plan), onTabChange:', typeof onTabChange);
                      setShowNoLessonPlanModal(false);
                      // Use setTimeout to ensure modal closes before navigation
                      setTimeout(() => {
                        if (onTabChange && typeof onTabChange === 'function') {
                          console.log('[PrintablePortfolioView] Calling onTabChange with "materials"');
                          onTabChange('materials');
                        } else {
                          console.warn('[PrintablePortfolioView] onTabChange is not a function:', onTabChange);
                        }
                      }, 100);
                    }}
                  >
                    <Text style={overviewStyles.materialsButtonText}>Materials</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={overviewStyles.addSyllabusButton}
                    onPress={() => {
                      setShowNoLessonPlanModal(false);
                      setShowAddMaterialModal(true);
                    }}
                  >
                    <Plus size={18} color="#ffffff" />
                    <Text style={overviewStyles.addSyllabusButtonText}>Add Lesson Plan</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Syllabus List Modal */}
      {showSyllabusList && syllabusMaterials.length > 0 && (
        <Modal
          visible={showSyllabusList}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowSyllabusList(false);
            setSelectedSubjectForSyllabus(null);
            selectedSubjectForSyllabusRef.current = null;
          }}
        >
          <View style={overviewStyles.pdfModalOverlay}>
            <TouchableOpacity
              style={overviewStyles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => {
                setShowSyllabusList(false);
                setSelectedSubjectForSyllabus(null);
            selectedSubjectForSyllabusRef.current = null;
              }}
            />
            <View
              style={overviewStyles.syllabusListModalContainer}
              onStartShouldSetResponder={() => true}
            >
              <View style={overviewStyles.pdfModalHeader}>
                <Text style={overviewStyles.pdfModalTitle} numberOfLines={1}>
                  Select Syllabus
                </Text>
                <TouchableOpacity
                  style={overviewStyles.pdfModalCloseButton}
                  onPress={() => {
                setShowSyllabusList(false);
                setSelectedSubjectForSyllabus(null);
            selectedSubjectForSyllabusRef.current = null;
              }}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={overviewStyles.lessonPlanListContainer}>
                {syllabusMaterials.map((item, index) => {
                  // Get subject name
                  const subjectName = item.subjectName || (item.subject_id ? subjects.find(s => s.id === item.subject_id)?.name : null);
                  
                  // Get child info from material_children
                  const materialChildren = item.material_children || [];
                  const childIds = materialChildren.map(mc => mc.child_id || mc);
                  const childNames = childIds
                    .map(childId => {
                      const child = children.find(c => c.id === childId);
                      return child ? (child.first_name || child.name || 'Child') : null;
                    })
                    .filter(Boolean);
                  
                  // Build type string: "Subject Syllabus (PDF)"
                  const fileType = item.mime?.includes('pdf') ? 'PDF' : (item.mime?.split('/')[1]?.toUpperCase() || '');
                  const typeString = subjectName 
                    ? `${subjectName} Syllabus${fileType ? ` (${fileType})` : ''}`
                    : `Syllabus${fileType ? ` (${fileType})` : ''}`;
                  
                  // Get date
                  const dateString = item.created_at 
                    ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    : null;
                  
                  return (
                    <TouchableOpacity
                      key={item.id || index}
                      style={overviewStyles.syllabusListItem}
                      onPress={() => handleSelectSyllabusMaterial(item)}
                    >
                      <FileText size={20} color={colors.accent} />
                      <View style={overviewStyles.syllabusListItemContent}>
                        <View style={overviewStyles.syllabusListItemTitleRow}>
                          <Text style={overviewStyles.syllabusListItemTitle} numberOfLines={1}>
                            {item.title || 'Untitled Syllabus'}
                          </Text>
                        </View>
                        <Text style={overviewStyles.syllabusListItemType} numberOfLines={1}>
                          {typeString}
                        </Text>
                        {childNames.length > 0 && (
                          <View style={overviewStyles.syllabusListItemSubtitleRow}>
                            {childIds.slice(0, 3).map((childId) => {
                              const child = children.find(c => c.id === childId);
                              const childColor = child?.avatar ? getChildColorFromAvatar(child.avatar) : '#9CA3AF';
                              return (
                                <View
                                  key={childId}
                                  style={[
                                    overviewStyles.syllabusChildDot,
                                    { backgroundColor: childColor }
                                  ]}
                                />
                              );
                            })}
                            {childIds.length > 3 && (
                              <View style={[overviewStyles.syllabusChildDot, { backgroundColor: 'rgba(156, 163, 175, 0.4)' }]} />
                            )}
                            <Text style={overviewStyles.syllabusListItemSubtitle} numberOfLines={1}>
                              {childNames.join(', ')}
                            </Text>
                          </View>
                        )}
                      </View>
                      {dateString && (
                        <Text style={overviewStyles.syllabusListItemDate}>
                          {dateString}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Lesson Plan List Modal */}
      {showLessonPlanList && lessonPlanMaterials.length > 0 && (
        <Modal
          visible={showLessonPlanList}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowLessonPlanList(false);
            setSelectedSubjectForLessonPlan(null);
            selectedSubjectForLessonPlanRef.current = null;
          }}
        >
          <View style={overviewStyles.pdfModalOverlay}>
            <TouchableOpacity
              style={overviewStyles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => {
                setShowLessonPlanList(false);
                setSelectedSubjectForLessonPlan(null);
            selectedSubjectForLessonPlanRef.current = null;
              }}
            />
            <View
              style={overviewStyles.pdfModalContainer}
              onStartShouldSetResponder={() => true}
            >
              <View style={overviewStyles.pdfModalHeader}>
                <Text style={overviewStyles.pdfModalTitle} numberOfLines={1}>
                  Select Lesson Plan
                </Text>
                <TouchableOpacity
                  style={overviewStyles.pdfModalCloseButton}
                  onPress={() => {
                setShowLessonPlanList(false);
                setSelectedSubjectForLessonPlan(null);
            selectedSubjectForLessonPlanRef.current = null;
              }}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={overviewStyles.lessonPlanListContainer}>
                {lessonPlanMaterials.map((material, index) => {
                  // Get subject name
                  const subjectName = material.subjectName || (material.subject_id ? subjects.find(s => s.id === material.subject_id)?.name : null);
                  
                  // Get child info from material_children
                  const materialChildren = material.material_children || [];
                  const childIds = materialChildren.map(mc => mc.child_id || mc);
                  const childNames = childIds
                    .map(childId => {
                      const child = children.find(c => c.id === childId);
                      return child ? (child.first_name || child.name || 'Child') : null;
                    })
                    .filter(Boolean);
                  
                  // Build type string: "Subject Lesson Plan (PDF)"
                  const fileType = material.mime?.includes('pdf') ? 'PDF' : (material.mime?.split('/')[1]?.toUpperCase() || '');
                  const typeString = subjectName 
                    ? `${subjectName} Lesson Plan${fileType ? ` (${fileType})` : ''}`
                    : `Lesson Plan${fileType ? ` (${fileType})` : ''}`;
                  
                  // Get date
                  const dateString = material.created_at 
                    ? new Date(material.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    : null;
                  
                  return (
                    <TouchableOpacity
                      key={material.id || index}
                      style={overviewStyles.lessonPlanListItem}
                      onPress={() => handleSelectLessonPlanMaterial(material)}
                    >
                      <FileText size={20} color={colors.accent} />
                      <View style={overviewStyles.lessonPlanListItemContent}>
                        <View style={overviewStyles.lessonPlanListItemTitleRow}>
                          <Text style={overviewStyles.lessonPlanListItemTitle} numberOfLines={1}>
                            {material.title || 'Untitled Lesson Plan'}
                          </Text>
                        </View>
                        <Text style={overviewStyles.lessonPlanListItemType} numberOfLines={1}>
                          {typeString}
                        </Text>
                        {childNames.length > 0 && (
                          <View style={overviewStyles.lessonPlanListItemSubtitleRow}>
                            {childIds.slice(0, 3).map((childId) => {
                              const child = children.find(c => c.id === childId);
                              const childColor = child?.avatar ? getChildColorFromAvatar(child.avatar) : '#9CA3AF';
                              return (
                                <View
                                  key={childId}
                                  style={[
                                    overviewStyles.lessonPlanChildDot,
                                    { backgroundColor: childColor }
                                  ]}
                                />
                              );
                            })}
                            {childIds.length > 3 && (
                              <View style={[overviewStyles.lessonPlanChildDot, { backgroundColor: 'rgba(156, 163, 175, 0.4)' }]} />
                            )}
                            <Text style={overviewStyles.lessonPlanListItemSubtitle} numberOfLines={1}>
                              {childNames.join(', ')}
                            </Text>
                          </View>
                        )}
                      </View>
                      {dateString && (
                        <Text style={overviewStyles.lessonPlanListItemDate}>
                          {dateString}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Projects List Modal */}
      {showProjectsList && (
        <Modal
          visible={showProjectsList}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowProjectsList(false)}
        >
          <View style={overviewStyles.pdfModalOverlay}>
            <TouchableOpacity
              style={overviewStyles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => {
                setShowProjectsList(false);
                setSelectedSubjectForProjects(null);
              }}
            />
            {loadingProjects ? (
              <View
                style={overviewStyles.noSyllabusModalContainer}
                onStartShouldSetResponder={() => true}
              >
                <TouchableOpacity
                  style={[overviewStyles.pdfModalCloseButton, { position: 'absolute', top: 0, right: 0, zIndex: 1 }]}
                  onPress={() => {
                    setShowProjectsList(false);
                    setSelectedSubjectForProjects(null);
                  }}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={{ marginTop: 16, color: colors.textSecondary }}>Loading projects...</Text>
                </View>
              </View>
            ) : projectEvents.length === 0 ? (
              <View
                style={overviewStyles.noSyllabusModalContainer}
                onStartShouldSetResponder={() => true}
              >
                <TouchableOpacity
                  style={[overviewStyles.pdfModalCloseButton, { position: 'absolute', top: 0, right: 0, zIndex: 1 }]}
                  onPress={() => {
                    setShowProjectsList(false);
                    setSelectedSubjectForProjects(null);
                  }}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
                <View style={overviewStyles.noSyllabusContent}>
                  <Text style={overviewStyles.noSyllabusText}>
                    {selectedSubjectForProjects 
                      ? `NO PROJECT IS CURRENTLY ATTACHED TO ${selectedSubjectForProjects.name.toUpperCase()}.`
                      : 'NO PROJECTS FOUND.'}
                  </Text>
                  <Text style={overviewStyles.noSyllabusSubtext}>
                    Add a project event to get started with planning and tracking.
                  </Text>
                  <View style={[overviewStyles.noSyllabusButtonsRow, { justifyContent: 'center' }]}>
                    <TouchableOpacity
                      style={overviewStyles.addSyllabusButton}
                      onPress={() => {
                        console.log('[PrintablePortfolioView] Add Project button pressed');
                        setShowProjectsList(false);
                        const subject = selectedSubjectForProjects;
                        const childId = effectiveChildId || (children.length > 0 ? children[0].id : null);
                        
                        // Dispatch event to open TaskCreateModal with Project type, subject, and child pre-filled
                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('openTaskModal', {
                            detail: {
                              eventType: 'Project',
                              subjectId: subject?.id || null,
                              childId: childId,
                              date: new Date(),
                            }
                          }));
                        }
                        setSelectedSubjectForProjects(null);
                      }}
                    >
                      <Plus size={18} color="#ffffff" />
                      <Text style={overviewStyles.addSyllabusButtonText}>Add Project</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View
                style={[overviewStyles.pdfModalContainer, { maxWidth: 600 }]}
                onStartShouldSetResponder={() => true}
              >
                <View style={overviewStyles.pdfModalHeader}>
                  <Text style={overviewStyles.pdfModalTitle} numberOfLines={1}>
                    {selectedSubjectForProjects ? `${selectedSubjectForProjects.name} Projects` : 'Project Events'}
                  </Text>
                  <TouchableOpacity
                    style={overviewStyles.pdfModalCloseButton}
                    onPress={() => {
                      setShowProjectsList(false);
                      setSelectedSubjectForProjects(null);
                    }}
                  >
                    <X size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={overviewStyles.lessonPlanListContainer}>
                  {projectEvents.map((event, index) => {
                    // Get child info
                    const childId = event.child_id || (event.child_ids && event.child_ids.length > 0 ? event.child_ids[0] : null);
                    const child = childId ? children.find(c => c.id === childId) : null;
                    const childName = child ? (child.first_name || child.name || 'Child') : null;
                    
                    // Format date
                    const dateString = event.start_ts 
                      ? new Date(event.start_ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      : null;
                    
                    // Format date range if it's a multi-day event
                    let dateRangeString = dateString;
                    if (event.start_ts && event.end_ts) {
                      const startDate = new Date(event.start_ts);
                      const endDate = new Date(event.end_ts);
                      if (startDate.toDateString() !== endDate.toDateString()) {
                        dateRangeString = `${new Date(event.start_ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${new Date(event.end_ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      }
                    }
                    
                    return (
                      <TouchableOpacity
                        key={event.id || index}
                        style={overviewStyles.lessonPlanListItem}
                        onPress={() => handleSelectProjectEvent(event)}
                      >
                        <Target size={20} color={colors.accent} />
                        <View style={overviewStyles.lessonPlanListItemContent}>
                          <View style={overviewStyles.lessonPlanListItemTitleRow}>
                            <Text style={overviewStyles.lessonPlanListItemTitle} numberOfLines={2}>
                              {event.title || 'Untitled Project'}
                            </Text>
                          </View>
                          {childName && (
                            <View style={overviewStyles.lessonPlanListItemSubtitleRow}>
                              {child && (
                                <View
                                  style={[
                                    overviewStyles.lessonPlanChildDot,
                                    { backgroundColor: getChildColorFromAvatar(child.avatar) }
                                  ]}
                                />
                              )}
                              <Text style={overviewStyles.lessonPlanListItemSubtitle} numberOfLines={1}>
                                {childName}
                              </Text>
                            </View>
                          )}
                        </View>
                        {dateRangeString && (
                          <Text style={overviewStyles.lessonPlanListItemDate}>
                            {dateRangeString}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* Grades List Modal */}
      {showGradesList && (
        <Modal
          visible={showGradesList}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowGradesList(false)}
        >
          <View style={overviewStyles.pdfModalOverlay}>
            <TouchableOpacity
              style={overviewStyles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => {
                setShowGradesList(false);
                setSelectedSubjectForGrades(null);
              }}
            />
            {loadingGradesList ? (
              <View
                style={overviewStyles.noSyllabusModalContainer}
                onStartShouldSetResponder={() => true}
              >
                <TouchableOpacity
                  style={[overviewStyles.pdfModalCloseButton, { position: 'absolute', top: 0, right: 0, zIndex: 1 }]}
                  onPress={() => {
                    setShowGradesList(false);
                    setSelectedSubjectForGrades(null);
                  }}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={{ marginTop: 16, color: colors.textSecondary }}>Loading grades...</Text>
                </View>
              </View>
            ) : gradesList.length === 0 ? (
              <View
                style={overviewStyles.noSyllabusModalContainer}
                onStartShouldSetResponder={() => true}
              >
                <TouchableOpacity
                  style={[overviewStyles.pdfModalCloseButton, { position: 'absolute', top: 0, right: 0, zIndex: 1 }]}
                  onPress={() => {
                    setShowGradesList(false);
                    setSelectedSubjectForGrades(null);
                  }}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
                <View style={overviewStyles.noSyllabusContent}>
                  <Text style={overviewStyles.noSyllabusText}>
                    {selectedSubjectForGrades 
                      ? `NO GRADES FOUND FOR ${selectedSubjectForGrades.name.toUpperCase()}.`
                      : 'NO GRADES FOUND.'}
                  </Text>
                  <Text style={overviewStyles.noSyllabusSubtext}>
                    Add a grade to track progress for this subject.
                  </Text>
                </View>
              </View>
            ) : (
              <View
                style={[overviewStyles.pdfModalContainer, { maxWidth: 480 }]}
                onStartShouldSetResponder={() => true}
              >
                <View style={overviewStyles.pdfModalHeader}>
                  <Text style={overviewStyles.pdfModalTitle} numberOfLines={1}>
                    {selectedSubjectForGrades ? `${selectedSubjectForGrades.name} Grades` : 'Grades'}
                  </Text>
                  <TouchableOpacity
                    style={overviewStyles.pdfModalCloseButton}
                    onPress={() => {
                      setShowGradesList(false);
                      setSelectedSubjectForGrades(null);
                    }}
                  >
                    <X size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={overviewStyles.lessonPlanListContainer}>
                  {gradesList.map((gradeItem, index) => {
                    // Format date
                    const dateString = gradeItem.created_at 
                      ? new Date(gradeItem.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      : null;
                    
                    // Determine if this is from event_outcomes or grades table
                    const isFromEvent = gradeItem.source === 'event_outcomes' || gradeItem.source === 'events_table';
                    
                    // Get title - from assignment (grades table) or event (event_outcomes/events_table)
                    const title = isFromEvent 
                      ? (gradeItem.event_title || gradeItem.event?.title || null)
                      : (gradeItem.assignment?.title || gradeItem.assignment?.title || null);
                    
                    // Get child info for display
                    const childId = gradeItem.child_id || effectiveChildId;
                    const child = childId ? children.find(c => c.id === childId) : null;
                    const childName = child ? (child.first_name || child.name || 'Child') : null;
                    
                    // Check if this grade is from an event (clickable) or from grades table (not clickable)
                    const hasEvent = isFromEvent && gradeItem.event?.id;
                    
                    return (
                      <TouchableOpacity
                        key={gradeItem.id || index}
                        style={overviewStyles.lessonPlanListItem}
                        onPress={() => hasEvent && handleSelectGradeEvent(gradeItem)}
                        disabled={!hasEvent}
                        activeOpacity={hasEvent ? 0.7 : 1}
                      >
                        <BarChart3 size={20} color={colors.accent} />
                        <View style={overviewStyles.lessonPlanListItemContent}>
                          {/* Title row: Event title left, Grade right */}
                          <View style={[overviewStyles.lessonPlanListItemTitleRow, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
                            <View style={{ flex: 1, marginRight: 12 }}>
                              <Text style={overviewStyles.lessonPlanListItemTitle} numberOfLines={2}>
                                {title || 'Untitled'}
                              </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={overviewStyles.lessonPlanListItemTitle} numberOfLines={1}>
                                {gradeItem.isUngraded 
                                  ? (gradeItem.formattedDueDate ? `Ungraded, due ${gradeItem.formattedDueDate}` : 'Ungraded')
                                  : (gradeItem.grade || 'No Grade')}
                                {!gradeItem.isUngraded && gradeItem.score && (
                                  <Text style={[overviewStyles.lessonPlanListItemTitle, { color: colors.textSecondary, fontWeight: 'normal' }]}>
                                    {' '}({gradeItem.score})
                                  </Text>
                                )}
                              </Text>
                              {gradeItem.percent_of_total_grade && (
                                <Text style={[overviewStyles.lessonPlanListItemSubtitle, { marginTop: 2, fontSize: 11, fontWeight: '500' }]} numberOfLines={1}>
                                  {gradeItem.percent_of_total_grade}% of total grade
                                </Text>
                              )}
                            </View>
                          </View>
                          
                          {/* Date below title */}
                          {dateString && (
                            <Text style={[overviewStyles.lessonPlanListItemSubtitle, { marginTop: 4 }]} numberOfLines={1}>
                              {dateString}
                            </Text>
                          )}
                          
                          {/* Child with dot below date */}
                          {childName && (
                            <View style={overviewStyles.lessonPlanListItemSubtitleRow}>
                              {child && (
                                <View
                                  style={[
                                    overviewStyles.lessonPlanChildDot,
                                    { backgroundColor: getChildColorFromAvatar(child.avatar) }
                                  ]}
                                />
                              )}
                              <Text style={overviewStyles.lessonPlanListItemSubtitle} numberOfLines={1}>
                                {childName}
                              </Text>
                            </View>
                          )}
                          
                          {/* Optional: Term label for formal grades */}
                          {gradeItem.term_label && !isFromEvent && (
                            <View style={overviewStyles.lessonPlanListItemSubtitleRow}>
                              <Text style={overviewStyles.lessonPlanListItemSubtitle} numberOfLines={1}>
                                {gradeItem.term_label}
                              </Text>
                            </View>
                          )}
                          
                          {/* Notes and rubric - show if available (but not unit field from events) */}
                          {gradeItem.notes && gradeItem.source !== 'events_table' && (
                            <View style={[overviewStyles.lessonPlanListItemSubtitleRow, { marginTop: 4 }]}>
                              <Text style={[overviewStyles.lessonPlanListItemSubtitle, { fontStyle: 'italic' }]} numberOfLines={2}>
                                {gradeItem.notes}
                              </Text>
                            </View>
                          )}
                          {gradeItem.rubric && (
                            <View style={[overviewStyles.lessonPlanListItemSubtitleRow, { marginTop: 4 }]}>
                              <Text style={[overviewStyles.lessonPlanListItemSubtitle, { fontSize: 11 }]} numberOfLines={2}>
                                Rubric: {gradeItem.rubric}
                              </Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* PDF Viewer Modal */}
      {showPdfViewer && pdfUrl && (
        <Modal
          visible={showPdfViewer}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPdfViewer(false)}
        >
          <View style={overviewStyles.pdfModalOverlay}>
            <TouchableOpacity
              style={overviewStyles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => setShowPdfViewer(false)}
            />
            <View
              style={overviewStyles.pdfModalContainer}
              onStartShouldSetResponder={() => true}
            >
              <View style={overviewStyles.pdfModalHeader}>
                <Text style={overviewStyles.pdfModalTitle} numberOfLines={1}>
                  {pdfTitle}
                </Text>
                <View style={overviewStyles.pdfModalActions}>
                  {Platform.OS === 'web' && (
                    <TouchableOpacity
                      style={overviewStyles.pdfModalButton}
                      onPress={() => {
                        window.open(pdfUrl, '_blank');
                      }}
                    >
                      <ExternalLink size={18} color={colors.accent} />
                      <Text style={overviewStyles.pdfModalButtonText}>Open in new tab</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={overviewStyles.pdfModalCloseButton}
                    onPress={() => setShowPdfViewer(false)}
                  >
                    <X size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={overviewStyles.pdfViewerContainer}>
                {Platform.OS === 'web' ? (
                  <PDFIframe src={pdfUrl} title={pdfTitle} />
                ) : (
                  <View style={overviewStyles.pdfFallback}>
                    <Text style={overviewStyles.pdfFallbackText}>
                      PDF viewing is not available on this platform.
                    </Text>
                    <TouchableOpacity
                      style={overviewStyles.pdfModalButton}
                      onPress={() => {
                        Alert.alert('Open PDF', 'Would you like to open this PDF in your browser?');
                      }}
                    >
                      <ExternalLink size={18} color={colors.accent} />
                      <Text style={overviewStyles.pdfModalButtonText}>Open externally</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Add Material Modal */}
      <AddMaterialModal
        visible={showAddMaterialModal}
        onClose={() => {
          setShowAddMaterialModal(false);
          setShowNoSyllabusModal(false);
          setShowNoLessonPlanModal(false);
          setSelectedSubjectForMaterial(null);
        }}
        onSaved={() => {
          setShowAddMaterialModal(false);
          setShowNoSyllabusModal(false);
          setShowNoLessonPlanModal(false);
          setSelectedSubjectForMaterial(null);
          // Reload subjects to refresh syllabus data
          loadCurrentSubjects();
        }}
        familyId={familyId}
        children={children}
        allSubjects={subjects}
      />

      {/* Attendance Modal */}
      {showAttendanceModal && (
        <Modal
          visible={showAttendanceModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAttendanceModal(false)}
        >
          <View style={overviewStyles.pdfModalOverlay}>
            <TouchableOpacity
              style={overviewStyles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => setShowAttendanceModal(false)}
            />
            <View
              style={[overviewStyles.pdfModalContainer, { maxWidth: 600 }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={overviewStyles.pdfModalHeader}>
                <Text style={overviewStyles.pdfModalTitle} numberOfLines={1}>
                  Activity Log
                </Text>
                <TouchableOpacity
                  style={overviewStyles.pdfModalCloseButton}
                  onPress={() => setShowAttendanceModal(false)}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={overviewStyles.lessonPlanListContainer}>
                {loadingAttendance ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={{ marginTop: 16, color: colors.textSecondary }}>Loading activity log...</Text>
                  </View>
                ) : (
                  <>
                    {/* Weekly Summary Card */}
                    {(() => {
                      const today = new Date();
                      const weekStart = new Date(today);
                      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
                      const weekEnd = new Date(weekStart);
                      weekEnd.setDate(weekStart.getDate() + 6);
                      
                      // Format week range
                      const weekStartStr = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      const weekEndStr = weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      const weekRange = `${weekStartStr}–${weekEndStr}`;
                      
                      // Get week events
                      const weekEvents = activityEvents.filter(e => {
                        const eventDate = new Date(e.start_ts);
                        return eventDate >= weekStart && eventDate <= weekEnd;
                      });
                      
                      // Calculate session stats
                      const completedSessions = weekEvents.filter(e => e.status === 'done').length;
                      const movedSessions = weekEvents.filter(e => {
                        // Check if event was rescheduled (has original_start_ts or moved flag)
                        return e.original_start_ts || e.moved || false;
                      }).length;
                      const skippedSessions = weekEvents.filter(e => e.status === 'skipped' || e.status === 'canceled').length;
                      
                      // Calculate total time
                      const weekAttendance = attendanceData.filter(a => {
                        const dayDate = new Date(a.day_date);
                        return dayDate >= weekStart && dayDate <= weekEnd;
                      });
                      const totalMinutes = weekAttendance.reduce((sum, a) => sum + (a.minutes || 0), 0);
                      const hours = Math.floor(totalMinutes / 60);
                      const minutes = totalMinutes % 60;
                      const totalTimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                      
                      // Simple pace calculation (assume goal is ~20 hours/week = 1200 minutes)
                      const weeklyGoal = 1200; // minutes
                      const onPace = totalMinutes >= (weeklyGoal * (today.getDay() / 7));
                      
                      return (
                        <View style={overviewStyles.weeklySummaryCard}>
                          <View style={overviewStyles.weeklySummaryHeader}>
                            <Text style={overviewStyles.weeklySummaryTitle}>
                              This Week · {weekRange}
                            </Text>
                          </View>
                          <View style={overviewStyles.weeklySummaryStats}>
                            <View style={overviewStyles.weeklySummaryStat}>
                              <Text style={{ fontSize: 16, color: '#10B981' }}>✓</Text>
                              <Text style={overviewStyles.weeklySummaryStatText}>
                                {completedSessions} learning session{completedSessions !== 1 ? 's' : ''} completed
                              </Text>
                            </View>
                            {movedSessions > 0 && (
                              <View style={overviewStyles.weeklySummaryStat}>
                                <Text style={{ fontSize: 16, color: '#F59E0B' }}>~</Text>
                                <Text style={overviewStyles.weeklySummaryStatText}>
                                  {movedSessions} session{movedSessions !== 1 ? 's' : ''} moved
                                </Text>
                              </View>
                            )}
                            {skippedSessions > 0 && (
                              <View style={overviewStyles.weeklySummaryStat}>
                                <Text style={{ fontSize: 16, color: '#EF4444' }}>⏸</Text>
                                <Text style={overviewStyles.weeklySummaryStatText}>
                                  {skippedSessions} session{skippedSessions !== 1 ? 's' : ''} skipped
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={overviewStyles.weeklySummaryTotal}>
                            <Text style={overviewStyles.weeklySummaryTotalText}>
                              Total time: {totalTimeStr}
                            </Text>
                            {onPace && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.xs }}>
                                <Text style={{ fontSize: 14, color: '#10B981' }}>✔</Text>
                                <Text style={[overviewStyles.weeklySummaryStatText, { color: '#10B981' }]}>
                                  On pace for weekly goal
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })()}

                    {/* Recent Attendance Summary - Horizontal Strip */}
                    {(() => {
                      const today = new Date();
                      const days = [];
                      for (let i = 6; i >= 0; i--) {
                        const date = new Date(today);
                        date.setDate(today.getDate() - i);
                        days.push(date);
                      }
                      
                      return (
                        <View style={overviewStyles.attendanceStrip}>
                          {days.map((day, index) => {
                            const dayStr = day.toISOString().split('T')[0];
                            const record = attendanceData.find(a => a.day_date === dayStr);
                            const dayLabel = day.toLocaleDateString(undefined, { weekday: 'short' });
                            const dayNum = day.getDate();
                            
                            let statusColor = '#e5e7eb';
                            let statusIcon = '○';
                            if (record) {
                              if (record.status === 'present') {
                                statusColor = '#10B981';
                                statusIcon = '✓';
                              } else if (record.status === 'partial') {
                                statusColor = '#F59E0B';
                                statusIcon = '~';
                              } else if (record.status === 'absent') {
                                statusColor = '#EF4444';
                                statusIcon = '⏸';
                              }
                            }
                            
                            return (
                              <TouchableOpacity
                                key={index}
                                style={overviewStyles.attendanceDay}
                                onPress={() => {
                                  // Scroll to that date in timeline
                                  // For now, just highlight or scroll
                                }}
                              >
                                <View style={[
                                  overviewStyles.attendanceDayDot,
                                  {
                                    backgroundColor: statusColor + '20',
                                    borderColor: statusColor
                                  }
                                ]}>
                                  <Text style={{ fontSize: 14, color: statusColor, fontWeight: '600' }}>
                                    {statusIcon}
                                  </Text>
                                </View>
                                <Text style={overviewStyles.attendanceDayLabel}>{dayLabel}</Text>
                                <Text style={[overviewStyles.attendanceDayLabel, { fontSize: 11, fontWeight: '600' }]}>{dayNum}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })()}

                    {/* Activity Timeline - Grouped by Day */}
                    <View style={{ marginBottom: spacing.xl }}>
                      {loadingActivityEvents ? (
                        <View style={{ padding: spacing.md, alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={colors.accent} />
                        </View>
                      ) : activityEvents.length === 0 ? (
                        <Text style={[overviewStyles.emptyText, { padding: spacing.md }]}>No recent events</Text>
                      ) : (
                        (() => {
                          // Group events by day
                          const eventsByDay = {};
                          activityEvents.forEach(event => {
                            if (!event.start_ts) return;
                            const eventDate = new Date(event.start_ts);
                            const dayKey = eventDate.toISOString().split('T')[0];
                            if (!eventsByDay[dayKey]) {
                              eventsByDay[dayKey] = [];
                            }
                            eventsByDay[dayKey].push(event);
                          });
                          
                          // Sort days (most recent first)
                          const sortedDays = Object.keys(eventsByDay).sort((a, b) => new Date(b) - new Date(a));
                          
                          return sortedDays.map(dayKey => {
                            const dayEvents = eventsByDay[dayKey];
                            const dayDate = new Date(dayKey);
                            const dayTitle = dayDate.toLocaleDateString(undefined, { 
                              weekday: 'long',
                              month: 'long', 
                              day: 'numeric'
                            });
                            
                            return (
                              <View key={dayKey} style={overviewStyles.timelineDayGroup}>
                                <View style={overviewStyles.timelineDayHeader}>
                                  <Calendar size={16} color={tokens.accent} />
                                  <Text style={overviewStyles.timelineDayTitle}>{dayTitle}</Text>
                                </View>
                                {dayEvents.map((event, idx) => {
                                  const timeString = event.start_ts
                                    ? new Date(event.start_ts).toLocaleTimeString(undefined, { 
                                        hour: 'numeric',
                                        minute: '2-digit'
                                      })
                                    : null;
                                  
                                  const subjectName = event.subject?.name || 'No Subject';
                                  const statusConfig = {
                                    done: { label: 'Completed', color: '#10B981', icon: '✓' },
                                    scheduled: { label: 'Scheduled', color: '#F59E0B', icon: '~' },
                                    skipped: { label: 'Skipped', color: '#EF4444', icon: '⏸' },
                                    canceled: { label: 'Canceled', color: '#6B7280', icon: '⏸' }
                                  };
                                  const status = statusConfig[event.status] || statusConfig.scheduled;
                                  
                                  // Get child for avatar
                                  const eventChildId = event.child_id || effectiveChildId;
                                  const eventChild = eventChildId ? children.find(c => c.id === eventChildId) : null;
                                  const childInitials = eventChild 
                                    ? (eventChild.first_name?.[0] || eventChild.name?.[0] || '?').toUpperCase()
                                    : '?';
                                  const childColor = eventChild?.avatar ? getChildColorFromAvatar(eventChild.avatar) : tokens.accent;
                                  
                                  // Get attendance record for this event to show time spent
                                  const attendanceRecord = attendanceData.find(a => a.event_id === event.id);
                                  const timeSpent = attendanceRecord?.minutes || event.duration_minutes;
                                  
                                  return (
                                    <TouchableOpacity
                                      key={event.id || idx}
                                      style={overviewStyles.timelineItem}
                                      onPress={() => {
                                        // Close activity log modal
                                        setShowAttendanceModal(false);
                                        // Open event details modal
                                        if (Platform.OS === 'web' && typeof window !== 'undefined' && event?.id) {
                                          window.dispatchEvent(new CustomEvent('openEventModal', {
                                            detail: {
                                              eventId: event.id,
                                              initialEvent: event
                                            }
                                          }));
                                        }
                                      }}
                                    >
                                      <View style={overviewStyles.timelineItemHeader}>
                                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                                          <View style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 16,
                                            backgroundColor: childColor + '20',
                                            borderWidth: 2,
                                            borderColor: childColor,
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }}>
                                            <Text style={{ fontSize: 12, fontWeight: '600', color: childColor }}>
                                              {childInitials}
                                            </Text>
                                          </View>
                                          <View style={{ flex: 1 }}>
                                            <Text style={overviewStyles.timelineItemTitle} numberOfLines={1}>
                                              {event.title || 'Untitled Event'}
                                            </Text>
                                            <Text style={[overviewStyles.lessonPlanListItemSubtitle, { fontSize: 12, marginTop: 2 }]}>
                                              {subjectName}
                                            </Text>
                                          </View>
                                        </View>
                                        <View style={[
                                          overviewStyles.timelineItemStatus,
                                          { backgroundColor: status.color + '20' }
                                        ]}>
                                          <Text style={[
                                            overviewStyles.timelineItemStatusText,
                                            { color: status.color }
                                          ]}>
                                            {status.label}
                                          </Text>
                                        </View>
                                      </View>
                                      <View style={overviewStyles.timelineItemMeta}>
                                        {timeString && (
                                          <Text style={[overviewStyles.lessonPlanListItemSubtitle, { fontSize: 12 }]}>
                                            {timeString}
                                          </Text>
                                        )}
                                        {timeSpent && (
                                          <Text style={[overviewStyles.lessonPlanListItemSubtitle, { fontSize: 12 }]}>
                                            {timeSpent}m
                                          </Text>
                                        )}
                                      </View>
                                      {/* Context line */}
                                      {(() => {
                                        let contextText = null;
                                        // Check if event was shortened
                                        if (event.duration_minutes && event.original_duration_minutes && 
                                            event.duration_minutes < event.original_duration_minutes) {
                                          contextText = 'Shortened due to late start';
                                        }
                                        // Check if event was moved
                                        if (event.original_start_ts && event.start_ts) {
                                          const originalDate = new Date(event.original_start_ts);
                                          const newDate = new Date(event.start_ts);
                                          if (originalDate.toDateString() !== newDate.toDateString()) {
                                            const originalDay = originalDate.toLocaleDateString(undefined, { weekday: 'short' });
                                            const newDay = newDate.toLocaleDateString(undefined, { weekday: 'short' });
                                            contextText = `Moved from ${originalDay} → ${newDay}`;
                                          }
                                        }
                                        // Check if event was partial
                                        if (attendanceRecord && attendanceRecord.status === 'partial') {
                                          contextText = 'Partial attendance';
                                        }
                                        
                                        return contextText ? (
                                          <Text style={overviewStyles.timelineItemContext}>
                                            {contextText}
                                          </Text>
                                        ) : null;
                                      })()}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            );
                          });
                        })()
                      )}
                    </View>

                    {/* Full Attendance Log - Collapsed Section */}
                    <View style={overviewStyles.collapsedSection}>
                      <TouchableOpacity
                        style={overviewStyles.collapsedSectionHeader}
                        onPress={() => setShowFullAttendanceLog(!showFullAttendanceLog)}
                      >
                        <Text style={overviewStyles.collapsedSectionTitle}>
                          View full attendance log
                        </Text>
                        {showFullAttendanceLog ? (
                          <ChevronUp size={18} color={tokens.textSecondary} />
                        ) : (
                          <ChevronDown size={18} color={tokens.textSecondary} />
                        )}
                      </TouchableOpacity>
                      {showFullAttendanceLog && (
                        <View style={{ marginTop: spacing.md }}>
                          {attendanceData.length === 0 ? (
                            <Text style={[overviewStyles.emptyText, { padding: spacing.md }]}>No attendance records found.</Text>
                          ) : (
                            <View style={{
                              backgroundColor: tokens.card || '#ffffff',
                              borderRadius: radius.md,
                              borderWidth: 1,
                              borderColor: tokens.border || '#e5e7eb',
                              overflow: 'hidden'
                            }}>
                              {/* Table Header */}
                              <View style={{
                                flexDirection: 'row',
                                padding: spacing.md,
                                backgroundColor: tokens.background || '#f9fafb',
                                borderBottomWidth: 1,
                                borderBottomColor: tokens.border || '#e5e7eb'
                              }}>
                                <Text style={[overviewStyles.masteryBarText, { flex: 2, fontSize: 12 }]}>Date</Text>
                                <Text style={[overviewStyles.masteryBarText, { flex: 2, fontSize: 12 }]}>Subject</Text>
                                <Text style={[overviewStyles.masteryBarText, { flex: 1, fontSize: 12 }]}>Duration</Text>
                                <Text style={[overviewStyles.masteryBarText, { flex: 1, fontSize: 12 }]}>Status</Text>
                              </View>
                              {/* Table Rows */}
                              {attendanceData.map((record, index) => {
                                const dateString = record.day_date
                                  ? new Date(record.day_date).toLocaleDateString(undefined, { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      year: 'numeric' 
                                    })
                                  : null;
                                
                                const statusColor = {
                                  present: '#10B981',
                                  partial: '#F59E0B',
                                  absent: '#EF4444'
                                }[record.status] || colors.textSecondary;

                                const statusLabel = record.status ? record.status.charAt(0).toUpperCase() + record.status.slice(1) : 'Unknown';
                                
                                // Get subject name from event if available
                                const event = activityEvents.find(e => e.id === record.event_id);
                                const subjectName = event?.subject?.name || 'N/A';

                                return (
                                  <View
                                    key={record.id || index}
                                    style={{
                                      flexDirection: 'row',
                                      padding: spacing.md,
                                      borderBottomWidth: index < attendanceData.length - 1 ? 1 : 0,
                                      borderBottomColor: tokens.border || '#e5e7eb'
                                    }}
                                  >
                                    <Text style={[overviewStyles.lessonPlanListItemSubtitle, { flex: 2, fontSize: 12 }]}>
                                      {dateString || 'No Date'}
                                    </Text>
                                    <Text style={[overviewStyles.lessonPlanListItemSubtitle, { flex: 2, fontSize: 12 }]}>
                                      {subjectName}
                                    </Text>
                                    <Text style={[overviewStyles.lessonPlanListItemSubtitle, { flex: 1, fontSize: 12 }]}>
                                      {record.minutes > 0 ? `${record.minutes}m` : 'N/A'}
                                    </Text>
                                    <View style={{ flex: 1 }}>
                                      <View style={{
                                        paddingHorizontal: spacing.xs,
                                        paddingVertical: 2,
                                        borderRadius: radius.sm,
                                        backgroundColor: statusColor + '20',
                                        alignSelf: 'flex-start'
                                      }}>
                                        <Text style={{ fontSize: 10, fontWeight: '600', color: statusColor, textTransform: 'uppercase' }}>
                                          {statusLabel}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      )}
                    </View>

                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Subject-Specific Pacing Modal */}
      <ProgressForecastModal
        visible={showPacingModal}
        familyId={familyId}
        children={children}
        selectedChildIds={effectiveChildId ? [effectiveChildId] : null}
        subjectId={selectedSubjectForPacing?.id || null}
        subjectName={selectedSubjectForPacing?.name || null}
        onClose={() => {
          setShowPacingModal(false);
          setSelectedSubjectForPacing(null);
        }}
        onPlanWeek={(childId) => {
          // Handle plan week action if needed
          console.log('[PrintablePortfolioView] Plan week for child:', childId);
        }}
        onQuickReschedule={(childId) => {
          // Handle quick reschedule action if needed
          console.log('[PrintablePortfolioView] Quick reschedule for child:', childId);
        }}
      />

      {/* Add Grade Modal */}
      <Modal
        visible={showAddGradeModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowAddGradeModal(false);
          // Reset form when closing
          setNewGrade({
            term_label: getDefaultTermLabel(),
            subject_id: null,
            grade: '',
            score: null,
            credits: null,
            notes: '',
          });
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.lg,
          }}
          onPress={() => {
            setShowAddGradeModal(false);
            // Reset form when closing
            setNewGrade({
              term_label: getDefaultTermLabel(),
              subject_id: null,
              grade: '',
              score: null,
              credits: null,
              notes: '',
            });
          }}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: tokens.card || '#ffffff',
              borderRadius: radius.lg,
              width: '100%',
              maxWidth: 600,
              maxHeight: '80%',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <View style={{ 
              paddingHorizontal: spacing.lg, 
              paddingTop: spacing.lg, 
              paddingBottom: spacing.md,
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: tokens.text }}>Add Grade</Text>
              <TouchableOpacity onPress={() => setShowAddGradeModal(false)}>
                <X size={24} color={tokens.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Content ScrollView */}
            <ScrollView 
              style={{ flex: 1 }} 
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}
              showsVerticalScrollIndicator={true}
            >
              <View style={{ gap: spacing.md }}>
                {/* Term Label */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: tokens.textSecondary || '#6b7280', marginBottom: spacing.xs }}>
                    Term Label <Text style={{ color: '#ef4444' }}>*</Text>
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: tokens.border || '#e5e7eb',
                      borderRadius: radius.md,
                      padding: spacing.sm,
                      fontSize: 14,
                      color: tokens.text,
                      backgroundColor: tokens.background || '#ffffff',
                    }}
                    placeholder="e.g. 2025–26 Semester 1"
                    placeholderTextColor={tokens.textSecondary}
                    value={newGrade.term_label}
                    onChangeText={(text) => setNewGrade({ ...newGrade, term_label: text })}
                  />
                </View>

                {/* Subject */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: tokens.textSecondary || '#6b7280', marginBottom: spacing.xs }}>
                    Subject <Text style={{ color: '#ef4444' }}>*</Text>
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {subjects
                      .filter(subject => {
                        // Show subjects for the selected child OR family-wide subjects (child_id is null)
                        return subject.child_id === effectiveChildId || subject.child_id === null;
                      })
                      .map(subject => {
                        const isSelected = newGrade.subject_id === subject.id;
                        return (
                          <TouchableOpacity
                            key={subject.id}
                            onPress={() => setNewGrade({ ...newGrade, subject_id: subject.id })}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: isSelected 
                                ? '#3b82f6' // Blue border when selected
                                : '#e5e7eb', // Light gray border when unselected
                              backgroundColor: '#ffffff', // Always white background
                            }}
                          >
                            <Text style={{
                              fontSize: 12,
                              fontWeight: isSelected ? '600' : '400',
                              color: isSelected ? '#3b82f6' : '#1f2937', // Blue when selected, dark gray when unselected
                            }}>
                              {subject.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                </View>

                {/* Grade */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: tokens.textSecondary || '#6b7280', marginBottom: spacing.xs }}>
                    Grade <Text style={{ color: '#ef4444' }}>*</Text>
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: tokens.border || '#e5e7eb',
                      borderRadius: radius.md,
                      padding: spacing.sm,
                      fontSize: 14,
                      color: tokens.text,
                      backgroundColor: tokens.background || '#ffffff',
                    }}
                    placeholder="e.g. A, B+, Pass"
                    placeholderTextColor={tokens.textSecondary}
                    value={newGrade.grade}
                    onChangeText={(text) => setNewGrade({ ...newGrade, grade: text })}
                  />
                </View>

                {/* Score */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: tokens.textSecondary || '#6b7280', marginBottom: spacing.xs }}>Score (optional)</Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: tokens.border || '#e5e7eb',
                      borderRadius: radius.md,
                      padding: spacing.sm,
                      fontSize: 14,
                      color: tokens.text,
                      backgroundColor: tokens.background || '#ffffff',
                    }}
                    placeholder="Numeric score"
                    placeholderTextColor={tokens.textSecondary}
                    value={newGrade.score?.toString() || ''}
                    onChangeText={(text) => setNewGrade({ ...newGrade, score: text ? parseFloat(text) : null })}
                    keyboardType="numeric"
                  />
                </View>

                {/* Credits */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: tokens.textSecondary || '#6b7280', marginBottom: spacing.xs }}>Credits (optional)</Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: tokens.border || '#e5e7eb',
                      borderRadius: radius.md,
                      padding: spacing.sm,
                      fontSize: 14,
                      color: tokens.text,
                      backgroundColor: tokens.background || '#ffffff',
                    }}
                    placeholder="e.g. 1.0, 0.5"
                    placeholderTextColor={tokens.textSecondary}
                    value={newGrade.credits?.toString() || ''}
                    onChangeText={(text) => setNewGrade({ ...newGrade, credits: text ? parseFloat(text) : null })}
                    keyboardType="numeric"
                  />
                </View>

                {/* Notes */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: tokens.textSecondary || '#6b7280', marginBottom: spacing.xs }}>Notes (optional)</Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: tokens.border || '#e5e7eb',
                      borderRadius: radius.md,
                      padding: spacing.sm,
                      fontSize: 14,
                      color: tokens.text,
                      backgroundColor: tokens.background || '#ffffff',
                      minHeight: 80,
                      textAlignVertical: 'top',
                    }}
                    placeholder="Additional notes"
                    placeholderTextColor={tokens.textSecondary}
                    value={newGrade.notes}
                    onChangeText={(text) => setNewGrade({ ...newGrade, notes: text })}
                    multiline
                    numberOfLines={4}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Footer - Separated with minimal spacing */}
            <View style={{ 
              borderTopWidth: 1,
              borderTopColor: tokens.border || '#e5e7eb',
              paddingTop: 8,
              paddingBottom: 8,
              paddingHorizontal: spacing.lg,
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              borderBottomLeftRadius: radius.lg,
              borderBottomRightRadius: radius.lg,
            }}>
              <TouchableOpacity
                onPress={() => {
                  setShowAddGradeModal(false);
                  // Reset form when closing
                  setNewGrade({
                    term_label: getDefaultTermLabel(),
                    subject_id: null,
                    grade: '',
                    score: null,
                    credits: null,
                    notes: '',
                  });
                }}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#9ca3af' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddGrade}
                disabled={!newGrade.term_label || !newGrade.subject_id || !newGrade.grade}
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 8,
                  borderRadius: radius.md,
                  backgroundColor: (!newGrade.term_label || !newGrade.subject_id || !newGrade.grade) ? '#6b7280' : '#000000',
                  opacity: (!newGrade.term_label || !newGrade.subject_id || !newGrade.grade) ? 0.5 : 1,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#ffffff' }}>Add Grade</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Full Compliance Modal */}
      {effectiveChildId && showComplianceModal && (
        <Modal
          visible={showComplianceModal}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowComplianceModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: tokens.background || '#ffffff' }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: tokens.border || '#e5e7eb',
              backgroundColor: tokens.card || '#ffffff'
            }}>
              <Text style={{ fontSize: 18, fontWeight: '700', fontFamily: designTokens.fonts.display, color: tokens.text }}>
                Compliance Dashboard
              </Text>
              <TouchableOpacity
                onPress={() => setShowComplianceModal(false)}
                style={{
                  padding: spacing.xs,
                  borderRadius: radius.sm,
                }}
              >
                <X size={24} color={tokens.text || '#000000'} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }}>
              <ComplianceDashboard
                childId={effectiveChildId}
                childName={child?.first_name || child?.name || 'Child'}
                familyId={familyId}
              />
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* Generate Log Modal */}
      <Modal
        visible={showGenerateLogModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowGenerateLogModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.lg,
          }}
          onPress={() => setShowGenerateLogModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: tokens.card || '#ffffff',
              borderRadius: radius.lg,
              width: '100%',
              maxWidth: 600,
              maxHeight: '90%',
            }}
          >
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: spacing.lg,
              borderBottomWidth: 1,
              borderBottomColor: tokens.border || '#e5e7eb',
            }}>
              <Text style={{
                fontSize: 20,
                fontWeight: '700',
                fontFamily: designTokens.fonts.display,
                color: tokens.text
              }}>
                Learning Log
              </Text>
              <TouchableOpacity
                onPress={() => setShowGenerateLogModal(false)}
                style={{ padding: spacing.xs }}
              >
                <X size={24} color={tokens.text || '#000000'} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={{ flex: 1, padding: spacing.lg }}>
              {loadingLogSamples ? (
                <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={tokens.primary || '#3b82f6'} />
                  <Text style={{ marginTop: spacing.md, color: tokens.textSecondary }}>
                    Loading samples...
                  </Text>
                </View>
              ) : (
                <View style={{ gap: spacing.lg }}>
                  {/* Lessons Section */}
                  <View>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: tokens.text,
                      marginBottom: spacing.sm
                    }}>
                      Lessons ({logSamples.lessons.length})
                    </Text>
                    {logSamples.lessons.length === 0 ? (
                      <View style={{
                        padding: spacing.md,
                        backgroundColor: tokens.border + '20',
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: tokens.border || '#e5e7eb',
                        borderStyle: 'dashed'
                      }}>
                        <Text style={{ fontSize: 12, color: tokens.textSecondary, fontStyle: 'italic' }}>
                          Add more Lessons to include in your compliance log
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: spacing.xs }}>
                        {logSamples.lessons.slice(0, 5).map((lesson) => {
                          const hasDetails = lesson.subject?.name || lesson.unit || lesson.notes;
                          return (
                            <View key={lesson.id} style={{
                              padding: spacing.sm,
                              backgroundColor: tokens.background || '#f9fafb',
                              borderRadius: radius.sm,
                              borderWidth: 1,
                              borderColor: tokens.border || '#e5e7eb'
                            }}>
                              <Text style={{ fontSize: 13, fontWeight: '500', color: tokens.text }}>
                                {lesson.title || 'Untitled Lesson'}
                              </Text>
                              {hasDetails ? (
                                <>
                                  {(lesson.subject?.name || lesson.unit) && (
                                    <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 2 }}>
                                      {lesson.subject?.name && `Subject: ${lesson.subject.name}`}
                                      {lesson.subject?.name && lesson.unit && ` · `}
                                      {lesson.unit && `Unit: ${lesson.unit}`}
                                    </Text>
                                  )}
                                  {lesson.notes && (
                                    <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                                      {lesson.notes.substring(0, 100)}{lesson.notes.length > 100 ? '...' : ''}
                                    </Text>
                                  )}
                                </>
                              ) : (
                                <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                                  Add details or notes
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Activities Section */}
                  <View>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: tokens.text,
                      marginBottom: spacing.sm
                    }}>
                      Educational Activities ({logSamples.activities.length})
                    </Text>
                    {logSamples.activities.length === 0 ? (
                      <View style={{
                        padding: spacing.md,
                        backgroundColor: tokens.border + '20',
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: tokens.border || '#e5e7eb',
                        borderStyle: 'dashed'
                      }}>
                        <Text style={{ fontSize: 12, color: tokens.textSecondary, fontStyle: 'italic' }}>
                          Add more Activities to include in your compliance log
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: spacing.xs }}>
                        {logSamples.activities.slice(0, 5).map((activity) => {
                          const hasDetails = activity.subject?.name || activity.notes;
                          return (
                            <View key={activity.id} style={{
                              padding: spacing.sm,
                              backgroundColor: tokens.background || '#f9fafb',
                              borderRadius: radius.sm,
                              borderWidth: 1,
                              borderColor: tokens.border || '#e5e7eb'
                            }}>
                              <Text style={{ fontSize: 13, fontWeight: '500', color: tokens.text }}>
                                {activity.title || 'Untitled Activity'}
                              </Text>
                              {hasDetails ? (
                                <>
                                  {activity.subject?.name && (
                                    <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 2 }}>
                                      Subject: {activity.subject.name}
                                    </Text>
                                  )}
                                  {activity.notes && (
                                    <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                                      {activity.notes.substring(0, 100)}{activity.notes.length > 100 ? '...' : ''}
                                    </Text>
                                  )}
                                </>
                              ) : (
                                <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                                  Add details or notes
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Materials Section */}
                  <View>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: tokens.text,
                      marginBottom: spacing.sm
                    }}>
                      Materials Used ({logSamples.materials.length})
                    </Text>
                    {logSamples.materials.length === 0 ? (
                      <View style={{
                        padding: spacing.md,
                        backgroundColor: tokens.border + '20',
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: tokens.border || '#e5e7eb',
                        borderStyle: 'dashed'
                      }}>
                        <Text style={{ fontSize: 12, color: tokens.textSecondary, fontStyle: 'italic' }}>
                          Add more Materials to include in your compliance log
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: spacing.xs }}>
                        {logSamples.materials.slice(0, 5).map((material) => (
                          <View key={material.id} style={{
                            padding: spacing.sm,
                            backgroundColor: tokens.background || '#f9fafb',
                            borderRadius: radius.sm,
                            borderWidth: 1,
                            borderColor: tokens.border || '#e5e7eb'
                          }}>
                            <Text style={{ fontSize: 13, fontWeight: '500', color: tokens.text }}>
                              {material.title || 'Untitled Material'}
                            </Text>
                            <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 2 }}>
                              Type: {material.type || 'Other'}
                              {material.subject?.name && ` · Subject: ${material.subject.name}`}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Assignments Section */}
                  <View>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: tokens.text,
                      marginBottom: spacing.sm
                    }}>
                      Assignments ({logSamples.assignments.length})
                    </Text>
                    {logSamples.assignments.length === 0 ? (
                      <View style={{
                        padding: spacing.md,
                        backgroundColor: tokens.border + '20',
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: tokens.border || '#e5e7eb',
                        borderStyle: 'dashed'
                      }}>
                        <Text style={{ fontSize: 12, color: tokens.textSecondary, fontStyle: 'italic' }}>
                          Add more Assignments to include in your compliance log
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: spacing.xs }}>
                        {logSamples.assignments.slice(0, 5).map((assignment) => {
                          const hasDetails = assignment.subject?.name || assignment.grade || assignment.notes;
                          const detailParts = [];
                          if (assignment.subject?.name) detailParts.push(`Subject: ${assignment.subject.name}`);
                          if (assignment.grade) detailParts.push(`Grade: ${assignment.grade}`);
                          return (
                            <View key={assignment.id} style={{
                              padding: spacing.sm,
                              backgroundColor: tokens.background || '#f9fafb',
                              borderRadius: radius.sm,
                              borderWidth: 1,
                              borderColor: tokens.border || '#e5e7eb'
                            }}>
                              <Text style={{ fontSize: 13, fontWeight: '500', color: tokens.text }}>
                                {assignment.title || 'Untitled Assignment'}
                              </Text>
                              {hasDetails ? (
                                <>
                                  {detailParts.length > 0 && (
                                    <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 2 }}>
                                      {detailParts.join(' · ')}
                                    </Text>
                                  )}
                                  {assignment.notes && (
                                    <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                                      {assignment.notes.substring(0, 100)}{assignment.notes.length > 100 ? '...' : ''}
                                    </Text>
                                  )}
                                </>
                              ) : (
                                <Text style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                                  Add details or notes
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={{
              borderTopWidth: 1,
              borderTopColor: tokens.border || '#e5e7eb',
              paddingTop: 8,
              paddingBottom: 8,
              paddingHorizontal: spacing.lg,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <TouchableOpacity
                onPress={() => setShowGenerateLogModal(false)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#9ca3af' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  // TODO: Generate the log
                  Alert.alert('Generate Log', 'This will compile the selected samples into a compliance log.');
                  setShowGenerateLogModal(false);
                }}
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 8,
                  borderRadius: radius.md,
                  backgroundColor: '#000000',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#ffffff' }}>Generate Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Transcript Modal */}
      <Modal
        visible={showTranscriptModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowTranscriptModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.lg,
          }}
          onPress={() => setShowTranscriptModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: tokens.card || '#ffffff',
              borderRadius: radius.lg,
              width: '100%',
              maxWidth: 700,
              maxHeight: '90%',
            }}
          >
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: spacing.lg,
              borderBottomWidth: 1,
              borderBottomColor: tokens.border || '#e5e7eb',
            }}>
              <Text style={{
                fontSize: 20,
                fontWeight: '700',
                fontFamily: designTokens.fonts.display,
                color: tokens.text
              }}>
                Transcript
              </Text>
              <TouchableOpacity
                onPress={() => setShowTranscriptModal(false)}
                style={{ padding: spacing.xs }}
              >
                <X size={24} color={tokens.text || '#000000'} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={{ flex: 1, padding: spacing.lg }}>
              {loadingTranscript ? (
                <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={tokens.primary || '#3b82f6'} />
                  <Text style={{ marginTop: spacing.md, color: tokens.textSecondary }}>
                    Loading transcript...
                  </Text>
                </View>
              ) : (
                <View style={{ gap: spacing.lg }}>
                  {/* Student Information */}
                  {effectiveChildId && children && children.length > 0 && (() => {
                    const effectiveChild = child || sortedChildren.find(c => c.id === effectiveChildId);
                    const childName = effectiveChild?.first_name || effectiveChild?.name || 'Student';
                    
                    return (
                      <View style={{
                        padding: spacing.md,
                        backgroundColor: tokens.background || '#f9fafb',
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: tokens.border || '#e5e7eb',
                      }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: tokens.text, marginBottom: spacing.xs }}>
                          Student: {childName}
                        </Text>
                        <Text style={{ fontSize: 14, color: tokens.textSecondary }}>
                          School: Homeschool
                        </Text>
                      </View>
                    );
                  })()}

                  {/* Courses */}
                  {transcriptData.length === 0 ? (
                    <View style={{
                      padding: spacing.md,
                      backgroundColor: tokens.border + '20',
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      borderColor: tokens.border || '#e5e7eb',
                      borderStyle: 'dashed'
                    }}>
                      <Text style={{ fontSize: 12, color: tokens.textSecondary, fontStyle: 'italic', textAlign: 'center' }}>
                        No courses found. Add events with subjects to generate a transcript.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: spacing.md }}>
                      <Text style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: tokens.text,
                        marginBottom: spacing.sm
                      }}>
                        Courses
                      </Text>
                      {transcriptData.map((course, index) => (
                        <View key={index} style={{
                          padding: spacing.md,
                          backgroundColor: tokens.background || '#f9fafb',
                          borderRadius: radius.md,
                          borderWidth: 1,
                          borderColor: tokens.border || '#e5e7eb',
                        }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: tokens.text, flex: 1 }}>
                              {course.subjectName}
                            </Text>
                            {course.grade && (
                              <Text style={{ fontSize: 15, fontWeight: '600', color: tokens.text }}>
                                Grade: {course.grade}
                              </Text>
                            )}
                          </View>
                          <Text style={{ fontSize: 13, color: tokens.textSecondary, marginTop: spacing.xs }}>
                            Dates: {course.dateRange}
                          </Text>
                          {course.credit && (
                            <Text style={{ fontSize: 13, color: tokens.textSecondary, marginTop: spacing.xs }}>
                              Credit: {course.credit}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={{
              borderTopWidth: 1,
              borderTopColor: tokens.border || '#e5e7eb',
              paddingTop: 8,
              paddingBottom: 8,
              paddingHorizontal: spacing.lg,
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}>
              <TouchableOpacity
                onPress={() => setShowTranscriptModal(false)}
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 8,
                  borderRadius: radius.md,
                  backgroundColor: '#000000',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#ffffff' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report Card Modal */}
      <Modal
        visible={showReportCardModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowReportCardModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.lg,
          }}
          onPress={() => setShowReportCardModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: tokens.card || '#ffffff',
              borderRadius: radius.lg,
              width: '100%',
              maxWidth: 700,
              maxHeight: '90%',
            }}
          >
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: spacing.lg,
              borderBottomWidth: 1,
              borderBottomColor: tokens.border || '#e5e7eb',
            }}>
              <Text style={{
                fontSize: 20,
                fontWeight: '700',
                fontFamily: designTokens.fonts.display,
                color: tokens.text
              }}>
                Report Card
              </Text>
              <TouchableOpacity
                onPress={() => setShowReportCardModal(false)}
                style={{ padding: spacing.xs }}
              >
                <X size={24} color={tokens.text || '#000000'} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={{ flex: 1, padding: spacing.lg }}>
              {loadingReportCard ? (
                <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={tokens.primary || '#3b82f6'} />
                  <Text style={{ marginTop: spacing.md, color: tokens.textSecondary }}>
                    Loading report card...
                  </Text>
                </View>
              ) : (
                <View style={{ gap: spacing.lg }}>
                  {/* Student Information */}
                  {effectiveChildId && children && children.length > 0 && (() => {
                    const effectiveChild = child || sortedChildren.find(c => c.id === effectiveChildId);
                    const childName = effectiveChild?.first_name || effectiveChild?.name || 'Student';
                    
                    return (
                      <View style={{
                        padding: spacing.md,
                        backgroundColor: tokens.background || '#f9fafb',
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: tokens.border || '#e5e7eb',
                      }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: tokens.text, marginBottom: spacing.xs }}>
                          Student: {childName}
                        </Text>
                        <Text style={{ fontSize: 14, color: tokens.textSecondary }}>
                          School: Homeschool
                        </Text>
                      </View>
                    );
                  })()}

                  {/* Term Selection */}
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: tokens.text, marginBottom: spacing.sm }}>
                      Term
                    </Text>
                    <View style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: spacing.sm,
                    }}>
                      {availableTerms.map((term) => (
                        <TouchableOpacity
                          key={term}
                          onPress={() => {
                            setSelectedTerm(term);
                            loadReportCardData();
                          }}
                          style={{
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            borderRadius: radius.md,
                            borderWidth: 1,
                            borderColor: selectedTerm === term 
                              ? tokens.text || '#000000' 
                              : tokens.border || '#e5e7eb',
                            backgroundColor: selectedTerm === term 
                              ? tokens.text || '#000000' 
                              : 'transparent',
                          }}
                        >
                          <Text style={{
                            fontSize: 13,
                            fontWeight: '500',
                            color: selectedTerm === term 
                              ? '#ffffff' 
                              : tokens.text || '#000000',
                          }}>
                            {term}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Grades */}
                  <View>
                    <Text style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: tokens.text,
                      marginBottom: spacing.sm
                    }}>
                      Grades
                    </Text>
                    {reportCardData.length === 0 ? (
                      <View style={{
                        padding: spacing.md,
                        backgroundColor: tokens.border + '20',
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: tokens.border || '#e5e7eb',
                        borderStyle: 'dashed'
                      }}>
                        <Text style={{ fontSize: 12, color: tokens.textSecondary, fontStyle: 'italic', textAlign: 'center' }}>
                          No grades found for this term. Add grades to generate a report card.
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: spacing.sm }}>
                        {reportCardData.map((gradeItem) => (
                          <View key={gradeItem.id} style={{
                            padding: spacing.md,
                            backgroundColor: tokens.background || '#f9fafb',
                            borderRadius: radius.md,
                            borderWidth: 1,
                            borderColor: tokens.border || '#e5e7eb',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}>
                            <Text style={{ fontSize: 15, fontWeight: '500', color: tokens.text }}>
                              {gradeItem.subjectName}
                            </Text>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: tokens.text }}>
                              {gradeItem.grade}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Behavior Comments */}
                  <View>
                    <Text style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: tokens.text,
                      marginBottom: spacing.sm
                    }}>
                      Behavior Comments
                    </Text>
                    <TextInput
                      value={behaviorComment}
                      onChangeText={setBehaviorComment}
                      placeholder="Enter comments on student behavior for this term..."
                      multiline
                      numberOfLines={6}
                      style={{
                        padding: spacing.md,
                        backgroundColor: tokens.background || '#f9fafb',
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: tokens.border || '#e5e7eb',
                        fontSize: 14,
                        color: tokens.text,
                        minHeight: 120,
                        textAlignVertical: 'top',
                      }}
                      placeholderTextColor={tokens.textSecondary || '#9ca3af'}
                    />
                    <TouchableOpacity
                      onPress={saveBehaviorComment}
                      style={{
                        marginTop: spacing.sm,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.md,
                        backgroundColor: tokens.text || '#000000',
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#ffffff' }}>
                        Save Comment
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={{
              borderTopWidth: 1,
              borderTopColor: tokens.border || '#e5e7eb',
              paddingTop: 8,
              paddingBottom: 8,
              paddingHorizontal: spacing.lg,
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}>
              <TouchableOpacity
                onPress={() => setShowReportCardModal(false)}
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 8,
                  borderRadius: radius.md,
                  backgroundColor: '#000000',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#ffffff' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
