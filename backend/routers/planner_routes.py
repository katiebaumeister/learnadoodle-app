"""
FastAPI routes for Planner features
Phase 5: Everyday Fluidity + Motion-AI
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Optional
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

router = APIRouter(prefix="/api/planner", tags=["planner"])
events_router = APIRouter(prefix="/api/events", tags=["events"])


# --- Pydantic Models ---

class RescheduleEventInput(BaseModel):
    new_start_at: str = Field(..., description="New start timestamp (ISO 8601)")
    new_end_at: str = Field(..., description="New end timestamp (ISO 8601)")
    origin: Optional[str] = Field(None, description="Reschedule origin (e.g., 'drag_drop', 'shift_week')")
    reason: Optional[str] = Field(None, description="Human-readable reason for reschedule")


class ShiftWeekInput(BaseModel):
    week_start: str = Field(..., description="Week start date (YYYY-MM-DD)")


class FreezeWeekInput(BaseModel):
    week_start: str = Field(..., description="Week start date (YYYY-MM-DD)")
    frozen: bool = Field(..., description="Whether to freeze (true) or unfreeze (false) the week")


# --- Helper Functions ---

async def verify_event_family_access(event_id: str, family_id: str) -> dict:
    """Verify event belongs to family and return event data"""
    supabase = get_admin_client()
    event_res = supabase.table("events").select("*").eq("id", event_id).single().execute()
    
    if not event_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    event = event_res.data
    if event.get("family_id") != family_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Event does not belong to your family"
        )
    
    return event


# --- Routes ---

@events_router.patch("/{event_id}/reschedule")
async def reschedule_event(
    event_id: str,
    body: RescheduleEventInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Reschedule an event to new start/end times.
    Updates reschedule_origin and reschedule_reason, then refreshes calendar cache.
    """
    try:
        family_id = await get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        # Verify event belongs to family
        event = await verify_event_family_access(event_id, family_id)
        
        # Parse new timestamps
        try:
            new_start_dt = datetime.fromisoformat(body.new_start_at.replace("Z", "+00:00"))
            new_end_dt = datetime.fromisoformat(body.new_end_at.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid timestamp format: {str(e)}"
            )
        
        # Validate end is after start
        if new_end_dt <= new_start_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End time must be after start time"
            )
        
        supabase = get_admin_client()
        
        # Update event
        update_data = {
            "start_ts": new_start_dt.isoformat(),
            "end_ts": new_end_dt.isoformat(),
            "reschedule_origin": body.origin or "manual",
            "reschedule_reason": body.reason or f"Rescheduled to {new_start_dt.date()}"
        }
        
        update_res = supabase.table("events").update(update_data).eq("id", event_id).execute()
        
        if not update_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update event"
            )
        
        updated_event = update_res.data[0]
        
        # Refresh calendar cache for affected days (old date and new date)
        old_date = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00")).date()
        new_date = new_start_dt.date()
        
        # Refresh cache for both dates (in case event moved to different day)
        cache_start = min(old_date, new_date)
        cache_end = max(old_date, new_date) + timedelta(days=1)  # Include next day for safety
        
        try:
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(cache_start),
                    "p_to_date": str(cache_end)
                }
            ).execute()
        except Exception as cache_error:
            # Log but don't fail - cache refresh is best effort
            log_event("reschedule_event.cache_refresh_error", {
                "event_id": event_id,
                "error": str(cache_error)
            })
        
        log_event("event_rescheduled", {
            "event_id": event_id,
            "family_id": family_id,
            "origin": body.origin or "manual",
            "old_start": event["start_ts"],
            "new_start": new_start_dt.isoformat()
        })
        
        return updated_event
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("reschedule_event.error", {"event_id": event_id, "error": str(e)})
        raise HTTPException(status_code=500, detail=f"Error rescheduling event: {str(e)}")


@router.post("/shift_week")
async def shift_week(
    body: ShiftWeekInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Shift all events in a week forward by 7 days.
    Uses the shift_week_forward RPC function.
    """
    try:
        family_id = await get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Parse week_start date
        try:
            week_start_date = date.fromisoformat(body.week_start)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD"
            )
        
        supabase = get_admin_client()
        
        # Call shift_week_forward RPC
        result = supabase.rpc(
            "shift_week_forward",
            {
                "p_family_id": family_id,
                "p_week_start": str(week_start_date)
            }
        ).execute()
        
        shifted_count = result.data if result.data is not None else 0
        
        log_event("week_shifted", {
            "family_id": family_id,
            "week_start": body.week_start,
            "shifted_count": shifted_count
        })
        
        return {
            "success": True,
            "shifted_count": shifted_count,
            "week_start": body.week_start
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("shift_week.error", {"week_start": body.week_start, "error": str(e)})
        raise HTTPException(status_code=500, detail=f"Error shifting week: {str(e)}")


@router.post("/freeze_week")
async def freeze_week(
    body: FreezeWeekInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Freeze or unfreeze a week by setting is_frozen flag on calendar_days_cache.
    Frozen weeks prevent AI from proposing changes.
    """
    try:
        family_id = await get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Parse week_start date
        try:
            week_start_date = date.fromisoformat(body.week_start)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD"
            )
        
        # Calculate week end (7 days after start)
        week_end_date = week_start_date + timedelta(days=7)
        
        supabase = get_admin_client()
        
        # Update is_frozen for all days in that week for this family
        update_res = supabase.table("calendar_days_cache").update({
            "is_frozen": body.frozen
        }).eq("family_id", family_id).gte("date", str(week_start_date)).lt("date", str(week_end_date)).execute()
        
        affected_count = len(update_res.data) if update_res.data else 0
        
        log_event("week_frozen" if body.frozen else "week_unfrozen", {
            "family_id": family_id,
            "week_start": body.week_start,
            "affected_days": affected_count
        })
        
        return {
            "success": True,
            "frozen": body.frozen,
            "week_start": body.week_start,
            "affected_days": affected_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("freeze_week.error", {"week_start": body.week_start, "error": str(e)})
        raise HTTPException(status_code=500, detail=f"Error freezing week: {str(e)}")


# Export both routers
__all__ = ["router", "events_router"]

