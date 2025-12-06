"""
AI Workload Balancing Routes
Balance assignments by cognitive load
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
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

router = APIRouter(prefix="/api/ai/workload", tags=["ai_workload"])


class WorkloadBalanceInput(BaseModel):
    child_id: str
    date_range_start: date
    date_range_end: date
    target_daily_load: Optional[str] = Field(default="medium", description="'low', 'medium', or 'high'")


@router.post("/balance")
async def balance_workload(
    body: WorkloadBalanceInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Balance assignments by cognitive load for optimal learning"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_check = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=404, detail="Child not found")

        # Get assignments in date range
        assignments_result = supabase.table("assignments").select(
            "id, title, due_date, cognitive_load, estimated_duration_minutes, status"
        ).eq("child_id", body.child_id).gte("due_date", body.date_range_start).lte("due_date", body.date_range_end).order("due_date").execute()

        assignments = assignments_result.data or []

        # Get daily checklist items
        checklist_result = supabase.table("daily_checklist_items").select(
            "id, title, date, cognitive_load, estimated_minutes, completed"
        ).eq("child_id", body.child_id).gte("date", body.date_range_start).lte("date", body.date_range_end).order("date").execute()

        checklist_items = checklist_result.data or []

        # Calculate cognitive load scores
        load_scores = {"low": 1, "medium": 2, "high": 3}

        # Group by date and calculate daily load
        daily_loads = {}
        for assignment in assignments:
            if assignment.get("due_date") and assignment.get("status") not in ["accepted", "reviewed"]:
                date_key = assignment["due_date"]
                if date_key not in daily_loads:
                    daily_loads[date_key] = {"assignments": [], "checklist": [], "total_load": 0, "total_minutes": 0}

                load_score = load_scores.get(assignment.get("cognitive_load", "medium"), 2)
                minutes = assignment.get("estimated_duration_minutes", 30)
                
                daily_loads[date_key]["assignments"].append(assignment)
                daily_loads[date_key]["total_load"] += load_score
                daily_loads[date_key]["total_minutes"] += minutes

        for item in checklist_items:
            if item.get("date") and not item.get("completed"):
                date_key = item["date"]
                if date_key not in daily_loads:
                    daily_loads[date_key] = {"assignments": [], "checklist": [], "total_load": 0, "total_minutes": 0}

                load_score = load_scores.get(item.get("cognitive_load", "medium"), 2)
                minutes = item.get("estimated_minutes", 15)
                
                daily_loads[date_key]["checklist"].append(item)
                daily_loads[date_key]["total_load"] += load_score
                daily_loads[date_key]["total_minutes"] += minutes

        # Identify overloaded and underloaded days
        target_load = load_scores.get(body.target_daily_load, 2)
        overloaded_days = []
        underloaded_days = []
        balanced_days = []

        for date_key, load_data in daily_loads.items():
            if load_data["total_load"] > target_load + 1:
                overloaded_days.append({
                    "date": date_key,
                    "current_load": load_data["total_load"],
                    "target_load": target_load,
                    "assignments": load_data["assignments"],
                    "checklist": load_data["checklist"],
                    "total_minutes": load_data["total_minutes"],
                })
            elif load_data["total_load"] < target_load - 1:
                underloaded_days.append({
                    "date": date_key,
                    "current_load": load_data["total_load"],
                    "target_load": target_load,
                    "assignments": load_data["assignments"],
                    "checklist": load_data["checklist"],
                    "total_minutes": load_data["total_minutes"],
                })
            else:
                balanced_days.append({
                    "date": date_key,
                    "current_load": load_data["total_load"],
                    "target_load": target_load,
                    "assignments": load_data["assignments"],
                    "checklist": load_data["checklist"],
                    "total_minutes": load_data["total_minutes"],
                })

        # Generate suggestions for rebalancing
        suggestions = []
        
        # Suggest moving assignments from overloaded to underloaded days
        for overloaded in overloaded_days:
            for underloaded in underloaded_days:
                if overloaded["total_load"] > target_load and underloaded["total_load"] < target_load:
                    # Find a low/medium load assignment to move
                    for assignment in overloaded["assignments"]:
                        if assignment.get("cognitive_load") in ["low", "medium"]:
                            suggestions.append({
                                "type": "move_assignment",
                                "assignment_id": assignment["id"],
                                "assignment_title": assignment["title"],
                                "from_date": overloaded["date"],
                                "to_date": underloaded["date"],
                                "reason": f"Move '{assignment['title']}' to balance workload",
                            })
                            break

        log_event("ai.workload.analyzed", user_id=user["id"], child_id=body.child_id)

        return {
            "success": True,
            "summary": {
                "overloaded_days": len(overloaded_days),
                "underloaded_days": len(underloaded_days),
                "balanced_days": len(balanced_days),
                "target_load": body.target_daily_load,
            },
            "overloaded_days": overloaded_days,
            "underloaded_days": underloaded_days,
            "balanced_days": balanced_days,
            "suggestions": suggestions,
        }

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_workload_balance")
        raise HTTPException(status_code=500, detail=f"Error balancing workload: {str(e)}")


@router.post("/optimize")
async def optimize_schedule(
    body: WorkloadBalanceInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Optimize assignment schedule by redistributing workload"""
    try:
        # First get the balance analysis
        balance_result = await balance_workload(body, user, None)

        if not balance_result.get("success"):
            raise HTTPException(status_code=400, detail="Failed to analyze workload")

        suggestions = balance_result.get("suggestions", [])

        # Apply suggestions (this would actually move assignments in a real implementation)
        applied_suggestions = []
        supabase = get_admin_client()

        for suggestion in suggestions[:5]:  # Limit to 5 suggestions
            if suggestion["type"] == "move_assignment":
                # Update assignment due date
                result = supabase.table("assignments").update({
                    "due_date": suggestion["to_date"],
                    "updated_at": datetime.now().isoformat(),
                }).eq("id", suggestion["assignment_id"]).execute()

                if result.data:
                    applied_suggestions.append(suggestion)

        log_event("ai.workload.optimized", user_id=user["id"], child_id=body.child_id, suggestions_applied=len(applied_suggestions))

        return {
            "success": True,
            "applied_suggestions": applied_suggestions,
            "message": f"Optimized schedule: {len(applied_suggestions)} assignments moved",
        }

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_workload_optimize")
        raise HTTPException(status_code=500, detail=f"Error optimizing schedule: {str(e)}")


@router.post("/analyze-cognitive-patterns")
async def analyze_cognitive_patterns(
    child_id: str,
    days_back: int = Query(30, ge=7, le=90),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Analyze cognitive load patterns for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_check = supabase.table("children").select("id, first_name").eq("id", child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=404, detail="Child not found")

        # Get events and assignments for analysis period
        from datetime import date, timedelta
        start_date = date.today() - timedelta(days=days_back)
        
        events_result = supabase.table("events").select(
            "id, title, start_ts, end_ts, cognitive_load, subject_id"
        ).eq("child_id", child_id).gte("start_ts", start_date.isoformat()).order("start_ts").execute()

        assignments_result = supabase.table("assignments").select(
            "id, title, due_date, cognitive_load, estimated_duration_minutes, status"
        ).eq("child_id", child_id).gte("due_date", start_date).order("due_date").execute()

        events = events_result.data or []
        assignments = assignments_result.data or []

        # Analyze patterns
        patterns = {
            "daily_rhythm": _analyze_daily_rhythm(events),
            "weekly_pattern": _analyze_weekly_pattern(events),
            "subject_distribution": _analyze_subject_distribution(events),
            "time_of_day": _analyze_time_of_day(events),
            "cognitive_peaks": _analyze_cognitive_peaks(events, assignments),
        }

        # Save patterns to database
        for pattern_type, pattern_data in patterns.items():
            if pattern_data:
                pattern_record = {
                    "child_id": child_id,
                    "family_id": family_id,
                    "pattern_type": pattern_type,
                    "pattern_data": pattern_data,
                    "confidence": 0.7,
                    "valid_until": (date.today() + timedelta(days=30)).isoformat(),
                }
                supabase.table("ai_cognitive_load_patterns").insert(pattern_record).execute()

        log_event("ai.workload.patterns_analyzed", user_id=user["id"], child_id=child_id)

        return {
            "success": True,
            "patterns": patterns,
        }

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_workload_patterns")
        raise HTTPException(status_code=500, detail=f"Error analyzing patterns: {str(e)}")


def _analyze_daily_rhythm(events):
    """Analyze daily cognitive load rhythm"""
    from collections import defaultdict
    daily_loads = defaultdict(lambda: {"low": 0, "medium": 0, "high": 0})
    
    for event in events:
        if event.get("start_ts") and event.get("cognitive_load"):
            from datetime import datetime
            try:
                event_date = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00")).date()
                load = event.get("cognitive_load", "medium")
                daily_loads[event_date.isoformat()][load] += 1
            except:
                pass
    
    return dict(daily_loads)


def _analyze_weekly_pattern(events):
    """Analyze weekly cognitive load pattern"""
    from collections import defaultdict
    weekday_loads = defaultdict(lambda: {"low": 0, "medium": 0, "high": 0})
    
    for event in events:
        if event.get("start_ts") and event.get("cognitive_load"):
            from datetime import datetime
            try:
                event_date = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00"))
                weekday = event_date.weekday()  # 0 = Monday
                load = event.get("cognitive_load", "medium")
                weekday_loads[weekday][load] += 1
            except:
                pass
    
    return dict(weekday_loads)


def _analyze_subject_distribution(events):
    """Analyze cognitive load distribution by subject"""
    from collections import defaultdict
    subject_loads = defaultdict(lambda: {"low": 0, "medium": 0, "high": 0})
    
    for event in events:
        if event.get("subject_id") and event.get("cognitive_load"):
            load = event.get("cognitive_load", "medium")
            subject_loads[event["subject_id"]][load] += 1
    
    return dict(subject_loads)


def _analyze_time_of_day(events):
    """Analyze cognitive load by time of day"""
    from collections import defaultdict
    time_slots = defaultdict(lambda: {"low": 0, "medium": 0, "high": 0})
    
    for event in events:
        if event.get("start_ts") and event.get("cognitive_load"):
            from datetime import datetime
            try:
                event_time = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00"))
                hour = event_time.hour
                time_slot = "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"
                load = event.get("cognitive_load", "medium")
                time_slots[time_slot][load] += 1
            except:
                pass
    
    return dict(time_slots)


def _analyze_cognitive_peaks(events, assignments):
    """Identify cognitive load peaks"""
    from collections import defaultdict
    from datetime import datetime, timedelta
    
    date_loads = defaultdict(int)
    load_scores = {"low": 1, "medium": 2, "high": 3}
    
    for event in events:
        if event.get("start_ts") and event.get("cognitive_load"):
            try:
                event_date = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00")).date()
                date_loads[event_date.isoformat()] += load_scores.get(event.get("cognitive_load", "medium"), 2)
            except:
                pass
    
    for assignment in assignments:
        if assignment.get("due_date") and assignment.get("cognitive_load"):
            date_loads[assignment["due_date"]] += load_scores.get(assignment.get("cognitive_load", "medium"), 2)
    
    # Find peaks (top 20% of days)
    if date_loads:
        sorted_dates = sorted(date_loads.items(), key=lambda x: x[1], reverse=True)
        peak_count = max(1, len(sorted_dates) // 5)
        peaks = [{"date": date, "load": load} for date, load in sorted_dates[:peak_count]]
        return peaks
    
    return []

