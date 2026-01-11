/**
 * Skill Graph Visualization Component
 * Shows skills as nodes with connections and evidence
 */
import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Target, Award, AlertCircle } from 'lucide-react';
import { getSkillGraph } from '../../lib/services/skillsClient';

// Helper function for conditional classes
const clsx = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

const PROFICIENCY_COLORS = {
  'beginner': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  'developing': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  'proficient': { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  'advanced': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  'expert': { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
};

export default function SkillGraph({ childId, subjectId = null, daysBack = 365 }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSkill, setSelectedSkill] = useState(null);

  useEffect(() => {
    if (childId) {
      loadSkillGraph();
    }
  }, [childId, subjectId, daysBack]);

  const loadSkillGraph = async () => {
    if (!childId) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await getSkillGraph(childId, { subject_id: subjectId, days_back: daysBack });
      if (result.error) throw result.error;
      setSkills(result.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load skill graph');
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  const skillsByCategory = useMemo(() => {
    const grouped = {};
    skills.forEach(skill => {
      const category = skill.skill_category || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(skill);
    });
    return grouped;
  }, [skills]);

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
        <Target size={48} className="text-slate-300 mb-4" />
        <p className="text-sm text-slate-500" style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          No skills tracked yet
        </p>
        <p className="mt-1 text-xs text-slate-400" style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8', marginBottom: 0 }}>
          Link skills to events, outcomes, or uploads to see your learning map
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Skill Graph by Category */}
      {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
        <div key={category} className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 className="text-lg font-semibold text-slate-900 capitalize" style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: 0, textTransform: 'capitalize' }}>
            {category.replace('_', ' ')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            {categorySkills.map(skill => {
              const colors = PROFICIENCY_COLORS[skill.proficiency] || PROFICIENCY_COLORS['beginner'];
              const isSelected = selectedSkill?.skill_id === skill.skill_id;
              
              return (
                <div
                  key={skill.skill_id}
                  onClick={() => setSelectedSkill(isSelected ? null : skill)}
                  className={clsx(
                    "rounded-lg border p-4 cursor-pointer transition-all",
                    isSelected ? "ring-2 ring-indigo-500" : "hover:shadow-md"
                  )}
                  style={{
                    borderRadius: '8px',
                    border: `2px solid ${isSelected ? '#6366f1' : colors.border}`,
                    backgroundColor: colors.bg,
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isSelected ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none',
                  }}
                >
                  <div className="flex items-start justify-between mb-2" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h4 className="text-sm font-semibold flex-1" style={{ fontSize: '14px', fontWeight: '600', color: colors.text, margin: 0, flex: 1 }}>
                      {skill.skill_name}
                    </h4>
                    {skill.parent_skill_id && (
                      <span className="text-xs text-slate-500 ml-2" style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>
                        Sub-skill
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 mb-2" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                    <div className="flex items-center gap-1" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Award size={14} className={colors.text} />
                      <span className="text-xs font-medium capitalize" style={{ fontSize: '12px', fontWeight: '500', color: colors.text, textTransform: 'capitalize' }}>
                        {skill.proficiency}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600" style={{ fontSize: '12px', color: '#475569' }}>
                      {skill.evidence_count} evidence
                    </div>
                  </div>

                  {skill.avg_confidence > 0 && (
                    <div className="mb-2" style={{ marginBottom: '8px' }}>
                      <div className="flex items-center justify-between mb-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span className="text-xs text-slate-600" style={{ fontSize: '12px', color: '#475569' }}>
                          Confidence
                        </span>
                        <span className="text-xs font-semibold" style={{ fontSize: '12px', fontWeight: '600', color: colors.text }}>
                          {parseFloat(skill.avg_confidence).toFixed(1)}/5
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/50" style={{ height: '8px', borderRadius: '9999px', backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                        <div
                          style={{
                            height: '8px',
                            borderRadius: '9999px',
                            backgroundColor: colors.border,
                            width: `${(skill.avg_confidence / 5) * 100}%`,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {skill.last_demonstrated && (
                    <div className="text-xs text-slate-500 mt-2" style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                      Last: {new Date(skill.last_demonstrated).toLocaleDateString()}
                    </div>
                  )}

                  {/* Related Skills Indicator */}
                  {skill.related_skills && skill.related_skills.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/30" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.3)' }}>
                      <span className="text-xs text-slate-600" style={{ fontSize: '12px', color: '#475569' }}>
                        {skill.related_skills.length} related skill{skill.related_skills.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Selected Skill Details */}
      {selectedSkill && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4" style={{ borderRadius: '8px', border: '1px solid #c7d2fe', backgroundColor: '#eef2ff', padding: '16px' }}>
          <div className="flex items-start justify-between mb-2" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h4 className="text-base font-semibold text-indigo-900" style={{ fontSize: '16px', fontWeight: '600', color: '#312e81', margin: 0 }}>
              {selectedSkill.skill_name}
            </h4>
            <button
              onClick={() => setSelectedSkill(null)}
              className="text-indigo-600 hover:text-indigo-800"
              style={{ color: '#4f46e5', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
          <div className="space-y-1 text-sm text-indigo-700" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#4338ca' }}>
            <div>Proficiency: <span className="font-medium capitalize">{selectedSkill.proficiency}</span></div>
            <div>Evidence Count: <span className="font-medium">{selectedSkill.evidence_count}</span></div>
            {selectedSkill.avg_confidence > 0 && (
              <div>Avg Confidence: <span className="font-medium">{parseFloat(selectedSkill.avg_confidence).toFixed(1)}/5</span></div>
            )}
            {selectedSkill.last_demonstrated && (
              <div>Last Demonstrated: <span className="font-medium">{new Date(selectedSkill.last_demonstrated).toLocaleDateString()}</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

