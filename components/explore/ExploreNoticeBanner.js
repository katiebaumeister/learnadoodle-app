import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertCircle, X, ChevronDown, ChevronUp } from 'lucide-react';

export default function ExploreNoticeBanner({ onDismissedChange }) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleDismiss = () => {
    setIsDismissed(true);
    if (onDismissedChange) {
      onDismissedChange(true);
    }
  };

  const handleExpand = () => {
    setIsDismissed(false);
    setIsExpanded(true);
    if (onDismissedChange) {
      onDismissedChange(false);
    }
  };

  if (isDismissed) {
    return null; // Banner is dismissed, parent will show link
  }

  return (
    <View style={styles.banner}>
      <View style={styles.bannerHeader}>
        <View style={styles.bannerHeaderLeft}>
          <AlertCircle size={16} color="#3b82f6" />
          <Text style={styles.bannerTitle}>Third-Party Educational Content Notice</Text>
        </View>
        <View style={styles.bannerHeaderRight}>
          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            style={styles.toggleButton}
          >
            {isExpanded ? (
              <ChevronUp size={16} color="#6b7280" />
            ) : (
              <ChevronDown size={16} color="#6b7280" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.dismissButton}
          >
            <X size={14} color="#6b7280" />
          </TouchableOpacity>
        </View>
      </View>
      {isExpanded && (
        <Text style={styles.bannerText}>
          Learnadoodle links to external providers like Khan Academy. We don&apos;t host their lessons.
          Content opens in a new tab under the provider&apos;s terms. Families remain responsible for
          following provider licenses and local education rules.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 12,
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bannerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  bannerHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
    flex: 1,
  },
  bannerText: {
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 18,
    paddingLeft: 24,
  },
  toggleButton: {
    padding: 4,
  },
  dismissButton: {
    padding: 4,
  },
});

