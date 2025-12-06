/**
 * AssignmentCard Component
 * Displays a single assignment in a card format
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Clock, AlertCircle, CheckCircle, FileText, HelpCircle, Camera } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function AssignmentCard({ assignment, onPress, onQuickSubmit }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'not_started':
        return { bg: colors.bgSubtle, text: colors.muted, icon: FileText };
      case 'in_progress':
        return { bg: colors.blueSoft, text: colors.blueBold, icon: Clock };
      case 'submitted':
        return { bg: colors.yellowSoft, text: colors.yellowBold, icon: Clock };
      case 'reviewed':
        return { bg: colors.orangeSoft, text: colors.orangeBold, icon: AlertCircle };
      case 'accepted':
        return { bg: colors.greenSoft, text: colors.greenBold, icon: CheckCircle };
      default:
        return { bg: colors.bgSubtle, text: colors.muted, icon: FileText };
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'not_started':
        return 'Not Started';
      case 'in_progress':
        return 'In Progress';
      case 'submitted':
        return 'Submitted';
      case 'reviewed':
        return 'Reviewed';
      case 'accepted':
        return 'Accepted';
      default:
        return status;
    }
  };

  const statusStyle = getStatusColor(assignment.status);
  const StatusIcon = statusStyle.icon;
  const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
  const isOverdue = dueDate && dueDate < new Date() && assignment.status !== 'accepted' && assignment.status !== 'submitted';

  return (
    <TouchableOpacity
      style={[styles.card, assignment.need_help && styles.cardNeedsHelp]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {assignment.title}
          </Text>
          {assignment.need_help && (
            <HelpCircle size={16} color={colors.orangeBold} style={styles.helpIcon} />
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <StatusIcon size={12} color={statusStyle.text} />
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {getStatusLabel(assignment.status)}
          </Text>
        </View>
      </View>

      {assignment.description && (
        <Text style={styles.description} numberOfLines={2}>
          {assignment.description}
        </Text>
      )}

      <View style={styles.footer}>
        {assignment.related_subject_name && (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Subject:</Text>
            <Text style={styles.metaValue}>{assignment.related_subject_name}</Text>
          </View>
        )}
        {dueDate && (
          <View style={styles.metaItem}>
            <Clock size={12} color={isOverdue ? colors.redBold : colors.muted} />
            <Text style={[styles.dueDate, isOverdue && styles.dueDateOverdue]}>
              {isOverdue ? 'Overdue: ' : 'Due: '}
              {dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        )}
        {assignment.linked_evidence_ids && Array.isArray(assignment.linked_evidence_ids) && assignment.linked_evidence_ids.length > 0 && (
          <View style={styles.metaItem}>
            <FileText size={12} color={colors.muted} />
            <Text style={styles.metaValue}>
              {assignment.linked_evidence_ids.length} file{assignment.linked_evidence_ids.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
        {assignment.score !== null && assignment.score !== undefined && (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Score:</Text>
            <Text style={styles.scoreText}>
              {assignment.score}{assignment.max_score ? `/${assignment.max_score}` : ''}
            </Text>
          </View>
        )}
        {assignment.review_status && (
          <View style={styles.metaItem}>
            <Text style={[
              styles.reviewStatus,
              assignment.review_status === 'approved' && { color: colors.greenBold },
              assignment.review_status === 'rejected' && { color: colors.redBold },
              assignment.review_status === 'needs_revision' && { color: colors.orangeBold },
            ]}>
              {assignment.review_status === 'approved' && '✓ Approved'}
              {assignment.review_status === 'rejected' && '✗ Rejected'}
              {assignment.review_status === 'needs_revision' && '↻ Needs Revision'}
            </Text>
          </View>
        )}
      </View>

      {/* One-Tap Submit Button */}
      {onQuickSubmit && (assignment.status === 'in_progress' || assignment.status === 'not_started') && (
        <TouchableOpacity
          style={styles.quickSubmitButton}
          onPress={() => onQuickSubmit(assignment)}
          activeOpacity={0.8}
        >
          <Camera size={18} color={colors.white} />
          <Text style={styles.quickSubmitText}>Quick Submit</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadows?.sm,
  },
  cardNeedsHelp: {
    borderLeftWidth: 3,
    borderLeftColor: colors.orangeBold,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  helpIcon: {
    marginLeft: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  metaValue: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  dueDate: {
    fontSize: 12,
    color: colors.muted,
  },
  dueDateOverdue: {
    color: colors.redBold,
    fontWeight: '600',
  },
  scoreText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  reviewStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  quickSubmitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.indigo,
    borderRadius: 8,
  },
  quickSubmitText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});

