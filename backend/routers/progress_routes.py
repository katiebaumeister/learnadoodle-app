"""
FastAPI routes for Progress Forecasting
Estimates learning progress and completion dates
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client
import json
import re
import ast

router = APIRouter(prefix="/api/progress", tags=["progress"])


# --- Pydantic Models ---

class ForecastRangeInput(BaseModel):
    start: str = Field(..., description="Start date (YYYY-MM-DD)")
    end: str = Field(..., description="End date (YYYY-MM-DD)")


class ForecastInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    child_ids: List[str] = Field(..., description="Child IDs")
    range: ForecastRangeInput = Field(..., description="Date range")
    timezone: str = Field("America/New_York", description="Timezone")
    subject_id: Optional[str] = Field(None, description="Optional subject ID to filter by")


# --- Helper Functions ---

def calculate_pace(child_id: str, events: List[Dict[str, Any]], today: date, events_already_filtered: bool = False) -> float:
    """
    Calculate effective learning pace (minutes per day) for a child.
    Uses rolling 14-day average of completed minutes.
    Falls back to planned pace * 0.7 if no history.
    
    Args:
        child_id: Child ID (only used if events_already_filtered is False)
        events: List of events (already filtered by child_id and optionally subject_id if events_already_filtered is True)
        today: Today's date
        events_already_filtered: If True, events are already filtered by child_id (and possibly subject_id)
    """
    # Filter events from last 14 days
    fourteen_days_ago = today - timedelta(days=14)
    if events_already_filtered:
        # Events already filtered by child_id (and possibly subject_id)
        recent_events = [
            e for e in events
            if e.get("status") == "done"
            and datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date() >= fourteen_days_ago
        ]
    else:
        # Filter by child_id
        recent_events = [
            e for e in events
            if e.get("child_id") == child_id
            and e.get("status") == "done"
            and datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date() >= fourteen_days_ago
        ]
    
    if not recent_events:
        # No completion history - estimate from planned pace
        if events_already_filtered:
            planned_events = [
                e for e in events
                if e.get("status") == "scheduled"
                and datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date() >= fourteen_days_ago
            ]
        else:
            planned_events = [
                e for e in events
                if e.get("child_id") == child_id
                and e.get("status") == "scheduled"
                and datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date() >= fourteen_days_ago
            ]
        
        if planned_events:
            # Calculate average planned minutes per day
            total_planned = sum(
                (datetime.fromisoformat(e["end_ts"].replace("Z", "+00:00")) -
                 datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00"))).total_seconds() / 60
                for e in planned_events
            )
            days_with_events = len(set(
                datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date()
                for e in planned_events
            ))
            if days_with_events > 0:
                planned_pace = total_planned / days_with_events
                return planned_pace * 0.7  # Conservative estimate
    
    # Calculate from completed events
    completed_minutes_by_day = {}
    for event in recent_events:
        event_date = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00")).date()
        duration = (datetime.fromisoformat(event["end_ts"].replace("Z", "+00:00")) -
                   datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00"))).total_seconds() / 60
        
        if event_date not in completed_minutes_by_day:
            completed_minutes_by_day[event_date] = 0
        completed_minutes_by_day[event_date] += duration
    
    if not completed_minutes_by_day:
        return 30.0  # Default fallback
    
    total_minutes = sum(completed_minutes_by_day.values())
    days_with_activity = len(completed_minutes_by_day)
    
    return total_minutes / max(days_with_activity, 1)


def calculate_confidence(
    child_id: str,
    events: List[Dict[str, Any]],
    today: date,
    availability_utilization: float,
    events_already_filtered: bool = False,
    is_subject_specific: bool = False
) -> float:
    """
    Calculate confidence score (0-1) for forecast.
    Starts at 1.0, subtracts penalties based on data quality.
    
    Args:
        child_id: Child ID (only used if events_already_filtered is False)
        events: List of events (already filtered by child_id and optionally subject_id if events_already_filtered is True)
        today: Today's date
        availability_utilization: Utilization percentage
        events_already_filtered: If True, events are already filtered by child_id (and possibly subject_id)
        is_subject_specific: If True, this is a subject-specific forecast (adjust thresholds accordingly)
    """
    confidence = 1.0
    
    # Check learning days in last 14 days
    fourteen_days_ago = today - timedelta(days=14)
    if events_already_filtered:
        # Events already filtered by child_id (and possibly subject_id)
        recent_events = [
            e for e in events
            if datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date() >= fourteen_days_ago
        ]
    else:
        # Filter by child_id
        recent_events = [
            e for e in events
            if e.get("child_id") == child_id
            and datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date() >= fourteen_days_ago
        ]
    
    learning_days = len(set(
        datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date()
        for e in recent_events
    ))
    
    # Adjust threshold based on whether this is subject-specific
    # Subject-specific forecasts will have fewer events naturally, so use lower threshold
    if is_subject_specific:
        # For subject-specific, use a more nuanced approach based on actual activity
        # Calculate activity level: total completed events in last 14 days
        completed_count = len([e for e in recent_events if e.get("status") == "done"])
        total_count = len(recent_events)
        
        # Calculate total completed minutes for this subject (for more granular differentiation)
        completed_minutes = sum(
            (datetime.fromisoformat(e["end_ts"].replace("Z", "+00:00")) -
             datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00"))).total_seconds() / 60
            for e in recent_events if e.get("status") == "done"
        )
        
        # For subject-specific, use more lenient penalties that allow differentiation
        # Base confidence on activity level with progressive penalties
        if total_count == 0:
            # No events at all for this subject - significant penalty but not crushing
            confidence -= 0.4  # Results in 60% confidence
        elif completed_count == 0 and total_count > 0:
            # Has scheduled events but nothing completed - moderate penalty
            confidence -= 0.25  # Results in 75% confidence
        elif completed_count == 1:
            # Only 1 completed event - small penalty, vary by duration
            if completed_minutes < 30:
                confidence -= 0.15  # Very short session - results in 85%
            elif completed_minutes < 60:
                confidence -= 0.1  # Short session - results in 90%
            else:
                confidence -= 0.05  # Decent session - results in 95%
        elif completed_count == 2:
            # 2 completed events - minimal penalty, vary by duration
            if completed_minutes < 60:
                confidence -= 0.1  # Results in 90%
            elif completed_minutes < 120:
                confidence -= 0.05  # Results in 95%
            else:
                # No penalty for 2+ good sessions
                pass  # 100% confidence
        elif completed_count >= 3:
            # Good activity level - no penalty or very minimal
            if completed_minutes < 90:
                confidence -= 0.05  # Light penalty if minutes are low - results in 95%
            # If 3+ events and 90+ minutes, no penalty (good activity) - 100%
    else:
        # For overall forecast, use original threshold
        min_learning_days = 5
        if learning_days < min_learning_days:
            confidence -= 0.2
    
    # Check missed events ratio (only if there are recent events)
    # Skip this check if we already penalized for no events above
    if len(recent_events) > 0:
        scheduled_events = [e for e in recent_events if e.get("status") == "scheduled"]
        done_events = [e for e in recent_events if e.get("status") == "done"]
        total_recent = len(scheduled_events) + len(done_events)
        
        if total_recent > 0:
            missed_ratio = len(scheduled_events) / total_recent
            # For subject-specific, be more lenient with missed ratio (subjects may have fewer scheduled items)
            missed_threshold = 0.3 if is_subject_specific else 0.2
            if missed_ratio > missed_threshold:
                # Scale penalty based on missed ratio severity
                if is_subject_specific:
                    # For subject-specific, reduce penalty severity
                    confidence -= min(0.15, missed_ratio * 0.3)
                else:
                    confidence -= 0.2
    
    # Check availability utilization
    # For subject-specific, high utilization is good (shows planning), so don't penalize
    # For overall forecasts, high utilization (>85%) means over-scheduled, which reduces confidence
    if not is_subject_specific and availability_utilization > 0.85:
        confidence -= 0.1
    
    # Clamp between 0.3 and 0.95
    return max(0.3, min(0.95, confidence))


def identify_risk_drivers(
    child_id: str,
    events: List[Dict[str, Any]],
    today: date,
    pace: float,
    utilization: float,
    events_already_filtered: bool = False
) -> List[str]:
    """
    Identify primary risk drivers for a child's progress.
    
    Args:
        child_id: Child ID (only used if events_already_filtered is False)
        events: List of events (already filtered by child_id and optionally subject_id if events_already_filtered is True)
        today: Today's date
        pace: Current pace in minutes per day
        utilization: Utilization percentage
        events_already_filtered: If True, events are already filtered by child_id (and possibly subject_id)
    """
    drivers = []
    
    # Check weekly utilization
    if utilization < 0.4:
        drivers.append("Low weekly utilization")
    
    # Check missed sessions
    fourteen_days_ago = today - timedelta(days=14)
    if events_already_filtered:
        # Events already filtered by child_id (and possibly subject_id)
        recent_events = [
            e for e in events
            if datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date() >= fourteen_days_ago
        ]
    else:
        # Filter by child_id
        recent_events = [
            e for e in events
            if e.get("child_id") == child_id
            and datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date() >= fourteen_days_ago
        ]
    
    scheduled_count = len([e for e in recent_events if e.get("status") == "scheduled"])
    done_count = len([e for e in recent_events if e.get("status") == "done"])
    total_recent = scheduled_count + done_count
    
    if total_recent > 0:
        missed_ratio = scheduled_count / total_recent
        if missed_ratio > 0.2:
            drivers.append("High number of missed sessions")
    
    # Check overloaded days
    minutes_by_day = {}
    for event in recent_events:
        if event.get("status") == "done":
            event_date = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00")).date()
            duration = (datetime.fromisoformat(event["end_ts"].replace("Z", "+00:00")) -
                       datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00"))).total_seconds() / 60
            
            if event_date not in minutes_by_day:
                minutes_by_day[event_date] = 0
            minutes_by_day[event_date] += duration
    
    overloaded_days = [d for d, m in minutes_by_day.items() if m > 240]
    if overloaded_days:
        drivers.append("Overloaded days")
    
    # Check pace
    if pace < 20:
        drivers.append("Very low learning pace")
    
    return drivers


def forecast_completion_date(
    remaining_minutes: float,
    pace: float,
    start_date: date,
    weekdays_only: bool = True
) -> date:
    """
    Forecast completion date based on remaining minutes and pace.
    """
    if pace <= 0:
        pace = 30.0  # Default fallback
    
    forecast_days = remaining_minutes / pace
    
    if weekdays_only:
        # Count only weekdays
        current_date = start_date
        days_added = 0
        while days_added < forecast_days:
            if current_date.weekday() < 5:  # Monday-Friday
                days_added += 1
            current_date += timedelta(days=1)
        return current_date
    else:
        return start_date + timedelta(days=int(forecast_days))


def classify_status(
    confidence: float,
    forecast_date: date,
    expected_end: Optional[date],
    remaining_minutes: float,
    planned_remaining: float
) -> str:
    """
    Classify child status: on_track, at_risk, or ahead
    """
    # Check if ahead
    if planned_remaining > 0:
        remaining_ratio = remaining_minutes / planned_remaining
        if remaining_ratio < 0.8:  # 20% less remaining
            return "ahead"
    
    # Check if at risk
    if confidence < 0.7:
        return "at_risk"
    
    if expected_end and forecast_date > expected_end:
        days_overdue = (forecast_date - expected_end).days
        if days_overdue > 7:
            return "at_risk"
    
    # Default to on track
    return "on_track"


# --- Routes ---

@router.post("/forecast")
async def forecast_progress(
    body: ForecastInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Forecast learning progress and completion dates for children.
    Returns status, pace, confidence, and forecast dates.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
        supabase = get_admin_client()
        
        # Validate children belong to family
        for child_id in body.child_ids:
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(status_code=403, detail=f"Child {child_id} not found")
        
        # Parse date range
        start_date = date.fromisoformat(body.range.start)
        end_date = date.fromisoformat(body.range.end)
        today = date.today()
        
        # Load events for the range
        start_ts = datetime.combine(start_date, datetime.min.time()).isoformat()
        end_ts = datetime.combine(end_date, datetime.max.time()).isoformat()
        
        events_query = supabase.table("events").select("*").eq(
            "family_id", family_id
        ).in_("child_id", body.child_ids).gte(
            "start_ts", start_ts
        ).lte("start_ts", end_ts).neq(
            "status", "canceled"
        ).is_("deleted_at", None)
        
        # Filter by subject_id if provided
        if body.subject_id:
            events_query = events_query.eq("subject_id", body.subject_id)
        
        events_res = events_query.order("start_ts").execute()
        events = events_res.data or []
        
        # Load active curriculum sequences
        # Get curriculum units with lessons (handle case where tables don't exist)
        units = []
        unit_lessons = {}
        
        try:
            units_query = supabase.table("curriculum_units").select(
                "id, title, student_ids, weeks_est, total_minutes_est, subject_id"
            ).eq("family_id", family_id)
            
            # Filter by subject_id if provided
            if body.subject_id:
                units_query = units_query.eq("subject_id", body.subject_id)
            
            units_res = units_query.execute()
            
            # Check for Supabase errors (can be in error attribute or exception)
            if hasattr(units_res, 'error') and units_res.error:
                error_obj = units_res.error
                # Extract error message
                if isinstance(error_obj, dict):
                    error_msg = error_obj.get('message', str(error_obj))
                else:
                    error_msg = str(error_obj)
                
                # Check if error is about table not existing
                if 'does not exist' in error_msg or '42P01' in error_msg or 'relation' in error_msg.lower():
                    log_event("progress.forecast.curriculum_units_missing", error=error_msg)
                    units = []
                    unit_lessons = {}
                else:
                    # Other error - log but continue without curriculum data
                    log_event("progress.forecast.curriculum_units_error", error=error_msg)
                    units = []
                    unit_lessons = {}
            elif units_res.data is not None:
                units = units_res.data
                
                # Get lessons for each unit
                for unit in units:
                    try:
                        lessons_res = supabase.table("curriculum_lessons").select(
                            "id, unit_id, sequence_index, title, minutes_est"
                        ).eq("unit_id", unit["id"]).order("sequence_index").execute()
                        
                        # Check for Supabase errors
                        if hasattr(lessons_res, 'error') and lessons_res.error:
                            error_obj = lessons_res.error
                            if isinstance(error_obj, dict):
                                error_msg = error_obj.get('message', str(error_obj))
                            else:
                                error_msg = str(error_obj)
                            
                            if 'does not exist' in error_msg or '42P01' in error_msg or 'relation' in error_msg.lower():
                                log_event("progress.forecast.curriculum_lessons_missing", unit_id=unit["id"], error=error_msg)
                                unit_lessons[unit["id"]] = []
                            else:
                                log_event("progress.forecast.curriculum_lessons_error", unit_id=unit["id"], error=error_msg)
                                unit_lessons[unit["id"]] = []
                        elif lessons_res.data is not None:
                            unit_lessons[unit["id"]] = lessons_res.data
                        else:
                            unit_lessons[unit["id"]] = []
                    except Exception as e:
                        # Table might not exist, skip this unit
                        error_msg = str(e)
                        # Also check if error is a dict with message
                        if isinstance(e, dict):
                            error_msg = e.get('message', str(e))
                        elif hasattr(e, 'message'):
                            error_msg = str(e.message)
                        
                        if 'does not exist' in error_msg or '42P01' in error_msg or 'relation' in error_msg.lower():
                            log_event("progress.forecast.curriculum_lessons_missing", unit_id=unit["id"], error=error_msg)
                            unit_lessons[unit["id"]] = []
                        else:
                            # Re-raise if it's a different error
                            raise
            else:
                units = []
        except Exception as e:
            # Curriculum tables don't exist yet - that's okay, continue without curriculum data
            error_msg = str(e)
            error_repr = repr(e)
            
            # Try to extract message from error dict if it's serialized as string
            # The error might be formatted as: {'message': '...', 'code': '...'}
            # Or as exception string: Error forecasting progress: {'message': '...', ...}
            try:
                # First, try to extract from repr which might have the dict
                dict_match = re.search(r"\{[^{}]*'message'[^{}]*\}", error_repr, re.DOTALL)
                if not dict_match:
                    dict_match = re.search(r"\{[^{}]*'message'[^{}]*\}", error_msg, re.DOTALL)
                
                if dict_match:
                    try:
                        # Try to parse as Python dict literal using ast.literal_eval
                        dict_str = dict_match.group(0)
                        error_dict = ast.literal_eval(dict_str)
                        if isinstance(error_dict, dict) and 'message' in error_dict:
                            error_msg = error_dict['message']
                    except:
                        # Fallback: try to extract message directly with regex
                        # Pattern: 'message': 'relation "public.curriculum_units" does not exist'
                        # Use a more flexible pattern that handles nested quotes
                        msg_match = re.search(r"'message':\s*'((?:[^']|'(?=[^']))*?)'", error_msg)
                        if msg_match:
                            error_msg = msg_match.group(1)
                        else:
                            # Try simpler pattern
                            msg_match2 = re.search(r"'message':\s*['\"]([^'\"]+)['\"]", error_msg)
                            if msg_match2:
                                error_msg = msg_match2.group(1)
            except:
                pass
            
            # Also check if error has message attribute
            if hasattr(e, 'message'):
                error_msg = str(e.message)
            elif hasattr(e, 'args') and e.args:
                # Check first arg which might be the error dict
                first_arg = e.args[0]
                if isinstance(first_arg, dict):
                    error_msg = first_arg.get('message', str(e))
                elif isinstance(first_arg, str) and ('does not exist' in first_arg or '42P01' in first_arg):
                    error_msg = first_arg
            
            # Check if this is a "table does not exist" error
            # Check both the original error_msg and the full error string
            is_missing_table = (
                'does not exist' in error_msg or 
                '42P01' in error_msg or 
                'relation' in error_msg.lower() or
                'curriculum_units' in error_msg.lower()
            )
            
            if is_missing_table:
                log_event("progress.forecast.curriculum_units_missing", error=error_msg)
                units = []
                unit_lessons = {}
            else:
                # Re-raise if it's a different error
                raise
        
        # Load availability for utilization calculation
        from routers.util import load_planning_context
        
        context = await load_planning_context(
            family_id=family_id,
            week_start=body.range.start,
            child_ids=body.child_ids,
            horizon_weeks=1
        )
        
        # Build per-child forecast
        per_child = []
        global_insights = []
        
        for child_id in body.child_ids:
            # Filter events for this child (and subject if provided)
            child_events = [e for e in events if e.get("child_id") == child_id]
            
            # If subject_id is provided, events are already filtered by subject_id at query level
            # Calculate pace using only this child's events (already filtered by subject if provided)
            # Pass events_already_filtered=True since child_events are already filtered by child_id
            pace = calculate_pace(child_id, child_events, today, events_already_filtered=True)
            
            # Calculate utilization for this subject (using only scheduled events for this subject/child)
            # Filter to scheduled events in the date range
            start_ts = datetime.combine(start_date, datetime.min.time()).isoformat()
            end_ts = datetime.combine(end_date, datetime.max.time()).isoformat()
            scheduled_events_for_subject = [
                e for e in child_events
                if e.get("status") == "scheduled"
                and datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")) >= datetime.fromisoformat(start_ts)
                and datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")) <= datetime.fromisoformat(end_ts)
            ]
            
            total_scheduled_minutes = sum(
                (datetime.fromisoformat(e["end_ts"].replace("Z", "+00:00")) -
                 datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00"))).total_seconds() / 60
                for e in scheduled_events_for_subject
            )
            
            # Get availability windows for this child
            child_availability = [
                a for a in context.get("availability", [])
                if a.get("child_id") == child_id
            ]
            
            total_available_minutes = 0
            for avail_entry in child_availability:
                windows = avail_entry.get("windows", [])
                for window in windows:
                    window_start = datetime.fromisoformat(window["start"].replace("Z", "+00:00"))
                    window_end = datetime.fromisoformat(window["end"].replace("Z", "+00:00"))
                    total_available_minutes += (window_end - window_start).total_seconds() / 60
            
            # Calculate utilization - if subject-specific, this shows how much of available time is used for this subject
            # For subject-specific forecasts, we'll use a more lenient calculation
            if body.subject_id:
                # For subject-specific, calculate utilization as percentage of typical learning time per week
                # Use a baseline of ~5 hours per week per subject as full utilization (300 minutes)
                baseline_minutes_per_week_per_subject = 5 * 60  # 5 hours = 300 minutes
                weeks_in_range = max((end_date - start_date).days / 7.0, 1.0)
                baseline_total = baseline_minutes_per_week_per_subject * weeks_in_range
                
                # Calculate utilization, but cap it reasonably to avoid penalizing subjects with many scheduled events
                if baseline_total > 0:
                    utilization = min(total_scheduled_minutes / baseline_total, 1.5)  # Allow up to 150% (very full schedule)
                else:
                    utilization = 0.5  # Default if baseline is 0
                
                # For subject-specific, we don't want to penalize high utilization as much
                # since a full subject schedule is good, not bad
            else:
                # For overall forecast, use actual availability (high utilization is bad - means over-scheduled)
                utilization = total_scheduled_minutes / total_available_minutes if total_available_minutes > 0 else 0.5
            
            # Calculate confidence using only this child's events (already filtered by subject if provided)
            # Pass events_already_filtered=True since child_events are already filtered by child_id
            # Pass is_subject_specific=True if filtering by subject (will use more lenient thresholds)
            confidence = calculate_confidence(
                child_id, 
                child_events, 
                today, 
                utilization, 
                events_already_filtered=True,
                is_subject_specific=bool(body.subject_id)
            )
            
            # Identify risk drivers using only this child's events (already filtered by subject if provided)
            # Pass events_already_filtered=True since child_events are already filtered by child_id
            risk_drivers = identify_risk_drivers(child_id, child_events, today, pace, utilization, events_already_filtered=True)
            
            # Process sequences for this child
            # If no curriculum units exist, we can still forecast based on events
            child_sequences = []
            
            if units:
                for unit in units:
                    if child_id not in (unit.get("student_ids") or []):
                        continue
                    
                    lessons = unit_lessons.get(unit["id"], [])
                    
                    # Find completed lessons (events with curriculum_lesson_id)
                    completed_lesson_ids = set()
                    for event in child_events:
                        if event.get("curriculum_lesson_id") and event.get("status") == "done":
                            completed_lesson_ids.add(event["curriculum_lesson_id"])
                    
                    # Calculate remaining minutes
                    remaining_minutes = sum(
                        lesson.get("minutes_est", 60)
                        for lesson in lessons
                        if lesson["id"] not in completed_lesson_ids
                    )
                    
                    if remaining_minutes <= 0:
                        continue  # Sequence complete
                    
                    # Calculate planned remaining (from unit estimate)
                    planned_total = unit.get("total_minutes_est", 0)
                    completed_total = sum(
                        lesson.get("minutes_est", 60)
                        for lesson in lessons
                        if lesson["id"] in completed_lesson_ids
                    )
                    planned_remaining = planned_total - completed_total
                    
                    # Forecast completion date
                    forecast_date = forecast_completion_date(
                        remaining_minutes,
                        pace,
                        today,
                        weekdays_only=True
                    )
                    
                    # Calculate sequence confidence
                    sequence_confidence = confidence  # Use child-level confidence as base
                    
                    # Identify sequence-specific risk reasons
                    sequence_risks = []
                    if remaining_minutes > planned_remaining * 1.2:
                        sequence_risks.append("Sequence too dense for availability")
                    if pace < 30:
                        sequence_risks.append("Low learning pace")
                    
                    # Determine recommended action
                    if confidence < 0.7 or len(risk_drivers) > 2:
                        recommended_action = "plan_week"
                    elif remaining_minutes / pace > 14:  # More than 2 weeks remaining
                        recommended_action = "quick_reschedule"
                    else:
                        recommended_action = "monitor"
                    
                    child_sequences.append({
                        "sequence_id": unit["id"],
                        "title": unit.get("title", "Untitled Unit"),
                        "remaining_minutes": int(remaining_minutes),
                        "forecast_completion_date": forecast_date.isoformat(),
                        "confidence": round(sequence_confidence, 2),
                        "risk_reasons": sequence_risks + risk_drivers[:2],  # Top 2 child-level risks
                        "recommended_action": recommended_action,
                        "planned_remaining": int(planned_remaining) if planned_remaining > 0 else int(remaining_minutes)
                    })
            
            # Classify overall status
            # Find expected end date from sequences
            expected_end = None
            if child_sequences:
                # Use longest sequence as reference
                longest_sequence = max(child_sequences, key=lambda s: s["remaining_minutes"])
                expected_end = date.fromisoformat(longest_sequence["forecast_completion_date"])
            
            # Calculate totals for status classification
            total_remaining = sum(s["remaining_minutes"] for s in child_sequences)
            total_planned_remaining = sum(
                s.get("planned_remaining", s["remaining_minutes"])
                for s in child_sequences
            )
            
            # Use forecast date from longest sequence if available
            forecast_date_for_status = today
            if child_sequences:
                longest_sequence = max(child_sequences, key=lambda s: s["remaining_minutes"])
                forecast_date_for_status = date.fromisoformat(longest_sequence["forecast_completion_date"])
            
            status = classify_status(
                confidence,
                forecast_date_for_status,
                expected_end,
                total_remaining,
                total_planned_remaining
            )
            
            per_child.append({
                "child_id": child_id,
                "status": status,
                "pace_minutes_per_day": round(pace, 1),
                "confidence": round(confidence, 2),
                "utilization_ratio": round(utilization, 2),
                "sequences": child_sequences
            })
        
        # Generate global insights
        if len(body.child_ids) > 1:
            # Compare paces across children
            paces = [c["pace_minutes_per_day"] for c in per_child]
            if len(set(paces)) > 1:
                global_insights.append("Learning paces vary significantly across children.")
        
        # Check for overloaded days
        all_dates = set()
        for event in events:
            event_date = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00")).date()
            all_dates.add(event_date)
        
        # Check for day-of-week patterns
        weekday_counts = {}
        for event_date in all_dates:
            weekday = event_date.strftime("%A")
            weekday_counts[weekday] = weekday_counts.get(weekday, 0) + 1
        
        if weekday_counts.get("Tuesday", 0) > weekday_counts.get("Monday", 0) * 1.5:
            global_insights.append("Next two weeks are overloaded on Tuesdays.")
        
        log_event(
            "progress.forecast.generated",
            family_id=family_id,
            children_count=len(body.child_ids),
            user_id=user["id"]
        )
        
        return {
            "generated_at": datetime.now().isoformat(),
            "per_child": per_child,
            "global_insights": global_insights
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("progress.forecast.error", family_id=body.family_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error forecasting progress: {str(e)}")


# Export router
__all__ = ["router"]

