import {
  Home,
  CalendarDays,
  GraduationCap,
  FileText,
  Users,
  Plus,
  MessageCircle,
  Library,
  UserCircle,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';

/** Match left-rail nav icons in section page titles. */
export const MAIN_NAV_PAGE_ICON_SIZE = 22;
export const MAIN_NAV_PAGE_ICON_COLOR = '#000000';

export const MAIN_NAV_ICONS = {
  home: Home,
  subjects: GraduationCap,
  learning: GraduationCap,
  planner: CalendarDays,
  planningPreferences: SlidersHorizontal,
  records: FileText,
  family: Users,
  messages: MessageCircle,
  doodle: Sparkles,
  create: Plus,
  materials: Library,
  profile: UserCircle,
  settings: UserCircle,
};
