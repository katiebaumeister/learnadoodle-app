/**
 * Web Child Schedule Tab
 * Shows full activity timeline and attendance log
 * Reuses components from RecordsPhase4
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Calendar } from 'lucide-react';
import {
  getAttendanceTimeline,
  getGrades,
  getPortfolioUploads,
} from '../../../lib/services/recordsClient';
import { 
  RecordsSectionGroup, 
  SectionCard,
  AttendanceSection,
  ActivityTimelineCard,
  TimelineModal,
} from '../../records/RecordsPhase4';

// Helper function to format dates
const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

export default function WebChildScheduleTab({ childId, familyId }) {
  const [attendanceData, setAttendanceData] = useState([]);
  const [grades, setGrades] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTimelineModal, setShowTimelineModal] = useState(false);

  const dateRange = useMemo(() => ({
    start: new Date(new Date().getFullYear(), 0, 1),
    end: new Date(),
  }), []);

  useEffect(() => {
    if (!childId) return;
    loadData();
  }, [childId, dateRange]);

  const loadData = async () => {
    if (!childId) return;
    setLoading(true);
    
    try {
      const [attendance, gradesData, uploadsData] = await Promise.all([
        getAttendanceTimeline(childId, dateRange.start, dateRange.end).catch(() => []),
        getGrades(childId).catch(() => []),
        getPortfolioUploads(childId).catch(() => []),
      ]);
      
      setAttendanceData(attendance || []);
      setGrades(gradesData || []);
      setUploads(uploadsData || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <RecordsSectionGroup
        icon={<Clock className="h-4 w-4" />}
        title="Schedule & Attendance History"
        subtitle="Complete attendance log and timeline"
        defaultOpen={true}
      >
        <AttendanceSection attendanceData={attendanceData} />
      </RecordsSectionGroup>

      <RecordsSectionGroup
        icon={<Calendar className="h-4 w-4" />}
        title="Activity Timeline"
        subtitle="Chronological view of all activities"
        defaultOpen={true}
        onViewFull={() => setShowTimelineModal(true)}
        viewFullLabel="View full timeline →"
      >
        <ActivityTimelineCard
          attendanceData={attendanceData}
          grades={grades}
          uploads={uploads}
        />
      </RecordsSectionGroup>

      <TimelineModal
        isOpen={showTimelineModal}
        onClose={() => setShowTimelineModal(false)}
        attendanceData={attendanceData}
        grades={grades}
        uploads={uploads}
      />
    </div>
  );
}

