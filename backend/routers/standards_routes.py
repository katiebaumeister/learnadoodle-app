"""
FastAPI routes for Standards-Based AI Planning
Handles standards selection, curriculum mapping, coverage tracking, and AI planning
"""
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import date

# Add parent directory to path for imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

try:
    from supabase_client import get_admin_client
    from auth import get_current_user, rate_limiter
    from helpers import get_family_id_for_user
    from logger import log_event
except ImportError:
    # Fallback for different import styles
    import importlib.util
    spec = importlib.util.spec_from_file_location("supabase_client", backend_dir / "supabase_client.py")
    supabase_client = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(supabase_client)
    get_admin_client = supabase_client.get_admin_client
    
    spec = importlib.util.spec_from_file_location("auth", backend_dir / "auth.py")
    auth_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(auth_module)
    get_current_user = auth_module.get_current_user
    rate_limiter = auth_module.rate_limiter
    
    spec = importlib.util.spec_from_file_location("helpers", backend_dir / "helpers.py")
    helpers_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers_module)
    get_family_id_for_user = helpers_module.get_family_id_for_user
    
    spec = importlib.util.spec_from_file_location("logger", backend_dir / "logger.py")
    logger_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(logger_module)
    log_event = logger_module.log_event

try:
    from llm import llm_plan_standards
except (ImportError, AttributeError):
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("llm", backend_dir / "llm.py")
        llm_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(llm_module)
        llm_plan_standards = getattr(llm_module, 'llm_plan_standards', None)
    except (ImportError, AttributeError):
        llm_plan_standards = None

router = APIRouter(prefix="/api/standards", tags=["standards"])


# ============================================================================
# Pydantic Models
# ============================================================================

class StandardOut(BaseModel):
    id: str
    state_code: str
    grade_level: str
    subject: str
    domain: Optional[str]
    standard_code: str
    standard_text: str
    learning_objectives: Optional[Dict[str, Any]]
    prerequisites: Optional[List[str]]
    estimated_hours: Optional[float]
    difficulty_level: Optional[str]


class UserStandardsPreferenceIn(BaseModel):
    child_id: str
    state_code: str
    grade_level: str
    subject_id: Optional[str] = None
    standards_set: Optional[str] = None


class UserStandardsPreferenceOut(BaseModel):
    id: str
    child_id: str
    state_code: str
    grade_level: str
    subject_id: Optional[str]
    standards_set: Optional[str]
    is_active: bool


class CurriculumMappingIn(BaseModel):
    child_id: str
    subject_id: Optional[str] = None
    event_id: Optional[str] = None
    standard_id: str
    mapping_type: str = Field(..., description="full, partial, or prerequisite")
    notes: Optional[str] = None


class StandardsCoverageIn(BaseModel):
    child_id: str
    standard_id: str
    event_id: Optional[str] = None
    outcome_id: Optional[str] = None
    coverage_status: str = Field(..., description="introduced, practiced, mastered, or assessed")
    coverage_date: Optional[date] = None
    evidence: Optional[str] = None


class CoveragePercentageOut(BaseModel):
    total_standards: int
    covered_standards: int
    coverage_percentage: float


class StandardsGapOut(BaseModel):
    standard_id: str
    standard_code: str
    standard_text: str
    subject: str
    estimated_hours: Optional[float]
    prerequisites: Optional[List[str]]


class AIPlanningSuggestionOut(BaseModel):
    standard_id: str
    standard_code: str
    standard_text: str
    subject: str
    suggested_events: List[Dict[str, Any]]
    priority: str
    estimated_hours: float


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/", response_model=List[StandardOut])
async def get_standards(
    state_code: str = Query(..., description="State code (e.g., 'VA', 'GA')"),
    grade_level: str = Query(..., description="Grade level (e.g., '4', 'K', '1-3')"),
    subject: Optional[str] = Query(None, description="Subject filter (e.g., 'Math', 'ELA')"),
    domain: Optional[str] = Query(None, description="Domain filter (e.g., 'Number and Number Sense')"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get standards for a specific state, grade, and optional subject/domain"""
    try:
        supabase = get_admin_client()
        
        query = (
            supabase.table("standards")
            .select("*")
            .eq("state_code", state_code.upper())
            .eq("grade_level", grade_level)
        )
        
        if subject:
            query = query.eq("subject", subject)
        if domain:
            query = query.eq("domain", domain)
        
        query = query.order("standard_code")
        
        result = query.execute()
        
        if result.data:
            return result.data
        return []
        
    except Exception as e:
        log_event("standards.get.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get standards: {str(e)}"
        )


@router.get("/preferences", response_model=List[UserStandardsPreferenceOut])
async def get_user_preferences(
    child_id: Optional[str] = Query(None, description="Filter by child ID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get standards preferences for user's children"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        query = (
            supabase.table("user_standards_preferences")
            .select("*")
            .eq("family_id", family_id)
        )
        
        if child_id:
            query = query.eq("child_id", child_id)
        else:
            # Get all children in family
            children_res = supabase.table("children").select("id").eq("family_id", family_id).execute()
            child_ids = [c["id"] for c in (children_res.data or [])]
            if child_ids:
                query = query.in_("child_id", child_ids)
            else:
                return []
        
        query = query.eq("is_active", True).order("created_at", desc=True)
        
        result = query.execute()
        return result.data or []
        
    except Exception as e:
        log_event("standards.preferences.get.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get preferences: {str(e)}"
        )


@router.post("/preferences", response_model=UserStandardsPreferenceOut)
async def set_user_preference(
    preference: UserStandardsPreferenceIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Set or update standards preference for a child"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id").eq("id", preference.child_id).maybe_single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child not found or access denied")
        
        # Deactivate any existing active preference for this child/subject/state/grade
        if preference.subject_id:
            deactivate_res = (
                supabase.table("user_standards_preferences")
                .update({"is_active": False})
                .eq("child_id", preference.child_id)
                .eq("state_code", preference.state_code)
                .eq("grade_level", preference.grade_level)
                .eq("subject_id", preference.subject_id)
                .eq("is_active", True)
                .execute()
            )
        else:
            # If no subject_id, deactivate all for this child/state/grade
            deactivate_res = (
                supabase.table("user_standards_preferences")
                .update({"is_active": False})
                .eq("child_id", preference.child_id)
                .eq("state_code", preference.state_code)
                .eq("grade_level", preference.grade_level)
                .eq("is_active", True)
                .execute()
            )
        
        # Insert or update preference
        insert_data = {
            "family_id": family_id,
            "child_id": preference.child_id,
            "state_code": preference.state_code.upper(),
            "grade_level": preference.grade_level,
            "subject_id": preference.subject_id,
            "standards_set": preference.standards_set,
            "is_active": True,
        }
        
        # Use upsert to handle unique constraint
        result = (
            supabase.table("user_standards_preferences")
            .upsert(insert_data, on_conflict="child_id,state_code,grade_level,subject_id")
            .execute()
        )
        
        if result.data:
            log_event("standards.preference.set", user_id=user["id"], child_id=preference.child_id, state_code=preference.state_code)
            return result.data[0]
        
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to set preference")
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("standards.preference.set.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set preference: {str(e)}"
        )


@router.get("/coverage", response_model=CoveragePercentageOut)
async def get_coverage_percentage(
    child_id: str = Query(..., description="Child ID"),
    state_code: str = Query(..., description="State code"),
    grade_level: str = Query(..., description="Grade level"),
    subject: Optional[str] = Query(None, description="Subject filter"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get coverage percentage for a child's standards"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id").eq("id", child_id).maybe_single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child not found or access denied")
        
        # Call the RPC function
        result = supabase.rpc(
            "get_standards_coverage_percentage",
            {
                "p_child_id": child_id,
                "p_state_code": state_code.upper(),
                "p_grade_level": grade_level,
                "p_subject": subject,
            }
        ).execute()
        
        if result.data and len(result.data) > 0:
            data = result.data[0]
            return CoveragePercentageOut(
                total_standards=int(data.get("total_standards", 0)),
                covered_standards=int(data.get("covered_standards", 0)),
                coverage_percentage=float(data.get("coverage_percentage", 0.0))
            )
        
        return CoveragePercentageOut(total_standards=0, covered_standards=0, coverage_percentage=0.0)
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("standards.coverage.get.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get coverage: {str(e)}"
        )


@router.get("/gaps", response_model=List[StandardsGapOut])
async def get_standards_gaps(
    child_id: str = Query(..., description="Child ID"),
    state_code: str = Query(..., description="State code"),
    grade_level: str = Query(..., description="Grade level"),
    subject: Optional[str] = Query(None, description="Subject filter"),
    limit: int = Query(10, description="Maximum number of gaps to return"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get uncovered standards (gaps) for AI planning"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id").eq("id", child_id).maybe_single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child not found or access denied")
        
        # Call the RPC function
        result = supabase.rpc(
            "get_standards_gaps",
            {
                "p_child_id": child_id,
                "p_state_code": state_code.upper(),
                "p_grade_level": grade_level,
                "p_subject": subject,
                "p_limit": limit,
            }
        ).execute()
        
        if result.data:
            return result.data
        return []
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("standards.gaps.get.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get gaps: {str(e)}"
        )


@router.post("/mapping", response_model=Dict[str, Any])
async def create_curriculum_mapping(
    mapping: CurriculumMappingIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Map curriculum (subject/event) to a standard"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id").eq("id", mapping.child_id).maybe_single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child not found or access denied")
        
        # Verify standard exists
        standard_res = supabase.table("standards").select("id").eq("id", mapping.standard_id).maybe_single().execute()
        if not standard_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Standard not found")
        
        insert_data = {
            "family_id": family_id,
            "child_id": mapping.child_id,
            "subject_id": mapping.subject_id,
            "event_id": mapping.event_id,
            "standard_id": mapping.standard_id,
            "mapping_type": mapping.mapping_type,
            "notes": mapping.notes,
            "created_by": user["id"],
        }
        
        result = supabase.table("curriculum_standards_mapping").insert(insert_data).execute()
        
        if result.data:
            log_event("standards.mapping.create", user_id=user["id"], child_id=mapping.child_id, standard_id=mapping.standard_id)
            return result.data[0]
        
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create mapping")
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("standards.mapping.create.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create mapping: {str(e)}"
        )


@router.post("/coverage", response_model=Dict[str, Any])
async def record_coverage(
    coverage: StandardsCoverageIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Record that a standard has been covered"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id").eq("id", coverage.child_id).maybe_single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child not found or access denied")
        
        # Verify standard exists
        standard_res = supabase.table("standards").select("id").eq("id", coverage.standard_id).maybe_single().execute()
        if not standard_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Standard not found")
        
        insert_data = {
            "family_id": family_id,
            "child_id": coverage.child_id,
            "standard_id": coverage.standard_id,
            "event_id": coverage.event_id,
            "outcome_id": coverage.outcome_id,
            "coverage_status": coverage.coverage_status,
            "coverage_date": coverage.coverage_date.isoformat() if coverage.coverage_date else date.today().isoformat(),
            "evidence": coverage.evidence,
            "created_by": user["id"],
        }
        
        result = supabase.table("standards_coverage").insert(insert_data).execute()
        
        if result.data:
            # Refresh gap analysis materialized view
            try:
                supabase.rpc("refresh_standards_gap_analysis").execute()
            except:
                pass  # Non-critical if refresh fails
            
            log_event("standards.coverage.record", user_id=user["id"], child_id=coverage.child_id, standard_id=coverage.standard_id)
            return result.data[0]
        
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to record coverage")
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("standards.coverage.record.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record coverage: {str(e)}"
        )


@router.post("/ai/plan", response_model=Dict[str, Any])
async def ai_plan_standards(
    child_id: str = Query(..., description="Child ID"),
    state_code: str = Query(..., description="State code"),
    grade_level: str = Query(..., description="Grade level"),
    subject: Optional[str] = Query(None, description="Subject filter"),
    limit: int = Query(10, description="Maximum number of gaps to analyze"),
    available_hours_per_week: Optional[float] = Query(20, description="Available hours per week"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """AI-powered planning: Analyze gaps and suggest curriculum to fill standards"""
    if not llm_plan_standards:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI planning not available"
        )
    
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id, first_name").eq("id", child_id).maybe_single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child not found or access denied")
        
        child_name = child_res.data.get("first_name", "the student")
        
        # Get gaps
        gaps_result = supabase.rpc(
            "get_standards_gaps",
            {
                "p_child_id": child_id,
                "p_state_code": state_code.upper(),
                "p_grade_level": grade_level,
                "p_subject": subject,
                "p_limit": limit,
            }
        ).execute()
        
        gaps = gaps_result.data or []
        
        if not gaps:
            return {
                "suggestions": [],
                "summary": f"Great news! {child_name} has covered all standards for {state_code} grade {grade_level}" + (f" {subject}" if subject else "")
            }
        
        # Get child's current subjects
        subjects_res = supabase.table("subject").select("name").eq("family_id", family_id).execute()
        current_subjects = [s["name"] for s in (subjects_res.data or [])]
        
        # Get child preferences (learning style, etc.) if available
        prefs_res = supabase.table("child_prefs").select("learning_style").eq("child_id", child_id).maybe_single().execute()
        preferred_learning_style = prefs_res.data.get("learning_style") if prefs_res.data else None
        
        # Build context for LLM
        context = {
            "gaps": gaps,
            "child_name": child_name,
            "current_subjects": current_subjects,
            "available_hours_per_week": available_hours_per_week,
            "preferred_learning_style": preferred_learning_style,
            "state_code": state_code,
            "grade_level": grade_level,
            "subject": subject,
        }
        
        # Call LLM
        result = await llm_plan_standards(context)
        
        log_event("standards.ai.plan", user_id=user["id"], child_id=child_id, gaps_count=len(gaps))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("standards.ai.plan.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate AI plan: {str(e)}"
        )

