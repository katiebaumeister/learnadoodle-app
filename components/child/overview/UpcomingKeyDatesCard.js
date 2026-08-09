/**
 * Upcoming Key Dates Card - Shows important upcoming events
 */
import React from 'react';
import { Calendar, Clock } from 'lucide-react';

export default function UpcomingKeyDatesCard({ data, child, onNavigate }) {
  const upcomingDates = data || [];
  
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };
  
  const handleViewPlanner = () => {
    if (onNavigate) {
      onNavigate('planner', null, { view: 'month', child: child?.id });
    } else if (typeof window !== 'undefined') {
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('planner', null, { view: 'month', child: child?.id });
      } else {
        window.history.replaceState({}, '', '/');
        window.dispatchEvent(new CustomEvent('navigateToPlanner', {
          detail: { view: 'month', childId: child?.id },
        }));
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
        <Calendar size={18} style={{ color: '#64748b' }} />
        <h3 
          className="text-sm font-semibold text-slate-900"
          style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}
        >
          Upcoming Key Dates
        </h3>
      </div>
      
      {upcomingDates.length === 0 ? (
        <div className="text-sm text-slate-500 mb-4" style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
          No upcoming key dates.
        </div>
      ) : (
        <div className="space-y-2 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {upcomingDates.slice(0, 3).map((date, idx) => (
            <div 
              key={date.id || idx}
              className="flex items-start justify-between text-sm"
              style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', fontSize: '14px' }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-slate-700 font-medium" style={{ color: '#334155', fontWeight: '500' }}>
                  {date.title}
                </div>
                {date.label && (
                  <div className="text-xs text-slate-500 mt-0.5" style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {date.label}
                  </div>
                )}
              </div>
              {date.start && (
                <div className="flex items-center gap-1 text-slate-500 ml-2 flex-shrink-0" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', marginLeft: '8px' }}>
                  <Clock size={12} />
                  <span className="text-xs" style={{ fontSize: '12px' }}>{formatDate(date.start)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <button
        onClick={handleViewPlanner}
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
        View in Planner →
      </button>
    </div>
  );
}

