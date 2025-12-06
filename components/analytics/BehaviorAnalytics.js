/**
 * Behavior Analytics Component
 * Shows behavior tag trends and insights over time
 */
import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Brain, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Helper function for conditional classes
const clsx = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

const BEHAVIOR_TAGS = ['Focused', 'Distracted', 'Excited', 'Overwhelmed'];
const TAG_COLORS = {
  'Focused': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  'Distracted': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  'Excited': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  'Overwhelmed': { bg: '#e0e7ff', border: '#6366f1', text: '#312e81' },
};

export default function BehaviorAnalytics({ childId, daysBack = 30 }) {
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState(daysBack);

  useEffect(() => {
    if (childId) {
      loadBehaviorTrends();
    }
  }, [childId, timeRange]);

  const loadBehaviorTrends = async () => {
    if (!childId) return;
    
    setLoading(true);
    try {
      // Use the RPC function to get trends
      const { data, error } = await supabase.rpc('get_behavior_trends', {
        _child_id: childId,
        _days_back: timeRange,
      });

      if (error) throw error;
      setTrends(data || []);
    } catch (error) {
      console.error('Error loading behavior trends:', error);
      setTrends([]);
    } finally {
      setLoading(false);
    }
  };

  const totalCount = useMemo(() => {
    return trends.reduce((sum, t) => sum + (parseInt(t.count) || 0), 0);
  }, [trends]);

  const getTagData = (tag) => {
    return trends.find(t => t.behavior_tag === tag) || { count: 0, percentage: 0, avg_rating: null };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" style={{ height: '24px', width: '24px', borderRadius: '50%', border: '4px solid #e0e7ff', borderTopColor: '#4f46e5' }} />
      </div>
    );
  }

  if (trends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', textAlign: 'center' }}>
        <Brain size={48} className="text-slate-300 mb-4" />
        <p className="text-sm text-slate-500" style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          No behavior data yet
        </p>
        <p className="mt-1 text-xs text-slate-400" style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8', marginBottom: 0 }}>
          Add behavior tags when completing events to see trends here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Time Range Selector */}
      <div className="flex items-center justify-between" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
          Behavior Trends
        </h3>
        <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
          {[7, 30, 90].map(days => (
            <button
              key={days}
              onClick={() => setTimeRange(days)}
              className={clsx(
                "rounded-lg border px-3 py-1 text-xs font-medium transition",
                timeRange === days
                  ? "border-indigo-200 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
              style={{
                borderRadius: '8px',
                border: `1px solid ${timeRange === days ? '#c7d2fe' : '#e2e8f0'}`,
                padding: '4px 12px',
                fontSize: '12px',
                fontWeight: '500',
                backgroundColor: timeRange === days ? '#4f46e5' : '#ffffff',
                color: timeRange === days ? '#ffffff' : '#475569',
                cursor: 'pointer',
              }}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {/* Behavior Tag Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {BEHAVIOR_TAGS.map(tag => {
          const tagData = getTagData(tag);
          const colors = TAG_COLORS[tag];
          const count = parseInt(tagData.count) || 0;
          const percentage = parseFloat(tagData.percentage) || 0;
          const avgRating = tagData.avg_rating ? parseFloat(tagData.avg_rating).toFixed(1) : null;

          return (
            <div
              key={tag}
              className="rounded-lg border p-4"
              style={{
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bg,
                padding: '16px',
              }}
            >
              <div className="flex items-center justify-between mb-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h4 className="text-sm font-semibold" style={{ fontSize: '14px', fontWeight: '600', color: colors.text, margin: 0 }}>
                  {tag}
                </h4>
                {count > 0 && (
                  <span className="text-xs font-medium" style={{ fontSize: '12px', fontWeight: '500', color: colors.text + '80' }}>
                    {percentage.toFixed(0)}%
                  </span>
                )}
              </div>
              
              <div className="flex items-baseline gap-2 mb-2" style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                <span className="text-2xl font-bold" style={{ fontSize: '24px', fontWeight: '700', color: colors.text, margin: 0 }}>
                  {count}
                </span>
                <span className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b' }}>
                  sessions
                </span>
              </div>

              {avgRating && (
                <div className="flex items-center gap-1" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="text-xs text-slate-600" style={{ fontSize: '12px', color: '#475569' }}>
                    Avg rating:
                  </span>
                  <span className="text-xs font-semibold" style={{ fontSize: '12px', fontWeight: '600', color: colors.text }}>
                    {avgRating}/5
                  </span>
                </div>
              )}

              {/* Progress bar */}
              {totalCount > 0 && (
                <div className="mt-3 h-2 rounded-full bg-white/50" style={{ marginTop: '12px', height: '8px', borderRadius: '9999px', backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                  <div
                    style={{
                      height: '8px',
                      borderRadius: '9999px',
                      backgroundColor: colors.border,
                      width: `${Math.min(percentage, 100)}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Insights */}
      {trends.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" style={{ borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', padding: '16px' }}>
          <h4 className="text-sm font-semibold text-slate-900 mb-2" style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px', marginTop: 0 }}>
            Insights
          </h4>
          <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(() => {
              const focused = getTagData('Focused');
              const distracted = getTagData('Distracted');
              const excited = getTagData('Excited');
              const overwhelmed = getTagData('Overwhelmed');
              
              const insights = [];
              
              if (focused.percentage > 50) {
                insights.push({
                  icon: <TrendingUp size={16} className="text-emerald-600" />,
                  text: `Great focus! ${focused.percentage.toFixed(0)}% of sessions were focused.`,
                  color: 'text-emerald-700',
                });
              }
              
              if (distracted.percentage > 30) {
                insights.push({
                  icon: <AlertCircle size={16} className="text-red-600" />,
                  text: `Distraction noted in ${distracted.percentage.toFixed(0)}% of sessions. Consider shorter sessions or breaks.`,
                  color: 'text-red-700',
                });
              }
              
              if (excited.percentage > 40) {
                insights.push({
                  icon: <Brain size={16} className="text-amber-600" />,
                  text: `High engagement! ${excited.percentage.toFixed(0)}% of sessions showed excitement.`,
                  color: 'text-amber-700',
                });
              }
              
              if (overwhelmed.percentage > 25) {
                insights.push({
                  icon: <AlertCircle size={16} className="text-indigo-600" />,
                  text: `Overwhelm detected in ${overwhelmed.percentage.toFixed(0)}% of sessions. Consider breaking tasks into smaller chunks.`,
                  color: 'text-indigo-700',
                });
              }
              
              if (insights.length === 0) {
                insights.push({
                  icon: <Brain size={16} className="text-slate-400" />,
                  text: 'Continue tracking behavior to see insights here.',
                  color: 'text-slate-600',
                });
              }
              
              return insights.map((insight, idx) => (
                <div key={idx} className="flex items-start gap-2" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  {insight.icon}
                  <p className={`text-xs ${insight.color}`} style={{ fontSize: '12px', color: insight.color.includes('emerald') ? '#047857' : insight.color.includes('red') ? '#991b1b' : insight.color.includes('amber') ? '#92400e' : insight.color.includes('indigo') ? '#312e81' : '#475569', margin: 0 }}>
                    {insight.text}
                  </p>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

