const CHILD_PROFILE_VALUES = ['guided', 'standard', 'independent'];
const TUTOR_PROFILE_VALUES = ['viewer', 'teaching', 'manager'];

export const DEFAULT_CHILD_PROFILE = 'standard';
export const DEFAULT_TUTOR_PROFILE = 'teaching';

const CHILD_PROFILE_PERMISSIONS = {
  guided: {
    canViewHome: true,
    canViewPlanner: false,
    canViewSubjects: true,
    canViewLibrary: false,
    canUseDoodleBot: false,
    canViewProgress: false,
    canEditOwnEvents: false,
    canCreateOwnEvents: false,
    canEditSubjects: false,
    canEditMaterials: false,
    canMarkComplete: true,
    canLogProgress: false,
    canManagePlans: false,
    canChangePlanningPreferences: false,
    canManageFamilySettings: false,
    canEditOwnProfile: false,
  },
  standard: {
    canViewHome: true,
    canViewPlanner: true,
    canViewSubjects: true,
    canViewLibrary: true,
    canUseDoodleBot: true,
    canViewProgress: true,
    canEditOwnEvents: false,
    canCreateOwnEvents: false,
    canEditSubjects: false,
    canEditMaterials: false,
    canMarkComplete: true,
    canLogProgress: true,
    canManagePlans: false,
    canChangePlanningPreferences: false,
    canManageFamilySettings: false,
    canEditOwnProfile: true,
  },
  independent: {
    canViewHome: true,
    canViewPlanner: true,
    canViewSubjects: true,
    canViewLibrary: true,
    canUseDoodleBot: true,
    canViewProgress: true,
    canEditOwnEvents: true,
    canCreateOwnEvents: true,
    canEditSubjects: true,
    canEditMaterials: true,
    canMarkComplete: true,
    canLogProgress: true,
    canManagePlans: false,
    canChangePlanningPreferences: false,
    canManageFamilySettings: false,
    canEditOwnProfile: true,
  },
};

const TUTOR_PROFILE_PERMISSIONS = {
  viewer: {
    canViewAssignedStudentData: true,
    canEditAssignedEvents: false,
    canEditAssignedSubjects: false,
    canEditAssignedMaterials: false,
    canMarkAttendance: false,
    canManageAssignedCurriculum: false,
    canLeaveNotes: true,
    canManageFamilySettings: false,
    canManageInvites: false,
  },
  teaching: {
    canViewAssignedStudentData: true,
    canEditAssignedEvents: true,
    canEditAssignedSubjects: false,
    canEditAssignedMaterials: true,
    canMarkAttendance: true,
    canManageAssignedCurriculum: false,
    canLeaveNotes: true,
    canManageFamilySettings: false,
    canManageInvites: false,
  },
  manager: {
    canViewAssignedStudentData: true,
    canEditAssignedEvents: true,
    canEditAssignedSubjects: true,
    canEditAssignedMaterials: true,
    canMarkAttendance: true,
    canManageAssignedCurriculum: true,
    canLeaveNotes: true,
    canManageFamilySettings: false,
    canManageInvites: false,
  },
};

const LEGACY_KEY_TO_PERMISSION = {
  events: 'canManageEvents',
  subjects: 'canManageSubjects',
  child_profile: 'canEditOwnProfile',
  materials: 'canManageMaterials',
  plans: 'canManagePlans',
  planning_preferences: 'canChangePlanningPreferences',
};

function sanitizeOverrides(overrides) {
  return overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : null;
}

function mergeBooleanOverrides(base, overrides) {
  const next = { ...base };
  const safeOverrides = sanitizeOverrides(overrides);
  if (!safeOverrides) return next;
  for (const [key, value] of Object.entries(safeOverrides)) {
    if (typeof value === 'boolean' && Object.prototype.hasOwnProperty.call(next, key)) {
      next[key] = value;
    }
  }
  return next;
}

export function normalizeChildProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return CHILD_PROFILE_VALUES.includes(normalized) ? normalized : DEFAULT_CHILD_PROFILE;
}

export function normalizeTutorProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return TUTOR_PROFILE_VALUES.includes(normalized) ? normalized : DEFAULT_TUTOR_PROFILE;
}

export function getEffectiveChildPermissions(profile, overrides = null) {
  const resolvedProfile = normalizeChildProfile(profile);
  const base = CHILD_PROFILE_PERMISSIONS[resolvedProfile] || CHILD_PROFILE_PERMISSIONS[DEFAULT_CHILD_PROFILE];
  const merged = mergeBooleanOverrides(base, overrides);
  return {
    ...merged,
    canManageEvents: !!(merged.canEditOwnEvents || merged.canCreateOwnEvents),
    canManageSubjects: !!merged.canEditSubjects,
    canManageMaterials: !!merged.canEditMaterials,
  };
}

export function getEffectiveTutorPermissions(profile, overrides = null) {
  const resolvedProfile = normalizeTutorProfile(profile);
  const base = TUTOR_PROFILE_PERMISSIONS[resolvedProfile] || TUTOR_PROFILE_PERMISSIONS[DEFAULT_TUTOR_PROFILE];
  const merged = mergeBooleanOverrides(base, overrides);
  return {
    ...merged,
    canManageEvents: !!merged.canEditAssignedEvents,
    canManageSubjects: !!(
      merged.canEditAssignedSubjects || merged.canManageAssignedCurriculum
    ),
    canManageMaterials: !!merged.canEditAssignedMaterials,
    canManagePlans: !!merged.canManageAssignedCurriculum,
    canChangePlanningPreferences: false,
    canEditOwnProfile: false,
  };
}

export function applyLegacyFamilyFlagsToPermissions(permissions, flags) {
  const next = { ...permissions };
  const safeFlags = flags && typeof flags === 'object' ? flags : {};
  for (const [legacyKey, permissionKey] of Object.entries(LEGACY_KEY_TO_PERMISSION)) {
    if (typeof safeFlags[legacyKey] === 'boolean') {
      next[permissionKey] = next[permissionKey] && safeFlags[legacyKey];
    }
  }
  return next;
}

export function getPermissionKeyForLegacyControl(legacyKey) {
  return LEGACY_KEY_TO_PERMISSION[legacyKey] || null;
}
