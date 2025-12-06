/**
 * Phase 4: Records, Credits & Compliance
 * Main Records component with attendance timeline, grades, portfolio uploads, and compliance
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Award, Upload, CheckCircle2, Download, Plus, X, FileText, Clock, Target, Map, BarChart3, GraduationCap, Calendar, Shield, Heart, FileCheck, ChevronDown, ChevronUp, ExternalLink, ChevronRight, Sliders, AlertCircle, Info } from 'lucide-react';
import ExportMenu from '../exports/ExportMenu';
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
  getDocuments,
  addDocument,
  deleteDocument,
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
import ComplianceDashboard from '../compliance/ComplianceDashboard';
import BehaviorAnalytics from '../analytics/BehaviorAnalytics';
import SkillGraph from '../analytics/SkillGraph';
import SkillStrengthsWeaknesses from '../analytics/SkillStrengthsWeaknesses';
import SkillHeatmap from '../analytics/SkillHeatmap';
import AcademicCoverageMap from '../accreditation/AcademicCoverageMap';
import MasteryCharts from '../accreditation/MasteryCharts';
import CollegeReadinessDashboard from '../accreditation/CollegeReadinessDashboard';

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

// Helper function to check if grade is >= 8th grade
const isGradeEightOrHigher = (gradeString) => {
  if (!gradeString) return false;
  
  // Normalize grade: "3rd Grade" -> "3", "K" -> "K", etc.
  const normalizedGrade = gradeString.replace(/^(K|Kindergarten)$/i, 'K')
    .replace(/(\d+)(st|nd|rd|th)?\s*Grade/i, '$1')
    .trim();
  
  // Check if it's a numeric grade >= 8
  const gradeNum = parseInt(normalizedGrade, 10);
  if (!isNaN(gradeNum) && gradeNum >= 8) {
    return true;
  }
  
  // Handle special cases: K-7 are below 8th grade
  const GRADE_LEVELS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const gradeIndex = GRADE_LEVELS.indexOf(normalizedGrade);
  return gradeIndex >= 7; // Index 7 is '8', so >= 7 means >= 8th grade
};

// SectionCard Component (kept for backward compatibility)
function SectionCard({ icon, title, description, action, children }) {
  return (
    <section 
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      style={{
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        padding: '24px',
      }}
    >
      <div 
        className="flex items-start justify-between gap-3 pb-2"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          paddingBottom: '8px',
          marginBottom: '0',
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
        className="pt-2"
        style={{ paddingTop: '8px' }}
      >
        {children}
      </div>
    </section>
  );
}

// RecordsSectionGroup Component - Collapsible grouped section
function RecordsSectionGroup({ 
  icon, 
  title, 
  subtitle, 
  action, 
  children, 
  defaultOpen = false,
  summary,
  onViewFull,
  viewFullLabel = "View full details →"
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section 
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      <div 
        className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          borderBottom: '1px solid #e2e8f0',
          padding: '16px 20px',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
          {icon && <div style={{ color: '#94a3b8', marginTop: '2px' }}>{icon}</div>}
          <div style={{ flex: 1 }}>
            <h2 
              className="text-sm font-semibold text-slate-900"
              style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}
            >
              {title}
            </h2>
            {subtitle && (
              <p 
                className="mt-1 text-xs text-slate-500"
                style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', marginBottom: 0 }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
          {isOpen ? (
            <ChevronUp size={16} style={{ color: '#64748b' }} />
          ) : (
            <ChevronDown size={16} style={{ color: '#64748b' }} />
          )}
        </div>
      </div>
      
      {/* Summary when collapsed */}
      {!isOpen && summary && (
        <div 
          className="px-5 py-4"
          style={{ padding: '16px 20px' }}
        >
          {summary}
          {onViewFull && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewFull();
              }}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              style={{
                marginTop: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#4f46e5',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {viewFullLabel}
              <ExternalLink size={14} />
            </button>
          )}
        </div>
      )}
      
      {/* Full content when expanded */}
      {isOpen && (
        <div 
          className="px-5 py-4 space-y-4"
          style={{ 
            padding: '16px 20px',
            animation: 'fadeIn 0.2s ease-in',
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

// Modal Component (reusable)
function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-4xl' }) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div 
        className={`w-full ${maxWidth} max-h-[80vh] rounded-xl bg-white shadow-xl overflow-hidden flex flex-col mx-auto`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: maxWidth === 'max-w-4xl' ? '896px' : maxWidth === 'max-w-3xl' ? '768px' : maxWidth === 'max-w-6xl' ? '1152px' : '672px',
          maxHeight: '80vh',
          borderRadius: '12px',
          backgroundColor: '#ffffff',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          margin: '0 auto',
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500" style={{ marginTop: '4px', fontSize: '14px', color: '#64748b', marginBottom: 0 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
            style={{
              color: '#94a3b8',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// TimelineModal Component
function TimelineModal({ isOpen, onClose, attendanceData, grades, uploads }) {
  const timelineItems = useMemo(() => {
    const items = [];
    
    attendanceData.forEach(record => {
      items.push({
        id: `attendance-${record.day_date}`,
        type: 'attendance',
        date: new Date(record.day_date),
        title: `${record.minutes} minutes - ${record.status}`,
        dateLabel: formatDate(record.day_date),
        badge: record.status === 'present' ? 'bg-emerald-100 text-emerald-700' : 
               record.status === 'partial' ? 'bg-amber-100 text-amber-700' : 
               'bg-slate-100 text-slate-600',
      });
    });
    
    grades.forEach(grade => {
      items.push({
        id: `grade-${grade.id}`,
        type: 'grade',
        date: new Date(grade.created_at),
        title: `${grade.subject?.name || 'Grade'}: ${grade.grade || 'Recorded'}`,
        dateLabel: formatDate(grade.created_at),
        badge: 'bg-indigo-100 text-indigo-700',
      });
    });
    
    uploads.forEach(upload => {
      items.push({
        id: `upload-${upload.id}`,
        type: 'upload',
        date: new Date(upload.created_at),
        title: upload.caption || 'Portfolio upload',
        dateLabel: formatDate(upload.created_at),
        badge: 'bg-blue-100 text-blue-700',
      });
    });
    
    return items.sort((a, b) => b.date - a.date);
  }, [attendanceData, grades, uploads]);

  const groupedByDate = timelineItems.reduce((acc, item) => {
    const dateKey = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(item);
    return acc;
  }, {});

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Full Activity Timeline"
      subtitle="Complete chronological view of all activities"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6">
        {Object.keys(groupedByDate).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-slate-500">No activity yet. As you complete lessons in the planner, your child's history will appear here.</p>
          </div>
        ) : (
          Object.entries(groupedByDate).map(([dateKey, items]) => (
            <div key={dateKey}>
              <h3 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">{dateKey}</h3>
              <ol className="space-y-3">
                {items.map(item => (
                  <li key={item.id} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${item.badge}`}>
                          {item.type}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

// PortfolioModal Component
function PortfolioModal({ isOpen, onClose, uploads, onAddUpload }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Portfolio Uploads"
      subtitle="All portfolio items and evidence"
      maxWidth="max-w-6xl"
    >
      <div className="mb-4 flex justify-end">
        <button
          onClick={onAddUpload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 transition hover:bg-slate-50"
        >
          <Plus size={14} />
          <span>Add Upload</span>
        </button>
      </div>
      {uploads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-slate-500">No portfolio uploads yet.</p>
          <p className="mt-1 text-xs text-slate-400">Add photos, PDFs, artwork, or assignments to build a learning portfolio.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {uploads.map(upload => (
            <div key={upload.id} className="group overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
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
          ))}
        </div>
      )}
    </Modal>
  );
}

// MasteryChartsModal Component
function MasteryChartsModal({ isOpen, onClose, selectedChildId, selectedSubject }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mastery Over Time"
      subtitle="Detailed mastery charts by skill and subject"
      maxWidth="max-w-6xl"
    >
      {selectedChildId ? (
        <MasteryCharts
          childId={selectedChildId}
          subjectId={selectedSubject}
          daysBack={365}
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-slate-500">No mastery data yet — add skill evidence to track mastery over time.</p>
        </div>
      )}
    </Modal>
  );
}

// StandardsModal Component
function StandardsModal({ isOpen, onClose, selectedChildId, stateCode, gradeLevel, selectedSubject, subjects, US_STATES, GRADE_LEVELS, onSetPreference, loadingStandards, onStateChange, onGradeLevelChange, onSubjectChange }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Standards Tracking"
      subtitle="Track coverage of state standards"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-6 overflow-y-auto max-h-[80vh]">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">State:</p>
          <div className="flex flex-wrap gap-1">
            {US_STATES.map(state => (
              <button
                key={state}
                onClick={() => onStateChange && onStateChange(state)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                  stateCode === state
                    ? "border-indigo-200 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {state}
              </button>
            ))}
          </div>
        </div>
        {selectedChildId && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Grade Level:</p>
            <div className="flex flex-wrap gap-1">
              {GRADE_LEVELS.map(grade => (
                <button
                  key={grade}
                  onClick={() => onGradeLevelChange && onGradeLevelChange(grade)}
                  className={clsx(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                    gradeLevel === grade
                      ? "border-indigo-200 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {grade}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedChildId && subjects.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Subject Filter:</p>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => onSubjectChange && onSubjectChange(null)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                  selectedSubject === null
                    ? "border-indigo-200 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                All Subjects
              </button>
              {subjects.map(subject => (
                <button
                  key={subject.id}
                  onClick={() => onSubjectChange && onSubjectChange(subject.id)}
                  className={clsx(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                    selectedSubject === subject.id
                      ? "border-indigo-200 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {subject.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedChildId && stateCode && gradeLevel && (
          <button
            onClick={onSetPreference}
            disabled={loadingStandards}
            className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loadingStandards ? 'Setting...' : 'Enable Standards Tracking'}
          </button>
        )}
      </div>
    </Modal>
  );
}

// HeaderRow Component (simplified - child selector moved to sticky bar)
function HeaderRow({ lastTranscript, onExport, selectedChildId, students, activeId, onSelect }) {
  return null; // Child selector is now in sticky bar above
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

// DocumentCard Component
function DocumentCard({ document, onDelete }) {
  const typeIcons = {
    medical_profile: <Heart size={16} className="text-red-500" />,
    id_card: <FileCheck size={16} className="text-blue-500" />,
    allergy_sheet: <Shield size={16} className="text-orange-500" />,
    vaccination_record: <FileText size={16} className="text-green-500" />,
    safety_plan: <Shield size={16} className="text-purple-500" />,
    permission_form: <FileText size={16} className="text-indigo-500" />,
    iep: <FileText size={16} className="text-teal-500" />,
    '504_plan': <FileText size={16} className="text-cyan-500" />,
    behavior_plan: <FileText size={16} className="text-pink-500" />,
    therapy_contact: <FileText size={16} className="text-yellow-500" />,
    other: <FileText size={16} className="text-slate-500" />,
  };

  const typeLabels = {
    medical_profile: 'Medical Profile',
    id_card: 'ID Card',
    allergy_sheet: 'Allergy Sheet',
    vaccination_record: 'Vaccination Record',
    safety_plan: 'Safety Plan',
    permission_form: 'Permission Form',
    iep: 'IEP',
    '504_plan': '504 Plan',
    behavior_plan: 'Behavior Plan',
    therapy_contact: 'Therapy Contact',
    other: 'Other',
  };

  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {typeIcons[document.type] || typeIcons.other}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {typeLabels[document.type] || 'Document'}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 line-clamp-2">
            {document.title}
          </p>
          {document.created_at && (
            <p className="mt-2 text-xs text-slate-400">
              {formatDate(document.created_at)}
            </p>
          )}
          {document.file_url && (
            <a
              href={document.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
            >
              <Download size={12} />
              <span>View</span>
            </a>
          )}
        </div>
        {onDelete && (
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this document?')) {
                onDelete(document.id);
              }
            }}
            className="flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
            title="Delete document"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// DocumentsSection Component (inner content only, no SectionCard wrapper)
function DocumentsSection({ documents, onAddDocument, onDeleteDocument }) {
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
        <div className="mb-3 h-2 w-32 rounded-full bg-slate-100" />
        <p className="text-sm text-slate-500">
          No essential documents yet.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Add medical profiles, ID cards, safety plans, and emergency information.
        </p>
      </div>
    );
  }

  // Organize documents by category
  const documentCategories = {
    'Medical & Health': ['medical_profile', 'allergy_sheet', 'vaccination_record'],
    'Identification': ['id_card'],
    'Educational Plans': ['iep', '504_plan', 'behavior_plan'],
    'Safety & Permissions': ['safety_plan', 'permission_form'],
    'Support Services': ['therapy_contact'],
    'Other': ['other']
  };

  // Group documents by category
  const categorizedDocs = {};
  Object.entries(documentCategories).forEach(([category, types]) => {
    categorizedDocs[category] = documents.filter(doc => types.includes(doc.type));
  });

  // Sort documents within each category by date (newest first)
  Object.keys(categorizedDocs).forEach(category => {
    categorizedDocs[category].sort((a, b) => {
      const dateA = new Date(a.created_at || a.updated_at || 0);
      const dateB = new Date(b.created_at || b.updated_at || 0);
      return dateB - dateA;
    });
  });

  return (
    <div className="space-y-6">
      {Object.entries(categorizedDocs).map(([category, docs]) => {
        if (docs.length === 0) return null;
        
        return (
          <div key={category}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                {category}
              </h3>
              <span className="text-xs text-slate-400">
                {docs.length} {docs.length === 1 ? 'document' : 'documents'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map(doc => (
                <DocumentCard key={doc.id} document={doc} onDelete={onDeleteDocument} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// WeeklySummaryCard Component
function WeeklySummaryCard({ attendanceData, uploads, grades }) {
  const weekStats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekAttendance = attendanceData.filter(record => {
      const recordDate = new Date(record.day_date);
      return recordDate >= weekStart;
    });
    
    const weekUploads = uploads.filter(upload => {
      const uploadDate = new Date(upload.created_at);
      return uploadDate >= weekStart;
    });
    
    const weekGrades = grades.filter(grade => {
      const gradeDate = new Date(grade.created_at);
      return gradeDate >= weekStart;
    });
    
    const totalMinutes = weekAttendance.reduce((sum, r) => sum + (r.minutes || 0), 0);
    const hours = Math.floor(totalMinutes / 60);
    const eventsCompleted = weekAttendance.filter(r => r.status === 'present' || r.status === 'partial').length;
    
    return {
      hours,
      eventsCompleted,
      uploadsCount: weekUploads.length,
      gradesCount: weekGrades.length,
    };
  }, [attendanceData, uploads, grades]);

  return (
    <SectionCard
      title="This week at a glance"
      description="Summary of this week's activity"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Hours this week</p>
          <p className="text-2xl font-semibold text-slate-900">{weekStats.hours}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Events completed</p>
          <p className="text-2xl font-semibold text-slate-900">{weekStats.eventsCompleted}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">New portfolio uploads</p>
          <p className="text-2xl font-semibold text-slate-900">{weekStats.uploadsCount}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Grades recorded</p>
          <p className="text-2xl font-semibold text-slate-900">{weekStats.gradesCount}</p>
        </div>
      </div>
    </SectionCard>
  );
}

// ActivityTimelineCard Component (replaces EvidenceTimelineSection)
function ActivityTimelineCard({ attendanceData, grades, uploads }) {
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
        badge: record.status === 'present' ? 'bg-emerald-100 text-emerald-700' : 
               record.status === 'partial' ? 'bg-amber-100 text-amber-700' : 
               'bg-slate-100 text-slate-600',
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
        badge: 'bg-indigo-100 text-indigo-700',
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
        badge: 'bg-blue-100 text-blue-700',
      });
    });
    
    // Sort by date descending
    return items.sort((a, b) => b.date - a.date);
  }, [attendanceData, grades, uploads]);

  if (timelineItems.length === 0) {
    return (
      <SectionCard
        title="Activity timeline"
        description="Chronological view of attendance, uploads, and grades"
      >
        <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            No activity yet. As you complete lessons in the planner, your child's history will appear here.
          </p>
        </div>
      </SectionCard>
    );
  }

  // Group by date
  const groupedByDate = timelineItems.reduce((acc, item) => {
    const dateKey = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(item);
    return acc;
  }, {});

  return (
    <SectionCard
      title="Activity timeline"
      description="Chronological view of attendance, uploads, and grades"
    >
      <div className="space-y-6">
        {Object.entries(groupedByDate).map(([dateKey, items]) => (
          <div key={dateKey}>
            <h3 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">{dateKey}</h3>
            <ol className="space-y-3">
              {items.map(item => (
                <li key={item.id} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${item.badge}`}>
                        {item.type}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// Empty state component for consistent styling
function EmptyState({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
      {icon && <div className="mb-2" style={{ color: '#94a3b8' }}>{icon}</div>}
      {title && <p className="text-sm font-medium text-slate-700">{title}</p>}
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
  );
}

// SnapshotCard Component
function SnapshotCard({ selectedChildId, attendanceData, uploads, documents, complianceData }) {
  const totalHours = useMemo(() => {
    const totalMinutes = attendanceData.reduce((sum, r) => sum + (r.minutes || 0), 0);
    return Math.floor(totalMinutes / 60);
  }, [attendanceData]);

  return (
    <SectionCard
      title="At-a-glance"
      description="Quick snapshot of key metrics"
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Hours logged</p>
          <p className="text-lg font-semibold text-slate-900">{totalHours}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Portfolio artifacts</p>
          <p className="text-lg font-semibold text-slate-900">{uploads.length}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Essential documents</p>
          <p className="text-lg font-semibold text-slate-900">{documents.length}</p>
        </div>
      </div>
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
  const [documents, setDocuments] = useState([]);
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
  const [showAddDocumentModal, setShowAddDocumentModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [showMasteryChartsModal, setShowMasteryChartsModal] = useState(false);
  const [showStandardsModal, setShowStandardsModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [newDocument, setNewDocument] = useState({
    type: 'medical_profile',
    title: '',
    file_url: '',
    metadata: {},
  });
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
      const [attendance, gradesData, uploadsData, documentsData] = await Promise.all([
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
        getDocuments(selectedChildId).catch(err => {
          console.error('Error loading documents:', err);
          return []; // Return empty array on error
        }),
      ]);
      
      setAttendanceData(attendance || []);
      setGrades(gradesData || []);
      setUploads(uploadsData || []);
      setDocuments(documentsData || []);
    } catch (error) {
      console.error('Error loading records data:', error);
      // Don't show alert - just log and use empty arrays
      setAttendanceData([]);
      setGrades([]);
      setUploads([]);
      setDocuments([]);
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

  const handleAddDocument = async () => {
    if (!selectedChildId) {
      alert('Please select a child');
      return;
    }

    if (!newDocument.title) {
      alert('Please provide a document title');
      return;
    }

    try {
      await addDocument({
        child_id: selectedChildId,
        ...newDocument,
      });
      
      alert('Document added successfully');
      setShowAddDocumentModal(false);
      setNewDocument({
        type: 'medical_profile',
        title: '',
        file_url: '',
        metadata: {},
      });
      loadAllData();
    } catch (error) {
      console.error('Error adding document:', error);
      alert('Failed to add document. Please try again.');
    }
  };

  const selectedChild = children.find(c => c.id === selectedChildId);

  // Calculate summaries (moved to top level to avoid Rules of Hooks violation)
  const attendanceSummary = useMemo(() => {
    const totalMinutes = attendanceData.reduce((sum, r) => sum + (r.minutes || 0), 0);
    const hours = Math.floor(totalMinutes / 60);
    const presentDays = attendanceData.filter(r => r.status === 'present' || r.status === 'partial').length;
    return { hours, presentDays, totalDays: attendanceData.length };
  }, [attendanceData]);

  const timelineItems = useMemo(() => {
    const items = [];
    attendanceData.slice(0, 5).forEach(record => {
      items.push({
        id: `attendance-${record.day_date}`,
        type: 'attendance',
        date: new Date(record.day_date),
        title: `${record.minutes} minutes - ${record.status}`,
        dateLabel: formatDate(record.day_date),
      });
    });
    grades.slice(0, 3).forEach(grade => {
      items.push({
        id: `grade-${grade.id}`,
        type: 'grade',
        date: new Date(grade.created_at),
        title: `${grade.subject?.name || 'Grade'}: ${grade.grade || 'Recorded'}`,
        dateLabel: formatDate(grade.created_at),
      });
    });
    uploads.slice(0, 3).forEach(upload => {
      items.push({
        id: `upload-${upload.id}`,
        type: 'upload',
        date: new Date(upload.created_at),
        title: upload.caption || 'Portfolio upload',
        dateLabel: formatDate(upload.created_at),
      });
    });
    return items.sort((a, b) => b.date - a.date).slice(0, 5);
  }, [attendanceData, grades, uploads]);

  const gradesSummary = useMemo(() => {
    const totalCredits = grades.reduce((sum, g) => sum + (parseFloat(g.credits) || 0), 0);
    const avgScore = grades.filter(g => g.score !== null).length > 0
      ? grades.filter(g => g.score !== null).reduce((sum, g) => sum + (g.score || 0), 0) / grades.filter(g => g.score !== null).length
      : null;
    return { totalCredits, avgScore, count: grades.length };
  }, [grades]);

  // Calculate readiness metrics
  const readinessMetrics = useMemo(() => {
    const totalMinutes = attendanceData.reduce((sum, r) => sum + (r.minutes || 0), 0);
    const attendanceHours = Math.floor(totalMinutes / 60);
    const attendanceDays = attendanceData.length;
    const portfolioCount = uploads.length;
    const creditsCount = grades.reduce((sum, g) => sum + (parseFloat(g.credits) || 0), 0);
    const subjectsWithCredits = new Set(grades.map(g => g.subject_id).filter(Boolean)).size;
    
    // Calculate readiness score (simplified - based on having portfolio and credits)
    const hasPortfolio = portfolioCount > 0;
    const hasCredits = creditsCount > 0;
    const hasAttendance = attendanceHours > 0;
    const readinessScore = Math.round(((hasPortfolio ? 25 : 0) + (hasCredits ? 25 : 0) + (hasAttendance ? 25 : 0) + 25));
    
    return {
      attendanceHours,
      attendanceDays,
      portfolioCount,
      creditsCount,
      subjectsWithCredits,
      readinessScore,
    };
  }, [attendanceData, uploads, grades]);

  // Calculate subject coverage percentages
  const subjectCoverage = useMemo(() => {
    if (!subjects.length || !grades.length) return [];
    
    // Common subject names mapping
    const subjectNameMap = {
      'Math': ['Math', 'Mathematics', 'Maths'],
      'ELA': ['English', 'ELA', 'Language Arts', 'English Language Arts'],
      'Science': ['Science'],
      'History': ['History', 'Social Studies', 'Social Science'],
    };
    
    const coverage = [];
    Object.keys(subjectNameMap).forEach(subjectName => {
      const matchingSubjects = subjects.filter(s => 
        subjectNameMap[subjectName].some(name => 
          s.name.toLowerCase().includes(name.toLowerCase())
        )
      );
      
      if (matchingSubjects.length > 0) {
        const subjectIds = matchingSubjects.map(s => s.id);
        const subjectGrades = grades.filter(g => subjectIds.includes(g.subject_id));
        const totalCredits = subjectGrades.reduce((sum, g) => sum + (parseFloat(g.credits) || 0), 0);
        // Assume 1 credit = 100% for a full year course, so calculate percentage
        const percentage = Math.min(100, Math.round((totalCredits / 1) * 100)); // Simplified calculation
        coverage.push({
          name: subjectName,
          percentage: percentage || 0,
          credits: totalCredits,
        });
      } else {
        coverage.push({
          name: subjectName,
          percentage: 0,
          credits: 0,
        });
      }
    });
    
    return coverage;
  }, [subjects, grades]);

  // Generate "What's Missing" callouts
  const whatsMissingCallouts = useMemo(() => {
    const callouts = [];
    
    if (readinessMetrics.portfolioCount < 3) {
      callouts.push({
        icon: AlertCircle,
        message: `Add your first ${3 - readinessMetrics.portfolioCount} portfolio artifacts to boost readiness.`,
        type: 'info',
      });
    }
    
    const weeklyHours = readinessMetrics.attendanceHours / Math.max(1, Math.ceil((new Date() - dateRange.start) / (1000 * 60 * 60 * 24 * 7)));
    if (weeklyHours < 5) {
      callouts.push({
        icon: Clock,
        message: `Only ${readinessMetrics.attendanceHours} hours logged this week – need help tracking attendance?`,
        type: 'warning',
      });
    }
    
    if (readinessMetrics.subjectsWithCredits === 0) {
      callouts.push({
        icon: Info,
        message: 'Transcript incomplete: no subjects added yet.',
        type: 'info',
      });
    }
    
    return callouts.slice(0, 3); // Max 3 callouts
  }, [readinessMetrics, dateRange]);

  // Get state profile info
  const stateProfile = useMemo(() => {
    const stateNames = {
      'CA': 'California',
      'NY': 'New York',
      'TX': 'Texas',
      'FL': 'Florida',
    };
    
    const oversightLevels = {
      'CA': 'Moderate oversight',
      'NY': 'Moderate oversight',
      'TX': 'Moderate oversight',
      'FL': 'Moderate oversight',
    };
    
    const requiredSubjects = stateRequirements.length || 0;
    const requirements = [];
    if (readinessMetrics.portfolioCount > 0) requirements.push('Portfolio');
    if (readinessMetrics.attendanceHours > 0) requirements.push('Attendance');
    
    return {
      stateName: stateNames[stateCode] || stateCode,
      oversight: oversightLevels[stateCode] || 'Moderate oversight',
      requiredSubjects,
      requirements: requirements.join(' + ') || 'None',
    };
  }, [stateCode, stateRequirements, readinessMetrics]);

  // Render compliance content (no tabs)
  const renderComplianceContent = () => {
    if (!selectedChildId) return null;

    const selectedChild = children.find(c => c.id === selectedChildId);

    return (
      <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* State Profile Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" style={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', padding: '16px', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
          <div className="flex items-center gap-3 flex-wrap" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span className="text-sm font-semibold text-slate-900" style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
              {stateProfile.stateName}
            </span>
            <span className="text-slate-400" style={{ color: '#94a3b8' }}>•</span>
            <span className="text-sm text-slate-600" style={{ fontSize: '14px', color: '#475569' }}>
              {stateProfile.oversight}
            </span>
            <span className="text-slate-400" style={{ color: '#94a3b8' }}>•</span>
            <span className="text-sm text-slate-600" style={{ fontSize: '14px', color: '#475569' }}>
              {stateProfile.requiredSubjects} required subjects
            </span>
            <span className="text-slate-400" style={{ color: '#94a3b8' }}>•</span>
            <span className="text-sm text-slate-600" style={{ fontSize: '14px', color: '#475569' }}>
              {stateProfile.requirements}
            </span>
          </div>
        </div>

        {/* Export Button */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowExportMenu(true)}
            style={{
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Download size={16} />
            Export Documents
          </button>
        </div>

        {/* What's Missing Callouts */}
        {whatsMissingCallouts.length > 0 && (
          <div className="space-y-1.5" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {whatsMissingCallouts.map((callout, idx) => {
              const Icon = callout.icon;
              const isAttendance = callout.message.includes('hours logged') || callout.message.includes('attendance');
              return (
                <div 
                  key={idx}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex items-start gap-3"
                  style={{ 
                    borderRadius: '8px', 
                    border: '1px solid #e2e8f0', 
                    backgroundColor: callout.type === 'warning' ? '#fef3c7' : '#f8fafc', 
                    padding: '10px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <Icon size={16} style={{ color: callout.type === 'warning' ? '#d97706' : '#64748b', marginTop: '2px', flexShrink: 0, width: '16px' }} />
                  <div className="flex-1 flex items-start gap-2" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1 }}>
                    {isAttendance && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '9999px', backgroundColor: '#fef3c7', padding: '2px 8px', fontSize: '11px', fontWeight: '500', color: '#92400e', flexShrink: 0 }}>
                        Attendance
                      </span>
                    )}
                    <p className="text-sm text-slate-700" style={{ fontSize: '14px', color: '#334155', margin: 0 }}>
                      {callout.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Readiness Meter Card */}
        <SectionCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          title="Readiness Meter"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-semibold text-slate-900" style={{ fontSize: '24px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                  {readinessMetrics.readinessScore}%
                </p>
                <p className="text-xs text-slate-500 mt-1" style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', marginBottom: 0 }}>
                  {readinessMetrics.readinessScore >= 80 ? 'You\'re in great shape!' :
                   readinessMetrics.readinessScore >= 60 ? 'Almost there!' :
                   'Keep working on it!'}
                </p>
              </div>
              <p className="text-xs text-slate-400" style={{ fontSize: '11px', color: '#94a3b8', margin: 0, whiteSpace: 'nowrap' }}>
                Last updated: {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </p>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2" style={{ width: '100%', backgroundColor: '#e2e8f0', borderRadius: '9999px', height: '8px' }}>
              <div 
                className="bg-indigo-600 h-2 rounded-full transition-all"
                style={{
                  width: `${readinessMetrics.readinessScore}%`,
                  backgroundColor: '#4f46e5',
                  height: '8px',
                  borderRadius: '9999px',
                }}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 rounded-lg border border-slate-200 overflow-hidden" style={{ borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div className="bg-slate-50 p-3 border-r border-b border-slate-200 md:border-b-0" style={{ backgroundColor: '#f8fafc', padding: '12px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                <div className="flex items-center gap-2 mb-1" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Clock size={16} style={{ color: '#64748b' }} />
                  <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Attendance</p>
                </div>
                <p className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                  {readinessMetrics.attendanceHours}h
                </p>
                <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
                  {readinessMetrics.attendanceDays} days
                </p>
              </div>
              <div className="bg-slate-50 p-3 border-b border-slate-200 md:border-b-0 md:border-r" style={{ backgroundColor: '#f8fafc', padding: '12px', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                <div className="flex items-center gap-2 mb-1" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <FileText size={16} style={{ color: '#64748b' }} />
                  <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Portfolio</p>
                </div>
                <p className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                  {readinessMetrics.portfolioCount}
                </p>
                <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
                  artifacts
                </p>
              </div>
              <div className="bg-slate-50 p-3 border-r border-slate-200" style={{ backgroundColor: '#f8fafc', padding: '12px', borderRight: '1px solid #e2e8f0' }}>
                <div className="flex items-center gap-2 mb-1" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Award size={16} style={{ color: '#64748b' }} />
                  <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Credits</p>
                </div>
                <p className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                  {readinessMetrics.creditsCount.toFixed(1)}
                </p>
                <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
                  {readinessMetrics.subjectsWithCredits} subjects
                </p>
              </div>
              <div className="bg-slate-50 p-3" style={{ backgroundColor: '#f8fafc', padding: '12px' }}>
                <div className="flex items-center gap-2 mb-1" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <FileCheck size={16} style={{ color: '#64748b' }} />
                  <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Checklist</p>
                </div>
                <p className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                  2/2
                </p>
                <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
                  complete
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Academic & Requirements Card */}
        <SectionCard
          icon={<Map className="h-4 w-4" />}
          title="Academic & Requirements"
          description="See how well your subjects and standards are covered this year."
        >
          <div className="space-y-6">
            {/* Subject Coverage Progress Bars */}
            {subjectCoverage.length > 0 && (
              <div className="space-y-3">
                {subjectCoverage.map((subject, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700" style={{ fontSize: '14px', fontWeight: '500', color: '#334155' }}>
                        {subject.name}
                      </span>
                      <span className="text-sm text-slate-600" style={{ fontSize: '14px', color: '#475569' }}>
                        {subject.percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2" style={{ width: '100%', backgroundColor: '#e2e8f0', borderRadius: '9999px', height: '8px' }}>
                      <div 
                        className="bg-indigo-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${subject.percentage}%`,
                          backgroundColor: '#4f46e5',
                          height: '8px',
                          borderRadius: '9999px',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Coverage and Standards Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <button
                onClick={() => setShowStandardsModal(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <ChevronRight size={16} style={{ color: '#64748b', flexShrink: 0 }} />
                <span>View Coverage</span>
              </button>
              <button
                onClick={() => setShowStandardsModal(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <Sliders size={16} style={{ color: '#64748b', flexShrink: 0 }} />
                <span>View Standards</span>
              </button>
            </div>
          </div>
        </SectionCard>

        {/* Required Tasks Card */}
        <SectionCard
          icon={<FileCheck className="h-4 w-4" />}
          title="Required Tasks"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600" style={{ fontSize: '14px', color: '#475569', margin: 0 }}>
              2 / 2 complete
            </p>
            <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3" style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', padding: '12px' }}>
                <CheckCircle2 size={20} style={{ color: '#10b981', flexShrink: 0 }} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700" style={{ fontSize: '14px', fontWeight: '500', color: '#334155', margin: 0 }}>
                    Maintain Portfolio
                  </p>
                  <p className="text-xs text-slate-500 mt-1" style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', marginBottom: 0 }}>
                    Last updated: {uploads.length > 0 ? formatDate(uploads[0]?.created_at) : 'Never'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3" style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', padding: '12px' }}>
                <CheckCircle2 size={20} style={{ color: '#10b981', flexShrink: 0 }} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700" style={{ fontSize: '14px', fontWeight: '500', color: '#334155', margin: 0 }}>
                    Keep Transcripts
                  </p>
                  <p className="text-xs text-slate-500 mt-1" style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', marginBottom: 0 }}>
                    {grades.length > 0 ? `${grades.length} grades recorded` : 'No grades yet'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Exports Card */}
        <SectionCard
          icon={<Download className="h-4 w-4" />}
          title="Exports"
          description="Download documents you can share with schools, districts, or umbrella programs."
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              <button
                onClick={handleGenerateTranscript}
                disabled={!selectedChildId}
                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  borderRadius: '8px',
                  backgroundColor: '#4f46e5',
                  padding: '10px 16px',
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
              <button
                disabled={!selectedChildId}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#334155',
                  cursor: selectedChildId ? 'pointer' : 'not-allowed',
                  opacity: selectedChildId ? 1 : 0.5,
                }}
              >
                <Download size={16} />
                <span>Export Compliance Packet</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 text-center" style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', margin: 0 }}>
              <a href="#" className="hover:text-indigo-600 transition" style={{ color: '#64748b', textDecoration: 'none' }} onMouseEnter={(e) => e.target.style.color = '#4f46e5'} onMouseLeave={(e) => e.target.style.color = '#64748b'}>
                Need something else exported? Request a format.
              </a>
            </p>
          </div>
        </SectionCard>

        {/* Footer Links */}
        <div className="flex items-center gap-4 text-sm text-slate-600" style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px', color: '#475569' }}>
          <a href="#" className="hover:text-indigo-600 transition" style={{ color: '#475569', textDecoration: 'none' }} onMouseEnter={(e) => e.target.style.color = '#4f46e5'} onMouseLeave={(e) => e.target.style.color = '#475569'}>
            See detailed schedule →
          </a>
          <span className="text-slate-300" style={{ color: '#cbd5e1' }}>•</span>
          <a href="#" className="hover:text-indigo-600 transition" style={{ color: '#475569', textDecoration: 'none' }} onMouseEnter={(e) => e.target.style.color = '#4f46e5'} onMouseLeave={(e) => e.target.style.color = '#475569'}>
            See mastery timeline →
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-slate-50" style={{ minHeight: '100vh', padding: '24px' }}>
      <div className="max-w-6xl mx-auto px-6 py-8" style={{ maxWidth: '1152px', margin: '0 auto', padding: '24px 32px' }}>
        {/* Sticky Child Selector */}
        <div className="sticky top-0 z-10 bg-slate-50 pb-4 mb-6" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8fafc', paddingBottom: '16px', marginBottom: '24px' }}>
          <div className="flex items-center justify-between gap-4 mb-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <h1 
                className="text-2xl font-semibold text-slate-900"
                style={{ fontSize: '24px', fontWeight: '600', color: '#0f172a', margin: 0 }}
              >
                Compliance & Records
              </h1>
              <p 
                className="mt-1 text-sm text-slate-500"
                style={{ marginTop: '4px', fontSize: '14px', color: '#64748b', marginBottom: 0 }}
              >
                See how your family's learning lines up with your state requirements and export documentation when needed.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChildId(child.id)}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                  selectedChildId === child.id
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '9999px',
                  border: `1px solid ${selectedChildId === child.id ? '#c7d2fe' : '#e2e8f0'}`,
                  padding: '6px 12px',
                  fontSize: '14px',
                  backgroundColor: selectedChildId === child.id ? '#eef2ff' : '#ffffff',
                  color: selectedChildId === child.id ? '#4338ca' : '#475569',
                  fontWeight: selectedChildId === child.id ? '500' : '400',
                  cursor: 'pointer',
                }}
              >
                <span>{child.first_name}</span>
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" style={{ height: '32px', width: '32px', borderRadius: '50%', border: '4px solid #e0e7ff', borderTopColor: '#4f46e5' }} />
          </div>
        )}

        {!loading && selectedChildId && (
          <>
            {renderComplianceContent()}
          </>
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

      {/* Add Document Modal */}
      {showAddDocumentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg max-h-[80vh] rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Add Document for {selectedChild?.first_name || 'Student'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Add medical profiles, ID cards, safety plans, and emergency information.
                </p>
              </div>
              <button
                onClick={() => setShowAddDocumentModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Document Type
                  </label>
                  <select
                    value={newDocument.type}
                    onChange={(e) => setNewDocument({ ...newDocument, type: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="medical_profile">Medical Profile</option>
                    <option value="id_card">ID Card</option>
                    <option value="allergy_sheet">Allergy Sheet</option>
                    <option value="vaccination_record">Vaccination Record</option>
                    <option value="safety_plan">Safety Plan</option>
                    <option value="permission_form">Permission Form</option>
                    <option value="iep">IEP</option>
                    <option value="504_plan">504 Plan</option>
                    <option value="behavior_plan">Behavior Plan</option>
                    <option value="therapy_contact">Therapy Contact</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newDocument.title}
                    onChange={(e) => setNewDocument({ ...newDocument, title: e.target.value })}
                    placeholder="e.g. Medical Profile Card"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    File URL (Supabase Storage - Optional)
                  </label>
                  <input
                    type="text"
                    value={newDocument.file_url}
                    onChange={(e) => setNewDocument({ ...newDocument, file_url: e.target.value })}
                    placeholder="e.g. https://storage.supabase.co/..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Upload the file to Supabase Storage first, then paste the URL here.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setShowAddDocumentModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDocument}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Add Document
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

      {/* Timeline Modal */}
      <TimelineModal
        isOpen={showTimelineModal}
        onClose={() => setShowTimelineModal(false)}
        attendanceData={attendanceData}
        grades={grades}
        uploads={uploads}
      />

      {/* Portfolio Modal */}
      <PortfolioModal
        isOpen={showPortfolioModal}
        onClose={() => setShowPortfolioModal(false)}
        uploads={uploads}
        onAddUpload={() => {
          setShowPortfolioModal(false);
          setShowUploadModal(true);
        }}
      />

      {/* Mastery Charts Modal */}
      <MasteryChartsModal
        isOpen={showMasteryChartsModal}
        onClose={() => setShowMasteryChartsModal(false)}
        selectedChildId={selectedChildId}
        selectedSubject={selectedSubject}
      />

      {/* Standards Modal */}
      <StandardsModal
        isOpen={showStandardsModal}
        onClose={() => setShowStandardsModal(false)}
        selectedChildId={selectedChildId}
        stateCode={stateCode}
        gradeLevel={gradeLevel}
        selectedSubject={selectedSubject}
        subjects={subjects}
        US_STATES={US_STATES}
        GRADE_LEVELS={GRADE_LEVELS}
        onSetPreference={handleSetStandardsPreference}
        loadingStandards={loadingStandards}
        onStateChange={setStateCode}
        onGradeLevelChange={setGradeLevel}
        onSubjectChange={setSelectedSubject}
      />

      {/* Export Menu */}
      <ExportMenu
        isOpen={showExportMenu}
        onClose={() => setShowExportMenu(false)}
        familyId={familyId}
        children={children}
        defaultChildId={selectedChildId}
      />
    </div>
  );
}

// Export reusable components for child tabs
export { 
  SectionCard, 
  RecordsSectionGroup, 
  EmptyState, 
  WeeklySummaryCard, 
  ActivityTimelineCard,
  AttendanceSection,
  DocumentsSection,
  DocumentCard,
  Modal,
  TimelineModal,
  PortfolioModal,
  MasteryChartsModal,
  StandardsModal,
};
