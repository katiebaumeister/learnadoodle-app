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
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { getMe, getIntegrationStatus } from '../lib/apiClient';
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
      // Step 1: Try backend /api/me first (uses service role, avoids 500 from Supabase family_members)
      let activeFamilyId = familyIdToUse || propFamilyId;
      let memberRole = null;
      let childScope = [];
      let childId = null;
      let isLegacy = false;
      let accessibleChildren = [];

      // getMe may return 401 if backend requires verified email; we still resolve role from family_members/profiles below
      const meRes = await getMe();
      // If backend says 401 (e.g. user deleted), check if profile still exists; if not or error, sign out so user sees landing page
      if (meRes?.error?.status === 401) {
        const { data: profileCheck, error: profileErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();
        if (!profileCheck || profileErr) {
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setLoading(false);
          return;
        }
      }
      if (meRes?.data && (meRes.data.family_id || meRes.data.role)) {
        activeFamilyId = activeFamilyId || meRes.data.family_id || null;
        memberRole = meRes.data.role || null;
        if (Array.isArray(meRes.data.accessible_children)) {
          accessibleChildren = meRes.data.accessible_children.map(c => c?.id || c).filter(Boolean);
        }
      }

      // Step 2: If no family_id yet, get from profiles
      if (!activeFamilyId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .maybeSingle();
        activeFamilyId = profile?.family_id || null;
      }

      if (!activeFamilyId) {
        // Expected for new parents until ensure_family runs; only warn for non-parents (unexpected)
        if ((memberRole || 'parent') !== 'parent') {
          console.warn('[SessionContext] No family_id found');
        }
        setSession({
          family_id: null,
          member_role: memberRole || 'parent',
          child_id: null,
          child_scope: [],
          accessible_children: accessibleChildren,
          effective_role: memberRole || 'parent',
          role_flags: {
            isParent: (memberRole || 'parent') === 'parent',
            isTutor: memberRole === 'tutor',
            isChild: memberRole === 'child' || memberRole === 'student',
          },
          legacyMode: true,
        });
        setLoading(false);
        return;
      }

      // Step 3: If we didn't get role from backend, try family_members then profiles (may 500 if table missing or RLS)
      if (memberRole == null) {
        try {
          const { data: familyMember, error: fmError } = await supabase
            .from('family_members')
            .select('member_role, child_scope, child_id')
            .eq('user_id', user.id)
            .eq('family_id', activeFamilyId)
            .maybeSingle();

          if (familyMember && !fmError) {
            memberRole = familyMember.member_role;
            childScope = familyMember.child_scope || [];
            childId = familyMember.child_id || null;
          }
        } catch (_) {
          // Supabase 500 or missing table - ignore, use profiles fallback (no log to avoid console noise)
        }
        if (memberRole == null) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          memberRole = profile?.role || 'parent';
          isLegacy = true;
          // Only log in development, and at debug level (family_members may 500 if table/RLS not ready)
          if (process.env.NODE_ENV === 'development' && typeof console.debug === 'function') {
            console.debug('[SessionContext] Using profiles.role (family_members unavailable or no row).');
          }
        }
      }

      // Step 4: If we don't have accessible_children yet, call get_accessible_children() RPC
      if (accessibleChildren.length === 0) {
        try {
          const { data: accessibleData, error: rpcError } = await supabase
            .rpc('get_accessible_children', { _user_id: user.id });
          if (!rpcError && accessibleData) {
            accessibleChildren = accessibleData
              .filter(item => item.family_id === activeFamilyId)
              .map(item => item.child_id)
              .filter(Boolean);
          }
        } catch (rpcError) {
          console.warn('[SessionContext] get_accessible_children RPC failed:', rpcError);
          if (memberRole === 'child' || memberRole === 'student') {
            if (childId) accessibleChildren = [childId];
            else if (childScope.length > 0) accessibleChildren = childScope;
          }
        }
      }

      // Step 5: Derive effective_role
      const effectiveRole = memberRole || 'parent';

      // Step 6: Derive role_flags
      const roleFlags = {
        isParent: effectiveRole === 'parent',
        isTutor: effectiveRole === 'tutor',
        isChild: effectiveRole === 'child' || effectiveRole === 'student',
      };

      // Step 7: For child/student, ensure child_id is set
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

      // Preload home data in background (non-blocking)
      if (activeFamilyId && Platform.OS === 'web') {
        preloadHomeData(activeFamilyId).catch(err => {
          console.warn('[SessionContext] Error preloading home data:', err);
        });
        // Preload connection status in background (non-blocking)
        preloadConnectionStatus(activeFamilyId).catch(err => {
          console.warn('[SessionContext] Error preloading connection status:', err);
        });
      }
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

  // Preload home data in background
  const preloadHomeData = useCallback(async (familyId) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dateStr = today.toISOString().split('T')[0];
      
      // Check if already cached
      const cacheKey = `home_data_${familyId}_${dateStr}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
        if (age < CACHE_TTL_MS) {
          // Cache is still valid, no need to preload
          return;
        }
      }
      
      // Fetch and cache home data
      const { data, error } = await supabase.rpc('get_home_data', {
        _family_id: familyId,
        _date: dateStr,
        _horizon_days: 14,
      });
      
      if (!error && data) {
        // Sanitize avatar/url fields so cached data never contains UUIDs (prevents 404s when used as image src)
        const clean = (val) => {
          if (Array.isArray(val)) return val.map(clean);
          if (val && typeof val === 'object') {
            const out = {};
            const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
            const keys = ['avatar_url', 'avatar', 'url', 'thumbnailUrl', 'cover_image_url'];
            for (const [k, v] of Object.entries(val)) {
              if (keys.includes(k) && typeof v === 'string' && uuid.test(v.trim()) && !v.includes('http') && !v.includes('data:')) {
                out[k] = null;
              } else {
                out[k] = clean(v);
              }
            }
            return out;
          }
          return val;
        };
        localStorage.setItem(cacheKey, JSON.stringify({
          data: clean(data),
          timestamp: Date.now()
        }));
        console.log('[SessionContext] Home data preloaded');
      }
    } catch (err) {
      // Silently fail - this is just a preload
      console.warn('[SessionContext] Preload failed:', err);
    }
  }, []);

  // Preload connection status in background (uses same API base as apiClient)
  const preloadConnectionStatus = useCallback(async (familyId) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    try {
      const cacheKey = `connection_status_${familyId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
        if (age < CACHE_TTL_MS) return;
      }
      
      const { data: statusData, error } = await getIntegrationStatus();
      if (!error && statusData != null) {
        localStorage.setItem(cacheKey, JSON.stringify({
          data: statusData,
          timestamp: Date.now()
        }));
        console.log('[SessionContext] Connection status preloaded');
      }
      // Preload is best-effort; no warning when backend is unreachable (e.g. Load failed)
    } catch (_err) {
      // Intentionally silent — connection status preload failure is expected when server is down
    }
  }, []);

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
