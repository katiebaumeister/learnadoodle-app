import React, { useState, useEffect } from 'react';
import { GraduationCap, Award, BookOpen, Users, Target, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiRequest } from '../../lib/apiClient';

export default function CollegeReadinessDashboard({ childId }) {
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [testScores, setTestScores] = useState({ sat_score: '', act_score: '' });
  const [extracurriculars, setExtracurriculars] = useState({
    activities: '',
    leadership_roles: '',
    volunteer_hours: ''
  });

  useEffect(() => {
    loadReadiness();
  }, [childId]);

  const loadReadiness = async () => {
    if (!childId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: apiError } = await apiRequest(`/api/accreditation/college-readiness?child_id=${childId}`);
      
      if (apiError) {
        throw apiError;
      }
      
      setReadiness(data);
      
      // Initialize form data
      if (data.readiness_data) {
        const tests = data.readiness_data.standardized_tests || {};
        setTestScores({
          sat_score: tests.sat_score || '',
          act_score: tests.act_score || ''
        });
        
        const extras = data.readiness_data.extracurriculars || {};
        setExtracurriculars({
          activities: Array.isArray(extras.activities) ? extras.activities.join(', ') : (extras.activities || ''),
          leadership_roles: Array.isArray(extras.leadership_roles) ? extras.leadership_roles.join(', ') : (extras.leadership_roles || ''),
          volunteer_hours: extras.volunteer_hours || ''
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load college readiness');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const updateData = {
        test_scores: {
          sat_score: testScores.sat_score ? parseInt(testScores.sat_score) : null,
          act_score: testScores.act_score ? parseInt(testScores.act_score) : null
        },
        extracurriculars: {
          activities: extracurriculars.activities ? extracurriculars.activities.split(',').map(a => a.trim()).filter(Boolean) : [],
          leadership_roles: extracurriculars.leadership_roles ? extracurriculars.leadership_roles.split(',').map(r => r.trim()).filter(Boolean) : [],
          volunteer_hours: extracurriculars.volunteer_hours ? parseInt(extracurriculars.volunteer_hours) : 0
        }
      };
      
      const { error: apiError } = await apiRequest(
        `/api/accreditation/college-readiness/update?child_id=${childId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        }
      );
      
      if (apiError) {
        throw apiError;
      }
      
      setEditing(false);
      await loadReadiness(); // Reload to get updated readiness score
    } catch (err) {
      alert('Failed to update: ' + (err.message || 'Unknown error'));
    }
  };

  const getReadinessColor = (score) => {
    if (score >= 80) return 'text-emerald-600 bg-emerald-50';
    if (score >= 60) return 'text-blue-600 bg-blue-50';
    if (score >= 40) return 'text-amber-600 bg-amber-50';
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

  if (!readiness || !readiness.readiness_data) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
        <GraduationCap size={32} className="mb-3 text-slate-300" />
        <p>No college readiness data available.</p>
        <p className="mt-1 text-xs text-slate-400">Complete courses and add grades to see readiness metrics.</p>
      </div>
    );
  }

  const data = readiness.readiness_data;
  const academic = data.academic || {};
  const tests = data.standardized_tests || {};
  const extras = data.extracurriculars || {};
  const recommendations = data.recommendations || [];

  return (
    <div className="space-y-6">
      {/* Overall Readiness Score */}
      <div className={`rounded-lg border p-6 ${getReadinessColor(readiness.readiness_score).split(' ')[1]} border-current/20`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Overall Readiness Score</p>
            <p className="mt-1 text-xs text-slate-600">
              Based on academic performance, credits, and activities
            </p>
          </div>
          <div className="text-right">
            <p className={`text-4xl font-bold ${getReadinessColor(readiness.readiness_score).split(' ')[0]}`}>
              {readiness.readiness_score}
            </p>
            <p className="text-xs text-slate-600">/ 100</p>
          </div>
        </div>
        <div className="mt-4 h-3 w-full rounded-full bg-white/50">
          <div
            className={`h-3 rounded-full ${getReadinessColor(readiness.readiness_score).split(' ')[0].replace('text-', 'bg-')}`}
            style={{ width: `${Math.min(readiness.readiness_score, 100)}%` }}
          />
        </div>
      </div>

      {/* Academic Metrics */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={20} className="text-indigo-600" />
          <h3 className="text-base font-semibold text-slate-900">Academic</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">GPA</p>
            <p className="text-lg font-semibold text-slate-900">
              {academic.gpa ? academic.gpa.toFixed(2) : 'N/A'}
            </p>
          </div>
          
          <div>
            <p className="text-xs text-slate-500">Credits Earned</p>
            <p className="text-lg font-semibold text-slate-900">
              {academic.credits_earned || 0}
            </p>
          </div>
          
          <div>
            <p className="text-xs text-slate-500">AP Courses</p>
            <p className="text-lg font-semibold text-slate-900">
              {academic.ap_courses || 0}
            </p>
          </div>
          
          <div>
            <p className="text-xs text-slate-500">Honors Courses</p>
            <p className="text-lg font-semibold text-slate-900">
              {academic.honors_courses || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Standardized Tests */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target size={20} className="text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-900">Standardized Tests</h3>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Edit
            </button>
          )}
        </div>
        
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">SAT Score</label>
              <input
                type="number"
                value={testScores.sat_score}
                onChange={(e) => setTestScores({ ...testScores, sat_score: e.target.value })}
                placeholder="e.g., 1350"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ACT Score</label>
              <input
                type="number"
                value={testScores.act_score}
                onChange={(e) => setTestScores({ ...testScores, act_score: e.target.value })}
                placeholder="e.g., 30"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  loadReadiness(); // Reset form
                }}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">SAT</p>
              <p className="text-lg font-semibold text-slate-900">
                {tests.sat_score || 'Not recorded'}
              </p>
            </div>
            
            <div>
              <p className="text-xs text-slate-500">ACT</p>
              <p className="text-lg font-semibold text-slate-900">
                {tests.act_score || 'Not recorded'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Extracurriculars */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-900">Extracurriculars</h3>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Edit
            </button>
          )}
        </div>
        
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Activities (comma-separated)</label>
              <input
                type="text"
                value={extracurriculars.activities}
                onChange={(e) => setExtracurriculars({ ...extracurriculars, activities: e.target.value })}
                placeholder="e.g., Soccer, Debate Club, Robotics"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Leadership Roles (comma-separated)</label>
              <input
                type="text"
                value={extracurriculars.leadership_roles}
                onChange={(e) => setExtracurriculars({ ...extracurriculars, leadership_roles: e.target.value })}
                placeholder="e.g., Team Captain, Club President"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Volunteer Hours</label>
              <input
                type="number"
                value={extracurriculars.volunteer_hours}
                onChange={(e) => setExtracurriculars({ ...extracurriculars, volunteer_hours: e.target.value })}
                placeholder="e.g., 120"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  loadReadiness(); // Reset form
                }}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500">Activities</p>
              <p className="text-sm font-medium text-slate-900">
                {Array.isArray(extras.activities) && extras.activities.length > 0
                  ? extras.activities.join(', ')
                  : extras.activities || 'None recorded'}
              </p>
            </div>
            
            <div>
              <p className="text-xs text-slate-500">Leadership Roles</p>
              <p className="text-sm font-medium text-slate-900">
                {Array.isArray(extras.leadership_roles) && extras.leadership_roles.length > 0
                  ? extras.leadership_roles.join(', ')
                  : extras.leadership_roles || 'None recorded'}
              </p>
            </div>
            
            <div>
              <p className="text-xs text-slate-500">Volunteer Hours</p>
              <p className="text-sm font-medium text-slate-900">
                {extras.volunteer_hours || 0}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={20} className="text-amber-600" />
            <h3 className="text-base font-semibold text-amber-900">Recommendations</h3>
          </div>
          
          <ul className="space-y-2">
            {recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-amber-800">
                <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

