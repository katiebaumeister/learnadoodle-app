/**
 * Today's Quests Card - Shows today's events/quests
 */
import React from 'react';
import { Clock, Calendar } from 'lucide-react';

export default function TodaysQuestsCard({ data, child, onNavigate }) {
  const quests = data || [];
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  };
  
  const handleOpenSchedule = () => {
    if (onNavigate) {
      onNavigate('planner', null, { view: 'day', child: child?.id });
    } else if (typeof window !== 'undefined') {
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('planner', null, { view: 'day', child: child?.id });
      } else {
        window.history.replaceState({}, '', '/');
        window.dispatchEvent(new CustomEvent('navigateToPlanner', {
          detail: { view: 'day', childId: child?.id },
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
          Today's Quests
        </h3>
      </div>
      
      {quests.length === 0 ? (
        <div className="text-sm text-slate-500 mb-4" style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
          No quests for today. You can add one from the Planner.
        </div>
      ) : (
        <div className="space-y-2 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {quests.slice(0, 3).map(quest => (
            <div 
              key={quest.id} 
              className="flex items-center justify-between text-sm"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '14px' }}
            >
              <div className="flex-1">
                <div className="text-slate-700 font-medium" style={{ color: '#334155', fontWeight: '500' }}>
                  {quest.title}
                </div>
                {quest.subject && (
                  <div className="text-xs text-slate-500 mt-0.5" style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {quest.subject}
                  </div>
                )}
              </div>
              {quest.start && (
                <div className="flex items-center gap-1 text-slate-500 ml-2" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', marginLeft: '8px' }}>
                  <Clock size={12} />
                  <span className="text-xs" style={{ fontSize: '12px' }}>{formatTime(quest.start)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <button
        onClick={handleOpenSchedule}
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
        Open schedule →
      </button>
    </div>
  );
}

