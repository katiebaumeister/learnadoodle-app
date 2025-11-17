import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, Users, Settings, User, Link2, Info, X } from 'lucide-react';
import ProfilePanel from './ProfilePanel';
import FamilyPanel from './FamilyPanel';
import TutorsAccessPanel from './TutorsAccessPanel';
import IntegrationsSettings from './IntegrationsSettings';
import AboutPanel from './AboutPanel';

const sections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'family', label: 'Family & Members', icon: Users },
  { id: 'tutors', label: 'Invite Members', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'about', label: 'About', icon: Info },
];

export default function SettingsModal({ visible, onClose, user }) {
  const { signOut } = useAuth();
  const [activeSection, setActiveSection] = useState('profile');
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfilePanel user={user} />;
      case 'family':
        return <FamilyPanel user={user} />;
      case 'tutors':
        return <TutorsAccessPanel user={user} />;
      case 'integrations':
        return <IntegrationsSettings user={user} />;
      case 'about':
        return <AboutPanel />;
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.logoCircle} />
              <View>
                <Text style={styles.brandText}>LEARNADOODLE</Text>
                <Text style={styles.modalTitle}>Settings</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={onClose}>
              <X size={20} color="#666666" />
            </TouchableOpacity>
          </View>

          {/* Main Content */}
          <View style={styles.mainContent}>
            {/* Left Sidebar */}
            <View style={styles.sidebar}>
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <TouchableOpacity
                    key={section.id}
                    style={[
                      styles.sidebarItem,
                      isActive && styles.sidebarItemActive,
                    ]}
                    onPress={() => setActiveSection(section.id)}
                  >
                    <Icon size={16} color={isActive ? '#111827' : '#6b7280'} />
                    <Text
                      style={[
                        styles.sidebarItemText,
                        isActive && styles.sidebarItemTextActive,
                      ]}
                    >
                      {section.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Right Content Panel */}
            <ScrollView style={styles.contentPanel} contentContainerStyle={styles.contentPanelContent}>
              {renderContent()}
            </ScrollView>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              You're signed in. Manage your account and integrations here.
            </Text>
            <TouchableOpacity
              style={[styles.logoutButton, loggingOut && styles.logoutButtonDisabled]}
              onPress={handleLogout}
              disabled={loggingOut}
            >
              <LogOut size={14} color="#dc2626" />
              <Text style={styles.logoutButtonText}>
                {loggingOut ? 'Logging out…' : 'Log out'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxWidth: 800,
    width: '90%',
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  modalHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
  },
  brandText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    flexDirection: 'row',
    minHeight: 400,
    flex: 1,
  },
  sidebar: {
    width: 160,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 8,
    gap: 4,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  sidebarItemActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sidebarItemText: {
    fontSize: 12,
    color: '#6b7280',
  },
  sidebarItemTextActive: {
    color: '#111827',
    fontWeight: '500',
  },
  contentPanel: {
    flex: 1,
  },
  contentPanelContent: {
    padding: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 11,
    color: '#6b7280',
    flex: 1,
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
  logoutButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#dc2626',
  },
});

