"""
FastAPI routes for Lesson Templates Engine
Handles creation, management, and application of lesson templates
"""
import sys
import io
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

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

router = APIRouter(prefix="/api/lesson-templates", tags=["lesson-templates"])


# ============================================================================
# Pydantic Models
# ============================================================================

class LessonTemplateIn(BaseModel):
    title: str
    subject_id: Optional[str] = None
    default_objectives: Optional[str] = None
    default_materials: Optional[str] = None
    default_steps: Optional[str] = None
    default_duration: Optional[int] = None
    default_rich_text: Optional[Dict[str, Any]] = None
    linked_standards: Optional[List[str]] = None
    grade_levels: Optional[List[str]] = None
    pacing: Optional[str] = None
    adaptation_rules: Optional[Dict[str, Any]] = None


class LessonTemplateOut(BaseModel):
    id: str
    title: str
    subject_id: Optional[str]
    default_objectives: Optional[str]
    default_materials: Optional[str]
    default_steps: Optional[str]
    default_duration: Optional[int]
    default_rich_text: Optional[Dict[str, Any]]
    linked_standards: Optional[List[str]]
    version: Optional[int] = None
    parent_template_id: Optional[str] = None
    is_current_version: Optional[bool] = None
    version_notes: Optional[str] = None
    grade_levels: Optional[List[str]] = None
    pacing: Optional[str] = None
    adaptation_rules: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ApplyTemplateInput(BaseModel):
    template_id: str
    lesson_id: Optional[str] = None  # If provided, apply to existing lesson; otherwise return template data


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/", response_model=List[LessonTemplateOut])
async def list_templates(
    subject_id: Optional[str] = Query(None, description="Filter by subject"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """List lesson templates for user's family"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        query = supabase.table("lesson_templates").select("*").eq("family_id", family_id)
        
        if subject_id:
            query = query.eq("subject_id", subject_id)
        
        result = query.order("created_at", desc=True).execute()
        
        # Convert linked_standards from JSONB to list
        templates = []
        for template in (result.data or []):
            template["linked_standards"] = template.get("linked_standards") or []
            templates.append(template)
        
        return templates
        
    except Exception as e:
        log_event("lesson_templates.list.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list templates: {str(e)}"
        )


@router.get("/{template_id}", response_model=LessonTemplateOut)
async def get_template(
    template_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get a specific template"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        result = (
            supabase.table("lesson_templates")
            .select("*")
            .eq("id", template_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        
        if not result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
        template = result.data
        template["linked_standards"] = template.get("linked_standards") or []
        return template
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.get.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get template: {str(e)}"
        )


@router.post("/", response_model=LessonTemplateOut)
async def create_template(
    template: LessonTemplateIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Create a new lesson template"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        insert_data = {
            "family_id": family_id,
            "title": template.title,
            "subject_id": template.subject_id,
            "default_objectives": template.default_objectives,
            "default_materials": template.default_materials,
            "default_steps": template.default_steps,
            "default_duration": template.default_duration,
            "default_rich_text": template.default_rich_text or {},
            "linked_standards": template.linked_standards or [],
            "grade_levels": template.grade_levels or [],
            "pacing": template.pacing,
            "adaptation_rules": template.adaptation_rules or {},
            "created_by": user["id"]
        }
        
        result = supabase.table("lesson_templates").insert(insert_data).execute()
        
        if result.data:
            log_event("lesson_templates.create", user_id=user["id"], template_id=result.data[0]["id"])
            template_out = result.data[0]
            template_out["linked_standards"] = template_out.get("linked_standards") or []
            return template_out
        
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create template")
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.create.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create template: {str(e)}"
        )


@router.put("/{template_id}", response_model=LessonTemplateOut)
async def update_template(
    template_id: str,
    template: LessonTemplateIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Update an existing template"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify template belongs to family
        existing = (
            supabase.table("lesson_templates")
            .select("id")
            .eq("id", template_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
        update_data = {
            "title": template.title,
            "subject_id": template.subject_id,
            "default_objectives": template.default_objectives,
            "default_materials": template.default_materials,
            "default_steps": template.default_steps,
            "default_duration": template.default_duration,
            "default_rich_text": template.default_rich_text or {},
            "linked_standards": template.linked_standards or [],
            "updated_at": "now()"
        }
        
        result = (
            supabase.table("lesson_templates")
            .update(update_data)
            .eq("id", template_id)
            .execute()
        )
        
        if result.data:
            log_event("lesson_templates.update", user_id=user["id"], template_id=template_id)
            template_out = result.data[0]
            template_out["linked_standards"] = template_out.get("linked_standards") or []
            return template_out
        
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update template")
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.update.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update template: {str(e)}"
        )


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Delete a template"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify template belongs to family
        existing = (
            supabase.table("lesson_templates")
            .select("id")
            .eq("id", template_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
        supabase.table("lesson_templates").delete().eq("id", template_id).execute()
        
        log_event("lesson_templates.delete", user_id=user["id"], template_id=template_id)
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.delete.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete template: {str(e)}"
        )


@router.post("/{template_id}/apply", response_model=Dict[str, Any])
async def apply_template(
    template_id: str,
    input: ApplyTemplateInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Apply template to a lesson (autofill)"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Get template
        template_res = (
            supabase.table("lesson_templates")
            .select("*")
            .eq("id", template_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        
        if not template_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
        template = template_res.data
        
        # If lesson_id provided, update the lesson
        if input.lesson_id:
            # Verify lesson belongs to family
            event_res = (
                supabase.table("events")
                .select("id, family_id")
                .eq("id", input.lesson_id)
                .maybe_single()
                .execute()
            )
            
            if not event_res.data or event_res.data["family_id"] != family_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Lesson not found")
            
            # Update lesson with template data
            update_data = {}
            if template.get("default_objectives"):
                update_data["description"] = template["default_objectives"]
            if template.get("default_duration"):
                # Calculate end_ts based on start_ts + duration
                event = supabase.table("events").select("start_ts").eq("id", input.lesson_id).maybe_single().execute()
                if event.data and event.data.get("start_ts"):
                    from datetime import datetime, timedelta
                    start = datetime.fromisoformat(event.data["start_ts"].replace("Z", "+00:00"))
                    end = start + timedelta(minutes=template["default_duration"])
                    update_data["end_ts"] = end.isoformat()
            
            if update_data:
                supabase.table("events").update(update_data).eq("id", input.lesson_id).execute()
            
            # Attach linked standards if any
            linked_standards = template.get("linked_standards") or []
            if linked_standards:
                # Delete existing attachments
                supabase.table("lesson_standards").delete().eq("lesson_id", input.lesson_id).execute()
                # Insert new attachments
                inserts = [{"lesson_id": input.lesson_id, "standard_id": std_id} for std_id in linked_standards]
                if inserts:
                    supabase.table("lesson_standards").insert(inserts).execute()
            
            log_event("lesson_templates.apply", user_id=user["id"], template_id=template_id, lesson_id=input.lesson_id)
            return {"success": True, "lesson_id": input.lesson_id}
        
        # Otherwise, just return template data for frontend to use
        return {
            "template": {
                "default_objectives": template.get("default_objectives"),
                "default_materials": template.get("default_materials"),
                "default_steps": template.get("default_steps"),
                "default_duration": template.get("default_duration"),
                "default_rich_text": template.get("default_rich_text"),
                "linked_standards": template.get("linked_standards") or []
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.apply.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply template: {str(e)}"
        )


class SaveLessonAsTemplateInput(BaseModel):
    lesson_id: str
    title: str


class CreateTemplateVersionInput(BaseModel):
    template_id: str
    version_notes: Optional[str] = None


class ImportTemplateInput(BaseModel):
    title: str
    file_path: Optional[str] = None
    file_url: Optional[str] = None
    import_type: str  # 'file' or 'url'
    family_id: str

@router.post("/from-lesson", response_model=LessonTemplateOut)
async def save_lesson_as_template(
    input: SaveLessonAsTemplateInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Save an existing lesson as a template"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Get lesson
        event_res = (
            supabase.table("events")
            .select("*")
            .eq("id", input.lesson_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        
        if not event_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        
        event = event_res.data
        
        # Get attached standards
        standards_res = (
            supabase.table("lesson_standards")
            .select("standard_id")
            .eq("lesson_id", input.lesson_id)
            .execute()
        )
        linked_standards = [s["standard_id"] for s in (standards_res.data or [])]
        
        # Calculate duration if possible
        duration = None
        if event.get("start_ts") and event.get("end_ts"):
            from datetime import datetime
            start = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(event["end_ts"].replace("Z", "+00:00"))
            duration = int((end - start).total_seconds() / 60)
        
        # Create template
        insert_data = {
            "family_id": family_id,
            "title": input.title,
            "subject_id": event.get("subject_id"),
            "default_objectives": event.get("description"),
            "default_materials": None,  # Could extract from event metadata if available
            "default_steps": None,  # Could extract from event metadata if available
            "default_duration": duration,
            "default_rich_text": event.get("metadata") or {},
            "linked_standards": linked_standards,
            "created_by": user["id"]
        }
        
        result = supabase.table("lesson_templates").insert(insert_data).execute()
        
        if result.data:
            log_event("lesson_templates.save_from_lesson", user_id=user["id"], template_id=result.data[0]["id"], lesson_id=input.lesson_id)
            template_out = result.data[0]
            template_out["linked_standards"] = template_out.get("linked_standards") or []
            return template_out
        
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create template")
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.save_from_lesson.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save template: {str(e)}"
        )


@router.post("/{template_id}/create-version", response_model=LessonTemplateOut)
async def create_template_version(
    template_id: str,
    input: CreateTemplateVersionInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Create a new version of an existing template"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify template belongs to family
        existing = (
            supabase.table("lesson_templates")
            .select("*")
            .eq("id", template_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
        # Use the database function to create a new version
        result = supabase.rpc(
            "create_template_version",
            {
                "p_template_id": template_id,
                "p_version_notes": input.version_notes
            }
        ).execute()
        
        if not result.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create version")
        
        new_template_id = result.data
        
        # Get the new template
        new_template_res = (
            supabase.table("lesson_templates")
            .select("*")
            .eq("id", new_template_id)
            .maybe_single()
            .execute()
        )
        
        if not new_template_res.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve new version")
        
        log_event("lesson_templates.create_version", user_id=user["id"], template_id=template_id, new_version_id=new_template_id)
        template_out = new_template_res.data
        template_out["linked_standards"] = template_out.get("linked_standards") or []
        return template_out
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.create_version.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create template version: {str(e)}"
        )


@router.get("/{template_id}/versions", response_model=List[LessonTemplateOut])
async def list_template_versions(
    template_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """List all versions of a template"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Get the template to find its parent
        template_res = (
            supabase.table("lesson_templates")
            .select("*")
            .eq("id", template_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        
        if not template_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
        template = template_res.data
        parent_id = template.get("parent_template_id") or template_id
        
        # Get all versions
        result = (
            supabase.table("lesson_templates")
            .select("*")
            .or_(f"id.eq.{parent_id},parent_template_id.eq.{parent_id}")
            .eq("family_id", family_id)
            .order("version", desc=False)
            .execute()
        )
        
        templates = []
        for t in (result.data or []):
            t["linked_standards"] = t.get("linked_standards") or []
            templates.append(t)
        
        return templates
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.list_versions.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list template versions: {str(e)}"
        )


@router.post("/import", response_model=LessonTemplateOut)
async def import_template(
    input: ImportTemplateInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Import a template from a PDF/DOC file or Google Docs URL"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify family_id matches
        if input.family_id != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")
        
        # Extract text from file or URL
        text_content = ""
        
        if input.import_type == 'file' and input.file_path:
            # Extract text from uploaded file
            try:
                # Try different import paths
                try:
                    from routers.util import get_file_text_from_storage
                except ImportError:
                    from backend.routers.util import get_file_text_from_storage
                text_content = await get_file_text_from_storage("evidence", input.file_path)
            except Exception as e:
                log_event("lesson_templates.import.error", user_id=user["id"], error=f"File extraction failed: {str(e)}")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to extract text from file: {str(e)}")
        
        elif input.import_type == 'url' and input.file_url:
            # Extract text from Google Docs URL
            try:
                import requests
                from urllib.parse import urlparse, parse_qs
                
                # Convert Google Docs URL to export format
                doc_id = None
                if 'docs.google.com' in input.file_url:
                    parsed = urlparse(input.file_url)
                    if '/d/' in parsed.path:
                        doc_id = parsed.path.split('/d/')[1].split('/')[0]
                
                if not doc_id:
                    raise ValueError("Invalid Google Docs URL")
                
                # Try to get as plain text
                export_url = f"https://docs.google.com/document/d/{doc_id}/export?format=txt"
                response = requests.get(export_url, timeout=30)
                if response.status_code == 200:
                    text_content = response.text
                else:
                    raise ValueError(f"Failed to fetch Google Doc: {response.status_code}")
            except Exception as e:
                log_event("lesson_templates.import.error", user_id=user["id"], error=f"URL extraction failed: {str(e)}")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to extract text from URL: {str(e)}")
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid import type or missing file/URL")
        
        if not text_content or len(text_content.strip()) < 50:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Extracted text is too short or empty")
        
        # Use LLM to extract template structure
        try:
            try:
                from backend.llm import llm_extract_outline
            except ImportError:
                from llm import llm_extract_outline
            structure = await llm_extract_outline(text_content)
        except (ImportError, Exception) as e:
            # Fallback: use simple extraction
            structure = {
                "units": [],
                "assignments": [],
                "metadata": {"course_name": input.title}
            }
            # Try to extract basic info from text
            lines = text_content.split('\n')[:50]
            objectives = []
            materials = []
            steps = []
            
            for line in lines:
                line_lower = line.lower().strip()
                if any(keyword in line_lower for keyword in ['objective', 'goal', 'learn']):
                    objectives.append(line.strip())
                elif any(keyword in line_lower for keyword in ['material', 'resource', 'supply']):
                    materials.append(line.strip())
                elif any(keyword in line_lower for keyword in ['step', 'procedure', 'activity']):
                    steps.append(line.strip())
            
            if objectives:
                structure['default_objectives'] = '\n'.join(objectives[:5])
            if materials:
                structure['default_materials'] = '\n'.join(materials[:5])
            if steps:
                structure['default_steps'] = '\n'.join(steps[:10])
        
        # Extract template fields from structure
        default_objectives = None
        default_materials = None
        default_steps = None
        default_duration = None
        
        # Try to extract from structure
        if isinstance(structure, dict):
            # Extract objectives from metadata or first unit
            if structure.get('metadata', {}).get('course_name'):
                default_objectives = f"Course: {structure['metadata']['course_name']}"
            
            # Build steps from units
            if structure.get('units'):
                step_parts = []
                for unit in structure['units'][:5]:  # Limit to first 5 units
                    step_parts.append(f"Unit: {unit.get('title', 'Untitled')}")
                    if unit.get('sections'):
                        for section in unit['sections'][:3]:  # First 3 sections per unit
                            step_parts.append(f"  - {section.get('title', 'Untitled')}")
                if step_parts:
                    default_steps = '\n'.join(step_parts)
            
            # Estimate duration from units
            if structure.get('units'):
                total_minutes = sum(
                    unit.get('weeks', 1) * 60 * 2  # Assume 2 hours per week
                    for unit in structure['units']
                )
                if total_minutes > 0:
                    default_duration = min(total_minutes, 180)  # Cap at 3 hours
        
        # Create template
        insert_data = {
            "family_id": family_id,
            "title": input.title,
            "subject_id": None,
            "default_objectives": default_objectives or text_content[:500],  # Fallback to first 500 chars
            "default_materials": default_materials,
            "default_steps": default_steps,
            "default_duration": default_duration,
            "default_rich_text": {
                "imported_from": input.import_type,
                "source_url": input.file_url if input.import_type == 'url' else None,
                "source_path": input.file_path if input.import_type == 'file' else None,
                "extracted_structure": structure,
            },
            "linked_standards": [],
            "created_by": user["id"]
        }
        
        result = supabase.table("lesson_templates").insert(insert_data).execute()
        
        if result.data:
            log_event("lesson_templates.import", user_id=user["id"], template_id=result.data[0]["id"], import_type=input.import_type)
            template_out = result.data[0]
            template_out["linked_standards"] = template_out.get("linked_standards") or []
            return template_out
        
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create template")
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.import.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import template: {str(e)}"
        )


class AdaptTemplateInput(BaseModel):
    template_id: str
    target_grade: str
    target_pacing: Optional[str] = "normal"


class GenerateTemplateInput(BaseModel):
    topic: str
    subject_id: Optional[str] = None
    grade_level: Optional[str] = None
    duration_minutes: Optional[int] = None
    include_materials: bool = True
    include_steps: bool = True


class ShareTemplateInput(BaseModel):
    template_id: str
    is_public: bool = False
    marketplace_description: Optional[str] = None
    marketplace_tags: Optional[List[str]] = None


class CopySharedTemplateInput(BaseModel):
    template_id: str


@router.post("/{template_id}/adapt", response_model=Dict[str, Any])
async def adapt_template(
    template_id: str,
    input: AdaptTemplateInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Adapt a template for a specific grade level and pacing"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify template belongs to family
        existing = (
            supabase.table("lesson_templates")
            .select("id")
            .eq("id", template_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
        # Call database function to adapt template
        result = supabase.rpc(
            "adapt_template_for_grade_pacing",
            {
                "p_template_id": template_id,
                "p_target_grade": input.target_grade,
                "p_target_pacing": input.target_pacing or "normal"
            }
        ).execute()
        
        if not result.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to adapt template")
        
        log_event("lesson_templates.adapt", user_id=user["id"], template_id=template_id, target_grade=input.target_grade, target_pacing=input.target_pacing)
        return result.data
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.adapt.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to adapt template: {str(e)}"
        )


@router.post("/generate", response_model=LessonTemplateOut)
async def generate_template_from_topic(
    input: GenerateTemplateInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Generate a lesson template from a topic using AI"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Use LLM to generate template content
        try:
            try:
                from backend.llm import client
            except ImportError:
                from llm import client
            
            import json
            
            prompt = f"""Generate a complete lesson template for the topic: "{input.topic}"

Requirements:
- Grade level: {input.grade_level or 'Not specified'}
- Duration: {input.duration_minutes or 'Not specified'} minutes
- Include materials: {input.include_materials}
- Include step-by-step instructions: {input.include_steps}

Return a JSON object with this structure:
{{
  "title": "Lesson title",
  "objectives": "Learning objectives (what students will learn)",
  "materials": "List of materials needed (if include_materials is true)",
  "steps": "Step-by-step lesson plan (if include_steps is true)",
  "duration_minutes": {input.duration_minutes or 45}
}}

Make the content age-appropriate for {input.grade_level or 'general'} grade level.
Be specific and practical."""

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", content: "You are an expert educator creating lesson templates. Return only valid JSON."},
                    {"role": "user", content: prompt}
                ],
                temperature=0.7,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            generated_data = json.loads(content)
            
        except Exception as e:
            log_event("lesson_templates.generate.error", user_id=user["id"], error=f"LLM generation failed: {str(e)}")
            # Fallback: create basic template
            generated_data = {
                "title": f"Lesson: {input.topic}",
                "objectives": f"Students will learn about {input.topic}",
                "materials": "Materials to be determined",
                "steps": f"1. Introduce {input.topic}\n2. Explore concepts\n3. Practice and apply\n4. Review and assess",
                "duration_minutes": input.duration_minutes or 45
            }
        
        # Create template from generated content
        insert_data = {
            "family_id": family_id,
            "title": generated_data.get("title", f"Lesson: {input.topic}"),
            "subject_id": input.subject_id,
            "default_objectives": generated_data.get("objectives", ""),
            "default_materials": generated_data.get("materials") if input.include_materials else None,
            "default_steps": generated_data.get("steps") if input.include_steps else None,
            "default_duration": generated_data.get("duration_minutes"),
            "default_rich_text": {
                "generated_by_ai": True,
                "topic": input.topic,
                "generation_metadata": {
                    "grade_level": input.grade_level,
                    "include_materials": input.include_materials,
                    "include_steps": input.include_steps,
                }
            },
            "linked_standards": [],
            "grade_levels": [input.grade_level] if input.grade_level else [],
            "created_by": user["id"]
        }
        
        result = supabase.table("lesson_templates").insert(insert_data).execute()
        
        if result.data:
            log_event("lesson_templates.generate", user_id=user["id"], template_id=result.data[0]["id"], topic=input.topic)
            template_out = result.data[0]
            template_out["linked_standards"] = template_out.get("linked_standards") or []
            return template_out
        
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create template")
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.generate.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}"
        )


@router.get("/marketplace", response_model=List[LessonTemplateOut])
async def list_marketplace_templates(
    search: Optional[str] = Query(None),
    grade_level: Optional[str] = Query(None),
    subject_id: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """List public templates from the marketplace"""
    try:
        supabase = get_admin_client()
        
        query = (
            supabase.table("lesson_templates")
            .select("*")
            .eq("is_public", True)
            .order("marketplace_usage_count", desc=True)
            .limit(limit)
        )
        
        if search:
            query = query.or_(f"title.ilike.%{search}%,marketplace_description.ilike.%{search}%")
        
        if grade_level:
            query = query.contains("grade_levels", [grade_level])
        
        if subject_id:
            query = query.eq("subject_id", subject_id)
        
        result = query.execute()
        
        templates = []
        for template in (result.data or []):
            template["linked_standards"] = template.get("linked_standards") or []
            templates.append(template)
        
        return templates
        
    except Exception as e:
        log_event("lesson_templates.marketplace.list.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list marketplace templates: {str(e)}"
        )


@router.post("/{template_id}/share", response_model=LessonTemplateOut)
async def share_template(
    template_id: str,
    input: ShareTemplateInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Share a template publicly or update sharing settings"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Verify template belongs to family
        existing = (
            supabase.table("lesson_templates")
            .select("id")
            .eq("id", template_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        
        # Update sharing settings
        update_data = {
            "is_public": input.is_public,
        }
        
        if input.marketplace_description is not None:
            update_data["marketplace_description"] = input.marketplace_description
        
        if input.marketplace_tags is not None:
            update_data["marketplace_tags"] = input.marketplace_tags
        
        result = (
            supabase.table("lesson_templates")
            .update(update_data)
            .eq("id", template_id)
            .execute()
        )
        
        if result.data:
            log_event("lesson_templates.share", user_id=user["id"], template_id=template_id, is_public=input.is_public)
            template_out = result.data[0]
            template_out["linked_standards"] = template_out.get("linked_standards") or []
            return template_out
        
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update template")
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.share.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to share template: {str(e)}"
        )


@router.post("/{template_id}/copy", response_model=LessonTemplateOut)
async def copy_shared_template(
    template_id: str,
    input: CopySharedTemplateInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Copy a shared/public template to user's family"""
    try:
        supabase = get_admin_client()
        family_id = get_family_id_for_user(user["id"])
        
        # Use database function to copy template
        result = supabase.rpc(
            "copy_shared_template",
            {
                "p_template_id": template_id,
                "p_target_family_id": family_id,
                "p_copied_by": user["id"]
            }
        ).execute()
        
        if not result.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to copy template")
        
        new_template_id = result.data
        
        # Get the copied template
        new_template_res = (
            supabase.table("lesson_templates")
            .select("*")
            .eq("id", new_template_id)
            .maybe_single()
            .execute()
        )
        
        if not new_template_res.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve copied template")
        
        log_event("lesson_templates.copy", user_id=user["id"], template_id=template_id, new_template_id=new_template_id)
        template_out = new_template_res.data
        template_out["linked_standards"] = template_out.get("linked_standards") or []
        return template_out
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("lesson_templates.copy.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to copy template: {str(e)}"
        )

