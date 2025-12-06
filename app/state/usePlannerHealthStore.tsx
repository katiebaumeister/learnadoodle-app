/**
 * Planner Health Store
 * State management for planner health metrics
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { PlannerHealth } from '../services/plannerHealth';

interface PlannerHealthContextValue {
  health: PlannerHealth | null;
  loading: boolean;
  error: string | null;
  setHealth: (health: PlannerHealth) => void;
  fetchHealth: (childId?: string) => Promise<void>;
  refreshHealth: (childId?: string) => Promise<void>;
}

const PlannerHealthContext = createContext<PlannerHealthContextValue | undefined>(undefined);

export function PlannerHealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealthState] = useState<PlannerHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setHealth = useCallback((newHealth: PlannerHealth) => {
    setHealthState(newHealth);
    setError(null);
  }, []);

  const fetchHealth = useCallback(async (childId?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Get Supabase session for authentication
      const { supabase } = await import('../../lib/supabase.js');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      
      const REACT_APP_API_URL = typeof process !== 'undefined' && process.env ? process.env.REACT_APP_API_URL : '';
      const url = `${REACT_APP_API_URL || ''}/api/schedule/health${childId ? `?child=${childId}` : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch health: ${response.statusText}`);
      }

      const data = await response.json();
      setHealthState(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch planner health');
      console.error('Error fetching planner health:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshHealth = useCallback(async (childId?: string) => {
    await fetchHealth(childId);
  }, [fetchHealth]);

  return (
    <PlannerHealthContext.Provider
      value={{
        health,
        loading,
        error,
        setHealth,
        fetchHealth,
        refreshHealth,
      }}
    >
      {children}
    </PlannerHealthContext.Provider>
  );
}

export function usePlannerHealthStore() {
  const context = useContext(PlannerHealthContext);
  if (!context) {
    throw new Error('usePlannerHealthStore must be used within PlannerHealthProvider');
  }
  return context;
}

