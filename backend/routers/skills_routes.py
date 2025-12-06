"""
FastAPI routes for skill tracking and learning map
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
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

router = APIRouter(prefix="/api/skills", tags=["skills"])


class SkillIn(BaseModel):
    name: str = Field(..., description="Skill name")
    description: Optional[str] = Field(None, description="Skill description")
    subject_id: Optional[str] = Field(None, description="Subject ID (optional)")
    category: Optional[str] = Field(None, description="Category: academic, social, executive_function, creative")
    level: Optional[str] = Field(None, description="Level: beginner, intermediate, advanced")
    parent_skill_id: Optional[str] = Field(None, description="Parent skill ID for hierarchies")


class SkillOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    subject_id: Optional[str]
    category: Optional[str]
    level: Optional[str]
    parent_skill_id: Optional[str]
    created_at: str


class SkillEvidenceIn(BaseModel):
    skill_id: str
    child_id: str
    event_id: Optional[str] = None
    event_outcome_id: Optional[str] = None
    upload_id: Optional[str] = None
    material_id: Optional[str] = None
    evidence_type: str = Field(..., description="event, outcome, upload, material, manual")
    proficiency_level: Optional[str] = Field(None, description="beginner, developing, proficient, advanced, expert")
    confidence_score: Optional[int] = Field(None, ge=1, le=5, description="1-5 confidence scale")
    note: Optional[str] = None
    demonstrated_at: Optional[str] = None  # ISO datetime string


class SkillEvidenceOut(BaseModel):
    id: str
    skill_id: str
    child_id: str
    event_id: Optional[str]
    event_outcome_id: Optional[str]
    upload_id: Optional[str]
    material_id: Optional[str]
    evidence_type: str
    proficiency_level: Optional[str]
    confidence_score: Optional[int]
    note: Optional[str]
    demonstrated_at: str
    created_at: str


@router.post("", response_model=SkillOut)
async def create_skill(
    body: SkillIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Create a new skill"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    supabase = get_admin_client()
    
    try:
        skill_data = {
            "family_id": family_id,
            "name": body.name,
            "description": body.description,
            "subject_id": body.subject_id,
            "category": body.category,
            "level": body.level,
            "parent_skill_id": body.parent_skill_id,
            "created_by": user["id"]
        }
        
        result = supabase.table("skills").insert(skill_data).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create skill"
            )
        
        skill = result.data[0]
        log_event("skill.created", user_id=user["id"], skill_id=skill["id"], skill_name=body.name)
        
        return SkillOut(**skill)
    except Exception as e:
        log_event("skill.create_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create skill: {str(e)}"
        )


@router.get("", response_model=List[SkillOut])
async def list_skills(
    subject_id: Optional[str] = Query(None, description="Filter by subject"),
    category: Optional[str] = Query(None, description="Filter by category"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """List skills for the user's family"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    supabase = get_admin_client()
    
    try:
        query = supabase.table("skills").select("*").eq("family_id", family_id)
        
        if subject_id:
            query = query.eq("subject_id", subject_id)
        if category:
            query = query.eq("category", category)
        
        query = query.order("name")
        result = query.execute()
        
        return [SkillOut(**skill) for skill in (result.data or [])]
    except Exception as e:
        log_event("skill.list_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list skills: {str(e)}"
        )


@router.post("/evidence", response_model=SkillEvidenceOut)
async def add_skill_evidence(
    body: SkillEvidenceIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Add evidence linking an event/outcome/upload/material to a skill"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    # Validate child belongs to family
    if not child_belongs_to_family(body.child_id, family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Child not in family"
        )
    
    supabase = get_admin_client()
    
    try:
        # Verify skill exists and belongs to family
        skill_res = supabase.table("skills").select("family_id").eq("id", body.skill_id).single().execute()
        if not skill_res.data or skill_res.data["family_id"] != family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Skill not found"
            )
        
        # Parse demonstrated_at if provided
        demonstrated_at = datetime.now().isoformat()
        if body.demonstrated_at:
            demonstrated_at = body.demonstrated_at
        
        evidence_data = {
            "family_id": family_id,
            "child_id": body.child_id,
            "skill_id": body.skill_id,
            "event_id": body.event_id,
            "event_outcome_id": body.event_outcome_id,
            "upload_id": body.upload_id,
            "material_id": body.material_id,
            "evidence_type": body.evidence_type,
            "proficiency_level": body.proficiency_level,
            "confidence_score": body.confidence_score,
            "note": body.note,
            "demonstrated_at": demonstrated_at,
            "created_by": user["id"]
        }
        
        result = supabase.table("skill_evidence").insert(evidence_data).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create skill evidence"
            )
        
        evidence = result.data[0]
        log_event("skill.evidence.added", user_id=user["id"], skill_id=body.skill_id, child_id=body.child_id, evidence_type=body.evidence_type)
        
        return SkillEvidenceOut(**evidence)
    except HTTPException:
        raise
    except Exception as e:
        log_event("skill.evidence.add_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add skill evidence: {str(e)}"
        )


@router.get("/graph", response_model=List[dict])
async def get_skill_graph(
    child_id: str = Query(..., description="Child ID"),
    subject_id: Optional[str] = Query(None, description="Filter by subject"),
    days_back: int = Query(365, description="Days to look back"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get skill graph data for visualization"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    # Validate child belongs to family
    if not child_belongs_to_family(child_id, family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Child not in family"
        )
    
    supabase = get_admin_client()
    
    try:
        result = supabase.rpc("get_skill_graph_data", {
            "_child_id": child_id,
            "_subject_id": subject_id,
            "_days_back": days_back
        }).execute()
        
        return result.data or []
    except Exception as e:
        log_event("skill.graph.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get skill graph: {str(e)}"
        )


@router.get("/strengths-weaknesses", response_model=List[dict])
async def get_strengths_weaknesses(
    child_id: str = Query(..., description="Child ID"),
    subject_id: Optional[str] = Query(None, description="Filter by subject"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get skill strengths and weaknesses analysis"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    # Validate child belongs to family
    if not child_belongs_to_family(child_id, family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Child not in family"
        )
    
    supabase = get_admin_client()
    
    try:
        result = supabase.rpc("get_skill_strengths_weaknesses", {
            "_child_id": child_id,
            "_subject_id": subject_id
        }).execute()
        
        return result.data or []
    except Exception as e:
        log_event("skill.strengths_weaknesses.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get strengths/weaknesses: {str(e)}"
        )


@router.get("/heatmap", response_model=List[dict])
async def get_skill_heatmap(
    child_id: str = Query(..., description="Child ID"),
    subject_id: Optional[str] = Query(None, description="Filter by subject"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    group_by: str = Query("week", description="Group by: week or month"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get skill heatmap data showing mastery over time"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    # Validate child belongs to family
    if not child_belongs_to_family(child_id, family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Child not in family"
        )
    
    supabase = get_admin_client()
    
    try:
        # Default to last 90 days if not specified
        from datetime import datetime, timedelta
        if not start_date:
            start_date = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        
        result = supabase.rpc("get_skill_heatmap_data", {
            "_child_id": child_id,
            "_subject_id": subject_id,
            "_start_date": start_date,
            "_end_date": end_date,
            "_group_by": group_by
        }).execute()
        
        log_event("skill.heatmap.success", user_id=user["id"], child_id=child_id)
        return result.data or []
    except Exception as e:
        log_event("skill.heatmap.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get skill heatmap: {str(e)}"
        )


@router.get("/evidence", response_model=List[SkillEvidenceOut])
async def list_skill_evidence(
    child_id: Optional[str] = Query(None, description="Filter by child"),
    skill_id: Optional[str] = Query(None, description="Filter by skill"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """List skill evidence"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found"
        )
    
    supabase = get_admin_client()
    
    try:
        query = supabase.table("skill_evidence").select("*").eq("family_id", family_id)
        
        if child_id:
            query = query.eq("child_id", child_id)
        if skill_id:
            query = query.eq("skill_id", skill_id)
        
        query = query.order("demonstrated_at", desc=True)
        result = query.execute()
        
        return [SkillEvidenceOut(**evidence) for evidence in (result.data or [])]
    except Exception as e:
        log_event("skill.evidence.list_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list skill evidence: {str(e)}"
        )

