import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { 
  FileText, 
  Activity, 
  CheckSquare, 
  Baby,
  ArrowLeft 
} from 'lucide-react';

export default function AddOptions({ onBack, onAddActivity, onAddAttendance, onAddChild }) {
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [comingSoonMessage, setComingSoonMessage] = useState('');

  const handleComingSoon = (message) => {
    setComingSoonMessage(message);
    setShowComingSoonModal(true);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <ArrowLeft size={24} color="#38B6FF" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add New Content</Text>
          <View style={styles.placeholder} />
        </View>

        <Text style={styles.subtitle}>
          Choose what you'd like to add to your learning environment
        </Text>

        {/* Add Options Grid */}
        <View style={styles.optionsGrid}>
          {/* Add Activity */}
          <TouchableOpacity style={styles.optionCard} onPress={onAddActivity}>
            <View style={styles.iconContainer}>
              <Activity size={32} color="#10B981" />
            </View>
            <Text style={styles.optionTitle}>Add Activity</Text>
            <Text style={styles.optionDescription}>
              Create new learning activities and assignments
            </Text>
          </TouchableOpacity>

          {/* Add Attendance */}
          <TouchableOpacity style={styles.optionCard} onPress={() => handleComingSoon('Attendance tracking feature coming soon!')}>
            <View style={styles.iconContainer}>
              <CheckSquare size={32} color="#F59E0B" />
            </View>
            <Text style={styles.optionTitle}>Add Attendance</Text>
            <Text style={styles.optionDescription}>
              Track daily attendance and participation
            </Text>
          </TouchableOpacity>

          {/* Add Child */}
          <TouchableOpacity style={styles.optionCard} onPress={onAddChild}>
            <View style={styles.iconContainer}>
              <Baby size={32} color="#8B5CF6" />
            </View>
            <Text style={styles.optionTitle}>Add Child</Text>
            <Text style={styles.optionDescription}>
              Add a new child to your family learning group
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={styles.quickActionsTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity 
              style={styles.quickActionButton}
              onPress={() => handleComingSoon('Import from file feature coming soon!')}
            >
              <Text style={styles.quickActionText}>Import from File</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.quickActionButton}
              onPress={() => handleComingSoon('Copy from template feature coming soon!')}
            >
              <Text style={styles.quickActionText}>Copy from Template</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.quickActionButton}
              onPress={() => handleComingSoon('AI-generated content feature coming soon!')}
            >
              <Text style={styles.quickActionText}>AI-Generated Content</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Coming Soon Modal */}
      <Modal
        visible={showComingSoonModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowComingSoonModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Coming Soon!</Text>
            <Text style={styles.modalMessage}>{comingSoonMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowComingSoonModal(false)}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#38B6FF',
    fontWeight: '500',
    marginLeft: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    flex: 1,
  },
  placeholder: {
    width: 60,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 40,
  },
  optionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '48%',
    minHeight: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  quickActions: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quickActionsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionButton: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quickActionText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
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
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  modalButton: {
    backgroundColor: '#38B6FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
