/**
 * Session Context - Single Source of Truth for Role Resolution
 * 
 * Primary role source: family_members.member_role (NOT NULL)
 * Secondary fallback: profiles.role (optional, for backward compatibility)
 * 
 * Provides:
 * - family_id (active family)
 * - member_role (from family_members)
 * - child_id (if applicable)
 * - child_scope (if applicable)
 * - accessible_children (from RPC)
 * - effective_role (resolved role)
 * - role_flags (isParent, isTutor, isChild)
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const SessionContext = createContext(null);

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
};

export const SessionProvider = ({ children, familyId: propFamilyId = null }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [legacyMode, setLegacyMode] = useState(false);

  // Load session context
  const loadSession = useCallback(async (familyIdToUse) => {
    if (!user) {
      setSession(null);
      setLoading(false);
      return;
    }

    try {
      // Step 1: Determine active family_id
      let activeFamilyId = familyIdToUse || propFamilyId;
      
      if (!activeFamilyId) {
        // Fetch from profiles table (fallback)
        const { data: profile } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .maybeSingle();
        
        activeFamilyId = profile?.family_id || null;
      }

      if (!activeFamilyId) {
        console.warn('[SessionContext] No family_id found');
        setSession({
          family_id: null,
          member_role: null,
          child_id: null,
          child_scope: [],
          accessible_children: [],
          effective_role: 'parent',
          role_flags: {
            isParent: true,
            isTutor: false,
            isChild: false,
          },
          legacyMode: true,
        });
        setLoading(false);
        return;
      }

      // Step 2: Query family_members for auth.uid() + family_id
      const { data: familyMember, error: fmError } = await supabase
        .from('family_members')
        .select('member_role, child_scope, child_id')
        .eq('user_id', user.id)
        .eq('family_id', activeFamilyId)
        .maybeSingle();

      let memberRole = null;
      let childScope = [];
      let childId = null;
      let isLegacy = false;

      if (familyMember && !fmError) {
        // Primary source: family_members
        memberRole = familyMember.member_role;
        childScope = familyMember.child_scope || [];
        childId = familyMember.child_id || null;
      } else {
        // Fallback: profiles.role (legacy mode)
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        
        memberRole = profile?.role || 'parent';
        isLegacy = true;
        
        if (process.env.NODE_ENV === 'development') {
          console.warn('[SessionContext] Using legacy mode - family_members row not found. Falling back to profiles.role');
        }
      }

      // Step 3: Call get_accessible_children() RPC
      let accessibleChildren = [];
      try {
        const { data: accessibleData, error: rpcError } = await supabase
          .rpc('get_accessible_children', { _user_id: user.id });
        
        if (!rpcError && accessibleData) {
          // Filter to only children in the active family
          accessibleChildren = accessibleData
            .filter(item => item.family_id === activeFamilyId)
            .map(item => item.child_id)
            .filter(Boolean);
        }
      } catch (rpcError) {
        console.warn('[SessionContext] get_accessible_children RPC failed:', rpcError);
        // Fallback: if child/student, use child_id
        if (memberRole === 'child' || memberRole === 'student') {
          if (childId) {
            accessibleChildren = [childId];
          } else if (childScope.length > 0) {
            accessibleChildren = childScope;
          }
        }
      }

      // Step 4: Derive effective_role
      const effectiveRole = memberRole || 'parent';

      // Step 5: Derive role_flags
      const roleFlags = {
        isParent: effectiveRole === 'parent',
        isTutor: effectiveRole === 'tutor',
        isChild: effectiveRole === 'child' || effectiveRole === 'student',
      };

      // Step 6: For child/student, ensure child_id is set
      if (roleFlags.isChild && !childId && accessibleChildren.length > 0) {
        childId = accessibleChildren[0];
      }

      setLegacyMode(isLegacy);
      setSession({
        family_id: activeFamilyId,
        member_role: memberRole,
        child_id: childId,
        child_scope: childScope,
        accessible_children: accessibleChildren,
        effective_role: effectiveRole,
        role_flags: roleFlags,
        legacyMode: isLegacy,
      });
    } catch (error) {
      console.error('[SessionContext] Error loading session:', error);
      setSession({
        family_id: null,
        member_role: null,
        child_id: null,
        child_scope: [],
        accessible_children: [],
        effective_role: 'parent',
        role_flags: {
          isParent: true,
          isTutor: false,
          isChild: false,
        },
        legacyMode: true,
      });
    } finally {
      setLoading(false);
    }
  }, [user, propFamilyId]);

  // Load session when user or familyId changes
  useEffect(() => {
    if (user) {
      loadSession(propFamilyId);
    } else {
      setSession(null);
      setLoading(false);
    }
  }, [user, propFamilyId, loadSession]);

  // Refresh session (useful after role changes)
  const refreshSession = useCallback(() => {
    if (user) {
      setLoading(true);
      loadSession(session?.family_id || propFamilyId);
    }
  }, [user, session, propFamilyId, loadSession]);

  const value = {
    ...session,
    loading,
    legacyMode,
    refreshSession,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};
