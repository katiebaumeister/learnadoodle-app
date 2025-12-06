/**
 * Data Ownership Panel Component
 * Displays data ownership information and export/delete options
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Download, Trash2, Database, Shield, Info, FileText, Archive } from 'lucide-react';
import { colors } from '../../theme/colors';
import { downloadStudentProfile, downloadStudentProfileZip } from '../../lib/services/studentProfileExport';
import { supabase } from '../../lib/supabase';

export default function DataOwnershipPanel({ childId, childName, familyId }) {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExportJSON = async () => {
    setExporting(true);
    try {
      await downloadStudentProfile(childId, 'json');
      Alert.alert('Success', 'Profile exported as JSON');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to export profile');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      await downloadStudentProfile(childId, 'csv');
      Alert.alert('Success', 'Profile exported as CSV');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to export profile');
    } finally {
      setExporting(false);
    }
  };

  const handleExportZIP = async () => {
    setExporting(true);
    try {
      await downloadStudentProfileZip(childId);
      Alert.alert('Success', 'Complete profile exported as ZIP');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to export ZIP. Make sure JSZip is installed or use individual exports.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteData = () => {
    Alert.alert(
      'Delete All Data',
      `This will permanently delete ALL data for ${childName}, including:\n\n• All attendance records\n• All assignments and events\n• All portfolio items\n• All grades and mastery records\n• All documents\n• All notes and materials\n• All skills and progress data\n\nThis action CANNOT be undone.\n\nAre you absolutely sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            // Second confirmation
            Alert.alert(
              'Final Confirmation',
              `Type "${childName}" to confirm permanent deletion:`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      // Call delete function
                      const { data, error } = await supabase.rpc('delete_child_permanently', {
                        _family: familyId,
                        _child: childId,
                        _confirm_name: childName
                      });

                      if (error || !data?.ok) {
                        const reason = data?.reason || 'unknown';
                        Alert.alert(
                          'Error',
                          reason === 'name_mismatch' ? 'Name does not match' :
                          reason === 'forbidden' ? 'You do not have permission' :
                          'Failed to delete data'
                        );
                        return;
                      }

                      Alert.alert('Deleted', 'All data has been permanently deleted');
                    } catch (error) {
                      Alert.alert('Error', error.message || 'Failed to delete data');
                    } finally {
                      setDeleting(false);
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Ownership Message */}
      <View style={styles.section}>
        <View style={styles.header}>
          <Shield size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Your Data, Your Control</Text>
        </View>
        <View style={styles.messageBox}>
          <Info size={20} color={colors.blueBold} />
          <View style={styles.messageContent}>
            <Text style={styles.messageTitle}>You Own Your Data</Text>
            <Text style={styles.messageText}>
              All data associated with {childName} belongs to you. You can export it at any time, 
              delete it when you choose, and take it with you. We believe in complete data ownership 
              and transparency.
            </Text>
          </View>
        </View>
      </View>

      {/* Export Options */}
      <View style={styles.section}>
        <View style={styles.header}>
          <Download size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Export Your Data</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Download all data for {childName} in various formats. Exports include everything: 
          attendance, assignments, portfolio, grades, documents, skills, and more.
        </Text>

        <View style={styles.exportGrid}>
          <TouchableOpacity 
            style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
            onPress={handleExportJSON}
            disabled={exporting}
          >
            <FileText size={20} color={colors.primary} />
            <Text style={styles.exportButtonText}>Export JSON</Text>
            <Text style={styles.exportButtonSubtext}>Structured data format</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
            onPress={handleExportCSV}
            disabled={exporting}
          >
            <FileText size={20} color={colors.primary} />
            <Text style={styles.exportButtonText}>Export CSV</Text>
            <Text style={styles.exportButtonSubtext}>Spreadsheet format</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.exportButton, styles.exportButtonPrimary, exporting && styles.exportButtonDisabled]}
            onPress={handleExportZIP}
            disabled={exporting}
          >
            <Archive size={20} color={colors.card} />
            <Text style={[styles.exportButtonText, styles.exportButtonTextPrimary]}>Export Complete ZIP</Text>
            <Text style={[styles.exportButtonSubtext, styles.exportButtonSubtextPrimary]}>
              All data + CSV files
            </Text>
          </TouchableOpacity>
        </View>

        {exporting && (
          <Text style={styles.statusText}>Exporting data...</Text>
        )}
      </View>

      {/* Data Deletion */}
      <View style={styles.section}>
        <View style={styles.header}>
          <Trash2 size={24} color={colors.redBold} />
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Delete All Data</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Permanently delete all data for {childName}. This includes everything: attendance, 
          assignments, portfolio items, grades, documents, and all other records. This action 
          cannot be undone.
        </Text>

        <TouchableOpacity 
          style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
          onPress={handleDeleteData}
          disabled={deleting}
        >
          <Trash2 size={20} color={colors.card} />
          <Text style={styles.deleteButtonText}>
            {deleting ? 'Deleting...' : 'Delete All Data'}
          </Text>
        </TouchableOpacity>

        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Before deleting, we recommend exporting your data first so you have a backup.
          </Text>
        </View>
      </View>

      {/* Transparency Info */}
      <View style={styles.section}>
        <View style={styles.header}>
          <Database size={24} color={colors.muted} />
          <Text style={styles.sectionTitle}>Data Transparency</Text>
        </View>
        <View style={styles.infoList}>
          <View style={styles.infoItem}>
            <View style={styles.infoDot} />
            <Text style={styles.infoText}>
              Your data is stored securely in Supabase cloud storage
            </Text>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoDot} />
            <Text style={styles.infoText}>
              You can export all data at any time in multiple formats
            </Text>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoDot} />
            <Text style={styles.infoText}>
              You can delete all data permanently when you choose
            </Text>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoDot} />
            <Text style={styles.infoText}>
              We never sell or share your data with third parties
            </Text>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoDot} />
            <Text style={styles.infoText}>
              Your data is encrypted in transit and at rest
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  section: {
    padding: 20,
    backgroundColor: colors.card,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  dangerTitle: {
    color: colors.redBold,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 16,
  },
  messageBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: colors.blueSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.blueBold,
  },
  messageContent: {
    flex: 1,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  exportGrid: {
    gap: 12,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exportButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  exportButtonTextPrimary: {
    color: colors.card,
  },
  exportButtonSubtext: {
    fontSize: 12,
    color: colors.muted,
  },
  exportButtonSubtextPrimary: {
    color: colors.card,
    opacity: 0.9,
  },
  statusText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: colors.redBold,
    borderRadius: 12,
    marginBottom: 12,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.card,
  },
  warningBox: {
    padding: 12,
    backgroundColor: colors.orangeSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.orangeBold,
  },
  warningText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  infoList: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});

