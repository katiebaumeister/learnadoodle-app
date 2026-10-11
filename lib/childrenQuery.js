/**
 * PostgREST: `archived = false` excludes NULL. Prefer this filter so
 * not-yet-backfilled children still appear in lists and pickers.
 */
export const CHILDREN_NOT_ARCHIVED_OR =
  'archived.eq.false,archived.is.null';

/** Apply the null-safe active-children filter to a supabase query builder. */
export function filterActiveChildren(query) {
  if (!query || typeof query.or !== 'function') return query;
  return query.or(CHILDREN_NOT_ARCHIVED_OR);
}
