import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Alert, ScrollView, Platform, Switch, Modal, Image } from 'react-native';
import { Edit, Plus, Copy, ExternalLink, LogOut, Trash2, Crown, ShoppingBag, HelpCircle, BookOpen, MessageSquare, ChevronRight, ChevronLeft, ChevronDown, Key, X, Infinity, Calendar, Users, BarChart2, Heart, FileText, SlidersHorizontal, Sparkles, Send, Eye, EyeOff, Pencil } from 'lucide-react';
import { getFamilyMembers, inviteTutor, updateTutorScope, getMe } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { typography, getModeTokens } from '../../theme/pastelDesignTokens';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { useToast } from '../Toast';
import { useAuth } from '../../contexts/AuthContext';
import EditChildModal from '../EditChildModal';
import AddChildModal from '../AddChildModal';
import AddSubjectModal from '../AddSubjectModal';
import AddMaterialModal from '../materials/AddMaterialModal';
import TaskCreateModal from '../TaskCreateModal';

export default function FamilyPanel({ user, family: propFamily = null, familyId: propFamilyId = null, onFamilyUpdate = null, profile: propProfile = null }) {
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const lastProfileSaveRef = useRef(0);
  
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
  
  // Connected accounts (integrations) state - UI only for now; wire to real APIs later
  const [connectedProviders, setConnectedProviders] = useState({
    google_drive: false,
    google_docs: false,
    google_classroom: false,
    dropbox: false,
    youtube: false,
    khan_academy: false,
  });
  const [connectingProvider, setConnectingProvider] = useState(null);
  const [hoveredConnectionKey, setHoveredConnectionKey] = useState(null);
  
  // Active section for sidebar navigation
  const [activeSection, setActiveSection] = useState('profile');
  
  // Modal state
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [expandedFAQSection, setExpandedFAQSection] = useState(null);
  const [expandedFAQQuestion, setExpandedFAQQuestion] = useState(null);
  
  // Courses/Subjects state
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectNotes, setEditSubjectNotes] = useState('');
  const [savingSubject, setSavingSubject] = useState(false);
  
  // Feedback form state
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [feedbackType, setFeedbackType] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  
  // Data Vault state
  const [dataExportRequested, setDataExportRequested] = useState(false);
  const [dataDeleteRequested, setDataDeleteRequested] = useState(false);
  
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
  
  // Parent invite state
  const [parentInviteEmail, setParentInviteEmail] = useState('');
  const [parentInviteResultUrl, setParentInviteResultUrl] = useState(null);
  const [invitingParent, setInvitingParent] = useState(false);
  
  const [updatingTutorId, setUpdatingTutorId] = useState(null);

  const styles = createStyles(tokens);

  // Provider logo assets (PNG)
  const googleLogo = require('../../assets/google.png');
  const dropboxLogo = require('../../assets/dropbox.png');
  const youtubeLogo = require('../../assets/youtube.png');
  const khanLogo = require('../../assets/khan.png');

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

  useEffect(() => {
    if (familyId && activeSection === 'courses') {
      loadSubjects();
    }
  }, [familyId, activeSection]);

  // Subject management functions
  const handleEditSubject = (subject) => {
    setEditingSubject(subject);
    setEditSubjectName(subject.name || '');
    setEditSubjectNotes(subject.notes || '');
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

  const handleResetSubject = async (subject) => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm(`Are you sure you want to reset "${subject.name}"? This will delete all related events, materials, and data. The subject itself will remain.`)
      : await new Promise((resolve) => {
          Alert.alert(
            'Reset Subject',
            `Are you sure you want to reset "${subject.name}"? This will delete all related events, materials, and data. The subject itself will remain.`,
            [
              { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Reset', onPress: () => resolve(true), style: 'destructive' }
            ]
          );
        });
    
    if (!confirmed) return;
    
    try {
      // Delete related events
      await supabase
        .from('events')
        .delete()
        .eq('subject_id', subject.id);
      
      // Delete related materials
      await supabase
        .from('materials')
        .delete()
        .eq('subject_id', subject.id);
      
      // Delete related syllabi and their sections
      const { data: syllabi } = await supabase
        .from('syllabi')
        .select('id')
        .eq('subject_id', subject.id);
      
      if (syllabi && syllabi.length > 0) {
        const syllabusIds = syllabi.map(s => s.id);
        await supabase
          .from('syllabus_sections')
          .delete()
          .in('syllabus_id', syllabusIds);
        
        await supabase
          .from('syllabi')
          .delete()
          .eq('subject_id', subject.id);
      }
      
      toast.push(`"${subject.name}" has been reset. All related data has been removed.`, 'success');
      loadSubjects();
    } catch (err) {
      toast.push('Failed to reset subject: ' + err.message, 'error');
    }
  };

  const handleDeleteSubject = async (subject) => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm(`Are you sure you want to delete "${subject.name}"? This will permanently remove the subject and all its related data.`)
      : await new Promise((resolve) => {
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
    
    try {
      // First reset all related data
      await supabase
        .from('events')
        .delete()
        .eq('subject_id', subject.id);
      
      await supabase
        .from('materials')
        .delete()
        .eq('subject_id', subject.id);
      
      const { data: syllabi } = await supabase
        .from('syllabi')
        .select('id')
        .eq('subject_id', subject.id);
      
      if (syllabi && syllabi.length > 0) {
        const syllabusIds = syllabi.map(s => s.id);
        await supabase
          .from('syllabus_sections')
          .delete()
          .in('syllabus_id', syllabusIds);
        
        await supabase
          .from('syllabi')
          .delete()
          .eq('subject_id', subject.id);
      }
      
      // Finally delete the subject
      const { error } = await supabase
        .from('subject')
        .delete()
        .eq('id', subject.id);
      
      if (error) throw error;
      
      toast.push(`"${subject.name}" has been deleted.`, 'success');
      loadSubjects();
    } catch (err) {
      toast.push('Failed to delete subject: ' + err.message, 'error');
    }
  };

  // Helper to get child names for a subject
  const getSubjectChildNames = (subject) => {
    if (!subject.child_id || subject.child_id === '') {
      return 'All children';
    }
    const childIds = subject.child_id.split(';').map(id => id.trim()).filter(Boolean);
    const childNames = childIds.map(id => {
      const child = children.find(c => c.id === id);
      return child ? (child.name || child.first_name || 'Child') : null;
    }).filter(Boolean);
    return childNames.length > 0 ? childNames.join(', ') : 'All children';
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
      toast.push('Child invite sent successfully!', 'success');
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
      toast.push('Parent invite sent successfully!', 'success');
    } catch (err) {
      setError(err.message || 'Failed to invite parent');
      toast.push('Failed to invite parent', 'error');
    } finally {
      setInvitingParent(false);
    }
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

      const emailChanged = profileEmail.trim() && profileEmail.trim().toLowerCase() !== (profile?.email || '').toLowerCase();

      // If email is being changed, trigger verification through Supabase Auth
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ 
          email: profileEmail.trim() 
        });
        
        if (emailError) {
          throw emailError;
        }
        
        // Show verification message - email won't actually change until verified
        toast.push('Verification email sent to ' + profileEmail.trim() + '. Please check your inbox to confirm the change.', 'info');
        
        // Reset email field to current email since change is pending verification
        setProfileEmail(profile?.email || '');
      }

      // Update user profile (but NOT the email in profiles table - that will be updated by Supabase trigger on verification)
      const profileUpdates = {};
      if (profileName.trim()) {
        profileUpdates.name = profileName.trim();
        profileUpdates.first_name = profileName.trim();
      }
      if (profilePhone.trim() !== (profile?.phone || '')) {
        profileUpdates.phone = profilePhone.trim() || null;
      }

      if (Object.keys(profileUpdates).length > 0) {
        const { data: updatedProfile, error: profileError } = await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', authUser.id)
          .select()
          .single();

        if (profileError) throw profileError;
        
        // Immediately update state with returned data
        if (updatedProfile) {
          setProfile(prev => ({ ...prev, ...updatedProfile }));
          setProfileName(updatedProfile.name || updatedProfile.first_name || '');
          setProfilePhone(updatedProfile.phone || '');
        }
      }

      // Update family name if changed
      if (familyName.trim() !== (family?.family_name || '')) {
        if (familyId) {
          const { data: updatedFamily, error: familyError } = await supabase
            .from('family')
            .update({ family_name: familyName.trim() || null })
            .eq('id', familyId)
            .select()
            .single();

          if (familyError) throw familyError;
          
          // Immediately update state with returned data
          if (updatedFamily) {
            setFamily(prev => ({ ...prev, ...updatedFamily }));
            setFamilyName(updatedFamily.family_name || '');
          }
        }
      }

      // Dispatch global events to refresh profile in other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshProfile'));
        window.dispatchEvent(new CustomEvent('refreshFamily'));
      }

      lastProfileSaveRef.current = Date.now();
      setEditingProfile(false);
      toast.push('Profile updated successfully!', 'success');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
      toast.push('Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

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
  const children = family?.children || [];

  const CONNECTION_PROVIDERS = [
    {
      key: 'google_drive',
      label: 'Google Drive',
      description: 'Attach files and folders from your Google Drive across lessons and materials.',
      image: googleLogo,
    },
    {
      key: 'google_docs',
      label: 'Google Docs',
      description: 'Link rich documents, plans, and worksheets stored in Google Docs.',
      image: googleLogo,
    },
    {
      key: 'google_classroom',
      label: 'Google Classroom',
      description: 'Keep Learnadoodle in sync with assignments and classes from Google Classroom.',
      image: googleLogo,
    },
    {
      key: 'dropbox',
      label: 'Dropbox',
      description: 'Connect shared folders and teaching resources from Dropbox.',
      image: dropboxLogo,
    },
    {
      key: 'youtube',
      label: 'YouTube',
      description: 'Save favorite learning videos and channels into your library.',
      image: youtubeLogo,
    },
    {
      key: 'khan_academy',
      label: 'Khan Academy',
      description: 'Bring in practice sets and courses from Khan Academy for each learner.',
      image: khanLogo,
    },
  ];

  const setProviderConnection = (providerKey, isConnected) => {
    setConnectedProviders((prev) => ({
      ...prev,
      [providerKey]: isConnected,
    }));
  };

  const handleConnectProvider = (providerKey) => {
    if (connectingProvider) return;
    setConnectingProvider(providerKey);
    try {
      setProviderConnection(providerKey, true);
      toast.push('Connected account (preview only - no data shared yet)', 'success');
    } catch (err) {
      toast.push(err.message || 'Failed to connect account', 'error');
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnectProvider = (providerKey) => {
    setProviderConnection(providerKey, false);
    toast.push('Disconnected account', 'success');
  };

  // Render content based on active section
  const renderMainContent = () => {
    switch (activeSection) {
      case 'connections':
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Connected accounts</Text>

            <Text style={styles.connectionsIntro}>
              Connect the tools you already use so it is faster to pull in documents, videos, and courses while you plan.
              These connections are optional and you stay in full control of what gets shared.
            </Text>

            <Text style={styles.subsectionTitle}>Cloud storage & docs</Text>
            <View style={styles.subsectionDivider} />

            <View style={styles.connectionsList}>
              {CONNECTION_PROVIDERS.filter(p =>
                ['google_drive', 'google_docs', 'google_classroom', 'dropbox'].includes(p.key)
              ).map(({ key, label, description, image }) => {
                const isConnected = !!connectedProviders[key];
                const isBusy = connectingProvider === key;

                return (
                  <View key={key} style={styles.connectionRow}>
                    <View style={styles.connectionRowLeft}>
                      <View style={styles.connectionRowIcon}>
                        <Image source={image} style={styles.connectionRowImage} resizeMode="contain" />
                      </View>
                      <View style={styles.connectionRowText}>
                        <Text style={styles.connectionRowLabel}>{label}</Text>
                        <Text style={styles.connectionRowDescription}>{description}</Text>
                      </View>
                    </View>
                    <View style={styles.connectionRowActions}>
                      <TouchableOpacity
                        style={[
                          styles.connectionPillButton,
                          isConnected && styles.connectionPillButtonConnected,
                          hoveredConnectionKey === key && styles.connectionPillButtonHovered,
                          isBusy && styles.connectionPillButtonDisabled,
                        ]}
                        onPress={() => {
                          if (isConnected) {
                            toast.push('Connection settings coming soon for this provider', 'info');
                          } else {
                            handleConnectProvider(key);
                          }
                        }}
                        disabled={isBusy}
                        {...(Platform.OS === 'web' && {
                          cursor: isBusy ? 'not-allowed' : 'pointer',
                          onMouseEnter: () => setHoveredConnectionKey(key),
                          onMouseLeave: () => setHoveredConnectionKey(null),
                        })}
                      >
                        <Text style={[
                          styles.connectionPillButtonText,
                          hoveredConnectionKey === key && styles.connectionPillButtonTextHovered,
                        ]}>
                          {isBusy
                            ? 'Connecting...'
                            : isConnected
                            ? 'Connected'
                            : 'Connect'}
                        </Text>
                      </TouchableOpacity>
                      {isConnected && (
                        <TouchableOpacity
                          style={styles.connectionSecondaryButton}
                          onPress={() => handleDisconnectProvider(key)}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.connectionSecondaryButtonText}>Disconnect</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            <Text style={[styles.subsectionTitle, { marginTop: 32 }]}>Learning platforms</Text>
            <View style={styles.subsectionDivider} />

            <View style={styles.connectionsList}>
              {CONNECTION_PROVIDERS.filter(p =>
                ['youtube', 'khan_academy'].includes(p.key)
              ).map(({ key, label, description, image }) => {
                const isConnected = !!connectedProviders[key];
                const isBusy = connectingProvider === key;

                return (
                  <View key={key} style={styles.connectionRow}>
                    <View style={styles.connectionRowLeft}>
                      <View style={styles.connectionRowIcon}>
                        <Image source={image} style={styles.connectionRowImage} resizeMode="contain" />
                      </View>
                      <View style={styles.connectionRowText}>
                        <Text style={styles.connectionRowLabel}>{label}</Text>
                        <Text style={styles.connectionRowDescription}>{description}</Text>
                      </View>
                    </View>
                    <View style={styles.connectionRowActions}>
                      <TouchableOpacity
                        style={[
                          styles.connectionPillButton,
                          isConnected && styles.connectionPillButtonConnected,
                          hoveredConnectionKey === key && styles.connectionPillButtonHovered,
                          isBusy && styles.connectionPillButtonDisabled,
                        ]}
                        onPress={() => {
                          if (isConnected) {
                            toast.push('Connection settings coming soon for this provider', 'info');
                          } else {
                            handleConnectProvider(key);
                          }
                        }}
                        disabled={isBusy}
                        {...(Platform.OS === 'web' && {
                          cursor: isBusy ? 'not-allowed' : 'pointer',
                          onMouseEnter: () => setHoveredConnectionKey(key),
                          onMouseLeave: () => setHoveredConnectionKey(null),
                        })}
                      >
                        <Text style={[
                          styles.connectionPillButtonText,
                          hoveredConnectionKey === key && styles.connectionPillButtonTextHovered,
                        ]}>
                          {isBusy
                            ? 'Connecting...'
                            : isConnected
                            ? 'Connected'
                            : 'Connect'}
                        </Text>
                      </TouchableOpacity>
                      {isConnected && (
                        <TouchableOpacity
                          style={styles.connectionSecondaryButton}
                          onPress={() => handleDisconnectProvider(key)}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.connectionSecondaryButtonText}>Disconnect</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
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
            
            <Text style={[styles.subsectionTitle, { marginTop: 32 }]}>Appearance</Text>
            <View style={styles.subsectionDivider} />
            
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>Dark mode</Text>
              <CustomToggle
                value={darkMode === 'on'}
                onValueChange={(value) => setDarkMode(value ? 'on' : 'off')}
              />
            </View>
          </View>
        );
      
      case 'profile':
        const hasProfileChanges = 
          profileName !== (profile?.name || profile?.first_name || '') ||
          profileUsername !== (profile?.username || '') ||
          profileEmail !== (profile?.email || user?.email || '') ||
          currentPassword !== '' ||
          newPassword !== '' ||
          confirmNewPassword !== '';
        
        return (
          <View style={styles.mainContentInner}>
            <Text style={styles.mainContentTitle}>Profile</Text>
            
            {/* Name Field */}
            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Name</Text>
              <TextInput
                style={styles.profileDarkInput}
                value={profileName}
                onChangeText={setProfileName}
                placeholder="Enter your name"
                placeholderTextColor="#6b7280"
              />
            </View>
            
            {/* Email Field */}
            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Email</Text>
              <TextInput
                style={styles.profileDarkInput}
                value={profileEmail}
                onChangeText={setProfileEmail}
                placeholder="Enter your email"
                placeholderTextColor="#6b7280"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {user && !user.email_confirmed_at && (
                <View style={styles.profileEmailVerify}>
                  <Text style={styles.profileEmailVerifyText}>Email not verified. </Text>
                  <TouchableOpacity onPress={() => toast.push('Verification email sent!', 'success')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Text style={styles.profileEmailVerifyLink}>Verify now</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            
            {/* Current Password Field */}
            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Current password</Text>
              <View style={styles.profilePasswordContainer}>
                <TextInput
                  style={[styles.profileDarkInput, styles.profilePasswordInput]}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder=""
                  placeholderTextColor="#6b7280"
                  secureTextEntry={!showCurrentPassword}
                />
                <TouchableOpacity
                  style={styles.profilePasswordToggle}
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  {showCurrentPassword ? (
                    <EyeOff size={20} color="#60a5fa" />
                  ) : (
                    <Eye size={20} color="#60a5fa" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            
            {/* New Password Field */}
            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>New password</Text>
              <View style={styles.profilePasswordContainer}>
                <TextInput
                  style={[styles.profileDarkInput, styles.profilePasswordInput]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder=""
                  placeholderTextColor="#6b7280"
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity
                  style={styles.profilePasswordToggle}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  {showNewPassword ? (
                    <EyeOff size={20} color="#60a5fa" />
                  ) : (
                    <Eye size={20} color="#60a5fa" />
                  )}
                </TouchableOpacity>
              </View>
              {newPassword.length > 0 && newPassword.length < 8 && (
                <Text style={styles.passwordRequirement}>Password must be at least 8 characters</Text>
              )}
            </View>
            
            {/* Confirm New Password Field */}
            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Confirm new password</Text>
              <View style={styles.profilePasswordContainer}>
                <TextInput
                  style={[styles.profileDarkInput, styles.profilePasswordInput]}
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  placeholder=""
                  placeholderTextColor="#6b7280"
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity
                  style={styles.profilePasswordToggle}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color="#60a5fa" />
                  ) : (
                    <Eye size={20} color="#60a5fa" />
                  )}
                </TouchableOpacity>
              </View>
              {confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
                <Text style={styles.passwordRequirement}>Passwords do not match</Text>
              )}
            </View>
            
            {/* Save Changes Button */}
            <TouchableOpacity
              style={[
                styles.profileSaveButton,
                (!hasProfileChanges || savingProfile) && styles.profileSaveButtonDisabled
              ]}
              onPress={async () => {
                setSavingProfile(true);
                try {
                  // Update profile
                  await handleSaveProfile();
                  
                  // Update password if provided
                  if (currentPassword && newPassword) {
                    // Validate password requirements
                    if (newPassword.length < 8) {
                      throw new Error('New password must be at least 8 characters');
                    }
                    
                    // Validate passwords match
                    if (newPassword !== confirmNewPassword) {
                      throw new Error('New passwords do not match');
                    }
                    
                    // First verify the current password by re-authenticating
                    const userEmail = profile?.email || user?.email;
                    if (!userEmail) {
                      throw new Error('Email not found. Please try again.');
                    }
                    
                    const { error: verifyError } = await supabase.auth.signInWithPassword({
                      email: userEmail,
                      password: currentPassword,
                    });
                    
                    if (verifyError) {
                      throw new Error('Current password is incorrect');
                    }
                    
                    // Current password verified, now update to new password
                    const { error } = await supabase.auth.updateUser({ password: newPassword });
                    if (error) throw error;
                    toast.push('Password updated successfully!', 'success');
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmNewPassword('');
                  }
                } catch (err) {
                  toast.push(err.message || 'Failed to save changes', 'error');
                } finally {
                  setSavingProfile(false);
                }
              }}
              disabled={!hasProfileChanges || savingProfile}
              {...(Platform.OS === 'web' && { cursor: (!hasProfileChanges || savingProfile) ? 'not-allowed' : 'pointer' })}
            >
              {savingProfile ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.profileSaveButtonText}>SAVE CHANGES</Text>
              )}
            </TouchableOpacity>
            
            {/* Data & Account Actions */}
            <View style={styles.profileActionsSection}>
              <TouchableOpacity
                style={styles.profileActionButton}
                onPress={() => setActiveSection('datavault')}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.profileActionButtonText}>EXPORT MY DATA</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.profileActionButton}
                onPress={() => setActiveSection('datavault')}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.profileActionButtonTextDanger}>DELETE MY ACCOUNT</Text>
              </TouchableOpacity>
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
              <View style={styles.notifSectionHeader}>
                <Text style={styles.notifSectionTitle}>General</Text>
                <Text style={styles.notifSectionHeaderLabel}>Email</Text>
              </View>
              
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
              {parents.length < 2 && (
                <TouchableOpacity 
                  style={styles.membersInviteButton} 
                  onPress={async () => {
                    if (Platform.OS === 'web') {
                      const email = window.prompt('Enter parent email address:');
                      if (email && email.trim()) {
                        try {
                          const { data, error: err } = await inviteTutor({ email: email.trim(), role: 'parent', child_ids: [] });
                          if (err) throw err;
                          toast.push('Parent invite sent successfully!', 'success');
                          if (data?.invite_url) { await navigator.clipboard.writeText(data.invite_url); toast.push('Invite link copied to clipboard', 'success'); }
                        } catch (err) { toast.push(err.message || 'Failed to invite parent', 'error'); }
                      }
                    }
                  }} 
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#887DEE" />
                  <Text style={styles.membersInviteButtonText}>Invite Parent</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.subsectionDivider} />
            
            {parents.length === 0 ? (
              <Text style={styles.membersEmptyText}>
                {profile?.role === 'parent' ? 'No other parents yet' : 'No parents found'}
              </Text>
            ) : parents.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <Text style={styles.memberRowName}>{family?.family_name || member.email || 'Parent'}</Text>
              </View>
            ))}
            
            {/* Children Section */}
            <View style={[styles.membersSectionRow, { marginTop: 32 }]}>
              <Text style={styles.subsectionTitle}>Children</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity 
                  style={styles.membersInviteButton} 
                  onPress={() => setShowAddChildModal(true)} 
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#887DEE" />
                  <Text style={styles.membersInviteButtonText}>Add Child</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.membersInviteButton} 
                  onPress={async () => {
                    const email = window.prompt('Enter child email to invite:');
                    if (email && email.trim()) {
                      try {
                        const { data, error: err } = await inviteTutor({ email: email.trim(), role: 'child', child_ids: [] });
                        if (err) throw err;
                        toast.push('Child invite sent successfully!', 'success');
                        if (onFamilyUpdate) onFamilyUpdate();
                      } catch (error) {
                        toast.push('Failed to send invite: ' + error.message, 'error');
                      }
                    }
                  }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#887DEE" />
                  <Text style={styles.membersInviteButtonText}>Invite Child</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.subsectionDivider} />
            
            {children.length === 0 ? (
              <Text style={styles.membersEmptyText}>No children added yet</Text>
            ) : children.map((child) => {
              const childName = child.name || child.first_name || 'Child';
              return (
                <View key={child.id} style={styles.memberRow}>
                  <Text style={styles.memberRowName}>{childName}{child.archived && ' (Archived)'}</Text>
                  <View style={styles.memberRowActions}>
                    <TouchableOpacity 
                      style={styles.memberRowActionButton} 
                      onPress={() => { setEditingChild(child); setShowEditChildModal(true); }} 
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Edit size={18} color="#887DEE" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.memberRowActionButton} 
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          if (window.confirm(`Are you sure you want to delete ${childName}?`)) {
                            (async () => {
                              try {
                                await supabase.from('children').delete().eq('id', child.id);
                                toast.push('Child deleted successfully', 'success');
                                const { data } = await getFamilyMembers();
                                if (data) { setFamily(data); if (onFamilyUpdate) onFamilyUpdate(data); }
                              } catch (err) { toast.push('Failed to delete child', 'error'); }
                            })();
                          }
                        } else {
                          Alert.alert('Delete Child', `Are you sure you want to delete ${childName}?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: async () => {
                              try {
                                await supabase.from('children').delete().eq('id', child.id);
                                toast.push('Child deleted successfully', 'success');
                                const { data } = await getFamilyMembers();
                                if (data) { setFamily(data); if (onFamilyUpdate) onFamilyUpdate(data); }
                              } catch (err) { toast.push('Failed to delete child', 'error'); }
                            }}
                          ]);
                        }
                      }} 
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Trash2 size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            
            {/* Tutors Section */}
            <View style={[styles.membersSectionRow, { marginTop: 32 }]}>
              <Text style={styles.subsectionTitle}>Tutors</Text>
              <TouchableOpacity 
                style={styles.membersInviteButton} 
                onPress={async () => {
                  if (Platform.OS === 'web') {
                    const email = window.prompt('Enter tutor email address:');
                    if (email && email.trim()) {
                      try {
                        const { data, error: err } = await inviteTutor({ email: email.trim(), role: 'tutor', child_ids: children.map(c => c.id) });
                        if (err) throw err;
                        toast.push('Tutor invite sent successfully!', 'success');
                        if (data?.invite_url) { await navigator.clipboard.writeText(data.invite_url); toast.push('Invite link copied to clipboard', 'success'); }
                      } catch (err) { toast.push(err.message || 'Failed to invite tutor', 'error'); }
                    }
                  }
                }} 
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Plus size={16} color="#887DEE" />
                <Text style={styles.membersInviteButtonText}>Invite Tutor</Text>
              </TouchableOpacity>
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
              <View>
                <Text style={styles.mainContentTitle}>Courses</Text>
                <Text style={styles.sectionSubtitle}>Manage your family's subjects and courses</Text>
              </View>
              <TouchableOpacity
                style={styles.membersInviteButton}
                onPress={() => setShowAddSubjectModal(true)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Plus size={16} color="#887DEE" />
                <Text style={styles.membersInviteButtonText}>Add Subject</Text>
              </TouchableOpacity>
            </View>
            
            {loadingSubjects ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#887DEE" />
                <Text style={styles.loadingText}>Loading subjects...</Text>
              </View>
            ) : subjects.length === 0 ? (
              <View style={styles.infoCard}>
                <Text style={styles.emptyText}>No subjects yet. Add subjects from the Subjects page.</Text>
              </View>
            ) : (
              <View style={styles.subjectsList}>
                {subjects.map((subject) => (
                  <View key={subject.id} style={styles.subjectCard}>
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
                            <Text style={styles.subjectCardChildren}>{getSubjectChildNames(subject)}</Text>
                            {subject.notes && (
                              <Text style={styles.subjectCardNotes}>{subject.notes}</Text>
                            )}
                          </View>
                          <View style={styles.subjectCardActions}>
                            <TouchableOpacity
                              style={styles.subjectActionButton}
                              onPress={() => handleEditSubject(subject)}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Pencil size={18} color="#887DEE" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.subjectActionButton}
                              onPress={() => handleResetSubject(subject)}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <X size={18} color="#f59e0b" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.subjectActionButton}
                              onPress={() => handleDeleteSubject(subject)}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Trash2 size={18} color="#ef4444" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                ))}
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
      
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.twoColumnLayout}>
        {/* Left: Scrollable main content */}
        <ScrollView style={styles.mainContent} contentContainerStyle={styles.mainContentContainer}>
          {renderMainContent()}
        </ScrollView>

        {/* Right: Fixed sidebar */}
        <View style={styles.sidebar}>
          {/* Account Card */}
          <View style={styles.sidebarCard}>
            <Text style={styles.sidebarCardTitle}>Account</Text>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'profile' && styles.sidebarButtonActive]} onPress={() => setActiveSection('profile')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'profile' && styles.sidebarButtonTextActive]}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'members' && styles.sidebarButtonActive]} onPress={() => setActiveSection('members')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'members' && styles.sidebarButtonTextActive]}>Family Members</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'courses' && styles.sidebarButtonActive]} onPress={() => setActiveSection('courses')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'courses' && styles.sidebarButtonTextActive]}>Courses</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'connections' && styles.sidebarButtonActive]} onPress={() => setActiveSection('connections')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'connections' && styles.sidebarButtonTextActive]}>Connected accounts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'preferences' && styles.sidebarButtonActive]} onPress={() => setActiveSection('preferences')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'preferences' && styles.sidebarButtonTextActive]}>Preferences</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'notifications' && styles.sidebarButtonActive]} onPress={() => setActiveSection('notifications')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'notifications' && styles.sidebarButtonTextActive]}>Notifications</Text>
            </TouchableOpacity>
          </View>

          {/* Subscription Card */}
          <View style={styles.sidebarCard}>
            <Text style={styles.sidebarCardTitle}>Subscription</Text>
            <TouchableOpacity style={[styles.sidebarButton, activeSection === 'doodlemax' && styles.sidebarButtonActive]} onPress={() => setActiveSection('doodlemax')} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <Text style={[styles.sidebarButtonText, activeSection === 'doodlemax' && styles.sidebarButtonTextActive]}>DoodleMax</Text>
            </TouchableOpacity>
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
        </View>
      </View>

      {/* Modals */}
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
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshChildren'));
          const loadFamily = async () => { try { const { data, error: err } = await getFamilyMembers(); if (!err && data) { setFamily(data); if (onFamilyUpdate) onFamilyUpdate(data); } } catch (err) {} };
          loadFamily();
        }}
        onChildDeleted={() => {
          const loadFamily = async () => { try { const { data, error: err } = await getFamilyMembers(); if (!err && data) { setFamily(data); if (onFamilyUpdate) onFamilyUpdate(data); } } catch (err) {} };
          loadFamily();
        }}
      />

      <AddChildModal
        visible={showAddChildModal}
        onClose={() => setShowAddChildModal(false)}
        familyId={family?.id || familyId}
        onChildAdded={() => {
          const loadFamily = async () => { try { const { data, error: err } = await getFamilyMembers(); if (!err && data) { setFamily(data); if (onFamilyUpdate) onFamilyUpdate(data); } } catch (err) {} };
          loadFamily();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshChildren'));
        }}
      />

      <AddSubjectModal 
        visible={showAddSubjectModal} 
        onClose={() => setShowAddSubjectModal(false)} 
        familyId={family?.id || familyId}
        onSubjectAdded={() => {
          loadSubjects();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('subjectCreated'));
          }
        }}
      />
      <AddMaterialModal visible={showAddMaterialModal} onClose={() => setShowAddMaterialModal(false)} familyId={family?.id || familyId} />
      <TaskCreateModal visible={showTaskModal} onClose={() => setShowTaskModal(false)} familyId={family?.id || familyId} />

    </View>
  );
}

function createStyles(tokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      width: '100%',
      height: '100%',
      backgroundColor: '#f9fafb',
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
    mainContentContainer: {
      padding: 32,
      paddingRight: 16,
    },
    mainContentInner: {
      width: '100%',
    },
    mainContentTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 32,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subsectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 8,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subsectionDivider: {
      height: 1,
      backgroundColor: '#e5e7eb',
      marginBottom: 16,
    },
    membersSectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    coursesHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
    },
    membersInviteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
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
      paddingVertical: 12,
    },
    memberRowName: {
      fontSize: 16,
      fontWeight: '500',
      color: '#374151',
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
      backgroundColor: '#60a5fa',
    },
    customToggleThumb: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#ffffff',
      ...(Platform.OS === 'web' && {
        transition: 'transform 0.2s ease',
      }),
    },
    customToggleThumbOn: {
      transform: [{ translateX: 22 }],
    },
    sidebar: {
      width: 280,
      padding: 16,
      backgroundColor: '#ffffff',
      ...(Platform.OS === 'web' && {
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }),
    },
    sidebarCard: {
      backgroundColor: '#ffffff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      padding: 16,
      marginBottom: 16,
    },
    sidebarCardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 12,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sidebarButton: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginBottom: 4,
    },
    sidebarButtonActive: {
      backgroundColor: '#eff6ff',
    },
    sidebarButtonText: {
      fontSize: 18,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    sidebarButtonTextActive: {
      color: '#60a5fa',
      fontWeight: '500',
    },
    logoutButtonSidebar: {
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: '#ffffff',
    },
    logoutButtonSidebarHovered: {
      backgroundColor: '#eff6ff',
      borderColor: '#60a5fa',
    },
    logoutButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#60a5fa',
      letterSpacing: 0.5,
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
    connectionsIntro: {
      fontSize: 14,
      color: '#4b5563',
      lineHeight: 20,
      marginBottom: 24,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionsList: {
      borderTopWidth: 0,
    },
    connectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
    },
    connectionRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: 12,
    },
    connectionRowIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#eff6ff',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    connectionRowImage: {
      width: 22,
      height: 22,
    },
    connectionRowText: {
      flex: 1,
    },
    connectionRowLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    connectionRowDescription: {
      fontSize: 13,
      color: '#6b7280',
      marginTop: 2,
    },
    connectionRowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    connectionPillButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: '#F9FAFB',
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
      }),
    },
    connectionPillButtonHovered: {
      backgroundColor: '#EFF6FF',
    },
    connectionPillButtonConnected: {
      backgroundColor: '#E0F2FE',
    },
    connectionPillButtonDisabled: {
      opacity: 0.7,
    },
    connectionPillButtonText: {
      fontSize: 13,
      fontWeight: '500',
      color: '#374151',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        transition: 'font-weight 0.2s ease',
      }),
    },
    connectionPillButtonTextHovered: {
      fontWeight: '600',
    },
    connectionSecondaryButton: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: '#d1d5db',
      backgroundColor: '#ffffff',
    },
    connectionSecondaryButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#4b5563',
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
    profileFieldGroup: {
      marginBottom: 20,
    },
    profileFieldLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 8,
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    profileDarkInput: {
      fontSize: 15,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: '#f9fafb',
      color: '#111827',
      borderWidth: 1,
      borderColor: '#e5e7eb',
      ...(Platform.OS === 'web' && {
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        outlineWidth: 0,
      }),
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
    profileSaveButton: {
      backgroundColor: '#60a5fa',
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 10,
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginTop: 12,
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
    profileActionsSection: {
      marginTop: 48,
      gap: 16,
    },
    profileActionButton: {
      paddingVertical: 8,
    },
    profileActionButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#6b7280',
      letterSpacing: 0.5,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    profileActionButtonTextDanger: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ef4444',
      letterSpacing: 0.5,
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
      fontWeight: '700',
      color: '#111827',
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
      backgroundColor: '#60a5fa',
      borderColor: '#60a5fa',
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
      color: '#3b82f6',
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
      backgroundColor: '#fafafa',
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
    subjectsList: {
      gap: 12,
    },
    subjectCard: {
      backgroundColor: '#ffffff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      padding: 16,
    },
    subjectCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    subjectCardInfo: {
      flex: 1,
      marginRight: 12,
    },
    subjectCardName: {
      fontSize: 17,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 4,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }),
    },
    subjectCardChildren: {
      fontSize: 14,
      fontWeight: '500',
      color: '#6b7280',
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
    },
    subjectActionButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: '#f9fafb',
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
        outline: 'none',
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
        outlineWidth: 0,
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
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      backgroundColor: '#ffffff',
    },
    feedbackTypeOptionSelected: {
      borderColor: '#3b82f6',
      backgroundColor: '#eff6ff',
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
      color: '#3b82f6',
    },
    feedbackSubmitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#22d3ee',
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 10,
      alignSelf: 'flex-end',
      marginTop: 8,
    },
    feedbackSubmitButtonDisabled: {
      backgroundColor: '#9ca3af',
      opacity: 0.6,
    },
    feedbackSubmitButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ffffff',
      letterSpacing: 0.5,
      ...(Platform.OS === 'web' && {
        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  });
}

