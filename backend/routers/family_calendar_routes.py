"""
FastAPI routes for Family Calendar features
- Shared classes (classes that multiple children attend)
- Family events
- Conflict detection
- Cross-child coordination
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date, timedelta
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

router = APIRouter(prefix="/api/family-calendar", tags=["family-calendar"])

# --- Pydantic Models ---

class CreateSharedClassIn(BaseModel):
    family_id: str = Field(..., description="Family ID")
    title: str = Field(..., description="Class title")
    description: Optional[str] = Field(None, description="Class description")
    subject_id: Optional[str] = Field(None, description="Subject ID")
    instructor: Optional[str] = Field(None, description="Instructor name")
    location: Optional[str] = Field(None, description="Location")
    mode: Optional[str] = Field(None, description="Mode: home, online, outside, travel")
    child_ids: List[str] = Field(..., description="List of child IDs attending this class")
    recurrence_rule: Optional[dict] = Field(None, description="RFC5545 recurrence rule")
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="End date (YYYY-MM-DD)")

class UpdateSharedClassIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    subject_id: Optional[str] = None
    instructor: Optional[str] = None
    location: Optional[str] = None
    mode: Optional[str] = None
    child_ids: Optional[List[str]] = None
    recurrence_rule: Optional[dict] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class CreateFamilyEventIn(BaseModel):
    family_id: str = Field(..., description="Family ID")
    title: str = Field(..., description="Event title")
    description: Optional[str] = None
    start_ts: str = Field(..., description="Start timestamp (ISO 8601)")
    end_ts: str = Field(..., description="End timestamp (ISO 8601)")
    child_ids: Optional[List[str]] = Field(None, description="Specific child IDs (if None, affects all children)")
    subject_id: Optional[str] = None
    location: Optional[str] = None

class DetectConflictsIn(BaseModel):
    family_id: str = Field(..., description="Family ID")
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD), defaults to today")
    end_date: Optional[str] = Field(None, description="End date (YYYY-MM-DD), defaults to 30 days from start")

# --- Routes ---

@router.post("/shared-classes", status_code=status.HTTP_201_CREATED)
async def create_shared_class(
    body: CreateSharedClassIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Create a shared class that multiple children attend"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )

        supabase = get_admin_client()

        # Create shared class
        shared_class_data = {
            "family_id": body.family_id,
            "title": body.title,
            "description": body.description,
            "subject_id": body.subject_id,
            "instructor": body.instructor,
            "location": body.location,
            "mode": body.mode,
            "recurrence_rule": body.recurrence_rule,
            "start_date": body.start_date,
            "end_date": body.end_date,
            "created_by": user["id"],
        }

        result = supabase.table("shared_classes").insert(shared_class_data).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create shared class"
            )

        shared_class_id = result.data[0]["id"]

        # Link children to shared class
        if body.child_ids:
            child_links = [
                {"shared_class_id": shared_class_id, "child_id": child_id}
                for child_id in body.child_ids
            ]
            supabase.table("shared_class_children").insert(child_links).execute()

        log_event("family_calendar.shared_class_created", user_id=user["id"], shared_class_id=shared_class_id)

        return {"success": True, "shared_class": result.data[0]}

    except HTTPException:
        raise
    except Exception as e:
        log_event("family_calendar.shared_class_create_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create shared class: {str(e)}"
        )

@router.get("/shared-classes")
async def list_shared_classes(
    family_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """List all shared classes for a family"""
    try:
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )

        supabase = get_admin_client()

        # Fetch shared classes with children
        result = supabase.table("shared_classes").select(
            """
            *,
            shared_class_children (
                child_id,
                children (
                    id,
                    first_name,
                    last_name
                )
            )
            """
        ).eq("family_id", family_id).execute()

        return {"success": True, "shared_classes": result.data or []}

    except HTTPException:
        raise
    except Exception as e:
        log_event("family_calendar.shared_class_list_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list shared classes: {str(e)}"
        )

@router.patch("/shared-classes/{shared_class_id}")
async def update_shared_class(
    shared_class_id: str,
    body: UpdateSharedClassIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Update a shared class"""
    try:
        supabase = get_admin_client()

        # Verify access
        class_result = supabase.table("shared_classes").select("family_id").eq("id", shared_class_id).single().execute()
        if not class_result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared class not found")

        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != class_result.data["family_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        # Update shared class
        update_data = body.dict(exclude_unset=True)
        if "child_ids" in update_data:
            child_ids = update_data.pop("child_ids")
            
            # Update children links
            supabase.table("shared_class_children").delete().eq("shared_class_id", shared_class_id).execute()
            if child_ids:
                child_links = [
                    {"shared_class_id": shared_class_id, "child_id": child_id}
                    for child_id in child_ids
                ]
                supabase.table("shared_class_children").insert(child_links).execute()

        if update_data:
            update_data["updated_at"] = datetime.utcnow().isoformat()
            supabase.table("shared_classes").update(update_data).eq("id", shared_class_id).execute()

        log_event("family_calendar.shared_class_updated", user_id=user["id"], shared_class_id=shared_class_id)

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        log_event("family_calendar.shared_class_update_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update shared class: {str(e)}"
        )

@router.delete("/shared-classes/{shared_class_id}")
async def delete_shared_class(
    shared_class_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Delete a shared class"""
    try:
        supabase = get_admin_client()

        # Verify access
        class_result = supabase.table("shared_classes").select("family_id").eq("id", shared_class_id).single().execute()
        if not class_result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared class not found")

        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != class_result.data["family_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        # Delete shared class (cascade will delete children links)
        supabase.table("shared_classes").delete().eq("id", shared_class_id).execute()

        log_event("family_calendar.shared_class_deleted", user_id=user["id"], shared_class_id=shared_class_id)

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        log_event("family_calendar.shared_class_delete_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete shared class: {str(e)}"
        )

@router.post("/conflicts/detect")
async def detect_conflicts(
    body: DetectConflictsIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Detect scheduling conflicts in a family"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )

        supabase = get_admin_client()

        start_date = body.start_date or date.today().isoformat()
        end_date = body.end_date or (date.today() + timedelta(days=30)).isoformat()

        result = supabase.rpc(
            "detect_schedule_conflicts",
            {
                "p_family_id": family_id,
                "p_start_date": start_date,
                "p_end_date": end_date,
            }
        ).execute()

        return {"success": True, "conflicts": result.data or []}

    except HTTPException:
        raise
    except Exception as e:
        log_event("family_calendar.conflicts_detect_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to detect conflicts: {str(e)}"
        )

@router.post("/coordinate")
async def coordinate_schedule(
    family_id: str = Query(..., description="Family ID"),
    event_id: str = Query(..., description="Event ID"),
    action: str = Query(..., description="Action: add, update, or delete"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Coordinate family schedule when events are added, updated, or deleted"""
    try:
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )

        if action not in ["add", "update", "delete"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Action must be 'add', 'update', or 'delete'"
            )

        supabase = get_admin_client()

        result = supabase.rpc(
            "coordinate_family_schedule",
            {
                "p_family_id": family_id,
                "p_event_id": event_id,
                "p_action": action,
            }
        ).execute()

        return {"success": True, "coordination": result.data}

    except HTTPException:
        raise
    except Exception as e:
        log_event("family_calendar.coordinate_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to coordinate schedule: {str(e)}"
        )

@router.post("/auto-adjust")
async def auto_adjust_schedule(
    family_id: str = Query(..., description="Family ID"),
    family_event_id: str = Query(..., description="Family event ID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Automatically detect and suggest adjustments when family events change"""
    try:
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )

        supabase = get_admin_client()

        result = supabase.rpc(
            "auto_adjust_family_schedule",
            {
                "p_family_id": family_id,
                "p_family_event_id": family_event_id,
            }
        ).execute()

        return {"success": True, "adjustments": result.data}

    except HTTPException:
        raise
    except Exception as e:
        log_event("family_calendar.auto_adjust_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to auto-adjust schedule: {str(e)}"
        )

