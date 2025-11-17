"""
FastAPI routes for LLM-powered syllabus parsing and plan suggestions
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from routers.util import (
    get_file_text_from_storage,
    load_planning_context,
    persist_ai_plan,
    apply_ai_plan_changes,
    util_save_outline
)
from llm import llm_extract_outline, llm_suggest_plan

router = APIRouter(prefix="/llm", tags=["llm"])

class ParseSyllabusBody(BaseModel):
    syllabus_id: str
    storage_bucket: str = "syllabi"
    storage_path: str  # e.g. "family123/chem.pdf"
    family_id: str
    child_id: Optional[str] = None

@router.post("/parse-syllabus")
async def parse_syllabus(body: ParseSyllabusBody):
    """Parse syllabus PDF/text and extract structured outline"""
    try:
        # Fetch file from storage
        text = await get_file_text_from_storage(body.storage_bucket, body.storage_path)
        
        # Extract outline using LLM
        outline = await llm_extract_outline(text)
        
        # Persist outline
        saved = await util_save_outline(body.syllabus_id, outline)
        
        return {
            "sections": saved.get("sections_count", 0),
            "outline": outline,
            "saved": saved.get("saved", False)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse syllabus: {str(e)}")

class SuggestPlanBody(BaseModel):
    family_id: str
    week_start: str  # YYYY-MM-DD
    child_ids: List[str]
    horizon_weeks: int = Field(default=2, ge=1, le=4)
    reason: str = "rebalance"

@router.post("/suggest-plan", status_code=200)
async def suggest_plan(body: SuggestPlanBody):
    """Generate AI plan proposal (does not apply changes)"""
    try:
        # Load planning context
        context = await load_planning_context(
            family_id=body.family_id,
            week_start=body.week_start,
            child_ids=body.child_ids,
            horizon_weeks=body.horizon_weeks
        )
        
        # Get LLM suggestion
        proposal = await llm_suggest_plan(context)
        
        # Persist plan
        plan_id, counts, persisted_changes = await persist_ai_plan(
            family_id=body.family_id,
            week_start=body.week_start,
            scope={
                "childIds": body.child_ids,
                "horizonWeeks": body.horizon_weeks,
                "reason": body.reason
            },
            proposal=proposal
        )
        
        return {
            "planId": plan_id,
            "summary": counts,
            "proposal": proposal,
            "changes": persisted_changes  # Include persisted changes with database IDs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to suggest plan: {str(e)}")

class Approval(BaseModel):
    change_id: str
    approved: bool
    edits: Optional[Dict[str, Any]] = None

class ApproveBody(BaseModel):
    plan_id: str
    approvals: List[Approval]

@router.patch("/approve")
async def approve_changes(body: ApproveBody):
    """Approve and apply plan changes atomically"""
    try:
        # Convert Pydantic models to dictionaries (Pydantic v2 uses model_dump())
        approvals_dict = [a.model_dump() for a in body.approvals]
        result = await apply_ai_plan_changes(body.plan_id, approvals_dict)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve changes: {str(e)}")

