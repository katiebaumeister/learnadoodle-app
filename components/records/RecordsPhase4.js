/**
 * Phase 4: Records, Credits & Compliance
 * Main Records component with attendance timeline, grades, portfolio uploads, and compliance
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Award, Upload, CheckCircle2, Download, Plus, X, FileText, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format } from '../../components/planner/utils/date';
import {
  addGrade,
  addPortfolioUpload,
  getStateRequirements,
  generateTranscript,
  getAttendanceTimeline,
  getGrades,
  getPortfolioUploads,
  getGradeOutcomes,
  getLastTranscript,
} from '../../lib/services/recordsClient';
import {
  getStandards,
  getStandardsPreferences,
  setStandardsPreference,
  getStandardsCoverage,
  getStandardsGaps,
  aiPlanStandards,
  createCurriculumMapping,
} from '../../lib/apiClient';

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

// SectionCard Component
function SectionCard({ icon, title, description, action, children }) {
  return (
    <section 
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
      }}
    >
      <div 
        className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          borderBottom: '1px solid #e2e8f0',
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
          {icon && <div style={{ color: '#94a3b8', marginTop: '2px' }}>{icon}</div>}
          <div>
            <h2 
              className="text-sm font-semibold text-slate-900"
              style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}
            >
              {title}
            </h2>
            {description && (
              <p 
                className="mt-1 text-xs text-slate-500"
                style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', marginBottom: 0 }}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      <div 
        className="px-5 py-4"
        style={{ padding: '16px 20px' }}
      >
        {children}
      </div>
    </section>
  );
}

// HeaderRow Component
function HeaderRow({ lastTranscript, onExport, selectedChildId }) {
  return (
    <div 
      className="flex items-center justify-between gap-4 mb-4"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '16px',
      }}
    >
      <div>
        <h1 
          className="text-xl font-semibold text-slate-900"
          style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', margin: 0 }}
        >
          Records
        </h1>
        <p 
          className="mt-1 text-sm text-slate-500"
          style={{ marginTop: '4px', fontSize: '14px', color: '#64748b', marginBottom: 0 }}
        >
          Track attendance, grades, and portfolio for this learner.
        </p>
      </div>
      <div 
        className="flex flex-col items-end gap-2"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}
      >
        <button
          onClick={onExport}
          disabled={!selectedChildId}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '8px',
            backgroundColor: '#4f46e5',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#ffffff',
            border: 'none',
            cursor: selectedChildId ? 'pointer' : 'not-allowed',
            opacity: selectedChildId ? 1 : 0.5,
          }}
        >
          <Download size={16} />
          <span>Export Transcript</span>
        </button>
        {lastTranscript ? (
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
            Last exported: {new Date(lastTranscript.created_at).toLocaleDateString()}
          </p>
        ) : (
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>No transcript exported yet</p>
        )}
      </div>
    </div>
  );
}

// StudentSelector Component
function StudentSelector({ students, activeId, onSelect }) {
  return (
    <div 
      className="mt-2 flex flex-wrap gap-2"
      style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}
    >
      {students.map((child) => (
        <button
          key={child.id}
          onClick={() => onSelect(child.id)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
            activeId === child.id
              ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '9999px',
            border: `1px solid ${activeId === child.id ? '#c7d2fe' : '#e2e8f0'}`,
            padding: '6px 12px',
            fontSize: '14px',
            backgroundColor: activeId === child.id ? '#eef2ff' : '#ffffff',
            color: activeId === child.id ? '#4338ca' : '#475569',
            fontWeight: activeId === child.id ? '500' : '400',
            cursor: 'pointer',
          }}
        >
          <span>{child.first_name}</span>
        </button>
      ))}
    </div>
  );
}

// AttendanceSection Component (inner content only, no SectionCard wrapper)
function AttendanceSection({ attendanceData }) {
  if (attendanceData.length === 0) {
    return (
      <div 
        className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 0',
          textAlign: 'center',
          fontSize: '14px',
          color: '#64748b',
        }}
      >
        <div 
          className="mb-3 h-2 w-32 rounded-full bg-slate-100"
          style={{ marginBottom: '12px', height: '8px', width: '128px', borderRadius: '9999px', backgroundColor: '#f1f5f9' }}
        />
        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          No attendance records for this period.
        </p>
        <p style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8', marginBottom: 0 }}>
          Mark events as "Done" on the planner to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {attendanceData.map((record, index) => (
        <div key={index} className="flex gap-3">
          <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />
          <div className="flex-1 border-l-2 border-slate-100 pl-4 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">
                {new Date(record.day_date).toLocaleDateString()}
              </p>
              <span
                className={clsx(
                  "rounded px-2 py-0.5 text-xs font-medium capitalize",
                  record.status === 'present' && "bg-emerald-100 text-emerald-700",
                  record.status === 'partial' && "bg-amber-100 text-amber-700",
                  record.status === 'absent' && "bg-red-100 text-red-700",
                  !['present', 'partial', 'absent'].includes(record.status) && "bg-slate-100 text-slate-600"
                )}
              >
                {record.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{record.minutes} minutes</p>
            {record.note && (
              <p className="mt-1 text-xs italic text-slate-400">{record.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// GradeCard Component
function GradeCard({ grade, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-left transition hover:bg-slate-50"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {grade.subject?.name || 'No subject'}
          </p>
          {grade.term_label && (
            <p className="text-xs text-slate-500">{grade.term_label}</p>
          )}
        </div>
        {grade.grade && (
          <p className="text-lg font-semibold text-slate-900">
            {grade.grade}
          </p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {grade.score !== null && <span>Score: {grade.score}</span>}
        {grade.credits && parseFloat(grade.credits) > 0 && (
          <span>Credits: {parseFloat(grade.credits).toFixed(1)}</span>
        )}
      </div>
      {grade.notes && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-500">{grade.notes}</p>
      )}
    </button>
  );
}

// GradesSection Component (inner content only, no SectionCard wrapper)
function GradesSection({ grades, onAddGrade, onGradeClick }) {
  if (grades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
        <div className="mb-3 h-2 w-32 rounded-full bg-slate-100" />
        <p className="text-sm text-slate-500">
          No grades recorded yet.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Click <span className="font-medium text-slate-600">Add Grade</span> to start your first record.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(() => {
        const totalCredits = grades.reduce((sum, g) => sum + (parseFloat(g.credits) || 0), 0);
        return totalCredits > 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
            <span className="text-sm font-semibold text-blue-900">Total Credits This Year:</span>
            <span className="text-lg font-bold text-indigo-600">{totalCredits.toFixed(1)}</span>
          </div>
        ) : null;
      })()}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {grades.map(grade => (
          <GradeCard key={grade.id} grade={grade} onClick={() => onGradeClick(grade)} />
        ))}
      </div>
    </div>
  );
}

// UploadCard Component
function UploadCard({ upload }) {
  return (
    <div className="group overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
      <div className="h-32 bg-slate-50 flex items-center justify-center">
        <FileText size={32} className="text-slate-300" />
      </div>
      <div className="px-4 py-3">
        <p className="line-clamp-2 text-sm font-medium text-slate-900">
          {upload.caption || upload.storage_path || 'Untitled upload'}
        </p>
        {upload.created_at && (
          <p className="mt-2 text-xs text-slate-400">
            {formatDate(upload.created_at)}
          </p>
        )}
      </div>
    </div>
  );
}

// PortfolioSection Component (inner content only, no SectionCard wrapper)
function PortfolioSection({ uploads, onAddUpload }) {
  if (uploads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
        <div className="mb-3 h-2 w-32 rounded-full bg-slate-100" />
        <p className="text-sm text-slate-500">
          No portfolio uploads yet.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Add photos, PDFs, artwork, or assignments to build a learning portfolio.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {uploads.map(upload => (
        <UploadCard key={upload.id} upload={upload} />
      ))}
    </div>
  );
}

// EvidenceTimelineSection Component
function EvidenceTimelineSection({ attendanceData, grades, uploads }) {
  const timelineItems = useMemo(() => {
    const items = [];
    
    // Add attendance items
    attendanceData.forEach(record => {
      items.push({
        id: `attendance-${record.day_date}`,
        type: 'attendance',
        date: new Date(record.day_date),
        title: `${record.minutes} minutes - ${record.status}`,
        dateLabel: formatDate(record.day_date),
      });
    });
    
    // Add grade items
    grades.forEach(grade => {
      items.push({
        id: `grade-${grade.id}`,
        type: 'grade',
        date: new Date(grade.created_at),
        title: `${grade.subject?.name || 'Grade'}: ${grade.grade || 'Recorded'}`,
        dateLabel: formatDate(grade.created_at),
      });
    });
    
    // Add upload items
    uploads.forEach(upload => {
      items.push({
        id: `upload-${upload.id}`,
        type: 'upload',
        date: new Date(upload.created_at),
        title: upload.caption || 'Portfolio upload',
        dateLabel: formatDate(upload.created_at),
      });
    });
    
    // Sort by date descending and take latest 10
    return items
      .sort((a, b) => b.date - a.date)
      .slice(0, 10);
  }, [attendanceData, grades, uploads]);

  if (timelineItems.length === 0) return null;

  return (
    <SectionCard
      title="Evidence Timeline"
      description="Recent attendance, grades, and uploads."
    >
      <ol className="space-y-3 text-sm text-slate-600">
        {timelineItems.map(item => (
          <li key={item.id} className="flex gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-slate-400">{item.dateLabel}</p>
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

// CompliancePanel Component
function CompliancePanel({ 
  stateCode, 
  onStateChange, 
  stateRequirements, 
  US_STATES,
  gradeLevel,
  onGradeLevelChange,
  GRADE_LEVELS,
  selectedChildId,
  selectedSubject,
  onSubjectChange,
  subjects,
  standardsPreferences,
  standardsCoverage,
  standardsGaps,
  aiPlanSuggestions,
  loadingStandards,
  onSetPreference,
  onAiPlan,
  onOpenMappingModal,
}) {
  const hasActivePreference = standardsPreferences?.some(p => 
    p.state_code === stateCode && 
    p.grade_level === gradeLevel && 
    p.is_active
  );
  
  return (
    <aside 
      className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-4 xl:sticky xl:top-6"
      style={{
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        padding: '16px 20px',
        position: 'sticky',
        top: '24px',
        alignSelf: 'flex-start',
      }}
    >
      <div 
        className="border-b border-slate-200 pb-4 mb-4"
        style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}
      >
        <div 
          className="flex items-center justify-between"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Compliance</h2>
          <span 
            className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600"
            style={{
              display: 'inline-flex',
              borderRadius: '9999px',
              backgroundColor: '#ecfdf5',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: '500',
              color: '#059669',
            }}
          >
            Requirements tracked automatically
          </span>
        </div>
      </div>
      <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* State Selector */}
        <div>
          <p style={{ marginBottom: '8px', fontSize: '12px', fontWeight: '500', color: '#64748b', marginTop: 0 }}>State:</p>
          <div 
            className="flex max-h-40 flex-wrap gap-2 overflow-y-auto"
            style={{ 
              display: 'flex', 
              maxHeight: '160px', 
              flexWrap: 'wrap', 
              gap: '8px', 
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {US_STATES.map(state => (
              <button
                key={state}
                onClick={() => onStateChange(state)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                  stateCode === state
                    ? "border-indigo-200 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
                style={{
                  borderRadius: '8px',
                  border: `1px solid ${stateCode === state ? '#c7d2fe' : '#e2e8f0'}`,
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: stateCode === state ? '#4f46e5' : '#ffffff',
                  color: stateCode === state ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                  borderWidth: '1px',
                }}
              >
                {state}
              </button>
            ))}
          </div>
        </div>
        
        {/* Grade Level Selector */}
        {selectedChildId && (
          <div>
            <p style={{ marginBottom: '8px', fontSize: '12px', fontWeight: '500', color: '#64748b', marginTop: 0 }}>Grade Level:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {GRADE_LEVELS.map(grade => (
                <button
                  key={grade}
                  onClick={() => onGradeLevelChange(grade)}
                  className={clsx(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                    gradeLevel === grade
                      ? "border-indigo-200 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                  style={{
                    borderRadius: '8px',
                    border: `1px solid ${gradeLevel === grade ? '#c7d2fe' : '#e2e8f0'}`,
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: '500',
                    backgroundColor: gradeLevel === grade ? '#4f46e5' : '#ffffff',
                    color: gradeLevel === grade ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    borderWidth: '1px',
                  }}
                >
                  {grade}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Subject Filter */}
        {selectedChildId && subjects.length > 0 && (
          <div>
            <p style={{ marginBottom: '8px', fontSize: '12px', fontWeight: '500', color: '#64748b', marginTop: 0 }}>Subject Filter:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                onClick={() => onSubjectChange(null)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                  selectedSubject === null
                    ? "border-indigo-200 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
                style={{
                  borderRadius: '8px',
                  border: `1px solid ${selectedSubject === null ? '#c7d2fe' : '#e2e8f0'}`,
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: selectedSubject === null ? '#4f46e5' : '#ffffff',
                  color: selectedSubject === null ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                  borderWidth: '1px',
                }}
              >
                All Subjects
              </button>
              {subjects.map(subject => (
                <button
                  key={subject.id}
                  onClick={() => onSubjectChange(subject.id)}
                  className={clsx(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                    selectedSubject === subject.id
                      ? "border-indigo-200 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                  style={{
                    borderRadius: '8px',
                    border: `1px solid ${selectedSubject === subject.id ? '#c7d2fe' : '#e2e8f0'}`,
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: '500',
                    backgroundColor: selectedSubject === subject.id ? '#4f46e5' : '#ffffff',
                    color: selectedSubject === subject.id ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    borderWidth: '1px',
                  }}
                >
                  {subject.name}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Standards Coverage */}
        {selectedChildId && stateCode && gradeLevel && (
          <div 
            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            style={{
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              padding: '12px',
            }}
          >
            {!hasActivePreference ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ fontSize: '12px', fontWeight: '500', color: '#0f172a', margin: 0 }}>Standards Tracking</p>
                <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>
                  Set standards preference to track coverage for {stateCode} Grade {gradeLevel}
                </p>
                <button
                  onClick={onSetPreference}
                  disabled={loadingStandards}
                  className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    backgroundColor: '#4f46e5',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    color: '#ffffff',
                    border: 'none',
                    cursor: loadingStandards ? 'not-allowed' : 'pointer',
                    opacity: loadingStandards ? 0.5 : 1,
                  }}
                >
                  {loadingStandards ? 'Setting...' : 'Enable Standards Tracking'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '500', color: '#0f172a', margin: 0 }}>Standards Coverage</p>
                  {standardsCoverage ? (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', color: '#475569' }}>
                          {standardsCoverage.covered_standards} of {standardsCoverage.total_standards} standards
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#4f46e5' }}>
                          {standardsCoverage.coverage_percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ height: '8px', width: '100%', borderRadius: '9999px', backgroundColor: '#e2e8f0' }}>
                        <div
                          style={{ 
                            height: '8px', 
                            borderRadius: '9999px', 
                            backgroundColor: '#4f46e5',
                            width: `${Math.min(standardsCoverage.coverage_percentage, 100)}%`,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', marginBottom: 0 }}>Loading coverage...</p>
                  )}
                </div>
                
                        {standardsGaps.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <p style={{ fontSize: '12px', fontWeight: '500', color: '#0f172a', marginBottom: '4px', marginTop: 0 }}>
                              Gaps: {standardsGaps.length} standards not covered
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={onAiPlan}
                                disabled={loadingStandards}
                                className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                style={{
                                  flex: 1,
                                  borderRadius: '8px',
                                  backgroundColor: '#4f46e5',
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  color: '#ffffff',
                                  border: 'none',
                                  cursor: loadingStandards ? 'not-allowed' : 'pointer',
                                  opacity: loadingStandards ? 0.5 : 1,
                                }}
                              >
                                {loadingStandards ? 'Planning...' : 'AI Plan'}
                              </button>
                              {onOpenMappingModal && (
                                <button
                                  onClick={() => onOpenMappingModal('subject', null, selectedSubject)}
                                  className="flex-1 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                                  style={{
                                    flex: 1,
                                    borderRadius: '8px',
                                    border: '1px solid #a5b4fc',
                                    backgroundColor: '#ffffff',
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    color: '#4f46e5',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Map Standards
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                
                {aiPlanSuggestions && (
                  <div 
                    className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3"
                    style={{
                      marginTop: '12px',
                      borderRadius: '8px',
                      border: '1px solid #c7d2fe',
                      backgroundColor: '#eef2ff',
                      padding: '12px',
                    }}
                  >
                    <p style={{ fontSize: '12px', fontWeight: '600', color: '#312e81', marginBottom: '8px', marginTop: 0 }}>AI Suggestions</p>
                    <p style={{ fontSize: '12px', color: '#4338ca', marginBottom: '8px', marginTop: 0 }}>{aiPlanSuggestions.summary}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '128px', overflowY: 'auto' }}>
                      {aiPlanSuggestions.suggestions?.slice(0, 3).map((suggestion, idx) => (
                        <div key={idx} style={{ fontSize: '12px', color: '#1e1b4b' }}>
                          <span style={{ fontWeight: '500' }}>{suggestion.standard_code}:</span> {suggestion.rationale}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* State Requirements */}
        <div 
          className="border-t border-slate-200 pt-4"
          style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}
        >
          <p style={{ marginBottom: '8px', fontSize: '12px', fontWeight: '500', color: '#64748b', marginTop: 0 }}>State Requirements:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stateRequirements.length === 0 ? (
              <p style={{ padding: '16px 0', fontSize: '12px', fontStyle: 'italic', color: '#64748b', margin: 0 }}>
                No specific requirements found for {stateCode}. Check your state's homeschooling regulations.
              </p>
            ) : (
              stateRequirements.map(req => (
                <div 
                  key={req.id} 
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                  style={{
                    borderRadius: '8px',
                    border: '1px solid #f1f5f9',
                    backgroundColor: '#f8fafc',
                    padding: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    {req.type === 'required' && <CheckCircle2 size={16} style={{ marginTop: '2px', color: '#dc2626' }} />}
                    {req.type === 'info' && <FileText size={16} style={{ marginTop: '2px', color: '#4f46e5' }} />}
                    {req.type === 'optional' && <FileText size={16} style={{ marginTop: '2px', color: '#94a3b8' }} />}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '12px', fontWeight: '500', color: '#0f172a', margin: 0 }}>{req.label}</p>
                      {req.detail && (
                        <p style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', marginBottom: 0 }}>{req.detail}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function RecordsPhase4({ familyId }) {
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [children, setChildren] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [grades, setGrades] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [stateRequirements, setStateRequirements] = useState([]);
  const [stateCode, setStateCode] = useState('CA'); // Default to CA
  
  // Standards state
  const [gradeLevel, setGradeLevel] = useState('');
  const [selectedSubject, setSelectedSubject] = useState(null); // null = all subjects
  const [standardsPreferences, setStandardsPreferences] = useState([]);
  const [standardsCoverage, setStandardsCoverage] = useState(null);
  const [standardsGaps, setStandardsGaps] = useState([]);
  const [standardsList, setStandardsList] = useState([]);
  const [aiPlanSuggestions, setAiPlanSuggestions] = useState(null);
  const [loadingStandards, setLoadingStandards] = useState(false);
  
  // Curriculum mapping modal state
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingTarget, setMappingTarget] = useState(null); // { type: 'event'|'subject', id: uuid }
  const [selectedStandardsForMapping, setSelectedStandardsForMapping] = useState([]);
  
  // All 50 US states
  const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];
  
  // Grade levels
  const GRADE_LEVELS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), 0, 1), // Start of year
    end: new Date(),
  });

  // Modals
  const [showAddGradeModal, setShowAddGradeModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newGrade, setNewGrade] = useState({
    term_label: '',
    subject_id: null,
    grade: '',
    score: null,
    credits: null,
    rubric: '',
    notes: '',
  });
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [gradeOutcomes, setGradeOutcomes] = useState(null);
  const [showGradeOutcomesModal, setShowGradeOutcomesModal] = useState(false);
  const [lastTranscript, setLastTranscript] = useState(null);
  const [lastExportRange, setLastExportRange] = useState(null);
  const [newUpload, setNewUpload] = useState({
    file_path: '',
    caption: '',
    subject_id: null,
    event_id: null,
  });
  const [subjects, setSubjects] = useState([]);

  // Load children
  useEffect(() => {
    if (!familyId) return;
    
    const loadChildren = async () => {
      const { data, error } = await supabase
        .from('children')
        .select('id, first_name, grade')
        .eq('family_id', familyId)
        .eq('archived', false)
        .order('first_name');
      
      if (!error && data && data.length > 0) {
        setChildren(data);
        setSelectedChildId(data[0].id);
        // Set grade level from first child's grade, or default to '4'
        if (data[0].grade) {
          // Normalize grade: "3rd Grade" -> "3", "K" -> "K", etc.
          const normalizedGrade = data[0].grade.replace(/^(K|Kindergarten)$/i, 'K')
            .replace(/(\d+)(st|nd|rd|th)?\s*Grade/i, '$1')
            .trim();
          if (GRADE_LEVELS.includes(normalizedGrade)) {
            setGradeLevel(normalizedGrade);
          } else {
            // Try to extract just the number
            const match = data[0].grade.match(/(\d+)/);
            if (match && GRADE_LEVELS.includes(match[1])) {
              setGradeLevel(match[1]);
            } else {
              setGradeLevel('4'); // Default fallback
            }
          }
        } else {
          setGradeLevel('4'); // Default
        }
      }
    };
    
    loadChildren();
  }, [familyId]);

  // Load subjects
  useEffect(() => {
    if (!familyId) return;
    
    const loadSubjects = async () => {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      
      if (!error && data) {
        setSubjects(data);
      }
    };
    
    loadSubjects();
  }, [familyId]);

  // Load data when child or date range changes
  useEffect(() => {
    if (!selectedChildId) return;
    loadAllData();
    loadLastTranscript();
  }, [selectedChildId, dateRange]);

  // Load state requirements
  useEffect(() => {
    loadStateRequirements();
  }, [stateCode]);
  
  // Load standards data when child, state, grade, or subject changes
  useEffect(() => {
    if (selectedChildId && stateCode && gradeLevel) {
      loadStandardsData();
      loadStandardsList();
    }
  }, [selectedChildId, stateCode, gradeLevel, selectedSubject]);
  
  // Update grade level when selected child changes
  useEffect(() => {
    if (selectedChildId && children.length > 0) {
      const child = children.find(c => c.id === selectedChildId);
      if (child?.grade) {
        // Normalize grade: "3rd Grade" -> "3", "K" -> "K", etc.
        const normalizedGrade = child.grade.replace(/^(K|Kindergarten)$/i, 'K')
          .replace(/(\d+)(st|nd|rd|th)?\s*Grade/i, '$1')
          .trim();
        if (GRADE_LEVELS.includes(normalizedGrade)) {
          setGradeLevel(normalizedGrade);
        } else {
          // Try to extract just the number
          const match = child.grade.match(/(\d+)/);
          if (match && GRADE_LEVELS.includes(match[1])) {
            setGradeLevel(match[1]);
          } else {
            setGradeLevel('4'); // Default fallback
          }
        }
      }
    }
  }, [selectedChildId, children]);

  // Load last transcript export
  const loadLastTranscript = async () => {
    if (!selectedChildId) return;
    try {
      const transcript = await getLastTranscript(selectedChildId);
      setLastTranscript(transcript);
      if (transcript) {
        // Parse date range from export_url if possible
        const match = transcript.export_url.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/);
        if (match) {
          const startDate = new Date(match[1]);
          const endDate = new Date(match[2]);
          // Ensure dates are valid
          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            setLastExportRange({
              start: startDate,
              end: endDate
            });
          }
        }
      } else {
        setLastTranscript(null);
        setLastExportRange(null);
      }
    } catch (error) {
      // Silently handle errors - 403s are expected if no transcript exists
      if (error.code !== 'PGRST116') {
        console.error('Error loading last transcript:', error);
      }
      setLastTranscript(null);
      setLastExportRange(null);
    }
  };

  const loadAllData = async () => {
    if (!selectedChildId) return;
    setLoading(true);
    
    try {
      const [attendance, gradesData, uploadsData] = await Promise.all([
        getAttendanceTimeline(selectedChildId, dateRange.start, dateRange.end).catch(err => {
          console.error('Error loading attendance:', err);
          return []; // Return empty array on error
        }),
        getGrades(selectedChildId).catch(err => {
          console.error('Error loading grades:', err);
          return []; // Return empty array on error
        }),
        getPortfolioUploads(selectedChildId).catch(err => {
          console.error('Error loading uploads:', err);
          return []; // Return empty array on error
        }),
      ]);
      
      setAttendanceData(attendance || []);
      setGrades(gradesData || []);
      setUploads(uploadsData || []);
    } catch (error) {
      console.error('Error loading records data:', error);
      // Don't show alert - just log and use empty arrays
      setAttendanceData([]);
      setGrades([]);
      setUploads([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStateRequirements = async () => {
    try {
      const requirements = await getStateRequirements(stateCode);
      setStateRequirements(requirements);
    } catch (error) {
      console.error('Error loading state requirements:', error);
    }
  };
  
  const loadStandardsData = async () => {
    if (!selectedChildId || !stateCode || !gradeLevel) return;
    
    setLoadingStandards(true);
    try {
      // Load preferences
      const { data: prefsData } = await getStandardsPreferences(selectedChildId);
      setStandardsPreferences(prefsData || []);
      
      // Load coverage (with subject filter if selected)
      const { data: coverageData } = await getStandardsCoverage(
        selectedChildId, 
        stateCode, 
        gradeLevel, 
        selectedSubject || null
      );
      setStandardsCoverage(coverageData);
      
      // Load gaps (with subject filter if selected)
      const { data: gapsData } = await getStandardsGaps(
        selectedChildId, 
        stateCode, 
        gradeLevel, 
        selectedSubject || null, 
        10
      );
      setStandardsGaps(gapsData || []);
    } catch (error) {
      console.error('Error loading standards data:', error);
    } finally {
      setLoadingStandards(false);
    }
  };
  
  const loadStandardsList = async () => {
    if (!stateCode || !gradeLevel) return;
    
    try {
      const { data, error } = await getStandards(stateCode, gradeLevel, selectedSubject || null);
      if (!error && data) {
        setStandardsList(data);
      }
    } catch (error) {
      console.error('Error loading standards list:', error);
    }
  };
  
  const handleOpenMappingModal = async (type, id, subjectId = null) => {
    setMappingTarget({ type, id, subjectId });
    setSelectedStandardsForMapping([]);
    setShowMappingModal(true);
    setLoadingStandards(true);
    
    try {
      // Load standards for this subject if subjectId provided
      if (subjectId && stateCode && gradeLevel) {
        const subject = subjects.find(s => s.id === subjectId);
        if (subject) {
          // Map subject name to standards subject (e.g., "Mathematics" -> "Math")
          const standardsSubject = subject.name.toLowerCase().includes('math') ? 'Math' :
                                   subject.name.toLowerCase().includes('english') || subject.name.toLowerCase().includes('language') || subject.name.toLowerCase().includes('ela') ? 'ELA' :
                                   subject.name.toLowerCase().includes('science') ? 'Science' :
                                   subject.name.toLowerCase().includes('social') || subject.name.toLowerCase().includes('history') ? 'Social Studies' :
                                   null;
          if (standardsSubject) {
            const { data, error } = await getStandards(stateCode, gradeLevel, standardsSubject);
            if (!error && data) {
              setStandardsList(data);
            }
          } else {
            // If no match, load all standards
            await loadStandardsList();
          }
        } else {
          await loadStandardsList();
        }
      } else {
        await loadStandardsList();
      }
    } catch (error) {
      console.error('Error loading standards for mapping:', error);
    } finally {
      setLoadingStandards(false);
    }
  };
  
  const handleSaveMapping = async () => {
    if (!mappingTarget || selectedStandardsForMapping.length === 0) return;
    
    try {
      const promises = selectedStandardsForMapping.map(standardId =>
        createCurriculumMapping({
          child_id: selectedChildId,
          subject_id: mappingTarget.subjectId || null,
          event_id: mappingTarget.type === 'event' ? mappingTarget.id : null,
          standard_id: standardId,
          mapping_type: 'full',
        })
      );
      
      await Promise.all(promises);
      alert(`Mapped ${selectedStandardsForMapping.length} standard(s) successfully`);
      setShowMappingModal(false);
      setMappingTarget(null);
      setSelectedStandardsForMapping([]);
      // Reload standards data to update coverage
      await loadStandardsData();
    } catch (error) {
      console.error('Error saving mapping:', error);
      alert('Failed to save mapping');
    }
  };
  
  const handleSetStandardsPreference = async () => {
    if (!selectedChildId || !stateCode || !gradeLevel) {
      alert('Please select a child, state, and grade level');
      return;
    }
    
    try {
      const { data, error } = await setStandardsPreference({
        child_id: selectedChildId,
        state_code: stateCode,
        grade_level: gradeLevel,
      });
      
      if (error) throw error;
      
      // Reload standards data
      await loadStandardsData();
      alert('Standards preference set successfully');
    } catch (error) {
      console.error('Error setting standards preference:', error);
      alert('Failed to set standards preference');
    }
  };
  
  const handleAiPlan = async () => {
    if (!selectedChildId || !stateCode || !gradeLevel) return;
    
    setLoadingStandards(true);
    try {
      const { data, error } = await aiPlanStandards(selectedChildId, stateCode, gradeLevel, null, 10, 20);
      
      if (error) throw error;
      
      setAiPlanSuggestions(data);
    } catch (error) {
      console.error('Error generating AI plan:', error);
      alert('Failed to generate AI plan');
    } finally {
      setLoadingStandards(false);
    }
  };

  const handleAddGrade = async () => {
    if (!selectedChildId) {
      alert('Please select a child');
      return;
    }

    try {
      await addGrade({
        child_id: selectedChildId,
        ...newGrade,
      });
      
      alert('Grade added successfully');
      setShowAddGradeModal(false);
      setNewGrade({
        term_label: '',
        subject_id: null,
        grade: '',
        score: null,
        credits: null,
        rubric: '',
        notes: '',
      });
      loadAllData();
    } catch (error) {
      console.error('Error adding grade:', error);
      alert('Failed to add grade');
    }
  };

  const handleGradeClick = async (grade) => {
    setSelectedGrade(grade);
    setShowGradeOutcomesModal(true);
    try {
      const outcomes = await getGradeOutcomes(grade);
      setGradeOutcomes(outcomes);
    } catch (error) {
      console.error('Error loading grade outcomes:', error);
      setGradeOutcomes({ events: [], outcomes: [] });
    }
  };

  const handleGenerateTranscript = async () => {
    if (!selectedChildId) {
      alert('Please select a child');
      return;
    }

    // Use last export range if available, otherwise use current date range
    const rangeStart = lastExportRange?.start || dateRange.start;
    const rangeEnd = lastExportRange?.end || dateRange.end;

    try {
      const blob = await generateTranscript(selectedChildId, rangeStart, rangeEnd);
      
      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const childName = children.find(c => c.id === selectedChildId)?.first_name || 'student';
      a.download = `transcript_${childName}_${rangeStart.toISOString().split('T')[0]}_${rangeEnd.toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      alert('Transcript generated and downloaded');
      // Reload last transcript
      loadLastTranscript();
    } catch (error) {
      console.error('Error generating transcript:', error);
      alert('Failed to generate transcript');
    }
  };

  const handleAddUpload = async () => {
    if (!selectedChildId) {
      alert('Please select a child');
      return;
    }

    if (!newUpload.file_path) {
      alert('Please provide a file path');
      return;
    }

    try {
      await addPortfolioUpload({
        child_id: selectedChildId,
        ...newUpload,
      });
      
      alert('Upload added successfully');
      setShowUploadModal(false);
      setNewUpload({
        file_path: '',
        caption: '',
        subject_id: null,
        event_id: null,
      });
      loadAllData();
    } catch (error) {
      console.error('Error adding upload:', error);
      alert('Failed to add upload');
    }
  };

  const selectedChild = children.find(c => c.id === selectedChildId);

  return (
    <div className="flex-1 bg-slate-50" style={{ minHeight: '100vh', padding: '24px' }}>
      <div className="max-w-6xl mx-auto px-6 py-8" style={{ maxWidth: '1152px', margin: '0 auto', padding: '24px 32px' }}>
        <HeaderRow
          lastTranscript={lastTranscript}
          onExport={handleGenerateTranscript}
          selectedChildId={selectedChildId}
        />
        <StudentSelector
          students={children}
          activeId={selectedChildId}
          onSelect={setSelectedChildId}
        />

        {loading && (
          <div className="flex items-center justify-center py-20" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" style={{ height: '32px', width: '32px', borderRadius: '50%', border: '4px solid #e0e7ff', borderTopColor: '#4f46e5' }} />
          </div>
        )}

        {!loading && selectedChildId && (
          <div 
            className="mt-6 grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-6" 
            style={{ 
              marginTop: '24px', 
              display: 'grid', 
              gridTemplateColumns: '1fr', 
              gap: '24px',
            }}
          >
            {/* LEFT: Main scrollable sections */}
            <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <SectionCard
                icon={<Clock className="h-4 w-4" />}
                title="Attendance"
                description="Automatically fills as you mark lessons done on the planner."
              >
                <AttendanceSection attendanceData={attendanceData} />
              </SectionCard>

              <SectionCard
                icon={<Award className="h-4 w-4" />}
                title="Grades & Goals"
                description="Record grades, credits, and goals by subject and term."
                action={
                  <button
                    onClick={() => setShowAddGradeModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 transition hover:bg-slate-50"
                  >
                    <Plus size={14} />
                    <span>Add Grade</span>
                  </button>
                }
              >
                <GradesSection
                  grades={grades}
                  onAddGrade={() => setShowAddGradeModal(true)}
                  onGradeClick={handleGradeClick}
                />
              </SectionCard>

              <SectionCard
                icon={<Upload className="h-4 w-4" />}
                title="Portfolio Uploads"
                description="Store evidence—photos, PDFs, projects, and more."
                action={
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 transition hover:bg-slate-50"
                  >
                    <Plus size={14} />
                    <span>Add Upload</span>
                  </button>
                }
              >
                <PortfolioSection
                  uploads={uploads}
                  onAddUpload={() => setShowUploadModal(true)}
                />
              </SectionCard>

              <EvidenceTimelineSection
                attendanceData={attendanceData}
                grades={grades}
                uploads={uploads}
              />
            </div>

            {/* RIGHT: Compliance panel */}
            <CompliancePanel
              stateCode={stateCode}
              onStateChange={setStateCode}
              stateRequirements={stateRequirements}
              US_STATES={US_STATES}
              gradeLevel={gradeLevel}
              onGradeLevelChange={setGradeLevel}
              GRADE_LEVELS={GRADE_LEVELS}
              selectedChildId={selectedChildId}
              selectedSubject={selectedSubject}
              onSubjectChange={setSelectedSubject}
              subjects={subjects}
              standardsPreferences={standardsPreferences}
              standardsCoverage={standardsCoverage}
              standardsGaps={standardsGaps}
              aiPlanSuggestions={aiPlanSuggestions}
              loadingStandards={loadingStandards}
              onSetPreference={handleSetStandardsPreference}
              onAiPlan={handleAiPlan}
              onOpenMappingModal={handleOpenMappingModal}
            />
          </div>
        )}
      </div>

      {/* Add Grade Modal */}
      {showAddGradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg max-h-[80vh] rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Add Grade for {selectedChild?.first_name || 'Student'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Use this to track final grades or milestones for a term.
                </p>
              </div>
              <button
                onClick={() => setShowAddGradeModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Term Label
                  </label>
                  <input
                    type="text"
                    value={newGrade.term_label}
                    onChange={(e) => setNewGrade({ ...newGrade, term_label: e.target.value })}
                    placeholder="e.g. 2025–26 Semester 1"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Subject
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map(subject => (
                      <button
                        key={subject.id}
                        onClick={() => setNewGrade({ ...newGrade, subject_id: subject.id })}
                        className={clsx(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                          newGrade.subject_id === subject.id
                            ? "border-indigo-200 bg-indigo-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {subject.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Grade
                  </label>
                  <input
                    type="text"
                    value={newGrade.grade}
                    onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })}
                    placeholder="e.g. A, B+, Pass"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Score (optional)
                  </label>
                  <input
                    type="number"
                    value={newGrade.score?.toString() || ''}
                    onChange={(e) => setNewGrade({ ...newGrade, score: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="Numeric score"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Credits (optional)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newGrade.credits?.toString() || ''}
                    onChange={(e) => setNewGrade({ ...newGrade, credits: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="e.g. 1.0, 0.5"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Notes
                  </label>
                  <textarea
                    value={newGrade.notes}
                    onChange={(e) => setNewGrade({ ...newGrade, notes: e.target.value })}
                    placeholder="Additional notes"
                    rows={4}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setShowAddGradeModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGrade}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Add Grade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg max-h-[80vh] rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Add Upload for {selectedChild?.first_name || 'Student'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Upload photos, PDFs, or images to your child's portfolio.
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    File Path (Supabase Storage)
                  </label>
                  <input
                    type="text"
                    value={newUpload.file_path}
                    onChange={(e) => setNewUpload({ ...newUpload, file_path: e.target.value })}
                    placeholder="e.g. evidence/family_id/file.jpg"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Caption
                  </label>
                  <textarea
                    value={newUpload.caption}
                    onChange={(e) => setNewUpload({ ...newUpload, caption: e.target.value })}
                    placeholder="Description of the upload"
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Subject (optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map(subject => (
                      <button
                        key={subject.id}
                        onClick={() => setNewUpload({ ...newUpload, subject_id: subject.id })}
                        className={clsx(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                          newUpload.subject_id === subject.id
                            ? "border-indigo-200 bg-indigo-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {subject.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setShowUploadModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddUpload}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Add Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grade Outcomes Modal */}
      {showGradeOutcomesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl max-h-[80vh] rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                {selectedGrade?.subject?.name || 'Grade'} - Linked Events & Outcomes
              </h2>
              <button
                onClick={() => setShowGradeOutcomesModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {selectedGrade && (
                <div className="mb-6 flex flex-wrap gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-600">Term: </span>
                    <span className="text-sm text-slate-900">{selectedGrade.term_label || 'No term'}</span>
                  </div>
                  {selectedGrade.grade && (
                    <div>
                      <span className="text-xs font-semibold text-slate-600">Grade: </span>
                      <span className="text-sm text-slate-900">{selectedGrade.grade}</span>
                    </div>
                  )}
                  {selectedGrade.score !== null && (
                    <div>
                      <span className="text-xs font-semibold text-slate-600">Score: </span>
                      <span className="text-sm text-slate-900">{selectedGrade.score}</span>
                    </div>
                  )}
                </div>
              )}
              
              {gradeOutcomes && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-900">
                      Linked Events ({gradeOutcomes.events?.length || 0})
                    </h3>
                    {gradeOutcomes.events && gradeOutcomes.events.length > 0 ? (
                      <div className="space-y-2">
                        {gradeOutcomes.events.map(event => (
                          <div key={event.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                            <p className="text-sm font-medium text-slate-900">{event.title}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {new Date(event.start_ts).toLocaleDateString()} - {event.status}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No linked events found</p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-900">
                      Outcomes ({gradeOutcomes.outcomes?.length || 0})
                    </h3>
                    {gradeOutcomes.outcomes && gradeOutcomes.outcomes.length > 0 ? (
                      <div className="space-y-3">
                        {gradeOutcomes.outcomes.map(outcome => (
                          <div key={outcome.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                            <div className="mb-2 flex gap-3">
                              {outcome.rating && (
                                <span className="text-sm font-semibold text-indigo-600">
                                  Rating: {outcome.rating}/5
                                </span>
                              )}
                              {outcome.grade && (
                                <span className="text-sm font-semibold text-slate-600">
                                  Grade: {outcome.grade}
                                </span>
                              )}
                            </div>
                            {outcome.strengths && outcome.strengths.length > 0 && (
                              <div className="mb-2 flex flex-wrap gap-2">
                                <span className="text-xs font-semibold text-slate-600">Strengths:</span>
                                {outcome.strengths.map((s, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                            {outcome.struggles && outcome.struggles.length > 0 && (
                              <div className="mb-2 flex flex-wrap gap-2">
                                <span className="text-xs font-semibold text-slate-600">Struggles:</span>
                                {outcome.struggles.map((s, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                            {outcome.note && (
                              <p className="mt-2 text-xs italic text-slate-500">{outcome.note}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No outcomes recorded</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setShowGradeOutcomesModal(false)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Curriculum Mapping Modal */}
      {showMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl max-h-[80vh] rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                Map Standards to {mappingTarget?.type === 'event' ? 'Event' : 'Subject'}
              </h2>
              <button
                onClick={() => {
                  setShowMappingModal(false);
                  setMappingTarget(null);
                  setSelectedStandardsForMapping([]);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="mb-4">
                <p className="text-sm text-slate-600">
                  Select standards to map to this {mappingTarget?.type === 'event' ? 'event' : 'subject'}.
                  This will help track standards coverage automatically.
                </p>
              </div>
              
              {standardsList.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  {loadingStandards ? 'Loading standards...' : 'No standards available. Please select a state, grade, and subject.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {standardsList.map(standard => {
                    const isSelected = selectedStandardsForMapping.includes(standard.id);
                    return (
                      <div
                        key={standard.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedStandardsForMapping(prev => prev.filter(id => id !== standard.id));
                          } else {
                            setSelectedStandardsForMapping(prev => [...prev, standard.id]);
                          }
                        }}
                        className={clsx(
                          "cursor-pointer rounded-lg border p-3 transition",
                          isSelected
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-900">
                              {standard.code || standard.standard_code}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {standard.description || standard.standard_text}
                            </p>
                            {standard.domain && (
                              <p className="mt-1 text-[10px] text-slate-400">
                                Domain: {standard.domain}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => {
                  setShowMappingModal(false);
                  setMappingTarget(null);
                  setSelectedStandardsForMapping([]);
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMapping}
                disabled={selectedStandardsForMapping.length === 0 || loadingStandards}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {loadingStandards ? 'Saving...' : `Map ${selectedStandardsForMapping.length} Standard(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
