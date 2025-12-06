/**
 * Merge Constraints Helper
 * Combines constraints from multiple sources into unified daily constraint objects
 */

export type ConstraintStatus = 'off' | 'partial' | 'teach';
export type ConstraintReason = 'vacation' | 'no_school' | 'late_start' | 'early_end' | 'shorter_day' | 'custom_hours' | null;

export interface DailyConstraint {
  date: string; // YYYY-MM-DD
  status: ConstraintStatus;
  reason: ConstraintReason;
  start_override?: string; // HH:MM format
  end_override?: string; // HH:MM format
  child_id?: string; // Optional: for child-specific constraints
}

export interface ConstraintSources {
  blackouts: Array<{
    child_id?: string;
    family_id: string;
    starts_on: string;
    ends_on: string;
    reason?: string;
  }>;
  overrides: Array<{
    child_id?: string;
    family_id: string;
    date: string;
    override_kind: string;
    start_override?: string;
    end_override?: string;
    is_active: boolean;
  }>;
  rules: Array<{
    child_id?: string;
    family_id: string;
    day_of_week: number;
    first_block_start?: string;
    last_block_end?: string;
  }>;
  cache: Array<{
    child_id?: string;
    family_id: string;
    date: string;
    day_status: string;
    first_block_start?: string;
    last_block_end?: string;
  }>;
}

/**
 * Merge constraints from all sources into unified daily constraints
 */
export function mergeConstraints(
  sources: ConstraintSources,
  weekStart: Date,
  childIds?: string[]
): DailyConstraint[] {
  const constraints: DailyConstraint[] = [];
  const weekDays: Date[] = [];
  
  // Generate all 7 days of the week
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    weekDays.push(date);
  }
  
  // Process each day
  for (const day of weekDays) {
    const dateStr = formatDate(day);
    const weekday = day.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // If childIds provided, create constraint for each child
    if (childIds && childIds.length > 0) {
      for (const childId of childIds) {
        const constraint = computeDayConstraint(
          dateStr,
          weekday,
          childId,
          sources
        );
        constraints.push(constraint);
      }
    } else {
      // Family-level constraint
      const constraint = computeDayConstraint(
        dateStr,
        weekday,
        undefined,
        sources
      );
      constraints.push(constraint);
    }
  }
  
  return constraints;
}

/**
 * Compute constraint for a single day
 */
function computeDayConstraint(
  dateStr: string,
  weekday: number,
  childId: string | undefined,
  sources: ConstraintSources
): DailyConstraint {
  // Default: normal teaching day
  let status: ConstraintStatus = 'teach';
  let reason: ConstraintReason = null;
  let startOverride: string | undefined;
  let endOverride: string | undefined;
  
  // 1. Check blackouts first (highest priority)
  const blackout = sources.blackouts.find(b => {
    if (childId && b.child_id && b.child_id !== childId) return false;
    if (!childId && b.child_id) return false; // Family-level check
    
    const starts = new Date(b.starts_on);
    const ends = new Date(b.ends_on);
    const day = new Date(dateStr);
    
    return day >= starts && day <= ends;
  });
  
  if (blackout) {
    status = 'off';
    reason = mapBlackoutReason(blackout.reason);
    return {
      date: dateStr,
      status,
      reason,
      child_id: childId,
    };
  }
  
  // 2. Check schedule overrides
  const override = sources.overrides.find(o => {
    if (!o.is_active) return false;
    if (childId && o.child_id && o.child_id !== childId) return false;
    if (!childId && o.child_id) return false;
    
    return o.date === dateStr;
  });
  
  if (override) {
    const overrideKind = override.override_kind;
    
    if (overrideKind === 'day_off' || overrideKind === 'no_school') {
      status = 'off';
      reason = 'no_school';
    } else if (
      overrideKind === 'late_start' ||
      overrideKind === 'early_end' ||
      overrideKind === 'shorter_day' ||
      overrideKind === 'custom_hours' ||
      overrideKind === 'partial_day'
    ) {
      status = 'partial';
      reason = mapOverrideReason(overrideKind);
      startOverride = override.start_override;
      endOverride = override.end_override;
    }
  }
  
  // 3. Check calendar cache (truth source)
  const cacheEntry = sources.cache.find(c => {
    if (childId && c.child_id && c.child_id !== childId) return false;
    if (!childId && c.child_id) return false;
    
    return c.date === dateStr;
  });
  
  if (cacheEntry) {
    const cacheStatus = cacheEntry.day_status;
    
    if (cacheStatus === 'blackout' || cacheStatus === 'unavailable') {
      status = 'off';
      reason = 'no_school';
    } else if (cacheStatus === 'partial' || cacheStatus === 'override') {
      status = 'partial';
      // Use cache override times if available
      if (cacheEntry.first_block_start) {
        startOverride = formatTime(cacheEntry.first_block_start);
      }
      if (cacheEntry.last_block_end) {
        endOverride = formatTime(cacheEntry.last_block_end);
      }
    } else {
      // Normal teaching day
      status = 'teach';
    }
  }
  
  // 4. Check baseline rules (lowest priority, only if no other constraint)
  if (status === 'teach') {
    const rule = sources.rules.find(r => {
      if (childId && r.child_id && r.child_id !== childId) return false;
      if (!childId && r.child_id) return false;
      
      // Map weekday: JavaScript getDay() returns 0=Sunday, but rules might use 1=Monday
      // Adjust if needed based on your schema
      const ruleDay = r.day_of_week;
      // Assuming rules use 0=Monday format
      const adjustedWeekday = weekday === 0 ? 6 : weekday - 1; // Convert to 0=Monday
      
      return ruleDay === adjustedWeekday;
    });
    
    // Rules don't change status, they just define baseline availability
    // If no rule exists, day might be off by default
    if (!rule) {
      // No rule = no scheduled availability = off
      status = 'off';
      reason = null;
    }
  }
  
  return {
    date: dateStr,
    status,
    reason,
    start_override: startOverride,
    end_override: endOverride,
    child_id: childId,
  };
}

/**
 * Map blackout reason to constraint reason
 */
function mapBlackoutReason(reason?: string): ConstraintReason {
  if (!reason) return 'no_school';
  
  const lower = reason.toLowerCase();
  if (lower.includes('vacation')) return 'vacation';
  if (lower.includes('holiday')) return 'no_school';
  if (lower.includes('travel')) return 'vacation';
  
  return 'no_school';
}

/**
 * Map override kind to constraint reason
 */
function mapOverrideReason(overrideKind: string): ConstraintReason {
  switch (overrideKind) {
    case 'late_start':
      return 'late_start';
    case 'early_end':
      return 'early_end';
    case 'shorter_day':
    case 'partial_day':
      return 'shorter_day';
    case 'custom_hours':
      return 'custom_hours';
    default:
      return null;
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format time string (handles various formats)
 */
function formatTime(timeStr: string | undefined): string | undefined {
  if (!timeStr) return undefined;
  
  // If already in HH:MM format, return as-is
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr;
  }
  
  // If it's a timestamp, extract time
  try {
    const date = new Date(timeStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return timeStr;
  }
}

