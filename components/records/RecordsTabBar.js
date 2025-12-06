/**
 * Records Tab Bar
 * Internal navigation for Records tabs
 * 
 * NOTE: This component is now a wrapper around the unified TabBar component.
 * It maintains backwards compatibility for any code still using RecordsTabBar.
 * 
 * @deprecated Consider using TabBar directly from '../ui/TabBar'
 */
import React from 'react';
import TabBar from '../ui/TabBar';
import { Shield, GraduationCap, FileText, Clock, BookOpen, StickyNote, Calculator } from 'lucide-react';

const TABS = [
  { id: 'compliance', label: 'Compliance', icon: Shield },
  { id: 'transcripts', label: 'Transcripts & Credits', icon: GraduationCap },
  { id: 'gradebook', label: 'Gradebook & Mastery', icon: Calculator },
  { id: 'portfolio', label: 'Portfolio & Evidence', icon: FileText },
  { id: 'attendance', label: 'Attendance & Logs', icon: Clock },
  { id: 'courses', label: 'Courses & Syllabi', icon: BookOpen },
  { id: 'notes', label: 'Notes', icon: StickyNote },
];

export default function RecordsTabBar({ activeTab, onTabChange }) {
  return (
    <TabBar
      tabs={TABS.map(tab => ({
        id: tab.id,
        label: tab.label,
        icon: tab.icon,
      }))}
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
  );
}

