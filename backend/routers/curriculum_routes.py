"""
FastAPI routes for Curriculum Builder
Creates structured curriculum units with lessons and pacing
"""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, date, timedelta, timezone
import sys
from pathlib import Path
import json
import uuid

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/curriculum", tags=["curriculum"])


# --- Pydantic Models ---

class CurriculumConstraintsInput(BaseModel):
    weeks: int = Field(1, ge=1, le=12, description="Target total weeks")
    minutes_per_day: int = Field(60, ge=15, le=240, description="Minutes per day")
    weekdays_only: bool = Field(True, description="Weekdays only")
    difficulty: str = Field("standard", description="Difficulty: gentle, standard, stretch")
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD)")


class CurriculumBuildInput(BaseModel):
    mode: str = Field(..., description="Input mode: topic, syllabus, pdf, link, material")
    topic: Optional[str] = Field(None, description="Topic prompt")
    syllabus_text: Optional[str] = Field(None, description="Pasted syllabus text")
    source_url: Optional[str] = Field(None, description="Source URL")
    source_file_id: Optional[str] = Field(None, description="Source file ID")
    material_id: Optional[str] = Field(None, description="Material ID")
    student_ids: List[str] = Field(..., description="Student IDs")
    constraints: CurriculumConstraintsInput = Field(..., description="Constraints")


class CurriculumPlacementInput(BaseModel):
    strategy: str = Field("fit_openings", description="Placement strategy")
    avoid_weekdays: Optional[List[str]] = Field(default_factory=list, description="Weekdays to avoid")
    prefer_mornings: bool = Field(False, description="Prefer morning slots")
    prefer_afternoons: Optional[bool] = Field(False, description="Prefer afternoon slots")
    prefer_evenings: Optional[bool] = Field(False, description="Prefer evening slots")
    prefer_weekdays: Optional[List[str]] = Field(default_factory=list, description="Preferred weekdays")


class CurriculumCommitInput(BaseModel):
    preview: Dict[str, Any] = Field(..., description="Preview data from build")
    create_calendar_events: bool = Field(True, description="Create calendar events")
    placement: CurriculumPlacementInput = Field(..., description="Placement options")
    prefer_placeholder_slots: Optional[bool] = Field(True, description="When true, fill empty Plan My Year slots first before creating new events")
    add_to_backlog: Optional[bool] = Field(False, description="Add all lessons to backlog")
    lesson_backlog_map: Optional[Dict[str, bool]] = Field(None, description="Map of lesson index to backlog status")


class LessonForPacing(BaseModel):
    """Minimal lesson data for pacing preview."""
    title: Optional[str] = None
    sequence_index: Optional[int] = None
    minutes_est: Optional[int] = 60


class PreviewPacingInput(BaseModel):
    """Input for lesson-to-slot mapping preview (Phase 2: parser output separate from commit)."""
    family_id: str = Field(..., description="Family ID")
    subject_id: Optional[str] = Field(None, description="Subject ID; if null, only generic slots may be used")
    student_ids: List[str] = Field(..., description="Student IDs for slot matching")
    start_date: str = Field(..., description="Start date YYYY-MM-DD")
    end_date: str = Field(..., description="End date YYYY-MM-DD")
    academic_year_id: Optional[str] = Field(None, description="Optional: limit to slots from this plan")
    lessons: List[LessonForPacing] = Field(..., description="Ordered list of lessons to map onto slots")


class RepaceInput(BaseModel):
    """Phase 4: Re-pace syllabus after trip — same as preview_pacing plus excluded date range."""
    family_id: str = Field(..., description="Family ID")
    subject_id: Optional[str] = Field(None, description="Subject ID")
    student_ids: List[str] = Field(..., description="Student IDs")
    start_date: str = Field(..., description="Start date YYYY-MM-DD")
    end_date: str = Field(..., description="End date YYYY-MM-DD")
    academic_year_id: Optional[str] = Field(None, description="Academic year ID")
    lessons: List[LessonForPacing] = Field(..., description="Ordered lessons")
    exclude_start: Optional[str] = Field(None, description="Exclude slots on or after this date (trip start) YYYY-MM-DD")
    exclude_end: Optional[str] = Field(None, description="Exclude slots on or before this date (trip end) YYYY-MM-DD")


# --- Generate Curriculum (from scratch) ---

class GenerateCurriculumDraftRequest(BaseModel):
    """Request for AI-generated curriculum draft. Generation only; no scheduling."""
    subject_id: str = Field(..., description="Subject ID")
    family_id: str = Field(..., description="Family ID")
    subject_name: str = Field(..., description="Subject name for prompt and subject_tags")
    child_ids: Optional[List[str]] = Field(None, description="Optional learner child IDs")
    learner_stage: Optional[str] = Field(None, description="e.g. K-2, 3-5, 6-8, 9-12")
    age_range: Optional[Dict[str, int]] = Field(None, description="Optional min/max age")
    generation_scope: str = Field(..., description="Course goal / scope description")
    duration_mode: Literal["single_unit", "multi_unit_course", "semester", "full_year", "custom_weeks"] = Field(
        "multi_unit_course", description="Duration type"
    )
    custom_weeks: Optional[int] = Field(None, ge=1, le=52)
    lesson_count_target: Optional[int] = Field(None, ge=1, le=500)
    typical_lesson_minutes: Optional[int] = Field(None, ge=5, le=240)
    educational_style: Optional[str] = Field(None, description="e.g. traditional, project-based, Charlotte Mason")
    rigor_level: Optional[Literal["gentle", "standard", "advanced"]] = None
    include_assessments: bool = True
    include_projects: bool = True
    include_materials: bool = True
    include_pacing: bool = True
    special_instructions: Optional[str] = None


class DraftLesson(BaseModel):
    temp_id: str
    title: str
    objective: Optional[str] = None
    notes: Optional[str] = None
    sequence_index: int
    minutes_est: Optional[int] = 60
    modality: Optional[str] = None
    lesson_type: Optional[str] = None
    materials: Optional[List[str]] = None
    assessment_idea: Optional[str] = None
    pacing_suggestion: Optional[str] = None
    difficulty: Optional[str] = "standard"


class DraftUnit(BaseModel):
    temp_id: str
    title: str
    description: Optional[str] = None
    sequence_index: int
    estimated_total_minutes: Optional[int] = None
    pacing_note: Optional[str] = None
    lessons: List[DraftLesson]


class DraftCurriculum(BaseModel):
    """Draft curriculum returned from generate-draft and sent to commit-generated-draft."""
    subject_id: str
    family_id: str
    source_mode: Literal["ai_generate"] = "ai_generate"
    course_title: Optional[str] = None
    summary: Optional[str] = None
    estimated_total_minutes: Optional[int] = None
    units: List[DraftUnit]
    warnings: Optional[List[str]] = None


class CommitGeneratedCurriculumRequest(BaseModel):
    """Approved draft to persist to curriculum_units and curriculum_lessons."""
    subject_id: str
    family_id: str
    subject_name: str = Field(..., description="Used for curriculum_units.subject_tags")
    draft: DraftCurriculum


class CommitGeneratedCurriculumResponse(BaseModel):
    units_created: int
    lessons_created: int
    unit_ids: List[str]
    lesson_ids: List[str]
    subject_id: str
    source_type: str = "ai_generated"


# --- Parse plain text / Import & extract ---

class ParsePlainTextRequest(BaseModel):
    """Request for plain-text curriculum extraction (extract structure only, do not generate)."""
    subject_id: str = Field(..., description="Subject ID")
    family_id: str = Field(..., description="Family ID")
    subject_name: str = Field(..., description="Subject name")
    raw_text: str = Field(..., description="Pasted syllabus/outline text")
    source_title: Optional[str] = None
    source_type: Optional[Literal["auto_detect", "syllabus", "lesson_list", "pacing_guide", "weekly_plan", "course_outline"]] = None
    parse_mode: Optional[Literal["auto_detect", "unit_based", "lesson_based", "assignment_based", "week_based", "date_based"]] = None
    detect_dates: bool = True
    preserve_source_headings: bool = True
    ignore_policy_text: bool = True
    extract_assignments: bool = True
    extract_assessments: bool = True
    learner_stage: Optional[str] = None
    special_instructions: Optional[str] = None


class ParsedDraftLesson(BaseModel):
    temp_id: str
    title: str
    objective: Optional[str] = None
    notes: Optional[str] = None
    sequence_index: int
    minutes_est: Optional[int] = None
    modality: Optional[str] = None
    lesson_type: Optional[str] = "lesson"
    date_text: Optional[str] = None
    suggested_date: Optional[str] = None
    inferred_from: Optional[List[str]] = None
    confidence: Optional[float] = None


class ParsedDraftUnit(BaseModel):
    temp_id: str
    source_label: Optional[str] = None
    title: str
    description: Optional[str] = None
    sequence_index: int
    inferred_from: Optional[List[str]] = None
    lessons: List[ParsedDraftLesson] = Field(default_factory=list)
    assignments: Optional[List[Dict[str, Any]]] = None
    assessments: Optional[List[Dict[str, Any]]] = None


class ParsedDraftUnassignedItem(BaseModel):
    temp_id: str
    raw_text: str
    inferred_type: Optional[str] = None
    confidence: Optional[float] = None
    reason: Optional[str] = None


class ParsedDraftCurriculum(BaseModel):
    """Parsed draft from parse-text; sent to commit-parsed-draft after review."""
    subject_id: str
    family_id: str
    source_mode: Literal["plain_text_parse"] = "plain_text_parse"
    source_title: Optional[str] = None
    source_type: Optional[str] = None
    raw_text: str
    summary: Optional[str] = None
    units: List[ParsedDraftUnit] = Field(default_factory=list)
    unassigned_items: Optional[List[ParsedDraftUnassignedItem]] = Field(default_factory=list)
    ignored_items: Optional[List[Dict[str, str]]] = Field(default_factory=list)
    parser_warnings: Optional[List[str]] = Field(default_factory=list)
    parser_metadata: Optional[Dict[str, Any]] = None


class CommitParsedDraftRequest(BaseModel):
    """Approved parsed draft to persist (syllabus_imports + curriculum_units + curriculum_lessons)."""
    subject_id: str
    family_id: str
    subject_name: str = Field(..., description="For curriculum_units.subject_tags")
    draft: ParsedDraftCurriculum


class CommitParsedDraftResponse(BaseModel):
    syllabus_import_id: str
    units_created: int
    lessons_created: int
    unit_ids: List[str]
    lesson_ids: List[str]
    subject_id: str
    source_type: str = "plain_text_parsed"


# --- Manual curriculum (Add unit manually) ---

class ManualLessonDraft(BaseModel):
    temp_id: Optional[str] = None
    title: str
    objective: Optional[str] = None
    notes: Optional[str] = None
    sequence_index: int
    minutes_est: Optional[int] = None
    modality: Optional[str] = None
    lesson_type: Optional[str] = "lesson"
    materials: Optional[List[str]] = None
    is_placeholder: Optional[bool] = False
    cadence_metadata: Optional[Dict[str, Any]] = None


class ManualUnitDraft(BaseModel):
    temp_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    sequence_index: int
    inferred: Optional[bool] = False
    lessons: List[ManualLessonDraft] = Field(default_factory=list)


class ManualDraftPayload(BaseModel):
    title: Optional[str] = None
    units: List[ManualUnitDraft] = Field(default_factory=list)


class CommitManualDraftRequest(BaseModel):
    """Manual curriculum draft from Add unit manually flow. No AI; validate and persist only."""
    subject_id: str
    family_id: str
    subject_name: str = Field(..., description="For curriculum_units.subject_tags")
    builder_mode: Literal["rich_units", "class_days"] = "rich_units"
    draft: ManualDraftPayload


class CommitManualDraftResponse(BaseModel):
    subject_id: str
    family_id: str
    source_type: str = "manual"
    builder_mode: str
    units_created_count: int
    lessons_created_count: int
    unit_ids: List[str]
    lesson_ids: List[str]


# --- Helper Functions ---

async def extract_material_text(material_id: str, family_id: str) -> str:
    """
    Extract text from a material (from notes field or PDF if applicable).
    """
    supabase = get_admin_client()
    
    try:
        # Get material metadata using admin client
        # Try with family_id filter first
        try:
            material_res = supabase.table("materials").select("*").eq("id", material_id).eq("family_id", family_id).single().execute()
        except Exception as e:
            # If that fails due to permissions, try without family_id filter (admin should have access)
            log_event("curriculum.material_extraction_fallback", material_id=material_id, error=str(e))
            try:
                material_res = supabase.table("materials").select("*").eq("id", material_id).single().execute()
                # Verify the material belongs to the family
                if material_res.data and material_res.data.get("family_id") != family_id:
                    raise HTTPException(status_code=403, detail="Material does not belong to this family")
            except HTTPException:
                raise
            except Exception as e2:
                # If both fail, it's likely a permissions issue
                log_event("curriculum.material_extraction_permission_error", material_id=material_id, error=str(e2))
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to access materials table. Please check service role configuration. Error: {str(e2)}"
                )
        
        if not material_res.data:
            raise HTTPException(status_code=404, detail="Material not found")
        
        material = material_res.data
        
        # First, try to extract from PDF if it exists (PDF content takes priority)
        storage_path = material.get("storage_path")
        mime = material.get("mime", "").lower()
        filename = material.get("filename", "").lower()
        material_title = material.get("title", "").lower()
        
        # Check if it's a PDF by mime type or filename
        is_pdf = (mime == "application/pdf" or 
                  filename.endswith(".pdf") or 
                  material_title.endswith(".pdf"))
        
        if storage_path and is_pdf:
            # Download PDF from Supabase storage and extract text
            try:
                from routers.util import get_file_text_from_storage
                # Materials are stored in the 'evidence' bucket
                log_event("curriculum.material_pdf_extraction_attempt", material_id=material_id, storage_path=storage_path, bucket="evidence")
                text = await get_file_text_from_storage("evidence", storage_path)
                if text and text.strip():
                    log_event("curriculum.material_pdf_extraction_success", material_id=material_id, text_length=len(text), preview=text[:200])
                    return text
                else:
                    log_event("curriculum.material_pdf_extraction_empty", material_id=material_id, storage_path=storage_path)
            except ImportError as e:
                log_event("curriculum.material_pdf_extraction_error", material_id=material_id, error=f"Library not available: {str(e)}")
            except Exception as e:
                log_event("curriculum.material_pdf_extraction_error", material_id=material_id, error=str(e), storage_path=storage_path, error_type=type(e).__name__)
                # Fall through to notes/metadata if extraction fails
        
        # If PDF extraction failed or no PDF, check for notes
        notes = material.get("notes")
        if notes and notes.strip():
            log_event("curriculum.material_using_notes", material_id=material_id, notes_length=len(notes))
            return notes
        
        # If no usable content, use title and metadata
        title = material.get("title", "Untitled Material")
        provider = material.get("provider_name", "")
        subject = material.get("subject_key", "")
        description = material.get("description", "")
        
        parts = [title]
        if description:
            parts.append(description)
        if provider:
            parts.append(f"Provider: {provider}")
        if subject:
            parts.append(f"Subject: {subject}")
        
        return "\n".join(parts)
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.material_extraction_error", material_id=material_id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract material text: {str(e)}"
        )


async def extract_pdf_text(file_id: str, family_id: str) -> str:
    """
    Extract text from PDF file.
    Falls back to OCR if needed.
    """
    supabase = get_admin_client()
    
    try:
        # Get file metadata
        file_res = supabase.table("uploads").select("*").eq("id", file_id).eq("family_id", family_id).single().execute()
        if not file_res.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_data = file_res.data
        file_path = file_data.get("storage_path") or file_data.get("path")
        
        if not file_path:
            raise HTTPException(status_code=400, detail="File path not found")
        
        # Try PyMuPDF first
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(file_path)
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            return text
        except ImportError:
            pass
        
        # Try pdfplumber
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                text = ""
                for page in pdf.pages:
                    text += page.extract_text() or ""
            return text
        except ImportError:
            pass
        
        # Fallback: return error message
        raise HTTPException(
            status_code=503,
            detail="PDF extraction requires PyMuPDF or pdfplumber. Please paste syllabus text instead."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.pdf_extraction_error", file_id=file_id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract PDF text: {str(e)}"
        )


async def normalize_syllabus_text(text: str) -> str:
    """
    Use LLM to normalize syllabus text into structured format.
    """
    from llm import llm_extract_outline
    
    try:
        outline = await llm_extract_outline(text)
        # Convert outline back to normalized text format
        normalized = json.dumps(outline, indent=2)
        return normalized
    except Exception as e:
        log_event("curriculum.syllabus_normalization_error", error=str(e))
        # Return original text if normalization fails
        return text


# --- Routes ---

@router.get("/lessons")
async def list_curriculum_lessons(
    subject_id: Optional[str] = Query(None, description="Filter by subject ID (units whose subject_tags match this subject)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    List curriculum lessons for the family, optionally filtered by subject.
    Used by Fill Slot picker to choose a lesson for an empty slot.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        supabase = get_admin_client()

        units_query = supabase.table("curriculum_units").select("id, title").eq("family_id", family_id)
        if subject_id:
            subj_res = supabase.table("subject").select("id, name").eq("id", subject_id).eq("family_id", family_id).limit(1).execute()
            if not subj_res.data:
                return []
            subject_name = (subj_res.data[0].get("name") or "").strip()
            if subject_name:
                units_query = units_query.contains("subject_tags", [subject_name])
        units_res = units_query.order("created_at", desc=True).execute()
        units = units_res.data or []
        if not units:
            return []
        unit_ids = [u["id"] for u in units]
        unit_by_id = {u["id"]: u for u in units}

        lessons_res = supabase.table("curriculum_lessons").select("id, title, unit_id, sequence_index").in_("unit_id", unit_ids).order("sequence_index", desc=False).execute()
        lessons = lessons_res.data or []
        out = []
        for les in lessons:
            unit = unit_by_id.get(les["unit_id"]) or {}
            out.append({
                "id": les["id"],
                "title": les.get("title") or "Lesson",
                "unit_id": les["unit_id"],
                "unit_title": unit.get("title") or "Unit",
                "sequence_index": les.get("sequence_index", 0),
            })
        return out
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.list_lessons.error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list curriculum lessons")


@router.post("/build")
async def build_curriculum(
    body: CurriculumBuildInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Build curriculum preview from topic, syllabus, PDF, or link.
    Returns structured unit + lessons + pacing (preview only).
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        supabase = get_admin_client()
        
        # Validate students belong to family
        for student_id in body.student_ids:
            if not child_belongs_to_family(student_id, family_id):
                raise HTTPException(status_code=403, detail=f"Student {student_id} not found")
        
        # Get student profiles
        students_res = supabase.table("children").select(
            "id, first_name, grade_level, grade, learning_style, interests"
        ).in_("id", body.student_ids).execute()
        
        students = students_res.data or []
        
        # Get support profiles separately
        support_profiles_res = supabase.table("child_support_profiles").select(
            "child_id, diagnoses, learning_modalities, support_needs, executive_function"
        ).in_("child_id", body.student_ids).execute()
        
        support_profiles_by_child = {}
        for profile in (support_profiles_res.data or []):
            child_id = profile.get("child_id")
            if child_id:
                support_profiles_by_child[child_id] = {
                    "diagnoses": profile.get("diagnoses", []),
                    "learning_modalities": profile.get("learning_modalities", []),
                    "support_needs": profile.get("support_needs", []),
                    "executive_function": profile.get("executive_function", [])
                }
        
        # Prepare input text based on mode
        input_text = ""
        source_ref = None
        
        if body.mode == "topic":
            if not body.topic:
                raise HTTPException(status_code=400, detail="Topic is required for topic mode")
            input_text = body.topic
            source_ref = None
        
        elif body.mode == "syllabus":
            if not body.syllabus_text:
                raise HTTPException(status_code=400, detail="Syllabus text is required")
            # Normalize syllabus text
            input_text = await normalize_syllabus_text(body.syllabus_text)
            source_ref = None
        
        elif body.mode == "pdf":
            if not body.source_file_id:
                raise HTTPException(status_code=400, detail="Source file ID is required for PDF mode")
            # Extract text from PDF
            input_text = await extract_pdf_text(body.source_file_id, family_id)
            source_ref = body.source_file_id
        
        elif body.mode == "link":
            if not body.source_url:
                raise HTTPException(status_code=400, detail="Source URL is required for link mode")
            # For now, use URL as input text (could be enhanced to fetch content)
            input_text = f"Curriculum from: {body.source_url}"
            source_ref = body.source_url
        
        elif body.mode == "material":
            if not body.material_id:
                raise HTTPException(status_code=400, detail="Material ID is required for material mode")
            # Extract text from material
            input_text = await extract_material_text(body.material_id, family_id)
            source_ref = body.material_id
        
        else:
            raise HTTPException(status_code=400, detail=f"Invalid mode: {body.mode}")
        
        # Load planning context for availability
        from routers.util import load_planning_context
        
        start_date = body.constraints.start_date or date.today().isoformat()
        context = await load_planning_context(
            family_id=family_id,
            week_start=start_date,
            child_ids=body.student_ids,
            horizon_weeks=body.constraints.weeks
        )
        
        # Build student profiles JSON
        student_profiles = []
        for student in students:
            grade = student.get("grade_level") or student.get("grade") or "Unknown"
            learning_style = student.get("learning_style") or []
            interests = student.get("interests") or []
            support_profile = support_profiles_by_child.get(student["id"], {})
            
            student_profiles.append({
                "child_id": student["id"],
                "name": student.get("first_name", "Student"),
                "grade": str(grade),
                "learning_style": learning_style if isinstance(learning_style, list) else [learning_style] if learning_style else [],
                "interests": interests if isinstance(interests, list) else [interests] if interests else [],
                "support_profile": support_profile
            })
        
        # Call LLM to build curriculum
        from llm import llm_build_curriculum
        
        if not llm_build_curriculum:
            raise HTTPException(
                status_code=503,
                detail="Curriculum builder LLM function not available"
            )
        
        # Build context JSON
        curriculum_context = {
            "input_text": input_text,
            "source_type": body.mode,
            "source_ref": source_ref,
            "students": student_profiles,
            "constraints": {
                "weeks": body.constraints.weeks,
                "minutes_per_day": body.constraints.minutes_per_day,
                "weekdays_only": body.constraints.weekdays_only,
                "difficulty": body.constraints.difficulty,
                "start_date": start_date
            },
            "availability": context.get("availability", []),
            "existing_events": context.get("events", [])
        }
        
        # Call LLM with timeout handling
        try:
            result = await llm_build_curriculum(json.dumps(curriculum_context))
        except ValueError as e:
            # Handle timeout or other LLM errors
            error_msg = str(e)
            if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
                raise HTTPException(
                    status_code=504,
                    detail="Request timed out while generating curriculum. The input may be too long. Please try with a shorter description or add notes to the material instead."
                )
            raise HTTPException(
                status_code=500,
                detail=f"Error generating curriculum: {error_msg}"
            )
        
        # Validate result structure
        if "unit" not in result or "lessons" not in result:
            raise HTTPException(
                status_code=500,
                detail="Invalid curriculum structure returned from LLM"
            )
        
        # Add source_ref to unit
        result["unit"]["source_ref"] = source_ref
        
        # CRITICAL: Ensure student_ids are UUIDs, not names
        # The LLM might return student names, but we need UUIDs
        # Always use the original student_ids from the request
        if "unit" in result:
            # Get the original student_ids (which are UUIDs)
            original_student_ids = [s.get("child_id") for s in student_profiles if s.get("child_id")]
            # Override any student_ids that the LLM might have returned with names
            result["unit"]["student_ids"] = original_student_ids if original_student_ids else body.student_ids
        
        log_event(
            "curriculum.built",
            family_id=family_id,
            mode=body.mode,
            lessons_count=len(result.get("lessons", [])),
            user_id=user["id"]
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.build.error", family_id=family_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error building curriculum: {str(e)}")


# --- Generate Curriculum from scratch (draft only; no scheduling) ---

@router.post("/generate-draft", response_model=DraftCurriculum)
async def generate_curriculum_draft_endpoint(
    body: GenerateCurriculumDraftRequest,
    user: dict = Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    """
    Generate a curriculum draft using OpenAI. Returns structured units and lessons for review.
    Does not persist to DB or create events. Use commit-generated-draft after user approves.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")
        from services.curriculum_generation_service import generate_curriculum_draft as do_generate
        draft = await do_generate(
            subject_id=body.subject_id,
            family_id=body.family_id,
            subject_name=body.subject_name,
            generation_scope=body.generation_scope,
            user_id=user["id"],
            child_ids=body.child_ids,
            learner_stage=body.learner_stage,
            age_range=body.age_range,
            duration_mode=body.duration_mode,
            custom_weeks=body.custom_weeks,
            lesson_count_target=body.lesson_count_target,
            typical_lesson_minutes=body.typical_lesson_minutes,
            educational_style=body.educational_style,
            rigor_level=body.rigor_level,
            include_assessments=body.include_assessments,
            include_projects=body.include_projects,
            include_materials=body.include_materials,
            include_pacing=body.include_pacing,
            special_instructions=body.special_instructions,
        )
        log_event(
            "curriculum.generate_draft.ok",
            family_id=body.family_id,
            subject_id=body.subject_id,
            units_count=len(draft.get("units", [])),
            user_id=user["id"],
        )
        return draft
    except ValueError as e:
        log_event("curriculum.generate_draft.validation_error", error=str(e), family_id=body.family_id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.generate_draft.error", error=str(e), family_id=body.family_id)
        raise HTTPException(status_code=500, detail="Failed to generate curriculum draft")


@router.post("/commit-generated-draft", response_model=CommitGeneratedCurriculumResponse)
async def commit_generated_draft_endpoint(
    body: CommitGeneratedCurriculumRequest,
    user: dict = Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    """
    Persist an approved curriculum draft to curriculum_units and curriculum_lessons.
    Does not create calendar events or fill slots; scheduling integration can hook in later.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")
        supabase = get_admin_client()
        draft = body.draft
        subject_name = (body.subject_name or "").strip() or "Subject"
        subject_tags = [subject_name]
        student_ids = []
        if draft.units and draft.units[0].lessons:
            pass
        unit_ids: List[str] = []
        lesson_ids: List[str] = []
        now_iso = datetime.now(timezone.utc).isoformat()
        for u in draft.units:
            unit_row = {
                "family_id": body.family_id,
                "created_by_uid": user["id"],
                "title": (u.title or "").strip() or "Untitled Unit",
                "source_type": "ai_generated",
                "source_ref": None,
                "grade_band": None,
                "subject_tags": subject_tags,
                "student_ids": student_ids,
                "total_minutes_est": u.estimated_total_minutes or 0,
                "weeks_est": 1,
                "metadata": {"course_title": draft.course_title, "summary": draft.summary, "pacing_note": u.pacing_note} if (draft.course_title or draft.summary or u.pacing_note) else {},
                "updated_at": now_iso,
            }
            ins = supabase.table("curriculum_units").insert(unit_row).execute()
            if not ins.data or len(ins.data) == 0:
                raise HTTPException(status_code=500, detail="Failed to insert curriculum unit")
            unit_id = ins.data[0]["id"]
            unit_ids.append(unit_id)
            for seq, le in enumerate(u.lessons, start=1):
                modality = (le.modality or "practice").strip().lower()
                if modality not in {"reading", "video", "hands_on", "discussion", "practice", "quiz", "project"}:
                    modality = "practice"
                difficulty = (le.difficulty or "standard").strip().lower()
                if difficulty not in {"gentle", "standard", "stretch"}:
                    difficulty = "standard"
                lesson_row = {
                    "unit_id": unit_id,
                    "sequence_index": seq,
                    "title": (le.title or "").strip() or "Untitled Lesson",
                    "objective": (le.objective or "").strip() or None,
                    "minutes_est": le.minutes_est if le.minutes_est is not None else 60,
                    "modality": modality,
                    "difficulty": difficulty,
                    "materials": le.materials if le.materials else [],
                    "assessment": {"idea": le.assessment_idea} if le.assessment_idea else {},
                    "prereqs": [],
                    "links": [],
                }
                les_ins = supabase.table("curriculum_lessons").insert(lesson_row).execute()
                if les_ins.data and len(les_ins.data) > 0:
                    lesson_ids.append(les_ins.data[0]["id"])
        log_event(
            "curriculum.commit_generated.ok",
            family_id=body.family_id,
            subject_id=body.subject_id,
            units_created=len(unit_ids),
            lessons_created=len(lesson_ids),
            user_id=user["id"],
        )
        return CommitGeneratedCurriculumResponse(
            units_created=len(unit_ids),
            lessons_created=len(lesson_ids),
            unit_ids=unit_ids,
            lesson_ids=lesson_ids,
            subject_id=body.subject_id,
            source_type="ai_generated",
        )
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.commit_generated.error", error=str(e), family_id=body.family_id)
        raise HTTPException(status_code=500, detail=f"Failed to save curriculum: {str(e)}")


# --- Parse plain text / Import & extract ---

@router.post("/parse-text")
async def parse_plain_text_endpoint(
    body: ParsePlainTextRequest,
    user: dict = Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    """
    Extract structured curriculum from pasted plain text. Two-stage: deterministic pre-parse
    then LLM extraction. Returns draft for review; does not persist. Use commit-parsed-draft after approval.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")
        from services.curriculum_parse_service import extract_curriculum_from_plain_text
        result = await extract_curriculum_from_plain_text(
            subject_id=body.subject_id,
            family_id=body.family_id,
            subject_name=body.subject_name,
            raw_text=body.raw_text,
            source_title=body.source_title,
            source_type=body.source_type,
            parse_mode=body.parse_mode,
            detect_dates=body.detect_dates,
            preserve_source_headings=body.preserve_source_headings,
            ignore_policy_text=body.ignore_policy_text,
            extract_assignments=body.extract_assignments,
            extract_assessments=body.extract_assessments,
            learner_stage=body.learner_stage,
            special_instructions=body.special_instructions,
        )
        log_event(
            "curriculum.parse_text.ok",
            family_id=body.family_id,
            subject_id=body.subject_id,
            units_count=len(result.get("units", [])),
            user_id=user["id"],
        )
        return result
    except ValueError as e:
        log_event("curriculum.parse_text.validation_error", error=str(e), family_id=body.family_id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.parse_text.error", error=str(e), family_id=body.family_id)
        raise HTTPException(status_code=500, detail="Failed to extract structure from text")


@router.post("/commit-parsed-draft", response_model=CommitParsedDraftResponse)
async def commit_parsed_draft_endpoint(
    body: CommitParsedDraftRequest,
    user: dict = Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    """
    Persist approved parsed draft: save raw source to syllabus_imports, then curriculum_units
    and curriculum_lessons with source_ref to the import. Does not create calendar events.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")
        supabase = get_admin_client()
        draft = body.draft
        subject_name = (body.subject_name or "").strip() or "Subject"
        subject_tags = [subject_name]
        now_iso = datetime.now(timezone.utc).isoformat()

        # 1. Save source to syllabus_imports
        import_row = {
            "family_id": body.family_id,
            "subject_id": body.subject_id,
            "source_title": draft.source_title,
            "source_type": draft.source_type,
            "raw_text": draft.raw_text,
            "parse_mode": None,
            "parse_status": "parsed",
            "parser_metadata_json": draft.parser_metadata,
            "updated_at": now_iso,
        }
        ins_import = supabase.table("syllabus_imports").insert(import_row).execute()
        if not ins_import.data or len(ins_import.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to save import source")
        syllabus_import_id = str(ins_import.data[0]["id"])
        source_ref = syllabus_import_id

        unit_ids: List[str] = []
        lesson_ids: List[str] = []
        for u in draft.units:
            unit_row = {
                "family_id": body.family_id,
                "created_by_uid": user["id"],
                "title": (u.title or "").strip() or "Untitled Unit",
                "source_type": "plain_text_parsed",
                "source_ref": source_ref,
                "grade_band": None,
                "subject_tags": subject_tags,
                "student_ids": [],
                "total_minutes_est": 0,
                "weeks_est": 1,
                "metadata": {"source_label": u.source_label, "syllabus_import_id": syllabus_import_id},
                "updated_at": now_iso,
            }
            ins_u = supabase.table("curriculum_units").insert(unit_row).execute()
            if not ins_u.data or len(ins_u.data) == 0:
                raise HTTPException(status_code=500, detail="Failed to insert curriculum unit")
            unit_id = ins_u.data[0]["id"]
            unit_ids.append(unit_id)
            for seq, le in enumerate(u.lessons, start=1):
                modality = (le.modality or "practice").strip().lower()
                if modality not in {"reading", "video", "hands_on", "discussion", "practice", "quiz", "project"}:
                    modality = "practice"
                lesson_row = {
                    "unit_id": unit_id,
                    "sequence_index": seq,
                    "title": (le.title or "").strip() or "Untitled Lesson",
                    "objective": (le.objective or "").strip() or None,
                    "minutes_est": le.minutes_est if le.minutes_est is not None else 60,
                    "modality": modality,
                    "difficulty": "standard",
                    "materials": [],
                    "assessment": {},
                    "prereqs": [],
                    "links": [],
                }
                les_ins = supabase.table("curriculum_lessons").insert(lesson_row).execute()
                if les_ins.data and len(les_ins.data) > 0:
                    lesson_ids.append(les_ins.data[0]["id"])

        log_event(
            "curriculum.commit_parsed.ok",
            family_id=body.family_id,
            subject_id=body.subject_id,
            syllabus_import_id=syllabus_import_id,
            units_created=len(unit_ids),
            lessons_created=len(lesson_ids),
            user_id=user["id"],
        )
        return CommitParsedDraftResponse(
            syllabus_import_id=syllabus_import_id,
            units_created=len(unit_ids),
            lessons_created=len(lesson_ids),
            unit_ids=unit_ids,
            lesson_ids=lesson_ids,
            subject_id=body.subject_id,
            source_type="plain_text_parsed",
        )
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.commit_parsed.error", error=str(e), family_id=body.family_id)
        raise HTTPException(status_code=500, detail=f"Failed to save parsed curriculum: {str(e)}")


# --- Manual curriculum commit (no AI; validate + persist) ---
# Manual builder starts in the frontend (ManualCurriculumBuilderModal). Two sub-modes (rich_units / class_days)
# both produce a shared ManualDraftPayload; only commit is server-side. Validation runs here; units and lessons
# are persisted to curriculum_units (source_type=manual) and curriculum_lessons. Placeholder/cadence metadata
# is stored in lesson.assessment JSONB for later scheduling. Future scheduling can list lessons by subject_tags
# and fill plan slots or set events.curriculum_lesson_id.
MANUAL_LESSON_TYPES = {"lesson", "assignment", "project", "assessment", "review", "activity", "reading", "lab", "placeholder"}
MANUAL_MODALITY_MAP = {
    "reading": "reading",
    "lesson": "practice",
    "assignment": "practice",
    "project": "project",
    "assessment": "quiz",
    "quiz": "quiz",
    "review": "practice",
    "activity": "hands_on",
    "lab": "hands_on",
    "placeholder": "practice",
}


def _validate_manual_draft(draft: ManualDraftPayload) -> None:
    """Raise ValueError if draft is invalid."""
    if not draft.units:
        raise ValueError("At least one unit is required.")
    for i, u in enumerate(draft.units):
        if not (u.title or "").strip():
            raise ValueError(f"Unit {i + 1} must have a title.")
        if not u.lessons:
            raise ValueError(f"Unit '{u.title}' must have at least one lesson.")
        for j, le in enumerate(u.lessons):
            if not (le.title or "").strip():
                raise ValueError(f"Lesson {j + 1} in unit '{u.title}' must have a title.")


@router.post("/commit-manual-draft", response_model=CommitManualDraftResponse)
async def commit_manual_draft_endpoint(
    body: CommitManualDraftRequest,
    user: dict = Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    """
    Persist manually entered curriculum (Add unit manually). No AI or parsing.
    Validates draft and saves to curriculum_units and curriculum_lessons (source_type=manual).
    Future scheduling can consume these lessons to fill plan slots or create events.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")
        _validate_manual_draft(body.draft)
        subject_name = (body.subject_name or "").strip() or "Subject"
        subject_tags = [subject_name]
        supabase = get_admin_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        unit_ids: List[str] = []
        lesson_ids: List[str] = []
        for ui, u in enumerate(body.draft.units):
            unit_title = (u.title or "").strip() or f"Unit {ui + 1}"
            unit_meta = {}
            if getattr(u, "inferred", False):
                unit_meta["inferred_unit"] = True
            unit_meta["builder_mode"] = body.builder_mode
            unit_row = {
                "family_id": body.family_id,
                "created_by_uid": user["id"],
                "title": unit_title,
                "source_type": "manual",
                "source_ref": None,
                "grade_band": None,
                "subject_tags": subject_tags,
                "student_ids": [],
                "total_minutes_est": 0,
                "weeks_est": 1,
                "metadata": unit_meta,
                "updated_at": now_iso,
            }
            ins_u = supabase.table("curriculum_units").insert(unit_row).execute()
            if not ins_u.data or len(ins_u.data) == 0:
                raise HTTPException(status_code=500, detail="Failed to insert curriculum unit")
            unit_id = ins_u.data[0]["id"]
            unit_ids.append(unit_id)
            for seq, le in enumerate(u.lessons, start=1):
                lesson_title = (le.title or "").strip() or f"Lesson {seq}"
                if not lesson_title:
                    continue
                lt = (le.lesson_type or "lesson").strip().lower()
                if lt not in MANUAL_LESSON_TYPES:
                    lt = "lesson"
                modality = (le.modality or MANUAL_MODALITY_MAP.get(lt) or "practice").strip().lower()
                if modality not in {"reading", "video", "hands_on", "discussion", "practice", "quiz", "project"}:
                    modality = "practice"
                minutes = le.minutes_est if le.minutes_est is not None else 60
                if not isinstance(minutes, int):
                    try:
                        minutes = int(minutes) if minutes is not None else 60
                    except (TypeError, ValueError):
                        minutes = 60
                minutes = max(1, min(480, minutes))
                assessment_payload = {}
                if lt:
                    assessment_payload["lesson_type"] = lt
                if getattr(le, "is_placeholder", False):
                    assessment_payload["is_placeholder"] = True
                if getattr(le, "cadence_metadata", None):
                    assessment_payload["cadence_metadata"] = le.cadence_metadata
                lesson_row = {
                    "unit_id": unit_id,
                    "sequence_index": seq,
                    "title": lesson_title,
                    "objective": (le.objective or "").strip() or None,
                    "minutes_est": minutes,
                    "modality": modality,
                    "difficulty": "standard",
                    "materials": le.materials if isinstance(le.materials, list) else [],
                    "assessment": assessment_payload,
                    "prereqs": [],
                    "links": [],
                }
                if getattr(le, "notes", None) and (le.notes or "").strip():
                    lesson_row["assessment"] = {**lesson_row["assessment"], "notes": (le.notes or "").strip()}
                les_ins = supabase.table("curriculum_lessons").insert(lesson_row).execute()
                if les_ins.data and len(les_ins.data) > 0:
                    lesson_ids.append(les_ins.data[0]["id"])
        log_event(
            "curriculum.commit_manual.ok",
            family_id=body.family_id,
            subject_id=body.subject_id,
            units_created=len(unit_ids),
            lessons_created=len(lesson_ids),
            user_id=user["id"],
        )
        return CommitManualDraftResponse(
            subject_id=body.subject_id,
            family_id=body.family_id,
            source_type="manual",
            builder_mode=body.builder_mode,
            units_created_count=len(unit_ids),
            lessons_created_count=len(lesson_ids),
            unit_ids=unit_ids,
            lesson_ids=lesson_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.commit_manual.error", error=str(e), family_id=body.family_id)
        raise HTTPException(status_code=500, detail=f"Failed to save manual curriculum: {str(e)}")


def _get_eligible_plan_slots(
    supabase,
    family_id: str,
    student_ids: List[str],
    start_date_str: str,
    end_date_str: str,
    subject_id: Optional[str] = None,
    academic_year_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Return empty Plan My Year slots in [start_date, end_date] for the given students and optional subject.
    Used by preview_pacing and by commit (same logic). Order by start_ts ascending.
    """
    range_start_d = date.fromisoformat(start_date_str)
    range_end_d = date.fromisoformat(end_date_str)
    range_start_ts = datetime.combine(range_start_d, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    range_end_ts = datetime.combine(range_end_d, datetime.max.time(), tzinfo=timezone.utc).isoformat()
    query = (
        supabase.table("events")
        .select("id, start_ts, end_ts, child_id, subject_id")
        .eq("family_id", family_id)
        .eq("generated_by", "plan_year")
        .is_("curriculum_lesson_id", "null")
        .is_("deleted_at", "null")
        .gte("start_ts", range_start_ts)
        .lte("start_ts", range_end_ts)
        .in_("child_id", student_ids)
        .order("start_ts", desc=False)
    )
    if subject_id:
        query = query.eq("subject_id", subject_id)
    else:
        query = query.is_("subject_id", "null")
    if academic_year_id:
        query = query.eq("academic_year_id", academic_year_id)
    res = query.execute()
    return list(res.data or [])


@router.get("/fill_placeholders_suggestion")
async def fill_placeholders_suggestion(
    family_id: str = Query(..., description="Family ID"),
    academic_year_id: str = Query(..., description="Academic year ID"),
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Phase 4: Return count of empty placeholder slots (generated_by=plan_year, no curriculum) in range.
    UI can use this to prompt "Fill open placeholders with lessons" (e.g. from Build from material).
    """
    fid = get_family_id_for_user(user["id"])
    if not fid or fid != family_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    supabase = get_admin_client()
    try:
        range_start_d = date.fromisoformat(start_date[:10])
        range_end_d = date.fromisoformat(end_date[:10])
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid start_date or end_date")
    range_start_ts = datetime.combine(range_start_d, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    range_end_ts = datetime.combine(range_end_d, datetime.max.time(), tzinfo=timezone.utc).isoformat()
    res = (
        supabase.table("events")
        .select("id", count="exact")
        .eq("family_id", family_id)
        .eq("academic_year_id", academic_year_id)
        .eq("generated_by", "plan_year")
        .is_("curriculum_lesson_id", "null")
        .is_("deleted_at", "null")
        .gte("start_ts", range_start_ts)
        .lte("start_ts", range_end_ts)
    )
    try:
        data = res.execute()
        count = data.count if getattr(data, "count", None) is not None else len(data.data or [])
    except Exception:
        count = 0
    return {"empty_slot_count": max(0, count or 0), "message": f"You have {max(0, count or 0)} open placeholder slot(s). Add curriculum (Build from material) to fill them with lessons."}


@router.post("/preview_pacing")
async def preview_pacing(
    body: PreviewPacingInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Phase 2: Map curriculum sequence onto eligible Plan My Year slots (no commit).
    Returns lesson_index -> slot mapping so the UI can show "Lesson 1 → Mar 18 9am" before commit.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id or family_id != body.family_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    supabase = get_admin_client()
    student_ids = [s for s in body.student_ids if s]
    if not student_ids:
        raise HTTPException(status_code=400, detail="At least one student_id required")
    slots = _get_eligible_plan_slots(
        supabase,
        body.family_id,
        student_ids,
        body.start_date,
        body.end_date,
        subject_id=body.subject_id,
        academic_year_id=body.academic_year_id,
    )
    lessons = body.lessons or []
    mapping = []
    for i, lesson in enumerate(lessons):
        if i >= len(slots):
            break
        slot = slots[i]
        start_ts = slot.get("start_ts") or ""
        end_ts = slot.get("end_ts") or ""
        date_ymd = start_ts[:10] if len(start_ts) >= 10 else ""
        title = getattr(lesson, "title", None) if hasattr(lesson, "title") else (lesson.get("title") if isinstance(lesson, dict) else None)
        mapping.append({
            "lesson_index": i,
            "lesson_title": title or f"Lesson {i + 1}",
            "slot_id": slot.get("id"),
            "date_ymd": date_ymd,
            "start_ts": start_ts,
            "end_ts": end_ts,
            "child_id": slot.get("child_id"),
        })
    unmapped_lesson_count = max(0, len(lessons) - len(slots))
    return {
        "mapping": mapping,
        "slots_used": len(mapping),
        "total_slots_available": len(slots),
        "total_lessons": len(lessons),
        "unmapped_lesson_count": unmapped_lesson_count,
    }


@router.post("/repace")
async def repace(
    body: RepaceInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Phase 4: Re-pace syllabus after a trip — exclude a date range (e.g. trip week) and map lessons
    onto remaining slots. Returns same shape as preview_pacing so UI can show updated placement.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id or family_id != body.family_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    supabase = get_admin_client()
    student_ids = [s for s in body.student_ids if s]
    if not student_ids:
        raise HTTPException(status_code=400, detail="At least one student_id required")
    slots = _get_eligible_plan_slots(
        supabase,
        body.family_id,
        student_ids,
        body.start_date,
        body.end_date,
        subject_id=body.subject_id,
        academic_year_id=body.academic_year_id,
    )
    # Exclude slots whose date falls in [exclude_start, exclude_end]
    if body.exclude_start and body.exclude_end:
        try:
            ex_start = body.exclude_start[:10]
            ex_end = body.exclude_end[:10]
            slots = [s for s in slots if s.get("start_ts") and (s["start_ts"][:10] < ex_start or s["start_ts"][:10] > ex_end)]
        except (TypeError, IndexError):
            pass
    lessons = body.lessons or []
    mapping = []
    for i, lesson in enumerate(lessons):
        if i >= len(slots):
            break
        slot = slots[i]
        start_ts = slot.get("start_ts") or ""
        end_ts = slot.get("end_ts") or ""
        date_ymd = start_ts[:10] if len(start_ts) >= 10 else ""
        title = getattr(lesson, "title", None) if hasattr(lesson, "title") else (lesson.get("title") if isinstance(lesson, dict) else None)
        mapping.append({
            "lesson_index": i,
            "lesson_title": title or f"Lesson {i + 1}",
            "slot_id": slot.get("id"),
            "date_ymd": date_ymd,
            "start_ts": start_ts,
            "end_ts": end_ts,
            "child_id": slot.get("child_id"),
        })
    unmapped_lesson_count = max(0, len(lessons) - len(slots))
    return {
        "mapping": mapping,
        "slots_used": len(mapping),
        "total_slots_available": len(slots),
        "total_lessons": len(lessons),
        "unmapped_lesson_count": unmapped_lesson_count,
    }


@router.post("/commit")
async def commit_curriculum(
    body: CurriculumCommitInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Commit curriculum to database and optionally create calendar events.
    """
    # Add print statement to verify request reaches endpoint (even if logging fails)
    print(f"[CURRICULUM_COMMIT] Request received - user_id: {user.get('id')}")
    
    # Initialize variables at the start to ensure they exist even if exception occurs early
    family_id = None
    unit_id = None
    lesson_ids = []
    event_ids = []
    backlog_item_ids = []
    pacing_res = None
    
    try:
        # Log the request start
        log_event("curriculum.commit.start", user_id=user.get("id"), has_preview=bool(body.preview))
        print(f"[CURRICULUM_COMMIT] Logged start event")
        
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            print(f"[CURRICULUM_COMMIT] ERROR: Family not found for user {user.get('id')}")
            log_event("curriculum.commit.family_not_found", user_id=user.get("id"))
            raise HTTPException(status_code=404, detail="Family not found")
        
        print(f"[CURRICULUM_COMMIT] Family ID: {family_id}")
        supabase = get_admin_client()
        
        preview = body.preview
        unit_data = preview.get("unit", {}) if preview else {}
        lessons_data = preview.get("lessons", []) if preview else []
        pacing_data = preview.get("pacing", {}) if preview else {}
        
        print(f"[CURRICULUM_COMMIT] Preview data - unit: {bool(unit_data)}, lessons: {len(lessons_data) if lessons_data else 0}")
        
        log_event("curriculum.commit.preview_data",
                 family_id=family_id,
                 has_unit=bool(unit_data),
                 has_lessons=bool(lessons_data),
                 lessons_count=len(lessons_data) if lessons_data else 0)
        
        if not unit_data or not lessons_data:
            print(f"[CURRICULUM_COMMIT] ERROR: Invalid preview data")
            log_event("curriculum.commit.invalid_preview", family_id=family_id)
            raise HTTPException(status_code=400, detail="Invalid preview data")
        
        # Create curriculum unit
        # Validate and sanitize student_ids - ensure they are UUIDs, not names
        import uuid
        student_ids_raw = unit_data.get("student_ids", [])
        student_ids_validated = []
        for sid in student_ids_raw:
            if not sid:
                continue
            # Check if it's a valid UUID
            try:
                # Try to parse as UUID - if it succeeds, it's valid
                uuid_obj = uuid.UUID(str(sid))
                student_ids_validated.append(str(uuid_obj))
            except (ValueError, AttributeError, TypeError):
                # Not a valid UUID - might be a name, try to find the child
                print(f"[CURRICULUM_COMMIT] WARNING: student_id '{sid}' is not a valid UUID, trying to find child by name...")
                try:
                    child_res = supabase.table("children").select("id").eq("first_name", str(sid)).eq("family_id", family_id).limit(1).execute()
                    if child_res.data:
                        child_uuid = child_res.data[0]["id"]
                        student_ids_validated.append(child_uuid)
                        print(f"[CURRICULUM_COMMIT] Found child '{sid}' with ID: {child_uuid}")
                    else:
                        print(f"[CURRICULUM_COMMIT] ERROR: Could not find child with name '{sid}' in family {family_id}")
                except Exception as e:
                    print(f"[CURRICULUM_COMMIT] ERROR looking up child '{sid}': {e}")
        
        if not student_ids_validated:
            print(f"[CURRICULUM_COMMIT] ERROR: No valid student IDs found! Raw student_ids: {student_ids_raw}")
            raise HTTPException(status_code=400, detail=f"No valid student IDs found in curriculum data. Received: {student_ids_raw}")
        
        unit_record = {
            "family_id": family_id,
            "created_by_uid": user["id"],
            "title": unit_data.get("title", "Untitled Unit"),
            "source_type": unit_data.get("source_type", "topic"),
            "source_ref": unit_data.get("source_ref"),
            "grade_band": unit_data.get("grade_band", ""),
            "subject_tags": unit_data.get("subject_tags", []),
            "student_ids": student_ids_validated,  # Use validated UUIDs
            "total_minutes_est": unit_data.get("total_minutes_est", 0),
            "weeks_est": unit_data.get("weeks_est", 1),
            "metadata": unit_data.get("metadata", {})
        }
        
        print(f"[CURRICULUM_COMMIT] Creating curriculum unit...")
        print(f"[CURRICULUM_COMMIT] Unit record: {unit_record}")
        print(f"[CURRICULUM_COMMIT] Validated student_ids: {student_ids_validated}")
        try:
            unit_res = supabase.table("curriculum_units").insert(unit_record).execute()
            if not unit_res.data:
                print(f"[CURRICULUM_COMMIT] ERROR: Failed to create curriculum unit - no data returned")
                raise HTTPException(status_code=500, detail="Failed to create curriculum unit: no data returned")
        except Exception as insert_error:
            error_str = str(insert_error)
            print(f"[CURRICULUM_COMMIT] ERROR inserting unit: {error_str}")
            print(f"[CURRICULUM_COMMIT] Error type: {type(insert_error).__name__}")
            # Check if this is a table not found error
            if "404" in error_str or "JSON could not be generated" in error_str:
                print(f"[CURRICULUM_COMMIT] CRITICAL: curriculum_units table may not exist in database!")
                print(f"[CURRICULUM_COMMIT] Please run migration: 2025_curriculum_tables.sql")
                raise HTTPException(
                    status_code=500, 
                    detail="curriculum_units table not found. Please ensure database migrations have been applied."
                )
            raise
        
        unit_id = unit_res.data[0]["id"]
        print(f"[CURRICULUM_COMMIT] Unit created - ID: {unit_id}")
        
        # Create lessons
        lesson_ids = []
        print(f"[CURRICULUM_COMMIT] Creating {len(lessons_data)} lessons...")
        for lesson_data in lessons_data:
            lesson_record = {
                "unit_id": unit_id,
                "sequence_index": lesson_data.get("sequence_index", 0),
                "title": lesson_data.get("title", "Untitled Lesson"),
                "objective": lesson_data.get("objective"),
                "minutes_est": lesson_data.get("minutes_est", 60),
                "modality": lesson_data.get("modality", "practice"),
                "difficulty": lesson_data.get("difficulty", "standard"),
                "materials": lesson_data.get("materials", []),
                "assessment": lesson_data.get("assessment", {}),
                "prereqs": lesson_data.get("prereqs", []),
                "links": lesson_data.get("links", [])
            }
            
            lesson_res = supabase.table("curriculum_lessons").insert(lesson_record).execute()
            if lesson_res.data:
                lesson_ids.append(lesson_res.data[0]["id"])
        
        print(f"[CURRICULUM_COMMIT] Created {len(lesson_ids)} lessons")
        
        # Create pacing record
        start_date = pacing_data.get("start_date") or date.today().isoformat()
        print(f"[CURRICULUM_COMMIT] Creating pacing record with start_date: {start_date}")
        pacing_record = {
            "unit_id": unit_id,
            "start_date": start_date,
            "strategy": pacing_data.get("strategy", "fit_openings"),
            "schedule_map": pacing_data.get("schedule_map", [])
        }
        
        pacing_res = supabase.table("curriculum_pacing").insert(pacing_record).execute()
        print(f"[CURRICULUM_COMMIT] Pacing record created")
        
        # Determine if per-lesson backlog map is being used
        use_per_lesson_backlog = body.lesson_backlog_map is not None and len(body.lesson_backlog_map) > 0
        print(f"[CURRICULUM_COMMIT] Per-lesson backlog: {use_per_lesson_backlog}, create_calendar_events: {body.create_calendar_events}")
        
        # Create calendar events or backlog items (already initialized above, but reset for clarity)
        event_ids = []
        backlog_item_ids = []
        
        # Get subject_id from unit metadata or use first subject tag
        subject_id = None
        if unit_data.get("subject_tags"):
            # Try to find subject by name
            subject_res = supabase.table("subject").select("id").eq(
                "name", unit_data["subject_tags"][0]
            ).eq("family_id", family_id).limit(1).execute()
            if subject_res.data:
                subject_id = subject_res.data[0]["id"]
        
        # Candidate empty Plan My Year slots for prefer_placeholder_slots (slot-fill pass)
        candidate_slots = []
        slots_used = 0
        if body.create_calendar_events and (body.prefer_placeholder_slots is None or body.prefer_placeholder_slots) and subject_id and student_ids_validated:
            try:
                range_start_d = date.fromisoformat(start_date)
                range_end_d = range_start_d + timedelta(weeks=unit_data.get("weeks_est", 1))
                range_start_ts = datetime.combine(range_start_d, datetime.min.time(), tzinfo=timezone.utc).isoformat()
                range_end_ts = datetime.combine(range_end_d, datetime.min.time(), tzinfo=timezone.utc).isoformat()
                ay_res = supabase.table("academic_years").select("id").eq("family_id", family_id).lte("start_date", start_date).gte("end_date", start_date).limit(1).execute()
                academic_year_id = ay_res.data[0]["id"] if ay_res.data else None
                slots_query = (
                    supabase.table("events")
                    .select("id, start_ts, end_ts, child_id, subject_id")
                    .eq("family_id", family_id)
                    .eq("generated_by", "plan_year")
                    .is_("curriculum_lesson_id", "null")
                    .is_("deleted_at", "null")
                    .gte("start_ts", range_start_ts)
                    .lt("start_ts", range_end_ts)
                    .in_("child_id", student_ids_validated)
                    .eq("subject_id", subject_id)
                    .order("start_ts", desc=False)
                )
                if academic_year_id:
                    slots_query = slots_query.eq("academic_year_id", academic_year_id)
                slots_res = slots_query.execute()
                candidate_slots = list(slots_res.data or [])
                print(f"[CURRICULUM_COMMIT] Prefer slots: found {len(candidate_slots)} candidate empty slots")
            except Exception as slot_err:
                print(f"[CURRICULUM_COMMIT] WARNING: Could not load candidate slots: {slot_err}")
                candidate_slots = []
        
        # Load availability for placement if we need to create calendar events
        available_windows = []
        if body.create_calendar_events:
            from routers.util import load_planning_context
            
            try:
                print(f"[CURRICULUM_COMMIT] Loading planning context...")
                context = await load_planning_context(
                    family_id=family_id,
                    week_start=start_date,
                    child_ids=unit_data.get("student_ids", []),
                    horizon_weeks=unit_data.get("weeks_est", 1)
                )
                print(f"[CURRICULUM_COMMIT] Planning context loaded - availability entries: {len(context.get('availability', []))}")
                
                for avail_entry in context.get("availability", []):
                    windows = avail_entry.get("windows", [])
                    for window in windows:
                        available_windows.append({
                            "child_id": avail_entry.get("child_id"),
                            "date": avail_entry.get("date"),
                            "start": window.get("start"),
                            "end": window.get("end"),
                        })
                print(f"[CURRICULUM_COMMIT] Available windows: {len(available_windows)}")
            except Exception as ctx_error:
                # If load_planning_context fails, log but continue without availability
                # Events will be created without specific placement (can be manually scheduled)
                print(f"[CURRICULUM_COMMIT] WARNING: Failed to load planning context: {ctx_error}")
                log_event("curriculum.commit.load_planning_context_error", 
                         family_id=family_id, 
                         error=str(ctx_error), 
                         level="warning")
                # Continue without availability - events won't have specific placement but can be scheduled later
                pass
        
        # Place lessons into calendar or backlog
        schedule_map = pacing_data.get("schedule_map", [])
        print(f"[CURRICULUM_COMMIT] Schedule map entries: {len(schedule_map)}")
        for idx, entry in enumerate(schedule_map):
            print(f"[CURRICULUM_COMMIT] Schedule map[{idx}]: sequence_index={entry.get('sequence_index')}, day_offset={entry.get('recommended_day_offset')}")
        window_index = 0
        
        for lesson_idx, lesson_data in enumerate(lessons_data):
            if lesson_idx >= len(lesson_ids):
                break
            
            lesson_id = lesson_ids[lesson_idx]
            minutes = lesson_data.get("minutes_est", 60)
            
            # Determine if this lesson should go to backlog
            should_add_to_backlog = False
            if use_per_lesson_backlog:
                should_add_to_backlog = body.lesson_backlog_map.get(str(lesson_idx), False)
            else:
                should_add_to_backlog = body.add_to_backlog or False
            
            if should_add_to_backlog:
                # Create backlog items for each student
                student_ids = unit_data.get("student_ids", [])
                for child_id in student_ids:
                    backlog_record = {
                        "family_id": family_id,
                        "child_id": child_id,
                        "subject_id": subject_id,
                        "title": lesson_data.get("title", "Lesson"),
                        "notes": lesson_data.get("objective"),
                        "estimated_minutes": minutes,
                        "priority": 0,
                        "created_by": user["id"]
                    }
                    
                    backlog_res = supabase.table("backlog_items").insert(backlog_record).execute()
                    if backlog_res.data:
                        backlog_item_ids.append(backlog_res.data[0]["id"])
            elif body.create_calendar_events:
                # Prefer slots: fill next empty Plan My Year slot if available
                used_slot = False
                if candidate_slots:
                    slot = candidate_slots.pop(0)
                    try:
                        slot_update = {
                            "curriculum_lesson_id": lesson_id,
                            "source": "curriculum",
                            "title": lesson_data.get("title", "Lesson"),
                        }
                        if lesson_data.get("unit_topic"):
                            slot_update["unit"] = lesson_data.get("unit_topic")
                        update_res = supabase.table("events").update(slot_update).eq("id", slot["id"]).execute()
                        if update_res.data:
                            event_ids.append(slot["id"])
                            slots_used += 1
                            used_slot = True
                            print(f"[CURRICULUM_COMMIT] Filled slot {slot['id']} with lesson {lesson_idx}")
                    except Exception as fill_err:
                        print(f"[CURRICULUM_COMMIT] WARNING: Failed to fill slot {slot.get('id')}: {fill_err}")
                        candidate_slots.insert(0, slot)
                
                if used_slot:
                    continue
                
                # Find placement from schedule_map or use simple algorithm
                placement = None
                # Match schedule_map entry by sequence_index, not by array index
                lesson_sequence = lesson_data.get("sequence_index", lesson_idx + 1)
                map_entry = None
                for entry in schedule_map:
                    if entry.get("sequence_index") == lesson_sequence:
                        map_entry = entry
                        break
                
                if map_entry:
                    day_offset = map_entry.get("recommended_day_offset", 0)
                    target_date = (date.fromisoformat(start_date) + timedelta(days=day_offset)).isoformat()
                    
                    # Find window for this date
                    for window in available_windows:
                        if window["date"] == target_date:
                            placement = window
                            break
                
                # Fallback: find next available window
                if not placement:
                    for window in available_windows[window_index:]:
                        window_start = datetime.fromisoformat(window["start"].replace("Z", "+00:00"))
                        window_end = datetime.fromisoformat(window["end"].replace("Z", "+00:00"))
                        window_duration = (window_end - window_start).total_seconds() / 60
                        
                        if window_duration >= minutes:
                            placement = window
                            window_index = available_windows.index(window) + 1
                            break
                
                if placement:
                    # Create event
                    event_start = datetime.fromisoformat(placement["start"].replace("Z", "+00:00"))
                    event_end = event_start + timedelta(minutes=minutes)
                    
                    event_record = {
                        "family_id": family_id,
                        "child_id": placement["child_id"],
                        "subject_id": subject_id,
                        "title": lesson_data.get("title", "Lesson"),
                        "start_ts": event_start.isoformat(),
                        "end_ts": event_end.isoformat(),
                        "status": "scheduled",
                        "source": "curriculum",
                        "curriculum_lesson_id": lesson_id,
                        "description": lesson_data.get("objective"),
                        "modality": lesson_data.get("modality")
                    }
                    if lesson_data.get("unit_topic"):
                        event_record["unit"] = lesson_data.get("unit_topic")
                    
                    print(f"[CURRICULUM_COMMIT] Creating event for lesson {lesson_idx}: {event_record.get('title')}")
                    try:
                        event_res = supabase.table("events").insert(event_record).execute()
                        if event_res.data:
                            event_ids.append(event_res.data[0]["id"])
                            print(f"[CURRICULUM_COMMIT] Successfully created event {event_res.data[0]['id']} for lesson {lesson_idx}")
                        else:
                            print(f"[CURRICULUM_COMMIT] ERROR: Event insert returned no data for lesson {lesson_idx}")
                    except Exception as event_error:
                        error_str = str(event_error)
                        print(f"[CURRICULUM_COMMIT] ERROR creating event for lesson {lesson_idx}: {error_str}")
                        # Continue with other events - don't fail entire commit
                else:
                    print(f"[CURRICULUM_COMMIT] WARNING: No placement found for lesson {lesson_idx} '{lesson_data.get('title', 'Lesson')}' - event not created")
                    print(f"[CURRICULUM_COMMIT] Available windows: {len(available_windows)}, Lesson minutes: {minutes}")
                    # Create event without specific placement (use start_date + day_offset)
                    # This ensures events are created even if no availability windows are found
                    try:
                        # Match schedule_map entry by sequence_index, not by array index
                        lesson_sequence = lesson_data.get("sequence_index", lesson_idx + 1)
                        map_entry = None
                        for entry in schedule_map:
                            if entry.get("sequence_index") == lesson_sequence:
                                map_entry = entry
                                break
                        
                        if map_entry:
                            day_offset = map_entry.get("recommended_day_offset", lesson_idx)
                            print(f"[CURRICULUM_COMMIT] Found schedule_map entry for sequence {lesson_sequence}: day_offset={day_offset}")
                        else:
                            day_offset = lesson_idx
                            print(f"[CURRICULUM_COMMIT] No schedule_map entry found for sequence {lesson_sequence}, using lesson_idx {lesson_idx} as day_offset")
                        
                        target_date_obj = date.fromisoformat(start_date) + timedelta(days=day_offset)
                        print(f"[CURRICULUM_COMMIT] Fallback for lesson {lesson_idx} (sequence {lesson_sequence}): using day_offset {day_offset}, target_date {target_date_obj.isoformat()}")
                        
                        # Use first student_id as fallback
                        student_ids_fallback = unit_data.get("student_ids", [])
                        if not student_ids_fallback:
                            print(f"[CURRICULUM_COMMIT] ERROR: No student_ids available for fallback event creation")
                        else:
                            # Get first valid UUID from student_ids
                            fallback_child_id = None
                            for sid in student_ids_fallback:
                                try:
                                    uuid.UUID(str(sid))
                                    fallback_child_id = str(sid)
                                    break
                                except:
                                    continue
                            
                            if fallback_child_id:
                                # Find a non-conflicting time slot
                                # Try multiple times throughout the day: 9 AM, 10 AM, 11 AM, 2 PM, 3 PM, 4 PM
                                time_slots = [9, 10, 11, 14, 15, 16]
                                event_created = False
                                max_tries = 7  # Try up to 7 days
                                
                                for day_attempt in range(max_tries):
                                    try_date = target_date_obj + timedelta(days=day_attempt)
                                    # Use UTC timezone for all datetime operations
                                    date_start = datetime.combine(try_date, datetime.min.time(), tzinfo=timezone.utc)
                                    date_end = datetime.combine(try_date, datetime.max.time(), tzinfo=timezone.utc)
                                    
                                    # Query existing events for this child on this date
                                    existing_events_res = supabase.table("events").select(
                                        "start_ts, end_ts"
                                    ).eq("family_id", family_id).eq("child_id", fallback_child_id).gte(
                                        "start_ts", date_start.isoformat()
                                    ).lt(
                                        "start_ts", (date_end + timedelta(days=1)).isoformat()
                                    ).neq("status", "canceled").is_("canceled_at", None).is_(
                                        "deleted_at", None
                                    ).execute()
                                    
                                    existing_events = existing_events_res.data or []
                                    
                                    # Try each time slot
                                    for hour in time_slots:
                                        candidate_start = datetime.combine(try_date, datetime.min.time().replace(hour=hour), tzinfo=timezone.utc)
                                        candidate_end = candidate_start + timedelta(minutes=minutes)
                                        
                                        # Check for conflicts with existing events
                                        has_conflict = False
                                        for existing_event in existing_events:
                                            existing_start = datetime.fromisoformat(existing_event["start_ts"].replace("Z", "+00:00"))
                                            existing_end = datetime.fromisoformat(
                                                existing_event.get("end_ts", existing_event["start_ts"]).replace("Z", "+00:00")
                                            )
                                            
                                            # Check if times overlap (both are now timezone-aware)
                                            if (candidate_start < existing_end and candidate_end > existing_start):
                                                has_conflict = True
                                                break
                                        
                                        # Also check for conflicts with events we're about to create
                                        for prev_event_id in event_ids:
                                            # Note: We can't easily check events we just created without querying
                                            # But we're creating them sequentially, so this should be fine
                                            pass
                                        
                                        if not has_conflict:
                                            # Found a non-conflicting time slot
                                            event_record = {
                                                "family_id": family_id,
                                                "child_id": fallback_child_id,
                                                "subject_id": subject_id,
                                                "title": lesson_data.get("title", "Lesson"),
                                                "start_ts": candidate_start.isoformat(),
                                                "end_ts": candidate_end.isoformat(),
                                                "status": "scheduled",
                                                "source": "curriculum",
                                                "curriculum_lesson_id": lesson_id,
                                                "description": lesson_data.get("objective"),
                                                "modality": lesson_data.get("modality")
                                            }
                                            if lesson_data.get("unit_topic"):
                                                event_record["unit"] = lesson_data.get("unit_topic")
                                            print(f"[CURRICULUM_COMMIT] Creating fallback event for lesson {lesson_idx} at {candidate_start.isoformat()}")
                                            try:
                                                event_res = supabase.table("events").insert(event_record).execute()
                                                if event_res.data:
                                                    event_ids.append(event_res.data[0]["id"])
                                                    print(f"[CURRICULUM_COMMIT] Successfully created fallback event {event_res.data[0]['id']} at {candidate_start.isoformat()}")
                                                    event_created = True
                                                    break
                                            except Exception as insert_error:
                                                error_str = str(insert_error)
                                                if "overlap" in error_str.lower() or "P0001" in error_str:
                                                    # Conflict detected by database constraint, try next slot
                                                    print(f"[CURRICULUM_COMMIT] Conflict detected at {candidate_start.isoformat()}, trying next slot")
                                                    continue
                                                else:
                                                    # Other error, log and try next slot
                                                    print(f"[CURRICULUM_COMMIT] Error creating event at {candidate_start.isoformat()}: {error_str}")
                                                    continue
                                    
                                    if event_created:
                                        break
                                
                                if not event_created:
                                    print(f"[CURRICULUM_COMMIT] ERROR: Could not find non-conflicting time slot for lesson {lesson_idx} after {max_tries} days")
                            else:
                                print(f"[CURRICULUM_COMMIT] ERROR: Could not find valid child_id for fallback event")
                    except Exception as fallback_error:
                        print(f"[CURRICULUM_COMMIT] ERROR creating fallback event: {str(fallback_error)}")
                        # Continue - don't fail entire commit
        
        # Refresh calendar cache (non-blocking - don't fail commit if this fails)
        # This is best-effort only - cache will be refreshed on next calendar load if needed
        # Wrap in try-except to ensure it never fails the commit - catch ALL exceptions including BaseException
        try:
            try:
                start_date_obj = date.fromisoformat(start_date)
                end_date_obj = start_date_obj + timedelta(weeks=unit_data.get("weeks_est", 1))
                
                # Only refresh if we have a valid date range
                if start_date_obj and end_date_obj:
                    try:
                        result = supabase.rpc(
                            "refresh_calendar_days_cache",
                            {
                                "p_family_id": family_id,
                                "p_from_date": str(start_date_obj),
                                "p_to_date": str(end_date_obj)
                            }
                        ).execute()
                        # Success - no need to log
                    except BaseException as rpc_error:
                        # Silently ignore ALL RPC errors including PostgREST exceptions
                        # The cache will be refreshed automatically on next calendar load
                        # Don't log or raise - just continue
                        pass
            except BaseException as cache_error:
                # Silently ignore ALL cache refresh errors including date parsing errors
                # Don't fail the commit
                pass
        except BaseException:
            # Final catch-all to ensure nothing from cache refresh can fail the commit
            pass
        
        print(f"[CURRICULUM_COMMIT] SUCCESS - Unit: {unit_id}, Lessons: {len(lesson_ids)}, Events: {len(event_ids)}, Backlog: {len(backlog_item_ids)}")
        
        log_event(
            "curriculum.committed",
            family_id=family_id,
            unit_id=unit_id,
            lessons_count=len(lesson_ids),
            events_count=len(event_ids),
            backlog_count=len(backlog_item_ids),
            user_id=user["id"]
        )
        
        return {
            "unit_id": unit_id,
            "lesson_ids": lesson_ids,
            "event_ids": event_ids,
            "backlog_item_ids": backlog_item_ids,
            "pacing_id": pacing_res.data[0]["id"] if pacing_res.data else None,
            "slots_used": slots_used,
            "events_created": len(event_ids) - slots_used,
        }
        
    except HTTPException as http_exc:
        print(f"[CURRICULUM_COMMIT] HTTPException: {http_exc.status_code} - {http_exc.detail}")
        raise
    except Exception as e:
        # Log full error details for debugging
        import traceback
        error_trace = traceback.format_exc()
        error_str = str(e)
        
        print(f"[CURRICULUM_COMMIT] EXCEPTION: {error_str}")
        print(f"[CURRICULUM_COMMIT] Traceback:\n{error_trace}")
        
        # Check if this is a cache refresh error - ONLY ignore if it's specifically from refresh_calendar_days_cache
        # Do NOT ignore "JSON could not be generated" errors from table inserts (curriculum_units, etc.)
        is_cache_refresh_error = (
            "refresh_calendar_days_cache" in error_str or 
            ("JSON could not be generated" in error_str and "refresh_calendar_days_cache" in error_trace)
        )
        
        # Only ignore cache refresh errors if we successfully created the unit/lessons
        if is_cache_refresh_error and unit_id is not None:
            # This is a cache refresh error AFTER successful commit - don't fail the commit
            # Return success even though cache refresh failed
            print(f"[CURRICULUM_COMMIT] Cache refresh failed but curriculum was committed successfully")
            log_event("curriculum.commit.cache_error_ignored", 
                     family_id=family_id if 'family_id' in locals() else None,
                     user_id=user.get("id") if 'user' in locals() else None,
                     error=error_str[:200])
            # Return a success response - the curriculum was committed successfully
            return {
                "unit_id": unit_id if 'unit_id' in locals() else None,
                "lesson_ids": lesson_ids if 'lesson_ids' in locals() else [],
                "event_ids": event_ids if 'event_ids' in locals() else [],
                "backlog_item_ids": backlog_item_ids if 'backlog_item_ids' in locals() else [],
                "pacing_id": pacing_res.data[0]["id"] if 'pacing_res' in locals() and pacing_res.data else None,
                "slots_used": slots_used if 'slots_used' in locals() else 0,
                "events_created": len(event_ids) - slots_used if 'event_ids' in locals() and 'slots_used' in locals() else 0,
            }
        
        # If we got here and unit_id is None, this is a real error during commit
        if unit_id is None and ("JSON could not be generated" in error_str or "404" in error_str):
            # Likely the curriculum_units table doesn't exist
            print(f"[CURRICULUM_COMMIT] CRITICAL: curriculum_units table may not exist in database!")
            print(f"[CURRICULUM_COMMIT] Please run migration: 2025_curriculum_tables.sql")
            log_event("curriculum.commit.table_not_found", 
                     family_id=family_id if 'family_id' in locals() else None,
                     user_id=user.get("id") if 'user' in locals() else None,
                     error=error_str[:200])
            raise HTTPException(
                status_code=500, 
                detail="curriculum_units table not found. Please ensure database migrations have been applied."
            )
        
        log_event("curriculum.commit.error", 
                 family_id=family_id if 'family_id' in locals() else None,
                 user_id=user.get("id") if 'user' in locals() else None,
                 error=error_str,
                 error_type=type(e).__name__,
                 error_trace=error_trace[:500])  # First 500 chars of trace
        raise HTTPException(status_code=500, detail=f"Error committing curriculum: {error_str}")


# Export router
__all__ = ["router"]
