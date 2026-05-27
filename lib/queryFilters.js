/**
 * Query Filtering Helpers
 * 
 * Automatically scopes queries based on user role:
 * - Parent: all family events for all children
 * - Child/student: only events where child_id = session.child_id
 * - Tutor: only events where child_id IN session.accessible_children
 */

/**
 * Build child filter based on session role
 * @param {Object} session - Session context from useSession()
 * @returns {Object} Filter object with mode and child_ids
 */
export const buildChildFilter = (session) => {
  if (!session) {
    return { mode: 'ALL' };
  }

  const { role_flags = {}, child_id, accessible_children } = session;

  if (role_flags.isParent) {
    // Parent: see all children in family
    return { mode: 'ALL' };
  } else if (role_flags.isChild) {
    // Child/student: only their own data
    if (child_id) {
      return { mode: 'ONE', child_id };
    }
    // Fallback if child_id not set
    return { mode: 'NONE' };
  } else if (role_flags.isTutor) {
    // Tutor: only assigned children
    if (accessible_children && accessible_children.length > 0) {
      return { mode: 'MANY', child_ids: accessible_children };
    }
    return { mode: 'NONE' };
  }

  // Default: no access
  return { mode: 'NONE' };
};

/**
 * Apply child filter to a Supabase query
 * @param {Object} query - Supabase query builder
 * @param {Object} session - Session context
 * @param {string} childIdColumn - Column name for child_id (default: 'child_id')
 * @returns {Object} Filtered query
 */
export const applyChildFilter = (query, session, childIdColumn = 'child_id') => {
  if (!query || !session) {
    return query;
  }

  const filter = buildChildFilter(session);

  if (filter.mode === 'ALL') {
    // Parent: no filter needed (already scoped by family_id)
    return query;
  } else if (filter.mode === 'ONE') {
    // Child/student: filter by single child_id
    return query.eq(childIdColumn, filter.child_id);
  } else if (filter.mode === 'MANY') {
    // Tutor: filter by multiple child_ids
    if (filter.child_ids && filter.child_ids.length > 0) {
      return query.in(childIdColumn, filter.child_ids);
    }
    // No accessible children: return empty result
    return query.eq(childIdColumn, '00000000-0000-0000-0000-000000000000'); // Invalid UUID = no results
  } else {
    // NONE: no access
    return query.eq(childIdColumn, '00000000-0000-0000-0000-000000000000'); // Invalid UUID = no results
  }
};

/**
 * Check if a child_id is accessible to the current session
 * @param {Object} session - Session context
 * @param {string} childId - Child ID to check
 * @returns {boolean} True if accessible
 */
export const canAccessChild = (session, childId) => {
  if (!session || !childId) {
    return false;
  }

  const { role_flags = {}, child_id, accessible_children } = session;

  if (role_flags.isParent) {
    // Parent: can access all children (assuming family_id check is done elsewhere)
    return true;
  } else if (role_flags.isChild) {
    // Child/student: only themselves
    return child_id === childId;
  } else if (role_flags.isTutor) {
    // Tutor: only assigned children
    return accessible_children && accessible_children.includes(childId);
  }

  return false;
};

/**
 * Get list of accessible child IDs for the session
 * @param {Object} session - Session context
 * @returns {string[]} Array of child IDs
 */
export const getAccessibleChildIds = (session) => {
  if (!session) {
    return [];
  }

  const { role_flags = {}, child_id, accessible_children } = session;

  if (role_flags.isParent) {
    // Parent: return all accessible_children (from RPC)
    return accessible_children || [];
  } else if (role_flags.isChild) {
    // Child/student: return only themselves
    return child_id ? [child_id] : [];
  } else if (role_flags.isTutor) {
    // Tutor: return assigned children
    return accessible_children || [];
  }

  return [];
};
