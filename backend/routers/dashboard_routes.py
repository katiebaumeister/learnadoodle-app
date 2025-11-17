"""
FastAPI routes for dashboards
Part of Phase 6 - Parent/Child/Tutor Ecosystem + Integrations
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
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

router = APIRouter(prefix="/api", tags=["dashboard"])


# ============================================================
# Request/Response Models
# ============================================================

class MeOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    role: Optional[str] = None
    family_id: Optional[str] = None
    accessible_children: List[Dict[str, Any]] = []


class ChildProgressOut(BaseModel):
    child_id: str
    child_name: str
    subject_id: Optional[str] = None
    subject_name: Optional[str] = None
    completed_events: int = 0
    total_events: int = 0
    total_attendance_minutes: int = 0
    avg_rating: Optional[float] = None
    latest_grade: Optional[str] = None
    total_credits: float = 0.0
    portfolio_count: int = 0


# ============================================================
# Routes
# ============================================================

@router.get("/me", response_model=MeOut)
async def get_me(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get current user's profile, role, family_id, and accessible children.
    """
    try:
        supabase = get_admin_client()
        
        # Get profile
        profile_res = supabase.table("profiles").select("*").eq("id", user["id"]).single().execute()
        if not profile_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        profile = profile_res.data
        family_id = profile.get("family_id")
        role = profile.get("role", "parent")
        
        # Get family_members entry if exists
        # Use admin client to bypass RLS (service role)
        try:
            member_res = supabase.table("family_members").select("*").eq("user_id", user["id"]).maybe_single().execute()
            if member_res.data:
                role = member_res.data.get("member_role", role)
                family_id = member_res.data.get("family_id", family_id)
        except Exception as e:
            # If query fails (e.g., RLS issue), fall back to profile data
            log_event("dashboard.get_me.family_members_query_failed", user_id=user["id"], error=str(e))
        
        # Get accessible children using RPC
        accessible_children = []
        try:
            accessible_res = supabase.rpc(
                "get_accessible_children",
                {"_user_id": user["id"]}
            ).execute()
            
            if accessible_res.data:
                child_ids = [c.get("child_id") for c in accessible_res.data if c.get("child_id")]
                if child_ids:
                    children_res = supabase.table("children").select("id, first_name, nickname, age, avatar_url").in_("id", child_ids).execute()
                    accessible_children = [
                        {
                            "id": c["id"],
                            "name": c.get("first_name") or c.get("name", ""),
                            "nickname": c.get("nickname"),
                            "age": c.get("age"),
                            "avatar_url": c.get("avatar_url")
                        }
                        for c in (children_res.data or [])
                    ]
        except Exception as rpc_error:
            # Fallback: if RPC doesn't exist, use legacy logic
            log_event("dashboard.get_me.rpc_fallback", user_id=user["id"], error=str(rpc_error))
            if family_id:
                children_res = supabase.table("children").select("id, first_name, nickname, age, avatar_url").eq("family_id", family_id).eq("archived", False).execute()
                accessible_children = [
                    {
                        "id": c["id"],
                        "name": c.get("first_name") or c.get("name", ""),
                        "nickname": c.get("nickname"),
                        "age": c.get("age"),
                        "avatar_url": c.get("avatar_url")
                    }
                    for c in (children_res.data or [])
                ]
        
        return MeOut(
            id=user["id"],
            email=profile.get("email", ""),
            full_name=profile.get("full_name"),
            role=role,
            family_id=family_id,
            accessible_children=accessible_children
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("dashboard.get_me.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user info: {str(e)}"
        )


@router.get("/child_progress", response_model=List[ChildProgressOut])
async def get_child_progress(
    child_id: Optional[str] = Query(None, description="Filter by child ID (optional)"),
    subject_id: Optional[str] = Query(None, description="Filter by subject ID (optional)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get child progress data from child_progress view.
    Scoped to accessible children based on user's role.
    """
    try:
        supabase = get_admin_client()
        
        # Get accessible child IDs
        try:
            accessible_res = supabase.rpc(
                "get_accessible_children",
                {"_user_id": user["id"]}
            ).execute()
            
            accessible_child_ids = []
            if accessible_res.data:
                accessible_child_ids = [c.get("child_id") for c in accessible_res.data if c.get("child_id")]
        except Exception as rpc_error:
            # Fallback: use family_id
            log_event("dashboard.child_progress.rpc_fallback", user_id=user["id"], error=str(rpc_error))
            family_id = get_family_id_for_user(user["id"])
            if family_id:
                children_res = supabase.table("children").select("id").eq("family_id", family_id).execute()
                accessible_child_ids = [c["id"] for c in (children_res.data or [])]
            else:
                accessible_child_ids = []
        
        if not accessible_child_ids:
            return []
        
        # Filter by child_id if provided
        if child_id:
            if child_id not in accessible_child_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Child not accessible"
                )
            accessible_child_ids = [child_id]
        
        # Query child_progress view
        query = supabase.table("child_progress").select("*").in_("child_id", accessible_child_ids)
        
        if subject_id:
            query = query.eq("subject_id", subject_id)
        
        result = query.execute()
        
        progress_data = []
        for row in (result.data or []):
            progress_data.append(ChildProgressOut(
                child_id=row["child_id"],
                child_name=row.get("child_name", ""),
                subject_id=row.get("subject_id"),
                subject_name=row.get("subject_name"),
                completed_events=row.get("completed_events", 0) or 0,
                total_events=row.get("total_events", 0) or 0,
                total_attendance_minutes=row.get("total_attendance_minutes", 0) or 0,
                avg_rating=row.get("avg_rating"),
                latest_grade=row.get("latest_grade"),
                total_credits=float(row.get("total_credits", 0) or 0),
                portfolio_count=row.get("portfolio_count", 0) or 0
            ))
        
        return progress_data
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("dashboard.child_progress.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch child progress: {str(e)}"
        )

