/**
 * Constraints Store
 * State management for weekly schedule constraints
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { DailyConstraint } from '../helpers/mergeConstraints';

interface ConstraintsContextValue {
  weekConstraints: DailyConstraint[];
  loading: boolean;
  error: string | null;
  setConstraints: (constraints: DailyConstraint[]) => void;
  fetchConstraints: (weekStart: Date, childIds?: string[], familyId?: string) => Promise<void>;
  refreshConstraints: (weekStart: Date, childIds?: string[], familyId?: string) => Promise<void>;
}

const ConstraintsContext = createContext<ConstraintsContextValue | undefined>(undefined);

export function ConstraintsProvider({ children }: { children: ReactNode }) {
  const [weekConstraints, setWeekConstraintsState] = useState<DailyConstraint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setConstraints = useCallback((constraints: DailyConstraint[]) => {
    setWeekConstraintsState(constraints);
    setError(null);
  }, []);

  const fetchConstraints = useCallback(async (
    weekStart: Date,
    childIds?: string[],
    familyId?: string
  ) => {
    if (!familyId) {
      // Try to get familyId from user profile
      try {
        const { supabase } = await import('../../lib/supabase');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('family_id')
            .eq('id', user.id)
            .maybeSingle();
          if (profile?.family_id) {
            familyId = profile.family_id;
          }
        }
      } catch (err) {
        console.error('Error fetching family_id:', err);
      }
    }

    if (!familyId) {
      setError('Family ID is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { supabase } = await import('../../lib/supabase');
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const startStr = formatDate(weekStart);
      const endStr = formatDate(weekEnd);

      // Fetch all constraint sources in parallel
      const [blackoutsResult, overridesResult, rulesResult, cacheResult] = await Promise.all([
        // Blackouts
        supabase
          .from('blackout_periods')
          .select('*')
          .eq('family_id', familyId)
          .lte('starts_on', endStr)
          .gte('ends_on', startStr)
          .execute(),
        
        // Overrides (scope_type='family' uses scope_id=family_id, scope_type='child' uses scope_id=child_id)
        supabase
          .from('schedule_overrides')
          .select('*')
          .or(`scope_type.eq.family,scope_type.eq.child`)
          .eq('is_active', true)
          .gte('date', startStr)
          .lte('date', endStr)
          .execute(),
        
        // Rules (baseline availability)
        supabase
          .from('schedule_rules')
          .select('*')
          .eq('family_id', familyId)
          .eq('is_active', true)
          .execute(),
        
        // Calendar cache (truth source)
        supabase
          .from('calendar_days_cache')
          .select('*')
          .eq('family_id', familyId)
          .gte('date', startStr)
          .lte('date', endStr)
          .execute(),
      ]);

      const blackouts = blackoutsResult.data || [];
      let overrides = overridesResult.data || [];
      const rules = rulesResult.data || [];
      const cache = cacheResult.data || [];

      // Filter overrides by family_id first (since schedule_overrides doesn't have family_id column)
      // For family scope: scope_id = family_id
      // For child scope: we need to check if child belongs to family (filter later)
      overrides = overrides.filter(o => {
        if (o.scope_type === 'family') {
          return o.scope_id === familyId;
        } else if (o.scope_type === 'child') {
          // Include all child overrides for now, we'll filter by childIds next
          return true;
        }
        return false;
      });

      // Filter by childIds if provided
      // For blackouts: filter by child_id
      const filteredBlackouts = childIds && childIds.length > 0
        ? blackouts.filter(b => {
            // Include family-level (child_id is null) or child-specific matching childIds
            return !b.child_id || childIds.includes(b.child_id);
          })
        : blackouts.filter(b => !b.child_id); // Family-level only

      // For overrides: filter by scope_type and scope_id
      // scope_type='family' means scope_id=family_id
      // scope_type='child' means scope_id=child_id
      const filteredOverrides = childIds && childIds.length > 0
        ? overrides.filter(o => {
            if (o.scope_type === 'family') {
              // Family-level override - include
              return true;
            } else if (o.scope_type === 'child') {
              // Child-specific override - include if scope_id matches one of childIds
              return childIds.includes(o.scope_id);
            }
            return false;
          })
        : overrides.filter(o => o.scope_type === 'family'); // Family-level only

      const filteredRules = childIds && childIds.length > 0
        ? rules.filter(r => !r.child_id || childIds.includes(r.child_id))
        : rules.filter(r => !r.child_id); // Family-level only

      const filteredCache = childIds && childIds.length > 0
        ? cache.filter(c => !c.child_id || childIds.includes(c.child_id))
        : cache.filter(c => !c.child_id); // Family-level only

      // Merge constraints
      const { mergeConstraints } = await import('../helpers/mergeConstraints');
      const constraints = mergeConstraints(
        {
          blackouts: filteredBlackouts.map(b => ({
            child_id: b.child_id || b.scope_id,
            family_id: b.family_id,
            starts_on: b.starts_on,
            ends_on: b.ends_on,
            reason: b.reason,
          })),
          overrides: filteredOverrides.map(o => ({
            child_id: o.scope_type === 'child' ? o.scope_id : undefined,
            family_id: o.scope_type === 'family' ? o.scope_id : familyId,
            date: o.date,
            override_kind: o.override_kind,
            start_override: o.start_time ? formatTimeFromTime(o.start_time) : undefined,
            end_override: o.end_time ? formatTimeFromTime(o.end_time) : undefined,
            is_active: o.is_active,
          })),
          rules: filteredRules.map(r => ({
            child_id: r.child_id,
            family_id: r.family_id,
            day_of_week: r.day_of_week,
            first_block_start: r.first_block_start,
            last_block_end: r.last_block_end,
          })),
          cache: filteredCache.map(c => ({
            child_id: c.child_id,
            family_id: c.family_id,
            date: c.date,
            day_status: c.day_status,
            first_block_start: c.first_block_start,
            last_block_end: c.last_block_end,
          })),
        },
        weekStart,
        childIds
      );

      setWeekConstraintsState(constraints);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch constraints');
      console.error('Error fetching constraints:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshConstraints = useCallback(async (
    weekStart: Date,
    childIds?: string[],
    familyId?: string
  ) => {
    await fetchConstraints(weekStart, childIds, familyId);
  }, [fetchConstraints]);

  return (
    <ConstraintsContext.Provider
      value={{
        weekConstraints,
        loading,
        error,
        setConstraints,
        fetchConstraints,
        refreshConstraints,
      }}
    >
      {children}
    </ConstraintsContext.Provider>
  );
}

export function useConstraintsStore() {
  const context = useContext(ConstraintsContext);
  if (!context) {
    throw new Error('useConstraintsStore must be used within ConstraintsProvider');
  }
  return context;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format time from TIME column (HH:MM:SS or HH:MM) to HH:MM
 */
function formatTimeFromTime(timeStr: string | undefined): string | undefined {
  if (!timeStr) return undefined;
  
  // If already in HH:MM format, return as-is
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr;
  }
  
  // If in HH:MM:SS format, extract HH:MM
  if (/^\d{2}:\d{2}:\d{2}/.test(timeStr)) {
    return timeStr.substring(0, 5);
  }
  
  return timeStr;
}

