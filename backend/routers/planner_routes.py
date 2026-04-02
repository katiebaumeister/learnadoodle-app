"""
FastAPI routes for Planner features
Phase 5: Everyday Fluidity + Motion-AI
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
import sys
from pathlib import Path
import io

# Optional PDF generation support (requires reportlab)
try:
    from reportlab.lib import colors as reportlab_colors
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family, get_placeholder_conversion_fields, require_onboarding_complete
from logger import log_event
from supabase_client import get_admin_client
from ai_usage_ledger import record_ai_usage

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


class UpdateEventStatusInput(BaseModel):
    status: str = Field(..., description="New status: 'scheduled', 'in_progress', or 'done'")


class FillSlotInput(BaseModel):
    curriculum_lesson_id: str = Field(..., description="Curriculum lesson ID to attach to this slot")
    title: Optional[str] = Field(None, description="Event title (defaults to lesson title)")


class AutoScheduleCourseInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    course_id: str = Field(..., description="Course/Syllabus ID")
    child_ids: Optional[List[str]] = Field(None, description="Child IDs to schedule for (if None, uses course's children)")
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")
    strategy: str = Field("even", description="Strategy: 'even' (evenly distribute) or 'use_target_dates'")


# Quick Reschedule Models
class QuickRescheduleChangeInput(BaseModel):
    type: str = Field(..., description="Change type: moved_event, canceled_event, new_event, shortened_day, kid_unavailable")
    event_id: Optional[str] = Field(None, description="Event ID (for moved/canceled)")
    new_start: Optional[str] = Field(None, description="New start time (for moved_event)")
    new_end: Optional[str] = Field(None, description="New end time (for moved_event)")
    child_unavailable: Optional[bool] = Field(None, description="Child unavailable flag")
    notes: Optional[str] = Field(None, description="Additional notes")


class QuickRescheduleConstraintsInput(BaseModel):
    lock_fixed: bool = Field(True, description="Keep fixed classes locked")
    only_flexible: bool = Field(True, description="Only move flexible items")
    max_moves: int = Field(6, ge=1, le=20, description="Maximum number of events to move")
    prefer_same_day: bool = Field(True, description="Prefer same-day moves")


class QuickRescheduleInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    children: List[str] = Field(..., description="Child IDs")
    time_window: Dict[str, str] = Field(..., description="Time window with start_date and end_date")
    change: QuickRescheduleChangeInput = Field(..., description="Change information")
    constraints: QuickRescheduleConstraintsInput = Field(..., description="Rescheduling constraints")
    notes: Optional[str] = Field(None, description="Additional notes")


class QuickRescheduleApplyInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    run_id: str = Field(..., description="Run ID from preview")
    proposed_events_patch: List[Dict[str, Any]] = Field(..., description="Proposed events patch to apply")


# Plan Week Models
class PlanWeekOptionsInput(BaseModel):
    focus: Optional[List[str]] = Field(default_factory=list, description="Focus options")
    intensity: str = Field("normal", description="Intensity: light, normal, ambitious")
    max_daily_minutes_per_child: int = Field(180, description="Max daily minutes per child")
    weekend_mode: str = Field("light", description="Weekend mode: light, normal, full")


class PlanWeekInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    week_start: str = Field(..., description="Week start date (YYYY-MM-DD, must be Monday)")
    child_ids: List[str] = Field(..., description="Child IDs")
    options: PlanWeekOptionsInput = Field(default_factory=PlanWeekOptionsInput, description="Planning options")


class PlanWeekApplyInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    run_id: str = Field(..., description="Run ID from preview")
    patch: Dict[str, Any] = Field(..., description="Patch with create/move/update/delete arrays")


# Resolve Conflicts Models
class ResolveConflictsRangeInput(BaseModel):
    start: str = Field(..., description="Start date (YYYY-MM-DD)")
    end: str = Field(..., description="End date (YYYY-MM-DD)")


class ResolveConflictsConstraintsInput(BaseModel):
    hard_blocks: Optional[bool] = Field(True, description="Respect hard blocks")
    keep_fixed: Optional[bool] = Field(True, description="Keep fixed events locked")
    allow_spillover: Optional[bool] = Field(False, description="Allow moves to next day")
    allow_splitting: Optional[bool] = Field(True, description="Allow splitting events")


class ResolveConflictsPreviewInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    child_ids: List[str] = Field(..., description="Child IDs")
    range: ResolveConflictsRangeInput = Field(..., description="Date range")
    constraints: Optional[ResolveConflictsConstraintsInput] = Field(default_factory=ResolveConflictsConstraintsInput, description="Resolution constraints")


class ResolveConflictsApplyInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    child_ids: List[str] = Field(..., description="Child IDs")
    range: ResolveConflictsRangeInput = Field(..., description="Date range")
    constraints: Optional[ResolveConflictsConstraintsInput] = Field(default_factory=ResolveConflictsConstraintsInput, description="Resolution constraints")
    proposed_changes: List[Dict[str, Any]] = Field(..., description="Proposed changes to apply")


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
        family_id = get_family_id_for_user(user["id"])
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
        
        # Call the RPC function to reschedule with conflict checking
        try:
            rpc_result = supabase.rpc(
                'reschedule_event_checked',
                {
                    '_event_id': event_id,
                    '_new_start': new_start_dt.isoformat(),
                    '_new_end': new_end_dt.isoformat()
                }
            ).execute()
        except Exception as rpc_exception:
            # RPC call itself failed (network, connection, etc.)
            log_event("reschedule_event.rpc_exception", event_id=event_id, error=str(rpc_exception))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"RPC call failed: {str(rpc_exception)}"
            )

        # Check for RPC errors in response (using hasattr to avoid AttributeError)
        if hasattr(rpc_result, 'error') and rpc_result.error:
            log_event("reschedule_event.rpc_error", event_id=event_id, error=str(rpc_result.error))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"RPC error: {str(rpc_result.error)}"
            )

        # Check RPC result data
        if not rpc_result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No data returned from reschedule_event_checked RPC"
            )
        
        # Handle different response formats (array or single object)
        rpc_response = None
        if isinstance(rpc_result.data, list):
            if len(rpc_result.data) > 0:
                rpc_response = rpc_result.data[0]
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="RPC returned empty array"
                )
        elif isinstance(rpc_result.data, dict):
            rpc_response = rpc_result.data
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Unexpected RPC response format: {type(rpc_result.data)}"
            )
        
        if not rpc_response.get('ok'):
            reason = rpc_response.get('reason', 'unknown')
            detail_msg = rpc_response.get('detail', '')
            status_code = status.HTTP_409_CONFLICT if reason == 'overlap' else status.HTTP_400_BAD_REQUEST
            error_message = f"Error rescheduling event: {reason}"
            if detail_msg:
                error_message += f" - {detail_msg}"
            raise HTTPException(
                status_code=status_code,
                detail=error_message
            )
        
        # Fetch the updated event to return
        updated_event_res = supabase.table("events").select("*").eq("id", event_id).single().execute()
        if not updated_event_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch updated event"
            )
        
        updated_event = updated_event_res.data
        
        # Update reschedule metadata
        update_data = {
            "reschedule_origin": body.origin or "manual",
            "reschedule_reason": body.reason or f"Rescheduled to {new_start_dt.date()}"
        }
        conv_fields, did_convert = get_placeholder_conversion_fields(event)
        update_data.update(conv_fields)
        if did_convert:
            log_event("placeholder_converted", action="reschedule", event_id=event_id, academic_year_id=event.get("academic_year_id"), user_id=user["id"], old_batch_id=event.get("generation_batch_id"))
        supabase.table("events").update(update_data).eq("id", event_id).execute()
        updated_event.update(update_data)
        
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
            log_event("reschedule_event.cache_refresh_error", event_id=event_id, error=str(cache_error))
        
        log_event("event_rescheduled", event_id=event_id, family_id=family_id, origin=body.origin or "manual", old_start=event["start_ts"], new_start=new_start_dt.isoformat())
        
        return updated_event
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("reschedule_event.error", event_id=event_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error rescheduling event: {str(e)}")


@events_router.patch("/{event_id}/status")
async def update_event_status(
    event_id: str,
    body: UpdateEventStatusInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Update event status (for undoing completion or changing status).
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        # Validate status
        valid_statuses = ['scheduled', 'in_progress', 'done']
        if body.status not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
            )

        # Verify event belongs to family
        event = await verify_event_family_access(event_id, family_id)
        
        supabase = get_admin_client()
        
        status_update = {"status": body.status}
        conv_fields, did_convert = get_placeholder_conversion_fields(event)
        status_update.update(conv_fields)
        if did_convert:
            log_event("placeholder_converted", action="status_update", event_id=event_id, academic_year_id=event.get("academic_year_id"), user_id=user["id"], old_batch_id=event.get("generation_batch_id"))
        update_res = supabase.table("events").update(status_update).eq("id", event_id).execute()
        
        if not update_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update event status"
            )
        
        updated_event = update_res.data[0]
        
        # Refresh calendar cache for affected date
        try:
            start_ts = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00"))
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(start_ts.date()),
                    "p_to_date": str(start_ts.date())
                }
            ).execute()
        except Exception as e:
            log_event("update_event_status.cache_refresh_error", event_id=event_id, error=str(e))
        
        log_event("event_status_updated", event_id=event_id, family_id=family_id, old_status=event.get("status"), new_status=body.status)
        
        return {
            "event": updated_event,
            "message": f"Event status updated to {body.status}"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("update_event_status.error", event_id=event_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error updating event status: {str(e)}")


@events_router.patch("/{event_id}/fill-slot")
async def fill_slot(
    event_id: str,
    body: FillSlotInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Fill an empty Plan My Year slot (or change lesson on a filled slot) by attaching a curriculum lesson.
    Sets curriculum_lesson_id, source='curriculum', and title on the event.
    Filled slots are not overwritten by future Plan My Year Apply.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        event = await verify_event_family_access(event_id, family_id)
        supabase = get_admin_client()

        # Fetch lesson and ensure it belongs to family (via unit)
        lesson_res = supabase.table("curriculum_lessons").select("id, title, unit_id").eq("id", body.curriculum_lesson_id).single().execute()
        if not lesson_res.data:
            raise HTTPException(status_code=404, detail="Curriculum lesson not found")
        lesson = lesson_res.data

        unit_res = supabase.table("curriculum_units").select("id, family_id").eq("id", lesson["unit_id"]).single().execute()
        if not unit_res.data or unit_res.data.get("family_id") != family_id:
            raise HTTPException(status_code=403, detail="Lesson does not belong to your family")

        title = (body.title or lesson.get("title") or "").strip() or lesson.get("title")

        update_data = {
            "curriculum_lesson_id": body.curriculum_lesson_id,
            "source": "curriculum",
            "title": title or event.get("title"),
        }
        # Optionally clear placeholder flag so UI shows as scheduled lesson (keep slot metadata for analytics)
        # Spec: leave start_ts/end_ts/child_id/subject_id from slot; we only set curriculum link and title.
        update_res = supabase.table("events").update(update_data).eq("id", event_id).execute()
        if not update_res.data:
            raise HTTPException(status_code=500, detail="Failed to update event")
        updated_event = update_res.data[0] if isinstance(update_res.data, list) else update_res.data

        log_event("fill_slot", event_id=event_id, family_id=family_id, curriculum_lesson_id=body.curriculum_lesson_id, user_id=user["id"])
        return updated_event
    except HTTPException:
        raise
    except Exception as e:
        log_event("fill_slot.error", event_id=event_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error filling slot: {str(e)}")


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
        family_id = get_family_id_for_user(user["id"])
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
        
        log_event("week_shifted", family_id=family_id, week_start=body.week_start, shifted_count=shifted_count)
        
        return {
            "success": True,
            "shifted_count": shifted_count,
            "week_start": body.week_start
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("shift_week.error", week_start=body.week_start, error=str(e))
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
        family_id = get_family_id_for_user(user["id"])
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
        
        log_event("week_frozen" if body.frozen else "week_unfrozen", family_id=family_id, week_start=body.week_start, affected_days=affected_count)
        
        return {
            "success": True,
            "frozen": body.frozen,
            "week_start": body.week_start,
            "affected_days": affected_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("freeze_week.error", week_start=body.week_start, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error freezing week: {str(e)}")


@router.post("/auto_schedule_course")
async def auto_schedule_course(
    body: AutoScheduleCourseInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Auto-generate planner events from a course/syllabus.
    Creates events for all units (or remaining units) evenly distributed over date range
    or using target_date per unit.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
        supabase = get_admin_client()
        
        # Get course/syllabus details
        syllabus_res = supabase.table("syllabi").select("*").eq("id", body.course_id).eq("family_id", family_id).single().execute()
        if not syllabus_res.data:
            raise HTTPException(status_code=404, detail="Course not found")
        
        syllabus = syllabus_res.data
        
        # Get units (sections)
        sections_res = supabase.table("syllabus_sections").select("*").eq("syllabus_id", body.course_id).order("position", desc=False).execute()
        sections = sections_res.data or []
        
        if not sections:
            return {
                "created_events_count": 0,
                "units_scheduled": 0,
                "conflicts": []
            }
        
        # Determine child IDs
        child_ids = body.child_ids or [syllabus.get("child_id")]
        if not child_ids:
            raise HTTPException(status_code=400, detail="No children specified")
        
        # Verify children belong to family
        for child_id in child_ids:
            child_res = supabase.table("children").select("id").eq("id", child_id).eq("family_id", family_id).single().execute()
            if not child_res.data:
                raise HTTPException(status_code=403, detail=f"Child {child_id} not found")
        
        # Parse dates
        try:
            start_date = date.fromisoformat(body.start_date)
            end_date = date.fromisoformat(body.end_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        if end_date <= start_date:
            raise HTTPException(status_code=400, detail="End date must be after start date")
        
        # Calculate date distribution
        total_days = (end_date - start_date).days + 1
        units_per_child = len(sections) * len(child_ids)
        
        created_events = []
        conflicts = []
        
        if body.strategy == "use_target_dates":
            # Use target_date from each section if available
            for section in sections:
                target_date_str = section.get("target_date")
                if target_date_str:
                    try:
                        target_date = date.fromisoformat(target_date_str)
                        if start_date <= target_date <= end_date:
                            for child_id in child_ids:
                                # Create event at target date
                                start_ts = datetime.combine(target_date, datetime.min.time()).isoformat()
                                end_ts = (datetime.combine(target_date, datetime.min.time()) + timedelta(minutes=section.get("expected_minutes", 60))).isoformat()
                                
                                event_data = {
                                    "family_id": family_id,
                                    "child_id": child_id,
                                    "subject_id": syllabus.get("subject_id"),
                                    "title": section.get("title", f"Unit {section.get('position', '?')}"),
                                    "start_ts": start_ts,
                                    "end_ts": end_ts,
                                    "status": "scheduled",
                                    "source": "syllabus",
                                    "source_section_id": section.get("id"),
                                    "counts_toward_plan": True,
                                }
                                
                                event_res = supabase.table("events").insert(event_data).execute()
                                if event_res.data:
                                    created_events.append(event_res.data[0])
                        else:
                            conflicts.append(f"Unit '{section.get('title')}' target date {target_date_str} outside range")
                    except ValueError:
                        conflicts.append(f"Unit '{section.get('title')}' has invalid target_date")
                else:
                    # No target_date, skip or use even distribution
                    conflicts.append(f"Unit '{section.get('title')}' has no target_date")
        else:
            # Even distribution strategy
            days_per_unit = max(1, total_days // len(sections)) if sections else 1
            
            for idx, section in enumerate(sections):
                # Calculate date for this unit
                unit_date = start_date + timedelta(days=idx * days_per_unit)
                if unit_date > end_date:
                    unit_date = end_date
                
                for child_id in child_ids:
                    start_ts = datetime.combine(unit_date, datetime.min.time()).isoformat()
                    end_ts = (datetime.combine(unit_date, datetime.min.time()) + timedelta(minutes=section.get("expected_minutes", 60))).isoformat()
                    
                    event_data = {
                        "family_id": family_id,
                        "child_id": child_id,
                        "subject_id": syllabus.get("subject_id"),
                        "title": section.get("title", f"Unit {section.get('position', '?')}"),
                        "start_ts": start_ts,
                        "end_ts": end_ts,
                        "status": "scheduled",
                        "source": "syllabus",
                        "source_section_id": section.get("id"),
                        "counts_toward_plan": True,
                    }
                    
                    event_res = supabase.table("events").insert(event_data).execute()
                    if event_res.data:
                        created_events.append(event_res.data[0])
        
        # Refresh calendar cache
        try:
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(start_date),
                    "p_to_date": str(end_date + timedelta(days=1))
                }
            ).execute()
        except Exception as cache_error:
            log_event("auto_schedule_course.cache_refresh_error", error=str(cache_error))
        
        log_event("auto_schedule_course.completed", course_id=body.course_id, family_id=family_id, created_count=len(created_events), strategy=body.strategy)
        
        return {
            "created_events_count": len(created_events),
            "units_scheduled": len(sections),
            "conflicts": conflicts
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("auto_schedule_course.error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error auto-scheduling course: {str(e)}")


# --- Weekly Student Packet ---

def generate_weekly_packet_pdf(
    child_name: str,
    week_start: date,
    week_end: date,
    events: List[Dict[str, Any]],
    backlog_items: List[Dict[str, Any]],
    subjects_map: Dict[str, str]
) -> io.BytesIO:
    """Generate print-friendly weekly student packet PDF"""
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="PDF generation requires reportlab library. Please install it with: pip install reportlab"
        )
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=20,
    )
    story.append(Paragraph("Weekly Student Packet", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Week:</b> {week_start.strftime('%B %d')} - {week_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Group events by day
    events_by_day: Dict[str, List[Dict[str, Any]]] = {}
    for event in events:
        event_date = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00")).date()
        date_str = event_date.strftime("%Y-%m-%d")
        day_name = event_date.strftime("%A, %B %d")
        
        if day_name not in events_by_day:
            events_by_day[day_name] = []
        events_by_day[day_name].append(event)
    
    # Daily Schedule Section
    if events_by_day:
        story.append(Paragraph("<b>Daily Schedule</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))
        
        for day_name in sorted(events_by_day.keys()):
            day_events = events_by_day[day_name]
            story.append(Paragraph(f"<b>{day_name}</b>", styles['Heading3']))
            
            # Create table for day's events
            day_data = [["Time", "Subject", "Activity", "Status"]]
            for event in sorted(day_events, key=lambda e: e.get("start_ts", "")):
                start_ts = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00"))
                end_ts = datetime.fromisoformat(event.get("end_ts", "").replace("Z", "+00:00"))
                time_str = f"{start_ts.strftime('%I:%M %p')} - {end_ts.strftime('%I:%M %p')}"
                
                subject_name = subjects_map.get(event.get("subject_id", ""), "General")
                title = event.get("title", "Activity")[:40]
                status = event.get("status", "scheduled")
                
                day_data.append([
                    time_str,
                    subject_name[:20],
                    title,
                    status.capitalize()
                ])
            
            day_table = Table(day_data, colWidths=[1.5*inch, 1.2*inch, 2.8*inch, 1*inch])
            day_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), reportlab_colors.white),
                ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [reportlab_colors.white, reportlab_colors.HexColor('#f9fafb')]),
            ]))
            story.append(day_table)
            story.append(Spacer(1, 0.2*inch))
        
        story.append(PageBreak())
    
    # Assignments/Tasks Section
    if backlog_items:
        story.append(Paragraph("<b>Assignments & Tasks</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))
        
        task_data = [["Task", "Subject", "Due Date", "Est. Time", "Priority"]]
        for item in backlog_items:
            title = item.get("title", "Task")[:50]
            subject_name = subjects_map.get(item.get("subject_id", ""), "General")
            due_date = item.get("due_date", "")
            if due_date:
                try:
                    due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                    due_date = due_dt.strftime("%m/%d")
                except:
                    pass
            else:
                due_date = "No due date"
            
            est_minutes = item.get("estimate_minutes", 0) or 0
            est_time = f"{est_minutes} min" if est_minutes > 0 else "—"
            priority = item.get("priority", "normal").capitalize()
            
            task_data.append([
                title,
                subject_name[:20],
                due_date,
                est_time,
                priority
            ])
        
        task_table = Table(task_data, colWidths=[2.5*inch, 1.2*inch, 1*inch, 1*inch, 1*inch])
        task_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#10b981')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), reportlab_colors.white),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [reportlab_colors.white, reportlab_colors.HexColor('#f0fdf4')]),
        ]))
        story.append(task_table)
        story.append(Spacer(1, 0.3*inch))
    
    # Notes Section
    story.append(Paragraph("<b>Notes</b>", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_________________________________________________________________", styles['Normal']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_________________________________________________________________", styles['Normal']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_________________________________________________________________", styles['Normal']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_________________________________________________________________", styles['Normal']))
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_weekly_packet_html(
    child_name: str,
    week_start: date,
    week_end: date,
    events: List[Dict[str, Any]],
    backlog_items: List[Dict[str, Any]],
    subjects_map: Dict[str, str],
    materials: List[Dict[str, Any]] = None,
    progress_summary: Dict[str, Any] = None
) -> str:
    """Generate HTML version of weekly packet for direct browser printing"""
    materials = materials or []
    progress_summary = progress_summary or {}
    
    # Group events by day
    events_by_day: Dict[str, List[Dict[str, Any]]] = {}
    for event in events:
        event_date = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00")).date()
        day_name = event_date.strftime("%A, %B %d")
        if day_name not in events_by_day:
            events_by_day[day_name] = []
        events_by_day[day_name].append(event)
    
    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Weekly Packet - {child_name}</title>
    <style>
        @media print {{
            @page {{
                margin: 0.5in;
            }}
            body {{
                margin: 0;
            }}
            .no-print {{
                display: none;
            }}
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 20px;
            color: #111827;
        }}
        .header {{
            border-bottom: 3px solid #1e40af;
            padding-bottom: 16px;
            margin-bottom: 24px;
        }}
        h1 {{
            color: #1e40af;
            margin: 0 0 8px 0;
            font-size: 24px;
        }}
        .header-info {{
            color: #6b7280;
            font-size: 14px;
        }}
        h2 {{
            color: #374151;
            font-size: 18px;
            margin-top: 24px;
            margin-bottom: 12px;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 6px;
        }}
        h3 {{
            color: #4b5563;
            font-size: 16px;
            margin-top: 16px;
            margin-bottom: 8px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
        }}
        th {{
            background: #3b82f6;
            color: white;
            padding: 10px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
        }}
        td {{
            padding: 8px 10px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
        }}
        tr:nth-child(even) {{
            background: #f9fafb;
        }}
        .task-table th {{
            background: #10b981;
        }}
        .materials-table th {{
            background: #f59e0b;
        }}
        .progress-summary {{
            background: #eff6ff;
            border: 1px solid #3b82f6;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
        }}
        .progress-item {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }}
        .progress-bar {{
            height: 8px;
            background: #dbeafe;
            border-radius: 4px;
            margin-top: 4px;
            overflow: hidden;
        }}
        .progress-fill {{
            height: 100%;
            background: #3b82f6;
            transition: width 0.3s;
        }}
        .notes-section {{
            margin-top: 32px;
            page-break-inside: avoid;
        }}
        .notes-line {{
            border-bottom: 1px solid #d1d5db;
            margin-bottom: 12px;
            min-height: 20px;
        }}
        .print-button {{
            position: fixed;
            top: 20px;
            right: 20px;
            background: #3b82f6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }}
        .print-button:hover {{
            background: #2563eb;
        }}
    </style>
</head>
<body>
    <button class="print-button no-print" onclick="window.print()">Print</button>
    
    <div class="header">
        <h1>Weekly Student Packet</h1>
        <div class="header-info">
            <strong>Student:</strong> {child_name}<br>
            <strong>Week:</strong> {week_start.strftime('%B %d')} - {week_end.strftime('%B %d, %Y')}
        </div>
    </div>
"""
    
    # Progress Summary
    if progress_summary:
        html += """
    <div class="progress-summary">
        <h2>Progress Summary</h2>
"""
        if progress_summary.get("events_completed"):
            total = progress_summary.get("events_total", 0)
            completed = progress_summary.get("events_completed", 0)
            percent = (completed / total * 100) if total > 0 else 0
            html += f"""
        <div class="progress-item">
            <span><strong>Events Completed:</strong> {completed} of {total}</span>
            <span>{percent:.0f}%</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: {percent}%"></div>
        </div>
"""
        if progress_summary.get("tasks_completed"):
            total = progress_summary.get("tasks_total", 0)
            completed = progress_summary.get("tasks_completed", 0)
            percent = (completed / total * 100) if total > 0 else 0
            html += f"""
        <div class="progress-item">
            <span><strong>Tasks Completed:</strong> {completed} of {total}</span>
            <span>{percent:.0f}%</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: {percent}%"></div>
        </div>
"""
        html += """
    </div>
"""
    
    # Daily Schedule
    if events_by_day:
        html += """
    <h2>Daily Schedule</h2>
"""
        for day_name in sorted(events_by_day.keys()):
            day_events = events_by_day[day_name]
            html += f"""
    <h3>{day_name}</h3>
    <table>
        <thead>
            <tr>
                <th>Time</th>
                <th>Subject</th>
                <th>Activity</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
"""
            for event in sorted(day_events, key=lambda e: e.get("start_ts", "")):
                start_ts = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00"))
                end_ts = datetime.fromisoformat(event.get("end_ts", "").replace("Z", "+00:00"))
                time_str = f"{start_ts.strftime('%I:%M %p')} - {end_ts.strftime('%I:%M %p')}"
                subject_name = subjects_map.get(event.get("subject_id", ""), "General")
                title = event.get("title", "Activity")
                status = event.get("status", "scheduled").capitalize()
                html += f"""
            <tr>
                <td>{time_str}</td>
                <td>{subject_name}</td>
                <td>{title}</td>
                <td>{status}</td>
            </tr>
"""
            html += """
        </tbody>
    </table>
"""
    
    # Assignments/Tasks
    if backlog_items:
        html += """
    <h2>Assignments & Tasks</h2>
    <table class="task-table">
        <thead>
            <tr>
                <th>Task</th>
                <th>Subject</th>
                <th>Due Date</th>
                <th>Est. Time</th>
                <th>Priority</th>
            </tr>
        </thead>
        <tbody>
"""
        for item in backlog_items:
            title = item.get("title", "Task")
            subject_name = subjects_map.get(item.get("subject_id", ""), "General")
            due_date = item.get("due_date", "")
            if due_date:
                try:
                    due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                    due_date = due_dt.strftime("%m/%d")
                except:
                    pass
            else:
                due_date = "No due date"
            est_minutes = item.get("estimate_minutes", 0) or 0
            est_time = f"{est_minutes} min" if est_minutes > 0 else "—"
            priority = item.get("priority", "normal").capitalize()
            html += f"""
            <tr>
                <td>{title}</td>
                <td>{subject_name}</td>
                <td>{due_date}</td>
                <td>{est_time}</td>
                <td>{priority}</td>
            </tr>
"""
        html += """
        </tbody>
    </table>
"""
    
    # Materials/Resources
    if materials:
        html += """
    <h2>Materials & Resources</h2>
    <table class="materials-table">
        <thead>
            <tr>
                <th>Material</th>
                <th>Type</th>
                <th>Date Added</th>
            </tr>
        </thead>
        <tbody>
"""
        for material in materials:
            title = material.get("title", "Untitled")
            mime = material.get("mime", "")
            mime_type = mime.split("/")[0] if "/" in mime else "file"
            created_at = material.get("created_at", "")
            if created_at:
                try:
                    created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    created_at = created_dt.strftime("%m/%d/%Y")
                except:
                    pass
            html += f"""
            <tr>
                <td>{title}</td>
                <td>{mime_type.capitalize()}</td>
                <td>{created_at}</td>
            </tr>
"""
        html += """
        </tbody>
    </table>
"""
    
    # Notes Section
    html += """
    <div class="notes-section">
        <h2>Notes</h2>
        <div class="notes-line"></div>
        <div class="notes-line"></div>
        <div class="notes-line"></div>
        <div class="notes-line"></div>
    </div>
    
</body>
</html>
"""
    return html


@router.get("/weekly-packet/{child_id}")
async def get_weekly_packet(
    child_id: str,
    week_start: str = Query(..., description="Week start date (YYYY-MM-DD)"),
    format: str = Query("pdf", description="Output format: 'pdf' or 'html'"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Generate weekly student packet with schedule, assignments, tasks, materials, and progress.
    Supports PDF and HTML formats.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not found or access denied")
        
        # Parse week_start date
        try:
            week_start_date = date.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD"
            )
        
        # Calculate week end (7 days after start)
        week_end_date = week_start_date + timedelta(days=6)
        
        # Convert to datetime for queries
        week_start_ts = datetime.combine(week_start_date, datetime.min.time()).isoformat()
        week_end_ts = datetime.combine(week_end_date, datetime.max.time()).isoformat()
        
        supabase = get_admin_client()
        
        # Get child name
        child_res = supabase.table("children").select("first_name, last_name").eq("id", child_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_data = child_res.data
        child_name = f"{child_data.get('first_name', 'Student')} {child_data.get('last_name', '')}".strip()
        
        # Get events for the week (including materials)
        events_res = supabase.table("events").select(
            "id, title, description, start_ts, end_ts, subject_id, status, materials_attachment_ids"
        ).eq("child_id", child_id).gte("start_ts", week_start_ts).lte("start_ts", week_end_ts).order("start_ts").execute()
        
        events = events_res.data or []
        
        # Collect all material IDs from events
        material_ids = set()
        for event in events:
            if event.get("materials_attachment_ids"):
                material_ids.update(event["materials_attachment_ids"])
        
        # Get materials
        materials = []
        if material_ids:
            materials_res = supabase.table("uploads").select(
                "id, title, mime, created_at"
            ).in_("id", list(material_ids)).execute()
            materials = materials_res.data or []
        
        # Calculate progress summary
        events_total = len(events)
        events_completed = len([e for e in events if e.get("status") == "done"])
        tasks_total = len(backlog_items)
        tasks_completed = len([t for t in backlog_items if t.get("status") == "completed"])
        
        progress_summary = {
            "events_total": events_total,
            "events_completed": events_completed,
            "tasks_total": tasks_total,
            "tasks_completed": tasks_completed
        }
        
        # Get backlog items due this week
        backlog_res = supabase.table("backlog_items").select(
            "id, title, description, due_date, estimate_minutes, subject_id, priority"
        ).eq("child_id", child_id).eq("is_active", True).gte("due_date", str(week_start_date)).lte("due_date", str(week_end_date)).order("due_date").execute()
        
        backlog_items = backlog_res.data or []
        
        # Get subjects map
        subject_ids = set()
        for event in events:
            if event.get("subject_id"):
                subject_ids.add(event["subject_id"])
        for item in backlog_items:
            if item.get("subject_id"):
                subject_ids.add(item["subject_id"])
        
        subjects_map = {}
        if subject_ids:
            subjects_res = supabase.table("subject").select("id, name").in_("id", list(subject_ids)).execute()
            if subjects_res.data:
                subjects_map = {s["id"]: s["name"] for s in subjects_res.data}
        
        # Generate output based on format
        if format.lower() == "html":
            html_content = generate_weekly_packet_html(
                child_name=child_name,
                week_start=week_start_date,
                week_end=week_end_date,
                events=events,
                backlog_items=backlog_items,
                subjects_map=subjects_map,
                materials=materials,
                progress_summary=progress_summary
            )
            
            log_event("weekly_packet_generated", child_id=child_id, week_start=week_start, format="html", user_id=user["id"])
            
            return HTMLResponse(content=html_content)
        else:
            # Generate PDF (enhanced with materials and progress)
            pdf_buffer = generate_weekly_packet_pdf(
                child_name=child_name,
                week_start=week_start_date,
                week_end=week_end_date,
                events=events,
                backlog_items=backlog_items,
                subjects_map=subjects_map
            )
            
            log_event("weekly_packet_generated", child_id=child_id, week_start=week_start, format="pdf", user_id=user["id"])
            
            return StreamingResponse(
                pdf_buffer,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="weekly_packet_{child_name.replace(" ", "_")}_{week_start}.pdf"'
                }
            )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("weekly_packet.error", child_id=child_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating weekly packet: {str(e)}")


# --- Quick Reschedule Endpoints ---

@router.post("/quick_reschedule")
async def quick_reschedule(
    body: QuickRescheduleInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Micro-rescheduler for last-minute changes.
    Generates minimal-diff schedule updates.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
        supabase = get_admin_client()
        
        # Validate children belong to family
        for child_id in body.children:
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(status_code=403, detail=f"Child {child_id} not found")
        
        # Parse time window
        start_date = date.fromisoformat(body.time_window["start_date"])
        end_date = date.fromisoformat(body.time_window["end_date"])
        
        # Load existing events for the time window
        start_ts = datetime.combine(start_date, datetime.min.time()).isoformat()
        end_ts = datetime.combine(end_date, datetime.max.time()).isoformat()
        
        events_res = supabase.table("events").select("*").eq(
            "family_id", family_id
        ).in_("child_id", body.children).gte(
            "start_ts", start_ts
        ).lte("start_ts", end_ts).neq(
            "status", "canceled"
        ).is_("deleted_at", None).order("start_ts").execute()
        
        existing_events = events_res.data or []
        
        # Initialize change: apply the user's change first
        moved = []
        dropped = []
        conflicts_resolved = 0
        
        # Handle the initial change
        change = body.change
        change_type = change.type
        
        if change_type == "moved_event" and change.event_id:
            # Find the event and apply the move
            event_id = change.event_id
            new_start = change.new_start
            new_end = change.new_end
            
            for event in existing_events:
                if event["id"] == event_id:
                    moved.append({
                        "event_id": event_id,
                        "title": event.get("title", "Event"),
                        "child_ids": [event.get("child_id")],
                        "old_start": event["start_ts"],
                        "old_end": event["end_ts"],
                        "new_start": new_start,
                        "new_end": new_end,
                        "reason": "User-initiated move"
                    })
                    # Update the event in our list to reflect the move
                    event["start_ts"] = new_start
                    event["end_ts"] = new_end
                    break
        
        elif change_type == "canceled_event" and change.event_id:
            # Mark event as canceled (remove from consideration)
            event_id = change.event_id
            for event in existing_events:
                if event["id"] == event_id:
                    dropped.append({
                        "event_id": event_id,
                        "title": event.get("title", "Event"),
                        "child_ids": [event.get("child_id")],
                        "reason": "User-initiated cancellation"
                    })
                    # Remove from existing_events
                    existing_events = [e for e in existing_events if e["id"] != event_id]
                    break
        
        elif change_type == "kid_unavailable" and change.child_unavailable:
            # This will be handled by blocking availability windows
            # For now, we'll note it in the constraints
            pass
        
        # Filter events based on constraints
        events_to_consider = []
        for event in existing_events:
            is_fixed = event.get("is_fixed", False) or event.get("event_type") in ["Fixed Class", "Appointment"]
            is_flexible = event.get("is_flexible", True) and not is_fixed
            
            if body.constraints.lock_fixed and is_fixed:
                continue  # Skip fixed events
            
            if body.constraints.only_flexible and not is_flexible:
                continue  # Skip non-flexible events
            
            events_to_consider.append(event)
        
        # Limit to max_moves (excluding already moved events)
        # Note: moved events from user change don't count toward max_moves limit
        events_to_consider = events_to_consider[:body.constraints.max_moves]
        
        # Load availability windows
        from routers.util import load_planning_context
        context = await load_planning_context(
            family_id=family_id,
            week_start=body.time_window["start_date"],
            child_ids=body.children,
            horizon_weeks=1
        )
        
        # Use micro-rescheduler logic or LLM to propose minimal changes
        # For now, implement a simple heuristic-based approach
        # In production, this would call the micro_rescheduler module
        
        # moved, dropped, conflicts_resolved already initialized above if user change was applied
        available_windows = []
        for avail_entry in context.get("availability", []):
            windows = avail_entry.get("windows", [])
            for window in windows:
                available_windows.append({
                    "child_id": avail_entry.get("child_id"),
                    "date": avail_entry.get("date"),
                    "start": window.get("start"),
                    "end": window.get("end"),
                })
        
        # Detect conflicts and propose moves
        # Simple conflict detection: check for overlapping events per child
        processed_events = set()
        
        for event1 in events_to_consider:
            if event1["id"] in processed_events:
                continue
            
            event1_start = datetime.fromisoformat(event1["start_ts"].replace("Z", "+00:00"))
            event1_end = datetime.fromisoformat(event1["end_ts"].replace("Z", "+00:00"))
            duration = (event1_end - event1_start).total_seconds() / 60
            child_id = event1.get("child_id")
            event_date = event1_start.date()
            
            # Find overlapping events for this child
            overlaps = []
            for event2 in existing_events:
                if event1["id"] == event2["id"] or event2.get("child_id") != child_id:
                    continue
                
                event2_start = datetime.fromisoformat(event2["start_ts"].replace("Z", "+00:00"))
                event2_end = datetime.fromisoformat(event2["end_ts"].replace("Z", "+00:00"))
                
                if event1_start < event2_end and event2_start < event1_end:
                    overlaps.append(event2)
            
            if overlaps:
                # Skip if this event was already moved by user
                if event1["id"] in [m["event_id"] for m in moved]:
                    continue
                
                # Try to find a new slot
                found_slot = False
                for window in available_windows:
                    if window["child_id"] != child_id:
                        continue
                    
                    window_start = datetime.fromisoformat(window["start"].replace("Z", "+00:00"))
                    window_end = datetime.fromisoformat(window["end"].replace("Z", "+00:00"))
                    window_date = window_start.date()
                    
                    # Check if window fits
                    window_duration = (window_end - window_start).total_seconds() / 60
                    if window_duration < duration:
                        continue
                    
                    # Check date preference
                    if body.constraints.prefer_same_day and window_date != event_date:
                        continue
                    
                    # Check if this window conflicts with already moved events
                    conflicts_with_moved = False
                    for moved_event in moved:
                        moved_start = datetime.fromisoformat(moved_event["new_start"].replace("Z", "+00:00"))
                        moved_end = datetime.fromisoformat(moved_event["new_end"].replace("Z", "+00:00"))
                        if (moved_event["child_ids"] and child_id in moved_event["child_ids"] and
                            window_start < moved_end and moved_start < window_end):
                            conflicts_with_moved = True
                            break
                    
                    if conflicts_with_moved:
                        continue
                    
                    # Propose move
                    new_start = window_start
                    new_end = new_start + timedelta(minutes=duration)
                    
                    moved.append({
                        "event_id": event1["id"],
                        "title": event1.get("title", "Event"),
                        "child_ids": [child_id],
                        "old_start": event1["start_ts"],
                        "old_end": event1["end_ts"],
                        "new_start": new_start.isoformat(),
                        "new_end": new_end.isoformat(),
                        "reason": f"Moved to resolve conflict"
                    })
                    conflicts_resolved += 1
                    processed_events.add(event1["id"])
                    found_slot = True
                    break
                
                if not found_slot:
                    dropped.append({
                        "event_id": event1["id"],
                        "title": event1.get("title", "Event"),
                        "child_ids": [child_id],
                        "reason": "No available slot found"
                    })
        
        run_id = f"qr_{family_id}_{int(datetime.now().timestamp())}"
        
        return {
            "preview": {
                "moved": moved,
                "dropped": dropped,
                "conflicts_resolved": conflicts_resolved
            },
            "proposed_events_patch": moved,  # Simplified - in production would be full patch
            "meta": {
                "run_id": run_id,
                "reasoning_summary": f"Resolved {conflicts_resolved} conflicts by moving {len(moved)} events"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("quick_reschedule.error", family_id=body.family_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error in quick reschedule: {str(e)}")


@router.post("/quick_reschedule/apply")
async def apply_quick_reschedule(
    body: QuickRescheduleApplyInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Apply quick reschedule changes.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
        supabase = get_admin_client()
        
        applied_count = 0
        
        # Apply proposed changes
        # The proposed_events_patch format: [{event_id, title, child_ids, old_start, old_end, new_start, new_end, reason}]
        for change in body.proposed_events_patch:
            event_id = change.get("event_id")
            new_start = change.get("new_start")
            new_end = change.get("new_end")
            
            if event_id and new_start and new_end:
                try:
                    ev_res = supabase.table("events").select("is_placeholder, generated_by, generation_batch_id, academic_year_id").eq("id", event_id).eq("family_id", family_id).execute()
                    ev = ev_res.data[0] if ev_res.data else {}
                    update_payload = {
                        "start_ts": new_start,
                        "end_ts": new_end,
                        "reschedule_origin": "quick_reschedule",
                        "reschedule_reason": change.get("reason", "Quick reschedule"),
                    }
                    conv_fields, did_convert = get_placeholder_conversion_fields(ev)
                    update_payload.update(conv_fields)
                    if did_convert:
                        log_event("placeholder_converted", action="quick_reschedule_apply", event_id=event_id, academic_year_id=ev.get("academic_year_id"), user_id=user["id"], old_batch_id=ev.get("generation_batch_id"))
                    update_res = supabase.table("events").update(update_payload).eq("id", event_id).eq("family_id", family_id).execute()
                    
                    if update_res.data:
                        applied_count += 1
                except Exception as e:
                    log_event("apply_quick_reschedule.event_update_error", event_id=event_id, error=str(e))
        
        # Refresh calendar cache
        try:
            # Determine date range from changes
            dates = []
            for change in body.proposed_events_patch:
                if change.get("old_start"):
                    dates.append(datetime.fromisoformat(change["old_start"].replace("Z", "+00:00")).date())
                if change.get("new_start"):
                    dates.append(datetime.fromisoformat(change["new_start"].replace("Z", "+00:00")).date())
            
            if dates:
                min_date = min(dates)
                max_date = max(dates)
                supabase.rpc(
                    "refresh_calendar_days_cache",
                    {
                        "p_family_id": family_id,
                        "p_from_date": str(min_date),
                        "p_to_date": str(max_date + timedelta(days=1))
                    }
                ).execute()
        except Exception as cache_error:
            log_event("apply_quick_reschedule.cache_refresh_error", error=str(cache_error))
        
        log_event("quick_reschedule.applied", family_id=family_id, run_id=body.run_id, applied_count=applied_count)
        
        return {
            "applied": True,
            "applied_count": applied_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("apply_quick_reschedule.error", family_id=body.family_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error applying quick reschedule: {str(e)}")


# --- Plan Week Endpoints ---

@router.post("/plan_week")
async def plan_week_endpoint(
    body: PlanWeekInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Generate a constraint-aware weekly plan.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
        # Validate week_start is a Monday
        week_start_date = date.fromisoformat(body.week_start)
        if week_start_date.weekday() != 0:  # Monday is 0
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="week_start must be a Monday"
            )
        
        supabase = get_admin_client()
        
        # Validate children belong to family
        for child_id in body.child_ids:
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(status_code=403, detail=f"Child {child_id} not found")
        
        # Load planning context
        from routers.util import load_planning_context
        context = await load_planning_context(
            family_id=family_id,
            week_start=body.week_start,
            child_ids=body.child_ids,
            horizon_weeks=1
        )
        
        # Build planner context JSON for LLM
        planner_context = {
            "week_start": body.week_start,
            "timezone": "America/New_York",  # TODO: Get from family settings
            "children": [],
            "fixed_events": [],
            "blocked_times": [],
            "existing_movable_items": [],
            "options": body.options.dict() if hasattr(body.options, 'dict') else {
                "focus": body.options.focus or [],
                "intensity": body.options.intensity,
                "max_daily_minutes_per_child": body.options.max_daily_minutes_per_child,
                "weekend_mode": body.options.weekend_mode,
            }
        }
        
        # Get children data
        children_res = supabase.table("children").select(
            "id, first_name, age, learning_style, interests, daily_max_minutes"
        ).in_("id", body.child_ids).execute()
        
        for child in (children_res.data or []):
            child_data = {
                "child_id": child["id"],
                "name": child.get("first_name", "Child"),
                "age": child.get("age"),
                "learning_style": child.get("learning_style") or [],
                "interests": child.get("interests") or [],
                "daily_max_minutes": child.get("daily_max_minutes") or body.options.max_daily_minutes_per_child,
                "active_sequences": [],  # TODO: Load from sequences
                "recent_progress": {}  # TODO: Load from progress data
            }
            planner_context["children"].append(child_data)
        
        # Get fixed events
        week_end_date = week_start_date + timedelta(days=6)
        start_ts = datetime.combine(week_start_date, datetime.min.time()).isoformat()
        end_ts = datetime.combine(week_end_date, datetime.max.time()).isoformat()
        
        fixed_events_res = supabase.table("events").select("*").eq(
            "family_id", family_id
        ).in_("child_id", body.child_ids).gte(
            "start_ts", start_ts
        ).lte("start_ts", end_ts).eq(
            "is_fixed", True
        ).neq("status", "canceled").is_("deleted_at", None).execute()
        
        for event in (fixed_events_res.data or []):
            planner_context["fixed_events"].append({
                "id": event["id"],
                "child_ids": [event.get("child_id")],
                "start": event["start_ts"],
                "end": event["end_ts"],
                "title": event.get("title", "Event")
            })
        
        # Get movable items
        movable_events_res = supabase.table("events").select("*").eq(
            "family_id", family_id
        ).in_("child_id", body.child_ids).gte(
            "start_ts", start_ts
        ).lte("start_ts", end_ts).eq(
            "is_flexible", True
        ).neq("status", "canceled").is_("deleted_at", None).execute()
        
        for event in (movable_events_res.data or []):
            planner_context["existing_movable_items"].append({
                "id": event["id"],
                "child_ids": [event.get("child_id")],
                "start": event["start_ts"],
                "end": event["end_ts"],
                "title": event.get("title", "Event"),
                "type": event.get("event_type", "practice")
            })
        
        # Call LLM to generate plan
        try:
            from llm import llm_plan_week
        except ImportError:
            llm_plan_week = None
        
        if not llm_plan_week:
            # Fallback: return empty plan
            return {
                "summary": {
                    "week_start": body.week_start,
                    "children": [{"child_id": cid, "planned_minutes": 0} for cid in body.child_ids],
                    "conflicts_resolved": 0,
                    "new_items": 0,
                    "moved_items": 0
                },
                "patch": {
                    "create": [],
                    "move": [],
                    "update": [],
                    "delete": []
                },
                "notes": [],
                "run_id": f"pw_{family_id}_{int(datetime.now().timestamp())}"
            }
        
        # Call LLM
        import json
        llm_result = await llm_plan_week(json.dumps(planner_context))
        
        # Validate and structure response
        patch = llm_result.get("patch", {})
        summary = llm_result.get("summary", {})
        notes = llm_result.get("notes", [])
        
        run_id = f"pw_{family_id}_{int(datetime.now().timestamp())}"
        
        record_ai_usage(
            family_id,
            "generatePlanWeek",
            idempotency_key=run_id,
            metadata={"route": "plan_week", "week_start": body.week_start},
        )
        
        return {
            "summary": summary,
            "patch": patch,
            "notes": notes,
            "run_id": run_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("plan_week.error", family_id=body.family_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error planning week: {str(e)}")


@router.post("/plan_week/apply")
async def apply_plan_week(
    body: PlanWeekApplyInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Apply weekly plan patch to calendar.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        require_onboarding_complete(family_id)
        supabase = get_admin_client()
        
        patch = body.patch
        created_count = 0
        moved_count = 0
        updated_count = 0
        deleted_count = 0
        
        # Apply create operations
        for item in patch.get("create", []):
            try:
                child_ids = item.get("child_ids", [])
                if not child_ids:
                    continue
                
                # Create event for each child
                for child_id in child_ids:
                    event_data = {
                        "family_id": family_id,
                        "child_id": child_id,
                        "subject_id": item.get("subject_id"),
                        "title": item.get("title", "Lesson"),
                        "start_ts": item.get("start"),
                        "end_ts": item.get("end"),
                        "status": "scheduled",
                        "source": "ai_plan",
                        "event_type": item.get("type", "lesson"),
                        "counts_toward_plan": True,
                    }
                    
                    # Add metadata if available
                    if item.get("source"):
                        event_data["metadata"] = item.get("source")
                    
                    insert_res = supabase.table("events").insert(event_data).execute()
                    if insert_res.data:
                        created_count += 1
            except Exception as e:
                log_event("apply_plan_week.create_error", error=str(e), item=item)
        
        # Apply move operations
        for item in patch.get("move", []):
            try:
                event_id = item.get("event_id")
                if not event_id:
                    continue
                ev_res = supabase.table("events").select("is_placeholder, generated_by, generation_batch_id, academic_year_id").eq("id", event_id).eq("family_id", family_id).execute()
                ev = ev_res.data[0] if ev_res.data else {}
                update_data = {
                    "start_ts": item.get("new_start") or item.get("to", {}).get("start_at"),
                    "end_ts": item.get("new_end") or item.get("to", {}).get("end_at"),
                    "reschedule_origin": "plan_week",
                    "reschedule_reason": item.get("reason", "Weekly plan"),
                }
                conv_fields, did_convert = get_placeholder_conversion_fields(ev)
                update_data.update(conv_fields)
                if did_convert:
                    log_event("placeholder_converted", action="plan_week_move", event_id=event_id, academic_year_id=ev.get("academic_year_id"), user_id=user["id"], old_batch_id=ev.get("generation_batch_id"))
                update_res = supabase.table("events").update(update_data).eq(
                    "id", event_id
                ).eq("family_id", family_id).execute()
                
                if update_res.data:
                    moved_count += 1
            except Exception as e:
                log_event("apply_plan_week.move_error", error=str(e), item=item)
        
        # Apply update operations
        for item in patch.get("update", []):
            try:
                event_id = item.get("event_id")
                if not event_id:
                    continue
                ev_res = supabase.table("events").select("is_placeholder, generated_by, generation_batch_id, academic_year_id").eq("id", event_id).eq("family_id", family_id).execute()
                ev = ev_res.data[0] if ev_res.data else {}
                updates = dict(item.get("updates", {}))
                conv_fields, did_convert = get_placeholder_conversion_fields(ev)
                updates.update(conv_fields)
                if did_convert:
                    log_event("placeholder_converted", action="plan_week_update", event_id=event_id, academic_year_id=ev.get("academic_year_id"), user_id=user["id"], old_batch_id=ev.get("generation_batch_id"))
                update_res = supabase.table("events").update(updates).eq(
                    "id", event_id
                ).eq("family_id", family_id).execute()
                
                if update_res.data:
                    updated_count += 1
            except Exception as e:
                log_event("apply_plan_week.update_error", error=str(e), item=item)
        
        # Apply delete operations (rare in beta)
        for item in patch.get("delete", []):
            try:
                event_id = item.get("event_id")
                if not event_id:
                    continue
                
                # Soft delete
                delete_res = supabase.table("events").update({
                    "deleted_at": datetime.now().isoformat()
                }).eq("id", event_id).eq("family_id", family_id).execute()
                
                if delete_res.data:
                    deleted_count += 1
            except Exception as e:
                log_event("apply_plan_week.delete_error", error=str(e), item=item)
        
        # Refresh calendar cache for the week
        try:
            # Extract week_start from run_id or use current week
            week_start_date = date.today()
            # Find Monday
            days_since_monday = week_start_date.weekday()
            week_start_date = week_start_date - timedelta(days=days_since_monday)
            week_end_date = week_start_date + timedelta(days=7)
            
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(week_start_date),
                    "p_to_date": str(week_end_date)
                }
            ).execute()
        except Exception as cache_error:
            log_event("apply_plan_week.cache_refresh_error", error=str(cache_error))
        
        log_event(
            "plan_week.applied",
            family_id=family_id,
            run_id=body.run_id,
            created=created_count,
            moved=moved_count,
            updated=updated_count,
            deleted=deleted_count
        )
        
        return {
            "applied": True,
            "created": created_count,
            "moved": moved_count,
            "updated": updated_count,
            "deleted": deleted_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("apply_plan_week.error", family_id=body.family_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error applying plan: {str(e)}")


# --- Resolve Conflicts Endpoints ---

@router.post("/resolve_conflicts/preview")
async def preview_resolve_conflicts(
    body: ResolveConflictsPreviewInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Preview conflict resolution proposals.
    Detects conflicts and generates resolution proposals.
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
        
        # Load events for the date range
        start_ts = datetime.combine(start_date, datetime.min.time()).isoformat()
        end_ts = datetime.combine(end_date, datetime.max.time()).isoformat()
        
        events_res = supabase.table("events").select("*").eq(
            "family_id", family_id
        ).in_("child_id", body.child_ids).gte(
            "start_ts", start_ts
        ).lte("start_ts", end_ts).neq(
            "status", "canceled"
        ).is_("deleted_at", None).order("start_ts").execute()
        
        existing_events = events_res.data or []
        
        # Normalize events for conflict detection
        normalized_events = []
        for event in existing_events:
            # Get child_ids as array
            child_ids = [event.get("child_id")] if event.get("child_id") else []
            
            normalized_events.append({
                "id": event["id"],
                "title": event.get("title", "Event"),
                "start_at": event["start_ts"],
                "end_at": event["end_ts"],
                "child_ids": child_ids,
                "is_fixed": event.get("is_fixed", False) or event.get("event_type") in ["Fixed Class", "Appointment"],
                "is_flexible": event.get("is_flexible", True) and not (event.get("is_fixed", False) or event.get("event_type") in ["Fixed Class", "Appointment"]),
                "priority": event.get("priority", "med"),
            })
        
        # Detect conflicts
        conflicts = []
        conflicts_by_key = {}
        
        # Group events by child and date
        events_by_child_date = {}
        for event in normalized_events:
            event_date = datetime.fromisoformat(event["start_at"].replace("Z", "+00:00")).date()
            for child_id in event["child_ids"]:
                key = f"{child_id}_{event_date.isoformat()}"
                if key not in events_by_child_date:
                    events_by_child_date[key] = []
                events_by_child_date[key].append(event)
        
        # Detect overlaps
        for key, day_events in events_by_child_date.items():
            # Sort by start time
            sorted_events = sorted(day_events, key=lambda e: datetime.fromisoformat(e["start_at"].replace("Z", "+00:00")))
            
            # Check for overlaps
            for i, event1 in enumerate(sorted_events):
                event1_start = datetime.fromisoformat(event1["start_at"].replace("Z", "+00:00"))
                event1_end = datetime.fromisoformat(event1["end_at"].replace("Z", "+00:00"))
                
                for j, event2 in enumerate(sorted_events[i+1:], start=i+1):
                    event2_start = datetime.fromisoformat(event2["start_at"].replace("Z", "+00:00"))
                    event2_end = datetime.fromisoformat(event2["end_at"].replace("Z", "+00:00"))
                    
                    # Check for overlap
                    if event1_start < event2_end and event2_start < event1_end:
                        # Conflict found
                        conflict_key = f"{min(event1['id'], event2['id'])}_{max(event1['id'], event2['id'])}"
                        if conflict_key not in conflicts_by_key:
                            # Determine severity
                            is_fixed1 = event1.get("is_fixed", False)
                            is_fixed2 = event2.get("is_fixed", False)
                            
                            if is_fixed1 or is_fixed2:
                                severity = "high"
                            elif not event1.get("is_flexible", True) or not event2.get("is_flexible", True):
                                severity = "med"
                            else:
                                severity = "low"
                            
                            conflict = {
                                "conflict_id": conflict_key,
                                "date": event1_start.date().isoformat(),
                                "type": "overlap",
                                "child_ids": list(set(event1["child_ids"] + event2["child_ids"])),
                                "event_ids": [event1["id"], event2["id"]],
                                "window": {
                                    "start_at": max(event1_start, event2_start).isoformat(),
                                    "end_at": min(event1_end, event2_end).isoformat(),
                                },
                                "severity": severity,
                                "reason": f"Overlap between '{event1['title']}' and '{event2['title']}'"
                            }
                            conflicts.append(conflict)
                            conflicts_by_key[conflict_key] = conflict
        
        # Generate resolution proposals
        proposals = []
        constraints = body.constraints or ResolveConflictsConstraintsInput()
        
        # Load availability windows for finding gaps
        from routers.util import load_planning_context
        context = await load_planning_context(
            family_id=family_id,
            week_start=body.range.start,
            child_ids=body.child_ids,
            horizon_weeks=1
        )
        
        available_windows = []
        for avail_entry in context.get("availability", []):
            windows = avail_entry.get("windows", [])
            for window in windows:
                available_windows.append({
                    "child_id": avail_entry.get("child_id"),
                    "date": avail_entry.get("date"),
                    "start": window.get("start"),
                    "end": window.get("end"),
                })
        
        # Generate proposals for each conflict
        for conflict in conflicts:
            event_ids = conflict["event_ids"]
            conflict_events = [e for e in normalized_events if e["id"] in event_ids]
            
            # Find which event is flexible and can be moved
            flexible_event = None
            fixed_event = None
            
            for event in conflict_events:
                if constraints.keep_fixed and event.get("is_fixed", False):
                    fixed_event = event
                elif event.get("is_flexible", True):
                    flexible_event = event
            
            if not flexible_event:
                # Both are fixed or no flexible event found - flag it
                proposals.append({
                    "type": "flag",
                    "event_id": conflict["event_ids"][0],
                    "rationale": f"Cannot resolve: {conflict['reason']} (both events are fixed)",
                    "affected_child_ids": conflict["child_ids"]
                })
                continue
            
            # Try to find a new slot for the flexible event
            event_start = datetime.fromisoformat(flexible_event["start_at"].replace("Z", "+00:00"))
            event_end = datetime.fromisoformat(flexible_event["end_at"].replace("Z", "+00:00"))
            duration = (event_end - event_start).total_seconds() / 60
            event_date = event_start.date()
            child_id = flexible_event["child_ids"][0] if flexible_event["child_ids"] else None
            
            if not child_id:
                proposals.append({
                    "type": "flag",
                    "event_id": flexible_event["id"],
                    "rationale": f"Cannot resolve: No child ID for event",
                    "affected_child_ids": []
                })
                continue
            
            # Find available window
            found_slot = False
            for window in available_windows:
                if window["child_id"] != child_id:
                    continue
                
                window_start = datetime.fromisoformat(window["start"].replace("Z", "+00:00"))
                window_end = datetime.fromisoformat(window["end"].replace("Z", "+00:00"))
                window_date = window_start.date()
                
                # Check date preference
                if not constraints.allow_spillover and window_date != event_date:
                    continue
                
                # Check if window fits
                window_duration = (window_end - window_start).total_seconds() / 60
                if window_duration >= duration:
                    # Propose move
                    new_start = window_start
                    new_end = new_start + timedelta(minutes=duration)
                    
                    proposals.append({
                        "type": "move",
                        "event_id": flexible_event["id"],
                        "from": {
                            "start_at": flexible_event["start_at"],
                            "end_at": flexible_event["end_at"]
                        },
                        "to": {
                            "start_at": new_start.isoformat(),
                            "end_at": new_end.isoformat()
                        },
                        "rationale": f"Move '{flexible_event['title']}' to resolve conflict",
                        "affected_child_ids": [child_id]
                    })
                    found_slot = True
                    break
            
            if not found_slot:
                # Try splitting if allowed
                if constraints.allow_splitting and duration > 30:
                    # Split into two parts
                    part1_duration = duration / 2
                    part2_duration = duration - part1_duration
                    
                    # Find two slots
                    slots_found = []
                    for window in available_windows:
                        if window["child_id"] != child_id:
                            continue
                        
                        window_start = datetime.fromisoformat(window["start"].replace("Z", "+00:00"))
                        window_end = datetime.fromisoformat(window["end"].replace("Z", "+00:00"))
                        window_duration = (window_end - window_start).total_seconds() / 60
                        
                        if window_duration >= part1_duration and len(slots_found) == 0:
                            slots_found.append({
                                "start_at": window_start.isoformat(),
                                "end_at": (window_start + timedelta(minutes=part1_duration)).isoformat()
                            })
                        elif window_duration >= part2_duration and len(slots_found) == 1:
                            slots_found.append({
                                "start_at": window_start.isoformat(),
                                "end_at": (window_start + timedelta(minutes=part2_duration)).isoformat()
                            })
                        
                        if len(slots_found) == 2:
                            break
                    
                    if len(slots_found) == 2:
                        proposals.append({
                            "type": "split",
                            "event_id": flexible_event["id"],
                            "from": {
                                "start_at": flexible_event["start_at"],
                                "end_at": flexible_event["end_at"]
                            },
                            "parts": slots_found,
                            "rationale": f"Split '{flexible_event['title']}' into two parts to resolve conflict",
                            "affected_child_ids": [child_id]
                        })
                    else:
                        proposals.append({
                            "type": "flag",
                            "event_id": flexible_event["id"],
                            "rationale": f"Cannot resolve: No available slots found for '{flexible_event['title']}'",
                            "affected_child_ids": [child_id]
                        })
                else:
                    proposals.append({
                        "type": "flag",
                        "event_id": flexible_event["id"],
                        "rationale": f"Cannot resolve: No available slots found for '{flexible_event['title']}'",
                        "affected_child_ids": [child_id]
                    })
        
        # Build resolution plan
        moved_count = len([p for p in proposals if p["type"] == "move"])
        split_count = len([p for p in proposals if p["type"] == "split"])
        unresolved_count = len([p for p in proposals if p["type"] == "flag"])
        
        plan_id = f"rc_{family_id}_{int(datetime.now().timestamp())}"
        
        record_ai_usage(
            family_id,
            "resolveConflicts",
            idempotency_key=plan_id,
            metadata={"route": "resolve_conflicts/preview"},
        )
        
        return {
            "plan_id": plan_id,
            "conflicts": conflicts,
            "proposals": proposals,
            "stats": {
                "moved_count": moved_count,
                "split_count": split_count,
                "unresolved_count": unresolved_count,
                "total_conflicts": len(conflicts)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("resolve_conflicts_preview.error", family_id=body.family_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error previewing conflict resolution: {str(e)}")


@router.post("/resolve_conflicts/apply")
async def apply_resolve_conflicts(
    body: ResolveConflictsApplyInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Apply conflict resolution changes.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
        supabase = get_admin_client()
        
        applied_count = 0
        
        # Apply proposed changes
        for change in body.proposed_changes:
            change_type = change.get("type")
            event_id = change.get("event_id")
            
            if not event_id:
                continue
            
            try:
                if change_type == "move":
                    to = change.get("to", {})
                    new_start = to.get("start_at")
                    new_end = to.get("end_at")
                    
                    if new_start and new_end:
                        ev_res = supabase.table("events").select("is_placeholder, generated_by, generation_batch_id, academic_year_id").eq("id", event_id).eq("family_id", family_id).execute()
                        ev = ev_res.data[0] if ev_res.data else {}
                        update_payload = {
                            "start_ts": new_start,
                            "end_ts": new_end,
                            "reschedule_origin": "resolve_conflicts",
                            "reschedule_reason": change.get("rationale", "Conflict resolution"),
                        }
                        conv_fields, did_convert = get_placeholder_conversion_fields(ev)
                        update_payload.update(conv_fields)
                        if did_convert:
                            log_event("placeholder_converted", action="resolve_conflicts_move", event_id=event_id, academic_year_id=ev.get("academic_year_id"), user_id=user["id"], old_batch_id=ev.get("generation_batch_id"))
                        update_res = supabase.table("events").update(update_payload).eq("id", event_id).eq("family_id", family_id).execute()
                        
                        if update_res.data:
                            applied_count += 1
                
                elif change_type == "split":
                    parts = change.get("parts", [])
                    if len(parts) >= 2:
                        # Get original event
                        event_res = supabase.table("events").select("*").eq("id", event_id).eq("family_id", family_id).single().execute()
                        if event_res.data:
                            original = event_res.data
                            
                            # Create new events for each part
                            for idx, part in enumerate(parts):
                                supabase.table("events").insert({
                                    "family_id": family_id,
                                    "child_id": original.get("child_id"),
                                    "subject_id": original.get("subject_id"),
                                    "title": f"{original.get('title', 'Event')} (Part {idx + 1})",
                                    "start_ts": part.get("start_at"),
                                    "end_ts": part.get("end_at"),
                                    "status": "scheduled",
                                    "source": "resolve_conflicts",
                                }).execute()
                            
                            # Soft delete original
                            supabase.table("events").update({
                                "deleted_at": datetime.now().isoformat()
                            }).eq("id", event_id).execute()
                            
                            applied_count += 1
                
                # Note: "flag" type changes are not applied, they're just informational
                
            except Exception as e:
                log_event("apply_resolve_conflicts.change_error", event_id=event_id, error=str(e))
                # Continue with other changes
        
        # Refresh calendar cache
        try:
            start_date = date.fromisoformat(body.range.start)
            end_date = date.fromisoformat(body.range.end)
            
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(start_date),
                    "p_to_date": str(end_date + timedelta(days=1))
                }
            ).execute()
        except Exception as cache_error:
            log_event("apply_resolve_conflicts.cache_refresh_error", error=str(cache_error))
        
        log_event("resolve_conflicts.applied", family_id=family_id, applied_count=applied_count)
        
        return {
            "applied": True,
            "applied_count": applied_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("apply_resolve_conflicts.error", family_id=body.family_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error applying conflict resolution: {str(e)}")


# --- AI Chat Endpoint ---

class AIChatInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    selected_children: List[str] = Field(..., description="Array of child IDs")
    timeframe_start: str = Field(..., description="Start date (ISO 8601)")
    timeframe_end: str = Field(..., description="End date (ISO 8601)")
    messages: List[Dict[str, str]] = Field(..., description="Chat message history [{ role: 'user'|'assistant', content: string }]")


@router.post("/ai_chat")
async def ai_chat_endpoint(
    body: AIChatInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    AI chat endpoint for Intelligence Hub.
    Uses child data from onboarding, progress on events, upcoming events/assignments, and general education recommendations.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
        supabase = get_admin_client()
        
        # Validate children belong to family
        for child_id in body.selected_children:
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(status_code=403, detail=f"Child {child_id} not found")
        
        # Parse timeframe
        timeframe_start = datetime.fromisoformat(body.timeframe_start.replace("Z", "+00:00"))
        timeframe_end = datetime.fromisoformat(body.timeframe_end.replace("Z", "+00:00"))
        
        # Build context for LLM
        context = {
            "family_id": family_id,
            "user_id": user["id"],
            "selected_children": body.selected_children,
            "timeframe_start": body.timeframe_start,
            "timeframe_end": body.timeframe_end,
            "conversation_history": body.messages[-10:],  # Last 10 messages
        }
        
        # Get comprehensive child data from onboarding (children table)
        children_data = []
        for child_id in body.selected_children:
            child_result = supabase.table("children").select("*").eq("id", child_id).single().execute()
            if child_result.data:
                child_data = child_result.data
                
                # Get support profile (diagnoses, learning modalities, support needs)
                # Gracefully handle if table doesn't exist or RLS blocks access
                try:
                    support_profile_result = supabase.table("child_support_profiles").select("*").eq("child_id", child_id).maybe_single().execute()
                    if support_profile_result.data:
                        child_data["support_profile"] = support_profile_result.data
                    else:
                        child_data["support_profile"] = None
                except Exception as e:
                    # Table might not exist or RLS issue - continue without support profile
                    child_data["support_profile"] = None
                
                # Get learner profile (strengths, interests, academic profile)
                # Gracefully handle if table doesn't exist or RLS blocks access
                try:
                    learner_profile_result = supabase.table("child_learner_profile").select("*").eq("child_id", child_id).maybe_single().execute()
                    if learner_profile_result.data:
                        child_data["learner_profile"] = learner_profile_result.data
                    else:
                        child_data["learner_profile"] = None
                except Exception as e:
                    # Table might not exist or RLS issue - continue without learner profile
                    child_data["learner_profile"] = None
                
                children_data.append(child_data)
        context["children_info"] = children_data
        
        # Get progress on events (events with status and outcomes)
        events_query = supabase.table("events").select(
            "id, title, start_ts, end_ts, subject_id, status, child_id"
        ).eq("family_id", family_id).in_("child_id", body.selected_children)
        
        if body.timeframe_start:
            events_query = events_query.gte("start_ts", body.timeframe_start)
        if body.timeframe_end:
            events_query = events_query.lte("start_ts", body.timeframe_end)
        
        events_result = events_query.order("start_ts", desc=True).limit(50).execute()
        context["recent_events"] = events_result.data or []
        
        # Get event outcomes for progress tracking
        if events_result.data:
            event_ids = [e["id"] for e in events_result.data]
            outcomes_result = supabase.table("event_outcomes").select(
                "id, event_id, child_id, rating, strengths, struggles, note"
            ).in_("event_id", event_ids).order("created_at", desc=True).limit(100).execute()
            context["event_outcomes"] = outcomes_result.data or []
        
        # Get upcoming events
        upcoming_events_query = supabase.table("events").select(
            "id, title, start_ts, end_ts, subject_id, status, child_id"
        ).eq("family_id", family_id).in_("child_id", body.selected_children).gte(
            "start_ts", datetime.now().isoformat()
        ).order("start_ts", desc=False).limit(30).execute()
        context["upcoming_events"] = upcoming_events_query.data or []
        
        # Get assignments
        assignments_query = supabase.table("assignments").select(
            "id, title, due_date, status, child_id, related_subject"
        ).eq("family_id", family_id).in_("child_id", body.selected_children)
        
        if body.timeframe_start:
            assignments_query = assignments_query.gte("due_date", body.timeframe_start.split("T")[0])
        if body.timeframe_end:
            assignments_query = assignments_query.lte("due_date", body.timeframe_end.split("T")[0])
        
        assignments_result = assignments_query.order("due_date", desc=False).limit(50).execute()
        context["assignments"] = assignments_result.data or []
        
        # Get grades data for selected children (gracefully handle if table doesn't exist)
        try:
            grades_query = supabase.table("grades").select(
                "id, child_id, subject_id, term_label, score, grade, rubric, notes, created_at"
            ).eq("family_id", family_id).in_("child_id", body.selected_children)
            
            if body.timeframe_start:
                grades_query = grades_query.gte("created_at", body.timeframe_start)
            if body.timeframe_end:
                grades_query = grades_query.lte("created_at", body.timeframe_end)
            
            grades_result = grades_query.order("created_at", desc=True).limit(100).execute()
            context["grades"] = grades_result.data or [] if not grades_result.error else []
        except Exception as e:
            # Table might not exist - continue without grades
            context["grades"] = []
        
        # Get attendance data for selected children (gracefully handle if table doesn't exist)
        try:
            attendance_query = supabase.table("attendance_records").select(
                "id, child_id, event_id, day_date, minutes, status, note"
            ).eq("family_id", family_id).in_("child_id", body.selected_children)
            
            if body.timeframe_start:
                attendance_query = attendance_query.gte("day_date", body.timeframe_start.split("T")[0])
            if body.timeframe_end:
                attendance_query = attendance_query.lte("day_date", body.timeframe_end.split("T")[0])
            
            attendance_result = attendance_query.order("day_date", desc=True).limit(100).execute()
            context["attendance"] = attendance_result.data or [] if not attendance_result.error else []
        except Exception as e:
            # Table might not exist - continue without attendance
            context["attendance"] = []
        
        # Get subject details (what they're learning)
        # Get unique subject IDs from events
        subject_ids = set()
        for event in context["recent_events"]:
            if event.get("subject_id"):
                subject_ids.add(event["subject_id"])
        for event in context["upcoming_events"]:
            if event.get("subject_id"):
                subject_ids.add(event["subject_id"])
        for assignment in context["assignments"]:
            if assignment.get("related_subject"):
                subject_ids.add(assignment["related_subject"])
        
        subjects_data = []
        if subject_ids:
            subjects_result = supabase.table("subject").select(
                "id, name, grade, notes, child_id"
            ).in_("id", list(subject_ids)).execute()
            subjects_data = subjects_result.data or []
        context["subjects"] = subjects_data
        
        # Call LLM for response
        from llm import llm_coach_conversation
        
        # Adapt context for llm_coach_conversation (it expects single child_id, but we can adapt)
        # For multiple children, we'll create a combined context
        llm_context = {
            "family_id": family_id,
            "user_id": user["id"],
            "child_id": body.selected_children[0] if len(body.selected_children) == 1 else None,
            "session_type": "parent",
            "conversation_history": body.messages[-10:],
            "context_data": {
                "selected_children": body.selected_children,
                "timeframe": {
                    "start": body.timeframe_start,
                    "end": body.timeframe_end
                },
                "children_info": children_data,
                "recent_events": context["recent_events"],
                "event_outcomes": context.get("event_outcomes", []),
                "upcoming_events": context["upcoming_events"],
                "assignments": context["assignments"],
                "grades": context.get("grades", []),
                "attendance": context.get("attendance", []),
                "subjects": context.get("subjects", []),
            },
            "goals": [],
        }
        
        # If multiple children, include all child info
        if len(children_data) > 0:
            llm_context["child_info"] = children_data[0]  # Primary child for compatibility
            llm_context["all_children_info"] = children_data
        
        try:
            coach_response = await llm_coach_conversation(llm_context)
        except Exception as e:
            log_event("planner.ai_chat.llm_error", user_id=user["id"], family_id=family_id, error=str(e))
            raise HTTPException(status_code=500, detail=f"AI service unavailable: {str(e)}")
        
        record_ai_usage(
            family_id,
            "chatbotPlannerAware",
            metadata={"route": "ai_chat"},
        )
        
        # Format response
        response_text = coach_response.get("response", "I've analyzed your question based on the available data.")
        recommendations = coach_response.get("recommendations", [])
        evidence = coach_response.get("evidence", [])  # Extract evidence citations from LLM response
        
        return {
            "assistant_message": response_text,
            "response": response_text,  # Alias for compatibility
            "evidence": evidence,  # List of specific evidence cited
            "recommendations": recommendations,
            "proposed_changes": [],  # Can be populated if LLM suggests schedule changes
            "insights": recommendations,  # Use recommendations as insights
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("planner.ai_chat.error", family_id=body.family_id if 'body' in locals() else None, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error processing AI chat: {str(e)}")


# Export both routers
__all__ = ["router", "events_router"]

