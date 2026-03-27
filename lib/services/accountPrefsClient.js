/**
 * Account hints in profiles.app_preferences (no schema migration — JSON merge).
 * student_self_signup: user completed onboarding as “I’m a student” (vs invited child account).
 */

import { supabase } from '../supabase';

export const STUDENT_SELF_SIGNUP_KEY = 'student_self_signup';

/**
 * Set after onboarding completes when the user chose the student path in Welcome.
 * Linked/invited children never get this flag unless they also go through that flow.
 */
export async function persistStudentSelfSignupFromOnboarding(userId) {
  if (!userId) return { error: new Error('userId required') };
  const { data: row, error: fetchErr } = await supabase
    .from('profiles')
    .select('app_preferences')
    .eq('id', userId)
    .maybeSingle();
  if (fetchErr) return { error: fetchErr };

  const prev = row?.app_preferences && typeof row.app_preferences === 'object' ? row.app_preferences : {};

  const { error } = await supabase
    .from('profiles')
    .update({
      app_preferences: {
        ...prev,
        [STUDENT_SELF_SIGNUP_KEY]: true,
      },
    })
    .eq('id', userId);

  return { error: error || null };
}
