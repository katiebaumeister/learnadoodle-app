"""
Planner Health Engine
Computes health metrics for schedule quality and optimization opportunities
"""
from typing import Dict, List, Any, Optional
from datetime import date, datetime, timedelta
from collections import defaultdict
from supabase_client import get_admin_client
from logger import log_event

def compute_health(
    child_id: Optional[str] = None,
    family_id: str = None,
    horizon_days: int = 14
) -> Dict[str, Any]:
    """
    Compute comprehensive planner health metrics.
    
    Args:
        child_id: Optional child ID for child-specific health
        family_id: Family ID (required)
        horizon_days: Days to look ahead/behind (default 14)
    
    Returns:
        {
            "score": 0-100,
            "warnings": [...],
            "insights": [...],
            "metrics": {
                "daily_load_balance": float,
                "heavy_subject_limit_violations": int,
                "cognitive_load_mismatches": int,
                "theme_alignment_score": float,
                "backlog_pressure_score": float,
                "overdue_task_count": int,
                "reschedule_rate_7_days": float,
                "unavailability_density": float,
                "override_frequency": float,
                "blackout_frequency": float,
                "catch_up_mode_count": int,
            }
        }
    """
    try:
        supabase = get_admin_client()
        today = date.today()
        start_date = today - timedelta(days=horizon_days)
        end_date = today + timedelta(days=horizon_days)
        
        # Fetch required data
        data = _fetch_health_data(
            supabase, child_id, family_id, start_date, end_date
        )
        
        # Compute metrics
        metrics = _compute_metrics(data, child_id, family_id, today, horizon_days)
        
        # Normalize to 0-100 score
        score = _compute_overall_score(metrics)
        
        # Generate warnings and insights
        try:
            warnings = _generate_warnings(metrics, data)
        except Exception as e:
            print(f"[planner_health] Error generating warnings: {e}")
            warnings = []
        
        try:
            insights = _generate_insights(metrics, data)
        except Exception as e:
            print(f"[planner_health] Error generating insights: {e}")
            insights = []
        
        return {
            "score": score,
            "warnings": warnings,
            "insights": insights,
            "metrics": metrics
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        log_event("planner_health.error", child_id=child_id, error=str(e), traceback=error_trace)
        print(f"[planner_health] Error in compute_health: {str(e)}")
        print(f"[planner_health] Traceback: {error_trace}")
        # Re-raise to let the route handler deal with it
        raise


def _fetch_health_data(
    supabase,
    child_id: Optional[str],
    family_id: str,
    start_date: date,
    end_date: date
) -> Dict[str, Any]:
    """Fetch all data needed for health computation."""
    data = {
        "events": [],
        "calendar_days": [],
        "backlog_items": [],
        "subjects": [],
        "children": [],
        "day_themes": [],
        "overrides": [],
        "blackouts": [],
    }
    
    # Fetch events
    query = (
        supabase.table("events")
        .select("*")
        .eq("family_id", family_id)
        .gte("start_ts", start_date.isoformat())
        .lte("start_ts", end_date.isoformat())
        .in_("status", ["scheduled", "done"])
    )
    if child_id:
        query = query.eq("child_id", child_id)
    events_result = query.execute()
    data["events"] = events_result.data or []
    
    # Fetch calendar days cache (optional - may not have permissions)
    try:
        query = (
            supabase.table("calendar_days_cache")
            .select("*")
            .eq("family_id", family_id)
            .gte("date", start_date.isoformat())
            .lte("date", end_date.isoformat())
        )
        if child_id:
            query = query.eq("child_id", child_id)
        calendar_result = query.execute()
        data["calendar_days"] = calendar_result.data or []
    except Exception as e:
        # Permission denied or table not accessible - continue without calendar data
        # This is a non-critical failure - health computation can continue
        print(f"[planner_health] Warning: Could not fetch calendar_days_cache: {e}")
        data["calendar_days"] = []
    
    # Fetch backlog items
    table_name = "backlog_items"
    try:
        supabase.table("backlog_items").select("id").limit(1).execute()
    except:
        table_name = "backlog"
    
    query = (
        supabase.table(table_name)
        .select("*")
        .eq("family_id", family_id)
    )
    if child_id:
        query = query.eq("child_id", child_id)
    backlog_result = query.execute()
    data["backlog_items"] = backlog_result.data or []
    
    # Fetch subjects with cognitive load
    try:
        subjects_result = (
            supabase.table("subject")
            .select("id, name, family_id")
            .eq("family_id", family_id)
            .execute()
        )
        data["subjects"] = subjects_result.data or []
        
        # Fetch cognitive load classifications
        if data["subjects"]:
            subject_ids = [s["id"] for s in data["subjects"]]
            try:
                cog_load_result = (
                    supabase.table("subject_cognitive_load")
                    .select("*")
                    .in_("subject_id", subject_ids)
                    .execute()
                )
                # Map cognitive load to subjects
                cog_load_map = {cl["subject_id"]: cl for cl in (cog_load_result.data or [])}
                for subject in data["subjects"]:
                    subject["cognitive_load"] = cog_load_map.get(subject["id"], {}).get("load_level", "medium") or "medium"
            except:
                # Table might not exist
                for subject in data["subjects"]:
                    subject["cognitive_load"] = "medium"
    except:
        data["subjects"] = []
    
    # Fetch children with cognitive preferences
    query = supabase.table("children").select("*").eq("family_id", family_id)
    if child_id:
        query = query.eq("id", child_id)
    children_result = query.execute()
    data["children"] = children_result.data or []
    
    # Fetch day themes
    try:
        query = supabase.table("day_themes").select("*").eq("family_id", family_id)
        if child_id:
            query = query.eq("child_id", child_id)
        themes_result = query.execute()
        data["day_themes"] = themes_result.data or []
    except:
        data["day_themes"] = []
    
    # Fetch schedule overrides
    # Note: schedule_overrides uses scope_type and scope_id, not family_id
    try:
        query = (
            supabase.table("schedule_overrides")
            .select("*")
            .or_(f"scope_type.eq.family,scope_type.eq.child")
            .gte("date", start_date.isoformat())
            .lte("date", end_date.isoformat())
            .eq("is_active", True)
        )
        # Filter: family scope uses scope_id=family_id, child scope uses scope_id=child_id
        overrides_result = query.execute()
        # Post-filter by family_id (for family scope) or child_id (for child scope)
        all_overrides = overrides_result.data or []
        filtered_overrides = []
        for override in all_overrides:
            if override.get("scope_type") == "family" and override.get("scope_id") == family_id:
                filtered_overrides.append(override)
            elif override.get("scope_type") == "child" and child_id and override.get("scope_id") == child_id:
                filtered_overrides.append(override)
        data["overrides"] = filtered_overrides
    except Exception as e:
        log_event("planner_health.fetch_overrides_error", error=str(e))
        data["overrides"] = []
    
    # Fetch blackouts
    try:
        query = (
            supabase.table("blackout_periods")
            .select("*")
            .eq("family_id", family_id)
            .lte("starts_on", end_date.isoformat())
            .gte("ends_on", start_date.isoformat())
        )
        blackouts_result = query.execute()
        data["blackouts"] = blackouts_result.data or []
    except:
        data["blackouts"] = []
    
    return data


def _compute_metrics(
    data: Dict[str, Any],
    child_id: Optional[str],
    family_id: str,
    today: date,
    horizon_days: int
) -> Dict[str, Any]:
    """Compute all health metrics."""
    events = data.get("events", [])
    calendar_days = data.get("calendar_days", [])
    backlog_items = data.get("backlog_items", [])
    subjects = data.get("subjects", [])
    children = data.get("children", [])
    day_themes = data.get("day_themes", [])
    overrides = data.get("overrides", [])
    blackouts = data.get("blackouts", [])
    
    metrics = {}
    
    try:
        # 1. Daily Load Balance
        metrics["daily_load_balance"] = _compute_daily_load_balance(events, today, horizon_days)
    except Exception as e:
        print(f"[planner_health] Error computing daily_load_balance: {e}")
        metrics["daily_load_balance"] = 0.5  # Default neutral
    
    try:
        # 2. Heavy Subject Limit Violations
        metrics["heavy_subject_limit_violations"] = _compute_heavy_subject_violations(
            events, subjects, children, today, horizon_days
        )
    except Exception as e:
        print(f"[planner_health] Error computing heavy_subject_limit_violations: {e}")
        metrics["heavy_subject_limit_violations"] = 0
    
    try:
        # 3. Cognitive Load Mismatches
        metrics["cognitive_load_mismatches"] = _compute_cognitive_load_mismatches(
            events, subjects, children, today
        )
    except Exception as e:
        print(f"[planner_health] Error computing cognitive_load_mismatches: {e}")
        metrics["cognitive_load_mismatches"] = 0
    
    try:
        # 4. Theme Alignment Score
        metrics["theme_alignment_score"] = _compute_theme_alignment(
            events, day_themes, today, horizon_days
        )
    except Exception as e:
        print(f"[planner_health] Error computing theme_alignment_score: {e}")
        metrics["theme_alignment_score"] = 0.5  # Default neutral
    
    try:
        # 5. Backlog Pressure Score
        metrics["backlog_pressure_score"] = _compute_backlog_pressure(backlog_items)
    except Exception as e:
        print(f"[planner_health] Error computing backlog_pressure_score: {e}")
        metrics["backlog_pressure_score"] = 0.0  # Default no pressure
    
    try:
        # 6. Overdue Task Count
        metrics["overdue_task_count"] = _compute_overdue_tasks(backlog_items, events, today)
    except Exception as e:
        print(f"[planner_health] Error computing overdue_task_count: {e}")
        metrics["overdue_task_count"] = 0
    
    try:
        # 7. Reschedule Rate (7 days)
        metrics["reschedule_rate_7_days"] = _compute_reschedule_rate(events, today)
    except Exception as e:
        print(f"[planner_health] Error computing reschedule_rate_7_days: {e}")
        metrics["reschedule_rate_7_days"] = 0.0
    
    try:
        # 8. Unavailability Density
        metrics["unavailability_density"] = _compute_unavailability_density(calendar_days, today, horizon_days)
    except Exception as e:
        print(f"[planner_health] Error computing unavailability_density: {e}")
        metrics["unavailability_density"] = 0.0
    
    try:
        # 9. Override Frequency
        metrics["override_frequency"] = _compute_override_frequency(overrides, today, horizon_days)
    except Exception as e:
        print(f"[planner_health] Error computing override_frequency: {e}")
        metrics["override_frequency"] = 0.0
    
    try:
        # 10. Blackout Frequency
        metrics["blackout_frequency"] = _compute_blackout_frequency(blackouts, today, horizon_days)
    except Exception as e:
        print(f"[planner_health] Error computing blackout_frequency: {e}")
        metrics["blackout_frequency"] = 0.0
    
    try:
        # 11. Catch-Up Mode Count
        metrics["catch_up_mode_count"] = _compute_catch_up_mode_count(backlog_items)
    except Exception as e:
        print(f"[planner_health] Error computing catch_up_mode_count: {e}")
        metrics["catch_up_mode_count"] = 0
    
    return metrics


def _compute_daily_load_balance(events: List[Dict], today: date, horizon_days: int) -> float:
    """Compute variance in daily workload (lower is better)."""
    daily_minutes = defaultdict(int)
    
    for ev in events:
        try:
            start = datetime.fromisoformat(ev["start_ts"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(ev["end_ts"].replace("Z", "+00:00"))
            day = start.date()
            
            if (today - timedelta(days=horizon_days)) <= day <= (today + timedelta(days=horizon_days)):
                duration = (end - start).total_seconds() / 60
                daily_minutes[day.isoformat()] += duration
        except:
            continue
    
    if not daily_minutes:
        return 0.0
    
    minutes_list = list(daily_minutes.values())
    mean = sum(minutes_list) / len(minutes_list)
    variance = sum((x - mean) ** 2 for x in minutes_list) / len(minutes_list)
    
    # Normalize: 0 = perfect balance, higher = more imbalance
    # Convert to 0-1 scale (then invert so higher = better)
    if mean > 0:
        coefficient_of_variation = (variance ** 0.5) / mean
        # Normalize to 0-1, then invert
        normalized = min(coefficient_of_variation / 2.0, 1.0)  # Cap at 1.0
        return 1.0 - normalized  # Higher is better
    return 1.0


def _compute_heavy_subject_violations(
    events: List[Dict],
    subjects: List[Dict],
    children: List[Dict],
    today: date,
    horizon_days: int
) -> int:
    """Count days where heavy subject limit is exceeded."""
    violations = 0
    
    # Build cognitive load map
    subject_load = {s["id"]: s.get("cognitive_load", "medium") for s in subjects}
    heavy_subjects = {sid for sid, load in subject_load.items() if load in ["high", "heavy"]}
    
    # Get child limits (if available)
    child_limits = {}
    for child in children:
        max_heavy = child.get("max_daily_heavy_subjects", 2)  # Default 2
        child_limits[child["id"]] = max_heavy
    
    # Count heavy subjects per day per child
    daily_heavy = defaultdict(lambda: defaultdict(int))
    
    for ev in events:
        try:
            start = datetime.fromisoformat(ev["start_ts"].replace("Z", "+00:00"))
            day = start.date()
            child_id = ev.get("child_id")
            subject_id = ev.get("subject_id")
            
            if (today - timedelta(days=horizon_days)) <= day <= (today + timedelta(days=horizon_days)):
                if subject_id in heavy_subjects and child_id:
                    daily_heavy[day.isoformat()][child_id] += 1
        except:
            continue
    
    # Check violations
    for day, child_counts in daily_heavy.items():
        for child_id, count in child_counts.items():
            limit = child_limits.get(child_id, 2)
            if count > limit:
                violations += 1
    
    return violations


def _compute_cognitive_load_mismatches(
    events: List[Dict],
    subjects: List[Dict],
    children: List[Dict],
    today: date
) -> int:
    """Count events scheduled during low-energy periods with high cognitive load."""
    mismatches = 0
    
    # Build subject cognitive load map
    subject_load = {s["id"]: s.get("cognitive_load", "medium") for s in subjects}
    
    # Get child low-energy periods (if available)
    child_low_energy = {}
    for child in children:
        periods = child.get("low_energy_periods", [])  # e.g., ["afternoon", "evening"]
        child_low_energy[child["id"]] = periods
    
    for ev in events:
        try:
            start = datetime.fromisoformat(ev["start_ts"].replace("Z", "+00:00"))
            child_id = ev.get("child_id")
            subject_id = ev.get("subject_id")
            
            if not child_id or not subject_id:
                continue
            
            load = subject_load.get(subject_id, "medium")
            if load != "high":
                continue
            
            hour = start.hour
            # Determine time period
            if 14 <= hour < 18:  # 2 PM - 6 PM
                period = "afternoon"
            elif hour >= 18:  # 6 PM+
                period = "evening"
            else:
                continue
            
            low_energy = child_low_energy.get(child_id, [])
            if period in low_energy:
                mismatches += 1
        except:
            continue
    
    return mismatches


def _compute_theme_alignment(
    events: List[Dict],
    day_themes: List[Dict],
    today: date,
    horizon_days: int
) -> float:
    """Compute how well events align with day themes (0-1)."""
    if not day_themes:
        return 1.0  # No themes = perfect alignment
    
    # Build theme map: (day_of_week, child_id) -> subject_ids[]
    theme_map = {}
    for theme in day_themes:
        weekday = theme.get("weekday")  # 0 = Monday
        child_id = theme.get("child_id")
        subject_ids = theme.get("subject_ids", [])
        key = (weekday, child_id)
        theme_map[key] = set(subject_ids)
    
    aligned = 0
    total = 0
    
    for ev in events:
        try:
            start = datetime.fromisoformat(ev["start_ts"].replace("Z", "+00:00"))
            day = start.date()
            
            if day > today + timedelta(days=horizon_days):
                continue
            
            weekday = day.weekday()  # 0 = Monday
            child_id = ev.get("child_id")
            subject_id = ev.get("subject_id")
            
            if not child_id or not subject_id:
                continue
            
            key = (weekday, child_id)
            if key in theme_map:
                total += 1
                if subject_id in theme_map[key]:
                    aligned += 1
        except:
            continue
    
    if total == 0:
        return 1.0
    
    return aligned / total


def _compute_backlog_pressure(backlog_items: List[Dict]) -> float:
    """Compute pressure from backlog (0-1, higher = more pressure)."""
    if not backlog_items:
        return 0.0
    
    # Count unresolved items
    unresolved = [item for item in backlog_items if not item.get("resolved_at")]
    
    # Weight by due dates
    today = date.today()
    pressure_score = 0.0
    
    for item in unresolved:
        due_date = item.get("due_ts")
        if due_date:
            try:
                due = datetime.fromisoformat(due_date.replace("Z", "+00:00")).date()
                days_overdue = (today - due).days
                if days_overdue > 0:
                    pressure_score += min(days_overdue / 7.0, 1.0)  # Cap at 1.0
                else:
                    days_until = (due - today).days
                    if days_until <= 3:
                        pressure_score += (3 - days_until) / 3.0  # Urgent upcoming
            except:
                pressure_score += 0.1  # Default small pressure
    
    # Normalize: 0-1 scale
    return min(pressure_score / len(backlog_items), 1.0) if backlog_items else 0.0


def _compute_overdue_tasks(backlog_items: List[Dict], events: List[Dict], today: date) -> int:
    """Count overdue tasks/events."""
    overdue = 0
    
    for item in backlog_items:
        if item.get("resolved_at"):
            continue
        due_date = item.get("due_ts")
        if due_date:
            try:
                due = datetime.fromisoformat(due_date.replace("Z", "+00:00")).date()
                if due < today:
                    overdue += 1
            except:
                pass
    
    # Also check events with due dates
    for ev in events:
        if ev.get("status") == "done":
            continue
        due_date = ev.get("due_ts")
        if due_date:
            try:
                due = datetime.fromisoformat(due_date.replace("Z", "+00:00")).date()
                if due < today:
                    overdue += 1
            except:
                pass
    
    return overdue


def _compute_reschedule_rate(events: List[Dict], today: date) -> float:
    """Compute reschedule rate in last 7 days (events moved/changed)."""
    seven_days_ago = today - timedelta(days=7)
    recent_events = []
    
    for ev in events:
        try:
            created = datetime.fromisoformat(ev.get("created_at", "").replace("Z", "+00:00")).date()
            if created >= seven_days_ago:
                recent_events.append(ev)
        except:
            continue
    
    if not recent_events:
        return 0.0
    
    # Count events with source='ai' (likely rescheduled)
    rescheduled = sum(1 for ev in recent_events if ev.get("source") == "ai")
    
    return rescheduled / len(recent_events) if recent_events else 0.0


def _compute_unavailability_density(
    calendar_days: List[Dict],
    today: date,
    horizon_days: int
) -> float:
    """Compute density of unavailable days (0-1)."""
    if not calendar_days:
        return 0.0
    
    unavailable = 0
    total = 0
    
    for day in calendar_days:
        try:
            day_str = day.get("date")
            if not day_str:
                continue
            # Handle both date strings and datetime strings
            if isinstance(day_str, str):
                if "T" in day_str:
                    day_date = datetime.fromisoformat(day_str.replace("Z", "+00:00")).date()
                else:
                    day_date = datetime.fromisoformat(day_str).date()
            else:
                continue
            if (today - timedelta(days=horizon_days)) <= day_date <= (today + timedelta(days=horizon_days)):
                total += 1
                status = day.get("day_status", "")
                if status in ["blackout", "unavailable"]:
                    unavailable += 1
        except Exception as e:
            print(f"[planner_health] Error parsing calendar day: {e}, day={day}")
            continue
    
    return unavailable / total if total > 0 else 0.0


def _compute_override_frequency(overrides: List[Dict], today: date, horizon_days: int) -> float:
    """Compute frequency of schedule overrides per day."""
    override_dates = set()
    
    for override in overrides:
        try:
            date_str = override.get("date")
            if not date_str:
                continue
            # Handle both date strings and datetime strings
            if isinstance(date_str, str):
                if "T" in date_str:
                    override_date = datetime.fromisoformat(date_str.replace("Z", "+00:00")).date()
                else:
                    override_date = datetime.fromisoformat(date_str).date()
            else:
                continue
            if (today - timedelta(days=horizon_days)) <= override_date <= (today + timedelta(days=horizon_days)):
                override_dates.add(override_date.isoformat())
        except Exception as e:
            print(f"[planner_health] Error parsing override date: {e}, override={override}")
            continue
    
    total_days = horizon_days * 2
    return len(override_dates) / total_days if total_days > 0 else 0.0


def _compute_blackout_frequency(blackouts: List[Dict], today: date, horizon_days: int) -> float:
    """Compute frequency of blackout days."""
    blackout_dates = set()
    
    for blackout in blackouts:
        try:
            starts_str = blackout.get("starts_on")
            ends_str = blackout.get("ends_on")
            if not starts_str or not ends_str:
                continue
            # Handle both date strings and datetime strings
            if isinstance(starts_str, str):
                if "T" in starts_str:
                    starts = datetime.fromisoformat(starts_str.replace("Z", "+00:00")).date()
                else:
                    starts = datetime.fromisoformat(starts_str).date()
            else:
                continue
            if isinstance(ends_str, str):
                if "T" in ends_str:
                    ends = datetime.fromisoformat(ends_str.replace("Z", "+00:00")).date()
                else:
                    ends = datetime.fromisoformat(ends_str).date()
            else:
                continue
            
            current = starts
            while current <= ends:
                if (today - timedelta(days=horizon_days)) <= current <= (today + timedelta(days=horizon_days)):
                    blackout_dates.add(current.isoformat())
                current += timedelta(days=1)
        except Exception as e:
            print(f"[planner_health] Error parsing blackout dates: {e}, blackout={blackout}")
            continue
    
    total_days = horizon_days * 2
    return len(blackout_dates) / total_days if total_days > 0 else 0.0


def _compute_catch_up_mode_count(backlog_items: List[Dict]) -> int:
    """Count backlog items in catch-up mode."""
    return sum(1 for item in backlog_items if item.get("catch_up_mode") and not item.get("resolved_at"))


def _compute_overall_score(metrics: Dict[str, Any]) -> float:
    """Compute overall health score (0-100)."""
    if not metrics:
        return 0.0
    
    # Weight different metrics
    weights = {
        "daily_load_balance": 0.15,
        "heavy_subject_limit_violations": -0.10,  # Negative = bad
        "cognitive_load_mismatches": -0.10,
        "theme_alignment_score": 0.10,
        "backlog_pressure_score": -0.15,  # Negative = bad
        "overdue_task_count": -0.10,
        "reschedule_rate_7_days": -0.05,  # Some rescheduling is normal
        "unavailability_density": -0.05,
        "override_frequency": -0.05,
        "blackout_frequency": -0.05,
        "catch_up_mode_count": -0.10,
    }
    
    score = 50.0  # Start at neutral
    
    for metric_name, weight in weights.items():
        value = metrics.get(metric_name, 0)
        
        if metric_name in ["daily_load_balance", "theme_alignment_score"]:
            # These are 0-1, higher is better
            score += (value - 0.5) * weight * 100
        elif metric_name in ["backlog_pressure_score", "unavailability_density", 
                             "override_frequency", "blackout_frequency", "reschedule_rate_7_days"]:
            # These are 0-1, lower is better
            score += (0.5 - value) * abs(weight) * 100
        else:
            # Count metrics - normalize first
            if metric_name in ["heavy_subject_limit_violations", "cognitive_load_mismatches"]:
                # Normalize: 0 violations = +50, 5+ violations = -50
                normalized = min(value / 5.0, 1.0)
                score -= normalized * abs(weight) * 100
            elif metric_name == "overdue_task_count":
                # Normalize: 0 overdue = +50, 10+ overdue = -50
                normalized = min(value / 10.0, 1.0)
                score -= normalized * abs(weight) * 100
            elif metric_name == "catch_up_mode_count":
                # Normalize: 0 catch-up = +50, 5+ catch-up = -50
                normalized = min(value / 5.0, 1.0)
                score -= normalized * abs(weight) * 100
    
    # Clamp to 0-100
    return max(0.0, min(100.0, score))


def _generate_warnings(metrics: Dict[str, Any], data: Dict[str, Any]) -> List[str]:
    """Generate warning messages based on metrics."""
    warnings = []
    
    if metrics.get("overdue_task_count", 0) > 5:
        warnings.append(f"{metrics['overdue_task_count']} overdue tasks need attention")
    
    if metrics.get("backlog_pressure_score", 0) > 0.7:
        warnings.append("Backlog is under high pressure - consider catch-up mode")
    
    if metrics.get("heavy_subject_limit_violations", 0) > 3:
        warnings.append("Heavy subject limits frequently exceeded - may cause burnout")
    
    if metrics.get("cognitive_load_mismatches", 0) > 5:
        warnings.append("High cognitive load scheduled during low-energy periods")
    
    if metrics.get("daily_load_balance", 1.0) < 0.6:
        warnings.append("Daily workload is imbalanced - some days are overloaded")
    
    if metrics.get("catch_up_mode_count", 0) > 3:
        warnings.append(f"{metrics['catch_up_mode_count']} items in catch-up mode")
    
    if metrics.get("unavailability_density", 0) > 0.3:
        warnings.append("High unavailability density - schedule may be too constrained")
    
    if metrics.get("reschedule_rate_7_days", 0) > 0.4:
        warnings.append("High reschedule rate indicates schedule instability")
    
    if not warnings:
        warnings.append("All systems healthy!")
    
    return warnings


def _generate_insights(metrics: Dict[str, Any], data: Dict[str, Any]) -> List[str]:
    """Generate insight messages based on metrics."""
    insights = []
    
    if metrics.get("daily_load_balance", 1.0) > 0.8:
        insights.append("Daily workload is well-balanced across the week")
    
    if metrics.get("theme_alignment_score", 0) > 0.7:
        insights.append("Events align well with day themes")
    
    backlog_count = len([item for item in data.get("backlog_items", []) if not item.get("resolved_at")])
    if backlog_count == 0:
        insights.append("Backlog is clear - great planning!")
    elif backlog_count < 5:
        insights.append(f"Backlog is manageable ({backlog_count} items)")
    
    if metrics.get("reschedule_rate_7_days", 0) < 0.2:
        insights.append("Schedule is stable with low rescheduling")
    
    if metrics.get("blackout_frequency", 0) < 0.1:
        insights.append("Blackouts are minimal - good availability")
    
    return insights

