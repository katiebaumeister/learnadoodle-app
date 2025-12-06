/**
 * Planner Diff Store
 * React Context store for managing schedule reschedule diffs and modal state
 * 
 * Note: If you prefer Zustand, install it: npm install zustand
 * Then replace this with: import { create } from 'zustand';
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type DiffReason = 
  | 'blackout' 
  | 'override' 
  | 'catch_up' 
  | 'priority' 
  | 'theme' 
  | 'cognitive_load';

export interface DiffItem {
  task_id?: string;
  year_plan_id?: string; // Alternative to task_id
  title: string;
  subject_id?: string;
  child_id: string;
  old_event: {
    start_ts: string;
    end_ts: string;
  };
  new_event: {
    start_ts: string;
    end_ts: string;
  };
  reason: DiffReason;
}

interface PlannerDiffContextValue {
  diffItems: DiffItem[];
  modalOpen: boolean;
  setDiffItems: (items: DiffItem[]) => void;
  clearDiff: () => void;
  openModal: () => void;
  closeModal: () => void;
}

const PlannerDiffContext = createContext<PlannerDiffContextValue | undefined>(undefined);

export function PlannerDiffProvider({ children }: { children: ReactNode }) {
  const [diffItems, setDiffItemsState] = useState<DiffItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const setDiffItems = useCallback((items: DiffItem[]) => {
    setDiffItemsState(items);
    // Auto-open modal if there are diffs
    if (items && items.length > 0) {
      setModalOpen(true);
    }
  }, []);

  const clearDiff = useCallback(() => {
    setDiffItemsState([]);
    setModalOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <PlannerDiffContext.Provider
      value={{
        diffItems,
        modalOpen,
        setDiffItems,
        clearDiff,
        openModal,
        closeModal,
      }}
    >
      {children}
    </PlannerDiffContext.Provider>
  );
}

export function usePlannerDiffStore() {
  const context = useContext(PlannerDiffContext);
  if (!context) {
    throw new Error('usePlannerDiffStore must be used within PlannerDiffProvider');
  }
  return context;
}

