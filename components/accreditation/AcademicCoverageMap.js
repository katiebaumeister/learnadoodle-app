import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Map as MapIcon, BookOpen, Clock, Award, FileText, TrendingUp } from 'lucide-react';
import { apiRequest } from '../../lib/apiClient';

// Cache for coverage data (keyed by childId + academicYear)
const coverageCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default function AcademicCoverageMap({ childId, academicYear = null, onNavigateToGrades = null }) {
  const [loading, setLoading] = useState(true);
  const [coverage, setCoverage] = useState(null);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(academicYear);
  const retryCountRef = useRef(0);
  const maxRetries = 2;

  // Generate cache key
  const cacheKey = useMemo(() => {
    return `${childId}-${selectedYear || 'current'}`;
  }, [childId, selectedYear]);

  useEffect(() => {
    loadCoverage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, selectedYear, cacheKey]);

  const loadCoverage = async () => {
    if (!childId) return;
    
    // Check cache first
    const cached = coverageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setCoverage(cached.data);
      setLoading(false);
      setError(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    retryCountRef.current = 0;
    
    await loadCoverageWithRetry();
  };

  const loadCoverageWithRetry = async () => {
    try {
      const params = new URLSearchParams({
        child_id: childId,
      });
      
      if (selectedYear) {
        params.append('academic_year', selectedYear);
      }
      
      const { data, error: apiError } = await apiRequest(`/api/accreditation/coverage-map?${params.toString()}`);
      
      if (apiError) {
        // If it's a 500 error and we haven't retried too many times, retry
        if (apiError.status === 500 && retryCountRef.current < maxRetries) {
          retryCountRef.current += 1;
          console.warn(`Coverage map error, retrying (${retryCountRef.current}/${maxRetries})...`);
          // Wait a bit before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCountRef.current));
          return loadCoverageWithRetry();
        }
        throw apiError;
      }
      
      // Cache the successful response
      coverageCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      setCoverage(data);
      setError(null);
    } catch (err) {
      console.error('Error loading coverage map:', err);
      const errorMessage = err.message || err.detail || 'Failed to load coverage map';
      setError(errorMessage);
      
      // If we have cached data, use it even if stale
      const cached = coverageCache.get(cacheKey);
      if (cached) {
        console.warn('Using stale cached coverage data due to error');
        setCoverage(cached.data);
      }
    } finally {
      setLoading(false);
    }
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

  if (!coverage || !coverage.coverage_data || !coverage.coverage_data.subjects) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
        <MapIcon size={32} className="mb-3 text-slate-300" />
        <p>No coverage data available for this academic year.</p>
        <p className="mt-1 text-xs text-slate-400 mb-4">Complete events and add grades to see coverage.</p>
        {onNavigateToGrades && (
          <button
            onClick={onNavigateToGrades}
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
            <FileText size={16} />
            <span>Add Grades</span>
          </button>
        )}
      </div>
    );
  }

  const subjects = Object.values(coverage.coverage_data.subjects || {});
  const totalHours = coverage.total_hours || 0;
  const totalCredits = coverage.total_credits || 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-indigo-600" />
            <div>
              <p className="text-xs font-medium text-slate-500">Total Hours</p>
              <p className="text-lg font-semibold text-slate-900">{totalHours.toFixed(1)}</p>
            </div>
          </div>
        </div>
        
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Award size={20} className="text-indigo-600" />
            <div>
              <p className="text-xs font-medium text-slate-500">Total Credits</p>
              <p className="text-lg font-semibold text-slate-900">{totalCredits.toFixed(1)}</p>
            </div>
          </div>
        </div>
        
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-indigo-600" />
            <div>
              <p className="text-xs font-medium text-slate-500">Subjects</p>
              <p className="text-lg font-semibold text-slate-900">{subjects.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Academic Year Selector */}
      {!academicYear && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Academic Year:</label>
          <input
            type="text"
            value={selectedYear || ''}
            onChange={(e) => setSelectedYear(e.target.value)}
            placeholder="2024-2025"
            className="rounded-lg border border-slate-200 px-3 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={loadCoverage}
            className="rounded-lg bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Load
          </button>
        </div>
      )}

      {/* Subject Coverage Cards */}
      <div className="space-y-3">
        {subjects.map((subject, index) => (
          <div
            key={index}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-slate-900">{subject.name}</h3>
                
                <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500">Hours</p>
                    <p className="text-sm font-medium text-slate-900">{subject.hours.toFixed(1)}</p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-slate-500">Credits</p>
                    <p className="text-sm font-medium text-slate-900">{subject.credits.toFixed(1)}</p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-slate-500">Evidence</p>
                    <p className="text-sm font-medium text-slate-900">{subject.evidence_count}</p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-slate-500">Topics</p>
                    <p className="text-sm font-medium text-slate-900">
                      {subject.topics_covered?.length || 0}
                    </p>
                  </div>
                </div>
                
                {subject.topics_covered && subject.topics_covered.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {subject.topics_covered.slice(0, 5).map((topic, i) => (
                      <span
                        key={i}
                        className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                      >
                        {topic}
                      </span>
                    ))}
                    {subject.topics_covered.length > 5 && (
                      <span className="text-xs text-slate-500">
                        +{subject.topics_covered.length - 5} more
                      </span>
                    )}
                  </div>
                )}
                
                {subject.standards_met && subject.standards_met.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <FileText size={14} className="text-slate-400" />
                    <p className="text-xs text-slate-500">
                      {subject.standards_met.length} standard{subject.standards_met.length !== 1 ? 's' : ''} met
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Coverage Percentage */}
      {coverage.coverage_percentage !== null && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-indigo-900">Coverage Percentage</p>
              <p className="mt-1 text-xs text-indigo-700">
                Based on state requirements
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-indigo-600">
                {coverage.coverage_percentage.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-indigo-200">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${Math.min(coverage.coverage_percentage, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

