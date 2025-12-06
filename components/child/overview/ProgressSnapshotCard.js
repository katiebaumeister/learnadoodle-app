/**
 * Progress Snapshot Card - Shows weekly progress and subject status
 */
import React from 'react';
import { Target, TrendingUp, AlertCircle } from 'lucide-react';

export default function ProgressSnapshotCard({ data, child, onNavigate }) {
  const { attendanceStatus, subjectStatus = [] } = data || {};
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'on_track':
        return { bg: '#dcfce7', text: '#166534', icon: '✓' };
      case 'slightly_behind':
        return { bg: '#fef3c7', text: '#92400e', icon: '⚠' };
      case 'at_risk':
        return { bg: '#fee2e2', text: '#991b1b', icon: '✗' };
      default:
        return { bg: '#f1f5f9', text: '#475569', icon: '○' };
    }
  };
  
  const getStatusLabel = (status) => {
    switch (status) {
      case 'on_track':
        return 'On track';
      case 'slightly_behind':
        return 'Slightly behind';
      case 'at_risk':
        return 'At risk';
      default:
        return 'Unknown';
    }
  };
  
  const overallStatusColor = getStatusColor(attendanceStatus || 'on_track');
  
  const handleOpenAnalytics = () => {
    if (onNavigate) {
      onNavigate(`/intelligence?tab=analytics&child=${child?.id}`);
    } else if (typeof window !== 'undefined') {
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('intelligence', null, { tab: 'analytics', child: child?.id });
      } else {
        window.location.href = `/intelligence?tab=analytics&child=${child?.id}`;
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
        <Target size={18} style={{ color: '#64748b' }} />
        <h3 
          className="text-sm font-semibold text-slate-900"
          style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}
        >
          Progress Snapshot
        </h3>
      </div>
      
      {/* Overall status */}
      <div 
        className="mb-4 p-3 rounded-lg"
        style={{
          marginBottom: '16px',
          padding: '12px',
          borderRadius: '8px',
          backgroundColor: overallStatusColor.bg,
        }}
      >
        <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{overallStatusColor.icon}</span>
          <span 
            className="text-sm font-medium"
            style={{ fontSize: '14px', fontWeight: '500', color: overallStatusColor.text }}
          >
            {getStatusLabel(attendanceStatus || 'on_track')}
          </span>
        </div>
      </div>
      
      {/* Subject status */}
      {subjectStatus.length > 0 ? (
        <div className="space-y-2 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {subjectStatus.slice(0, 4).map((subject, idx) => {
            const statusColor = getStatusColor(subject.status);
            return (
              <div 
                key={subject.subject_id || idx}
                className="flex items-center justify-between text-sm"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '14px' }}
              >
                <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', color: statusColor.text }}>{statusColor.icon}</span>
                  <span className="text-slate-700" style={{ color: '#334155' }}>
                    {subject.subject || 'Unassigned'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-slate-500 mb-4" style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
          No subject data available yet.
        </div>
      )}
      
      <button
        onClick={handleOpenAnalytics}
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
        Open analytics →
      </button>
    </div>
  );
}

