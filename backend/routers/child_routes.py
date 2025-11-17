"""
FastAPI routes for child dashboard
Part of Phase 6 - Parent/Child/Tutor Ecosystem + Integrations
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/child", tags=["child"])


# ============================================================
# Request/Response Models
# ============================================================

class ChildOverviewOut(BaseModel):
    today_events: List[Dict[str, Any]] = Field(default_factory=list)
    streak: int = 0
    progress: Dict[str, Any] = Field(default_factory=dict)


# ============================================================
# Routes
# ============================================================

@router.get("/overview", response_model=ChildOverviewOut)
async def get_child_overview(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get child overview: today's events, streak, and progress stats.
    Only accessible to users with child role.
    """
    try:
        supabase = get_admin_client()
        
        # Get user's role from family_members or profiles
        role = None
        family_id = None
        
        # Check family_members first
        member_res = supabase.table("family_members").select("member_role, family_id, child_scope").eq("user_id", user["id"]).maybe_single().execute()
        if member_res.data:
            role = member_res.data.get("member_role")
            family_id = member_res.data.get("family_id")
            child_scope = member_res.data.get("child_scope") or []
        else:
            # Fallback to profiles
            profile_res = supabase.table("profiles").select("role, family_id").eq("id", user["id"]).maybe_single().execute()
            if profile_res.data:
                role = profile_res.data.get("role")
                family_id = profile_res.data.get("family_id")
                child_scope = []
        
        if role != "child":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child role required"
            )
        
        # Get child_id from child_scope (should be single entry) or find by user_id
        child_id = None
        if child_scope and len(child_scope) > 0:
            child_id = child_scope[0]
        else:
            # Try to find child record by matching user email or other identifier
            if family_id:
                # For now, just get the first child in the family
                # In a real system, you'd link child records to user accounts more explicitly
                children_res = supabase.table("children").select("id").eq("family_id", family_id).eq("archived", False).limit(1).execute()
                if children_res.data and len(children_res.data) > 0:
                    child_id = children_res.data[0]["id"]
        
        if not child_id:
            return ChildOverviewOut(
                today_events=[],
                streak=0,
                progress={}
            )
        
        # Get today's events
        today = date.today()
        today_start = datetime.combine(today, datetime.min.time()).isoformat()
        today_end = datetime.combine(today, datetime.max.time()).isoformat()
        
        events_res = (
            supabase.table("events")
            .select("*")
            .eq("child_id", child_id)
            .gte("start_at", today_start)
            .lt("start_at", today_end)
            .order("start_at")
            .execute()
        )
        
        today_events = events_res.data or []
        
        # Calculate streak from attendance_records
        streak = 0
        try:
            # Get attendance records ordered by date descending
            # Note: PostgREST order() doesn't support desc=True directly, need to use desc() method or order with column:desc syntax
            attendance_res = (
                supabase.table("attendance_records")
                .select("day_date")
                .eq("child_id", child_id)
                .order("day_date", desc=False)
                .limit(30)
                .execute()
            )
            # Reverse to get descending order (most recent first)
            if attendance_res.data:
                attendance_res.data.reverse()
            
            if attendance_res.data:
                today_date = today
                current_streak = 0
                
                for record in attendance_res.data:
                    record_date = datetime.fromisoformat(record["day_date"]).date() if isinstance(record["day_date"], str) else record["day_date"]
                    days_diff = (today_date - record_date).days
                    
                    if days_diff == current_streak:
                        current_streak += 1
                    else:
                        break
                
                streak = current_streak
        except Exception as streak_error:
            log_event("child.overview.streak_error", user_id=user["id"], error=str(streak_error))
        
        # Get progress from child_progress view
        progress_data = {}
        try:
            progress_res = (
                supabase.table("child_progress")
                .select("*")
                .eq("child_id", child_id)
                .execute()
            )
            
            if progress_res.data:
                # Aggregate across all subjects
                total_completed = sum(row.get("completed_events", 0) or 0 for row in progress_res.data)
                total_events = sum(row.get("total_events", 0) or 0 for row in progress_res.data)
                total_minutes = sum(row.get("total_attendance_minutes", 0) or 0 for row in progress_res.data)
                
                # Average rating
                ratings = [row.get("avg_rating") for row in progress_res.data if row.get("avg_rating")]
                avg_rating = sum(ratings) / len(ratings) if ratings else None
                
                # Latest grade
                latest_grade = None
                for row in progress_res.data:
                    grade = row.get("latest_grade")
                    if grade:
                        latest_grade = grade
                        break
                
                progress_data = {
                    "completed_events": total_completed,
                    "total_events": total_events,
                    "total_attendance_minutes": total_minutes,
                    "hours_this_week": round(total_minutes / 60.0, 1),
                    "avg_rating": round(avg_rating, 1) if avg_rating else None,
                    "latest_grade": latest_grade,
                }
        except Exception as progress_error:
            log_event("child.overview.progress_error", user_id=user["id"], error=str(progress_error))
        
        log_event("child.overview.success", user_id=user["id"], child_id=child_id)
        
        return ChildOverviewOut(
            today_events=today_events,
            streak=streak,
            progress=progress_data
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("child.overview.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch child overview: {str(e)}"
        )

