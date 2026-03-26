import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SessionProvider } from '../contexts/SessionContext';
import { FamilyUserControlsProvider } from '../contexts/FamilyUserControlsContext';
import RoleGate from './navigation/RoleGate';

/**
 * Logged-in shell (session + role routing). Code-split from WebRouter so
 * landing/auth first paint does not download the main app bundle.
 */
export default function AuthenticatedApp() {
  const { user } = useAuth();
  return (
    <SessionProvider>
      <FamilyUserControlsProvider>
        <RoleGate user={user} />
      </FamilyUserControlsProvider>
    </SessionProvider>
  );
}
