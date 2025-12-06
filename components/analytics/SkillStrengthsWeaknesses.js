/**
 * Skill Strengths & Weaknesses Chart Component
 * Visualizes skill strengths and areas for improvement
 */
import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Target, Award, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { getStrengthsWeaknesses } from '../../lib/services/skillsClient';

// Helper function for conditional classes
const clsx = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

const TREND_ICONS = {
  'improving': TrendingUp,
  'stable': Minus,
  'declining': TrendingDown,
};

const TREND_COLORS = {
  'improving': { icon: '#10b981', bg: '#d1fae5', text: '#065f46' },
  'stable': { icon: '#6b7280', bg: '#f3f4f6', text: '#374151' },
  'declining': { icon: '#ef4444', bg: '#fee2e2', text: '#991b1b' },
};

export default function SkillStrengthsWeaknesses({ childId, subjectId = null, onNavigateToEvidence = null }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'strengths', 'weaknesses'

  useEffect(() => {
    if (childId) {
      loadStrengthsWeaknesses();
    }
  }, [childId, subjectId]);

  const loadStrengthsWeaknesses = async () => {
    if (!childId) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await getStrengthsWeaknesses(childId, { subject_id: subjectId });
      if (result.error) throw result.error;
      setSkills(result.data || []);
    } catch (err) {
      console.error('Error loading strengths/weaknesses:', err);
      setError(err.message || 'Failed to load strengths and weaknesses');
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredSkills = useMemo(() => {
    if (filter === 'strengths') {
      return skills.filter(s => s.is_strength);
    } else if (filter === 'weaknesses') {
      return skills.filter(s => s.is_weakness);
    }
    return skills;
  }, [skills, filter]);

  const strengths = useMemo(() => skills.filter(s => s.is_strength), [skills]);
  const weaknesses = useMemo(() => skills.filter(s => s.is_weakness), [skills]);

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

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', textAlign: 'center' }}>
        <Target size={48} className="text-slate-300 mb-4" style={{ color: '#cbd5e1', marginBottom: '16px' }} />
        <p className="text-sm text-slate-500" style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          No skill analysis available yet
        </p>
        <p className="mt-1 text-xs text-slate-400 mb-4" style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
          Add skill evidence to see strengths and areas for improvement
        </p>
        {onNavigateToEvidence && (
          <button
            onClick={onNavigateToEvidence}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '8px',
              border: '1px solid #c7d2fe',
              backgroundColor: '#eef2ff',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#4338ca',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            <Award size={16} />
            <span>Add Skill Evidence</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4" style={{ borderRadius: '8px', border: '1px solid #a7f3d0', backgroundColor: '#ecfdf5', padding: '16px' }}>
          <div className="flex items-center gap-2 mb-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <CheckCircle size={20} className="text-emerald-600" />
            <h3 className="text-sm font-semibold text-emerald-900" style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', margin: 0 }}>
              Strengths
            </h3>
          </div>
          <p className="text-2xl font-bold text-emerald-700" style={{ fontSize: '24px', fontWeight: '700', color: '#047857', margin: 0 }}>
            {strengths.length}
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4" style={{ borderRadius: '8px', border: '1px solid #fde68a', backgroundColor: '#fffbeb', padding: '16px' }}>
          <div className="flex items-center gap-2 mb-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Minus size={20} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900" style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', margin: 0 }}>
              Developing
            </h3>
          </div>
          <p className="text-2xl font-bold text-amber-700" style={{ fontSize: '24px', fontWeight: '700', color: '#b45309', margin: 0 }}>
            {skills.length - strengths.length - weaknesses.length}
          </p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4" style={{ borderRadius: '8px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', padding: '16px' }}>
          <div className="flex items-center gap-2 mb-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertCircle size={20} className="text-red-600" />
            <h3 className="text-sm font-semibold text-red-900" style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b', margin: 0 }}>
              Areas to Improve
            </h3>
          </div>
          <p className="text-2xl font-bold text-red-700" style={{ fontSize: '24px', fontWeight: '700', color: '#b91c1c', margin: 0 }}>
            {weaknesses.length}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0' }}>
        {['all', 'strengths', 'weaknesses'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 transition",
              filter === f
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              borderBottom: `2px solid ${filter === f ? '#6366f1' : 'transparent'}`,
              color: filter === f ? '#4f46e5' : '#64748b',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Skills List */}
      <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredSkills.map(skill => {
          const TrendIcon = TREND_ICONS[skill.trend] || Minus;
          const trendColors = TREND_COLORS[skill.trend] || TREND_COLORS['stable'];
          
          return (
            <div
              key={skill.skill_id}
              className={clsx(
                "rounded-lg border p-4",
                skill.is_strength ? "border-emerald-200 bg-emerald-50" : skill.is_weakness ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
              )}
              style={{
                borderRadius: '8px',
                border: `1px solid ${skill.is_strength ? '#a7f3d0' : skill.is_weakness ? '#fecaca' : '#e2e8f0'}`,
                backgroundColor: skill.is_strength ? '#ecfdf5' : skill.is_weakness ? '#fef2f2' : '#ffffff',
                padding: '16px',
              }}
            >
              <div className="flex items-start justify-between mb-2" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div className="flex-1" style={{ flex: 1 }}>
                  <div className="flex items-center gap-2 mb-1" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h4 className="text-base font-semibold" style={{ fontSize: '16px', fontWeight: '600', color: skill.is_strength ? '#065f46' : skill.is_weakness ? '#991b1b' : '#0f172a', margin: 0 }}>
                      {skill.skill_name}
                    </h4>
                    {skill.is_strength && (
                      <CheckCircle size={16} className="text-emerald-600" />
                    )}
                    {skill.is_weakness && (
                      <XCircle size={16} className="text-red-600" />
                    )}
                  </div>
                  {skill.skill_category && (
                    <p className="text-xs text-slate-500 capitalize" style={{ fontSize: '12px', color: '#64748b', textTransform: 'capitalize', margin: 0 }}>
                      {skill.skill_category.replace('_', ' ')}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendIcon size={16} style={{ color: trendColors.icon }} />
                  <span className="text-xs font-medium capitalize" style={{ fontSize: '12px', fontWeight: '500', color: trendColors.text, textTransform: 'capitalize' }}>
                    {skill.trend}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '12px' }}>
                <div>
                  <p className="text-xs text-slate-500 mb-1" style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', marginTop: 0 }}>
                    Proficiency
                  </p>
                  <p className="text-sm font-semibold capitalize" style={{ fontSize: '14px', fontWeight: '600', color: skill.is_strength ? '#065f46' : skill.is_weakness ? '#991b1b' : '#0f172a', margin: 0, textTransform: 'capitalize' }}>
                    {skill.proficiency}
                  </p>
                </div>
                
                <div>
                  <p className="text-xs text-slate-500 mb-1" style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', marginTop: 0 }}>
                    Evidence
                  </p>
                  <p className="text-sm font-semibold" style={{ fontSize: '14px', fontWeight: '600', color: skill.is_strength ? '#065f46' : skill.is_weakness ? '#991b1b' : '#0f172a', margin: 0 }}>
                    {skill.evidence_count}
                  </p>
                </div>
                
                <div>
                  <p className="text-xs text-slate-500 mb-1" style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', marginTop: 0 }}>
                    Confidence
                  </p>
                  <p className="text-sm font-semibold" style={{ fontSize: '14px', fontWeight: '600', color: skill.is_strength ? '#065f46' : skill.is_weakness ? '#991b1b' : '#0f172a', margin: 0 }}>
                    {skill.avg_confidence ? parseFloat(skill.avg_confidence).toFixed(1) : 'N/A'}/5
                  </p>
                </div>
              </div>

              {/* Confidence Bar */}
              {skill.avg_confidence > 0 && (
                <div className="mt-3" style={{ marginTop: '12px' }}>
                  <div className="h-2 rounded-full bg-white/50" style={{ height: '8px', borderRadius: '9999px', backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                    <div
                      style={{
                        height: '8px',
                        borderRadius: '9999px',
                        backgroundColor: skill.is_strength ? '#10b981' : skill.is_weakness ? '#ef4444' : '#6b7280',
                        width: `${(skill.avg_confidence / 5) * 100}%`,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredSkills.length === 0 && (
        <div className="text-center py-8" style={{ textAlign: 'center', padding: '32px 0' }}>
          <p className="text-sm text-slate-500" style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            No {filter === 'all' ? 'skills' : filter} found
          </p>
        </div>
      )}
    </div>
  );
}

