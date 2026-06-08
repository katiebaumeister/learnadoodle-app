import React from 'react';
import {
  BookOpen,
  Calculator,
  FlaskConical,
  Globe,
  Palette,
  Music,
  Dumbbell,
  Code,
  Pencil,
} from 'lucide-react';

const SUBJECT_ICON_MAP = [
  { match: ['math', 'mathematics', 'algebra', 'geometry', 'calculus'], Icon: Calculator, color: '#3B82F6', bg: '#EFF6FF' },
  { match: ['science', 'biology', 'chemistry', 'physics'], Icon: FlaskConical, color: '#8B5CF6', bg: '#F5F3FF' },
  { match: ['writing'], Icon: Pencil, color: '#F59E0B', bg: '#FFFBEB' },
  { match: ['language', 'ela', 'english', 'reading'], Icon: BookOpen, color: '#10B981', bg: '#ECFDF5' },
  { match: ['history', 'social studies', 'geography'], Icon: Globe, color: '#6366F1', bg: '#EEF2FF' },
  { match: ['art', 'drawing', 'painting'], Icon: Palette, color: '#EC4899', bg: '#FDF2F8' },
  { match: ['music', 'band', 'choir'], Icon: Music, color: '#14B8A6', bg: '#F0FDFA' },
  { match: ['physical', 'pe', 'fitness'], Icon: Dumbbell, color: '#EF4444', bg: '#FEF2F2' },
  { match: ['technology', 'tech', 'coding'], Icon: Code, color: '#0EA5E9', bg: '#F0F9FF' },
];

export function getSubjectVisual(subjectName = '') {
  const name = String(subjectName || '').toLowerCase();
  const found = SUBJECT_ICON_MAP.find((entry) =>
    entry.match.some((token) => name.includes(token))
  );
  if (found) return found;
  return { Icon: BookOpen, color: '#64748B', bg: '#F1F5F9' };
}

export function renderSubjectIcon(subjectName, size = 20) {
  const { Icon, color } = getSubjectVisual(subjectName);
  return <Icon size={size} color={color} strokeWidth={2} />;
}

export function getSubjectStatusDisplay(status, progressPercent = null, progressCompleted = null) {
  if (status === 'needs_attention') {
    return { label: 'Behind', color: '#EA580C', bg: '#FFF7ED' };
  }
  const hasProgress =
    (progressPercent != null && progressPercent > 0)
    || (progressCompleted != null && progressCompleted > 0);
  if (status === 'not_started' && !hasProgress) {
    return { label: 'Not started', color: '#64748B', bg: '#F1F5F9' };
  }
  if (progressPercent != null && progressPercent >= 85) {
    return { label: 'Ahead', color: '#059669', bg: '#ECFDF5' };
  }
  return { label: 'On Track', color: '#059669', bg: '#ECFDF5' };
}

export function formatGradeLabel(child) {
  const raw = child?.grade ?? child?.grade_level ?? child?.grade_label ?? '';
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^\d/.test(text) && !/\bgrade\b/i.test(text)) return `${text} Grade`;
  return text;
}

export function formatRelativeScheduleDate(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfTarget - startOfToday) / (24 * 60 * 60 * 1000));
  const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Today, ${timeStr}`;
  if (dayDiff === 1) return `Tomorrow, ${timeStr}`;
  if (dayDiff === -1) return `Yesterday, ${timeStr}`;
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${weekday}, ${timeStr}`;
}

export function formatAttentionSummary(subject) {
  const overdueCount = subject?.overdueCount || 0;
  const attentionCount = subject?.parentAssignmentAttentionCount || 0;
  const needHelpCount = subject?.parentNeedHelpCount || 0;
  const total = overdueCount + attentionCount + needHelpCount;

  if (total === 0) {
    const status = subject?.status;
    if (status === 'on_track' && (subject?.progressPercent || 0) >= 85) {
      return { title: 'None', subtitle: 'Great progress!', tone: 'positive' };
    }
    return { title: 'None', subtitle: 'All caught up!', tone: 'positive' };
  }

  if (overdueCount > 0) {
    return {
      title: `${overdueCount} assignment${overdueCount === 1 ? '' : 's'} due`,
      subtitle: 'Needs review',
      tone: 'warning',
    };
  }
  if (needHelpCount > 0) {
    return {
      title: `${needHelpCount} help request${needHelpCount === 1 ? '' : 's'}`,
      subtitle: 'Student needs help',
      tone: 'warning',
    };
  }
  return {
    title: `${attentionCount} item${attentionCount === 1 ? '' : 's'} waiting`,
    subtitle: 'Needs your attention',
    tone: 'warning',
  };
}
