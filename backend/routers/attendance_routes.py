"""
FastAPI routes for event completion and attendance tracking
Part of Event Completion + Outcome Reporting system
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timedelta
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

router = APIRouter(prefix="/api/events", tags=["attendance"])


class CompleteEventInput(BaseModel):
    minutes_override: Optional[int] = Field(None, description="Override calculated minutes")
    note: Optional[str] = Field(None, description="Optional note about completion")


class CompleteEventOut(BaseModel):
    event: dict
    attendance: dict


class OutcomeInput(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5, description="Rating 1-5")
    grade: Optional[str] = Field(None, description="Grade like 'A', 'B+', 'Pass'")
    note: Optional[str] = Field(None, description="Freeform note")
    strengths: Optional[List[str]] = Field(default_factory=list, description="Strengths chips")
    struggles: Optional[List[str]] = Field(default_factory=list, description="Struggles chips")


class OutcomeOut(BaseModel):
    id: str
    event_id: str
    rating: Optional[int]
    grade: Optional[str]
    note: Optional[str]
    strengths: List[str]
    struggles: List[str]
    created_at: str


@router.post("/{event_id}/complete", response_model=CompleteEventOut)
async def complete_event(
    event_id: str,
    body: Optional[CompleteEventInput] = None,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Mark an event as completed and create/update attendance record.
    
    Steps:
    1. Load event and verify it belongs to user's family
    2. Compute minutes from event duration (or use minutes_override)
    3. Set events.status = 'done'
    4. Upsert into attendance_records
    5. Return updated event + attendance record
    """
    if body is None:
        body = CompleteEventInput()
    
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    supabase = get_admin_client()
    
    try:
        # Load event and verify family access
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
        
        # Compute minutes from event duration
        start_ts = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00"))
        end_ts = datetime.fromisoformat(event["end_ts"].replace("Z", "+00:00"))
        duration = end_ts - start_ts
        minutes = body.minutes_override if body.minutes_override is not None else int(duration.total_seconds() / 60)
        
        # Update event status to 'done'
        # Note: There may be a database trigger that tries to update subject_credit_ledger
        # If that trigger fails due to missing columns, the update will still fail
        # Run the SQL migration 2025-11-18_fix_event_credit_trigger.sql to fix this
        update_res = supabase.table("events").update({
            "status": "done"
        }).eq("id", event_id).execute()
        
        if not update_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update event status"
            )
        
        updated_event = update_res.data[0]
        
        # Extract day_date from start_ts (date only)
        day_date = start_ts.date().isoformat()
        
        # Upsert attendance record
        attendance_data = {
            "family_id": family_id,
            "child_id": event["child_id"],
            "event_id": event_id,
            "day_date": day_date,
            "minutes": minutes,
            "status": "present",
            "note": body.note,
            "created_by": user["id"]
        }
        
        # Use upsert with conflict resolution on event_id (unique constraint)
        attendance_res = supabase.table("attendance_records").upsert(
            attendance_data,
            on_conflict="event_id"
        ).execute()
        
        if not attendance_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create attendance record"
            )
        
        attendance = attendance_res.data[0] if isinstance(attendance_res.data, list) else attendance_res.data
        
        log_event("event.completed", event_id=event_id, family_id=family_id, minutes=minutes)
        
        return CompleteEventOut(
            event=updated_event,
            attendance=attendance
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("event.complete.error", event_id=event_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete event: {str(e)}"
        )


@router.post("/{event_id}/outcome", response_model=OutcomeOut)
async def save_outcome(
    event_id: str,
    body: OutcomeInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Save or update an outcome report for a completed event.
    
    Body includes:
    - rating (1-5, optional)
    - grade (text, optional)
    - note (text, optional)
    - strengths (array of strings)
    - struggles (array of strings)
    
    Upserts into event_outcomes table (one outcome per event).
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    supabase = get_admin_client()
    
    try:
        # Load event and verify family access
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
        
        # Prepare outcome data
        outcome_data = {
            "family_id": family_id,
            "child_id": event["child_id"],
            "subject_id": event.get("subject_id"),
            "event_id": event_id,
            "rating": body.rating,
            "grade": body.grade,
            "note": body.note,
            "strengths": body.strengths or [],
            "struggles": body.struggles or [],
            "created_by": user["id"]
        }
        
        # Upsert outcome (unique constraint on event_id)
        outcome_res = supabase.table("event_outcomes").upsert(
            outcome_data,
            on_conflict="event_id"
        ).execute()
        
        if not outcome_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save outcome"
            )
        
        outcome = outcome_res.data[0] if isinstance(outcome_res.data, list) else outcome_res.data
        
        log_event("event.outcome.saved", event_id=event_id, family_id=family_id, has_rating=body.rating is not None, has_strengths=len(body.strengths or []) > 0, has_struggles=len(body.struggles or []) > 0)
        
        return OutcomeOut(
            id=outcome["id"],
            event_id=event_id,
            rating=outcome.get("rating"),
            grade=outcome.get("grade"),
            note=outcome.get("note"),
            strengths=outcome.get("strengths", []),
            struggles=outcome.get("struggles", []),
            created_at=outcome["created_at"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("event.outcome.error", event_id=event_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save outcome: {str(e)}"
        )

