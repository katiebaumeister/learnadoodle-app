/**
 * Parent Navigator
 * 
 * Full parent experience with all features:
 * - Home, Planner, Subjects, Library, Family management
 * - All children visible
 * - Full analytics and admin settings
 */

import React from 'react';
import WebLayout from '../WebLayout';

export default function ParentNavigator({ session, user, ...props }) {
  // Pass session context to WebLayout
  // WebLayout will use session.role_flags to show/hide features
  return <WebLayout {...props} session={session} user={user} />;
}
