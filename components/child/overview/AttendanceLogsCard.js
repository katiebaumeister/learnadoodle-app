/**
 * Attendance & Logs Card - Shows weekly attendance summary
 */
import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';

export default function AttendanceLogsCard({ data, child, onNavigate }) {
  const { daysLogged = 0, daysTarget = 5 } = data || {};
  const isAtRisk = daysLogged < daysTarget * 0.7;
  
  const handleOpenAttendance = () => {
    if (onNavigate) {
      onNavigate(`/records?tab=attendance&child=${child?.id}`);
    } else if (typeof window !== 'undefined') {
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('records', null, { tab: 'attendance', child: child?.id });
      } else {
        window.location.href = `/records?tab=attendance&child=${child?.id}`;
      }
    }
  };
  
  return (
    <div 
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      style={{
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        padding: '20px',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      <div className="flex items-center gap-2 mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Clock size={18} style={{ color: '#64748b' }} />
        <h3 
          className="text-sm font-semibold text-slate-900"
          style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}
        >
          Attendance & Logs
        </h3>
      </div>
      
      <div className="mb-4" style={{ marginBottom: '16px' }}>
        <div className="text-sm text-slate-700 mb-2" style={{ fontSize: '14px', color: '#334155', marginBottom: '8px' }}>
          <strong>{daysLogged}</strong> days logged this week (target {daysTarget})
        </div>
        
        {isAtRisk && (
          <div 
            className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 text-amber-800"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px',
              borderRadius: '8px',
              backgroundColor: '#fffbeb',
              color: '#92400e',
            }}
          >
            <AlertCircle size={14} />
            <span className="text-xs" style={{ fontSize: '12px' }}>
              Attendance is below target. Consider logging more days.
            </span>
          </div>
        )}
      </div>
      
      <button
        onClick={handleOpenAttendance}
        className="w-full text-sm font-medium text-indigo-600 hover:text-indigo-700 py-2 px-3 rounded-lg hover:bg-indigo-50 transition-colors"
        style={{
          width: '100%',
          fontSize: '14px',
          fontWeight: '500',
          color: '#4f46e5',
          padding: '8px 12px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#eef2ff';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
        }}
      >
        Open attendance & logs →
      </button>
    </div>
  );
}

