import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  Image,
} from 'react-native';

export default function StudentDetailsModal({ visible, student, onClose, onDelete }) {
  if (!student || !student.child) {
    return null;
  }
  
  // Avatar sources - static mapping for React Native
  const avatarSources = {
    prof1: require('../assets/prof1.png'),
    prof2: require('../assets/prof2.png'),
    prof3: require('../assets/prof3.png'),
    prof4: require('../assets/prof4.png'),
    prof5: require('../assets/prof5.png'),
    prof6: require('../assets/prof6.png'),
    prof7: require('../assets/prof7.png'),
    prof8: require('../assets/prof8.png'),
    prof9: require('../assets/prof9.png'),
    prof10: require('../assets/prof10.png'),
  };

  // Helper function to safely get avatar source
  const getAvatarSource = (avatarKey) => {
    try {
      return avatarSources[avatarKey] || avatarSources.prof1;
    } catch (error) {
      console.warn('Avatar source error:', error);
      return avatarSources.prof1;
    }
  };
  
  // Extract child and tracks from the student data structure
  const child = student.child;
  const tracks = student.tracks;
  
  // Safety check: if child has invalid data, close the modal after render
  useEffect(() => {
    if (visible && (!child || !child.first_name || child.first_name === null || child.first_name === '')) {
      console.log('StudentDetailsModal: Invalid child data, closing modal', child);
      if (onClose) onClose();
    }
  }, [visible, child, onClose]);
  
  // Don't render if child has invalid data
  if (!child || !child.first_name || child.first_name === null || child.first_name === '') {
    return null;
  }
  
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
            <Text style={styles.modalTitle}>Student Details</Text>
            <TouchableOpacity style={styles.modalClose} onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Student Info */}
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <View style={styles.studentInfo}>
              <View style={styles.studentAvatar}>
                <Image
                  source={getAvatarSource(child.avatar)}
                  style={styles.avatarImage}
                  resizeMode="contain"
                />
              </View>
              
                                <Text style={styles.studentName}>{child.first_name}</Text>
              <Text style={styles.studentGrade}>Grade {child.grade}</Text>
              <Text style={styles.studentAge}>{child.age} years old</Text>
            </View>

            {/* Academic Progress */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Academic Progress</Text>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>Current Grade:</Text>
                <Text style={styles.progressValue}>{child.grade}</Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>Age:</Text>
                <Text style={styles.progressValue}>{child.age} years</Text>
              </View>
            </View>

            {/* Learning Tracks */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Learning Tracks</Text>
              {tracks && tracks.length > 0 ? (
                tracks.map((track, index) => (
                  <View key={index} style={styles.trackItem}>
                    <Text style={styles.trackName}>{track.name}</Text>
                    <Text style={styles.trackSchedule}>{track.class_schedule}</Text>
                    {track.roadmap && (
                      <View style={styles.roadmapInfo}>
                        <Text style={styles.roadmapLabel}>Current Unit:</Text>
                        <Text style={styles.roadmapContent}>
                          {typeof track.roadmap === 'string' 
                            ? track.roadmap 
                            : track.roadmap.units?.[0]?.name || 'Unit in progress'
                          }
                        </Text>
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.noTracksText}>No learning tracks assigned yet</Text>
              )}
            </View>

            {/* Additional Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Additional Information</Text>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Student ID:</Text>
                <Text style={styles.infoValue}>{child.id}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Family ID:</Text>
                <Text style={styles.infoValue}>{child.family_id || 'N/A'}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity 
              style={styles.deleteButton} 
              onPress={() => {
                console.log('Delete button clicked for child:', child.first_name);
                // Web-compatible confirmation
                if (typeof window !== 'undefined' && window.confirm) {
                  const confirmed = window.confirm(
                    `Are you sure you want to delete ${child.first_name}? This action cannot be undone.`
                  );
                  if (confirmed) {
                    console.log('Delete confirmed for child:', child.first_name);
                    if (onDelete) {
                      onDelete(child.id);
                    }
                    onClose();
                  }
                } else {
                  // Fallback to Alert for mobile
                  Alert.alert(
                    'Delete Child',
                    `Are you sure you want to delete ${child.first_name}? This action cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Delete', 
                        style: 'destructive',
                        onPress: () => {
                          console.log('Delete confirmed for child:', child.first_name);
                          if (onDelete) {
                            onDelete(child.id);
                          }
                          onClose();
                        }
                      }
                    ]
                  );
                }
              }}
            >
              <Text style={styles.deleteButtonText}>Delete Child</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.closeModalButton} onPress={onClose}>
              <Text style={styles.closeModalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    // Web-specific styles
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    zIndex: 10000,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  modalClose: {
    padding: 5,
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',
  },
  modalBody: {
    flex: 1,
    padding: 20,
  },
  studentInfo: {
    alignItems: 'center',
    marginBottom: 30,
  },
  studentAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  studentName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 5,
  },
  studentGrade: {
    fontSize: 18,
    color: '#38B6FF',
    fontWeight: '600',
    marginBottom: 5,
  },
  studentAge: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  progressItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: '#4a5568',
    fontWeight: '500',
  },
  progressValue: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '600',
  },
  trackItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#38B6FF',
  },
  trackName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 5,
  },
  trackSchedule: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  roadmapInfo: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  roadmapLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  roadmapContent: {
    fontSize: 13,
    color: '#38B6FF',
    fontStyle: 'italic',
  },
  noTracksText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#4a5568',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  deleteButton: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 120,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  closeModalButton: {
    backgroundColor: '#38B6FF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 30,
    minWidth: 120,
    alignItems: 'center',
  },
  closeModalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
