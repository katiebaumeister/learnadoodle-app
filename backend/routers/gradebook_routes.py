"""
FastAPI routes for Gradebook and Mastery Intelligence Hub
Handles gradebook categories, assignment scoring, skill-based grading, 
parent review workflow, standards coverage analytics, and progress estimation
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import date, datetime
from pathlib import Path
import sys

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/gradebook", tags=["gradebook"])


# ============================================================================
# Pydantic Models
# ============================================================================

class RubricIn(BaseModel):
    title: str
    description: Optional[str] = None
    criteria: List[Dict[str, Any]] = Field(default_factory=list)
    total_points: float = 100


class RubricOut(BaseModel):
    id: str
    family_id: str
    title: str
    description: Optional[str]
    criteria: List[Dict[str, Any]]
    total_points: float
    created_at: str
    updated_at: str


class GradebookCategoryIn(BaseModel):
    child_id: str
    subject_id: Optional[str] = None
    name: str
    weight: float = Field(ge=0, le=1)
    display_order: int = 0


class GradebookCategoryOut(BaseModel):
    id: str
    family_id: str
    child_id: str
    subject_id: Optional[str]
    name: str
    weight: float
    display_order: int
    created_at: str
    updated_at: str


class AssignmentScoreIn(BaseModel):
    assignment_id: str
    score: float = Field(ge=0, le=100)
    max_score: Optional[float] = 100
    rubric_id: Optional[str] = None
    rubric_scores: Optional[Dict[str, float]] = None  # {criterion_id: score}


class SkillGradeIn(BaseModel):
    child_id: str
    skill: str
    subject_id: Optional[str] = None
    assignment_id: Optional[str] = None
    lesson_id: Optional[str] = None
    level: float = Field(ge=0, le=5)
    evidence_id: Optional[str] = None
    notes: Optional[str] = None


class SkillGradeOut(BaseModel):
    id: str
    family_id: str
    child_id: str
    skill: str
    subject_id: Optional[str]
    assignment_id: Optional[str]
    lesson_id: Optional[str]
    level: float
    evidence_id: Optional[str]
    notes: Optional[str]
    created_at: str
    updated_at: str


class AssignmentReviewIn(BaseModel):
    assignment_id: str
    review_status: str = Field(..., pattern="^(approved|rejected|needs_revision)$")
    rating: Optional[int] = Field(None, ge=1, le=5)
    feedback: Optional[str] = None
    rubric_scores: Optional[Dict[str, float]] = None


class StandardsCoverageAnalyticsOut(BaseModel):
    child_id: str
    standard_id: str
    state_code: str
    grade_level: str
    subject: str
    standard_code: str
    standard_text: str
    lessons_covering_count: int
    mastery_records_count: int
    is_mastered: bool
    highest_score: Optional[int]
    last_assessed_at: Optional[str]


class ProgressEstimationOut(BaseModel):
    id: str
    child_id: str
    subject_id: Optional[str]
    estimation_type: str
    estimated_completion_date: Optional[date]
    estimated_completion_percentage: Optional[float]
    confidence_score: Optional[float]
    factors: Dict[str, Any]
    calculated_at: str


# ============================================================================
# Rubrics Endpoints
# ============================================================================

@router.post("/rubrics", response_model=RubricOut)
async def create_rubric(
    input: RubricIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Create a new rubric"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        rubric_data = {
            "family_id": family_id,
            "title": input.title,
            "description": input.description,
            "criteria": input.criteria,
            "total_points": input.total_points,
            "created_by": user["id"]
        }
        
        result = supabase.table("rubrics").insert(rubric_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create rubric")
        
        log_event("gradebook.rubric.created", user_id=user["id"], rubric_id=result.data[0]["id"])
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("gradebook.rubric.create.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error creating rubric: {str(e)}")


@router.get("/rubrics", response_model=List[RubricOut])
async def get_rubrics(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get all rubrics for the user's family"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        result = supabase.table("rubrics").select("*").eq("family_id", family_id).order("created_at", desc=True).execute()
        
        return result.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching rubrics: {str(e)}")


@router.put("/rubrics/{rubric_id}", response_model=RubricOut)
async def update_rubric(
    rubric_id: str,
    input: RubricIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Update a rubric"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify rubric belongs to family
        check = supabase.table("rubrics").select("id").eq("id", rubric_id).eq("family_id", family_id).single().execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Rubric not found")
        
        update_data = {
            "title": input.title,
            "description": input.description,
            "criteria": input.criteria,
            "total_points": input.total_points,
            "updated_at": "now()"
        }
        
        result = supabase.table("rubrics").update(update_data).eq("id", rubric_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update rubric")
        
        log_event("gradebook.rubric.updated", user_id=user["id"], rubric_id=rubric_id)
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating rubric: {str(e)}")


# ============================================================================
# Gradebook Categories Endpoints
# ============================================================================

@router.post("/categories", response_model=GradebookCategoryOut)
async def create_category(
    input: GradebookCategoryIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Create a new gradebook category"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Verify child belongs to family
        if not child_belongs_to_family(input.child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not found")
        
        category_data = {
            "family_id": family_id,
            "child_id": input.child_id,
            "subject_id": input.subject_id,
            "name": input.name,
            "weight": input.weight,
            "display_order": input.display_order,
            "created_by": user["id"]
        }
        
        result = supabase.table("gradebook_categories").insert(category_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create category")
        
        log_event("gradebook.category.created", user_id=user["id"], category_id=result.data[0]["id"])
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating category: {str(e)}")


@router.get("/categories", response_model=List[GradebookCategoryOut])
async def get_categories(
    child_id: Optional[str] = Query(None),
    subject_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get gradebook categories"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        query = supabase.table("gradebook_categories").select("*").eq("family_id", family_id)
        
        if child_id:
            query = query.eq("child_id", child_id)
        if subject_id:
            query = query.eq("subject_id", subject_id)
        
        result = query.order("display_order").order("name").execute()
        
        return result.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching categories: {str(e)}")


@router.get("/calculate/{child_id}", response_model=Dict[str, Any])
async def calculate_gradebook_grade(
    child_id: str,
    subject_id: Optional[str] = Query(None),
    term_label: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Calculate gradebook grade with categories"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not found")
        
        # Call the database function
        result = supabase.rpc(
            "calculate_gradebook_grade",
            {
                "p_child_id": child_id,
                "p_subject_id": subject_id,
                "p_term_label": term_label
            }
        ).execute()
        
        return result.data if result.data else {}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating grade: {str(e)}")


# ============================================================================
# Assignment Scoring Endpoints
# ============================================================================

@router.post("/assignments/score", response_model=Dict[str, Any])
async def score_assignment(
    input: AssignmentScoreIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Score an assignment"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify assignment belongs to family
        assignment_check = supabase.table("assignments").select("id, family_id").eq("id", input.assignment_id).single().execute()
        if not assignment_check.data or assignment_check.data["family_id"] != family_id:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        update_data = {
            "score": input.score,
            "max_score": input.max_score or 100,
            "rubric_id": input.rubric_id,
            "updated_at": "now()"
        }
        
        result = supabase.table("assignments").update(update_data).eq("id", input.assignment_id).execute()
        
        # If there's a grade record linked, update it too
        if result.data:
            grade_check = supabase.table("grades").select("id").eq("assignment_id", input.assignment_id).maybe_single().execute()
            if grade_check.data:
                supabase.table("grades").update({
                    "score": input.score
                }).eq("id", grade_check.data["id"]).execute()
        
        log_event("gradebook.assignment.scored", user_id=user["id"], assignment_id=input.assignment_id)
        return {"success": True, "assignment": result.data[0] if result.data else None}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error scoring assignment: {str(e)}")


# ============================================================================
# Skill-Based Grading Endpoints
# ============================================================================

@router.post("/skills", response_model=SkillGradeOut)
async def create_skill_grade(
    input: SkillGradeIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Create a skill-based grade"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Verify child belongs to family
        if not child_belongs_to_family(input.child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not found")
        
        skill_data = {
            "family_id": family_id,
            "child_id": input.child_id,
            "skill": input.skill,
            "subject_id": input.subject_id,
            "assignment_id": input.assignment_id,
            "lesson_id": input.lesson_id,
            "level": input.level,
            "evidence_id": input.evidence_id,
            "notes": input.notes,
            "created_by": user["id"]
        }
        
        result = supabase.table("skill_grades").insert(skill_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create skill grade")
        
        log_event("gradebook.skill.created", user_id=user["id"], skill_grade_id=result.data[0]["id"])
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating skill grade: {str(e)}")


@router.get("/skills", response_model=List[SkillGradeOut])
async def get_skill_grades(
    child_id: str = Query(...),
    subject_id: Optional[str] = Query(None),
    skill: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get skill grades for a child"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not found")
        
        query = supabase.table("skill_grades").select("*").eq("family_id", family_id).eq("child_id", child_id)
        
        if subject_id:
            query = query.eq("subject_id", subject_id)
        if skill:
            query = query.eq("skill", skill)
        
        result = query.order("created_at", desc=True).execute()
        
        return result.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching skill grades: {str(e)}")


# ============================================================================
# Assignment Review Workflow Endpoints
# ============================================================================

@router.post("/assignments/review", response_model=Dict[str, Any])
async def review_assignment(
    input: AssignmentReviewIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Review an assignment (approve/reject/needs revision)"""
    try:
        supabase = get_admin_client()
        
        # Call the database function
        result = supabase.rpc(
            "review_assignment",
            {
                "p_assignment_id": input.assignment_id,
                "p_rating": input.rating,
                "p_feedback": input.feedback,
                "p_review_status": input.review_status
            }
        ).execute()
        
        if not result.data or not result.data.get("success"):
            raise HTTPException(status_code=400, detail=result.data.get("error", "Review failed"))
        
        log_event("gradebook.assignment.reviewed", user_id=user["id"], assignment_id=input.assignment_id, status=input.review_status)
        return result.data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reviewing assignment: {str(e)}")


@router.get("/assignments/{assignment_id}/reviews", response_model=List[Dict[str, Any]])
async def get_assignment_reviews(
    assignment_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get all reviews for an assignment"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify assignment belongs to family
        assignment_check = supabase.table("assignments").select("id, family_id").eq("id", assignment_id).single().execute()
        if not assignment_check.data or assignment_check.data["family_id"] != family_id:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        result = supabase.table("assignment_reviews").select("*, reviewer:profiles!assignment_reviews_reviewer_id_fkey(id, name)").eq("assignment_id", assignment_id).order("reviewed_at", desc=True).execute()
        
        return result.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching reviews: {str(e)}")


# ============================================================================
# Standards Coverage Analytics Endpoints
# ============================================================================

@router.get("/standards/coverage", response_model=List[StandardsCoverageAnalyticsOut])
async def get_standards_coverage(
    child_id: str = Query(...),
    subject: Optional[str] = Query(None),
    state_code: Optional[str] = Query(None),
    grade_level: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get standards coverage analytics for a child"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not found")
        
        query = supabase.from_("standards_coverage_analytics").select("*").eq("child_id", child_id)
        
        if subject:
            query = query.eq("subject", subject)
        if state_code:
            query = query.eq("state_code", state_code)
        if grade_level:
            query = query.eq("grade_level", grade_level)
        
        result = query.execute()
        
        return result.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching coverage analytics: {str(e)}")


# ============================================================================
# AI Feedback Endpoints
# ============================================================================

@router.post("/assignments/{assignment_id}/ai-feedback", response_model=Dict[str, Any])
async def generate_ai_feedback(
    assignment_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Generate AI feedback for an assignment submission"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Get assignment with child info
        assignment_result = supabase.table("assignments").select(
            "*, child:children!assignments_child_id_fkey(id, first_name, grade), subject:subject!assignments_related_subject_fkey(id, name)"
        ).eq("id", assignment_id).single().execute()
        
        if not assignment_result.data or assignment_result.data["family_id"] != family_id:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        assignment = assignment_result.data
        child_name = assignment.get("child", {}).get("first_name", "your child")
        subject_name = assignment.get("subject", {}).get("name", "")
        
        # Import LLM function
        try:
            from llm import llm_write_feedback
        except ImportError:
            raise HTTPException(status_code=500, detail="AI service not available")
        
        # Generate feedback context
        feedback_context = f"assignment submission: {assignment.get('title', 'assignment')}"
        if subject_name:
            feedback_context += f" in {subject_name}"
        
        # Get assignment evidence if available
        evidence_ids = assignment.get("linked_evidence_ids", [])
        situation = None
        if evidence_ids:
            situation = f"The student submitted {len(evidence_ids)} piece(s) of evidence for this assignment."
        
        # Generate AI feedback
        ai_result = await llm_write_feedback({
            "child_id": assignment["child_id"],
            "child_name": child_name,
            "feedback_context": feedback_context,
            "situation": situation,
            "tone": "constructive"
        })
        
        # Update assignment with AI feedback
        update_result = supabase.table("assignments").update({
            "ai_feedback": ai_result.get("feedback_text", ""),
            "ai_feedback_generated_at": "now()"
        }).eq("id", assignment_id).execute()
        
        log_event("gradebook.assignment.ai_feedback_generated", user_id=user["id"], assignment_id=assignment_id)
        
        return {
            "success": True,
            "feedback": ai_result.get("feedback_text", ""),
            "suggestions": ai_result.get("suggestions", []),
            "tips": ai_result.get("tips", []),
            "assignment": update_result.data[0] if update_result.data else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("gradebook.assignment.ai_feedback.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating AI feedback: {str(e)}")


# ============================================================================
# Progress Estimation Endpoints
# ============================================================================

@router.post("/progress/estimate", response_model=Dict[str, Any])
async def estimate_progress(
    child_id: str = Query(...),
    subject_id: Optional[str] = Query(None),
    estimation_type: str = Query("overall", pattern="^(overall|syllabus_completion|standards_coverage|skill_mastery)$"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Calculate and store progress estimation"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not found")
        
        # Call the database function
        result = supabase.rpc(
            "estimate_progress",
            {
                "p_child_id": child_id,
                "p_subject_id": subject_id,
                "p_estimation_type": estimation_type
            }
        ).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to estimate progress")
        
        log_event("gradebook.progress.estimated", user_id=user["id"], child_id=child_id, type=estimation_type)
        return result.data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error estimating progress: {str(e)}")


@router.get("/progress/estimations", response_model=List[ProgressEstimationOut])
async def get_progress_estimations(
    child_id: str = Query(...),
    subject_id: Optional[str] = Query(None),
    estimation_type: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get progress estimations for a child"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not found")
        
        query = supabase.table("progress_estimations").select("*").eq("family_id", family_id).eq("child_id", child_id)
        
        if subject_id:
            query = query.eq("subject_id", subject_id)
        if estimation_type:
            query = query.eq("estimation_type", estimation_type)
        
        result = query.order("calculated_at", desc=True).execute()
        
        return result.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching progress estimations: {str(e)}")

