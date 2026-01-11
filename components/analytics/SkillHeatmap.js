/**
 * Skill Heatmap Component
 * Shows skill mastery over time as a heatmap visualization
 */
import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Calendar, Target } from 'lucide-react';
import { getSkillHeatmap } from '../../lib/services/skillsClient';

// Helper function for conditional classes
const clsx = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

const PROFICIENCY_COLORS = {
  'beginner': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', intensity: 0.2 },
  'developing': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', intensity: 0.4 },
  'proficient': { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', intensity: 0.6 },
  'advanced': { bg: '#d1fae5', border: '#10b981', text: '#065f46', intensity: 0.8 },
  'expert': { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6', intensity: 1.0 },
};

export default function SkillHeatmap({ childId, subjectId = null, daysBack = 90, groupBy = 'week' }) {
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(daysBack);

  useEffect(() => {
    if (childId) {
      loadHeatmapData();
    }
  }, [childId, subjectId, timeRange, groupBy]);

  const loadHeatmapData = async () => {
    if (!childId) return;
    
    setLoading(true);
    setError(null);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);
      
      const result = await getSkillHeatmap(childId, {
        subject_id: subjectId,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        group_by: groupBy,
      });
      
      if (result.error) throw result.error;
      setHeatmapData(result.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load skill heatmap');
      setHeatmapData([]);
    } finally {
      setLoading(false);
    }
  };

  // Pivot data: periods (rows) x skills (columns)
  const pivotedData = useMemo(() => {
    const periodsMap = new Map();
    const skillsSet = new Set();
    
    heatmapData.forEach(row => {
      const periodKey = row.period_start;
      const skillKey = row.skill_id;
      
      skillsSet.add(skillKey);
      
      if (!periodsMap.has(periodKey)) {
        periodsMap.set(periodKey, {
          period_start: periodKey,
          skills: {},
        });
      }
      
      periodsMap.get(periodKey).skills[skillKey] = {
        skill_name: row.skill_name,
        skill_category: row.skill_category,
        avg_confidence: parseFloat(row.avg_confidence) || 0,
        evidence_count: parseInt(row.evidence_count) || 0,
        proficiency: row.proficiency || 'beginner',
      };
    });
    
    const periods = Array.from(periodsMap.values()).sort((a, b) => 
      new Date(a.period_start) - new Date(b.period_start)
    );
    
    const skills = Array.from(skillsSet).map(skillId => {
      // Get skill name from first occurrence
      const firstRow = heatmapData.find(r => r.skill_id === skillId);
      return {
        id: skillId,
        name: firstRow?.skill_name || 'Unknown',
        category: firstRow?.skill_category || 'other',
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    
    return { periods, skills };
  }, [heatmapData]);

  const getProficiencyColor = (proficiency) => {
    return PROFICIENCY_COLORS[proficiency] || PROFICIENCY_COLORS['beginner'];
  };

  const getIntensity = (avgConfidence, evidenceCount) => {
    if (evidenceCount === 0) return 0;
    // Scale intensity based on confidence (0-5) and evidence presence
    return Math.min(avgConfidence / 5, 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" style={{ height: '32px', width: '32px', borderRadius: '50%', border: '4px solid #e0e7ff', borderTopColor: '#4f46e5' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4" style={{ borderRadius: '8px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', padding: '16px' }}>
        <p className="text-sm text-red-800" style={{ fontSize: '14px', color: '#991b1b', margin: 0 }}>
          {error}
        </p>
      </div>
    );
  }

  if (pivotedData.periods.length === 0 || pivotedData.skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', textAlign: 'center' }}>
        <Target size={48} className="text-slate-300 mb-4" />
        <p className="text-sm text-slate-500" style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          No skill data yet
        </p>
        <p className="mt-1 text-xs text-slate-400" style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8', marginBottom: 0 }}>
          Add skill evidence to see mastery over time
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Time Range Selector */}
      <div className="flex items-center justify-between" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="text-lg font-semibold text-slate-900" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
          Skill Mastery Over Time
        </h3>
        <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
          {[30, 90, 180, 365].map(days => (
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

      {/* Heatmap */}
      <div className="overflow-x-auto" style={{ overflowX: 'auto' }}>
        <div className="min-w-full" style={{ minWidth: '100%' }}>
          {/* Header Row */}
          <div className="flex border-b border-slate-200" style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            <div className="w-24 p-2 text-xs font-semibold text-slate-600 sticky left-0 bg-white z-10" style={{ width: '96px', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#475569', position: 'sticky', left: 0, backgroundColor: '#ffffff', zIndex: 10 }}>
              {groupBy === 'week' ? 'Week' : 'Month'}
            </div>
            {pivotedData.skills.map(skill => (
              <div
                key={skill.id}
                className="w-20 p-2 text-xs font-medium text-slate-700 text-center"
                style={{
                  width: '80px',
                  padding: '8px',
                  fontSize: '12px',
                  fontWeight: '500',
                  color: '#334155',
                  textAlign: 'center',
                }}
                title={skill.name}
              >
                <div className="truncate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {skill.name}
                </div>
              </div>
            ))}
          </div>

          {/* Data Rows */}
          {pivotedData.periods.map(period => {
            const periodDate = new Date(period.period_start);
            const periodLabel = groupBy === 'week' 
              ? `${periodDate.getMonth() + 1}/${periodDate.getDate()}`
              : periodDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            
            return (
              <div
                key={period.period_start}
                className="flex border-b border-slate-100 hover:bg-slate-50"
                style={{
                  display: 'flex',
                  borderBottom: '1px solid #f1f5f9',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div className="w-24 p-2 text-xs text-slate-600 sticky left-0 bg-white z-10" style={{ width: '96px', padding: '8px', fontSize: '12px', color: '#475569', position: 'sticky', left: 0, backgroundColor: '#ffffff', zIndex: 10 }}>
                  {periodLabel}
                </div>
                {pivotedData.skills.map(skill => {
                  const skillData = period.skills[skill.id];
                  if (!skillData || skillData.evidence_count === 0) {
                    return (
                      <div
                        key={skill.id}
                        className="w-20 h-12 border border-slate-100 bg-slate-50"
                        style={{
                          width: '80px',
                          height: '48px',
                          border: '1px solid #f1f5f9',
                          backgroundColor: '#f8fafc',
                        }}
                        title={`${skill.name}: No data`}
                      />
                    );
                  }
                  
                  const colors = getProficiencyColor(skillData.proficiency);
                  const intensity = getIntensity(skillData.avg_confidence, skillData.evidence_count);
                  
                  return (
                    <div
                      key={skill.id}
                      className="w-20 h-12 border border-slate-200 cursor-pointer transition-all hover:scale-105"
                      style={{
                        width: '80px',
                        height: '48px',
                        border: `1px solid ${colors.border}`,
                        backgroundColor: colors.bg,
                        opacity: Math.max(0.3, intensity),
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      title={`${skill.name}: ${skillData.proficiency} (${skillData.avg_confidence.toFixed(1)}/5, ${skillData.evidence_count} evidence)`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <span className="text-xs font-medium text-slate-600" style={{ fontSize: '12px', fontWeight: '500', color: '#475569' }}>
          Proficiency:
        </span>
        {Object.entries(PROFICIENCY_COLORS).map(([level, colors]) => (
          <div key={level} className="flex items-center gap-1" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div
              className="w-4 h-4 rounded border"
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '4px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bg,
              }}
            />
            <span className="text-xs text-slate-600 capitalize" style={{ fontSize: '12px', color: '#475569', textTransform: 'capitalize' }}>
              {level}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-4" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '16px' }}>
          <div
            className="w-4 h-4 rounded border bg-slate-50"
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '4px',
              border: '1px solid #f1f5f9',
              backgroundColor: '#f8fafc',
            }}
          />
          <span className="text-xs text-slate-600" style={{ fontSize: '12px', color: '#475569' }}>
            No data
          </span>
        </div>
      </div>
    </div>
  );
}

