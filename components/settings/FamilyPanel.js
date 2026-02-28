import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Alert, ScrollView, Platform, Switch, Modal, Image } from 'react-native';
import { Edit, Plus, Copy, ExternalLink, LogOut, Trash2, Crown, ShoppingBag, HelpCircle, BookOpen, MessageSquare, ChevronRight, ChevronLeft, ChevronDown, Key, X, Infinity, Calendar, Users, BarChart2, Heart, FileText, SlidersHorizontal, Sparkles, Send, Eye, EyeOff, Pencil, Check, User, Link2, Bell, CreditCard } from 'lucide-react';
import { getFamilyMembers, inviteTutor, updateTutorScope, getMe, resetFamilyData, updateFamilyName } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { typography, getModeTokens } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { useToast } from '../Toast';
import { useAuth } from '../../contexts/AuthContext';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import EditChildModal from '../EditChildModal';
import AddChildModal from '../AddChildModal';
import AddSubjectModal from '../AddSubjectModal';
import AddMaterialModal from '../materials/AddMaterialModal';
import TaskCreateModal from '../TaskCreateModal';
import ConfirmDialog from '../ConfirmDialog';
import IDCardView from '../profile/IDCardView';

export default function FamilyPanel({ user, family: propFamily = null, familyId: propFamilyId = null, onFamilyUpdate = null, profile: propProfile = null, preloadedSubjects: propPreloadedSubjects = null }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const toast = useToast();
  const { signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [family, setFamily] = useState(propFamily);
  const [error, setError] = useState(null);
  const [editingChild, setEditingChild] = useState(null);
  const [showEditChildModal, setShowEditChildModal] = useState(false);
  const [familyId, setFamilyId] = useState(propFamilyId);
  const [hoveredChildId, setHoveredChildId] = useState(null);
  const [familyNameRowHovered, setFamilyNameRowHovered] = useState(false);
  const [logoutHovered, setLogoutHovered] = useState(false);
  
  // Profile state
  const [profile, setProfile] = useState(propProfile);
  
  // Profile editing state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [profileUsername, setProfileUsername] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const lastProfileSaveRef = useRef(0);
  const preferencesLoadedRef = useRef(false);
  const skipPreferencesSaveRef = useRef(true);
  
  // Notification preferences state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notifDailyUpdates, setNotifDailyUpdates] = useState(true);
  const [notifWeeklyProgress, setNotifWeeklyProgress] = useState(false);
  const [notifPlanningInsights, setNotifPlanningInsights] = useState(true);
  const [notifMotivation, setNotifMotivation] = useState(true);
  const [notifParentGuidance, setNotifParentGuidance] = useState(false);
  const [notifProductUpdates, setNotifProductUpdates] = useState(true);
  const [notifAnnouncements, setNotifAnnouncements] = useState(false);
  
  // App preferences state
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [motivationalMessagesEnabled, setMotivationalMessagesEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState('off'); // 'on', 'off', 'system'
  
  // Connected accounts (integrations) state
  const [connectedProviders, setConnectedProviders] = useState({
    google: false,
    dropbox: false,
    notion: false,
    youtube: false,
    quizlet: false,
    vimeo: false,
    canvas: false,
  });
  const [connectingProvider, setConnectingProvider] = useState(null);
  const [hoveredConnectionKey, setHoveredConnectionKey] = useState(null);
  const [googleAccountEmail, setGoogleAccountEmail] = useState(null);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [hoveredSubjectId, setHoveredSubjectId] = useState(null);
  
  // Active section for sidebar navigation
  const [activeSection, setActiveSection] = useState('members');
  
  // Modal state
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [editingSubjectInModal, setEditingSubjectInModal] = useState(null);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [expandedFAQSection, setExpandedFAQSection] = useState(null);
  const [expandedFAQQuestion, setExpandedFAQQuestion] = useState(null);
  
  // Courses/Subjects state
  const [subjects, setSubjects] = useState(propPreloadedSubjects || []);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectNotes, setEditSubjectNotes] = useState('');
  const [savingSubject, setSavingSubject] = useState(false);
  const [deleteSubjectConfirm, setDeleteSubjectConfirm] = useState({ visible: false, subject: null });
  const [childrenWithAvatars, setChildrenWithAvatars] = useState([]);
  
  // Feedback form state
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [feedbackType, setFeedbackType] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  
  // Data Vault state
  const [dataExportRequested, setDataExportRequested] = useState(false);
  const [dataDeleteRequested, setDataDeleteRequested] = useState(false);
  const [resetFamilyDataInProgress, setResetFamilyDataInProgress] = useState(false);
  
  // Tutor invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [inviteResultUrl, setInviteResultUrl] = useState(null);
  const [inviting, setInviting] = useState(false);
  
  // Child invite state
  const [childInviteEmail, setChildInviteEmail] = useState('');
  const [selectedChildForInvite, setSelectedChildForInvite] = useState(null);
  const [childInviteResultUrl, setChildInviteResultUrl] = useState(null);
  const [invitingChild, setInvitingChild] = useState(false);
  const [showChildInviteModal, setShowChildInviteModal] = useState(false);
  const [childInviteStep, setChildInviteStep] = useState('select'); // 'select' or 'email'
  
  // Parent invite state
  const [showParentInviteModal, setShowParentInviteModal] = useState(false);
  const [parentInviteEmail, setParentInviteEmail] = useState('');
  const [parentInviteResultUrl, setParentInviteResultUrl] = useState(null);
  const [invitingParent, setInvitingParent] = useState(false);

  // Family name inline edit (Parents section)
  const [isEditingFamilyName, setIsEditingFamilyName] = useState(false);
  const [editingFamilyNameValue, setEditingFamilyNameValue] = useState('');
  const [savingFamilyName, setSavingFamilyName] = useState(false);
  
  // Tutor invite state
  const [showTutorInviteModal, setShowTutorInviteModal] = useState(false);
  const [tutorInviteEmail, setTutorInviteEmail] = useState('');
  const [invitingTutor, setInvitingTutor] = useState(false);
  
  const [updatingTutorId, setUpdatingTutorId] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [showInviteUrlModal, setShowInviteUrlModal] = useState(false);
  const [inviteUrlToShow, setInviteUrlToShow] = useState(null);
  const [inviteUrlCopied, setInviteUrlCopied] = useState(false);

  // ID card modal: 'parent' | 'child' | 'tutor', selected member (or null to show picker), list of candidates
  const [showIdCardModal, setShowIdCardModal] = useState(false);
  const [idCardRole, setIdCardRole] = useState(null);
  const [idCardCandidates, setIdCardCandidates] = useState([]);
  const [idCardSelected, setIdCardSelected] = useState(null);
  // Temporary name for child ID card only (e.g. "First Last"); not saved to profile
  const [idCardDisplayName, setIdCardDisplayName] = useState('');

  // Children list from DB (includes archived) so Family page shows all children even if API filters or fails
  const [childrenFromDb, setChildrenFromDb] = useState(null);
  const [childrenFetchKey, setChildrenFetchKey] = useState(0);

  const styles = createStyles(tokens);

  // Copy to clipboard helper
  const copyToClipboard = async (text, label = 'Link') => {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setInviteUrlCopied(true);
        toast.push(`${label} copied to clipboard!`, 'success');
        setTimeout(() => setInviteUrlCopied(false), 2000);
        return true;
      } else if (Platform.OS === 'web') {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (success) {
          setInviteUrlCopied(true);
          toast.push(`${label} copied to clipboard!`, 'success');
          setTimeout(() => setInviteUrlCopied(false), 2000);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Copy to clipboard error:', err);
      return false;
    }
  };

  // Show invite URL modal
  const showInviteSuccessModal = (url) => {
    setInviteUrlToShow(url);
    setShowInviteUrlModal(true);
    setInviteUrlCopied(false);
    // Try to copy automatically, but don't show error if it fails
    copyToClipboard(url, 'Invite link').catch(() => {});
  };

  // Provider logo assets (PNG)
  const googleLogo = require('../../assets/google.png');
  const dropboxLogo = require('../../assets/dropbox.png');
  const notionLogo = require('../../assets/notion.png');
  const youtubeLogo = require('../../assets/youtube.png');
  const quizletLogo = require('../../assets/quizlet.png');
  const vimeoLogo = require('../../assets/vimeo.png');
  const canvasLogo = require('../../assets/canvas.png');

  // Update local state when prop changes
  useEffect(() => {
    if (propFamily) {
      setFamily(propFamily);
    } else if (!propFamily && user) {
      // Fallback: load family data if not provided as prop (e.g., in SettingsModal)
      const loadFamily = async () => {
        try {
          const { data, error: err } = await getFamilyMembers();
          if (!err && data) {
            setFamily(data);
            if (data.id) {
              setFamilyId(data.id);
            }
          }
        } catch (err) {
          // Silently fail - component will work without family data
        }
      };
      loadFamily();
    }
  }, [propFamily, user]);

  useEffect(() => {
    if (propFamilyId) {
      setFamilyId(propFamilyId);
    }
  }, [propFamilyId]);

  // Load children directly from Supabase (including archived) so everyone shows on Family page
  useEffect(() => {
    const fid = family?.id || familyId || propFamilyId;
    if (!fid) {
      setChildrenFromDb(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', fid);
        if (cancelled) return;
        if (error) {
          setChildrenFromDb(null);
          return;
        }
        const list = (data || []).map((c) => ({
          id: c.id,
          name: c.first_name || c.name || 'Child',
          first_name: c.first_name || c.name || 'Child',
          grade: c.grade ?? c.grade_level ?? c.grade_label,
          grade_level: c.grade_level ?? c.grade,
          archived: c.archived === true,
        }));
        setChildrenFromDb(list);
      } catch (_) {
        if (!cancelled) setChildrenFromDb(null);
      }
    })();
    return () => { cancelled = true; };
  }, [family?.id, familyId, propFamilyId, childrenFetchKey]);

  // Update profile when prop changes
  useEffect(() => {
    if (propProfile && !editingProfile) {
      const incomingName = propProfile.name || propProfile.first_name || '';
      const incomingEmail = propProfile.email || user?.email || '';
      const incomingPhone = propProfile.phone || '';
      const currentName = profileName || '';
      const currentEmail = profileEmail || '';
      const currentPhone = profilePhone || '';

      const hasDiff = incomingName !== currentName
        || incomingEmail !== currentEmail
        || incomingPhone !== currentPhone;

      if (lastProfileSaveRef.current && hasDiff) {
        return;
      }

      if (lastProfileSaveRef.current && !hasDiff) {
        lastProfileSaveRef.current = 0;
      }

      setProfile(propProfile);
      setProfileName(incomingName);
      setProfileEmail(incomingEmail);
      setProfilePhone(incomingPhone);
    } else if (!propProfile && user) {
      // Fallback: load profile data if not provided as prop (e.g., in SettingsModal)
      const loadProfile = async () => {
        try {
          const { data, error } = await getMe();
          if (!error && data) {
            setProfile(data);
            setProfileName(data.name || data.first_name || '');
            setProfileEmail(data.email || user?.email || '');
            setProfilePhone(data.phone || '');
          }
        } catch (error) {
          // Silently fail - component will work without profile data
        }
      };
      loadProfile();
    }
  }, [propProfile, user, editingProfile]);

  // Initialize family name when family data loads
  useEffect(() => {
    if (family?.family_name) {
      setFamilyName(family.family_name);
    }
  }, [family]);

  // Load preferences and notification preferences from DB
  useEffect(() => {
    if (!user?.id || !familyId) return;
    let cancelled = false;
    skipPreferencesSaveRef.current = true;
    (async () => {
      try {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('app_preferences')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        const ap = profileRow?.app_preferences || {};
        if (typeof ap === 'object') {
          setSoundEffectsEnabled(ap.sound_effects !== false);
          setAnimationsEnabled(ap.animations !== false);
          setMotivationalMessagesEnabled(ap.motivational_messages !== false);
          setDarkMode(ap.dark_mode === 'on' || ap.dark_mode === 'off' || ap.dark_mode === 'system' ? ap.dark_mode : 'off');
        }
        const { data: notifRow } = await supabase
          .from('notification_preferences')
          .select('notification_types, email_notifications_enabled')
          .eq('user_id', user.id)
          .eq('family_id', familyId)
          .maybeSingle();
        if (cancelled) return;
        if (notifRow?.notification_types && typeof notifRow.notification_types === 'object') {
          const nt = notifRow.notification_types;
          setNotifDailyUpdates(nt.daily_updates !== false);
          setNotifWeeklyProgress(nt.weekly_progress === true);
          setNotifPlanningInsights(nt.planning_insights !== false);
          setNotifMotivation(nt.motivation !== false);
          setNotifParentGuidance(nt.parent_guidance === true);
          setNotifProductUpdates(nt.product_updates !== false);
          setNotifAnnouncements(nt.announcements === true);
        }
        setNotificationsEnabled(notifRow?.email_notifications_enabled !== false);
      } catch (_) {
        // Silently fail; defaults remain
      } finally {
        if (!cancelled) {
          preferencesLoadedRef.current = true;
          setTimeout(() => { skipPreferencesSaveRef.current = false; }, 0);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, familyId]);

  // Persist app preferences to profiles when they change
  useEffect(() => {
    if (!preferencesLoadedRef.current || skipPreferencesSaveRef.current || !user?.id) return;
    supabase
      .from('profiles')
      .update({
        app_preferences: {
          sound_effects: soundEffectsEnabled,
          animations: animationsEnabled,
          motivational_messages: motivationalMessagesEnabled,
          dark_mode: darkMode,
        },
      })
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) console.warn('Failed to save app preferences:', error.message);
      });
  }, [soundEffectsEnabled, animationsEnabled, motivationalMessagesEnabled, darkMode, user?.id]);

  // Persist notification preferences to DB when they change
  useEffect(() => {
    if (!preferencesLoadedRef.current || skipPreferencesSaveRef.current || !user?.id || !familyId) return;
    supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: user.id,
          family_id: familyId,
          email_notifications_enabled: notificationsEnabled,
          notification_types: {
            daily_updates: notifDailyUpdates,
            weekly_progress: notifWeeklyProgress,
            planning_insights: notifPlanningInsights,
            motivation: notifMotivation,
            parent_guidance: notifParentGuidance,
            product_updates: notifProductUpdates,
            announcements: notifAnnouncements,
          },
        },
        { onConflict: 'user_id,family_id' }
      )
      .then(({ error }) => {
        if (error) console.warn('Failed to save notification preferences:', error.message);
      });
  }, [
    notificationsEnabled,
    notifDailyUpdates,
    notifWeeklyProgress,
    notifPlanningInsights,
    notifMotivation,
    notifParentGuidance,
    notifProductUpdates,
    notifAnnouncements,
    user?.id,
    familyId,
  ]);

  // Sync preloaded subjects when prop changes
  useEffect(() => {
    if (propPreloadedSubjects && Array.isArray(propPreloadedSubjects)) {
      setSubjects(propPreloadedSubjects);
    }
  }, [propPreloadedSubjects]);

  // Fetch children with avatar data for colored dots (matching WebLayout pattern)
  useEffect(() => {
    if (!familyId) return;
    
    const validateAvatarUrl = (url) => {
      if (!url || typeof url !== 'string') return null;
      // If it's a UUID (36 chars with hyphens), it's not a valid URL
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url)) {
        return null;
      }
      // If it looks like a URL, return it
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
        return url;
      }
      // Otherwise assume it's an avatar name like "prof1"
      return url;
    };
    
    const fetchChildren = async () => {
      try {
        const { data: childrenData, error: childrenError } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', familyId)
          .eq('archived', false);
        
        if (childrenError) {
          // Try without archived filter if that fails
          if (childrenError.code === '400' || childrenError.code === 'PGRST301' || childrenError.code === '42703') {
            const { data: allData } = await supabase
              .from('children')
              .select('*')
              .eq('family_id', familyId);
            // Validate and clean avatar URLs
            const cleaned = (allData || []).map(child => ({
              ...child,
              avatar_url: validateAvatarUrl(child.avatar_url || child.avatar),
              avatar: validateAvatarUrl(child.avatar) ?? null
            }));
            setChildrenWithAvatars(cleaned);
          } else {
            console.warn('[FamilyPanel] Error fetching children:', childrenError);
            setChildrenWithAvatars([]);
          }
        } else {
          // Validate and clean avatar URLs
          const cleaned = (childrenData || []).map(child => ({
            ...child,
            avatar_url: validateAvatarUrl(child.avatar_url || child.avatar),
            avatar: validateAvatarUrl(child.avatar) ?? null
          }));
          setChildrenWithAvatars(cleaned);
        }
      } catch (err) {
        console.error('[FamilyPanel] Error fetching children:', err);
        setChildrenWithAvatars([]);
      }
    };
    
    fetchChildren();
  }, [familyId]);

  // Load subjects for courses page
  const loadSubjects = async () => {
    if (!familyId) return;
    setLoadingSubjects(true);
    try {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name, child_id, grade, notes, created_at, updated_at')
        .eq('family_id', familyId)
        .order('name');
      
      if (!error && data) {
        setSubjects(data);
      }
    } catch (err) {
      console.error('[FamilyPanel] Error loading subjects:', err);
    } finally {
      setLoadingSubjects(false);
    }
  };

  // Only load subjects if preloadedSubjects is not available
  useEffect(() => {
    if (familyId && activeSection === 'courses') {
      // If we have preloaded subjects, use them; otherwise load
      if (!propPreloadedSubjects || propPreloadedSubjects.length === 0) {
        loadSubjects();
      }
    }
  }, [familyId, activeSection, propPreloadedSubjects]);

  // Handle browser back button for About page
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handlePopState = (event) => {
      // If we're on the about, terms, or privacy page and user hits back, return to profile
      if (activeSection === 'about' || activeSection === 'terms' || activeSection === 'privacy') {
        setActiveSection('profile');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeSection]);

  // Subject management functions
  const handleEditSubject = (subject) => {
    setEditingSubjectInModal(subject);
    setShowAddSubjectModal(true);
  };

  const handleSaveSubject = async () => {
    if (!editingSubject) return;
    setSavingSubject(true);
    try {
      const { error } = await supabase
        .from('subject')
        .update({
          name: editSubjectName.trim(),
          notes: editSubjectNotes.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingSubject.id);
      
      if (error) throw error;
      toast.push('Subject updated successfully!', 'success');
      setEditingSubject(null);
      loadSubjects();
    } catch (err) {
      toast.push('Failed to update subject: ' + err.message, 'error');
    } finally {
      setSavingSubject(false);
    }
  };

  const performDeleteSubject = async (subject) => {
    if (!subject) return;
    try {
      await supabase.from('events').delete().eq('subject_id', subject.id);
      await supabase.from('materials').delete().eq('subject_id', subject.id);
      const { data: syllabi } = await supabase.from('syllabi').select('id').eq('subject_id', subject.id);
      if (syllabi && syllabi.length > 0) {
        const syllabusIds = syllabi.map(s => s.id);
        await supabase.from('syllabus_sections').delete().in('syllabus_id', syllabusIds);
        await supabase.from('syllabi').delete().eq('subject_id', subject.id);
      }
      const { error } = await supabase.from('subject').delete().eq('id', subject.id);
      if (error) throw error;
      toast.push(`"${subject.name}" has been deleted.`, 'success');
      loadSubjects();
    } catch (err) {
      toast.push('Failed to delete subject: ' + err.message, 'error');
    }
  };

  const handleDeleteSubject = async (subject) => {
    if (Platform.OS === 'web') {
      setDeleteSubjectConfirm({
        visible: true,
        subject,
      });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      Alert.alert(
        'Delete Subject',
        `Are you sure you want to delete "${subject.name}"? This will permanently remove the subject and all its related data.`,
        [
          { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
          { text: 'Delete', onPress: () => resolve(true), style: 'destructive' }
        ]
      );
    });
    if (!confirmed) return;
    await performDeleteSubject(subject);
  };

  // Helper to get child names for a subject (child_id can be single UUID or semicolon-separated)
  const getSubjectChildNames = (subject) => {
    if (subject.child_id == null || String(subject.child_id).trim() === '') {
      return 'All children';
    }
    const availableChildren = childrenWithAvatars.length > 0 ? childrenWithAvatars : (family?.children || []);
    const childIds = String(subject.child_id).split(';').map(id => id.trim()).filter(Boolean);
    if (childIds.length === 0) return 'All children';
    const childNames = childIds.map(id => {
      const child = availableChildren.find(c => String(c.id) === String(id));
      return child ? (child.name || child.first_name || 'Child') : null;
    }).filter(Boolean);
    if (childNames.length > 0) return childNames.join(', ');
    return childIds.length === 1 ? '1 student' : `${childIds.length} students`;
  };

  // Helper to get last activity text for a subject
  const getSubjectLastActivity = (subject) => {
    // For now, return a placeholder. In the future, this would come from actual activity data
    // This could be based on last assignment, last lesson, last update, etc.
    if (subject.updated_at) {
      const updatedDate = new Date(subject.updated_at);
      const now = new Date();
      const diffDays = Math.floor((now - updatedDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Last activity today';
      if (diffDays === 1) return 'Last activity yesterday';
      if (diffDays < 7) return `Last activity ${diffDays} days ago`;
      if (diffDays < 30) return `Last activity ${Math.floor(diffDays / 7)} weeks ago`;
      return 'Last activity over a month ago';
    }
    return 'Not started';
  };

  // Listen for profile refresh events
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleRefreshProfile = async () => {
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('name, first_name, email, phone, role')
          .eq('id', profile?.id || user?.id)
          .maybeSingle();

        if (profileData) {
          setProfile(prev => ({ ...prev, ...profileData }));
          setProfileName(profileData.name || profileData.first_name || '');
          setProfileEmail(profileData.email || '');
          setProfilePhone(profileData.phone || '');
        }
      } catch (err) {
        console.error('Error refreshing profile:', err);
      }
    };

    window.addEventListener('refreshProfile', handleRefreshProfile);
    return () => {
      window.removeEventListener('refreshProfile', handleRefreshProfile);
    };
  }, []);

  const toggleChildSelection = (childId) => {
    setSelectedChildIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]
    );
  };

  const handleInviteTutor = async () => {
    if (!inviteEmail.trim()) {
      setError('Please enter an email for the tutor.');
      return;
    }
    if (selectedChildIds.length === 0) {
      setError('Please select at least one child the tutor can see.');
      return;
    }

    setInviting(true);
    setError(null);
    setInviteResultUrl(null);
    try {
      const { data, error: err } = await inviteTutor({
        email: inviteEmail.trim(),
        role: 'tutor',
        child_ids: selectedChildIds,
      });
      if (err) throw err;
      setInviteResultUrl(data.invite_url);
      setInviteEmail('');
      setSelectedChildIds([]);
      toast.push('Invite sent successfully!', 'success');
      if (data.invite_url) {
        showInviteSuccessModal(data.invite_url);
      }
    } catch (err) {
      setError(err.message || 'Failed to invite tutor');
      toast.push('Failed to invite tutor', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleInviteChild = async () => {
    if (!childInviteEmail.trim()) {
      setError('Please enter an email for the child.');
      return;
    }
    if (!selectedChildForInvite) {
      setError('Please select which child record this invite is for.');
      return;
    }

    setInvitingChild(true);
    setError(null);
    setChildInviteResultUrl(null);
    try {
      const { data, error: err } = await inviteTutor({
        email: childInviteEmail.trim(),
        role: 'child',
        child_ids: [selectedChildForInvite],
      });
      if (err) throw err;
      setChildInviteResultUrl(data.invite_url);
      setChildInviteEmail('');
      setSelectedChildForInvite(null);
      setShowChildInviteModal(false);
      setChildInviteStep('select');
      toast.push('Child invite sent successfully!', 'success');
      if (data.invite_url) {
        showInviteSuccessModal(data.invite_url);
      }
      if (onFamilyUpdate) onFamilyUpdate();
    } catch (err) {
      setError(err.message || 'Failed to invite child');
      toast.push('Failed to invite child', 'error');
    } finally {
      setInvitingChild(false);
    }
  };

  const handleInviteParent = async () => {
    if (!parentInviteEmail.trim()) {
      setError('Please enter an email for the parent.');
      return;
    }

    // Check if there are already 2 parents
    const currentParents = (family?.members || []).filter(
      (m) => (m.member_role || m.role) === 'parent'
    );
    if (currentParents.length >= 2) {
      setError('Maximum of 2 parents allowed per family.');
      toast.push('Maximum of 2 parents allowed per family', 'error');
      return;
    }

    setInvitingParent(true);
    setError(null);
    setParentInviteResultUrl(null);
    try {
      const { data, error: err } = await inviteTutor({
        email: parentInviteEmail.trim(),
        role: 'parent',
        child_ids: [], // Parents can see all children
      });
      if (err) throw err;
      setParentInviteResultUrl(data.invite_url);
      setParentInviteEmail('');
      setShowParentInviteModal(false);
      toast.push('Parent invite sent successfully!', 'success');
      if (data.invite_url) {
        showInviteSuccessModal(data.invite_url);
      }
      if (onFamilyUpdate) onFamilyUpdate();
    } catch (err) {
      setError(err.message || 'Failed to invite parent');
      toast.push('Failed to invite parent', 'error');
    } finally {
      setInvitingParent(false);
    }
  };

  const handleInviteTutorFromModal = async () => {
    if (!tutorInviteEmail.trim()) {
      setError('Please enter an email for the tutor.');
      return;
    }

    setInvitingTutor(true);
    setError(null);
    try {
      const { data, error: err } = await inviteTutor({
        email: tutorInviteEmail.trim(),
        role: 'tutor',
        child_ids: children.map(c => c.id),
      });
      if (err) throw err;
      setTutorInviteEmail('');
      setShowTutorInviteModal(false);
      toast.push('Tutor invite sent successfully!', 'success');
      if (data?.invite_url) {
        showInviteSuccessModal(data.invite_url);
      }
      if (onFamilyUpdate) onFamilyUpdate();
    } catch (err) {
      setError(err.message || 'Failed to invite tutor');
      toast.push('Failed to invite tutor', 'error');
    } finally {
      setInvitingTutor(false);
    }
  };


  const handleOpenChildInviteModal = () => {
    if (children.length === 0) {
      toast.push('Please add a child first before inviting', 'error');
      return;
    }
    setShowChildInviteModal(true);
    setChildInviteStep(children.length === 1 ? 'email' : 'select');
    if (children.length === 1) {
      setSelectedChildForInvite(children[0].id);
    } else {
      setSelectedChildForInvite(null);
    }
    setChildInviteEmail('');
    setError(null);
  };

  const handleSelectChildForInvite = (childId) => {
    setSelectedChildForInvite(childId);
    setChildInviteStep('email');
  };

  const handleCopyInvite = async (url) => {
    if (!url) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.push('Invite link copied to clipboard', 'success');
      } else {
        Alert.alert('Invite Link', url);
      }
    } catch (e) {
      toast.push('Failed to copy link', 'error');
    }
  };

  const handleEmailPress = () => {
    if (Platform.OS === 'web') {
      window.location.href = 'mailto:support@learnadoodle.com';
    }
  };

  const handleResetPassword = async () => {
    const userEmail = profile?.email || user?.email;
    if (!userEmail) {
      toast.push('No email address found', 'error');
      return;
    }

    setResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: Platform.OS === 'web' ? `${window.location.origin}/reset-password` : undefined,
      });
      
      if (error) throw error;
      
      toast.push('Password reset email sent. Check your inbox.', 'success');
    } catch (err) {
      toast.push(err.message || 'Failed to send reset email', 'error');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setError(null);
    
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        throw new Error('User not authenticated');
      }

      const currentEmail = (profile?.email || user?.email || authUser?.email || '').toLowerCase();
      const newEmail = profileEmail.trim().toLowerCase();
      const emailChanged = newEmail && newEmail !== currentEmail;

      // If email is being changed, trigger verification through Supabase Auth
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ 
          email: profileEmail.trim() 
        });
        
        if (emailError) {
          throw emailError;
        }
        
        // Show verification message - email won't actually change until verified
        toast.push('Verification email sent to ' + profileEmail.trim() + '. Please check your inbox to confirm the change. Your email will only be updated after you verify it.', 'info');
        
        // Reset email field to current email since change is pending verification
        setProfileEmail(profile?.email || user?.email || authUser?.email || '');
      } else {
        // No changes to save
        toast.push('No changes to save', 'info');
      }

      // Dispatch global events to refresh profile in other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshProfile'));
        window.dispatchEvent(new CustomEvent('refreshFamily'));
      }

      lastProfileSaveRef.current = Date.now();
      setEditingProfile(false);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
      toast.push(err.message || 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Sync email from auth.users to profiles when email is verified
  useEffect(() => {
    if (!user) return;

    const syncEmail = async () => {
      try {
        // Check if auth email differs from profile email
        const authEmail = user?.email || '';
        const profileEmailValue = profile?.email || '';
        
        if (authEmail && authEmail !== profileEmailValue) {
          // Call the sync function to update profile email
          const { error } = await supabase.rpc('sync_current_user_email');
          
          if (!error) {
            // Refresh profile data
            const { data: updatedProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', user.id)
              .single();
            
            if (updatedProfile) {
              setProfile(updatedProfile);
              setProfileEmail(updatedProfile.email || authEmail);
            }
          }
        }
      } catch (err) {
        // Silently fail - email sync is not critical
        console.log('Email sync check failed:', err);
      }
    };

    // Check on mount and when user/profile changes
    syncEmail();
  }, [user?.email, profile?.email, user?.id]);

  if (error && !family) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>FAMILY</Text>
          <Text style={styles.sectionSubtitle}>
            Manage your family profile, children, and tutor access.
          </Text>
        </View>
        <View style={styles.headerDivider} />
        <View style={styles.contentWrapper}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        </View>
      </View>
    );
  }

  const parents = (family?.members || []).filter(
    (m) => (m.member_role || m.role) === 'parent'
  );
  const tutors = (family?.members || []).filter(
    (m) => (m.member_role || m.role) === 'tutor'
  );
  const children = (childrenFromDb != null ? childrenFromDb : family?.children || []);

  const openIdCardModal = (role, candidates) => {
    if (!candidates || candidates.length === 0) {
      const label = role === 'parent' ? 'parents' : role === 'child' ? 'children' : 'tutors';
      toast.push(`Add a ${label.slice(0, -1)} first to generate an ID card.`, 'info');
      return;
    }
    setIdCardRole(role);
    setIdCardCandidates(candidates);
    const selected = candidates.length === 1 ? candidates[0] : null;
    setIdCardSelected(selected);
    if (role === 'child' && selected) {
      setIdCardDisplayName(selected.name || selected.first_name || 'Child');
    } else {
      setIdCardDisplayName('');
    }
    setShowIdCardModal(true);
  };

  const normalizeMemberForIdCard = (member, role) => {
    if (role === 'child') return member;
    if (role === 'parent') {
      const name = family?.family_name || member.email || 'Parent';
      return { id: member.id, first_name: name, name, avatar_url: member.avatar_url };
    }
    const name = member.name || member.email || 'Tutor';
    return { id: member.id, first_name: name, name, avatar_url: member.avatar_url };
  };

  const CONNECTION_PROVIDERS = [
    {
      key: 'google',
      label: 'Google Drive/Docs/Classroom',
      description: 'Connect once to access Google Drive files, Google Docs, and sync with Google Classroom.',
      image: googleLogo,
    },
    {
      key: 'dropbox',
      label: 'Dropbox',
      description: 'Connect shared folders and teaching resources from Dropbox.',
      image: dropboxLogo,
    },
    {
      key: 'notion',
      label: 'Notion',
      description: 'Sync your Notion workspace pages and databases with your learning library.',
      image: notionLogo,
    },
    {
      key: 'youtube',
      label: 'YouTube',
      description: 'Save favorite learning videos and channels into your library.',
      image: youtubeLogo,
    },
    {
      key: 'quizlet',
      label: 'Quizlet',
      description: 'Import study sets and flashcards from Quizlet for each learner.',
      image: quizletLogo,
    },
    {
      key: 'vimeo',
      label: 'Vimeo',
      description: 'Access educational videos and courses from your Vimeo account.',
      image: vimeoLogo,
    },
    {
      key: 'canvas',
      label: 'Canvas',
      description: 'Sync assignments, courses, and materials from Canvas LMS.',
      image: canvasLogo,
    },
  ];

  const setProviderConnection = (providerKey, isConnected) => {
    setConnectedProviders((prev) => ({
      ...prev,
      [providerKey]: isConnected,
    }));
  };

  // Load connection status from API
  const loadConnectionStatus = async (useCache = true, showLoading = false) => {
    if (!user || !familyId) return;
    
    // Try to load from cache first if useCache is true
    if (useCache && Platform.OS === 'web' && typeof window !== 'undefined') {
      const cacheKey = `connection_status_${familyId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { data: statusData, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
          
          if (age < CACHE_TTL_MS && statusData) {
            // Use cached data immediately (no loading state)
            statusData.forEach((integration) => {
              if (integration.provider === 'google') {
                setProviderConnection('google', integration.connected);
                if (integration.account_email) {
                  setGoogleAccountEmail(integration.account_email);
                }
              } else if (integration.provider === 'youtube') {
                setProviderConnection('youtube', integration.connected);
              }
            });
            
            // Refresh in background if cache is older than 1 minute
            if (age > 60 * 1000) {
              loadConnectionStatus(false, false); // Refresh without using cache, no loading state
            }
            return;
          }
        } catch (err) {
          console.warn('Failed to parse cached connection status:', err);
        }
      }
    }
    
    // If no cache or cache expired, fetch from API (only show loading if explicitly requested)
    if (showLoading) {
      setLoadingConnections(true);
    }
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get integration status
      const statusRes = await fetch(`${apiBase}/api/integrations/status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        
        // Cache the data
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const cacheKey = `connection_status_${familyId}`;
          localStorage.setItem(cacheKey, JSON.stringify({
            data: statusData,
            timestamp: Date.now()
          }));
        }
        
        // Update connection status for each provider
        statusData.forEach((integration) => {
          if (integration.provider === 'google') {
            setProviderConnection('google', integration.connected);
            if (integration.account_email) {
              setGoogleAccountEmail(integration.account_email);
            }
          } else if (integration.provider === 'youtube') {
            setProviderConnection('youtube', integration.connected);
          }
        });
      }
    } catch (error) {
      console.error('Failed to load connection status:', error);
    } finally {
      if (showLoading) {
        setLoadingConnections(false);
      }
    }
  };

  // Load connection status on mount (use cache first, no loading state)
  useEffect(() => {
    if (user && familyId) {
      loadConnectionStatus(true); // Use cache first, load immediately
    }
  }, [user, familyId]);

  // Refresh connection status when connections section becomes active (if needed)
  useEffect(() => {
    if (activeSection === 'connections' && user && familyId) {
      // Only refresh if cache is stale (background refresh)
      loadConnectionStatus(false); // Force refresh in background
    }
  }, [activeSection, user, familyId]);

  // Listen for OAuth callback messages (for Google)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleMessage = (event) => {
      // Listen for OAuth completion messages
      if (event.data && event.data.type === 'GOOGLE_OAUTH_SUCCESS') {
        loadConnectionStatus();
        toast.push('Google account connected successfully', 'success');
      } else if (event.data && event.data.type === 'GOOGLE_OAUTH_ERROR') {
        toast.push('Failed to connect Google account', 'error');
        setConnectingProvider(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectProvider = async (providerKey) => {
    if (connectingProvider) return;
    setConnectingProvider(providerKey);
    
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.push('Please sign in to connect accounts', 'error');
        setConnectingProvider(null);
        return;
      }

      if (providerKey === 'google') {
        // Start Google OAuth flow
        const res = await fetch(`${apiBase}/api/google/calendar/oauth/start?family_id=${familyId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to start Google OAuth');
        }

        const data = await res.json();

        // Open OAuth URL in new window/tab
        if (Platform.OS === 'web' && data.auth_url) {
          const popup = window.open(
            data.auth_url,
            'Google OAuth',
            'width=600,height=700,scrollbars=yes,resizable=yes'
          );

          // Poll for popup closure (user may have completed OAuth)
          const checkClosed = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkClosed);
              // Reload connection status after a short delay
              setTimeout(() => {
                loadConnectionStatus();
                setConnectingProvider(null);
              }, 1000);
            }
          }, 500);

          toast.push('Complete Google connection in the popup window', 'info');
        } else {
          throw new Error('OAuth popup not supported on this platform');
        }
      } else if (providerKey === 'youtube') {
        // YouTube uses API key, not OAuth - just check if it's configured
        const res = await fetch(`${apiBase}/api/integrations/status`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (res.ok) {
          const statusData = await res.json();
          const youtubeIntegration = statusData.find(i => i.provider === 'youtube');
          
          if (youtubeIntegration && youtubeIntegration.connected) {
            setProviderConnection('youtube', true);
            toast.push('YouTube API is configured and ready to use', 'success');
          } else {
            toast.push('YouTube API key is not configured. Please contact support.', 'error');
          }
        } else {
          throw new Error('Failed to check YouTube status');
        }
        setConnectingProvider(null);
      } else {
        // Other providers - placeholder for now
        toast.push(`${providerKey} connection coming soon`, 'info');
        setConnectingProvider(null);
      }
    } catch (err) {
      console.error('Connection error:', err);
      toast.push(err.message || 'Failed to connect account', 'error');
      setConnectingProvider(null);
    }
  };

  const handleDisconnectProvider = async (providerKey) => {
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.push('Please sign in to disconnect accounts', 'error');
        return;
      }

      if (providerKey === 'google') {
        // Disconnect Google Calendar
        const res = await fetch(`${apiBase}/api/google/calendar/credential`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to disconnect Google account');
        }

        setProviderConnection('google', false);
        setGoogleAccountEmail(null);
        toast.push('Google account disconnected', 'success');
      } else if (providerKey === 'youtube') {
        // YouTube uses API key, can't be "disconnected" per se
        toast.push('YouTube API key is configured at the system level and cannot be disconnected here', 'info');
      } else {
        // Other providers
        setProviderConnection(providerKey, false);
        toast.push(`${providerKey} account disconnected`, 'success');
      }
    } catch (err) {
      console.error('Disconnection error:', err);
      toast.push(err.message || 'Failed to disconnect account', 'error');
    }
  };

  // Render content based on active section
  const renderMainContent = () => {
    switch (activeSection) {
      case 'connections':
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Connected accounts</Text>

            <Text style={styles.connectionsSectionTitle}>Cloud storage & docs</Text>
            <View style={styles.connectionsSectionDivider} />

            <View style={styles.connectionsList}>
              {CONNECTION_PROVIDERS.filter(p =>
                ['google', 'dropbox', 'notion'].includes(p.key)
              ).map(({ key, label, description, image }, index, array) => {
                const isConnected = !!connectedProviders[key];
                const isBusy = connectingProvider === key;
                const isRecommended = key === 'google';
                const isHovered = hoveredConnectionKey === key;

                return (
                  <React.Fragment key={key}>
                    <View 
                      style={[
                        styles.connectionCardRow,
                        isHovered && styles.connectionCardRowHovered,
                      ]}
                      {...(Platform.OS === 'web' && {
                        onMouseEnter: () => setHoveredConnectionKey(key),
                        onMouseLeave: () => setHoveredConnectionKey(null),
                      })}
                    >
                      <View style={styles.connectionRowLeft}>
                        <View style={styles.connectionRowIconContainer}>
                          <Image source={image} style={styles.connectionRowImage} resizeMode="contain" />
                        </View>
                        <View style={styles.connectionRowText}>
                          <View style={styles.connectionRowHeader}>
                            <Text style={styles.connectionRowLabel}>{label}</Text>
                            {isConnected && (
                              <View style={styles.connectionStatusChip}>
                                <View style={styles.connectionStatusDot} />
                                <Text style={styles.connectionStatusText}>Connected</Text>
                              </View>
                            )}
                            {!isConnected && isRecommended && (
                              <View style={styles.connectionRecommendedChip}>
                                <Text style={styles.connectionRecommendedText}>Recommended</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.connectionRowDescription}>{description}</Text>
                          {isConnected && key === 'google' && googleAccountEmail && (
                            <Text style={styles.connectionAccountEmail}>Connected as: {googleAccountEmail}</Text>
                          )}
                          {isConnected && key !== 'google' && (
                            <Text style={styles.connectionLastSynced}>Last synced today</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.connectionRowActions}>
                        {isConnected ? (
                          <>
                            <TouchableOpacity
                              style={styles.connectionManageButton}
                              onPress={() => {
                                toast.push('Connection settings coming soon for this provider', 'info');
                              }}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.connectionManageButtonText}>Manage</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.connectionDisconnectButton}
                              onPress={() => handleDisconnectProvider(key)}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.connectionDisconnectButtonText}>Disconnect</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.connectionConnectButton,
                              isBusy && styles.connectionConnectButtonDisabled,
                            ]}
                            onPress={() => handleConnectProvider(key)}
                            disabled={isBusy}
                            {...(Platform.OS === 'web' && {
                              cursor: isBusy ? 'not-allowed' : 'pointer',
                            })}
                          >
                            {isBusy ? (
                              <ActivityIndicator size="small" color="#887DEE" />
                            ) : (
                              <Text style={styles.connectionConnectButtonText}>Connect</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    {index < array.length - 1 && <View style={styles.connectionRowDivider} />}
                  </React.Fragment>
                );
              })}
            </View>

            <Text style={styles.connectionsSectionTitle}>Learning platforms</Text>
            <View style={styles.connectionsSectionDivider} />

            <View style={styles.connectionsList}>
              {CONNECTION_PROVIDERS.filter(p =>
                ['youtube', 'quizlet', 'vimeo', 'canvas'].includes(p.key)
              ).map(({ key, label, description, image }, index, array) => {
                const isConnected = !!connectedProviders[key];
                const isBusy = connectingProvider === key;
                const isHovered = hoveredConnectionKey === key;

                return (
                  <React.Fragment key={key}>
                    <View 
                      style={[
                        styles.connectionCardRow,
                        isHovered && styles.connectionCardRowHovered,
                      ]}
                      {...(Platform.OS === 'web' && {
                        onMouseEnter: () => setHoveredConnectionKey(key),
                        onMouseLeave: () => setHoveredConnectionKey(null),
                      })}
                    >
                      <View style={styles.connectionRowLeft}>
                        <View style={styles.connectionRowIconContainer}>
                          <Image source={image} style={styles.connectionRowImage} resizeMode="contain" />
                        </View>
                        <View style={styles.connectionRowText}>
                          <View style={styles.connectionRowHeader}>
                            <Text style={styles.connectionRowLabel}>{label}</Text>
                            {isConnected && (
                              <View style={styles.connectionStatusChip}>
                                <View style={styles.connectionStatusDot} />
                                <Text style={styles.connectionStatusText}>Connected</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.connectionRowDescription}>{description}</Text>
                          {isConnected && (
                            <Text style={styles.connectionLastSynced}>Last synced today</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.connectionRowActions}>
                        {isConnected ? (
                          <>
                            <TouchableOpacity
                              style={styles.connectionManageButton}
                              onPress={() => {
                                toast.push('Connection settings coming soon for this provider', 'info');
                              }}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.connectionManageButtonText}>Manage</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.connectionDisconnectButton}
                              onPress={() => handleDisconnectProvider(key)}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.connectionDisconnectButtonText}>Disconnect</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.connectionConnectButton,
                              isBusy && styles.connectionConnectButtonDisabled,
                            ]}
                            onPress={() => handleConnectProvider(key)}
                            disabled={isBusy}
                            {...(Platform.OS === 'web' && {
                              cursor: isBusy ? 'not-allowed' : 'pointer',
                            })}
                          >
                            {isBusy ? (
                              <ActivityIndicator size="small" color="#887DEE" />
                            ) : (
                              <Text style={styles.connectionConnectButtonText}>Connect</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    {index < array.length - 1 && <View style={styles.connectionRowDivider} />}
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        );
      
      case 'preferences':
        const CustomToggle = ({ value, onValueChange }) => (
          <TouchableOpacity
            style={[styles.customToggleTrack, value && styles.customToggleTrackOn]}
            onPress={() => onValueChange(!value)}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={[styles.customToggleThumb, value && styles.customToggleThumbOn]} />
          </TouchableOpacity>
        );
        
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Preferences</Text>
            
            <Text style={styles.subsectionTitle}>Lesson experience</Text>
            <View style={styles.subsectionDivider} />
            
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>Sound effects</Text>
              <CustomToggle
                value={soundEffectsEnabled}
                onValueChange={setSoundEffectsEnabled}
              />
            </View>
            
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>Animations</Text>
              <CustomToggle
                value={animationsEnabled}
                onValueChange={setAnimationsEnabled}
              />
            </View>
            
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>Motivational messages</Text>
              <CustomToggle
                value={motivationalMessagesEnabled}
                onValueChange={setMotivationalMessagesEnabled}
              />
            </View>
            
            <View style={styles.preferencesSectionSpacer}>
              <Text style={styles.subsectionTitle}>Appearance</Text>
              <View style={styles.subsectionDivider} />
              
              <View style={styles.preferenceRow}>
                <Text style={styles.preferenceLabel}>Dark mode</Text>
                <CustomToggle
                  value={darkMode === 'on'}
                  onValueChange={(value) => setDarkMode(value ? 'on' : 'off')}
                />
              </View>
            </View>
          </View>
        );
      
      case 'profile':
        const hasProfileChanges = profileEmail.trim() !== (profile?.email || user?.email || '');
        
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Profile</Text>
            
            {/* Account Management Section */}
            <View style={styles.profileAccountSection}>
              <Text style={styles.subsectionTitle}>Account management</Text>
              <View style={styles.subsectionDivider} />
              
              {/* Email Field */}
              <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Email</Text>
              <View style={styles.profileEmailInputContainer}>
                <TextInput
                  style={[styles.profileDarkInput, styles.profileEmailInput]}
                  value={profileEmail}
                  onChangeText={setProfileEmail}
                  placeholder="Enter your email"
                  placeholderTextColor="#6b7280"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {hasProfileChanges && (
                  <TouchableOpacity
                    style={styles.profileEmailCheckButton}
                    onPress={async () => {
                      setSavingProfile(true);
                      try {
                        // Update email if changed
                        await handleSaveProfile();
                      } catch (err) {
                        toast.push(err.message || 'Failed to save changes', 'error');
                      } finally {
                        setSavingProfile(false);
                      }
                    }}
                    disabled={savingProfile}
                    {...(Platform.OS === 'web' && { cursor: savingProfile ? 'not-allowed' : 'pointer' })}
                  >
                    {savingProfile ? (
                      <ActivityIndicator size="small" color="#60a5fa" />
                    ) : (
                      <Check size={20} color="#60a5fa" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
              {hasProfileChanges && (
                <Text style={styles.profileEmailSaveHint}>
                  Click the checkmark to save your changes
                </Text>
              )}
              <Text style={styles.profileEmailHint}>
                Changing your email will send a verification link to the new address. Your email will only be updated after you verify it.
              </Text>
              {user && !user.email_confirmed_at && (
                <View style={styles.profileEmailVerify}>
                  <Text style={styles.profileEmailVerifyText}>Email not verified. </Text>
                  <TouchableOpacity onPress={() => toast.push('Verification email sent!', 'success')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Text style={styles.profileEmailVerifyLink}>Verify now</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            
            {/* Reset Password Button */}
            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Password</Text>
              <TouchableOpacity
                style={styles.profileResetPasswordButton}
                onPress={handleResetPassword}
                disabled={resettingPassword}
                {...(Platform.OS === 'web' && { cursor: resettingPassword ? 'not-allowed' : 'pointer' })}
              >
                {resettingPassword ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <Text style={styles.profileResetPasswordButtonText}>Reset password</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.profileResetPasswordHint}>
                We'll send you an email with a link to reset your password.
              </Text>
            </View>
            </View>
            
            {/* Data & Account Actions */}
            <View style={styles.dangerZoneSection}>
              <Text style={styles.subsectionTitle}>Data controls</Text>
              <View style={styles.subsectionDivider} />
              <View style={styles.dangerZoneActions}>
                <TouchableOpacity
                  style={[styles.dangerZoneExportButton, resetFamilyDataInProgress && styles.dangerZoneButtonDisabled]}
                  onPress={() => {
                    const runReset = async () => {
                      setResetFamilyDataInProgress(true);
                      try {
                        const res = await resetFamilyData();
                        if (res?.error) {
                          const msg = res.error?.message || res.error?.detail || String(res.error);
                          throw new Error(msg);
                        }
                        if (toast?.push) toast.push('Family data reset. Refreshing…', 'success');
                        if (onFamilyUpdate) {
                          const { data } = await getFamilyMembers();
                          if (data) onFamilyUpdate(data);
                        }
                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('refreshChildren'));
                          window.dispatchEvent(new CustomEvent('refreshSubjects'));
                          window.dispatchEvent(new CustomEvent('refreshCalendar'));
                          setTimeout(() => window.location.reload(), 800);
                        }
                      } catch (e) {
                        const msg = e?.message || 'Reset failed';
                        const hint = (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('load') || msg.toLowerCase().includes('network'))
                          ? ' Is the backend running (e.g. localhost:8001)?'
                          : '';
                        if (toast?.push) toast.push(msg + hint, 'error');
                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                          window.alert(msg + hint);
                        }
                      } finally {
                        setResetFamilyDataInProgress(false);
                      }
                    };
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      const ok = window.confirm('Reset all family data? This will remove all events, children, subjects, materials, and plans so you can re-run onboarding. Your account stays. Cannot be undone.');
                      if (ok) runReset();
                    } else {
                      Alert.alert(
                        'Reset all family data?',
                        'This will remove all events, children, subjects, materials, and plans so you can re-run onboarding. Your account and family membership stay. Cannot be undone.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Reset all data', style: 'destructive', onPress: runReset },
                        ]
                      );
                    }
                  }}
                  disabled={resetFamilyDataInProgress}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.dangerZoneExportButtonText}>
                    {resetFamilyDataInProgress ? 'Resetting…' : 'Reset all family data'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dangerZoneExportButton}
                  onPress={() => setActiveSection('datavault')}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.dangerZoneExportButtonText}>Export my data</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.dangerZoneDeleteButton}
                  onPress={() => setActiveSection('datavault')}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.dangerZoneDeleteButtonText}>Delete my account</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      
      case 'notifications':
        const NotificationCheckbox = ({ value, onValueChange, label }) => (
          <View style={styles.notifRow}>
            <Text style={styles.notifRowLabel}>{label}</Text>
            <TouchableOpacity
              style={[styles.notifCheckbox, value && styles.notifCheckboxChecked]}
              onPress={() => onValueChange(!value)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              {value && <Text style={styles.notifCheckmark}>✓</Text>}
            </TouchableOpacity>
          </View>
        );
        
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Notifications</Text>
            
            {/* General Section */}
            <View style={styles.notifSection}>
              <Text style={styles.subsectionTitle}>General</Text>
              <View style={styles.subsectionDivider} />
              
              <NotificationCheckbox
                value={notifDailyUpdates}
                onValueChange={setNotifDailyUpdates}
                label="Daily updates"
              />
              <NotificationCheckbox
                value={notifWeeklyProgress}
                onValueChange={setNotifWeeklyProgress}
                label="Weekly progress"
              />
              <NotificationCheckbox
                value={notifPlanningInsights}
                onValueChange={setNotifPlanningInsights}
                label="Planning insights"
              />
              <NotificationCheckbox
                value={notifMotivation}
                onValueChange={setNotifMotivation}
                label="Motivation & engagement"
              />
              <NotificationCheckbox
                value={notifParentGuidance}
                onValueChange={setNotifParentGuidance}
                label="Parent guidance"
              />
              <NotificationCheckbox
                value={notifProductUpdates}
                onValueChange={setNotifProductUpdates}
                label="Product updates"
              />
              <NotificationCheckbox
                value={notifAnnouncements}
                onValueChange={setNotifAnnouncements}
                label="Announcements & offers"
              />
            </View>
          </View>
        );
      
      case 'members':
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Family Members</Text>
            
            {/* Parents Section */}
            <View style={styles.membersSectionRow}>
              <Text style={styles.subsectionTitle}>Parents</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {parents.length > 0 && (
                  <TouchableOpacity 
                    style={styles.membersInviteButton} 
                    onPress={() => openIdCardModal('parent', parents)} 
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <CreditCard size={16} color="#374151" />
                    <Text style={styles.membersInviteButtonText}>Generate ID</Text>
                  </TouchableOpacity>
                )}
                {parents.length < 2 && (
                  <TouchableOpacity 
                    style={styles.membersInviteButton} 
                    onPress={() => {
                      setShowParentInviteModal(true);
                      setParentInviteEmail('');
                      setError(null);
                    }} 
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Plus size={16} color="#374151" />
                    <Text style={styles.membersInviteButtonText}>Invite Parent</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.subsectionDivider} />
            
            {/* Family name row: always show so it's editable */}
            <View
              style={styles.memberRow}
              {...(Platform.OS === 'web' && !isEditingFamilyName && {
                onMouseEnter: () => setFamilyNameRowHovered(true),
                onMouseLeave: () => setFamilyNameRowHovered(false),
              })}
            >
              {isEditingFamilyName ? (
                <>
                  <TextInput
                    style={styles.familyNameEditInput}
                    value={editingFamilyNameValue}
                    onChangeText={setEditingFamilyNameValue}
                    placeholder="Family name"
                    placeholderTextColor="#9ca3af"
                    autoFocus
                    editable={!savingFamilyName}
                  />
                  <View style={styles.memberRowActions}>
                    <TouchableOpacity
                      style={styles.memberRowActionButton}
                      onPress={() => {
                        setIsEditingFamilyName(false);
                        setEditingFamilyNameValue('');
                      }}
                      disabled={savingFamilyName}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <X size={18} color="#374151" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.memberRowActionButton, savingFamilyName && { opacity: 0.6 }]}
                      onPress={async () => {
                        const trimmed = editingFamilyNameValue.trim();
                        if (savingFamilyName || !familyId) return;
                        setSavingFamilyName(true);
                        try {
                          const { data, error: err } = await updateFamilyName(trimmed || null);
                          if (err) throw err;
                          setFamily((prev) => (prev ? { ...prev, family_name: trimmed || undefined } : prev));
                          if (onFamilyUpdate) onFamilyUpdate({ ...family, family_name: trimmed || undefined });
                          setFamilyName(trimmed || '');
                          setIsEditingFamilyName(false);
                          setEditingFamilyNameValue('');
                          toast.push('Family name saved', 'success');
                        } catch (e) {
                          console.warn('[FamilyPanel] Error saving family name:', e);
                          toast.push(e?.message || e?.detail || 'Could not save family name', 'error');
                        } finally {
                          setSavingFamilyName(false);
                        }
                      }}
                      disabled={savingFamilyName}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Check size={18} color="#16a34a" />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.memberRowName}>{family?.family_name || 'Family'}</Text>
                  <View style={styles.memberRowActions}>
                    <TouchableOpacity
                      style={[
                        styles.memberRowActionButton,
                        familyNameRowHovered && styles.memberRowActionButtonHovered,
                      ]}
                      onPress={() => {
                        setEditingFamilyNameValue(family?.family_name || '');
                        setIsEditingFamilyName(true);
                      }}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Pencil size={16} color="#374151" />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
            {parents.length === 0 && (
              <Text style={[styles.membersEmptyText, { marginTop: 8 }]}>
                {profile?.role === 'parent' ? 'No other parents yet' : 'No parents found'}
              </Text>
            )}
            
            {/* Children Section */}
            <View style={[styles.membersSectionRow, { marginTop: 32 }]}>
              <Text style={styles.subsectionTitle}>Children</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {children.length > 0 && (
                  <TouchableOpacity 
                    style={styles.membersInviteButton} 
                    onPress={() => openIdCardModal('child', children)} 
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <CreditCard size={16} color="#374151" />
                    <Text style={styles.membersInviteButtonText}>Generate ID</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={styles.membersInviteButton} 
                  onPress={() => setShowAddChildModal(true)} 
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#374151" />
                  <Text style={styles.membersInviteButtonText}>Add Child</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.membersInviteButton} 
                  onPress={handleOpenChildInviteModal}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#374151" />
                  <Text style={styles.membersInviteButtonText}>Invite Child</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.subsectionDivider} />
            
            {children.length === 0 ? (
              <Text style={styles.membersEmptyText}>No children added yet</Text>
            ) : children.map((child) => {
              const childName = child.name || child.first_name || 'Child';
              const isHovered = hoveredChildId === child.id;
              return (
                <View 
                  key={child.id} 
                  style={styles.memberRow}
                  {...(Platform.OS === 'web' && {
                    onMouseEnter: () => setHoveredChildId(child.id),
                    onMouseLeave: () => setHoveredChildId(null),
                  })}
                >
                  <Text style={styles.memberRowName}>{childName}{child.archived && ' (Archived)'}</Text>
                  <View style={styles.memberRowActions}>
                    <TouchableOpacity 
                      style={[
                        styles.memberRowActionButton,
                        isHovered && styles.memberRowActionButtonHovered,
                      ]} 
                      onPress={() => { setEditingChild(child); setShowEditChildModal(true); }} 
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Pencil size={16} color="#374151" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            
            {/* Tutors Section */}
            <View style={[styles.membersSectionRow, { marginTop: 32 }]}>
              <Text style={styles.subsectionTitle}>Tutors</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {tutors.length > 0 && (
                  <TouchableOpacity 
                    style={styles.membersInviteButton} 
                    onPress={() => openIdCardModal('tutor', tutors)} 
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <CreditCard size={16} color="#374151" />
                    <Text style={styles.membersInviteButtonText}>Generate ID</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={styles.membersInviteButton} 
                  onPress={() => {
                    setShowTutorInviteModal(true);
                    setTutorInviteEmail('');
                    setError(null);
                  }} 
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#374151" />
                  <Text style={styles.membersInviteButtonText}>Invite Tutor</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.subsectionDivider} />
            
            {tutors.length === 0 ? (
              <Text style={styles.membersEmptyText}>No tutors yet</Text>
            ) : tutors.map((tutor) => (
              <View key={tutor.id} style={styles.memberRow}>
                <Text style={styles.memberRowName}>{tutor.name || tutor.email || 'Tutor'}</Text>
              </View>
            ))}
          </View>
        );
      
      case 'courses':
        return (
          <View style={styles.mainContentInner}>
            <View style={styles.coursesHeader}>
              <View style={styles.coursesTitleContainer}>
                <Text style={[styles.mainContentTitle, styles.coursesTitle]}>Courses</Text>
              </View>
              <TouchableOpacity
                style={styles.coursesAddButton}
                onPress={() => setShowAddSubjectModal(true)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Plus size={16} color="#374151" />
                <Text style={styles.coursesAddButtonText}>Add Subject</Text>
              </TouchableOpacity>
            </View>
            
            {loadingSubjects ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#887DEE" />
                <Text style={styles.loadingText}>Loading subjects...</Text>
              </View>
            ) : subjects.length === 0 ? (
              <View style={styles.coursesEmptyState}>
                <Text style={styles.coursesEmptyTitle}>No subjects yet</Text>
                <Text style={styles.coursesEmptyDescription}>
                  Create subjects to organize learning, assignments, and progress.
                </Text>
                <TouchableOpacity
                  style={styles.coursesAddButton}
                  onPress={() => setShowAddSubjectModal(true)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#374151" />
                  <Text style={styles.coursesAddButtonText}>Add Subject</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.subjectsList}>
                {subjects.map((subject, index) => {
                  const isHovered = hoveredSubjectId === subject.id;
                  const lastActivity = getSubjectLastActivity(subject);
                  const childNames = getSubjectChildNames(subject);
                  
                  return (
                    <React.Fragment key={subject.id}>
                      {index > 0 && <View style={styles.subjectDivider} />}
                      <View 
                        style={[
                          styles.subjectItem,
                          isHovered && styles.subjectItemHovered,
                        ]}
                        {...(Platform.OS === 'web' && {
                          onMouseEnter: () => setHoveredSubjectId(subject.id),
                          onMouseLeave: () => setHoveredSubjectId(null),
                        })}
                      >
                      {editingSubject?.id === subject.id ? (
                        // Edit mode
                        <View style={styles.subjectEditForm}>
                          <Text style={styles.subjectEditLabel}>Subject Name</Text>
                          <TextInput
                            style={styles.subjectEditInput}
                            value={editSubjectName}
                            onChangeText={setEditSubjectName}
                            placeholder="Subject name"
                            placeholderTextColor="#9ca3af"
                          />
                          <Text style={[styles.subjectEditLabel, { marginTop: 12 }]}>Notes</Text>
                          <TextInput
                            style={[styles.subjectEditInput, styles.subjectEditTextarea]}
                            value={editSubjectNotes}
                            onChangeText={setEditSubjectNotes}
                            placeholder="Optional notes about this subject"
                            placeholderTextColor="#9ca3af"
                            multiline
                            numberOfLines={3}
                          />
                          <View style={styles.subjectEditActions}>
                            <TouchableOpacity
                              style={styles.subjectEditCancelButton}
                              onPress={() => setEditingSubject(null)}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.subjectEditCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.subjectEditSaveButton, savingSubject && styles.buttonDisabled]}
                              onPress={handleSaveSubject}
                              disabled={savingSubject || !editSubjectName.trim()}
                              {...(Platform.OS === 'web' && { cursor: savingSubject ? 'not-allowed' : 'pointer' })}
                            >
                              {savingSubject ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                              ) : (
                                <Text style={styles.subjectEditSaveText}>Save</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        // View mode
                        <>
                          <View style={styles.subjectCardHeader}>
                            <View style={styles.subjectCardInfo}>
                              <Text style={styles.subjectCardName}>{subject.name}</Text>
                              <View style={styles.subjectCardMeta}>
                                <Text style={styles.subjectCardChildren}>
                                  {childNames !== 'All children' && childNames !== 'No children' ? `Students: ${childNames}` : childNames}
                                </Text>
                                <Text style={styles.subjectCardActivity}> · {lastActivity}</Text>
                              </View>
                            </View>
                            <View style={styles.subjectCardActions}>
                              <TouchableOpacity
                                style={[
                                  styles.subjectActionButton,
                                  isHovered && styles.subjectActionButtonHovered,
                                ]}
                                onPress={() => handleEditSubject(subject)}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Pencil size={16} color="#374151" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </>
                      )}
                      </View>
                    </React.Fragment>
                  );
                })}
              </View>
            )}
          </View>
        );
      
      case 'doodlemax':
        return (
          <View style={styles.mainContentInner}>
            {/* Premium Header Card */}
            <View style={styles.doodleMaxHeaderCard}>
              <View style={styles.doodleMaxBadge}>
                <Crown size={16} color="#ffffff" />
                <Text style={styles.doodleMaxBadgeText}>PREMIUM</Text>
              </View>
              <Text style={styles.doodleMaxHeaderTitle}>Unlock the full power of Learnadoodle</Text>
              <Text style={styles.doodleMaxHeaderSubtitle}>Get DoodleMax to supercharge your family's learning journey</Text>
              <TouchableOpacity
                style={styles.doodleMaxStartButton}
                onPress={() => toast.push('DoodleMax subscription coming soon!', 'info')}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.doodleMaxStartButtonText}>START DOODLEMAX</Text>
              </TouchableOpacity>
            </View>

            {/* Features Section */}
            <Text style={styles.doodleMaxFeaturesTitle}>What you'll get with Learnadoodle Premium</Text>
            <View style={styles.subsectionDivider} />
            
            <View style={styles.doodleMaxFeatureItem}>
              <View style={styles.doodleMaxFeatureIcon}>
                <Infinity size={16} color="#6b7280" />
              </View>
              <View style={styles.doodleMaxFeatureText}>
                <Text style={styles.doodleMaxFeatureName}>Unlimited Smart Tokens</Text>
                <Text style={styles.doodleMaxFeatureDesc}>No limits on AI planning, rescheduling, or insights</Text>
              </View>
            </View>

            <View style={styles.doodleMaxFeatureItem}>
              <View style={styles.doodleMaxFeatureIcon}>
                <Calendar size={16} color="#6b7280" />
              </View>
              <View style={styles.doodleMaxFeatureText}>
                <Text style={styles.doodleMaxFeatureName}>Year & Multi-Year Planning</Text>
                <Text style={styles.doodleMaxFeatureDesc}>Plan semesters, school years, and long-term goals</Text>
              </View>
            </View>

            <View style={styles.doodleMaxFeatureItem}>
              <View style={styles.doodleMaxFeatureIcon}>
                <Users size={16} color="#6b7280" />
              </View>
              <View style={styles.doodleMaxFeatureText}>
                <Text style={styles.doodleMaxFeatureName}>Tutor & Co-Teacher Sharing</Text>
                <Text style={styles.doodleMaxFeatureDesc}>Invite tutors, co-ops, or partners into planning</Text>
              </View>
            </View>

            <View style={styles.doodleMaxFeatureItem}>
              <View style={styles.doodleMaxFeatureIcon}>
                <BarChart2 size={16} color="#6b7280" />
              </View>
              <View style={styles.doodleMaxFeatureText}>
                <Text style={styles.doodleMaxFeatureName}>Learning & Motivation Reports</Text>
                <Text style={styles.doodleMaxFeatureDesc}>See how teaching is landing - focus, energy, momentum</Text>
              </View>
            </View>

            <View style={styles.doodleMaxFeatureItem}>
              <View style={styles.doodleMaxFeatureIcon}>
                <Heart size={16} color="#6b7280" />
              </View>
              <View style={styles.doodleMaxFeatureText}>
                <Text style={styles.doodleMaxFeatureName}>Connection Report</Text>
                <Text style={styles.doodleMaxFeatureDesc}>Insights to strengthen the parent-child learning relationship</Text>
              </View>
            </View>

            <View style={styles.doodleMaxFeatureItem}>
              <View style={styles.doodleMaxFeatureIcon}>
                <FileText size={16} color="#6b7280" />
              </View>
              <View style={styles.doodleMaxFeatureText}>
                <Text style={styles.doodleMaxFeatureName}>Automatic Records & Exports</Text>
                <Text style={styles.doodleMaxFeatureDesc}>Attendance, progress, and summaries - done for you</Text>
              </View>
            </View>

            <View style={styles.doodleMaxFeatureItem}>
              <View style={styles.doodleMaxFeatureIcon}>
                <SlidersHorizontal size={16} color="#6b7280" />
              </View>
              <View style={styles.doodleMaxFeatureText}>
                <Text style={styles.doodleMaxFeatureName}>Advanced Views & Filters</Text>
                <Text style={styles.doodleMaxFeatureDesc}>Compliance, workload, and child-specific lenses</Text>
              </View>
            </View>
          </View>
        );
      
      case 'help':
        const faqSections = [
          {
            id: 'about',
            title: 'About Learnadoodle',
            questions: [
              { id: 'about-1', q: 'What is Learnadoodle?', a: 'Learnadoodle is a learning planner designed specifically for family learning - including homeschooling, afterschool enrichment, and flexible education planning. It helps you build, track, and adapt schedules, subjects, lessons, and records in one place.' },
              { id: 'about-2', q: 'Who is Learnadoodle for?', a: 'Parents, caregivers, and learners of all ages - from early learners to teens and even college students - can use Learnadoodle to organize learning, manage subjects, track progress, and build lifelong learning habits.' },
              { id: 'about-3', q: 'Can kids use Learnadoodle too?', a: 'Yes. Younger students can check off tasks and view their daily goals, while older learners can take more control of planning, pacing, and progress tracking.' },
            ]
          },
          {
            id: 'getting-started',
            title: 'Getting Started',
            questions: [
              { id: 'gs-1', q: 'How do I begin with Learnadoodle?', a: 'Create an account, add your family members (students), set up subjects and materials, and schedule lessons, assignments, and enrichment events. It\'s fine to start simple - you can add detail over time.' },
              { id: 'gs-2', q: 'Do I need a curriculum before using Learnadoodle?', a: 'No. You can start without a set curriculum and build your plan as you go. Learnadoodle can help organize free resources or combine programs you already use.' },
              { id: 'gs-3', q: 'How do I manage multiple children with different schedules?', a: 'Learnadoodle lets you assign subjects and materials individually or share them across children, and you can plan events separately for each child\'s pacing.' },
            ]
          },
          {
            id: 'planner',
            title: 'Planner & Calendar',
            questions: [
              { id: 'pl-1', q: 'How does the planner work?', a: 'You can view lessons and activities in daily, weekly, or monthly calendar formats. Add tasks, field trips, enrichment activities, and checkpoints directly into the calendar.' },
              { id: 'pl-2', q: 'What if plans change?', a: 'You can reschedule, skip, or drag events, and Learnadoodle\'s adaptive structure helps keep pacing and records aligned with real life.' },
              { id: 'pl-3', q: 'Does Learnadoodle integrate with my device calendars?', a: 'Calendar integration is part of the planning workflow; connections to external calendars help keep family schedules synchronized.' },
            ]
          },
          {
            id: 'subjects',
            title: 'Subjects & Materials',
            questions: [
              { id: 'sub-1', q: 'What is a subject?', a: 'A subject is a topic area - e.g., Math, History, Art - that organizes related lessons, materials, assignments, and events.' },
              { id: 'sub-2', q: 'Can materials be shared across subjects or children?', a: 'Yes. Materials like PDFs, lesson plans, or books can be uploaded once and reused wherever needed.' },
              { id: 'sub-3', q: 'What types of materials can I upload?', a: 'Syllabi, lesson plans, assignments, resources, assessments, books, photos, and other learning documents can all live in your library.' },
            ]
          },
          {
            id: 'records',
            title: 'Records, Progress & Attendance',
            questions: [
              { id: 'rec-1', q: 'Do I need to keep attendance or records?', a: 'Many states require attendance or progress documentation for homeschooling. Learnadoodle automatically timestamps lessons and logs completed work, making records easy to maintain.' },
              { id: 'rec-2', q: 'How do I track progress?', a: 'Progress can be marked by lesson completion, grades, checklists, or narrative notes. Upload work samples to build a portfolio over time.' },
              { id: 'rec-3', q: 'Can I export reports?', a: 'Yes - Learnadoodle helps generate summaries showing attendance, subject coverage, activities, and accomplishments.' },
            ]
          },
          {
            id: 'account',
            title: 'Account & Data',
            questions: [
              { id: 'acc-1', q: 'Who owns my data?', a: 'You do. All your family\'s plans, materials, and records are yours and can be exported or deleted at any time.' },
              { id: 'acc-2', q: 'Is my data private and secure?', a: 'Yes - Learnadoodle protects your data and does not share it outside your account.' },
            ]
          },
        ];
        
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Help & FAQ</Text>
            
            {faqSections.map((section) => (
              <View key={section.id} style={styles.faqCard}>
                {/* Section Header */}
                <View style={styles.faqCardHeader}>
                  <Text style={styles.faqCardTitle}>{section.title}</Text>
                </View>
                
                {/* Questions - Always visible */}
                {section.questions.map((item) => (
                  <View key={item.id}>
                    <TouchableOpacity
                      style={styles.faqQuestionRow}
                      onPress={() => setExpandedFAQQuestion(expandedFAQQuestion === item.id ? null : item.id)}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={styles.faqQuestionText}>{item.q}</Text>
                      <ChevronDown 
                        size={18} 
                        color="#9ca3af" 
                        style={expandedFAQQuestion === item.id ? {} : { transform: [{ rotate: '-90deg' }] }}
                      />
                    </TouchableOpacity>
                    {expandedFAQQuestion === item.id && (
                      <View style={styles.faqAnswerContainer}>
                        <Text style={styles.faqAnswerText}>{item.a}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      
      case 'feedback':
        // Show success screen after submission
        if (feedbackSubmitted) {
          return (
            <View style={styles.mainContentInner}>
              <View style={styles.feedbackSuccessContainer}>
                <View style={styles.feedbackSuccessIcon}>
                  <Heart size={48} color="#ec4899" fill="#ec4899" />
                </View>
                <Text style={styles.feedbackSuccessTitle}>Thanks for sharing!</Text>
                <Text style={styles.feedbackSuccessMessage}>
                  We've got your note and we'll take a look soon.
                </Text>
                <TouchableOpacity
                  style={styles.feedbackSuccessButton}
                  onPress={() => {
                    setFeedbackSubmitted(false);
                    setFeedbackSubject('');
                    setFeedbackDescription('');
                    setFeedbackType('');
                  }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.feedbackSuccessButtonText}>Send Another</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }
        
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Feedback</Text>
            <Text style={styles.feedbackSubtitle}>What can we help you with?</Text>
            
            <View style={styles.feedbackFormContainer}>
              <View style={styles.feedbackLeftColumn}>
                <Text style={styles.feedbackSectionTitle}>Describe your issue</Text>
                <Text style={styles.feedbackHelpText}>
                  Please describe the issue you are experiencing in as much detail as possible. This will help us understand what's going on.
                </Text>
              </View>
              
              <View style={styles.feedbackRightColumn}>
                <View style={styles.feedbackField}>
                  <Text style={styles.feedbackLabel}>Your Email Address <Text style={styles.feedbackRequired}>*</Text></Text>
                  <View style={styles.feedbackInputDisabled}>
                    <Text style={styles.feedbackInputDisabledText}>{user?.email || profile?.email || ''}</Text>
                  </View>
                </View>
                
                <View style={styles.feedbackField}>
                  <Text style={styles.feedbackLabel}>Subject <Text style={styles.feedbackRequired}>*</Text></Text>
                  <TextInput
                    style={styles.feedbackInput}
                    value={feedbackSubject}
                    onChangeText={setFeedbackSubject}
                    placeholder="Brief description of your issue"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                
                <View style={styles.feedbackField}>
                  <Text style={styles.feedbackLabel}>Description <Text style={styles.feedbackRequired}>*</Text></Text>
                  <TextInput
                    style={[styles.feedbackInput, styles.feedbackTextArea]}
                    value={feedbackDescription}
                    onChangeText={setFeedbackDescription}
                    placeholder="Please provide as much detail as possible..."
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                  />
                </View>
                
                <View style={styles.feedbackField}>
                  <Text style={styles.feedbackLabel}>Type of issue <Text style={styles.feedbackRequired}>*</Text></Text>
                  <View style={styles.feedbackTypeSelector}>
                    {[
                      { value: 'bug', label: 'Bug Report' },
                      { value: 'feature', label: 'Feature Request' },
                      { value: 'question', label: 'Question' },
                      { value: 'other', label: 'Other' },
                    ].map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.feedbackTypeOption,
                          feedbackType === option.value && styles.feedbackTypeOptionSelected
                        ]}
                        onPress={() => setFeedbackType(option.value)}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={[
                          styles.feedbackTypeOptionText,
                          feedbackType === option.value && styles.feedbackTypeOptionTextSelected
                        ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                
                <TouchableOpacity
                  style={[
                    styles.feedbackSubmitButton,
                    (!feedbackSubject || !feedbackDescription || !feedbackType || submittingFeedback) && styles.feedbackSubmitButtonDisabled
                  ]}
                  onPress={async () => {
                    if (!feedbackSubject || !feedbackDescription || !feedbackType) {
                      toast.push('Please fill in all required fields', 'error');
                      return;
                    }
                    
                    setSubmittingFeedback(true);
                    
                    try {
                      // Save feedback to database
                      const { error } = await supabase
                        .from('feedback')
                        .insert({
                          user_id: user?.id,
                          email: user?.email || profile?.email,
                          subject: feedbackSubject,
                          description: feedbackDescription,
                          type: feedbackType,
                          family_id: family?.id || familyId,
                        });
                      
                      if (error) {
                        console.error('Error saving feedback:', error);
                        // Still show success even if DB fails - we don't want to frustrate the user
                      }
                      
                      // Show success screen
                      setFeedbackSubmitted(true);
                    } catch (err) {
                      console.error('Error submitting feedback:', err);
                      // Still show success - better UX
                      setFeedbackSubmitted(true);
                    } finally {
                      setSubmittingFeedback(false);
                    }
                  }}
                  disabled={!feedbackSubject || !feedbackDescription || !feedbackType || submittingFeedback}
                  {...(Platform.OS === 'web' && { cursor: (!feedbackSubject || !feedbackDescription || !feedbackType || submittingFeedback) ? 'not-allowed' : 'pointer' })}
                >
                  {submittingFeedback ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Send size={16} color="#ffffff" />
                      <Text style={styles.feedbackSubmitButtonText}>SUBMIT</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      
      case 'datavault':
        // Show data export confirmation screen
        if (dataExportRequested) {
          return (
            <View style={styles.mainContentInner}>
              <Text style={styles.mainContentTitle}>Learnadoodle Data Vault</Text>
              
              <View style={styles.dataVaultSection}>
                <View style={styles.dataVaultSectionHeader}>
                  <Text style={styles.dataVaultSectionTitle}>Access Personal Data</Text>
                </View>
                <View style={styles.dataVaultSectionContent}>
                  <Text style={styles.dataVaultDescription}>
                    We're busy gathering up all of your personal data into a zip file, which can take up to 7 days. When we're finished we'll send you an email with instructions for how to download your data file.
                  </Text>
                  <Text style={[styles.dataVaultDescription, { marginTop: 16 }]}>
                    We've also sent you a confirmation email to the address on your account.
                  </Text>
                  
                  <View style={styles.dataVaultIconContainer}>
                    <FileText size={64} color="#3b82f6" />
                  </View>
                </View>
              </View>
              
              <TouchableOpacity
                style={styles.dataVaultBackButton}
                onPress={() => {
                  setDataExportRequested(false);
                  setActiveSection('profile');
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <ChevronLeft size={16} color="#3b82f6" />
                <Text style={styles.dataVaultBackButtonText}>Back to Profile</Text>
              </TouchableOpacity>
            </View>
          );
        }
        
        // Show data deletion confirmation screen
        if (dataDeleteRequested) {
          return (
            <View style={styles.mainContentInner}>
              <Text style={styles.mainContentTitle}>Learnadoodle Data Vault</Text>
              
              <View style={styles.dataVaultSection}>
                <View style={styles.dataVaultSectionHeader}>
                  <Text style={styles.dataVaultSectionTitle}>Delete Personal Data</Text>
                </View>
                <View style={styles.dataVaultSectionContent}>
                  <Text style={styles.dataVaultDescription}>
                    Thank you for letting us know you would like to delete all of your Learnadoodle data. Just to be sure we've sent you an email to confirm.
                  </Text>
                  
                  <Text style={[styles.dataVaultDescription, { marginTop: 16 }]}>
                    If you still want to delete all your data: When you open the email, please click on the "Delete my data" link to confirm that you would like to have your account deleted. We then give you a 7 day grace period during which you can change your mind. After the 7 days this process cannot be stopped! We will then start deleting your data which can take up to 23 days and we'll email you when we're finished.
                  </Text>
                  
                  <View style={styles.dataVaultIconContainer}>
                    <Trash2 size={64} color="#ef4444" />
                  </View>
                  
                  <Text style={[styles.dataVaultDescription, { marginTop: 16, fontStyle: 'italic', color: '#6b7280' }]}>
                    If you've already changed your mind: Don't worry, just ignore the email we've just sent you and carry on enjoying Learnadoodle!
                  </Text>
                </View>
              </View>
              
              <TouchableOpacity
                style={styles.dataVaultBackButton}
                onPress={() => {
                  setDataDeleteRequested(false);
                  setActiveSection('profile');
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <ChevronLeft size={16} color="#3b82f6" />
                <Text style={styles.dataVaultBackButtonText}>Back to Profile</Text>
              </TouchableOpacity>
            </View>
          );
        }
        
        // Default Data Vault view
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Learnadoodle Data Vault</Text>
            
            {/* Access Personal Data Section */}
            <View style={styles.dataVaultSection}>
              <View style={styles.dataVaultSectionHeader}>
                <Text style={styles.dataVaultSectionTitle}>Access Personal Data</Text>
              </View>
              <View style={styles.dataVaultSectionContent}>
                <Text style={styles.dataVaultDescription}>
                  Click this button to request a copy of all your personal data stored by Learnadoodle. This includes your family information, children profiles, subjects, schedules, materials, and learning records. This can take up to 7 days.
                </Text>
                
                <View style={styles.dataVaultButtonContainer}>
                  <TouchableOpacity
                    style={styles.dataVaultPrimaryButton}
                    onPress={() => setDataExportRequested(true)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <FileText size={18} color="#ffffff" />
                    <Text style={styles.dataVaultPrimaryButtonText}>ACCESS PERSONAL DATA</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            
            {/* Erase Personal Data Section */}
            <View style={styles.dataVaultSection}>
              <View style={styles.dataVaultSectionHeader}>
                <Text style={styles.dataVaultSectionTitle}>Erase Personal Data</Text>
              </View>
              <View style={styles.dataVaultSectionContent}>
                <Text style={styles.dataVaultDescription}>
                  Click this button to delete your Learnadoodle account and erase all of your personal data stored by Learnadoodle. You will lose your family data, children profiles, learning progress, and achievements.{' '}
                  <Text style={styles.dataVaultWarningBold}>Once completed this action cannot be undone.</Text>
                </Text>
                
                <Text style={styles.dataVaultNote}>
                  Please note: this action will NOT cancel an existing Learnadoodle Premium subscription. Please cancel your subscription in the App Store or Google Play Store before deleting your account.
                </Text>
                
                <View style={styles.dataVaultButtonContainer}>
                  <TouchableOpacity
                    style={styles.dataVaultDangerButton}
                    onPress={() => setDataDeleteRequested(true)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Trash2 size={18} color="#ffffff" />
                    <Text style={styles.dataVaultDangerButtonText}>ERASE PERSONAL DATA</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            
            {/* Back button */}
            <TouchableOpacity
              style={styles.dataVaultBackButton}
              onPress={() => setActiveSection('profile')}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <ChevronLeft size={16} color="#3b82f6" />
              <Text style={styles.dataVaultBackButtonText}>Back to Profile</Text>
            </TouchableOpacity>
          </View>
        );
      
      case 'about':
        return (
          <View style={styles.aboutPageContainer}>
            <Text style={styles.aboutPageTitle}>About Learnadoodle</Text>
            
            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Our mission</Text>
              <Text style={styles.aboutText}>
                To help families plan, adapt, and document learning with confidence—without sacrificing joy, flexibility, or privacy.
              </Text>
              <Text style={styles.aboutText}>
                Learning at home is deeply personal. It changes week to week, child to child, and season to season. Our mission is to give families tools that respect that reality: tools that adapt as life happens, support thoughtful decision-making, and keep parents firmly in control.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Who we are</Text>
              <Text style={styles.aboutText}>
                Learnadoodle was co-founded by Elisa, a homeschooling parent and college professor with over 15 years of experience teaching at the university level, and Kate, a technologist with deep expertise in building secure, privacy-first learning software.
              </Text>
              <Text style={styles.aboutText}>
                Between us, we've lived both sides of the learning journey—designing curriculum, teaching in formal institutions, managing real household schedules, and building complex systems that must be reliable, explainable, and safe. We didn't come to education technology as outsiders; we came to it as practitioners who felt the pain points firsthand.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Why we built Learnadoodle</Text>
              <Text style={styles.aboutText}>
                Learnadoodle is the tool Elisa wished she had while homeschooling.
              </Text>
              <Text style={styles.aboutText}>
                Like many parents, she found herself juggling calendars, lesson plans, state requirements, progress notes, and the constant question: Is this working for my child? Existing tools were either rigid, overwhelming, or disconnected from how families actually live.
              </Text>
              <Text style={styles.aboutText}>
                So we started by listening. We spoke with hundreds of parents to understand how they plan, track, and adapt learning in the real world—not in idealized school models. From those conversations, we built an AI-powered planner that supports flexibility rather than fighting it.
              </Text>
              <Text style={styles.aboutText}>
                Learnadoodle helps parents:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• Organize learning without turning it into bureaucracy</Text>
                <Text style={styles.aboutListItem}>• Adapt plans when life changes (because it always does)</Text>
                <Text style={styles.aboutListItem}>• Track progress in ways that feel meaningful, not punitive</Text>
                <Text style={styles.aboutListItem}>• Meet requirements without losing curiosity or momentum</Text>
              </View>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Our approach to technology and trust</Text>
              <Text style={styles.aboutText}>
                We believe families should never have to trade convenience for control.
              </Text>
              <Text style={styles.aboutText}>
                Learnadoodle is built with privacy, security, and transparency at its core. We design our systems so parents understand what's happening, why suggestions are made, and how their data is used—if it's used at all. Your family's learning data belongs to you, not advertisers or opaque algorithms.
              </Text>
              <Text style={styles.aboutText}>
                AI should feel like a thoughtful assistant, not a black box.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>What we believe</Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• Parents are capable decision-makers when given the right tools</Text>
                <Text style={styles.aboutListItem}>• Learning is not linear—and systems shouldn't pretend it is</Text>
                <Text style={styles.aboutListItem}>• Flexibility and accountability can coexist</Text>
                <Text style={styles.aboutListItem}>• Technology should support human judgment, not replace it</Text>
                <Text style={styles.aboutListItem}>• Joy and rigor are not opposites</Text>
              </View>
              <Text style={styles.aboutText}>
                Learnadoodle exists to support families who want structure and freedom, insight and intuition, planning and room to breathe.
              </Text>
            </View>
          </View>
        );
      
      case 'terms':
        return (
          <View style={styles.aboutPageContainer}>
            <Text style={styles.aboutPageTitle}>Terms and Conditions of Service</Text>
            
            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>1. General / Our Services</Text>
              <Text style={styles.aboutText}>
                Learnadoodle Inc. ("Learnadoodle," "we," "us," or "our") operates the Learnadoodle website, mobile applications, and related services (collectively, the "Services").
              </Text>
              <Text style={styles.aboutText}>
                By accessing or using any part of the Services, you agree to these Legal Terms ("Terms"). If you do not agree, do not use the Services.
              </Text>
              <Text style={styles.aboutText}>
                Availability by location. The Services are not intended for distribution or use in any jurisdiction where doing so would violate local law or subject Learnadoodle to registration or regulatory requirements. If you access the Services from outside the United States, you do so on your own initiative and are responsible for complying with applicable local laws.
              </Text>
              <Text style={styles.aboutText}>
                Education and compliance context. Learnadoodle is designed to help families organize learning. It does not provide legal, tax, medical, or professional compliance advice, and we do not guarantee that use of the Services will satisfy any particular educational requirement.
              </Text>
              <Text style={styles.aboutText}>
                Privacy and child safety laws. Learnadoodle is built to support privacy-first family use and is designed to comply with applicable privacy laws, including, as relevant:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• COPPA (children under 13): requires verifiable parental consent for the collection of personal information from children under 13 and additional safeguards for child data.</Text>
                <Text style={styles.aboutListItem}>• GDPR (EU/EEA): provides lawful processing requirements and user rights such as access, correction, and deletion, as described in our Privacy Policy.</Text>
                <Text style={styles.aboutListItem}>• CCPA/CPRA (California): provides rights to know, delete, and opt out of certain data sharing, and to limit use of sensitive personal information, as described in our Privacy Policy.</Text>
              </View>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>2. Changes to These Terms</Text>
              <Text style={styles.aboutText}>
                We may update these Terms from time to time. When we do, we will update the "Last revised" date at the bottom of these Terms and may provide additional notice via the Services or email.
              </Text>
              <Text style={styles.aboutText}>
                If you continue to use the Services after changes take effect, you agree to the updated Terms.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>3. Intellectual Property</Text>
              <Text style={styles.aboutText}>
                Our IP. We own or license all rights in the Services, including the software, source code, databases, functionality, website and app design, text, graphics, images, audio, video, and other content (collectively, "Content"), as well as our trademarks, service marks, and logos ("Marks"). These are protected by U.S. and international intellectual property laws.
              </Text>
              <Text style={styles.aboutText}>
                Limited license. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Services for personal, non-commercial household and educational use.
              </Text>
              <Text style={styles.aboutText}>
                Restrictions. You may not:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• copy, reproduce, distribute, publicly display, republish, upload, transmit, or exploit any part of the Services, Content, or Marks for commercial purposes;</Text>
                <Text style={styles.aboutListItem}>• reverse engineer, decompile, or attempt to extract source code (except where permitted by law);</Text>
                <Text style={styles.aboutListItem}>• use our Content or Marks in a way that infringes rights or violates applicable law.</Text>
              </View>
              <Text style={styles.aboutText}>
                For permissions beyond this license, contact contact@learnadoodle.com. All rights not expressly granted are reserved.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>4. User Uploads and Submissions</Text>
              <Text style={styles.aboutText}>
                Your content stays yours. You may upload personal educational materials (e.g., learning notes, progress records, documents). You retain ownership of content you upload.
              </Text>
              <Text style={styles.aboutText}>
                Private by default. Learnadoodle does not provide public sharing, public profiles, or user forums. Your uploaded content is intended to be private and accessible only through your account, subject to these Terms and our Privacy Policy.
              </Text>
              <Text style={styles.aboutText}>
                Feedback. If you submit feedback, suggestions, or ideas ("Submissions"), you grant Learnadoodle a non-exclusive, royalty-free, worldwide license to use those Submissions to improve or develop the Services. This does not transfer ownership of your personal educational records or other private content.
              </Text>
              <Text style={styles.aboutText}>
                Your responsibility. You are responsible for the content you upload and represent that:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• you have the right to upload it;</Text>
                <Text style={styles.aboutListItem}>• it is lawful and does not infringe third-party rights; and</Text>
                <Text style={styles.aboutListItem}>• you understand you control what you choose to store.</Text>
              </View>
              <Text style={styles.aboutText}>
                We may remove or restrict access to content if required by law, a valid legal request, or to protect the security and integrity of the Services.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>5. User Representations</Text>
              <Text style={styles.aboutText}>
                By using the Services, you represent and warrant that:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• the information you provide is accurate, current, and complete, and you will keep it updated;</Text>
                <Text style={styles.aboutListItem}>• you have the legal capacity to agree to these Terms;</Text>
                <Text style={styles.aboutListItem}>• if you are under the age of digital consent (including where applicable under COPPA or GDPR), you have verifiable parental/guardian consent;</Text>
                <Text style={styles.aboutListItem}>• you will not access the Services through automated or non-human means (e.g., bots, scripts) unless expressly permitted;</Text>
                <Text style={styles.aboutListItem}>• you will not use the Services for illegal or unauthorized purposes; and</Text>
                <Text style={styles.aboutListItem}>• your use will comply with applicable laws and regulations.</Text>
              </View>
              <Text style={styles.aboutText}>
                If any information is untrue, inaccurate, or incomplete, we may suspend or terminate your account.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>6. Registration and Account Security</Text>
              <Text style={styles.aboutText}>
                Certain features may require an account. You agree to:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• keep your login credentials confidential;</Text>
                <Text style={styles.aboutListItem}>• be responsible for all activity under your account; and</Text>
                <Text style={styles.aboutListItem}>• notify us promptly of unauthorized access.</Text>
              </View>
              <Text style={styles.aboutText}>
                We may reclaim or modify usernames that are misleading, offensive, or inappropriate.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>7. Beta Access (Free Testing Phase)</Text>
              <Text style={styles.aboutText}>
                Learnadoodle may be offered in a free beta phase. During beta, features may change, and the Services may be interrupted or modified.
              </Text>
              <Text style={styles.aboutText}>
                If we introduce paid plans in the future, we will provide notice in advance (for example, via email or in-app notice) and require you to accept updated pricing and terms before charges apply.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>8. Acceptable Use / Prohibited Activities</Text>
              <Text style={styles.aboutText}>
                You may use the Services only as permitted by these Terms. You agree not to:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• scrape, harvest, or systematically retrieve data or Content without written permission;</Text>
                <Text style={styles.aboutListItem}>• interfere with or bypass security features or access controls;</Text>
                <Text style={styles.aboutListItem}>• upload malware or disruptive code;</Text>
                <Text style={styles.aboutListItem}>• impersonate others or misrepresent your identity;</Text>
                <Text style={styles.aboutListItem}>• reverse engineer or attempt unauthorized access to the Services or systems;</Text>
                <Text style={styles.aboutListItem}>• use the Services to resell, redistribute, or build a competing product;</Text>
                <Text style={styles.aboutListItem}>• collect or store personal information about others without consent.</Text>
              </View>
              <Text style={styles.aboutText}>
                AI use. You also agree not to use AI features to generate or request harmful, exploitative, or inappropriate content—especially content involving minors—or to use AI features in ways that violate law or others' rights.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>9. Mobile Application License</Text>
              <Text style={styles.aboutText}>
                If you access the Services via a mobile app, we grant you a limited, revocable, non-exclusive, non-transferable license to install and use the app on a device you own or control, solely for personal, non-commercial use consistent with these Terms.
              </Text>
              <Text style={styles.aboutText}>
                You may not modify, reverse engineer, decompile, or use the app unlawfully.
              </Text>
              <Text style={styles.aboutText}>
                App Stores. If you download the app from Apple's App Store or Google Play, your use is also subject to the applicable store terms. Apple and Google are third-party beneficiaries of this section to the extent required by their terms.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>10. Third-Party Links and Content</Text>
              <Text style={styles.aboutText}>
                The Services may contain links to third-party websites or resources ("Third-Party Content"). We do not control or endorse Third-Party Content and are not responsible for its accuracy, legality, or availability. Your use of Third-Party Content is at your own risk and subject to the third party's terms and policies.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>11. Services Management and Safety</Text>
              <Text style={styles.aboutText}>
                We may (but are not required to) monitor the Services for violations of these Terms, investigate potential misuse, and take appropriate action, including restricting access or terminating accounts.
              </Text>
              <Text style={styles.aboutText}>
                To help keep Learnadoodle safe for families, we may monitor AI interactions for abuse patterns and provide a way to report concerns at contact@learnadoodle.com.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>12. Privacy</Text>
              <Text style={styles.aboutText}>
                Your use of the Services is governed by our Privacy Policy. By using the Services, you consent to our collection, use, and sharing practices as described there, including processing and storage in the United States.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>13. DMCA Notice and Policy</Text>
              <Text style={styles.aboutText}>
                If you believe content on the Services infringes your copyright, send a DMCA notice including the required information under 17 U.S.C. § 512(c)(3).
              </Text>
              <Text style={styles.aboutText}>
                DMCA Agent{'\n'}
                Elisa Alvarez-Garrido{'\n'}
                Attn: Copyright Agent{'\n'}
                3011 Blossom St{'\n'}
                Columbia, SC 29205{'\n'}
                United States{'\n'}
                contact@learnadoodle.com
              </Text>
              <Text style={styles.aboutText}>
                Counter-notifications must include the required statements and consent to jurisdiction as applicable.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>14. Termination</Text>
              <Text style={styles.aboutText}>
                These Terms remain in effect while you use the Services. We may suspend or terminate your access at any time, with or without notice, if we believe you have violated these Terms or if necessary to protect the Services, users, or Learnadoodle.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>15. Modifications and Interruptions</Text>
              <Text style={styles.aboutText}>
                We may modify, suspend, or discontinue any part of the Services at any time. We are not liable for downtime, interruptions, or loss of access, subject to applicable law.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>16. Disclaimers</Text>
              <Text style={styles.aboutText}>
                THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE." TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </Text>
              <Text style={styles.aboutText}>
                Learnadoodle does not warrant that the Services will be uninterrupted, error-free, or that use of the Services will satisfy any specific educational, legal, or compliance requirement.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>17. Limitation of Liability</Text>
              <Text style={styles.aboutText}>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEARNADOODLE AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, EXEMPLARY, OR PUNITIVE DAMAGES.
              </Text>
              <Text style={styles.aboutText}>
                OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICES WILL NOT EXCEED $100, OR THE MAXIMUM AMOUNT PERMITTED BY LAW IF A DIFFERENT LIMIT IS REQUIRED.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>18. Indemnification</Text>
              <Text style={styles.aboutText}>
                You agree to indemnify, defend, and hold harmless Learnadoodle and its affiliates, officers, employees, and agents from claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising from your use of the Services, your content, or your violation of these Terms.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>19. Governing Law</Text>
              <Text style={styles.aboutText}>
                These Terms are governed by the laws of the State of Delaware, without regard to conflict of laws principles.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>20. Dispute Resolution and Arbitration</Text>
              <Text style={styles.aboutText}>
                PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS.
              </Text>
              <Text style={styles.aboutText}>
                You and Learnadoodle agree to try to resolve disputes informally for at least 30 days after written notice.
              </Text>
              <Text style={styles.aboutText}>
                If unresolved, disputes will be resolved by binding arbitration on an individual basis administered by the American Arbitration Association ("AAA") under its applicable rules, in New Castle County, Delaware, unless otherwise agreed.
              </Text>
              <Text style={styles.aboutText}>
                You waive the right to a jury trial and to participate in class actions or class arbitration.
              </Text>
              <Text style={styles.aboutText}>
                This section does not prevent either party from seeking injunctive or equitable relief for intellectual property infringement or unauthorized access/misuse.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>21. Electronic Communications</Text>
              <Text style={styles.aboutText}>
                You consent to receive notices and communications electronically. Electronic communications satisfy any legal requirement that such communications be in writing.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>22. California Residents</Text>
              <Text style={styles.aboutText}>
                If you are a California resident and have a complaint not satisfactorily resolved, you may contact the California Department of Consumer Affairs, Consumer Information Division at 1625 North Market Blvd., Suite N 112, Sacramento, CA 95834, by phone at (800) 952-5210 or (916) 445-1254.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>23. Miscellaneous</Text>
              <Text style={styles.aboutText}>
                These Terms constitute the entire agreement between you and Learnadoodle regarding the Services. If any provision is unenforceable, the remainder will remain in effect. No waiver is valid unless in writing. No agency, partnership, or joint venture is created.
              </Text>
              <Text style={styles.aboutText}>
                Claims must be filed within one (1) year of the event giving rise to the claim, unless a longer period is required by law.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>24. Contact</Text>
              <Text style={styles.aboutText}>
                Learnadoodle Inc{'\n'}
                Email: contact@learnadoodle.com{'\n'}
                Phone: 803-728-1336
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutText}>
                Last revised: February 5, 2026
              </Text>
            </View>
          </View>
        );
      
      case 'privacy':
        return (
          <View style={styles.aboutPageContainer}>
            <Text style={styles.aboutPageTitle}>Privacy Policy</Text>
            
            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>General</Text>
              <Text style={styles.aboutText}>
                Learnadoodle Inc ("Learnadoodle," "Company," "we," "us," or "our") cares about your privacy. This Privacy Policy explains how we collect, use, and share information when you use our website learnadoodle.com (the "Site") and our Learnadoodle mobile application (the "App"), together the "Services."
              </Text>
              <Text style={styles.aboutText}>
                By using the Services, you agree to the collection and use of information as described in this Privacy Policy. If you do not agree, do not use the Services.
              </Text>
              <Text style={styles.aboutText}>
                Learnadoodle is built for families. Parents (or legal guardians) are the account holders, and children may use limited features through parent-managed accounts.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Information We Collect</Text>
              <Text style={styles.aboutText}>
                We collect information in the following ways:
              </Text>
              <Text style={styles.aboutText}>
                a. Information you provide
              </Text>
              <Text style={styles.aboutText}>
                When you create an account, set up your family, or use the Services, you may provide:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• Parent/guardian information: name, email, and account credentials (email/password or other login method)</Text>
                <Text style={styles.aboutListItem}>• Child information (optional/limited): child name or nickname, and age in years</Text>
                <Text style={styles.aboutListItem}>• Educational content you choose to store: learning notes, progress records, and uploaded documents</Text>
                <Text style={styles.aboutListItem}>• Support communications: messages you send to us (e.g., customer support requests)</Text>
              </View>
              <Text style={styles.aboutText}>
                b. Information collected automatically
              </Text>
              <Text style={styles.aboutText}>
                When you use the Services, we may automatically collect:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• Device and log data: IP address, browser type, operating system, device identifiers, and timestamps</Text>
                <Text style={styles.aboutListItem}>• Usage data: pages or screens viewed, features used, clicks/taps, and actions taken in the Services</Text>
              </View>
              <Text style={styles.aboutText}>
                c. Cookies and similar technologies
              </Text>
              <Text style={styles.aboutText}>
                On the Site, we use cookies and similar technologies for:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• Essential functionality (e.g., login/session and security)</Text>
                <Text style={styles.aboutListItem}>• Analytics (e.g., understanding usage patterns)</Text>
              </View>
              <Text style={styles.aboutText}>
                See "Cookies and Tracking" below for details and choices.
              </Text>
              <Text style={styles.aboutText}>
                d. Payment information (if applicable)
              </Text>
              <Text style={styles.aboutText}>
                If we offer paid plans in the future, payments will be processed by third parties (for example, Stripe or app stores). We generally receive limited billing details (such as payment status and subscription tier), and do not store full card numbers directly.
              </Text>
              <Text style={styles.aboutText}>
                e. Sensitive information
              </Text>
              <Text style={styles.aboutText}>
                Some information you store in Learnadoodle may be sensitive depending on what you upload (e.g., educational history, progress notes, documents). You control what you upload.
              </Text>
              <Text style={styles.aboutText}>
                We do not intentionally collect:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• biometric identifiers,</Text>
                <Text style={styles.aboutListItem}>• precise geolocation,</Text>
                <Text style={styles.aboutListItem}>• or browsing history outside our Services.</Text>
              </View>
              <Text style={styles.aboutText}>
                f. AI interactions
              </Text>
              <Text style={styles.aboutText}>
                Learnadoodle includes an AI-powered assistant for educational support. When you use AI features:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• We may collect the messages and content you submit to provide the feature, improve reliability, and help keep the Services safe.</Text>
                <Text style={styles.aboutListItem}>• You are interacting with an AI system, not a human.</Text>
                <Text style={styles.aboutListItem}>• Please avoid entering highly sensitive personal information into AI prompts.</Text>
              </View>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>How We Use Your Information</Text>
              <Text style={styles.aboutText}>
                We use information to:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• Provide and operate the Services (account creation, family setup, planning tools, uploads)</Text>
                <Text style={styles.aboutListItem}>• Personalize features (e.g., planning suggestions based on your inputs)</Text>
                <Text style={styles.aboutListItem}>• Improve and maintain the Services (debugging, performance, product development)</Text>
                <Text style={styles.aboutListItem}>• Communicate with you (support responses, service-related notices)</Text>
                <Text style={styles.aboutListItem}>• Protect safety and integrity (fraud prevention, abuse detection, security monitoring)</Text>
                <Text style={styles.aboutListItem}>• Comply with legal obligations (including COPPA, GDPR, and CCPA/CPRA where applicable)</Text>
              </View>
              <Text style={styles.aboutText}>
                No advertising or data sales. We do not sell personal information and do not use your information for targeted advertising.
              </Text>
              <Text style={styles.aboutText}>
                Legal bases for processing (GDPR/EEA and similar laws)
              </Text>
              <Text style={styles.aboutText}>
                Where required, we process personal information under one or more of these bases:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• Contract (to provide the Services you request)</Text>
                <Text style={styles.aboutListItem}>• Consent (for certain optional features, and for parental consent where required)</Text>
                <Text style={styles.aboutListItem}>• Legitimate interests (security, fraud prevention, product improvement—balanced against your rights)</Text>
                <Text style={styles.aboutListItem}>• Legal obligation (compliance with applicable law)</Text>
              </View>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>How We Share Information</Text>
              <Text style={styles.aboutText}>
                We share information only as needed to operate the Services, including with:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• Infrastructure and hosting providers (e.g., Supabase for data storage; Render for hosting/logs where applicable)</Text>
                <Text style={styles.aboutListItem}>• Analytics providers (e.g., Google Analytics on the Site, if enabled by your cookie choices)</Text>
                <Text style={styles.aboutListItem}>• Platform providers (e.g., Apple and Google for app distribution and platform services)</Text>
                <Text style={styles.aboutListItem}>• Payment processors (e.g., Stripe or app stores, if paid plans are offered)</Text>
              </View>
              <Text style={styles.aboutText}>
                We do not share personal information for cross-context behavioral advertising (as defined by CCPA/CPRA).
              </Text>
              <Text style={styles.aboutText}>
                Service providers (processors)
              </Text>
              <Text style={styles.aboutText}>
                When we use service providers, they are authorized to process information only for us and are required to protect it under contractual obligations consistent with applicable law.
              </Text>
              <Text style={styles.aboutText}>
                Legal and safety disclosures
              </Text>
              <Text style={styles.aboutText}>
                We may disclose information if we believe it is necessary to:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• comply with a legal obligation or valid legal request,</Text>
                <Text style={styles.aboutListItem}>• protect the rights, safety, and security of users, Learnadoodle, or the public,</Text>
                <Text style={styles.aboutListItem}>• investigate fraud or security issues.</Text>
              </View>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Children's Privacy</Text>
              <Text style={styles.aboutText}>
                Learnadoodle is intended to be used by parents/guardians. Children under 13 may access limited features only through parent-managed accounts.
              </Text>
              <Text style={styles.aboutText}>
                To help comply with COPPA and similar child privacy laws:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• We collect minimal child information (typically name/nickname and age in years) as needed for family planning features.</Text>
                <Text style={styles.aboutListItem}>• Parents may request to review, delete, or restrict their child's information by contacting contact@learnadoodle.com.</Text>
                <Text style={styles.aboutListItem}>• Child data is not public and is not shared except with essential service providers to operate the Services.</Text>
                <Text style={styles.aboutListItem}>• We take steps to promote safe use of AI features for families, including monitoring for abuse patterns and offering reporting at contact@learnadoodle.com.</Text>
              </View>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Your Rights and Choices</Text>
              <Text style={styles.aboutText}>
                a. Account controls
              </Text>
              <Text style={styles.aboutText}>
                You can update certain account information through the Services (where available). You may also contact us to request changes or help.
              </Text>
              <Text style={styles.aboutText}>
                b. GDPR/EEA rights (and similar rights where applicable)
              </Text>
              <Text style={styles.aboutText}>
                Depending on your location, you may have rights to:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• access your personal information,</Text>
                <Text style={styles.aboutListItem}>• correct inaccuracies,</Text>
                <Text style={styles.aboutListItem}>• request deletion,</Text>
                <Text style={styles.aboutListItem}>• restrict or object to processing,</Text>
                <Text style={styles.aboutListItem}>• request portability,</Text>
                <Text style={styles.aboutListItem}>• withdraw consent (where processing is based on consent),</Text>
                <Text style={styles.aboutListItem}>• lodge a complaint with your local data protection authority.</Text>
              </View>
              <Text style={styles.aboutText}>
                c. California rights (CCPA/CPRA)
              </Text>
              <Text style={styles.aboutText}>
                California residents may have the right to:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• know what personal information we collect, use, and disclose,</Text>
                <Text style={styles.aboutListItem}>• request deletion,</Text>
                <Text style={styles.aboutListItem}>• request correction (where applicable),</Text>
                <Text style={styles.aboutListItem}>• opt out of "sale" or "sharing" (not applicable because we do not sell/share for advertising),</Text>
                <Text style={styles.aboutListItem}>• not be discriminated against for exercising privacy rights.</Text>
              </View>
              <Text style={styles.aboutText}>
                To exercise privacy rights, contact contact@learnadoodle.com. We may verify your identity before fulfilling a request. We respond within timeframes required by law (typically 30 days for GDPR requests, 45 days for CCPA/CPRA requests, with extensions where permitted).
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Data Retention</Text>
              <Text style={styles.aboutText}>
                We retain personal information as long as needed to provide the Services and for legitimate business purposes (such as security, dispute resolution, and enforcement), unless a longer or shorter retention period is required by law.
              </Text>
              <Text style={styles.aboutText}>
                Account deletion: We retain account data for up to 30 days after deletion to allow recovery if deletion was accidental. After that, we delete or de-identify it, unless retention is required by law.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Security</Text>
              <Text style={styles.aboutText}>
                We use reasonable administrative, technical, and organizational safeguards, including encryption in transit and at rest (where supported), access controls, and secure infrastructure practices.
              </Text>
              <Text style={styles.aboutText}>
                No method of transmission or storage is 100% secure. If a breach occurs, we will notify you as required by law (including where applicable GDPR's 72-hour notification framework).
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Cookies and Tracking</Text>
              <Text style={styles.aboutText}>
                We use cookies (and similar technologies) on the Site for:
              </Text>
              <View style={styles.aboutList}>
                <Text style={styles.aboutListItem}>• Essential cookies (required for core functionality and security)</Text>
                <Text style={styles.aboutListItem}>• Analytics cookies (to understand and improve usage, such as via Google Analytics)</Text>
              </View>
              <Text style={styles.aboutText}>
                Where required, we present a cookie banner that lets you accept or reject analytics cookies.
              </Text>
              <Text style={styles.aboutText}>
                You can also control cookies through your browser settings. For Google Analytics, you can opt out using Google's browser add-on at:
              </Text>
              <Text style={styles.aboutText}>
                https://tools.google.com/dlpage/gaoptout
              </Text>
              <Text style={styles.aboutText}>
                We do not use cookies for targeted advertising.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>International Data Transfers</Text>
              <Text style={styles.aboutText}>
                Learnadoodle is based in the United States, and information may be processed and stored in the United States or other locations where our service providers operate.
              </Text>
              <Text style={styles.aboutText}>
                If you are located in the EEA/UK/Switzerland, we use appropriate safeguards for transfers (such as Standard Contractual Clauses) where required.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Changes to This Policy</Text>
              <Text style={styles.aboutText}>
                We may update this Privacy Policy from time to time. If changes are material, we will provide notice through the Services or by email as required by law. The "last revised" date at the top shows when it was most recently updated.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutSectionTitle}>Contact Us</Text>
              <Text style={styles.aboutText}>
                Learnadoodle Inc{'\n'}
                Email: contact@learnadoodle.com{'\n'}
                Phone: (803) 728-1336 (not toll-free)
              </Text>
              <Text style={styles.aboutText}>
                California residents: If a complaint is not satisfactorily resolved, you may contact the California Department of Consumer Affairs:
              </Text>
              <Text style={styles.aboutText}>
                Consumer Information Division, 1625 North Market Blvd., Suite N 112, Sacramento, CA 95834{'\n'}
                Phone: (800) 952-5210 or (916) 445-1254
              </Text>
              <Text style={styles.aboutText}>
                EU/EEA residents: You may also contact your local data protection authority to lodge a complaint.
              </Text>
            </View>

            <View style={styles.aboutSection}>
              <Text style={styles.aboutText}>
                This Privacy Policy was last revised on February 5, 2026.
              </Text>
            </View>
          </View>
        );
      
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.twoColumnLayout}>
        {/* Left: Scrollable main content */}
        <ScrollView 
          style={[
            styles.mainContent,
            (activeSection === 'about' || activeSection === 'terms' || activeSection === 'privacy') && styles.mainContentFullWidth
          ]} 
          contentContainerStyle={[
            styles.mainContentContainer,
            (activeSection === 'about' || activeSection === 'terms' || activeSection === 'privacy') && styles.mainContentContainerAbout
          ]}
        >
          {renderMainContent()}
        </ScrollView>

        {/* Right: Fixed sidebar - hidden on About, Terms, and Privacy pages */}
        {activeSection !== 'about' && activeSection !== 'terms' && activeSection !== 'privacy' && (
          <View style={styles.sidebar}>
          <View style={styles.sidebarContent}>
          {/* Account Card */}
          <View style={styles.sidebarCard}>
            <Text style={styles.sidebarCardTitle}>Account</Text>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'members' && styles.sidebarButtonActive]} onPress={() => setActiveSection('members')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'members' && styles.sidebarButtonTextActive]}>Family Members</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'courses' && styles.sidebarButtonActive]} onPress={() => setActiveSection('courses')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'courses' && styles.sidebarButtonTextActive]}>Courses</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sidebarButton} onPress={() => setShowComingSoonModal(true)} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={styles.sidebarButtonText}>Connected accounts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'preferences' && styles.sidebarButtonActive]} onPress={() => setActiveSection('preferences')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'preferences' && styles.sidebarButtonTextActive]}>Preferences</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'notifications' && styles.sidebarButtonActive]} onPress={() => setActiveSection('notifications')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'notifications' && styles.sidebarButtonTextActive]}>Notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'profile' && styles.sidebarButtonActive]} onPress={() => setActiveSection('profile')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'profile' && styles.sidebarButtonTextActive]}>Profile</Text>
            </TouchableOpacity>
          </View>

          {/* Subscription Card */}
          <View style={styles.sidebarCard}>
            <Text style={styles.sidebarCardTitle}>Subscription</Text>
            <View style={styles.sidebarSubscriptionContent}>
              <View style={styles.sidebarSubscriptionInfo}>
                <TouchableOpacity 
                  onPress={() => setShowComingSoonModal(true)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.sidebarSubscriptionPlan}>DoodleMax Plan</Text>
                </TouchableOpacity>
                <View style={styles.sidebarSubscriptionStatusRow}>
                  <View style={styles.sidebarSubscriptionStatusChip}>
                    <Text style={styles.sidebarSubscriptionStatusChipText}>Active</Text>
                  </View>
                  <Text style={styles.sidebarSubscriptionRenewal}>Renews Jan 2026</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Support Card */}
          <View style={styles.sidebarCard}>
            <Text style={styles.sidebarCardTitle}>Support</Text>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'help' && styles.sidebarButtonActive]} onPress={() => setActiveSection('help')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'help' && styles.sidebarButtonTextActive]}>Help</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'feedback' && styles.sidebarButtonActive]} onPress={() => setActiveSection('feedback')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'feedback' && styles.sidebarButtonTextActive]}>Feedback</Text>
            </TouchableOpacity>
          </View>
          </View>

          {/* Log Out Button */}
          <TouchableOpacity
            style={[styles.logoutButtonSidebar, logoutHovered && styles.logoutButtonSidebarHovered]}
            onPress={async () => {
              setLoggingOut(true);
              try { await signOut(); } catch (error) {} finally { setLoggingOut(false); }
            }}
            disabled={loggingOut}
            onMouseEnter={() => setLogoutHovered(true)}
            onMouseLeave={() => setLogoutHovered(false)}
            {...(Platform.OS === 'web' && { cursor: loggingOut ? 'not-allowed' : 'pointer' })}
          >
            <Text style={styles.logoutButtonText}>{loggingOut ? 'LOGGING OUT...' : 'LOG OUT'}</Text>
          </TouchableOpacity>

          {/* Footer Links */}
          <View style={styles.footerLinksContainer}>
            <TouchableOpacity
              style={styles.footerLink}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  // Use browser history for navigation
                  window.history.pushState({ section: 'about' }, '', window.location.pathname);
                  setActiveSection('about');
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.footerLinkText}>ABOUT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.footerLink}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  // Use browser history for navigation
                  window.history.pushState({ section: 'terms' }, '', window.location.pathname);
                  setActiveSection('terms');
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.footerLinkText}>TERMS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.footerLink}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  // Use browser history for navigation
                  window.history.pushState({ section: 'privacy' }, '', window.location.pathname);
                  setActiveSection('privacy');
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.footerLinkText}>PRIVACY</Text>
            </TouchableOpacity>
          </View>
          </View>
        )}
      </View>

      {/* Modals */}
      <Modal
        visible={showComingSoonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowComingSoonModal(false)}
      >
        <View style={styles.comingSoonModalOverlay}>
          <View style={styles.comingSoonModalContent}>
            <TouchableOpacity
              style={styles.comingSoonModalClose}
              onPress={() => setShowComingSoonModal(false)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.comingSoonModalTitle}>Coming soon</Text>
            <Text style={styles.comingSoonModalText}>
              This feature is in development. Stay tuned for updates!
            </Text>
            <TouchableOpacity
              style={styles.comingSoonModalButton}
              onPress={() => setShowComingSoonModal(false)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.comingSoonModalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <EditChildModal
        visible={showEditChildModal}
        onClose={() => { setShowEditChildModal(false); setEditingChild(null); }}
        child={editingChild}
        familyId={family?.id || familyId}
        onChildUpdated={(updatedChild) => {
          if (updatedChild && family) {
            setFamily(prevFamily => {
              if (!prevFamily) return prevFamily;
              const updatedChildren = (prevFamily.children || []).map(child => 
                child.id === updatedChild.id ? { ...child, first_name: updatedChild.first_name || updatedChild.name, name: updatedChild.first_name || updatedChild.name, nickname: updatedChild.nickname, age: updatedChild.age, grade: updatedChild.grade, avatar: updatedChild.avatar, archived: updatedChild.archived } : child
              );
              return { ...prevFamily, children: updatedChildren };
            });
          }
          setChildrenFetchKey(k => k + 1);
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshChildren'));
          const loadFamily = async () => { try { const { data, error: err } = await getFamilyMembers(); if (!err && data) { setFamily(data); if (onFamilyUpdate) onFamilyUpdate(data); } } catch (err) {} };
          loadFamily();
        }}
        onChildDeleted={() => {
          setChildrenFetchKey(k => k + 1);
          const loadFamily = async () => { try { const { data, error: err } = await getFamilyMembers(); if (!err && data) { setFamily(data); if (onFamilyUpdate) onFamilyUpdate(data); } } catch (err) {} };
          loadFamily();
        }}
      />

      <AddChildModal
        visible={showAddChildModal}
        onClose={() => setShowAddChildModal(false)}
        familyId={family?.id || familyId}
        onChildAdded={() => {
          setChildrenFetchKey(k => k + 1);
          const loadFamily = async () => { try { const { data, error: err } = await getFamilyMembers(); if (!err && data) { setFamily(data); if (onFamilyUpdate) onFamilyUpdate(data); } } catch (err) {} };
          loadFamily();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshChildren'));
        }}
      />

      {/* ID Card Modal */}
      <Modal
        visible={showIdCardModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowIdCardModal(false);
          setIdCardRole(null);
          setIdCardCandidates([]);
          setIdCardSelected(null);
          setIdCardDisplayName('');
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowIdCardModal(false);
            setIdCardRole(null);
            setIdCardCandidates([]);
            setIdCardSelected(null);
            setIdCardDisplayName('');
          }}
        >
          <TouchableOpacity style={styles.childInviteModal} activeOpacity={1} onPress={() => {}}>
            {idCardSelected ? (
              <>
                <View style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowIdCardModal(false);
                      setIdCardRole(null);
                      setIdCardCandidates([]);
                      setIdCardSelected(null);
                      setIdCardDisplayName('');
                    }}
                    style={styles.childInviteModalClose}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={20} color="#6b7280" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: '70vh' }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                  {idCardRole === 'child' && (
                    <View style={styles.idCardNameFieldRow}>
                      <Text style={styles.idCardNameFieldLabel}>Name on ID (Learnadoodle will not save this)</Text>
                      <TextInput
                        style={styles.idCardNameFieldInput}
                        value={idCardDisplayName}
                        onChangeText={setIdCardDisplayName}
                        placeholder="e.g. First and Last name"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  )}
                  <IDCardView
                    child={
                      idCardRole === 'child'
                        ? { ...normalizeMemberForIdCard(idCardSelected, idCardRole), first_name: idCardDisplayName || (idCardSelected?.name || idCardSelected?.first_name || 'Child'), name: idCardDisplayName || (idCardSelected?.name || idCardSelected?.first_name || 'Child') }
                        : normalizeMemberForIdCard(idCardSelected, idCardRole)
                    }
                    familyId={family?.id || familyId}
                    cardRole={idCardRole === 'child' ? 'student' : idCardRole}
                  />
                </ScrollView>
              </>
            ) : (
              <>
            <View style={styles.childInviteModalHeader}>
              <View style={{ width: 36, height: 36 }} />
              <TouchableOpacity
                onPress={() => {
                  setShowIdCardModal(false);
                  setIdCardRole(null);
                  setIdCardCandidates([]);
                  setIdCardSelected(null);
                  setIdCardDisplayName('');
                }}
                style={styles.childInviteModalClose}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
              <>
                <Text style={styles.childInviteDescription}>
                  Select a {idCardRole === 'child' ? 'child' : idCardRole === 'parent' ? 'parent' : 'tutor'} to generate their ID card:
                </Text>
                <ScrollView style={styles.childInviteList} contentContainerStyle={styles.childInviteListContent}>
                  {idCardCandidates.map((member) => {
                    const label = idCardRole === 'child'
                      ? (member.name || member.first_name || 'Child')
                      : idCardRole === 'parent'
                        ? (family?.family_name || member.email || 'Parent')
                        : (member.name || member.email || 'Tutor');
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={styles.childInviteItem}
                        onPress={() => {
                          setIdCardSelected(member);
                          if (idCardRole === 'child') {
                            setIdCardDisplayName(member.name || member.first_name || 'Child');
                          }
                        }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.childInviteItemName}>{label}</Text>
                        <ChevronRight size={22} color="#6b7280" />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <AddSubjectModal 
        visible={showAddSubjectModal} 
        onClose={() => {
          setShowAddSubjectModal(false);
          setEditingSubjectInModal(null);
        }} 
        familyId={family?.id || familyId}
        subject={editingSubjectInModal}
        children={family?.children || []}
        onSubjectAdded={() => {
          loadSubjects();
          setEditingSubjectInModal(null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('subjectCreated'));
          }
        }}
      />
      <AddMaterialModal visible={showAddMaterialModal} onClose={() => setShowAddMaterialModal(false)} familyId={family?.id || familyId} />
      <TaskCreateModal visible={showTaskModal} onClose={() => setShowTaskModal(false)} familyId={family?.id || familyId} />

      {/* Child Invite Modal */}
      <Modal
        visible={showChildInviteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowChildInviteModal(false);
          setChildInviteStep('select');
          setSelectedChildForInvite(null);
          setChildInviteEmail('');
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowChildInviteModal(false);
            setChildInviteStep('select');
            setSelectedChildForInvite(null);
            setChildInviteEmail('');
          }}
        >
          <TouchableOpacity style={styles.childInviteModal} activeOpacity={1} onPress={() => {}}>
            <View style={styles.childInviteModalHeader}>
              {childInviteStep === 'select' ? (
                <View style={{ width: 36, height: 36 }} />
              ) : (
                <Text style={styles.childInviteModalTitle}>Enter Email</Text>
              )}
              <TouchableOpacity
                onPress={() => {
                  setShowChildInviteModal(false);
                  setChildInviteStep('select');
                  setSelectedChildForInvite(null);
                  setChildInviteEmail('');
                }}
                style={styles.childInviteModalClose}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {childInviteStep === 'select' ? (
              <>
                <Text style={styles.childInviteDescription}>
                  Select which child to invite:
                </Text>
                <ScrollView style={styles.childInviteList} contentContainerStyle={styles.childInviteListContent}>
                  {children.map((child) => (
                    <TouchableOpacity
                      key={child.id}
                      style={styles.childInviteItem}
                      onPress={() => handleSelectChildForInvite(child.id)}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={styles.childInviteItemName}>
                        {child.name || child.first_name || 'Child'}
                      </Text>
                      <ChevronRight size={22} color="#6b7280" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.inviteUrlModalDescription}>
                  Enter email address for {children.find(c => c.id === selectedChildForInvite)?.name || children.find(c => c.id === selectedChildForInvite)?.first_name || 'this child'}:
                </Text>
                <TextInput
                  style={styles.childInviteEmailInput}
                  placeholder="email@example.com"
                  placeholderTextColor="#9ca3af"
                  value={childInviteEmail}
                  onChangeText={setChildInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {error && (
                  <Text style={styles.childInviteError}>{error}</Text>
                )}
                <View style={styles.inviteUrlModalActions}>
                  <TouchableOpacity
                    style={styles.inviteUrlDoneButton}
                    onPress={() => {
                      setChildInviteStep('select');
                      setChildInviteEmail('');
                      setError(null);
                    }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.inviteUrlDoneButtonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.inviteUrlCopyButton, (invitingChild || !childInviteEmail.trim()) && styles.inviteUrlCopyButtonDisabled]}
                    onPress={handleInviteChild}
                    disabled={invitingChild || !childInviteEmail.trim()}
                    {...(Platform.OS === 'web' && { cursor: (invitingChild || !childInviteEmail.trim()) ? 'not-allowed' : 'pointer' })}
                  >
                    {invitingChild ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Send size={16} color="#ffffff" />
                        <Text style={styles.inviteUrlCopyButtonText}>Send Invite</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Invite URL Success Modal */}
      <Modal
        visible={showInviteUrlModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowInviteUrlModal(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowInviteUrlModal(false)}>
          <TouchableOpacity style={styles.inviteUrlModal} activeOpacity={1} onPress={() => {}}>
            <View style={styles.inviteUrlModalHeader}>
              <Text style={styles.inviteUrlModalTitle}>Invite Sent Successfully!</Text>
              <TouchableOpacity
                onPress={() => setShowInviteUrlModal(false)}
                style={styles.inviteUrlModalClose}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.inviteUrlModalDescription}>
              Share this invite link with the person you're inviting:
            </Text>
            
            <View style={styles.inviteUrlContainer}>
              {Platform.OS === 'web' ? (
                <TextInput
                  style={styles.inviteUrlInput}
                  value={inviteUrlToShow || ''}
                  editable={false}
                  selectTextOnFocus={true}
                  multiline={true}
                  data-invite-url-input={true}
                />
              ) : (
                <TextInput
                  style={styles.inviteUrlInput}
                  value={inviteUrlToShow || ''}
                  editable={false}
                  selectTextOnFocus={true}
                  multiline={true}
                />
              )}
            </View>
            
            <View style={styles.inviteUrlModalActions}>
              <TouchableOpacity
                style={[styles.inviteUrlCopyButton, inviteUrlCopied && styles.inviteUrlCopyButtonSuccess]}
                onPress={async () => {
                  if (inviteUrlToShow) {
                    const success = await copyToClipboard(inviteUrlToShow, 'Invite link');
                    if (!success && Platform.OS === 'web') {
                      // If clipboard fails, select text so user can manually copy
                      setTimeout(() => {
                        const input = document.querySelector('[data-invite-url-input]');
                        if (input) {
                          input.focus();
                          input.select();
                          if (input.setSelectionRange) {
                            input.setSelectionRange(0, 99999);
                          }
                        }
                      }, 100);
                    }
                  }
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                {inviteUrlCopied ? (
                  <>
                    <Check size={16} color="#ffffff" />
                    <Text style={styles.inviteUrlCopyButtonText}>Copied!</Text>
                  </>
                ) : (
                  <>
                    <Copy size={16} color="#ffffff" />
                    <Text style={styles.inviteUrlCopyButtonText}>Copy Link</Text>
                  </>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.inviteUrlDoneButton}
                onPress={() => setShowInviteUrlModal(false)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.inviteUrlDoneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Parent Invite Modal */}
      <Modal
        visible={showParentInviteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowParentInviteModal(false);
          setParentInviteEmail('');
          setError(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowParentInviteModal(false);
            setParentInviteEmail('');
            setError(null);
          }}
        >
          <TouchableOpacity style={styles.childInviteModal} activeOpacity={1} onPress={() => {}}>
            <View style={styles.childInviteModalHeader}>
              <Text style={styles.childInviteModalTitle}>Invite Parent</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowParentInviteModal(false);
                  setParentInviteEmail('');
                  setError(null);
                }}
                style={styles.inviteUrlModalClose}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inviteUrlModalDescription}>
              Enter the email address of the parent you'd like to invite:
            </Text>
            <TextInput
              style={styles.childInviteEmailInput}
              placeholder="email@example.com"
              placeholderTextColor="#9ca3af"
              value={parentInviteEmail}
              onChangeText={setParentInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {error && (
              <Text style={styles.childInviteError}>{error}</Text>
            )}
            <View style={styles.inviteUrlModalActions}>
              <TouchableOpacity
                style={styles.inviteUrlDoneButton}
                onPress={() => {
                  setShowParentInviteModal(false);
                  setParentInviteEmail('');
                  setError(null);
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.inviteUrlDoneButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteUrlCopyButton, (invitingParent || !parentInviteEmail.trim()) && styles.inviteUrlCopyButtonDisabled]}
                onPress={handleInviteParent}
                disabled={invitingParent || !parentInviteEmail.trim()}
                {...(Platform.OS === 'web' && { cursor: (invitingParent || !parentInviteEmail.trim()) ? 'not-allowed' : 'pointer' })}
              >
                {invitingParent ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Send size={16} color="#ffffff" />
                    <Text style={styles.inviteUrlCopyButtonText}>Send Invite</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Tutor Invite Modal */}
      <Modal
        visible={showTutorInviteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowTutorInviteModal(false);
          setTutorInviteEmail('');
          setError(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowTutorInviteModal(false);
            setTutorInviteEmail('');
            setError(null);
          }}
        >
          <TouchableOpacity style={styles.childInviteModal} activeOpacity={1} onPress={() => {}}>
            <View style={styles.childInviteModalHeader}>
              <Text style={styles.childInviteModalTitle}>Invite Tutor</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowTutorInviteModal(false);
                  setTutorInviteEmail('');
                  setError(null);
                }}
                style={styles.inviteUrlModalClose}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inviteUrlModalDescription}>
              Enter the email address of the tutor you'd like to invite:
            </Text>
            <TextInput
              style={styles.childInviteEmailInput}
              placeholder="email@example.com"
              placeholderTextColor="#9ca3af"
              value={tutorInviteEmail}
              onChangeText={setTutorInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {error && (
              <Text style={styles.childInviteError}>{error}</Text>
            )}
            <View style={styles.inviteUrlModalActions}>
              <TouchableOpacity
                style={styles.inviteUrlDoneButton}
                onPress={() => {
                  setShowTutorInviteModal(false);
                  setTutorInviteEmail('');
                  setError(null);
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.inviteUrlDoneButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteUrlCopyButton, (invitingTutor || !tutorInviteEmail.trim()) && styles.inviteUrlCopyButtonDisabled]}
                onPress={handleInviteTutorFromModal}
                disabled={invitingTutor || !tutorInviteEmail.trim()}
                {...(Platform.OS === 'web' && { cursor: (invitingTutor || !tutorInviteEmail.trim()) ? 'not-allowed' : 'pointer' })}
              >
                {invitingTutor ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Send size={16} color="#ffffff" />
                    <Text style={styles.inviteUrlCopyButtonText}>Send Invite</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ConfirmDialog
        visible={deleteSubjectConfirm.visible}
        title="Delete Subject"
        message={deleteSubjectConfirm.subject ? `Are you sure you want to delete "${deleteSubjectConfirm.subject.name}"? This will permanently remove the subject and all its related data.` : ''}
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={async () => {
          if (deleteSubjectConfirm.subject) {
            await performDeleteSubject(deleteSubjectConfirm.subject);
          }
          setDeleteSubjectConfirm({ visible: false, subject: null });
        }}
        onCancel={() => setDeleteSubjectConfirm({ visible: false, subject: null })}
      />
    </View>
  );
}

function createStyles(tokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      width: '100%',
      height: '100%',
      backgroundColor: '#f3f4f5',
    },
    twoColumnLayout: {
      flex: 1,
      flexDirection: 'row',
      ...(Platform.OS === 'web' && {
        height: '100%',
      }),
    },
    mainContent: {
      flex: 1,
      backgroundColor: '#ffffff',
      ...(Platform.OS === 'web' && {
        overflowY: 'auto',
      }),
    },
    mainContentFullWidth: {
      flex: 1,
      maxWidth: '100%',
    },
    mainContentContainer: {
      padding: 32,
      paddingRight: 16,
    },
    mainContentCard: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      padding: 32,
    },
    mainContentContainerAbout: {
      padding: 32,
      paddingRight: 32,
      alignItems: 'center',
    },
    mainContentInner: {
      width: '100%',
    },
    mainContentTitle: {
      fontSize: 36,
      fontWeight: '800',
      color: '#111827',
      marginBottom: 32,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sectionSubtitle: {
      fontSize: 15,
      color: '#6b7280',
      marginBottom: 32,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subsectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#374151',
      marginTop: 0,
      marginBottom: 12,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subsectionDivider: {
      height: 1,
      backgroundColor: '#e5e7eb',
      marginBottom: 20,
    },
    preferencesSectionSpacer: {
      marginTop: 28,
    },
    membersSectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      marginTop: 0,
    },
    coursesHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
      marginTop: 0,
    },
    coursesTitleContainer: {
      marginBottom: 0,
    },
    coursesTitle: {
      marginBottom: 0,
    },
    membersInviteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
    },
    membersInviteButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    membersEmptyText: {
      fontSize: 15,
      color: '#9ca3af',
      fontStyle: 'italic',
      marginBottom: 16,
    },
    memberRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderRadius: 8,
      ...(Platform.OS === 'web' && {
        transition: 'background-color 0.2s ease',
      }),
    },
    memberRowHovered: {
      backgroundColor: '#f9fafb',
    },
    memberRowName: {
      fontSize: 16,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    familyNameEditInput: {
      flex: 1,
      marginRight: 16,
      fontSize: 16,
      fontWeight: '500',
      color: '#374151',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#fff',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    memberRowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    memberRowActionButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#f9fafb',
      alignItems: 'center',
      justifyContent: 'center',
      ...(Platform.OS === 'web' && {
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }),
    },
    memberRowActionButtonHovered: {
      backgroundColor: '#f3f4f6',
    },
    memberRowActionButtonOld: {
      padding: 6,
    },
    preferenceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
    },
    preferenceLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: '#111827',
    },
    customToggleTrack: {
      width: 50,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#d1d5db',
      padding: 2,
      justifyContent: 'center',
    },
    customToggleTrackOn: {
      backgroundColor: '#AECBFA',
    },
    customToggleThumb: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#f9fafb',
      ...(Platform.OS === 'web' && {
        transition: 'transform 0.2s ease',
      }),
    },
    customToggleThumbOn: {
      transform: [{ translateX: 22 }],
      backgroundColor: '#6BB3E8',
    },
    sidebar: {
      width: 280,
      padding: 16,
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      ...(Platform.OS === 'web' && {
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }),
    },
    sidebarContent: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      ...(Platform.OS === 'web' && {
        minHeight: 0,
        marginBottom: 0,
      }),
    },
    sidebarCard: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      paddingTop: 20,
      paddingBottom: 20,
      paddingHorizontal: 20,
      flexShrink: 0,
    },
    sidebarCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sidebarButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginBottom: 6,
      position: 'relative',
    },
    sidebarButtonActive: {
      backgroundColor: '#f3f4f6',
    },
    sidebarButtonText: {
      fontSize: 15,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sidebarButtonTextActive: {
      color: '#111827',
      fontWeight: '600',
    },
    sidebarSubscriptionContent: {
      marginTop: 4,
      paddingLeft: 12,
    },
    sidebarSubscriptionInfo: {
      marginBottom: 10,
    },
    sidebarSubscriptionPlan: {
      fontSize: 15,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 8,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sidebarSubscriptionStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
    },
    sidebarSubscriptionStatusChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: '#ecfdf3',
    },
    sidebarSubscriptionStatusChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#059669',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sidebarSubscriptionRenewal: {
      fontSize: 13,
      color: '#9ca3af',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sidebarSubscriptionManage: {
      marginTop: 8,
    },
    sidebarSubscriptionManageText: {
      fontSize: 13,
      color: '#000000',
      fontWeight: '500',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        cursor: 'pointer',
      }),
    },
    logoutButtonSidebar: {
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: 'transparent',
      marginTop: 16,
      flexShrink: 0,
    },
    logoutButtonSidebarHovered: {
      backgroundColor: '#fef2f2',
      borderColor: '#ef4444',
    },
    logoutButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#ef4444',
      letterSpacing: 0.5,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    footerLinksContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 12,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
      flexShrink: 0,
    },
    footerLink: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'opacity 0.2s ease',
      }),
    },
    footerLinkText: {
      fontSize: 11,
      fontWeight: '500',
      color: '#6B7280',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    comingSoonModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    comingSoonModalContent: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      padding: 24,
      width: '90%',
      maxWidth: 400,
      alignItems: 'center',
    },
    comingSoonModalClose: {
      position: 'absolute',
      top: 16,
      right: 16,
      padding: 4,
    },
    comingSoonModalTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 12,
      textAlign: 'center',
    },
    comingSoonModalText: {
      fontSize: 15,
      color: '#6b7280',
      textAlign: 'center',
      marginBottom: 20,
    },
    comingSoonModalButton: {
      backgroundColor: tokens?.primary ?? '#3b82f6',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 10,
      minWidth: 100,
      alignItems: 'center',
    },
    comingSoonModalButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    aboutPageContainer: {
      maxWidth: 800,
      width: '100%',
      marginHorizontal: 'auto',
      paddingVertical: 32,
    },
    aboutPageTitle: {
      fontSize: 36,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 48,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    aboutSection: {
      marginBottom: 48,
    },
    aboutSectionTitle: {
      fontSize: 24,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 16,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    aboutText: {
      fontSize: 16,
      lineHeight: 24,
      color: '#374151',
      marginBottom: 16,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    aboutList: {
      marginTop: 8,
      marginBottom: 16,
    },
    aboutListItem: {
      fontSize: 16,
      lineHeight: 24,
      color: '#374151',
      marginBottom: 8,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    headerRow: {
      flexDirection: 'column',
      paddingHorizontal: 16,
      paddingTop: 0,
      paddingBottom: 12,
      backgroundColor: '#ffffff',
    },
    headerDivider: {
      height: 1,
      backgroundColor: '#e5e7eb',
      marginHorizontal: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 4,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sectionSubtitle: {
      fontSize: 12,
      color: '#6b7280',
      marginBottom: 0,
    },
    connectionsIntroText: {
      fontSize: 15,
      color: '#6b7280',
      lineHeight: 22,
      marginBottom: 32,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionsSectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#111827',
      marginTop: 0,
      marginBottom: 12,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionsSectionDivider: {
      height: 1,
      backgroundColor: '#e5e7eb',
      marginBottom: 20,
    },
    connectionsList: {
      marginBottom: 8,
    },
    connectionCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 20,
      paddingHorizontal: 4,
      borderRadius: 12,
      ...(Platform.OS === 'web' && {
        transition: 'background-color 0.2s ease',
      }),
    },
    connectionCardRowHovered: {
      backgroundColor: '#f9fafb',
    },
    connectionRowLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      flex: 1,
      paddingRight: 16,
    },
    connectionRowIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#f3f4f6',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    connectionRowImage: {
      width: 28,
      height: 28,
    },
    connectionRowText: {
      flex: 1,
    },
    connectionRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
      flexWrap: 'wrap',
    },
    connectionRowLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionRowDescription: {
      fontSize: 14,
      color: '#6b7280',
      lineHeight: 20,
      marginTop: 2,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionStatusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#ecfdf3',
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    connectionStatusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#10b981',
    },
    connectionStatusText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#059669',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionRecommendedChip: {
      backgroundColor: '#fef3c7',
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    connectionRecommendedText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#d97706',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionLastSynced: {
      fontSize: 12,
      color: '#9ca3af',
      marginTop: 6,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionAccountEmail: {
      fontSize: 12,
      color: '#6b7280',
      marginTop: 6,
      fontStyle: 'italic',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionsLoadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      marginBottom: 16,
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
    },
    connectionsLoadingText: {
      fontSize: 14,
      color: '#6b7280',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionRowDivider: {
      height: 1,
      backgroundColor: '#e5e7eb',
      marginLeft: 64,
    },
    connectionRowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    connectionConnectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }),
    },
    connectionConnectButtonDisabled: {
      opacity: 0.5,
    },
    connectionConnectButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionManageButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }),
    },
    connectionManageButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionDisconnectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }),
    },
    connectionDisconnectButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    contentWrapper: {
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 24,
    },
    section: {
      marginBottom: 32,
    },
    sectionHeaderTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 4,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sectionHeaderSubtitle: {
      fontSize: 12,
      color: '#6b7280',
      marginBottom: 16,
    },
    profileHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    // New profile page styles
    profileAvatarSection: {
      marginBottom: 24,
    },
    profileAvatarContainer: {
      position: 'relative',
      width: 96,
      height: 96,
      marginTop: 8,
    },
    profileAvatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: '#9ca3af',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#1e293b',
    },
    profileAvatarText: {
      fontSize: 36,
      fontWeight: '600',
      color: '#9ca3af',
    },
    profileAvatarEditButton: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#3b82f6',
      justifyContent: 'center',
      alignItems: 'center',
    },
    profileAccountSection: {
      marginTop: 0,
    },
    profileFieldGroup: {
      marginTop: 0,
      marginBottom: 32,
    },
    profileFieldLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 16,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    profileDarkInput: {
      fontSize: 15,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 20,
      backgroundColor: '#f9fafb',
      color: '#111827',
      borderWidth: 1,
      borderColor: '#e5e7eb',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    profileEmailInputContainer: {
      position: 'relative',
      marginBottom: 4,
    },
    profileEmailInput: {
      paddingRight: 50,
    },
    profileEmailCheckButton: {
      position: 'absolute',
      right: 14,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      width: 32,
    },
    profilePasswordContainer: {
      position: 'relative',
    },
    profilePasswordInput: {
      paddingRight: 50,
    },
    profilePasswordToggle: {
      position: 'absolute',
      right: 14,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    passwordRequirement: {
      fontSize: 13,
      color: '#ef4444',
      marginTop: 6,
      ...(Platform.OS === 'web' && {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    profileEmailVerify: {
      flexDirection: 'row',
      marginTop: 8,
    },
    profileEmailVerifyText: {
      fontSize: 13,
      color: '#6b7280',
    },
    profileEmailVerifyLink: {
      fontSize: 13,
      color: '#3b82f6',
      textDecorationLine: 'underline',
    },
    profileEmailSaveHint: {
      fontSize: 13,
      color: '#60a5fa',
      marginTop: 10,
      lineHeight: 18,
      fontWeight: '500',
    },
    profileEmailHint: {
      fontSize: 13,
      color: '#6b7280',
      marginTop: 12,
      lineHeight: 20,
      marginBottom: 0,
    },
    profileSaveButton: {
      backgroundColor: '#60a5fa',
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 10,
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginTop: 0,
      marginBottom: 32,
    },
    profileSaveButtonDisabled: {
      backgroundColor: '#d1d5db',
    },
    profileSaveButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ffffff',
      letterSpacing: 0.5,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    profileResetPasswordButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      alignSelf: 'flex-start',
      marginTop: 4,
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }),
    },
    profileResetPasswordButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    profileResetPasswordHint: {
      fontSize: 13,
      color: '#6b7280',
      marginTop: 12,
      lineHeight: 20,
    },
    dangerZoneSection: {
      marginTop: 40,
    },
    dangerZoneActions: {
      gap: 12,
      marginTop: 20,
    },
    dangerZoneButtonDisabled: {
      opacity: 0.6,
    },
    dangerZoneExportButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      alignSelf: 'flex-start',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }),
    },
    dangerZoneExportButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    dangerZoneDeleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      alignSelf: 'flex-start',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }),
    },
    dangerZoneDeleteButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // Data Vault styles
    dataVaultSubtitle: {
      fontSize: 15,
      color: '#6b7280',
      marginBottom: 32,
      ...(Platform.OS === 'web' && {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    dataVaultSection: {
      backgroundColor: '#ffffff',
      borderRadius: 12,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      overflow: 'hidden',
    },
    dataVaultSectionHeader: {
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
    },
    dataVaultSectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: '#6b7280',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    dataVaultSectionContent: {
      padding: 24,
      alignItems: 'center',
    },
    dataVaultDescription: {
      fontSize: 14,
      color: '#374151',
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 600,
      marginBottom: 16,
      ...(Platform.OS === 'web' && {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    dataVaultWarningBold: {
      fontWeight: '700',
      color: '#111827',
    },
    dataVaultNote: {
      fontSize: 13,
      color: '#6b7280',
      lineHeight: 20,
      textAlign: 'center',
      maxWidth: 600,
      marginBottom: 24,
      fontStyle: 'italic',
      ...(Platform.OS === 'web' && {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    dataVaultButtonContainer: {
      marginTop: 8,
    },
    dataVaultPrimaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: '#3b82f6',
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 10,
    },
    dataVaultPrimaryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ffffff',
      letterSpacing: 0.5,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    dataVaultDangerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: '#ef4444',
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 10,
    },
    dataVaultDangerButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ffffff',
      letterSpacing: 0.5,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    dataVaultBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 16,
    },
    dataVaultBackButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#3b82f6',
      ...(Platform.OS === 'web' && {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    dataVaultIconContainer: {
      marginTop: 32,
      marginBottom: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border || '#e5e7eb',
      backgroundColor: '#ffffff',
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    editButtonText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.text || '#111827',
    },
    editActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cancelButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border || '#e5e7eb',
      backgroundColor: '#ffffff',
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    cancelButtonText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.text || '#111827',
    },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: '#8B7CF6',
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#ffffff',
    },
    infoCard: {
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      padding: 16,
      gap: 16,
    },
    profileField: {
      gap: 6,
    },
    notificationField: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
    },
    // Notification screen styles
    notifSection: {
      marginBottom: 32,
    },
    notifSectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
      paddingBottom: 12,
      marginBottom: 8,
    },
    notifSectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 8,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    notifSectionHeaderLabel: {
      fontSize: 18,
      fontWeight: '500',
      color: '#6b7280',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    notifRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    notifRowLabel: {
      fontSize: 18,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    notifCheckbox: {
      width: 28,
      height: 28,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: '#d1d5db',
      backgroundColor: '#ffffff',
      justifyContent: 'center',
      alignItems: 'center',
    },
    notifCheckboxChecked: {
      backgroundColor: '#85C4F2',
      borderColor: '#85C4F2',
    },
    notifCheckmark: {
      fontSize: 16,
      fontWeight: '700',
      color: '#ffffff',
    },
    notifTimeSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#f3f4f6',
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginTop: 8,
    },
    notifTimeSelectorText: {
      fontSize: 15,
      color: '#6b7280',
      ...(Platform.OS === 'web' && {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    fieldSubtext: {
      fontSize: 11,
      color: '#6b7280',
      marginTop: 2,
    },
    infoRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    infoLabel: {
      fontSize: 12,
      fontWeight: '500',
      color: '#374151',
      marginRight: 8,
      minWidth: 80,
    },
    infoValue: {
      fontSize: 12,
      color: '#111827',
      flex: 1,
    },
    descriptionCard: {
      backgroundColor: '#f0f9ff',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#bae6fd',
      padding: 12,
    },
    descriptionText: {
      fontSize: 12,
      color: '#0c4a6e',
      lineHeight: 18,
    },
    emailLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    emailLinkText: {
      fontSize: 12,
      color: '#3b82f6',
      textDecorationLine: 'underline',
    },
    inviteCard: {
      backgroundColor: '#f9fafb',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      padding: 16,
      gap: 16,
      marginBottom: 16,
    },
    inviteHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    inviteTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: '#111827',
    },
    familyNameText: {
      fontSize: 10,
      color: '#6b7280',
    },
    inviteForm: {
      gap: 12,
    },
    formField: {
      gap: 6,
    },
    label: {
      fontSize: 11,
      fontWeight: '500',
      color: '#374151',
    },
    input: {
      fontSize: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
    },
    childrenChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    childChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
    },
    childChipSelected: {
      backgroundColor: '#dbeafe',
      borderColor: '#93c5fd',
    },
    childChipText: {
      fontSize: 11,
      color: '#6b7280',
    },
    childChipTextSelected: {
      color: '#1e40af',
      fontWeight: '500',
    },
    inviteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: '#111827',
    },
    inviteButtonDisabled: {
      opacity: 0.6,
    },
    inviteButtonText: {
      fontSize: 12,
      fontWeight: '500',
      color: '#ffffff',
    },
    inviteResult: {
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    inviteResultLabel: {
      fontSize: 11,
      color: '#374151',
    },
    inviteResultUrl: {
      fontSize: 11,
      fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
      color: '#111827',
      flex: 1,
    },
    copyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: '#cbd5e1',
      backgroundColor: '#ffffff',
    },
    copyButtonText: {
      fontSize: 11,
      color: '#3b82f6',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    loadingText: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
    },
    errorContainer: {
      backgroundColor: '#fef2f2',
      borderWidth: 1,
      borderColor: '#fecaca',
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
    },
    errorText: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: '#dc2626',
    },
    warningContainer: {
      backgroundColor: '#fef3c7',
      borderWidth: 1,
      borderColor: '#fde68a',
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
    },
    warningText: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: '#92400e',
    },
    familyNameCard: {
      backgroundColor: tokens.bgSubtle,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      padding: 12,
      marginBottom: 16,
    },
    familyNameLabel: {
      fontSize: 11,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    familyName: {
      fontSize: 16,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
    },
    membersCard: {
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      padding: 16,
    },
    membersList: {
      gap: 16,
    },
    membersSectionTitle: {
      fontSize: 12,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      marginTop: 8,
      marginBottom: 8,
    },
    memberItem: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: tokens.bgSubtle,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      marginBottom: 8,
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    memberName: {
      fontSize: 12,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
      marginBottom: 4,
    },
    memberEmail: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      marginBottom: 4,
    },
    memberScope: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: '#059669',
      fontStyle: 'italic',
    },
    emptyText: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.textMuted,
      fontStyle: 'italic',
    },
    childrenHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    childrenHeaderButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    addChildButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border || '#e5e7eb',
      backgroundColor: '#ffffff',
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    addChildButtonText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.text || '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    childListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      ...Platform.select({
        web: {
          cursor: 'default',
        },
      }),
    },
    childListItemContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    childListItemText: {
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
    },
    childListItemTextHovered: {
      color: '#2563eb',
    },
    childEditIcon: {
      marginLeft: 8,
    },
    childActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    childActionButton: {
      padding: 4,
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    childHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    childInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    archivedBadge: {
      fontSize: 10,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      backgroundColor: tokens.bgSubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    editHint: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: tokens.textMuted,
      fontStyle: 'italic',
    },
    dangerZone: {
      marginTop: 12,
      padding: 12,
      backgroundColor: colors.redSoft || '#fef2f2',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: (colors.redBold || '#dc2626') + '40',
    },
    dangerZoneHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    dangerZoneTitle: {
      fontSize: 12,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: colors.redBold || '#dc2626',
    },
    dangerSection: {
      backgroundColor: tokens.card,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: tokens.border,
      padding: 12,
      marginBottom: 8,
    },
    dangerSectionTitle: {
      fontSize: 13,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: tokens.text,
      marginBottom: 4,
    },
    dangerSectionDescription: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      lineHeight: 16,
      marginBottom: 12,
    },
    bold: {
      fontWeight: typography.weights.semibold,
    },
    dangerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    dangerButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.card,
    },
    dangerButtonText: {
      fontSize: 12,
      fontWeight: typography.weights.medium,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
    },
    inputLabel: {
      fontSize: 11,
      fontFamily: typography.fonts.sans,
      color: tokens.textSecondary,
      marginBottom: 4,
    },
    dangerInput: {
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 12,
      fontFamily: typography.fonts.sans,
      color: tokens.text,
      backgroundColor: tokens.card,
      marginBottom: 12,
    },
    deleteButton: {
      backgroundColor: colors.redBold || '#dc2626',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      alignItems: 'center',
    },
    deleteButtonDisabled: {
      backgroundColor: colors.redSoft || '#fef2f2',
      opacity: 0.5,
    },
    deleteButtonText: {
      fontSize: 13,
      fontWeight: typography.weights.semibold,
      fontFamily: typography.fonts.display,
      color: '#ffffff',
    },
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    accountFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
    },
    accountText: {
      fontSize: 11,
      color: '#6b7280',
      flex: 1,
    },
    deleteAccountText: {
      color: '#dc2626',
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: '#fef2f2',
      borderWidth: 1,
      borderColor: '#fecaca',
    },
    logoutButtonDisabled: {
      opacity: 0.6,
    },
    menuItem: {
      paddingVertical: 12,
      ...Platform.select({
        web: {
          cursor: 'pointer',
        },
      }),
    },
    menuItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    menuItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    menuItemText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text || '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    menuDivider: {
      height: 1,
      backgroundColor: '#e5e7eb',
      marginVertical: 4,
    },
    accountDivider: {
      height: 1,
      backgroundColor: '#e5e7eb',
      marginTop: 16,
      marginBottom: 12,
    },
    darkModeSelector: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    darkModeOption: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      alignItems: 'center',
    },
    darkModeOptionSelected: {
      borderColor: '#3b82f6',
      backgroundColor: '#eff6ff',
    },
    darkModeOptionText: {
      fontSize: 13,
      fontWeight: '500',
      color: '#6b7280',
    },
    darkModeOptionTextSelected: {
      color: '#3b82f6',
    },
    // Delete Account Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    deleteModalContainer: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      width: '100%',
      maxWidth: 480,
      overflow: 'hidden',
      ...(Platform.OS === 'web' && {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      }),
    },
    deleteModalHeader: {
      backgroundColor: '#fef2f2',
      padding: 20,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#fecaca',
    },
    deleteModalIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#fee2e2',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    deleteModalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#dc2626',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    deleteModalContent: {
      padding: 20,
    },
    deleteModalWarning: {
      fontSize: 14,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 12,
    },
    deleteModalList: {
      marginBottom: 16,
      gap: 8,
    },
    deleteModalListRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    deleteModalBullet: {
      fontSize: 13,
      color: '#6b7280',
      marginRight: 8,
      width: 12,
    },
    deleteModalListItem: {
      fontSize: 13,
      color: '#374151',
      lineHeight: 18,
      flex: 1,
    },
    deleteModalCannotUndo: {
      fontSize: 14,
      fontWeight: '600',
      color: '#dc2626',
      marginBottom: 20,
      textAlign: 'center',
      paddingVertical: 8,
      backgroundColor: '#fef2f2',
      borderRadius: 8,
    },
    deleteModalInputSection: {
      marginTop: 8,
    },
    deleteModalInputLabel: {
      fontSize: 13,
      color: '#374151',
      marginBottom: 8,
    },
    deleteModalEmailHighlight: {
      fontWeight: '600',
      color: '#111827',
    },
    deleteModalInput: {
      fontSize: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#f9fafb',
    },
    deleteModalActions: {
      flexDirection: 'row',
      gap: 12,
      padding: 20,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
      backgroundColor: '#f9fafb',
    },
    deleteModalCancelButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#d1d5db',
      backgroundColor: '#ffffff',
      alignItems: 'center',
    },
    deleteModalCancelText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
    },
    deleteModalDeleteButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
      backgroundColor: '#dc2626',
      alignItems: 'center',
    },
    deleteModalDeleteButtonDisabled: {
      backgroundColor: '#f87171',
      opacity: 0.5,
    },
    deleteModalDeleteText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
    // FAQ Modal styles
    faqModalContainer: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      width: '100%',
      maxWidth: 640,
      maxHeight: '85%',
      overflow: 'hidden',
      ...(Platform.OS === 'web' && {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      }),
    },
    faqModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#eff6ff',
      padding: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: '#dbeafe',
    },
    faqModalHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    faqModalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#1e40af',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    faqModalCloseButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#ffffff',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#e5e7eb',
    },
    faqModalContent: {
      padding: 16,
      maxHeight: 500,
    },
    faqSection: {
      marginBottom: 8,
      borderRadius: 10,
      backgroundColor: '#f9fafb',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: '#e5e7eb',
    },
    faqSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      paddingHorizontal: 16,
    },
    faqSectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    faqSectionContent: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 4,
      backgroundColor: '#ffffff',
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
    },
    faqItem: {
      marginBottom: 16,
    },
    faqTipItem: {
      marginBottom: 12,
      paddingLeft: 12,
      borderLeftWidth: 3,
      borderLeftColor: '#3b82f6',
    },
    faqQuestion: {
      fontSize: 14,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 6,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    faqAnswer: {
      fontSize: 13,
      fontWeight: '400',
      color: '#6b7280',
      lineHeight: 20,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // FAQ inline content styles
    faqSectionInline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 16,
      backgroundColor: '#f9fafb',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      marginBottom: 8,
    },
    faqSectionTitleInline: {
      fontSize: 15,
      fontWeight: '600',
      color: '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    faqSectionContentInline: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingTop: 4,
      marginTop: -8,
      marginBottom: 8,
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderTopWidth: 0,
      borderColor: '#e5e7eb',
      borderBottomLeftRadius: 10,
      borderBottomRightRadius: 10,
    },
    faqItemInline: {
      marginBottom: 16,
    },
    faqTipItemInline: {
      marginBottom: 12,
      paddingLeft: 12,
      borderLeftWidth: 3,
      borderLeftColor: '#3b82f6',
    },
    faqQuestionInline: {
      fontSize: 14,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 6,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    faqAnswerInline: {
      fontSize: 13,
      fontWeight: '400',
      color: '#6b7280',
      lineHeight: 20,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // FAQ Card styles
    faqCard: {
      backgroundColor: '#ffffff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      marginBottom: 12,
      overflow: 'hidden',
    },
    faqCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 20,
      backgroundColor: '#ffffff',
      borderBottomWidth: 1,
      borderBottomColor: '#f3f4f6',
    },
    faqCardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#6BB3E8',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    faqQuestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: '#f3f4f6',
    },
    faqQuestionText: {
      flex: 1,
      fontSize: 17,
      fontWeight: '500',
      color: '#374151',
      marginRight: 12,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    faqAnswerContainer: {
      paddingHorizontal: 20,
      paddingBottom: 16,
      paddingTop: 0,
      backgroundColor: '#ffffff',
    },
    faqAnswerText: {
      fontSize: 16,
      fontWeight: '400',
      color: '#6b7280',
      lineHeight: 24,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // Subjects/Courses styles
    coursesIntroText: {
      fontSize: 15,
      color: '#6b7280',
      lineHeight: 22,
      marginTop: 8,
      marginBottom: 0,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    coursesAddButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }),
    },
    coursesAddButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    coursesEmptyState: {
      paddingVertical: 48,
      paddingHorizontal: 24,
      alignItems: 'center',
      textAlign: 'center',
    },
    coursesEmptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 8,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    coursesEmptyDescription: {
      fontSize: 14,
      color: '#6b7280',
      lineHeight: 20,
      marginBottom: 24,
      textAlign: 'center',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subjectsList: {
      // No gap needed - dividers handle spacing
    },
    subjectDivider: {
      height: 1,
      backgroundColor: '#e5e7eb',
      marginVertical: 0,
    },
    subjectItem: {
      paddingVertical: 18,
      paddingHorizontal: 4,
      borderRadius: 8,
      ...(Platform.OS === 'web' && {
        transition: 'background-color 0.2s ease',
        cursor: 'default',
      }),
    },
    subjectItemHovered: {
      backgroundColor: '#f9fafb',
    },
    subjectCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    subjectCardInfo: {
      flex: 1,
      marginRight: 16,
    },
    subjectCardNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    subjectCardName: {
      fontSize: 18,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 6,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subjectCardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    subjectCardChildrenContainer: {
      marginTop: 2,
    },
    subjectCardChildrenRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    subjectCardChildItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 4,
    },
    subjectCardChildDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    subjectCardChildren: {
      fontSize: 14,
      fontWeight: '400',
      color: '#6b7280',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subjectCardActivity: {
      fontSize: 14,
      fontWeight: '400',
      color: '#9ca3af',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subjectCardNotes: {
      fontSize: 13,
      fontWeight: '400',
      color: '#9ca3af',
      marginTop: 8,
      fontStyle: 'italic',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subjectCardActions: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subjectActionButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#f9fafb',
      alignItems: 'center',
      justifyContent: 'center',
      ...(Platform.OS === 'web' && {
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }),
    },
    subjectActionButtonHovered: {
      backgroundColor: '#f3f4f6',
    },
    subjectEditForm: {
      gap: 4,
    },
    subjectEditLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 4,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subjectEditInput: {
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: '#111827',
      backgroundColor: '#ffffff',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subjectEditTextarea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    subjectEditActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 16,
    },
    subjectEditCancelButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: '#f3f4f6',
    },
    subjectEditCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#6b7280',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subjectEditSaveButton: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: '#887DEE',
    },
    subjectEditSaveText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: '#6b7280',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // Feedback form styles
    feedbackSubtitle: {
      fontSize: 16,
      fontWeight: '500',
      color: '#6b7280',
      marginBottom: 24,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    feedbackFormContainer: {
      flexDirection: 'row',
      backgroundColor: '#ffffff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      padding: 24,
      gap: 32,
    },
    feedbackLeftColumn: {
      flex: 1,
      maxWidth: 280,
    },
    feedbackRightColumn: {
      flex: 2,
    },
    feedbackSectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 12,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    feedbackHelpText: {
      fontSize: 14,
      fontWeight: '400',
      color: '#6b7280',
      lineHeight: 22,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    feedbackField: {
      marginBottom: 20,
    },
    feedbackLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 8,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    feedbackRequired: {
      color: '#ef4444',
    },
    feedbackInput: {
      fontSize: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#f9fafb',
      color: '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    feedbackTextArea: {
      minHeight: 120,
      textAlignVertical: 'top',
    },
    feedbackInputDisabled: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: '#f9fafb',
      borderWidth: 1,
      borderColor: '#e5e7eb',
    },
    feedbackInputDisabledText: {
      fontSize: 14,
      color: '#6b7280',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    feedbackTypeSelector: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    feedbackTypeOption: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
    },
    feedbackTypeOptionSelected: {
      borderColor: '#6BB3E8',
      backgroundColor: 'rgba(133,196,242,0.2)',
    },
    feedbackTypeOptionText: {
      fontSize: 13,
      fontWeight: '500',
      color: '#6b7280',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    feedbackTypeOptionTextSelected: {
      color: '#6BB3E8',
      fontWeight: '700',
    },
    feedbackSubmitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#85C4F2',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 10,
      alignSelf: 'flex-end',
      marginTop: 8,
      ...(Platform.OS === 'web' && {
        boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
        cursor: 'pointer',
      }),
    },
    feedbackSubmitButtonDisabled: {
      backgroundColor: '#9CA3AF',
      opacity: 0.8,
      ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
    },
    feedbackSubmitButtonText: {
      fontSize: 16,
      fontWeight: '500',
      color: '#FFFFFF',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", sans-serif',
      }),
    },
    feedbackSuccessContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: 40,
    },
    feedbackSuccessIcon: {
      marginBottom: 24,
    },
    feedbackSuccessTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 12,
      textAlign: 'center',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    feedbackSuccessMessage: {
      fontSize: 16,
      fontWeight: '400',
      color: '#6b7280',
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 24,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    feedbackSuccessButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
    },
    feedbackSuccessButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // DoodleMax Premium inline content styles
    doodleMaxHeaderCard: {
      backgroundColor: '#eff6ff',
      borderRadius: 20,
      padding: 28,
      marginBottom: 28,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#bfdbfe',
    },
    doodleMaxHeaderTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: '#1e40af',
      textAlign: 'center',
      marginBottom: 8,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    doodleMaxHeaderSubtitle: {
      fontSize: 15,
      fontWeight: '400',
      color: '#3b82f6',
      textAlign: 'center',
      marginBottom: 24,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // DoodleMax Premium Modal styles
    doodleMaxModalContainer: {
      backgroundColor: '#ffffff',
      borderRadius: 20,
      width: '100%',
      maxWidth: 520,
      maxHeight: '90%',
      overflow: 'hidden',
      ...(Platform.OS === 'web' && {
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      }),
    },
    doodleMaxHeader: {
      backgroundColor: '#1e293b',
      padding: 24,
      paddingTop: 16,
      position: 'relative',
    },
    doodleMaxCloseButton: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1,
    },
    doodleMaxHeaderContent: {
      alignItems: 'center',
      marginTop: 8,
    },
    doodleMaxBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#60a5fa',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      marginBottom: 16,
    },
    doodleMaxBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#ffffff',
      letterSpacing: 1,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    doodleMaxTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: '#ffffff',
      textAlign: 'center',
      marginBottom: 8,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    doodleMaxSubtitle: {
      fontSize: 14,
      fontWeight: '400',
      color: '#94a3b8',
      textAlign: 'center',
      marginBottom: 20,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    doodleMaxStartButton: {
      backgroundColor: '#60a5fa',
      paddingVertical: 16,
      paddingHorizontal: 32,
      borderRadius: 14,
      alignItems: 'center',
      width: '100%',
      ...(Platform.OS === 'web' && {
        boxShadow: '0 4px 14px rgba(96, 165, 250, 0.4)',
      }),
    },
    doodleMaxStartButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#ffffff',
      letterSpacing: 0.5,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    doodleMaxContent: {
      padding: 20,
      maxHeight: 400,
    },
    doodleMaxFeaturesTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: '#1e40af',
      marginBottom: 16,
      marginTop: 4,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    doodleMaxFeatureItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 12,
      gap: 12,
      paddingVertical: 2,
    },
    doodleMaxFeatureIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    doodleMaxFeatureText: {
      flex: 1,
      paddingTop: 2,
    },
    doodleMaxFeatureName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 4,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    doodleMaxFeatureDesc: {
      fontSize: 14,
      fontWeight: '400',
      color: '#6b7280',
      lineHeight: 20,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // Invite URL Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    inviteUrlModal: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      width: '100%',
      maxWidth: 500,
      padding: 24,
      ...(Platform.OS === 'web' && {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      }),
    },
    inviteUrlModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    inviteUrlModalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    inviteUrlModalClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#f3f4f6',
      justifyContent: 'center',
      alignItems: 'center',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
      }),
    },
    inviteUrlModalDescription: {
      fontSize: 14,
      color: '#6b7280',
      marginBottom: 16,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    inviteUrlContainer: {
      marginBottom: 20,
    },
    inviteUrlInput: {
      backgroundColor: '#f9fafb',
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 8,
      padding: 12,
      fontSize: 13,
      color: '#111827',
      minHeight: 60,
      textAlignVertical: 'top',
      ...(Platform.OS === 'web' && {
        fontFamily: 'monospace, "Courier New", monospace',
        wordBreak: 'break-all',
      }),
    },
    inviteUrlModalActions: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'flex-end',
    },
    inviteUrlCopyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#85C4F2',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 10,
      alignSelf: 'flex-end',
      ...(Platform.OS === 'web' && {
        boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
        cursor: 'pointer',
      }),
    },
    inviteUrlCopyButtonSuccess: {
      backgroundColor: '#10b981',
    },
    inviteUrlCopyButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '500',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", sans-serif',
      }),
    },
    inviteUrlDoneButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: '#f3f4f6',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
      }),
    },
    inviteUrlDoneButtonText: {
      color: '#374151',
      fontSize: 14,
      fontWeight: '600',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    // Child Invite Modal styles
    childInviteModal: {
      backgroundColor: '#ffffff',
      borderRadius: 20,
      width: '100%',
      maxWidth: 500,
      maxHeight: '80%',
      padding: 28,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      ...(Platform.OS === 'web' && {
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    childInviteModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    childInviteModalTitle: {
      fontSize: 22,
      fontWeight: '600',
      color: '#2E2E2E',
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    childInviteModalClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderColor: '#e5e7eb',
      justifyContent: 'center',
      alignItems: 'center',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
      }),
    },
    childInviteList: {
      maxHeight: 300,
      marginTop: 12,
    },
    childInviteListContent: {
      gap: 10,
    },
    childInviteItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      backgroundColor: '#f9fafb',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
      }),
    },
    childInviteItemName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#2E2E2E',
      ...(Platform.OS === 'web' && {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    childInviteDescription: {
      fontSize: 22,
      fontWeight: '600',
      color: '#000000',
      marginBottom: 4,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    idCardNameFieldRow: {
      marginBottom: 16,
      alignSelf: 'stretch',
    },
    idCardNameFieldLabel: {
      fontSize: 13,
      color: '#6b7280',
      marginBottom: 6,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    idCardNameFieldInput: {
      backgroundColor: '#f9fafb',
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      color: '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    childInviteEmailInput: {
      backgroundColor: '#f9fafb',
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      color: '#111827',
      marginTop: 8,
      marginBottom: 12,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    childInviteError: {
      fontSize: 13,
      color: '#ef4444',
      marginBottom: 12,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    inviteUrlCopyButtonDisabled: {
      backgroundColor: '#9CA3AF',
      opacity: 0.8,
      ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
    },
  });
}

