"""
FastAPI routes for compliance and readiness tracking
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
from helpers import get_family_id_for_user
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/compliance", tags=["compliance"])


# ============================================================
# Request/Response Models
# ============================================================

class ComplianceReadinessOut(BaseModel):
    child_id: str
    child_name: str
    attendance_minutes_this_year: int = 0
    attendance_days_this_year: int = 0
    credits_by_subject: Dict[str, float] = Field(default_factory=dict)
    portfolio_artifacts_this_year: int = 0
    portfolio_by_subject: Dict[str, int] = Field(default_factory=dict)
    compliance_status: Dict[str, Any] = Field(default_factory=dict)


class ChecklistItemOut(BaseModel):
    id: str
    family_id: str
    child_id: Optional[str]
    state_code: str
    requirement_id: Optional[str]
    status: str
    completed_at: Optional[datetime]
    notes: Optional[str]
    requirement: Optional[Dict[str, Any]] = None


class ExportPacketOut(BaseModel):
    export_url: str
    generated_at: datetime
    includes: List[str]


# ============================================================
# Routes
# ============================================================

@router.get("/readiness/{child_id}", response_model=ComplianceReadinessOut)
async def get_compliance_readiness(
    child_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get compliance readiness metrics for a child.
    """
    try:
        supabase = get_admin_client()
        
        # Verify access to child
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family not found"
            )
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, first_name, family_id").eq("id", child_id).single().execute()
        if not child_res.data or child_res.data.get("family_id") != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child not accessible"
            )
        
        # Get readiness from view
        readiness_res = supabase.table("compliance_readiness").select("*").eq("child_id", child_id).maybe_single().execute()
        
        if not readiness_res.data:
            return ComplianceReadinessOut(
                child_id=child_id,
                child_name=child_res.data.get("first_name", ""),
            )
        
        data = readiness_res.data
        
        # Parse JSONB fields
        credits_by_subject = {}
        if data.get("credits_by_subject"):
            try:
                credits_by_subject = data["credits_by_subject"] if isinstance(data["credits_by_subject"], dict) else {}
            except:
                credits_by_subject = {}
        
        portfolio_by_subject = {}
        if data.get("portfolio_by_subject"):
            try:
                portfolio_by_subject = data["portfolio_by_subject"] if isinstance(data["portfolio_by_subject"], dict) else {}
            except:
                portfolio_by_subject = {}
        
        compliance_status = {}
        if data.get("compliance_status"):
            try:
                compliance_status = data["compliance_status"] if isinstance(data["compliance_status"], dict) else {}
            except:
                compliance_status = {}
        
        return ComplianceReadinessOut(
            child_id=data.get("child_id", child_id),
            child_name=data.get("child_name", child_res.data.get("first_name", "")),
            attendance_minutes_this_year=data.get("attendance_minutes_this_year", 0) or 0,
            attendance_days_this_year=data.get("attendance_days_this_year", 0) or 0,
            credits_by_subject=credits_by_subject,
            portfolio_artifacts_this_year=data.get("portfolio_artifacts_this_year", 0) or 0,
            portfolio_by_subject=portfolio_by_subject,
            compliance_status=compliance_status,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("compliance.readiness.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch compliance readiness: {str(e)}"
        )


@router.get("/checklist/{child_id}", response_model=List[ChecklistItemOut])
async def get_compliance_checklist(
    child_id: str,
    state_code: str = Query("US", description="State code for requirements"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get compliance checklist for a child.
    """
    try:
        supabase = get_admin_client()
        
        # Verify access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family not found")
        
        # Get checklist items
        checklist_res = supabase.table("family_compliance_checklist").select(
            "*, requirement:requirement_id(*)"
        ).eq("child_id", child_id).eq("state_code", state_code).execute()
        
        items = []
        for item in (checklist_res.data or []):
            requirement = item.get("requirement") or {}
            items.append(ChecklistItemOut(
                id=item["id"],
                family_id=item["family_id"],
                child_id=item.get("child_id"),
                state_code=item["state_code"],
                requirement_id=item.get("requirement_id"),
                status=item.get("status", "pending"),
                completed_at=item.get("completed_at"),
                notes=item.get("notes"),
                requirement=requirement,
            ))
        
        return items
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("compliance.checklist.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch checklist: {str(e)}"
        )


@router.post("/checklist/{item_id}/update")
async def update_checklist_item(
    item_id: str,
    status: str = Query(..., description="New status: pending, in_progress, completed, not_applicable"),
    notes: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Update a checklist item status.
    """
    try:
        supabase = get_admin_client()
        
        # Verify access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family not found")
        
        # Verify item belongs to family
        item_res = supabase.table("family_compliance_checklist").select("family_id").eq("id", item_id).single().execute()
        if not item_res.data or item_res.data.get("family_id") != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Item not accessible")
        
        # Update item
        update_data = {
            "status": status,
            "updated_at": datetime.now().isoformat(),
        }
        if status == "completed":
            update_data["completed_at"] = datetime.now().isoformat()
        if notes:
            update_data["notes"] = notes
        
        supabase.table("family_compliance_checklist").update(update_data).eq("id", item_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("compliance.checklist.update.error", user_id=user["id"], item_id=item_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update checklist: {str(e)}"
        )


@router.post("/export/{child_id}", response_model=ExportPacketOut)
async def export_compliance_packet(
    child_id: str,
    include_portfolio: bool = Query(True),
    include_transcript: bool = Query(True),
    include_attendance: bool = Query(True),
    include_syllabus: bool = Query(True),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate export packet for compliance documentation.
    TODO: Implement actual PDF generation and storage
    """
    try:
        supabase = get_admin_client()
        
        # Verify access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family not found")
        
        # For now, return placeholder
        # TODO: Generate PDF with:
        # - Portfolio artifacts
        # - Transcript summary
        # - Attendance records
        # - Syllabus summary
        # Upload to storage and return URL
        
        includes = []
        if include_portfolio:
            includes.append("portfolio")
        if include_transcript:
            includes.append("transcript")
        if include_attendance:
            includes.append("attendance")
        if include_syllabus:
            includes.append("syllabus")
        
        # Placeholder URL
        export_url = f"/api/compliance/exports/{child_id}/{datetime.now().timestamp()}.pdf"
        
        return ExportPacketOut(
            export_url=export_url,
            generated_at=datetime.now(),
            includes=includes,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("compliance.export.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate export: {str(e)}"
        )

