"""
FastAPI routes for tutor collaboration flows
Part of Student Mode & Compliance Features
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
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
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


# ============================================================
# Request/Response Models
# ============================================================

class TutorPlanProposalIn(BaseModel):
    family_id: str
    child_id: str
    title: str
    description: Optional[str] = None
    proposed_events: List[Dict[str, Any]] = Field(default_factory=list)  # List of event proposals
    notes: Optional[str] = None


class TutorPlanProposalOut(BaseModel):
    id: str
    family_id: str
    child_id: str
    tutor_id: str
    title: str
    status: str  # 'pending', 'approved', 'rejected'
    created_at: datetime
    proposed_events_count: int


class TutorOutcomeLogIn(BaseModel):
    event_id: str
    child_id: str
    rating: Optional[int] = Field(None, ge=1, le=5)
    note: Optional[str] = None
    strengths: List[str] = Field(default_factory=list)
    struggles: List[str] = Field(default_factory=list)


# ============================================================
# Routes
# ============================================================

@router.post("/propose_plan", response_model=TutorPlanProposalOut)
async def propose_plan(
    body: TutorPlanProposalIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Tutor proposes a plan for a child. Parent must approve before events are created.
    """
    try:
        supabase = get_admin_client()
        
        # Verify user is a tutor for this family
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family access denied")
        
        # Check tutor role
        member_res = supabase.table("family_members").select("*").eq("user_id", user["id"]).eq("family_id", body.family_id).maybe_single().execute()
        if not member_res.data or member_res.data.get("member_role") != "tutor":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tutor role required")
        
        # Verify child access
        child_scope = member_res.data.get("child_scope") or []
        if body.child_id not in child_scope:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child not in tutor scope")
        
        # Create proposal (stored as draft events or in a proposals table)
        # For now, we'll create a simple proposal record
        # In a full implementation, you'd have a tutor_proposals table
        proposal_data = {
            "family_id": body.family_id,
            "child_id": body.child_id,
            "tutor_id": user["id"],
            "title": body.title,
            "description": body.description,
            "proposed_events": body.proposed_events,
            "notes": body.notes,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
        }
        
        # Store in a simple JSONB field or create proper table
        # For MVP, we'll use a generic proposals approach
        # TODO: Create tutor_proposals table for proper proposal management
        
        log_event("tutor.propose_plan", user_id=user["id"], child_id=body.child_id, events_count=len(body.proposed_events))
        
        # Return mock response for now - full implementation would create proposal record
        return TutorPlanProposalOut(
            id="proposal_" + str(datetime.now().timestamp()),
            family_id=body.family_id,
            child_id=body.child_id,
            tutor_id=user["id"],
            title=body.title,
            status="pending",
            created_at=datetime.now(),
            proposed_events_count=len(body.proposed_events)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("tutor.propose_plan.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to propose plan: {str(e)}"
        )


@router.post("/log_outcome", response_model=Dict[str, Any])
async def log_outcome(
    body: TutorOutcomeLogIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Tutor logs outcome for a completed event (rating, notes, strengths/struggles).
    """
    try:
        supabase = get_admin_client()
        
        # Verify tutor access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family not found")
        
        # Get event to verify access
        event_res = supabase.table("events").select("family_id, child_id").eq("id", body.event_id).single().execute()
        if not event_res.data or event_res.data.get("family_id") != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Event not accessible")
        
        # Check tutor role and child scope
        member_res = supabase.table("family_members").select("*").eq("user_id", user["id"]).eq("family_id", family_id).maybe_single().execute()
        if member_res.data:
            child_scope = member_res.data.get("child_scope") or []
            if body.child_id not in child_scope and member_res.data.get("member_role") == "tutor":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child not in tutor scope")
        
        # Create or update event_outcome
        outcome_data = {
            "family_id": family_id,
            "child_id": body.child_id,
            "event_id": body.event_id,
            "rating": body.rating,
            "note": body.note,
            "strengths": body.strengths if body.strengths else None,
            "struggles": body.struggles if body.struggles else None,
            "created_by": user["id"],
        }
        
        # Upsert outcome
        outcome_res = supabase.table("event_outcomes").upsert(
            outcome_data,
            on_conflict="event_id"
        ).execute()
        
        log_event("tutor.log_outcome", user_id=user["id"], event_id=body.event_id)
        
        return {"success": True, "outcome_id": outcome_res.data[0]["id"] if outcome_res.data else None}
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("tutor.log_outcome.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log outcome: {str(e)}"
        )

