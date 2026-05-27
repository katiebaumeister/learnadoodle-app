import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from './SessionContext';
import { useAuth } from './AuthContext';
import { getFamilyUserControls, rowToFlagMap } from '../lib/services/userControlsClient';
import { supabase } from '../lib/supabase';
import {
  applyLegacyFamilyFlagsToPermissions,
  DEFAULT_CHILD_PROFILE,
  DEFAULT_TUTOR_PROFILE,
  getEffectiveChildPermissions,
  getEffectiveTutorPermissions,
  getPermissionKeyForLegacyControl,
  normalizeChildProfile,
  normalizeTutorProfile,
} from '../lib/permissions/userPermissionProfiles';

const FamilyUserControlsContext = createContext(null);

export function FamilyUserControlsProvider({ children }) {
  const session = useSession();
  const { user } = useAuth();
  const familyId = session?.family_id ?? null;
  const authUserId = user?.id ?? null;
  const isChild = !!session?.role_flags?.isChild;
  const isTutor = !!session?.role_flags?.isTutor;
  const isSelfManagedStudent =
    isChild &&
    session?.student_self_signup === true &&
    session?.child_linked_via_accepted_invite !== true;
  const isRestrictedViewer = !!(
    (isChild || isTutor) && !isSelfManagedStudent
  );

  const [flags, setFlags] = useState(() => rowToFlagMap(null));
  const [profileType, setProfileType] = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const [effectivePermissions, setEffectivePermissions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!familyId) {
      setFlags(rowToFlagMap(null));
      setProfileType(null);
      setActiveProfile(null);
      setEffectivePermissions(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await getFamilyUserControls(familyId);
      if (err) throw err;
      const nextFlags = rowToFlagMap(data);
      setFlags(nextFlags);

      if (!isRestrictedViewer) {
        if (isSelfManagedStudent) {
          setProfileType('child');
          setActiveProfile('self_managed');
          setEffectivePermissions(getEffectiveChildPermissions('self_managed'));
          return;
        }
        setProfileType(null);
        setActiveProfile(null);
        setEffectivePermissions(null);
      } else if (isChild) {
        const childId = session?.child_id || session?.accessible_children?.[0] || null;
        let childRow = null;
        if (childId) {
          const { data: fetchedChild, error: childErr } = await supabase
            .from('children')
            .select('permission_profile, custom_permissions_enabled, permission_overrides')
            .eq('id', childId)
            .maybeSingle();
          if (!childErr) childRow = fetchedChild || null;
        }
        const resolvedProfile = normalizeChildProfile(childRow?.permission_profile || data?.child_default_profile || DEFAULT_CHILD_PROFILE);
        const overrides = childRow?.custom_permissions_enabled ? childRow?.permission_overrides : null;
        setProfileType('child');
        setActiveProfile(resolvedProfile);
        setEffectivePermissions(
          applyLegacyFamilyFlagsToPermissions(getEffectiveChildPermissions(resolvedProfile, overrides), nextFlags)
        );
      } else if (isTutor) {
        let tutorMember = null;
        if (authUserId) {
          const { data: memberRow, error: memberErr } = await supabase
            .from('family_members')
            .select('tutor_permission_profile, custom_permissions_enabled, permission_overrides')
            .eq('family_id', familyId)
            .eq('user_id', authUserId)
            .maybeSingle();
          if (!memberErr) tutorMember = memberRow || null;
        }
        const resolvedProfile = normalizeTutorProfile(tutorMember?.tutor_permission_profile || DEFAULT_TUTOR_PROFILE);
        const overrides = tutorMember?.custom_permissions_enabled ? tutorMember?.permission_overrides : null;
        setProfileType('tutor');
        setActiveProfile(resolvedProfile);
        setEffectivePermissions(
          applyLegacyFamilyFlagsToPermissions(getEffectiveTutorPermissions(resolvedProfile, overrides), nextFlags)
        );
      }
    } catch (e) {
      setError(e?.message || 'Failed to load user controls');
      setFlags(rowToFlagMap(null));
      setProfileType(null);
      setActiveProfile(null);
      setEffectivePermissions(null);
    } finally {
      setLoading(false);
    }
  }, [authUserId, familyId, isChild, isRestrictedViewer, isSelfManagedStudent, isTutor, session?.accessible_children, session?.child_id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Parents are never blocked by these flags. Child/tutor use stored flags (default allow). */
  const allowed = useCallback(
    (key) => {
      if (!isRestrictedViewer) return true;
      const mappedPermission = getPermissionKeyForLegacyControl(key);
      if (mappedPermission) {
        if (effectivePermissions && Object.prototype.hasOwnProperty.call(effectivePermissions, mappedPermission)) {
          return !!effectivePermissions[mappedPermission];
        }
        return !!flags[key];
      }
      return !!flags[key];
    },
    [effectivePermissions, flags, isRestrictedViewer]
  );

  const value = useMemo(
    () => ({
      familyId,
      flags,
      loading,
      error,
      refresh: load,
      isRestrictedViewer,
      isSelfManagedStudent,
      allowed,
      activeProfile,
      profileType,
      effectivePermissions,
    }),
    [
      familyId,
      flags,
      loading,
      error,
      load,
      isRestrictedViewer,
      isSelfManagedStudent,
      allowed,
      activeProfile,
      profileType,
      effectivePermissions,
    ]
  );

  return (
    <FamilyUserControlsContext.Provider value={value}>{children}</FamilyUserControlsContext.Provider>
  );
}

export function useFamilyUserControls() {
  const ctx = useContext(FamilyUserControlsContext);
  if (!ctx) {
    throw new Error('useFamilyUserControls must be used within FamilyUserControlsProvider');
  }
  return ctx;
}

/** Safe when provider is absent (e.g. tests); enforcement defaults to allow-all. */
export function useOptionalFamilyUserControls() {
  const ctx = useContext(FamilyUserControlsContext);
  if (!ctx) {
    return {
      familyId: null,
      flags: rowToFlagMap(null),
      loading: false,
      error: null,
      refresh: () => {},
      isRestrictedViewer: false,
      isSelfManagedStudent: false,
      allowed: () => true,
      activeProfile: null,
      profileType: null,
      effectivePermissions: null,
    };
  }
  return ctx;
}
