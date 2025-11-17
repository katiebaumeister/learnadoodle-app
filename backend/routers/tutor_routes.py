"""
FastAPI routes for tutor dashboard
Part of Phase 6 - Parent/Child/Tutor Ecosystem + Integrations
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime
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

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


# ============================================================
# Request/Response Models
# ============================================================

class TutorChildOut(BaseModel):
    child_id: str
    name: str
    avatar_url: Optional[str] = None
    today_events: List[Dict[str, Any]] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)


class TutorOverviewOut(BaseModel):
    children: List[TutorChildOut] = Field(default_factory=list)


# ============================================================
# Routes
# ============================================================

@router.get("/overview", response_model=TutorOverviewOut)
async def get_tutor_overview(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get tutor overview: assigned children with today's events and progress stats.
    Only accessible to users with tutor role.
    """
    try:
        supabase = get_admin_client()
        
        # Get user's role from family_members or profiles
        role = None
        family_id = None
        
        # Check family_members first
        member_res = supabase.table("family_members").select("member_role, family_id").eq("user_id", user["id"]).maybe_single().execute()
        if member_res.data:
            role = member_res.data.get("member_role")
            family_id = member_res.data.get("family_id")
        
        # Fallback to profiles
        if not role:
            profile_res = supabase.table("profiles").select("role, family_id").eq("id", user["id"]).maybe_single().execute()
            if profile_res.data:
                role = profile_res.data.get("role")
                family_id = profile_res.data.get("family_id")
        
        if role != "tutor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tutor role required"
            )
        
        if not family_id:
            return TutorOverviewOut(children=[])
        
        # Get child_scope from family_members
        member_with_scope_res = supabase.table("family_members").select("child_scope").eq("user_id", user["id"]).eq("family_id", family_id).maybe_single().execute()
        child_scope = []
        if member_with_scope_res.data:
            child_scope = member_with_scope_res.data.get("child_scope") or []
        
        if not child_scope:
            return TutorOverviewOut(children=[])
        
        # Get child info
        children_res = supabase.table("children").select("id, first_name, nickname, avatar_url").in_("id", child_scope).eq("archived", False).execute()
        children_dict = {c["id"]: c for c in (children_res.data or [])}
        
        # Get today's events per child
        today = date.today()
        today_start = datetime.combine(today, datetime.min.time()).isoformat()
        today_end = datetime.combine(today, datetime.max.time()).isoformat()
        
        events_res = (
            supabase.table("events")
            .select("*")
            .in_("child_id", child_scope)
            .gte("start_at", today_start)
            .lt("start_at", today_end)
            .order("start_at")
            .execute()
        )
        
        events_by_child = {}
        for ev in (events_res.data or []):
            cid = ev.get("child_id")
            if cid:
                if cid not in events_by_child:
                    events_by_child[cid] = []
                events_by_child[cid].append(ev)
        
        # Get progress stats from child_progress view
        progress_res = (
            supabase.table("child_progress")
            .select("*")
            .in_("child_id", child_scope)
            .execute()
        )
        
        # Aggregate progress by child_id
        progress_by_child = {}
        for row in (progress_res.data or []):
            cid = row.get("child_id")
            if not cid:
                continue
            
            if cid not in progress_by_child:
                progress_by_child[cid] = {
                    "hours_this_week": 0,
                    "avg_rating": None,
                    "last_grade": None,
                }
            
            # Calculate hours this week (from total_attendance_minutes)
            minutes = row.get("total_attendance_minutes", 0) or 0
            hours = minutes / 60.0
            
            # Use latest grade
            latest_grade = row.get("latest_grade")
            if latest_grade:
                progress_by_child[cid]["last_grade"] = latest_grade
            
            # Average rating across subjects
            avg_rating = row.get("avg_rating")
            if avg_rating:
                if progress_by_child[cid]["avg_rating"] is None:
                    progress_by_child[cid]["avg_rating"] = avg_rating
                else:
                    # Simple average (could be weighted by subject)
                    progress_by_child[cid]["avg_rating"] = (
                        progress_by_child[cid]["avg_rating"] + avg_rating
                    ) / 2
        
        # Assemble response
        result_children = []
        for cid in child_scope:
            child = children_dict.get(cid)
            if not child:
                continue
            
            child_name = child.get("nickname") or child.get("first_name") or "Child"
            
            result_children.append(TutorChildOut(
                child_id=cid,
                name=child_name,
                avatar_url=child.get("avatar_url"),
                today_events=events_by_child.get(cid, []),
                stats=progress_by_child.get(cid, {
                    "hours_this_week": 0,
                    "avg_rating": None,
                    "last_grade": None,
                })
            ))
        
        log_event("tutor.overview.success", user_id=user["id"], children_count=len(result_children))
        
        return TutorOverviewOut(children=result_children)
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("tutor.overview.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch tutor overview: {str(e)}"
        )

