/**
 * Weekly Overview Email Modal
 * Configure and send weekly overview emails
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Switch } from 'react-native';
import { X, Mail, Send, Eye, CheckCircle, AlertCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { sendWeeklyOverviewEmail, previewWeeklyOverviewEmail, getEmailPreferences, updateEmailPreferences } from '../../lib/services/emailClient';

export default function WeeklyOverviewEmailModal({
  visible,
  onClose,
  familyId,
  childIds = [],
  weekStart,
  children = [],
}) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [recipientEmails, setRecipientEmails] = useState('');
  const [includeProgress, setIncludeProgress] = useState(true);
  const [includeSchedule, setIncludeSchedule] = useState(true);
  const [includeRecommendations, setIncludeRecommendations] = useState(true);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [preferences, setPreferences] = useState(null);

  useEffect(() => {
    if (visible && familyId) {
      loadPreferences();
    }
  }, [visible, familyId]);

  const loadPreferences = async () => {
    const result = await getEmailPreferences(familyId);
    if (result.success && result.data) {
      setPreferences(result.data);
      setRecipientEmails(result.data.recipient_emails?.join(', ') || '');
      setIncludeProgress(result.data.include_progress !== false);
      setIncludeSchedule(result.data.include_schedule !== false);
      setIncludeRecommendations(result.data.include_recommendations !== false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setError(null);
    try {
      const emails = recipientEmails.split(',').map(e => e.trim()).filter(Boolean);
      const result = await previewWeeklyOverviewEmail({
        familyId,
        childIds,
        weekStart,
        includeProgress,
        includeSchedule,
        includeRecommendations,
      });

      if (result.success) {
        setPreviewHtml(result.html);
      } else {
        setError(result.error || 'Failed to generate preview');
      }
    } catch (err) {
      console.error('[WeeklyOverviewEmailModal] Error:', err);
      setError(err.message || 'Failed to generate preview');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSend = async () => {
    const emails = recipientEmails.split(',').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      setError('Please enter at least one recipient email address');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(false);

    try {
      // Save preferences
      await updateEmailPreferences(familyId, {
        recipient_emails: emails,
        include_progress: includeProgress,
        include_schedule: includeSchedule,
        include_recommendations: includeRecommendations,
      });

      // Send email
      const result = await sendWeeklyOverviewEmail({
        familyId,
        childIds,
        weekStart,
        recipientEmails: emails,
        includeProgress,
        includeSchedule,
        includeRecommendations,
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
        }, 2000);
      } else {
        setError(result.error || 'Failed to send email');
      }
    } catch (err) {
      console.error('[WeeklyOverviewEmailModal] Error:', err);
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const formatWeekRange = () => {
    if (!weekStart) return '';
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Mail size={20} color={colors.accent || '#3b82f6'} />
              <Text style={styles.title}>Weekly Overview Email</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {previewHtml ? (
            <View style={styles.previewContainer}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>Email Preview</Text>
                <TouchableOpacity
                  onPress={() => setPreviewHtml(null)}
                  style={styles.backButton}
                >
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.previewContent}>
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </ScrollView>
            </View>
          ) : (
            <ScrollView style={styles.content}>
              {success ? (
                <View style={styles.successContainer}>
                  <CheckCircle size={48} color={colors.greenBold || '#10b981'} />
                  <Text style={styles.successText}>Email sent successfully!</Text>
                </View>
              ) : (
                <>
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Week</Text>
                    <Text style={styles.weekRange}>{formatWeekRange()}</Text>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recipients</Text>
                    <TextInput
                      style={styles.emailInput}
                      placeholder="email1@example.com, email2@example.com"
                      placeholderTextColor="#9ca3af"
                      value={recipientEmails}
                      onChangeText={setRecipientEmails}
                      multiline
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Text style={styles.helpText}>
                      Enter email addresses separated by commas
                    </Text>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Content Options</Text>
                    
                    <View style={styles.optionRow}>
                      <View style={styles.optionContent}>
                        <Text style={styles.optionLabel}>Include Progress Summary</Text>
                        <Text style={styles.optionDescription}>
                          Weekly completion rates and time spent
                        </Text>
                      </View>
                      <Switch
                        value={includeProgress}
                        onValueChange={setIncludeProgress}
                        trackColor={{ false: '#d1d5db', true: colors.accent || '#3b82f6' }}
                        thumbColor="#ffffff"
                      />
                    </View>

                    <View style={styles.optionRow}>
                      <View style={styles.optionContent}>
                        <Text style={styles.optionLabel}>Include Schedule</Text>
                        <Text style={styles.optionDescription}>
                          Upcoming week's schedule overview
                        </Text>
                      </View>
                      <Switch
                        value={includeSchedule}
                        onValueChange={setIncludeSchedule}
                        trackColor={{ false: '#d1d5db', true: colors.accent || '#3b82f6' }}
                        thumbColor="#ffffff"
                      />
                    </View>

                    <View style={styles.optionRow}>
                      <View style={styles.optionContent}>
                        <Text style={styles.optionLabel}>Include Recommendations</Text>
                        <Text style={styles.optionDescription}>
                          AI-generated suggestions and insights
                        </Text>
                      </View>
                      <Switch
                        value={includeRecommendations}
                        onValueChange={setIncludeRecommendations}
                        trackColor={{ false: '#d1d5db', true: colors.accent || '#3b82f6' }}
                        thumbColor="#ffffff"
                      />
                    </View>
                  </View>

                  {error && (
                    <View style={styles.errorContainer}>
                      <AlertCircle size={20} color={colors.redBold || '#dc2626'} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {!previewHtml && !success && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.previewButton}
                onPress={handlePreview}
                disabled={loading || previewing}
              >
                {previewing ? (
                  <ActivityIndicator size="small" color={colors.accent || '#3b82f6'} />
                ) : (
                  <>
                    <Eye size={16} color={colors.accent || '#3b82f6'} />
                    <Text style={styles.previewButtonText}>Preview</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={loading || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Send size={16} color="#ffffff" />
                    <Text style={styles.sendButtonText}>Send Email</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text || '#111827',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 12,
  },
  weekRange: {
    fontSize: 14,
    color: colors.muted || '#6b7280',
  },
  emailInput: {
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text || '#111827',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helpText: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
    marginTop: 6,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  optionContent: {
    flex: 1,
    marginRight: 16,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 12,
    color: colors.muted || '#6b7280',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: colors.redBold || '#dc2626',
  },
  successContainer: {
    padding: 40,
    alignItems: 'center',
  },
  successText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  previewContainer: {
    flex: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#e5e7eb',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  previewContent: {
    flex: 1,
    padding: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e5e7eb',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.blueSoft || '#eef2ff',
    borderRadius: 8,
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent || '#3b82f6',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.accent || '#3b82f6',
    borderRadius: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

