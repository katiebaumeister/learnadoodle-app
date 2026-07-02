import {
  BookOpen,
  CheckCircle2,
  FileText,
  HelpCircle,
  Megaphone,
  Sparkles,
  Upload,
} from 'lucide-react';
import { STREAM_CARD_TYPE } from '../../lib/bulletinStreamModel';
import { HOME_GETTING_STARTED_SYSTEM_KIND } from '../../lib/homeWelcomeBulletin';

export const STREAM_ICON_BY_TYPE = {
  [STREAM_CARD_TYPE.ASSIGNMENT_POSTED]: FileText,
  [STREAM_CARD_TYPE.SUBMISSION]: Upload,
  [STREAM_CARD_TYPE.FEEDBACK]: CheckCircle2,
  [STREAM_CARD_TYPE.QUESTION]: HelpCircle,
  [STREAM_CARD_TYPE.ANNOUNCEMENT]: Megaphone,
  [STREAM_CARD_TYPE.LESSON_COMPLETE]: BookOpen,
};

export const STREAM_ICON_COLOR_BY_TYPE = {
  [STREAM_CARD_TYPE.ASSIGNMENT_POSTED]: '#6BB3E8',
  [STREAM_CARD_TYPE.SUBMISSION]: '#7C3AED',
  [STREAM_CARD_TYPE.FEEDBACK]: '#059669',
  [STREAM_CARD_TYPE.QUESTION]: '#D97706',
  [STREAM_CARD_TYPE.ANNOUNCEMENT]: '#6366F1',
  [STREAM_CARD_TYPE.LESSON_COMPLETE]: '#0D9488',
};

export const STREAM_ICON_BG_BY_TYPE = {
  [STREAM_CARD_TYPE.ASSIGNMENT_POSTED]: '#EBF6FD',
  [STREAM_CARD_TYPE.SUBMISSION]: '#F5F3FF',
  [STREAM_CARD_TYPE.FEEDBACK]: '#ECFDF5',
  [STREAM_CARD_TYPE.QUESTION]: '#FFFBEB',
  [STREAM_CARD_TYPE.ANNOUNCEMENT]: '#EEF2FF',
  [STREAM_CARD_TYPE.LESSON_COMPLETE]: '#F0FDFA',
};

export function resolveStreamCardIcon(cardType, entry = null) {
  const systemKind = entry?.payload?.systemKind || entry?.systemKind || null;
  if (systemKind === HOME_GETTING_STARTED_SYSTEM_KIND) {
    return {
      Icon: Sparkles,
      color: '#6BB3E8',
      backgroundColor: '#EBF6FD',
    };
  }

  return {
    Icon: STREAM_ICON_BY_TYPE[cardType] || Megaphone,
    color: STREAM_ICON_COLOR_BY_TYPE[cardType] || '#64748B',
    backgroundColor: STREAM_ICON_BG_BY_TYPE[cardType] || '#F8FAFC',
  };
}
