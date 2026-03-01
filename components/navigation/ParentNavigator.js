/**
 * Parent Navigator
 * 
 * Full experience with same structure for parent and child:
 * - Left sidebar (Home, Planner, Subjects, Library, Family)
 * - Center content (child-scoped when userRole is child)
 * Used for both parents and children so UI/structure match exactly.
 */

import React from 'react';
import WebLayout from '../WebLayout';

export default function ParentNavigator({ session, user, userRole: propUserRole, ...props }) {
  const userRole = propUserRole ?? (session?.role_flags?.isChild ? 'child' : session?.role_flags?.isTutor ? 'tutor' : 'parent');
  return <WebLayout {...props} session={session} user={user} userRole={userRole} />;
}
