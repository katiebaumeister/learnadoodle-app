"""
AI Template Generation Routes
Generate templates from topics, syllabi, curriculum, etc.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
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
from llm import llm_generate_template_from_topic

router = APIRouter(prefix="/api/ai/templates/generate", tags=["ai_templates"])


class GenerateTemplateIn(BaseModel):
    source_type: str = Field(..., description="'topic', 'syllabus', 'curriculum', 'learning_goal', 'subject'")
    source_data: Dict[str, Any] = Field(..., description="Source data (topic text, syllabus, etc.)")
    template_type: str = Field(default="lesson", description="'lesson', 'unit', 'sequence', 'plan'")
    subjects: Optional[List[str]] = None
    grade_levels: Optional[List[str]] = None
    estimated_duration_days: Optional[int] = None


class TemplateOut(BaseModel):
    id: str
    template_name: str
    template_description: str
    template_type: str
    template_data: Dict[str, Any]
    subjects: List[str]
    grade_levels: List[str]
    estimated_duration_days: Optional[int]
    cognitive_load_profile: Dict[str, Any]
    confidence_score: float
    created_at: str


@router.post("/", response_model=TemplateOut)
async def generate_template(
    body: GenerateTemplateIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Generate a template from topic, syllabus, or other source"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Add to generation queue
        queue_data = {
            "family_id": family_id,
            "requested_by": user["id"],
            "source_type": body.source_type,
            "source_data": body.source_data,
            "requested_template_type": body.template_type,
            "status": "processing",
        }
        queue_result = supabase.table("ai_template_generation_queue").insert(queue_data).execute()
        if not queue_result.data:
            raise HTTPException(status_code=500, detail="Failed to create generation request")
        queue_id = queue_result.data[0]["id"]

        # Build context for template generation
        context = {
            "source_type": body.source_type,
            "source_data": body.source_data,
            "template_type": body.template_type,
            "subjects": body.subjects or [],
            "grade_levels": body.grade_levels or [],
            "estimated_duration_days": body.estimated_duration_days,
        }

        # Call LLM to generate template
        try:
            template_data = await llm_generate_template_from_topic(context)
        except Exception as e:
            # Update queue with error
            supabase.table("ai_template_generation_queue").update({
                "status": "failed",
                "error_message": str(e),
                "processed_at": datetime.now().isoformat(),
            }).eq("id", queue_id).execute()
            log_event("ai.template.llm_error", user_id=user["id"], error=str(e))
            raise HTTPException(status_code=500, detail=f"AI service unavailable: {str(e)}")

        # Create template record
        template_record = {
            "family_id": family_id,
            "created_by": user["id"],
            "source_type": body.source_type,
            "source_data": body.source_data,
            "template_name": template_data.get("template_name", "Generated Template"),
            "template_description": template_data.get("template_description", ""),
            "template_type": body.template_type,
            "template_data": template_data.get("template_data", {}),
            "subjects": body.subjects or [],
            "grade_levels": body.grade_levels or [],
            "estimated_duration_days": body.estimated_duration_days,
            "cognitive_load_profile": template_data.get("cognitive_load_profile", {}),
            "generation_prompt": template_data.get("generation_prompt", ""),
            "model_version": "gpt-4o-mini",
            "confidence_score": template_data.get("confidence_score", 0.5),
        }

        template_result = supabase.table("ai_generated_templates").insert(template_record).execute()
        if not template_result.data:
            # Update queue with error
            supabase.table("ai_template_generation_queue").update({
                "status": "failed",
                "error_message": "Failed to save template",
                "processed_at": datetime.now().isoformat(),
            }).eq("id", queue_id).execute()
            raise HTTPException(status_code=500, detail="Failed to save generated template")

        template = template_result.data[0]

        # Update queue as completed
        supabase.table("ai_template_generation_queue").update({
            "status": "completed",
            "result_template_id": template["id"],
            "processed_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat(),
        }).eq("id", queue_id).execute()

        log_event("ai.template.generated", user_id=user["id"], template_id=template["id"], source_type=body.source_type)

        return template

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_template_generate")
        raise HTTPException(status_code=500, detail=f"Error generating template: {str(e)}")


@router.get("/queue")
async def get_generation_queue(
    status: Optional[str] = Query(None, description="Filter by status: pending, processing, completed, failed"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get template generation queue for user"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        query = supabase.table("ai_template_generation_queue").select("*").eq("family_id", family_id)

        if status:
            query = query.eq("status", status)

        result = query.order("created_at", desc=True).limit(50).execute()

        return result.data or []

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_template_queue")
        raise HTTPException(status_code=500, detail=f"Error getting queue: {str(e)}")


@router.get("/", response_model=List[TemplateOut])
async def get_generated_templates(
    source_type: Optional[str] = Query(None),
    template_type: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get AI-generated templates"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        query = supabase.table("ai_generated_templates").select("*")

        # Show user's templates and public templates
        query = query.or_(f"family_id.eq.{family_id},is_public.eq.true")

        if source_type:
            query = query.eq("source_type", source_type)

        if template_type:
            query = query.eq("template_type", template_type)

        if is_public is not None:
            query = query.eq("is_public", is_public)

        result = query.order("created_at", desc=True).limit(limit).execute()

        return result.data or []

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_templates_get")
        raise HTTPException(status_code=500, detail=f"Error getting templates: {str(e)}")

