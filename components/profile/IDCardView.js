import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { Download } from 'lucide-react';

const CARD_ROLES = {
  student: { cardTitle: 'Student ID' },
  parent: { cardTitle: 'Homeschool Teacher ID' },
  tutor: { cardTitle: 'Tutor ID' },
};

function formatMemberId(familyId, childId, cardRole) {
  const y = new Date().getFullYear();
  const familyShort = (familyId || '').replace(/-/g, '').slice(-5).toUpperCase() || '00000';
  if (cardRole === 'student' && childId) {
    const childShort = (childId || '').replace(/-/g, '').slice(-2).toUpperCase() || '01';
    return `LD-${y}-${familyShort}-${childShort}`;
  }
  return `LD-${y}-${familyShort}`;
}

function getYearDates() {
  const y = new Date().getFullYear();
  const start = new Date(y, 0, 1);
  const end = new Date(y, 11, 31);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return { startDate: fmt(start), expiration: fmt(end) };
}

function formatGradeLevel(grade) {
  if (grade == null || grade === '') return '';
  const s = String(grade).trim();
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s; // e.g. "Kindergarten", "Pre-K"
  if (n === 0) return 'Kindergarten';
  if (n >= 1 && n <= 12) {
    const ord = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return `${n}${ord} grade`;
  }
  return s;
}

export default function IDCardView({
  child,
  familyId,
  cardRole = 'student',
  onExport,
}) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const cardRef = useRef(null);
  const roleConfig = CARD_ROLES[cardRole] || CARD_ROLES.student;

  const displayName = child?.first_name || child?.name || (cardRole === 'parent' ? 'Parent' : cardRole === 'tutor' ? 'Tutor' : 'Student');
  const { startDate, expiration } = getYearDates();
  const memberId = formatMemberId(familyId, cardRole === 'student' ? child?.id : null, cardRole);
  const gradeRaw = cardRole === 'student' ? (child?.grade ?? child?.grade_level ?? '') : '';
  const grade = formatGradeLevel(gradeRaw);

  const handleExportAsImage = async () => {
    if (Platform.OS !== 'web') {
      if (onExport) onExport();
      else Alert.alert('Export', 'Image export is available on web. Open this page in a browser to download the ID as an image.');
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      if (typeof window.html2canvas !== 'function') {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector('script[src*="html2canvas"]');
          if (existing) {
            if (window.html2canvas) resolve();
            else { existing.onload = resolve; existing.onerror = reject; }
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load html2canvas'));
          document.head.appendChild(script);
        });
      }
      const el = cardRef.current;
      if (!el) {
        Alert.alert('Error', 'Could not find card element.');
        return;
      }
      let domNode = el;
      if (el._nativeNode) domNode = el._nativeNode;
      else if (typeof el === 'object' && el.nodeType !== 1 && (el._reactInternalFiber || el._reactInternalInstance)) {
        const fiber = el._reactInternalFiber || el._reactInternalInstance;
        if (fiber?.stateNode) domNode = fiber.stateNode;
      }
      const canvas = await window.html2canvas(domNode, {
        backgroundColor: '#ffffff',
        scale: 4,
        logging: false,
        useCORS: true,
        allowTaint: false,
      });
      canvas.toBlob((blob) => {
        if (!blob) {
          Alert.alert('Error', 'Failed to create image.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (displayName || 'card').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
        a.download = `learnadoodle-${cardRole}-id-${safeName}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (onExport) onExport();
      }, 'image/png', 1.0);
    } catch (err) {
      console.error('Export error:', err);
      Alert.alert('Export failed', err?.message || 'Could not export as image.');
    }
  };

  return (
    <View style={styles.container}>
      <View ref={cardRef} style={styles.card} collapsable={false}>
        <View style={styles.logoRow}>
          <Text style={styles.logoText}>learnadoodle</Text>
        </View>
        <Text style={styles.cardTitle}>{roleConfig.cardTitle}</Text>
        <View style={[styles.underline, { backgroundColor: tokens.border }]} />

        <View style={styles.fields}>
          <View style={styles.fieldRow}>
            <Text style={[styles.label, { color: tokens.text }]}>Name:</Text>
            <Text style={[styles.value, { color: tokens.text }]}>{displayName}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={[styles.label, { color: tokens.text }]}>Start date:</Text>
            <Text style={[styles.value, { color: tokens.text }]}>{startDate}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={[styles.label, { color: tokens.text }]}>Member ID:</Text>
            <Text style={[styles.value, { color: tokens.text }]}>{memberId}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={[styles.label, { color: tokens.text }]}>Expiration:</Text>
            <Text style={[styles.value, { color: tokens.text }]}>{expiration}</Text>
          </View>
          {cardRole === 'student' && (
            <View style={styles.fieldRow}>
              <Text style={[styles.label, { color: tokens.text }]}>Grade:</Text>
              <Text style={[styles.value, { color: tokens.text }]}>{grade || '—'}</Text>
            </View>
          )}
        </View>

        <View style={[styles.disclaimer, { borderTopColor: tokens.border }]}>
          <Text style={[styles.disclaimerText, { color: tokens.textMuted }]}>
            This ID is for educational discount purposes only.{'\n'}
            Not a government-issued identification.{'\n'}
            This is not proof of legal homeschooling status.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.exportButton, { backgroundColor: '#1e40af', borderColor: '#1e40af' }]}
        onPress={handleExportAsImage}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Download size={18} color="#ffffff" />
        <Text style={styles.exportButtonText}>Export as image</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#bfdbfe',
    padding: 20,
    maxWidth: 340,
    width: '100%',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.08)',
    }),
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: 2,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#60a5fa',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    textAlign: 'center',
    marginBottom: 6,
  },
  underline: {
    height: 1,
    marginBottom: 16,
  },
  fields: {
    marginBottom: 4,
  },
  fieldRow: {
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
  },
  disclaimer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  disclaimerText: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
  },
  exportButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});
