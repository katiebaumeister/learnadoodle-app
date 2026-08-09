/**
 * Navigation helpers for compliance modals (e.g. deep link to Planner Attendance view).
 * Uses the same conventions as WebContent: tab change + URL + plannerViewChange event.
 */

declare const window: Window & { history?: { replaceState: (a: unknown, b: string, url: string) => void }; dispatchEvent: (e: Event) => boolean } | undefined;

export type OnOpenAttendanceView = (() => void) | undefined;

/**
 * Opens the Planner in Attendance mode (year heatmap + month drill-down).
 * On web: switches to planner tab, keeps URL on `/`, dispatches plannerViewChange.
 * On native: no-op unless caller passes a custom handler via modal prop.
 */
export function openPlannerAttendance(options?: { onTabChange?: (tab: string) => void }): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { history?: { replaceState: (a: unknown, b: string, url: string) => void }; dispatchEvent: (e: Event) => boolean };
  if (options?.onTabChange) options.onTabChange('planner');
  // Keep `/` — Expo web refresh blanks on /planner deep paths.
  if (w.history?.replaceState) w.history.replaceState({}, '', '/');
  try {
    w.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'attendance' }));
  } catch {
    // ignore
  }
}
