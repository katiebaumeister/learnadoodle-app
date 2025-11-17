import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { ExternalLink } from 'lucide-react';

export default function AboutPanel() {
  const handleEmailPress = () => {
    if (Platform.OS === 'web') {
      window.location.href = 'mailto:support@learnadoodle.com';
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>About Learnadoodle</Text>
      <Text style={styles.sectionSubtitle}>
        Version info, feedback link, and support.
      </Text>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version:</Text>
          <Text style={styles.infoValue}>0.1.0 (dev)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Feedback:</Text>
          <TouchableOpacity onPress={handleEmailPress}>
            <View style={styles.emailLink}>
              <Text style={styles.emailLinkText}>support@learnadoodle.com</Text>
              <ExternalLink size={12} color="#3b82f6" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.descriptionCard}>
        <Text style={styles.descriptionText}>
          Learnadoodle helps families manage homeschooling with AI-powered planning,
          progress tracking, and learning recommendations.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
});

