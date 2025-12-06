/**
 * Child Hero Card - Shows "Today for {child}" with streak, minutes, next event, and insight
 */
import React from 'react';
import { Clock, Flame, Lightbulb } from 'lucide-react';

export default function ChildHeroCard({ child, today, insights }) {
  const childName = child?.first_name || child?.name || 'Your child';
  const streakDays = today?.streakDays || 0;
  const minutesToday = today?.minutesToday || 0;
  const minutesTarget = today?.minutesTarget || 0;
  const nextEvent = today?.nextEvent;
  const primaryInsight = insights?.primaryInsight;
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  };
  
  return (
    <div 
      className="rounded-xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-sm"
      style={{
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        // Use backgroundImage instead of background to avoid RN Web warning
        backgroundImage: 'linear-gradient(to bottom right, #eef2ff, #ffffff)',
        padding: '24px',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      <h2 
        className="text-xl font-semibold text-slate-900 mb-4"
        style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}
      >
        Today for {childName}
      </h2>
      
      <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Streak */}
        {streakDays > 0 && (
          <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flame size={16} style={{ color: '#f59e0b' }} />
            <span className="text-sm text-slate-700" style={{ fontSize: '14px', color: '#334155' }}>
              {streakDays}-day streak
            </span>
          </div>
        )}
        
        {/* Today's minutes */}
        <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} style={{ color: '#6366f1' }} />
          <span className="text-sm text-slate-700" style={{ fontSize: '14px', color: '#334155' }}>
            {minutesToday} mins logged {minutesTarget > 0 ? `/ ${minutesTarget} mins planned` : ''}
          </span>
        </div>
        
        {/* Next event */}
        {nextEvent && (
          <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} style={{ color: '#6366f1' }} />
            <span className="text-sm text-slate-700" style={{ fontSize: '14px', color: '#334155' }}>
              Next up: <strong>{nextEvent.title}</strong>
              {nextEvent.start && ` at ${formatTime(nextEvent.start)}`}
            </span>
          </div>
        )}
        
        {/* Primary insight */}
        {primaryInsight && (
          <div 
            className="flex items-start gap-2 mt-2 p-3 bg-indigo-50 rounded-lg"
            style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '8px', 
              marginTop: '8px',
              padding: '12px',
              backgroundColor: '#eef2ff',
              borderRadius: '8px',
            }}
          >
            <Lightbulb size={16} style={{ color: '#6366f1', marginTop: '2px', flexShrink: 0 }} />
            <span className="text-sm text-slate-700" style={{ fontSize: '14px', color: '#334155' }}>
              {primaryInsight}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

