/**
 * Planner Health Engine (Frontend)
 * Computes and normalizes health metrics
 */

export interface HealthMetrics {
  daily_load_balance: number;
  heavy_subject_limit_violations: number;
  cognitive_load_mismatches: number;
  theme_alignment_score: number;
  backlog_pressure_score: number;
  overdue_task_count: number;
  reschedule_rate_7_days: number;
  unavailability_density: number;
  override_frequency: number;
  blackout_frequency: number;
  catch_up_mode_count: number;
}

export interface PlannerHealth {
  score: number; // 0-100
  warnings: string[];
  insights: string[];
  metrics: HealthMetrics;
}

/**
 * Normalize metrics to 0-1 scale where higher is better
 */
export function normalizeMetrics(metrics: Partial<HealthMetrics>): Partial<HealthMetrics> {
  const normalized: Partial<HealthMetrics> = {};
  
  // Daily load balance: already 0-1, higher is better
  if (metrics.daily_load_balance !== undefined) {
    normalized.daily_load_balance = metrics.daily_load_balance;
  }
  
  // Heavy subject violations: count, lower is better
  // Normalize: 0 violations = 1.0, 5+ violations = 0.0
  if (metrics.heavy_subject_limit_violations !== undefined) {
    normalized.heavy_subject_limit_violations = Math.max(0, 1.0 - (metrics.heavy_subject_limit_violations / 5.0));
  }
  
  // Cognitive load mismatches: count, lower is better
  if (metrics.cognitive_load_mismatches !== undefined) {
    normalized.cognitive_load_mismatches = Math.max(0, 1.0 - (metrics.cognitive_load_mismatches / 5.0));
  }
  
  // Theme alignment: already 0-1, higher is better
  if (metrics.theme_alignment_score !== undefined) {
    normalized.theme_alignment_score = metrics.theme_alignment_score;
  }
  
  // Backlog pressure: 0-1, lower is better (invert)
  if (metrics.backlog_pressure_score !== undefined) {
    normalized.backlog_pressure_score = 1.0 - metrics.backlog_pressure_score;
  }
  
  // Overdue tasks: count, lower is better
  if (metrics.overdue_task_count !== undefined) {
    normalized.overdue_task_count = Math.max(0, 1.0 - (metrics.overdue_task_count / 10.0));
  }
  
  // Reschedule rate: 0-1, lower is better (invert)
  if (metrics.reschedule_rate_7_days !== undefined) {
    normalized.reschedule_rate_7_days = 1.0 - metrics.reschedule_rate_7_days;
  }
  
  // Unavailability density: 0-1, lower is better (invert)
  if (metrics.unavailability_density !== undefined) {
    normalized.unavailability_density = 1.0 - metrics.unavailability_density;
  }
  
  // Override frequency: 0-1, lower is better (invert)
  if (metrics.override_frequency !== undefined) {
    normalized.override_frequency = 1.0 - metrics.override_frequency;
  }
  
  // Blackout frequency: 0-1, lower is better (invert)
  if (metrics.blackout_frequency !== undefined) {
    normalized.blackout_frequency = 1.0 - metrics.blackout_frequency;
  }
  
  // Catch-up mode count: count, lower is better
  if (metrics.catch_up_mode_count !== undefined) {
    normalized.catch_up_mode_count = Math.max(0, 1.0 - (metrics.catch_up_mode_count / 5.0));
  }
  
  return normalized;
}

/**
 * Generate warnings from metrics
 */
export function generateWarnings(metrics: Partial<HealthMetrics>): string[] {
  const warnings: string[] = [];
  
  if ((metrics.overdue_task_count || 0) > 5) {
    warnings.push(`${metrics.overdue_task_count} overdue tasks need attention`);
  }
  
  if ((metrics.backlog_pressure_score || 0) > 0.7) {
    warnings.push('Backlog is under high pressure - consider catch-up mode');
  }
  
  if ((metrics.heavy_subject_limit_violations || 0) > 3) {
    warnings.push('Heavy subject limits frequently exceeded - may cause burnout');
  }
  
  if ((metrics.cognitive_load_mismatches || 0) > 5) {
    warnings.push('High cognitive load scheduled during low-energy periods');
  }
  
  if ((metrics.daily_load_balance || 1.0) < 0.6) {
    warnings.push('Daily workload is imbalanced - some days are overloaded');
  }
  
  if ((metrics.catch_up_mode_count || 0) > 3) {
    warnings.push(`${metrics.catch_up_mode_count} items in catch-up mode`);
  }
  
  if ((metrics.unavailability_density || 0) > 0.3) {
    warnings.push('High unavailability density - schedule may be too constrained');
  }
  
  if ((metrics.reschedule_rate_7_days || 0) > 0.4) {
    warnings.push('High reschedule rate indicates schedule instability');
  }
  
  return warnings;
}

/**
 * Generate insights from metrics
 */
export function generateInsights(metrics: Partial<HealthMetrics>): string[] {
  const insights: string[] = [];
  
  if ((metrics.daily_load_balance || 0) > 0.8) {
    insights.push('Daily workload is well-balanced across the week');
  }
  
  if ((metrics.theme_alignment_score || 0) > 0.7) {
    insights.push('Events align well with day themes');
  }
  
  if ((metrics.reschedule_rate_7_days || 0) < 0.2) {
    insights.push('Schedule is stable with low rescheduling');
  }
  
  if ((metrics.blackout_frequency || 0) < 0.1) {
    insights.push('Blackouts are minimal - good availability');
  }
  
  return insights;
}

/**
 * Compute overall health score from normalized metrics
 */
export function computeScore(metrics: Partial<HealthMetrics>): number {
  const normalized = normalizeMetrics(metrics);
  
  // Weight different metrics
  const weights = {
    daily_load_balance: 0.15,
    heavy_subject_limit_violations: 0.10,
    cognitive_load_mismatches: 0.10,
    theme_alignment_score: 0.10,
    backlog_pressure_score: 0.15,
    overdue_task_count: 0.10,
    reschedule_rate_7_days: 0.05,
    unavailability_density: 0.05,
    override_frequency: 0.05,
    blackout_frequency: 0.05,
    catch_up_mode_count: 0.10,
  };
  
  let score = 0;
  let totalWeight = 0;
  
  for (const [metric, weight] of Object.entries(weights)) {
    const value = normalized[metric as keyof HealthMetrics];
    if (value !== undefined) {
      score += value * weight;
      totalWeight += weight;
    }
  }
  
  // Normalize to 0-100
  if (totalWeight > 0) {
    score = (score / totalWeight) * 100;
  }
  
  return Math.max(0, Math.min(100, score));
}

