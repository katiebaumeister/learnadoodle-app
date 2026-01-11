/**
 * Web Child Overview Tab
 * Modern dashboard showing today's summary and key metrics
 * Aggregates data from Planner, Records, and Intelligence
 */
import React, { useState, useEffect } from 'react';
import { useChildOverview } from '../../../lib/services/childOverviewClient';
import { supabase } from '../../../lib/supabase';
import ChildHeroCard from '../overview/ChildHeroCard';
import TodaysQuestsCard from '../overview/TodaysQuestsCard';
import ProgressSnapshotCard from '../overview/ProgressSnapshotCard';
import PortfolioHighlightsCard from '../overview/PortfolioHighlightsCard';
import AttendanceLogsCard from '../overview/AttendanceLogsCard';
import UpcomingKeyDatesCard from '../overview/UpcomingKeyDatesCard';
import NotesReflectionsCard from '../overview/NotesReflectionsCard';
import AssignmentsCard from '../overview/AssignmentsCard';

export default function WebChildOverviewTab({ childId, familyId, onNavigate }) {
  const [child, setChild] = useState(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const overview = useChildOverview({ 
    familyId, 
    childId, 
    date: today 
  });
  
  // Fetch child data
  useEffect(() => {
    if (!childId) return;
    
    let cancelled = false;
    
    async function fetchChild() {
      try {
        const { data, error } = await supabase
          .from('children')
          // Use first_name and avatar; some databases don't have a generic name column
          .select('id, first_name, avatar')
          .eq('id', childId)
          .single();
        
        if (!cancelled && !error && data) {
          setChild(data);
        }
      } catch (err) {
        if (!cancelled) {
        }
      }
    }
    
    fetchChild();
    
    return () => {
      cancelled = true;
    };
  }, [childId]);
  
  // Loading skeleton
  if (overview.loading || !child) {
    return (
      <div className="flex flex-col gap-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Hero skeleton */}
        <div 
          className="rounded-xl border border-slate-200 bg-white p-6"
          style={{
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            padding: '24px',
            height: '200px',
          }}
        >
          <div className="h-6 w-48 bg-slate-200 rounded mb-4" style={{ height: '24px', width: '192px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '16px' }} />
          <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="h-4 w-32 bg-slate-200 rounded" style={{ height: '16px', width: '128px', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
            <div className="h-4 w-40 bg-slate-200 rounded" style={{ height: '16px', width: '160px', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
          </div>
        </div>
        
        {/* Grid skeleton */}
        <div 
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-white p-5"
              style={{
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                padding: '20px',
                height: '200px',
              }}
            >
              <div className="h-5 w-32 bg-slate-200 rounded mb-4" style={{ height: '20px', width: '128px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '16px' }} />
              <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="h-4 w-full bg-slate-200 rounded" style={{ height: '16px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
                <div className="h-4 w-3/4 bg-slate-200 rounded" style={{ height: '16px', width: '75%', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  // Error state
  if (overview.error) {
    return (
      <div 
        className="rounded-xl border border-red-200 bg-red-50 p-6"
        style={{
          borderRadius: '12px',
          border: '1px solid #fecaca',
          backgroundColor: '#fef2f2',
          padding: '24px',
        }}
      >
        <p className="text-sm text-red-800" style={{ fontSize: '14px', color: '#991b1b' }}>
          We couldn't load {child.first_name || child.name || 'your child'}'s overview right now. Try again later.
        </p>
      </div>
    );
  }
  
  // Navigation helper
  const handleNavigate = (path) => {
    if (onNavigate && typeof onNavigate === 'function') {
      onNavigate(path);
    } else if (typeof window !== 'undefined') {
      if (window.__ldSearchNavigate) {
        // Parse path and call navigation function
        const url = new URL(path, window.location.origin);
        const params = {};
        url.searchParams.forEach((value, key) => {
          params[key] = value;
        });
        const tab = url.pathname.replace('/', '') || 'home';
        window.__ldSearchNavigate(tab, null, params);
      } else {
        window.location.href = path;
      }
    }
  };
  
  return (
    <div className="flex flex-col gap-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Hero card */}
      <ChildHeroCard
        child={child}
        today={overview.today}
        insights={overview.insights}
      />
      
      {/* Grid of summary cards */}
      <div 
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      >
        <TodaysQuestsCard 
          data={overview.planner.todaysQuests} 
          child={child}
          onNavigate={handleNavigate}
        />
        
        <ProgressSnapshotCard 
          data={overview.week} 
          child={child}
          onNavigate={handleNavigate}
        />
        
        <PortfolioHighlightsCard 
          data={overview.portfolio} 
          child={child}
          onNavigate={handleNavigate}
        />
        
        <AttendanceLogsCard 
          data={overview.attendance} 
          child={child}
          onNavigate={handleNavigate}
        />
        
        <UpcomingKeyDatesCard 
          data={overview.planner.upcomingKeyDates} 
          child={child}
          onNavigate={handleNavigate}
        />
        
        <NotesReflectionsCard 
          data={overview.notes} 
          child={child}
          onNavigate={handleNavigate}
        />
        
        <AssignmentsCard 
          childId={childId}
          familyId={familyId}
          onNavigate={(section) => handleNavigate(`/child/${childId}?section=${section}`)}
        />
      </div>
    </div>
  );
}

