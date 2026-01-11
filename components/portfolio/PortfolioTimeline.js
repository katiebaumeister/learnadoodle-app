/**
 * Portfolio Timeline View
 * Displays learning events, uploads, and grades organized by month/quarter
 * with filters for child and subject
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Image, FileText, Award, Filter, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getPortfolioTimelineEvents, getPortfolioUploads, getGrades } from '../../lib/services/recordsClient';

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

// Helper function for conditional classes
const clsx = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

// Get quarter from date
const getQuarter = (date) => {
  const month = date.getMonth();
  if (month < 3) return 'Q1';
  if (month < 6) return 'Q2';
  if (month < 9) return 'Q3';
  return 'Q4';
};

// Get month/quarter key for grouping
const getTimeKey = (date, viewMode) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  if (viewMode === 'quarter') {
    const quarter = getQuarter(date);
    return `${year} ${quarter}`;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

// Format time key for display
const formatTimeKey = (key, viewMode) => {
  if (viewMode === 'quarter') {
    return key; // Already formatted as "2025 Q1"
  }
  // Format as "January 2025"
  const [year, month] = key.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

// Event Card Component
function EventCard({ event, subjectName, childName }) {
  const eventDate = event.start_ts ? new Date(event.start_ts) : null;
  const statusColors = {
    done: 'bg-emerald-100 text-emerald-700',
    in_progress: 'bg-blue-100 text-blue-700',
    scheduled: 'bg-slate-100 text-slate-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <div 
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md"
      style={{
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        padding: '12px',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-slate-900" style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
              {event.title || 'Untitled Event'}
            </h3>
            {event.status && (
              <span
                className={clsx(
                  "rounded px-2 py-0.5 text-xs font-medium capitalize",
                  statusColors[event.status] || statusColors.scheduled
                )}
                style={{
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                {event.status}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b' }}>
            {subjectName && (
              <span className="inline-flex items-center gap-1">
                <FileText size={12} />
                {subjectName}
              </span>
            )}
            {childName && (
              <span>{childName}</span>
            )}
            {eventDate && (
              <span>{formatDate(event.start_ts)}</span>
            )}
            {event.duration_minutes && (
              <span>{Math.round(event.duration_minutes)} min</span>
            )}
          </div>
          {event.description && (
            <p className="mt-2 text-xs text-slate-600 line-clamp-2" style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
              {event.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Upload Card Component (for gallery)
function UploadCard({ upload, onImageClick }) {
  const isImage = upload.storage_path && /\.(jpg|jpeg|png|gif|webp)$/i.test(upload.storage_path);
  
  return (
    <div 
      className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm transition hover:shadow-md cursor-pointer"
      style={{
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
        aspectRatio: '1',
      }}
      onClick={() => onImageClick && onImageClick(upload)}
    >
      {isImage ? (
        <div className="h-full w-full flex items-center justify-center bg-slate-100">
          <Image size={32} className="text-slate-300" />
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <FileText size={32} className="text-slate-300" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        {upload.caption && (
          <p className="text-xs text-white line-clamp-2" style={{ fontSize: '12px', color: '#ffffff' }}>
            {upload.caption}
          </p>
        )}
      </div>
    </div>
  );
}

// Grade Card Component
function GradeCard({ grade }) {
  return (
    <div 
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
      style={{
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        padding: '12px',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400" style={{ fontSize: '12px', fontWeight: '500', color: '#94a3b8', margin: 0 }}>
            {grade.subject?.name || 'No subject'}
          </p>
          {grade.term_label && (
            <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>
              {grade.term_label}
            </p>
          )}
        </div>
        {grade.grade && (
          <p className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
            {grade.grade}
          </p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500" style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
        {grade.score !== null && <span>Score: {grade.score}</span>}
        {grade.credits && parseFloat(grade.credits) > 0 && (
          <span>Credits: {parseFloat(grade.credits).toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}

export default function PortfolioTimeline({ familyId }) {
  const [children, setChildren] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedChildIds, setSelectedChildIds] = useState([]); // Can select multiple
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'quarter'
  const [events, setEvents] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUpload, setSelectedUpload] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), 0, 1), // Start of year
    end: new Date(),
  });

  // Load children and subjects
  useEffect(() => {
    if (!familyId) return;
    
    const loadData = async () => {
      const [childrenRes, subjectsRes] = await Promise.all([
        supabase
          .from('children')
          .select('id, first_name, grade')
          .eq('family_id', familyId)
          .eq('archived', false)
          .order('first_name'),
        supabase
          .from('subject')
          .select('id, name')
          .eq('family_id', familyId)
          .order('name'),
      ]);
      
      if (!childrenRes.error && childrenRes.data) {
        setChildren(childrenRes.data);
        // Select all children by default
        setSelectedChildIds(childrenRes.data.map(c => c.id));
      }
      
      if (!subjectsRes.error && subjectsRes.data) {
        setSubjects(subjectsRes.data);
      }
    };
    
    loadData();
  }, [familyId]);

  // Load timeline data
  useEffect(() => {
    if (!familyId || selectedChildIds.length === 0) {
      setEvents([]);
      setUploads([]);
      setGrades([]);
      return;
    }
    
    loadTimelineData();
  }, [familyId, selectedChildIds, selectedSubjectId, dateRange]);

  const loadTimelineData = async () => {
    setLoading(true);
    try {
      // Load events for all selected children
      const eventsPromises = selectedChildIds.map(childId =>
        getPortfolioTimelineEvents(childId, dateRange.start, dateRange.end, selectedSubjectId)
      );
      const eventsArrays = await Promise.all(eventsPromises);
      const allEvents = eventsArrays.flat();

      // Load uploads for all selected children
      const uploadsPromises = selectedChildIds.map(childId =>
        getPortfolioUploads(childId)
      );
      const uploadsArrays = await Promise.all(uploadsPromises);
      const allUploads = uploadsArrays.flat();

      // Load grades for all selected children
      const gradesPromises = selectedChildIds.map(childId =>
        getGrades(childId)
      );
      const gradesArrays = await Promise.all(gradesPromises);
      const allGrades = gradesArrays.flat();

      // Filter by date range and subject
      const filteredEvents = allEvents.filter(e => {
        if (!e.start_ts) return false;
        const eventDate = new Date(e.start_ts);
        return eventDate >= dateRange.start && eventDate <= dateRange.end;
      });

      const filteredUploads = allUploads.filter(u => {
        if (!u.created_at) return false;
        const uploadDate = new Date(u.created_at);
        return uploadDate >= dateRange.start && uploadDate <= dateRange.end;
      });

      const filteredGrades = allGrades.filter(g => {
        if (!g.created_at) return false;
        const gradeDate = new Date(g.created_at);
        return gradeDate >= dateRange.start && gradeDate <= dateRange.end;
      });

      setEvents(filteredEvents);
      setUploads(filteredUploads);
      setGrades(filteredGrades);
    } catch (error) {
      setEvents([]);
      setUploads([]);
      setGrades([]);
    } finally {
      setLoading(false);
    }
  };

  // Group timeline items by month/quarter
  const groupedTimeline = useMemo(() => {
    const groups = {};
    
    // Group events
    events.forEach(event => {
      if (!event.start_ts) return;
      const date = new Date(event.start_ts);
      const key = getTimeKey(date, viewMode);
      if (!groups[key]) {
        groups[key] = { events: [], uploads: [], grades: [] };
      }
      groups[key].events.push(event);
    });

    // Group uploads
    uploads.forEach(upload => {
      if (!upload.created_at) return;
      const date = new Date(upload.created_at);
      const key = getTimeKey(date, viewMode);
      if (!groups[key]) {
        groups[key] = { events: [], uploads: [], grades: [] };
      }
      groups[key].uploads.push(upload);
    });

    // Group grades
    grades.forEach(grade => {
      if (!grade.created_at) return;
      const date = new Date(grade.created_at);
      const key = getTimeKey(date, viewMode);
      if (!groups[key]) {
        groups[key] = { events: [], uploads: [], grades: [] };
      }
      groups[key].grades.push(grade);
    });

    // Sort keys descending (most recent first)
    return Object.keys(groups)
      .sort((a, b) => {
        // Compare year first, then quarter/month
        const [yearA, periodA] = a.split(' ');
        const [yearB, periodB] = b.split(' ');
        if (yearA !== yearB) return parseInt(yearB) - parseInt(yearA);
        // For quarters, Q1 < Q2 < Q3 < Q4
        // For months, compare numerically
        if (viewMode === 'quarter') {
          const qMap = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
          return qMap[periodB] - qMap[periodA];
        }
        return parseInt(periodB) - parseInt(periodA);
      })
      .map(key => ({ key, ...groups[key] }));
  }, [events, uploads, grades, viewMode]);

  // Get child name by ID
  const getChildName = (childId) => {
    const child = children.find(c => c.id === childId);
    return child?.first_name || 'Unknown';
  };

  // Get subject name by ID
  const getSubjectName = (subjectId) => {
    const subject = subjects.find(s => s.id === subjectId);
    return subject?.name || null;
  };

  const toggleChildSelection = (childId) => {
    setSelectedChildIds(prev => {
      if (prev.includes(childId)) {
        const newIds = prev.filter(id => id !== childId);
        // Ensure at least one child is selected
        return newIds.length > 0 ? newIds : prev;
      }
      return [...prev, childId];
    });
  };

  return (
    <div className="flex-1 bg-slate-50" style={{ minHeight: '100vh', padding: '24px' }}>
      <div className="max-w-6xl mx-auto px-6 py-8" style={{ maxWidth: '1152px', margin: '0 auto', padding: '24px 32px' }}>
        {/* Header */}
        <div className="mb-6" style={{ marginBottom: '24px' }}>
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontSize: '24px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
            Portfolio Timeline
          </h1>
          <p className="mt-1 text-sm text-slate-500" style={{ marginTop: '4px', fontSize: '14px', color: '#64748b', marginBottom: 0 }}>
            View learning events, portfolio uploads, and grades organized by time period.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" style={{ marginBottom: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', padding: '16px', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
          <div className="flex items-center gap-2 mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Filter size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900" style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
              Filters
            </h2>
          </div>

          {/* Child Filter */}
          <div className="mb-4" style={{ marginBottom: '16px' }}>
            <label className="block text-xs font-medium text-slate-700 mb-2" style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>
              Children
            </label>
            <div className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {children.map(child => (
                <button
                  key={child.id}
                  onClick={() => toggleChildSelection(child.id)}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                    selectedChildIds.includes(child.id)
                      ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '9999px',
                    border: `1px solid ${selectedChildIds.includes(child.id) ? '#c7d2fe' : '#e2e8f0'}`,
                    padding: '6px 12px',
                    fontSize: '14px',
                    backgroundColor: selectedChildIds.includes(child.id) ? '#eef2ff' : '#ffffff',
                    color: selectedChildIds.includes(child.id) ? '#4338ca' : '#475569',
                    fontWeight: selectedChildIds.includes(child.id) ? '500' : '400',
                    cursor: 'pointer',
                  }}
                >
                  <span>{child.first_name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subject Filter */}
          <div className="mb-4" style={{ marginBottom: '16px' }}>
            <label className="block text-xs font-medium text-slate-700 mb-2" style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>
              Subject
            </label>
            <div className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                onClick={() => setSelectedSubjectId(null)}
                className={clsx(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                  selectedSubjectId === null
                    ? "border-indigo-200 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
                style={{
                  borderRadius: '8px',
                  border: `1px solid ${selectedSubjectId === null ? '#c7d2fe' : '#e2e8f0'}`,
                  padding: '6px 12px',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: selectedSubjectId === null ? '#4f46e5' : '#ffffff',
                  color: selectedSubjectId === null ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                All Subjects
              </button>
              {subjects.map(subject => (
                <button
                  key={subject.id}
                  onClick={() => setSelectedSubjectId(subject.id)}
                  className={clsx(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                    selectedSubjectId === subject.id
                      ? "border-indigo-200 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                  style={{
                    borderRadius: '8px',
                    border: `1px solid ${selectedSubjectId === subject.id ? '#c7d2fe' : '#e2e8f0'}`,
                    padding: '6px 12px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: selectedSubjectId === subject.id ? '#4f46e5' : '#ffffff',
                    color: selectedSubjectId === subject.id ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  {subject.name}
                </button>
              ))}
            </div>
          </div>

          {/* View Mode Toggle */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2" style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>
              View Mode
            </label>
            <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setViewMode('month')}
                className={clsx(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                  viewMode === 'month'
                    ? "border-indigo-200 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
                style={{
                  borderRadius: '8px',
                  border: `1px solid ${viewMode === 'month' ? '#c7d2fe' : '#e2e8f0'}`,
                  padding: '6px 12px',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: viewMode === 'month' ? '#4f46e5' : '#ffffff',
                  color: viewMode === 'month' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                <Calendar size={14} className="inline mr-1" />
                By Month
              </button>
              <button
                onClick={() => setViewMode('quarter')}
                className={clsx(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                  viewMode === 'quarter'
                    ? "border-indigo-200 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
                style={{
                  borderRadius: '8px',
                  border: `1px solid ${viewMode === 'quarter' ? '#c7d2fe' : '#e2e8f0'}`,
                  padding: '6px 12px',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: viewMode === 'quarter' ? '#4f46e5' : '#ffffff',
                  color: viewMode === 'quarter' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                By Quarter
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" style={{ height: '32px', width: '32px', borderRadius: '50%', border: '4px solid #e0e7ff', borderTopColor: '#4f46e5' }} />
          </div>
        )}

        {/* Timeline */}
        {!loading && (
          <div className="space-y-8" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {groupedTimeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', textAlign: 'center' }}>
                <Calendar size={48} className="text-slate-300 mb-4" />
                <p className="text-sm text-slate-500" style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                  No timeline items found for the selected filters.
                </p>
                <p className="mt-1 text-xs text-slate-400" style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8', marginBottom: 0 }}>
                  Try adjusting your filters or date range.
                </p>
              </div>
            ) : (
              groupedTimeline.map(({ key, events: periodEvents, uploads: periodUploads, grades: periodGrades }) => (
                <div key={key} className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Period Header */}
                  <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                      {formatTimeKey(key, viewMode)}
                    </h2>
                    <div className="h-px flex-1 bg-slate-200" style={{ height: '1px', flex: 1, backgroundColor: '#e2e8f0' }} />
                    <span className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b' }}>
                      {periodEvents.length} events, {periodUploads.length} uploads, {periodGrades.length} grades
                    </span>
                  </div>

                  {/* Events Section */}
                  {periodEvents.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3" style={{ fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '12px', marginTop: 0 }}>
                        Events
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {periodEvents.map(event => (
                          <EventCard
                            key={event.id}
                            event={event}
                            subjectName={getSubjectName(event.subject_id)}
                            childName={getChildName(event.child_id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Uploads Gallery */}
                  {periodUploads.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3" style={{ fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '12px', marginTop: 0 }}>
                        Portfolio Gallery
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' }}>
                        {periodUploads.map(upload => (
                          <UploadCard
                            key={upload.id}
                            upload={upload}
                            onImageClick={setSelectedUpload}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grades Section */}
                  {periodGrades.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3" style={{ fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '12px', marginTop: 0 }}>
                        Grades
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {periodGrades.map(grade => (
                          <GradeCard key={grade.id} grade={grade} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Upload Modal */}
        {selectedUpload && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '16px',
            }}
            onClick={() => setSelectedUpload(null)}
          >
            <div 
              className="relative max-w-4xl max-h-[90vh] rounded-xl bg-white shadow-xl overflow-hidden"
              style={{
                position: 'relative',
                maxWidth: '896px',
                maxHeight: '90vh',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedUpload(null)}
                className="absolute top-4 right-4 z-10 rounded-full bg-white/90 p-2 shadow-md hover:bg-white transition"
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  zIndex: 10,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  padding: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                <X size={20} className="text-slate-600" />
              </button>
              <div className="p-6" style={{ padding: '24px' }}>
                {selectedUpload.caption && (
                  <h3 className="text-lg font-semibold text-slate-900 mb-2" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginBottom: '8px', marginTop: 0 }}>
                    {selectedUpload.caption}
                  </h3>
                )}
                {selectedUpload.storage_path && (
                  <p className="text-sm text-slate-500 mb-4" style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px', marginTop: 0 }}>
                    {selectedUpload.storage_path}
                  </p>
                )}
                {selectedUpload.created_at && (
                  <p className="text-xs text-slate-400" style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                    Uploaded {formatDate(selectedUpload.created_at)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

