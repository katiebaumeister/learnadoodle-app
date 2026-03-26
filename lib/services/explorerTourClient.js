/**
 * Explorer tour (post-onboarding) — persisted in profiles.app_preferences.explorerTourV1
 */

import { supabase } from '../supabase';

export const EXPLORER_TOUR_PREFS_KEY = 'explorerTourV1';

export const DEFAULT_EXPLORER_TOUR = {
  parent: { done: false, skipped: false, step: 0 },
  learner: { done: false, skipped: false },
};

export function parseExplorerTourFromPrefs(appPreferences) {
  const raw = appPreferences?.[EXPLORER_TOUR_PREFS_KEY];
  if (!raw || typeof raw !== 'object') {
    return {
      parent: { ...DEFAULT_EXPLORER_TOUR.parent },
      learner: { ...DEFAULT_EXPLORER_TOUR.learner },
    };
  }
  return {
    parent: {
      done: !!raw.parent?.done,
      skipped: !!raw.parent?.skipped,
      step: typeof raw.parent?.step === 'number' ? raw.parent.step : 0,
    },
    learner: {
      done: !!raw.learner?.done,
      skipped: !!raw.learner?.skipped,
    },
  };
}

/**
 * Merge nested explorer tour fields without clobbering other app_preferences keys.
 */
export async function persistExplorerTourMerge(userId, partial) {
  if (!userId) return { error: new Error('userId required') };
  const { data: row, error: fetchErr } = await supabase
    .from('profiles')
    .select('app_preferences')
    .eq('id', userId)
    .maybeSingle();
  if (fetchErr) return { error: fetchErr };

  const prev = row?.app_preferences && typeof row.app_preferences === 'object' ? row.app_preferences : {};
  const cur = prev[EXPLORER_TOUR_PREFS_KEY] && typeof prev[EXPLORER_TOUR_PREFS_KEY] === 'object' ? prev[EXPLORER_TOUR_PREFS_KEY] : {};

  const nextTour = { ...cur };
  if (partial.parent) {
    nextTour.parent = { ...(cur.parent || {}), ...partial.parent };
  }
  if (partial.learner) {
    nextTour.learner = { ...(cur.learner || {}), ...partial.learner };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      app_preferences: {
        ...prev,
        [EXPLORER_TOUR_PREFS_KEY]: nextTour,
      },
    })
    .eq('id', userId);

  return { error: error || null };
}
