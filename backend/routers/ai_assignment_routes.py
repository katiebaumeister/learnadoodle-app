"""
AI Assignment Generation Routes
Generate assignments from syllabus, YouTube, or text input
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
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

router = APIRouter(prefix="/api/ai/assignments", tags=["ai_assignments"])


class AssignmentGenerationInput(BaseModel):
    child_id: str
    source_type: str = Field(..., description="'syllabus', 'youtube', 'text', or 'url'")
    source_content: str = Field(..., description="Syllabus section ID, YouTube URL, text, or URL")
    subject_id: Optional[str] = None
    syllabus_unit_id: Optional[str] = None
    cognitive_load: Optional[str] = Field(default="medium", description="'low', 'medium', or 'high'")
    difficulty_level: Optional[str] = Field(default="medium", description="'easy', 'medium', or 'hard'")
    estimated_duration_minutes: Optional[int] = None


@router.post("/generate")
async def generate_assignment(
    body: AssignmentGenerationInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Generate an assignment using AI from various sources"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_check = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=404, detail="Child not found")

        # Extract content based on source type
        content_to_analyze = body.source_content
        context = {}

        if body.source_type == "syllabus":
            # Get syllabus section content
            syllabus_result = supabase.table("syllabus_sections").select("title, content, description").eq("id", body.source_content).single().execute()
            if syllabus_result.data:
                content_to_analyze = f"{syllabus_result.data.get('title', '')}\n{syllabus_result.data.get('description', '')}\n{syllabus_result.data.get('content', '')}"
                context["syllabus_section"] = syllabus_result.data
        elif body.source_type == "youtube":
            # For YouTube, we'd need to extract transcript or description
            # For now, use the URL as context
            context["youtube_url"] = body.source_content
            content_to_analyze = f"YouTube video: {body.source_content}"
        elif body.source_type == "url":
            # For URL, we'd need to fetch and parse content
            # For now, use URL as context
            context["url"] = body.source_content
            content_to_analyze = f"Content from URL: {body.source_content}"

        # Call AI service to generate assignment
        # This is a placeholder - would integrate with OpenAI or similar
        ai_prompt = f"""Generate an educational assignment based on the following content:

Content: {content_to_analyze[:2000]}

Requirements:
- Cognitive load: {body.cognitive_load}
- Difficulty: {body.difficulty_level}
- Estimated duration: {body.estimated_duration_minutes or 'Not specified'} minutes

Generate:
1. A clear, engaging title
2. A detailed description
3. Step-by-step instructions
4. Learning objectives

Format as JSON with: title, description, instructions, learning_objectives"""

        # Placeholder AI response (would call actual AI service)
        generated_assignment = {
            "title": f"Assignment: {body.source_type.title()} Content",
            "description": f"Complete this assignment based on the {body.source_type} content provided.",
            "instructions": "1. Review the source material\n2. Complete the required tasks\n3. Submit your work",
            "learning_objectives": ["Understand key concepts", "Apply knowledge", "Demonstrate mastery"],
        }

        # Save to ai_generated_assignments table
        result = supabase.table("ai_generated_assignments").insert({
            "family_id": family_id,
            "child_id": body.child_id,
            "source_type": body.source_type,
            "source_content": body.source_content,
            "generated_title": generated_assignment["title"],
            "generated_description": generated_assignment["description"],
            "generated_instructions": generated_assignment["instructions"],
            "cognitive_load": body.cognitive_load,
            "estimated_duration_minutes": body.estimated_duration_minutes,
            "difficulty_level": body.difficulty_level,
            "subject_id": body.subject_id,
            "syllabus_unit_id": body.syllabus_unit_id,
            "ai_model": "placeholder",  # Would be actual model name
            "ai_prompt": ai_prompt,
            "status": "draft",
            "created_by": user["id"],
        }).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create AI-generated assignment")

        log_event("ai.assignment.generated", user_id=user["id"], child_id=body.child_id, source_type=body.source_type)

        return {
            "success": True,
            "assignment": result.data[0] if isinstance(result.data, list) else result.data,
            "generated_content": generated_assignment,
        }

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_assignment_generate")
        raise HTTPException(status_code=500, detail=f"Error generating assignment: {str(e)}")


@router.post("/{assignment_id}/approve")
async def approve_ai_assignment(
    assignment_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Approve an AI-generated assignment and create it as a real assignment"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Get AI-generated assignment
        ai_assignment = supabase.table("ai_generated_assignments").select("*").eq("id", assignment_id).eq("family_id", family_id).single().execute()
        if not ai_assignment.data:
            raise HTTPException(status_code=404, detail="AI-generated assignment not found")

        ai_data = ai_assignment.data

        # Create real assignment
        assignment_result = supabase.table("assignments").insert({
            "family_id": family_id,
            "child_id": ai_data["child_id"],
            "title": ai_data["generated_title"],
            "description": ai_data["generated_description"],
            "related_subject": ai_data.get("subject_id"),
            "related_syllabus_unit": ai_data.get("syllabus_unit_id"),
            "status": "not_started",
            "created_by": user["id"],
        }).execute()

        if not assignment_result.data:
            raise HTTPException(status_code=500, detail="Failed to create assignment")

        # Update AI assignment status
        supabase.table("ai_generated_assignments").update({
            "status": "assigned",
            "assigned_as_assignment_id": assignment_result.data[0]["id"] if isinstance(assignment_result.data, list) else assignment_result.data["id"],
        }).eq("id", assignment_id).execute()

        log_event("ai.assignment.approved", user_id=user["id"], assignment_id=assignment_result.data[0]["id"] if isinstance(assignment_result.data, list) else assignment_result.data["id"])

        return {
            "success": True,
            "assignment": assignment_result.data[0] if isinstance(assignment_result.data, list) else assignment_result.data,
        }

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_assignment_approve")
        raise HTTPException(status_code=500, detail=f"Error approving assignment: {str(e)}")


@router.get("/{child_id}")
async def get_ai_generated_assignments(
    child_id: str,
    status: Optional[str] = Query(None, description="Filter by status"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get AI-generated assignments for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        query = supabase.table("ai_generated_assignments").select("*").eq("child_id", child_id).eq("family_id", family_id)
        
        if status:
            query = query.eq("status", status)

        result = query.order("created_at", desc=True).execute()

        return result.data or []

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_assignment_list")
        raise HTTPException(status_code=500, detail=f"Error fetching AI-generated assignments: {str(e)}")

