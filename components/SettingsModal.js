import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { 
  X, 
  Settings, 
  Bell, 
  Shield, 
  Users, 
  User, 
  Globe, 
  CreditCard, 
  Home,
  Zap,
  BarChart3,
  HelpCircle,
  Calendar,
  Download,
  Trash2,
  Eye,
  EyeOff,
  Mail,
  Lock,
  Smartphone,
  ExternalLink,
  Plus,
  Minus,
  LogOut
} from 'lucide-react';

// Icon component for consistency
const Icon = ({ name, size = 16, color = '#37352f' }) => {
  const icons = {
    settings: Settings,
    bell: Bell,
    shield: Shield,
    users: Users,
    user: User,
    globe: Globe,
    creditCard: CreditCard,
    home: Home,
    zap: Zap,
    barChart: BarChart3,
    help: HelpCircle,
    calendar: Calendar,
    download: Download,
    trash: Trash2,
    eye: Eye,
    eyeOff: EyeOff,
    mail: Mail,
    lock: Lock,
    smartphone: Smartphone,
    externalLink: ExternalLink,
    plus: Plus,
    minus: Minus,
    logOut: LogOut,
    x: X,
  };
  
  const IconComponent = icons[name] || Settings;
  return <IconComponent size={size} color={color} />;
};

export default function SettingsModal({ visible, onClose, user, onSignOut }) {
  const [activeSection, setActiveSection] = useState('profile');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showInviteConfirm, setShowInviteConfirm] = useState(false);
  const [showInviteSent, setShowInviteSent] = useState(false);
  const [showDeleteChildConfirm, setShowDeleteChildConfirm] = useState(false);
  const [showDeleteChildSuccess, setShowDeleteChildSuccess] = useState(false);
  const [showDeleteChildError, setShowDeleteChildError] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [showDeleteProfileConfirm, setShowDeleteProfileConfirm] = useState(false);
  const [showDeleteProfileSuccess, setShowDeleteProfileSuccess] = useState(false);
  const [showDeleteFamilyConfirm, setShowDeleteFamilyConfirm] = useState(false);
  const [showDeleteFamilySuccess, setShowDeleteFamilySuccess] = useState(false);
  const [childToDelete, setChildToDelete] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Profile settings
  const [profileSettings, setProfileSettings] = useState({
    displayName: user?.email?.split('@')[0] || 'User',
    email: user?.email || '',
    avatar: null,
    bio: '',
    language: 'English',
    timezone: 'UTC-5',
    dateFormat: 'MM/DD/YYYY',
    weekStart: 'Monday',
  });
  
  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    dailyReminders: true,
    weeklySummary: true,
    pushNotifications: true,
    customAlerts: false,
    lessonReminders: true,
    progressUpdates: true,
    familyUpdates: false,
  });
  
  // Family settings
  const [familySettings, setFamilySettings] = useState({
    familyName: 'The Baumeister Academy',
    schoolYearStart: '2025-08-01',
    schoolYearEnd: '2026-05-31',
    dailyLearningHours: 6,
    weeklySchedule: [1, 2, 3, 4, 5], // Mon-Fri
    learningTimezone: 'UTC-5',
    firstDayOfWeek: 'Monday',
    localCompliance: false,
    portfolioExports: true,
  });
  
  // Subscription settings
  const [subscriptionSettings, setSubscriptionSettings] = useState({
    currentPlan: 'Free',
    familySize: 3,
    paymentMethod: '•••• •••• •••• 1234',
    autoBackup: true,
  });
  
  // Security settings
  const [securitySettings, setSecuritySettings] = useState({
    twoFactorAuth: false,
    sessionTimeout: 30,
    loginNotifications: true,
    passwordExpiry: 90,
    parentalControls: true,
  });
  
  // Integration settings
  const [integrationSettings, setIntegrationSettings] = useState({
    googleCalendar: false,
    appleCalendar: false,
    khanAcademy: false,
    outschool: false,
    googleDrive: false,
    dropbox: false,
  });

  // Members (parent + children)
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [familyId, setFamilyId] = useState(null);

  // Load family id for current user
  useEffect(() => {
    const loadFamily = async () => {
      try {
        if (!user?.id) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .single();
        if (!error && data?.family_id) setFamilyId(data.family_id);
      } catch (e) {
        console.warn('Load family id failed:', e);
      }
    };
    loadFamily();
  }, [user?.id]);

  // Load members list (parent + children)
  useEffect(() => {
    const loadMembers = async () => {
      try {
        if (!familyId) return;
        setMembersLoading(true);
        const parent = {
          id: user?.id || 'parent',
          name: user?.email?.split('@')[0] || 'Parent',
          role: 'Parent',
          email: user?.email || '',
          status: 'active',
          isChild: false,
        };

        const { data: children, error } = await supabase
          .from('children')
          .select('id, name, age, grade, avatar')
          .eq('family_id', familyId)
          .order('name', { ascending: true });
        if (error) throw error;

        const childMembers = (children || []).map(c => ({
          id: c.id,
          name: c.name,
          role: 'Student',
          email: '',
          status: 'active',
          isChild: true,
          meta: c,
        }));

        const allMembers = [parent, ...childMembers];
        console.log('Loaded members:', allMembers);
        setMembers(allMembers);
      } catch (e) {
        console.warn('Load members failed:', e);
      } finally {
        setMembersLoading(false);
      }
    };
    loadMembers();
  }, [familyId, visible]);

  const handleRemoveMember = (member) => {
    console.log('handleRemoveMember called with:', member);
    if (!member?.isChild) {
      console.log('Member is not a child, returning early');
      return; // only children can be removed here
    }
    
    console.log('Showing delete confirmation for:', member.name);
    setChildToDelete(member);
    setShowDeleteChildConfirm(true);
  };

  const confirmDeleteChild = async () => {
    if (!childToDelete) return;
    
    setShowDeleteChildConfirm(false);
    console.log('Delete confirmed, proceeding with deletion...');
    
    try {
      // First, delete related records to avoid foreign key constraints
      const { error: activitiesError } = await supabase
        .from('activities')
        .delete()
        .eq('subject_id', 
          supabase
            .from('subject')
            .select('id')
            .eq('student_id', childToDelete.id)
        );
      
      if (activitiesError) console.warn('Activities cleanup warning:', activitiesError);
      
      // Delete subjects
      const { error: subjectsError } = await supabase
        .from('subject')
        .delete()
        .eq('student_id', childToDelete.id);
      
      if (subjectsError) console.warn('Subjects cleanup warning:', subjectsError);
      
      // Delete the child
      const { error } = await supabase
        .from('children')
        .delete()
        .eq('id', childToDelete.id);
      
      if (error) throw error;
      
      console.log('Child deleted successfully, refreshing members list...');
      
      // Refresh members list
      const refreshed = members.filter(m => m.id !== childToDelete.id);
      setMembers(refreshed);
      
      console.log('Members list refreshed, showing success message...');
      setShowDeleteChildSuccess(true);
      setChildToDelete(null);
    } catch (e) {
      console.error('Delete child failed:', e);
      setErrorMessage(`Failed to delete ${childToDelete.name}. Please try again or contact support if the problem persists.`);
      setShowDeleteChildError(true);
      setChildToDelete(null);
    }
  };

  // Separate function for actual deletion logic
  const handleDeleteChild = async (member) => {
    try {
      console.log('Starting deletion process for:', member.name);
      
      // First, delete related records to avoid foreign key constraints
      const { error: activitiesError } = await supabase
        .from('activities')
        .delete()
        .eq('subject_id', 
          supabase
            .from('subject')
            .select('id')
            .eq('student_id', member.id)
        );
      
      if (activitiesError) console.warn('Activities cleanup warning:', activitiesError);
      
      // Delete subjects
      const { error: subjectsError } = await supabase
        .from('subject')
        .delete()
        .eq('student_id', member.id);
      
      if (subjectsError) console.warn('Subjects cleanup warning:', subjectsError);
      
      // Delete the child
      const { error } = await supabase
        .from('children')
        .delete()
        .eq('id', member.id);
      
      if (error) throw error;
      
      console.log('Child deleted successfully, refreshing members list...');
      
      // Refresh members list
      const refreshed = members.filter(m => m.id !== member.id);
      setMembers(refreshed);
      
      console.log('Members list refreshed, showing success message...');
      
      alert(`${member.name} and all their data have been permanently removed.`);
    } catch (e) {
      console.error('Delete child failed:', e);
      alert(`Failed to delete ${member.name}. Please try again or contact support if the problem persists.`);
    }
  };

  const sections = [
    { id: 'profile', label: 'My Profile', icon: 'user', description: 'Manage your personal account and app preferences' },
    { id: 'notifications', label: 'Notifications & Preferences', icon: 'bell', description: 'Customize how Learnadoodle communicates with you' },
    { id: 'subscription', label: 'Family Plan & Subscription', icon: 'creditCard', description: 'Manage your Learnadoodle plan and billing' },
    { id: 'family', label: 'Family Settings', icon: 'home', description: 'Set global preferences for your homeschool setup' },
    { id: 'members', label: 'Members', icon: 'users', description: 'Manage all members in your homeschooling household' },
    { id: 'security', label: 'Learning Privacy & Security', icon: 'shield', description: 'Keep your family\'s learning data safe' },
    { id: 'integrations', label: 'Integrations', icon: 'zap', description: 'Connect Learnadoodle with other tools' },
    { id: 'analytics', label: 'Learning Analytics', icon: 'barChart', description: 'Understand trends and progress' },
    { id: 'help', label: 'Help & Support', icon: 'help', description: 'Need assistance? We\'ve got you covered' },
  ];

  // Dark mode functionality
  useEffect(() => {
    if (isDarkMode) {
      document.body.style.backgroundColor = '#1a1a1a';
      document.body.style.color = '#ffffff';
    } else {
      document.body.style.backgroundColor = '#ffffff';
      document.body.style.color = '#37352f';
    }
  }, [isDarkMode]);

  const handleExportData = () => {
    Alert.alert(
      'Export Learning Records',
      'Your learning data will be exported as a ZIP file. This may take a few minutes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export', onPress: () => {
          // Simulate export
          setTimeout(() => {
            Alert.alert('Export Complete', 'Your learning records have been exported successfully.');
          }, 2000);
        }}
      ]
    );
  };

  const handleDeleteProfile = () => {
    Alert.alert(
      'Delete My Profile',
      'This will permanently remove your personal account. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          Alert.alert('Profile Deleted', 'Your profile has been removed.');
          onClose();
        }}
      ]
    );
  };

  const handleDeleteFamily = () => {
    Alert.alert(
      'Delete Entire Family Account',
      'This will permanently delete ALL users and records. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete All', style: 'destructive', onPress: () => {
          Alert.alert('Family Deleted', 'All family data has been permanently removed.');
          onClose();
        }}
      ]
    );
  };

  const handleSignOut = () => {
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = () => {
    setShowSignOutConfirm(false);
    if (onSignOut) {
      onSignOut();
    }
  };

  const handleInviteFamilyMember = () => {
    setShowInviteConfirm(true);
  };

  const confirmInvite = () => {
    setShowInviteConfirm(false);
    // Simulate sending invitation
    setTimeout(() => {
      setShowInviteSent(true);
    }, 1000);
  };

  const renderProfileSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>My Profile</Text>
      <Text style={styles.sectionDescription}>Manage your personal account and app preferences as a parent, guardian, or learner.</Text>
      
      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Name & Avatar</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Display Name</Text>
          <TextInput
            style={styles.textInput}
            value={profileSettings.displayName}
            onChangeText={(text) => setProfileSettings(prev => ({ ...prev, displayName: text }))}
            placeholder="Enter display name"
          />
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Profile Picture</Text>
          <TouchableOpacity style={styles.uploadButton}>
            <Icon name="user" size={16} />
            <Text style={styles.uploadButtonText}>Upload Photo</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Account Information</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Email Address</Text>
          <TextInput
            style={[styles.textInput, styles.disabledInput]}
            value={profileSettings.email}
            editable={false}
          />
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.textInput, { flex: 1 }]}
              secureTextEntry={!showPassword}
              placeholder="Enter new password"
            />
            <TouchableOpacity 
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Language & Region</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Language</Text>
          <TouchableOpacity style={styles.selectButton}>
            <Text style={styles.selectButtonText}>{profileSettings.language}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Timezone</Text>
          <TouchableOpacity style={styles.selectButton}>
            <Text style={styles.selectButtonText}>{profileSettings.timezone}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Date Format</Text>
          <TouchableOpacity style={styles.selectButton}>
            <Text style={styles.selectButtonText}>{profileSettings.dateFormat}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>First Day of Week</Text>
          <TouchableOpacity style={styles.selectButton}>
            <Text style={styles.selectButtonText}>{profileSettings.weekStart}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Appearance</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Dark Mode</Text>
            <Switch
              value={isDarkMode}
              onValueChange={setIsDarkMode}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Data Management</Text>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton} onPress={handleExportData}>
            <Icon name="download" size={16} />
            <Text style={styles.actionButtonText}>Export Learning Records</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={[styles.actionButton, styles.dangerButton]} onPress={handleDeleteProfile}>
            <Icon name="trash" size={16} />
            <Text style={[styles.actionButtonText, styles.dangerText]}>Delete My Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Account Actions</Text>
        <View style={styles.settingItem}>
          <TouchableOpacity style={[styles.actionButton, styles.dangerButton]} onPress={handleSignOut}>
            <Icon name="logOut" size={16} />
            <Text style={[styles.actionButtonText, styles.dangerText]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderNotificationsSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Notifications & Preferences</Text>
      <Text style={styles.sectionDescription}>Customize how Learnadoodle communicates with you.</Text>
      
      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Daily Reminders</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Enable Daily Reminders</Text>
            <Switch
              value={notificationSettings.dailyReminders}
              onValueChange={(value) => setNotificationSettings(prev => ({ ...prev, dailyReminders: value }))}
            />
          </View>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Lesson Reminders</Text>
            <Switch
              value={notificationSettings.lessonReminders}
              onValueChange={(value) => setNotificationSettings(prev => ({ ...prev, lessonReminders: value }))}
            />
          </View>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Progress Updates</Text>
            <Switch
              value={notificationSettings.progressUpdates}
              onValueChange={(value) => setNotificationSettings(prev => ({ ...prev, progressUpdates: value }))}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Weekly Summary</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Weekly Summary Email</Text>
            <Switch
              value={notificationSettings.weeklySummary}
              onValueChange={(value) => setNotificationSettings(prev => ({ ...prev, weeklySummary: value }))}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Push Notifications</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Enable Push Notifications</Text>
            <Switch
              value={notificationSettings.pushNotifications}
              onValueChange={(value) => setNotificationSettings(prev => ({ ...prev, pushNotifications: value }))}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Custom Alerts</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Custom Milestone Alerts</Text>
            <Switch
              value={notificationSettings.customAlerts}
              onValueChange={(value) => setNotificationSettings(prev => ({ ...prev, customAlerts: value }))}
            />
          </View>
        </View>
      </View>
    </View>
  );

  const renderSubscriptionSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Family Plan & Subscription</Text>
      <Text style={styles.sectionDescription}>Manage your Learnadoodle plan and billing information.</Text>
      
      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Current Plan</Text>
        <View style={styles.planCard}>
          <Text style={styles.planName}>{subscriptionSettings.currentPlan} Plan</Text>
          <Text style={styles.planDetails}>Family Size: {subscriptionSettings.familySize} members</Text>
          <TouchableOpacity style={styles.upgradeButton}>
            <Text style={styles.upgradeButtonText}>Upgrade Plan</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Billing</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Payment Method</Text>
          <Text style={styles.settingValue}>{subscriptionSettings.paymentMethod}</Text>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="download" size={16} />
            <Text style={styles.actionButtonText}>View Billing History</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Data Backup</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Auto Backup to Cloud</Text>
            <Switch
              value={subscriptionSettings.autoBackup}
              onValueChange={(value) => setSubscriptionSettings(prev => ({ ...prev, autoBackup: value }))}
            />
          </View>
        </View>
      </View>
    </View>
  );

  const renderFamilySection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Family Settings</Text>
      <Text style={styles.sectionDescription}>Set global preferences for your homeschool setup.</Text>
      
      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Family Information</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Family Name</Text>
          <TextInput
            style={styles.textInput}
            value={familySettings.familyName}
            onChangeText={(text) => setFamilySettings(prev => ({ ...prev, familyName: text }))}
            placeholder="Enter family name"
          />
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>School Year</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Start Date</Text>
          <TextInput
            style={styles.textInput}
            value={familySettings.schoolYearStart}
            onChangeText={(text) => setFamilySettings(prev => ({ ...prev, schoolYearStart: text }))}
            placeholder="YYYY-MM-DD"
          />
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>End Date</Text>
          <TextInput
            style={styles.textInput}
            value={familySettings.schoolYearEnd}
            onChangeText={(text) => setFamilySettings(prev => ({ ...prev, schoolYearEnd: text }))}
            placeholder="YYYY-MM-DD"
          />
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Learning Schedule</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Daily Learning Hours</Text>
          <TextInput
            style={styles.textInput}
            value={familySettings.dailyLearningHours.toString()}
            onChangeText={(text) => setFamilySettings(prev => ({ ...prev, dailyLearningHours: parseInt(text) || 0 }))}
            keyboardType="numeric"
            placeholder="Hours per day"
          />
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Learning Timezone</Text>
          <TouchableOpacity style={styles.selectButton}>
            <Text style={styles.selectButtonText}>{familySettings.learningTimezone}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Portfolio & Compliance</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Local Compliance Mode</Text>
            <Switch
              value={familySettings.localCompliance}
              onValueChange={(value) => setFamilySettings(prev => ({ ...prev, localCompliance: value }))}
            />
          </View>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Auto Portfolio Exports</Text>
            <Switch
              value={familySettings.portfolioExports}
              onValueChange={(value) => setFamilySettings(prev => ({ ...prev, portfolioExports: value }))}
            />
          </View>
        </View>
      </View>
    </View>
  );

  const renderMembersSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Members</Text>
      <Text style={styles.sectionDescription}>Manage all members in your homeschooling household.</Text>
      
      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Current Members</Text>
        {membersLoading && (
          <Text style={{ color: '#787774', marginBottom: 8 }}>Loading members…</Text>
        )}
        {!membersLoading && members.length === 0 && (
          <Text style={{ color: '#787774', marginBottom: 8 }}>No members yet.</Text>
        )}
        {members.map((member) => (
          <View key={member.id} style={styles.memberCard}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.memberRole}>{member.role}</Text>
              {member.email && <Text style={styles.memberEmail}>{member.email}</Text>}
            </View>
            <View style={styles.memberActions}>
              {member.isChild && (
                <>
                  <TouchableOpacity style={styles.memberActionButton}>
                    <Text style={styles.memberActionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.memberActionButton, styles.dangerButton]}
                    onPress={() => {
                      console.log('Delete button pressed for member:', member);
                      handleRemoveMember(member);
                    }}
                    activeOpacity={0.7}
                  >
                    <Icon name="trash" size={14} color="#dc2626" />
                    <Text style={[styles.memberActionText, styles.dangerText]}>Delete</Text>
                  </TouchableOpacity>
                </>
              )}
              {!member.isChild && (
                <Text style={styles.memberRole}>Primary Account</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Add New Member</Text>
        <TouchableOpacity style={styles.addMemberButton}>
          <Icon name="plus" size={16} />
          <Text style={styles.addMemberButtonText}>Add Family Member</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Delete Students</Text>
        <Text style={styles.settingDescription}>
          Students can be deleted from the member list above. This will permanently remove all their data including learning records, progress, and calendar entries.
        </Text>
        <View style={styles.warningBox}>
          <Icon name="shield" size={16} color="#dc2626" />
          <Text style={styles.warningText}>
            Warning: Deleting a student is permanent and cannot be undone. All associated data will be lost.
          </Text>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Invitations</Text>
        <TouchableOpacity style={styles.actionButton} onPress={handleInviteFamilyMember}>
          <Icon name="mail" size={16} />
          <Text style={styles.actionButtonText}>Invite Family & Helpers</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSecuritySection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Learning Privacy & Security</Text>
      <Text style={styles.sectionDescription}>Keep your family's learning data safe and secure.</Text>
      
      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Account Security</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Two-Factor Authentication</Text>
            <Switch
              value={securitySettings.twoFactorAuth}
              onValueChange={(value) => setSecuritySettings(prev => ({ ...prev, twoFactorAuth: value }))}
            />
          </View>
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Session Timeout (minutes)</Text>
          <TouchableOpacity style={styles.selectButton}>
            <Text style={styles.selectButtonText}>{securitySettings.sessionTimeout}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Login Notifications</Text>
            <Switch
              value={securitySettings.loginNotifications}
              onValueChange={(value) => setSecuritySettings(prev => ({ ...prev, loginNotifications: value }))}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Parental Controls</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Enable Parental Controls</Text>
            <Switch
              value={securitySettings.parentalControls}
              onValueChange={(value) => setSecuritySettings(prev => ({ ...prev, parentalControls: value }))}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Data Management</Text>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="download" size={16} />
            <Text style={styles.actionButtonText}>Backup Data</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="smartphone" size={16} />
            <Text style={styles.actionButtonText}>Device Management</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="eye" size={16} />
            <Text style={styles.actionButtonText}>Session History</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Danger Zone</Text>
        <View style={styles.settingItem}>
          <TouchableOpacity style={[styles.actionButton, styles.dangerButton]} onPress={handleDeleteFamily}>
            <Icon name="trash" size={16} />
            <Text style={[styles.actionButtonText, styles.dangerText]}>Delete Entire Family Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderIntegrationsSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Integrations</Text>
      <Text style={styles.sectionDescription}>Connect Learnadoodle with other tools.</Text>
      
      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Calendar Apps</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Google Calendar</Text>
            <Switch
              value={integrationSettings.googleCalendar}
              onValueChange={(value) => setIntegrationSettings(prev => ({ ...prev, googleCalendar: value }))}
            />
          </View>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Apple Calendar</Text>
            <Switch
              value={integrationSettings.appleCalendar}
              onValueChange={(value) => setIntegrationSettings(prev => ({ ...prev, appleCalendar: value }))}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Learning Platforms</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Khan Academy</Text>
            <Switch
              value={integrationSettings.khanAcademy}
              onValueChange={(value) => setIntegrationSettings(prev => ({ ...prev, khanAcademy: value }))}
            />
          </View>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Outschool</Text>
            <Switch
              value={integrationSettings.outschool}
              onValueChange={(value) => setIntegrationSettings(prev => ({ ...prev, outschool: value }))}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Portfolio Tools</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Google Drive</Text>
            <Switch
              value={integrationSettings.googleDrive}
              onValueChange={(value) => setIntegrationSettings(prev => ({ ...prev, googleDrive: value }))}
            />
          </View>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Dropbox</Text>
            <Switch
              value={integrationSettings.dropbox}
              onValueChange={(value) => setIntegrationSettings(prev => ({ ...prev, dropbox: value }))}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Advanced</Text>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="externalLink" size={16} />
            <Text style={styles.actionButtonText}>API Access</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="settings" size={16} />
            <Text style={styles.actionButtonText}>Developer Access</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderAnalyticsSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Learning Analytics</Text>
      <Text style={styles.sectionDescription}>Understand trends and progress across your homeschool.</Text>
      
      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Reports & Insights</Text>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="barChart" size={16} />
            <Text style={styles.actionButtonText}>Learning Logs Overview</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="barChart" size={16} />
            <Text style={styles.actionButtonText}>Goal Tracking</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="barChart" size={16} />
            <Text style={styles.actionButtonText}>Subject Time Breakdown</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="barChart" size={16} />
            <Text style={styles.actionButtonText}>Strengths & Struggles</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="barChart" size={16} />
            <Text style={styles.actionButtonText}>Top Lessons</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="barChart" size={16} />
            <Text style={styles.actionButtonText}>Student Reports</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderHelpSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Help & Support</Text>
      <Text style={styles.sectionDescription}>Need assistance? We've got you covered.</Text>
      
      <View style={styles.settingGroup}>
        <Text style={styles.groupTitle}>Support Options</Text>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="help" size={16} />
            <Text style={styles.actionButtonText}>Learnadoodle Help Center</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="mail" size={16} />
            <Text style={styles.actionButtonText}>Chat with Support</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="calendar" size={16} />
            <Text style={styles.actionButtonText}>Schedule a Call</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="help" size={16} />
            <Text style={styles.actionButtonText}>Report a Bug</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="zap" size={16} />
            <Text style={styles.actionButtonText}>App Status</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingItem}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="users" size={16} />
            <Text style={styles.actionButtonText}>Community Forum</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'profile':
        return renderProfileSection();
      case 'notifications':
        return renderNotificationsSection();
      case 'subscription':
        return renderSubscriptionSection();
      case 'family':
        return renderFamilySection();
      case 'members':
        return renderMembersSection();
      case 'security':
        return renderSecuritySection();
      case 'integrations':
        return renderIntegrationsSection();
      case 'analytics':
        return renderAnalyticsSection();
      case 'help':
        return renderHelpSection();
      default:
        return renderProfileSection();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Settings</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Icon name="x" size={20} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <View style={styles.sidebar}>
              {sections.map((section) => (
                <TouchableOpacity
                  key={section.id}
                  style={[
                    styles.sidebarItem,
                    activeSection === section.id && styles.activeSidebarItem
                  ]}
                  onPress={() => setActiveSection(section.id)}
                >
                  <Icon name={section.icon} size={16} />
                  <View style={styles.sidebarTextContainer}>
                    <Text style={[
                      styles.sidebarLabel,
                      activeSection === section.id && styles.activeSidebarLabel
                    ]}>
                      {section.label}
                    </Text>
                    <Text style={styles.sidebarDescription}>
                      {section.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.content}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {renderSectionContent()}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>

      {/* Sign Out Confirmation Modal */}
      <Modal
        visible={showSignOutConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSignOutConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Sign Out</Text>
            <Text style={styles.confirmModalMessage}>
              Are you sure you want to sign out?
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={() => setShowSignOutConfirm(false)}
              >
                <Text style={styles.confirmModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalButtonDanger]}
                onPress={confirmSignOut}
              >
                <Text style={[styles.confirmModalButtonText, styles.confirmModalButtonTextDanger]}>
                  Sign Out
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Confirmation Modal */}
      <Modal
        visible={showInviteConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowInviteConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Invite Family Member</Text>
            <Text style={styles.confirmModalMessage}>
              Send an invitation to join your learning workspace?
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={() => setShowInviteConfirm(false)}
              >
                <Text style={styles.confirmModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={confirmInvite}
              >
                <Text style={styles.confirmModalButtonText}>Send Invite</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Sent Modal */}
      <Modal
        visible={showInviteSent}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowInviteSent(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Invitation Sent</Text>
            <Text style={styles.confirmModalMessage}>
              The invitation has been sent successfully.
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={() => setShowInviteSent(false)}
              >
                <Text style={styles.confirmModalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Child Confirmation Modal */}
      <Modal
        visible={showDeleteChildConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteChildConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Delete Student</Text>
            <Text style={styles.confirmModalMessage}>
              {childToDelete ? `Are you sure you want to delete ${childToDelete.name}?\n\nThis will permanently remove:\n• Their profile and personal information\n• All learning records and progress\n• Calendar entries and activities\n• Subject assignments and notes\n\nThis action cannot be undone.` : ''}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={() => setShowDeleteChildConfirm(false)}
              >
                <Text style={styles.confirmModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalButtonDanger]}
                onPress={confirmDeleteChild}
              >
                <Text style={[styles.confirmModalButtonText, styles.confirmModalButtonTextDanger]}>
                  Delete Permanently
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Child Success Modal */}
      <Modal
        visible={showDeleteChildSuccess}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteChildSuccess(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Student Deleted</Text>
            <Text style={styles.confirmModalMessage}>
              {childToDelete ? `${childToDelete.name} and all their data have been permanently removed.` : ''}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={() => setShowDeleteChildSuccess(false)}
              >
                <Text style={styles.confirmModalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Child Error Modal */}
      <Modal
        visible={showDeleteChildError}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteChildError(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Error</Text>
            <Text style={styles.confirmModalMessage}>
              {errorMessage}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={() => setShowDeleteChildError(false)}
              >
                <Text style={styles.confirmModalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 1000,
    height: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 280,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#e1e1e1',
    paddingTop: 16,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  activeSidebarItem: {
    backgroundColor: '#f1f3f4',
    borderRightWidth: 2,
    borderRightColor: '#e1e1e1',
  },
  sidebarTextContainer: {
    flex: 1,
  },
  sidebarLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
    marginBottom: 2,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  activeSidebarLabel: {
    fontWeight: '600',
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  sidebarDescription: {
    fontSize: 12,
    color: '#787774',
    lineHeight: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#787774',
    marginBottom: 24,
    lineHeight: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  settingGroup: {
    marginBottom: 32,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  settingItem: {
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  settingValue: {
    fontSize: 14,
    color: '#787774',
    fontStyle: 'italic',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  disabledInput: {
    backgroundColor: '#f6f4ed',
    color: '#787774',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyeButton: {
    padding: 8,
    backgroundColor: '#f1f3f4',
    borderRadius: 4,
  },
  selectButton: {
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f3f4',
  },
  selectButtonText: {
    fontSize: 14,
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f3f4',
    alignSelf: 'flex-start',
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f3f4',
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  dangerButton: {
    borderColor: '#dc3545',
    backgroundColor: '#fff5f5',
  },
  dangerText: {
    color: '#dc3545',
  },
  planCard: {
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  planName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  planDetails: {
    fontSize: 14,
    color: '#787774',
    marginBottom: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  upgradeButton: {
    backgroundColor: '#38B6FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  memberCard: {
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#f8f9fa',
    marginBottom: 12,
  },
  memberInfo: {
    marginBottom: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  memberRole: {
    fontSize: 14,
    color: '#787774',
    marginBottom: 2,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  memberEmail: {
    fontSize: 12,
    color: '#787774',
    fontStyle: 'italic',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  memberActions: {
    flexDirection: 'row',
    gap: 8,
  },
  memberActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#f1f3f4',
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  memberActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#37352f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#38B6FF',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#38B6FF',
    alignSelf: 'flex-start',
  },
  addMemberButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 6,
    padding: 12,
    marginTop: 8,
  },
  warningText: {
    fontSize: 12,
    color: '#dc2626',
    marginLeft: 8,
    flex: 1,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  settingDescription: {
    fontSize: 14,
    color: '#787774',
    marginBottom: 8,
    lineHeight: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  // Confirmation Modal Styles
  confirmModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  confirmModalMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  confirmModalButton: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 100,
    alignItems: 'center',
  },
  confirmModalButtonDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  confirmModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  confirmModalButtonTextDanger: {
    color: '#dc2626',
  },
}); 