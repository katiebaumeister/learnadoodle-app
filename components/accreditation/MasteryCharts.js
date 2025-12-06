import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Target, BarChart3 } from 'lucide-react';
import { apiRequest } from '../../lib/apiClient';

export default function MasteryCharts({ childId, subjectId = null, daysBack = 365 }) {
  const [loading, setLoading] = useState(true);
  const [chartsData, setChartsData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(subjectId);
  const [days, setDays] = useState(daysBack);

  useEffect(() => {
    loadMasteryData();
  }, [childId, selectedSubject, days]);

  const loadMasteryData = async () => {
    if (!childId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        child_id: childId,
        days_back: days.toString(),
      });
      
      if (selectedSubject) {
        params.append('subject_id', selectedSubject);
      }
      
      const { data, error: apiError } = await apiRequest(`/api/accreditation/mastery-charts?${params.toString()}`);
      
      if (apiError) {
        throw apiError;
      }
      
      setChartsData(data);
    } catch (err) {
      console.error('Error loading mastery charts:', err);
      setError(err.message || 'Failed to load mastery charts');
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp size={16} className="text-emerald-600" />;
      case 'declining':
        return <TrendingDown size={16} className="text-red-600" />;
      default:
        return <Minus size={16} className="text-slate-400" />;
    }
  };

  const getMasteryColor = (level) => {
    if (level >= 4.5) return 'text-emerald-600 bg-emerald-50';
    if (level >= 3.5) return 'text-blue-600 bg-blue-50';
    if (level >= 2.5) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  if (!chartsData || !chartsData.charts_data || chartsData.charts_data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
        <BarChart3 size={32} className="mb-3 text-slate-300" />
        <p>No mastery data available.</p>
        <p className="mt-1 text-xs text-slate-400">Add skill evidence to track mastery over time.</p>
      </div>
    );
  }

  const skills = chartsData.charts_data || [];
  const subjectBreakdown = chartsData.subject_breakdown || {};

  // Group skills by subject
  const skillsBySubject = {};
  skills.forEach(skill => {
    const subjectId = skill.subject_id || 'other';
    if (!skillsBySubject[subjectId]) {
      skillsBySubject[subjectId] = {
        name: skill.subject_name || 'Other',
        skills: []
      };
    }
    skillsBySubject[subjectId].skills.push(skill);
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Time Range:</label>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {/* Subject Breakdown */}
      {Object.keys(subjectBreakdown).length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Object.entries(subjectBreakdown).map(([subjectId, data]) => (
            <div
              key={subjectId}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-medium text-slate-500">{data.name}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-slate-900">
                  {data.avg_mastery.toFixed(1)}
                </p>
                <p className="text-xs text-slate-500">/ 5.0</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {data.skills_count} skill{data.skills_count !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Skills List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Skills Mastery</h3>
        
        {Object.entries(skillsBySubject).map(([subjectId, subjectData]) => (
          <div key={subjectId} className="space-y-2">
            {subjectData.name !== 'Other' && (
              <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {subjectData.name}
              </h4>
            )}
            
            {subjectData.skills.map((skill, index) => (
              <div
                key={skill.skill_id || index}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">
                        {skill.skill_name}
                      </h4>
                      {getTrendIcon(skill.trend)}
                    </div>
                    
                    <div className="mt-2 flex items-center gap-4">
                      <div>
                        <p className="text-xs text-slate-500">Mastery Level</p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-slate-200">
                            <div
                              className={`h-2 rounded-full ${
                                skill.mastery_level >= 4.5 ? 'bg-emerald-600' :
                                skill.mastery_level >= 3.5 ? 'bg-blue-600' :
                                skill.mastery_level >= 2.5 ? 'bg-amber-600' : 'bg-red-600'
                              }`}
                              style={{ width: `${(skill.mastery_level / 5) * 100}%` }}
                            />
                          </div>
                          <span className={`text-sm font-semibold ${getMasteryColor(skill.mastery_level).split(' ')[0]}`}>
                            {skill.mastery_level.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-xs text-slate-500">Evidence</p>
                        <p className="text-sm font-medium text-slate-900">
                          {skill.evidence_count} piece{skill.evidence_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-xs text-slate-500">Trend</p>
                        <p className={`text-xs font-medium capitalize ${
                          skill.trend === 'improving' ? 'text-emerald-600' :
                          skill.trend === 'declining' ? 'text-red-600' : 'text-slate-600'
                        }`}>
                          {skill.trend}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      {skills.length > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-indigo-900">Overall Mastery</p>
              <p className="mt-1 text-xs text-indigo-700">
                Based on {skills.length} tracked skill{skills.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-indigo-600">
                {(
                  skills.reduce((sum, s) => sum + s.mastery_level, 0) / skills.length
                ).toFixed(1)}
              </p>
              <p className="text-xs text-indigo-600">/ 5.0</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

