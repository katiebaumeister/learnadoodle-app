"""
FastAPI routes for Curriculum Builder
Creates structured curriculum units with lessons and pacing
"""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any, Literal, Tuple, Set
from collections import deque
from datetime import datetime, date, time, timedelta, timezone
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
from ai_usage_ledger import record_ai_usage

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
    generation_scope: str = Field(..., description="User free-form notes and goals")
    planning_context: Optional[str] = Field(
        None,
        description="Pre-built context: schedule, students, slot counts (from client or server)",
    )
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


def _coerce_inferred_from_list(v: Any) -> Optional[List[str]]:
    """LLM/parser may emit objects or numbers in inferred_from; API contract is List[str]."""
    if v is None:
        return None
    if not isinstance(v, list):
        return None
    out: List[str] = []
    for item in v:
        if item is None:
            continue
        if isinstance(item, str):
            s = item.strip()
            if s:
                out.append(s)
        elif isinstance(item, (int, float)) and not isinstance(item, bool):
            out.append(str(item))
        elif isinstance(item, dict):
            picked = None
            for key in ("text", "line", "source", "snippet", "value", "raw"):
                val = item.get(key)
                if isinstance(val, str) and val.strip():
                    picked = val.strip()
                    break
            if picked is not None:
                out.append(picked)
            else:
                try:
                    out.append(json.dumps(item, ensure_ascii=False))
                except (TypeError, ValueError):
                    out.append(str(item))
        else:
            out.append(str(item))
    return out if out else None


class ParsePlainTextRequest(BaseModel):
    """Request for plain-text curriculum extraction (extract structure only, do not generate)."""
    subject_id: str = Field(..., description="Subject ID")
    family_id: str = Field(..., description="Family ID")
    subject_name: str = Field(..., description="Subject name")
    raw_text: str = Field(default="", description="Pasted syllabus/outline text (optional when material_id is set)")
    material_id: Optional[str] = Field(default=None, description="Library material ID — server extracts text from PDF/notes")
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


async def _resolve_plain_text_for_parse(body: ParsePlainTextRequest, family_id: str) -> str:
    """Use pasted text, or extract from a library material (PDF/notes)."""
    if body.material_id:
        text = await extract_material_text(body.material_id, family_id)
        return (text or "").strip()
    text = (body.raw_text or "").strip()
    if not text:
        raise ValueError("Paste some content or choose a library material.")
    return text


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

    @field_validator("inferred_from", mode="before")
    @classmethod
    def _coerce_lesson_inferred_from(cls, v: Any) -> Optional[List[str]]:
        return _coerce_inferred_from_list(v)


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

    @field_validator("inferred_from", mode="before")
    @classmethod
    def _coerce_unit_inferred_from(cls, v: Any) -> Optional[List[str]]:
        return _coerce_inferred_from_list(v)


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
    """Approved parsed draft to persist (syllabus_imports + curriculum_units + curriculum_lessons + events)."""
    subject_id: str
    family_id: str
    subject_name: str = Field(..., description="For curriculum_units.subject_tags")
    draft: ParsedDraftCurriculum
    academic_year_id: Optional[str] = Field(
        None, description="When set with student_ids (or all family children), lessons map onto Plan Year slots"
    )
    student_ids: Optional[List[str]] = Field(None, description="Child IDs for slot matching")
    replace_existing_events: bool = Field(
        True,
        description="Remove prior is_curriculum_related events for this subject with source=plain_text_parsed before insert",
    )


class CommitParsedDraftResponse(BaseModel):
    syllabus_import_id: str
    units_created: int
    lessons_created: int
    unit_ids: List[str]
    lesson_ids: List[str]
    subject_id: str
    source_type: str = "plain_text_parsed"
    events_created: int = 0
    calendar_event_ids: List[str] = Field(default_factory=list)


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
    academic_year_id: Optional[str] = Field(
        default=None,
        description="When set, links manual curriculum events to this academic year (plan summaries, slot labels).",
    )
    student_ids: Optional[List[str]] = Field(
        default=None,
        description="Child IDs for matching plan_year calendar slots; if omitted with academic_year_id, all family children are used.",
    )
    replace_existing: bool = Field(
        False,
        description="If true, delete existing manual curriculum events for this subject before inserting (edit/save).",
    )


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


def _curriculum_event_display_date(ev: Dict[str, Any]) -> Optional[str]:
    """Match PlanYearModal curriculumEventDisplayDate (hide placeholder timestamps)."""
    meta = ev.get("curriculum_metadata") or {}
    if not isinstance(meta, dict):
        meta = {}
    if meta.get("unscheduled_placeholder"):
        return None
    ts = ev.get("start_ts")
    if not ts:
        return None
    s = str(ts)
    return s[:10] if len(s) >= 10 else None


@router.get("/subject-events-structure")
async def get_subject_curriculum_events_structure(
    family_id: str = Query(...),
    subject_id: str = Query(...),
    academic_year_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Plan Year: events-backed curriculum for one subject (is_curriculum_related).
    Admin client avoids RLS hiding rows with null child_id after service-role inserts.
    """
    try:
        fid = get_family_id_for_user(user["id"])
        if not fid or str(fid) != str(family_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")
        supabase = get_admin_client()
        events_query = (
            supabase.table("events")
            .select(
                "id, title, curriculum_unit_title, curriculum_lesson_sequence, curriculum_metadata, start_ts, is_reference_date"
            )
            .eq("family_id", family_id)
            .eq("subject_id", subject_id)
            .eq("is_curriculum_related", True)
            .is_("deleted_at", "null")
        )
        if academic_year_id:
            events_query = events_query.eq("academic_year_id", academic_year_id)
        res = (
            events_query
            .order("curriculum_unit_title", desc=False)
            .order("curriculum_lesson_sequence", desc=False)
            .execute()
        )
        rows = res.data or []
        units_map: Dict[str, List[Dict[str, Any]]] = {}
        for ev in rows:
            utitle = (ev.get("curriculum_unit_title") or ev.get("unit") or "").strip() or "Untitled Unit"
            if utitle not in units_map:
                units_map[utitle] = []
            meta = ev.get("curriculum_metadata") or {}
            if not isinstance(meta, dict):
                meta = {}
            lt_raw = meta.get("lesson_type") or "lesson"
            lesson_type = str(lt_raw).strip().lower() if lt_raw is not None else "lesson"
            me = meta.get("minutes_est")
            if isinstance(me, (int, float)) and not isinstance(me, bool):
                minutes = max(1, min(480, int(me)))
            else:
                try:
                    minutes = max(1, min(480, int(me))) if me is not None else 60
                except (TypeError, ValueError):
                    minutes = 60
            lesson_display = (meta.get("lesson_label") or "").strip() or (ev.get("title") or "").strip() or "Lesson"
            units_map[utitle].append(
                {
                    "id": str(ev["id"]),
                    "title": lesson_display,
                    "type": lesson_type,
                    "sequence": int(ev.get("curriculum_lesson_sequence") or 0),
                    "date": _curriculum_event_display_date(ev),
                    "isReferenceOnly": bool(ev.get("is_reference_date")),
                    "minutes": minutes,
                }
            )
        units_out: List[Dict[str, Any]] = []
        for title, lessons in units_map.items():
            lessons.sort(key=lambda x: (x.get("sequence") or 0, x.get("title") or ""))
            units_out.append({"title": title, "lessons": lessons})
        units_out.sort(key=lambda u: u.get("title") or "")
        # How curriculum was last materialized (for Plan Year cadence: same-method vs empty replace UX)
        source_query = (
            supabase.table("events")
            .select("source")
            .eq("family_id", family_id)
            .eq("subject_id", subject_id)
            .eq("is_curriculum_related", True)
            .is_("deleted_at", "null")
        )
        if academic_year_id:
            source_query = source_query.eq("academic_year_id", academic_year_id)
        src_res = source_query.limit(80).execute()
        sources = []
        for r in src_res.data or []:
            sval = (r.get("source") or "").strip()
            if sval and sval not in sources:
                sources.append(sval)
        saved_content_source = None
        for pref in ("manual", "plain_text_parsed"):
            if pref in sources:
                saved_content_source = pref
                break
        if not saved_content_source and sources:
            saved_content_source = sources[0]
        return {"units": units_out, "saved_content_source": saved_content_source}
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.subject_events_structure.error", error=str(e), family_id=family_id)
        raise HTTPException(status_code=500, detail="Failed to load curriculum events structure")


@router.delete("/manual-curriculum-events")
async def delete_manual_curriculum_events(
    family_id: str = Query(...),
    subject_id: str = Query(...),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Remove Plan Year manual curriculum rows for one subject (source=manual, is_curriculum_related)."""
    try:
        fid = get_family_id_for_user(user["id"])
        if not fid or str(fid) != str(family_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")
        supabase = get_admin_client()
        supabase.table("events").delete().eq("family_id", family_id).eq("subject_id", subject_id).eq(
            "is_curriculum_related", True
        ).eq("source", "manual").is_("deleted_at", "null").execute()
        log_event(
            "curriculum.manual_curriculum_cleared",
            family_id=family_id,
            subject_id=subject_id,
            user_id=user["id"],
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum.manual_curriculum_clear.error", error=str(e), family_id=family_id)
        raise HTTPException(status_code=500, detail="Failed to clear manual curriculum")


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
        
        record_ai_usage(
            family_id,
            "curriculumImportStructuring",
            metadata={"route": "curriculum/build", "mode": body.mode},
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
            planning_context=body.planning_context,
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
        record_ai_usage(
            body.family_id,
            "curriculumImportStructuring",
            metadata={"route": "curriculum/generate-draft", "subject_id": body.subject_id},
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


@router.post("/generate-draft-stream")
async def generate_curriculum_draft_stream_endpoint(
    body: GenerateCurriculumDraftRequest,
    user: dict = Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    """
    Stream safe progress updates plus partial generator output, then the final curriculum draft.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id or family_id != body.family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")

    from services.curriculum_generation_service import (
        stream_generate_curriculum_draft as do_stream_generate,
    )

    async def ndjson_gen():
        try:
            async for chunk in do_stream_generate(
                subject_id=body.subject_id,
                family_id=body.family_id,
                subject_name=body.subject_name,
                generation_scope=body.generation_scope,
                planning_context=body.planning_context,
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
            ):
                yield chunk
        except ValueError as e:
            log_event("curriculum.generate_draft_stream.validation_error", error=str(e), family_id=body.family_id)
            yield (json.dumps({"type": "error", "message": str(e)}) + "\n").encode("utf-8")
        except Exception as e:
            log_event("curriculum.generate_draft_stream.error", error=str(e), family_id=body.family_id)
            yield (
                json.dumps({"type": "error", "message": "Failed to generate curriculum draft"}) + "\n"
            ).encode("utf-8")

    return StreamingResponse(
        ndjson_gen(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
        raw_text_resolved = await _resolve_plain_text_for_parse(body, family_id)
        from services.curriculum_parse_service import extract_curriculum_from_plain_text
        result = await extract_curriculum_from_plain_text(
            subject_id=body.subject_id,
            family_id=body.family_id,
            subject_name=body.subject_name,
            raw_text=raw_text_resolved,
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


@router.post("/parse-text-stream")
async def parse_plain_text_stream_endpoint(
    body: ParsePlainTextRequest,
    user: dict = Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    """
    Same as parse-text but streams model output as NDJSON (delta lines + final complete object).
    Client shows deltas in the paste field, then applies the complete draft to the preview step.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id or family_id != body.family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")

    from services.curriculum_parse_service import stream_extract_curriculum_from_plain_text

    async def ndjson_gen():
        try:
            raw_text_resolved = await _resolve_plain_text_for_parse(body, family_id)
            async for chunk in stream_extract_curriculum_from_plain_text(
                subject_id=body.subject_id,
                family_id=body.family_id,
                subject_name=body.subject_name,
                raw_text=raw_text_resolved,
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
                user_id=user["id"],
            ):
                yield chunk
        except ValueError as e:
            log_event("curriculum.parse_text_stream.validation_error", error=str(e), family_id=body.family_id)
            yield (json.dumps({"type": "error", "message": str(e)}) + "\n").encode("utf-8")
        except Exception as e:
            log_event("curriculum.parse_text_stream.error", error=str(e), family_id=body.family_id)
            yield (
                json.dumps({"type": "error", "message": "Failed to extract structure from text"}) + "\n"
            ).encode("utf-8")

    return StreamingResponse(
        ndjson_gen(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _parsed_lesson_reference_cadence(le: Any) -> Dict[str, Any]:
    """If suggested_date / date_text looks like YYYY-MM-DD, use as reference_date for event placement."""
    for attr in ("suggested_date", "date_text"):
        val = getattr(le, attr, None)
        if not val:
            continue
        t = str(val).strip()[:10]
        if (
            len(t) == 10
            and t[4] == "-"
            and t[7] == "-"
            and t[:4].isdigit()
            and t[5:7].isdigit()
            and t[8:10].isdigit()
        ):
            return {"reference_date": t}
    return {}


@router.post("/commit-parsed-draft", response_model=CommitParsedDraftResponse)
async def commit_parsed_draft_endpoint(
    body: CommitParsedDraftRequest,
    user: dict = Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    """
    Persist approved parsed draft: syllabus_imports + curriculum_units + curriculum_lessons, then
    materialize the same lessons as is_curriculum_related calendar events (source=plain_text_parsed)
    so Plan Year and the planner see them. Uses academic_year_id + student_ids to fill Plan Year slots when set.
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
        flat_for_events: List[Dict[str, Any]] = []
        for ui, u in enumerate(draft.units):
            unit_title = (u.title or "").strip() or "Untitled Unit"
            unit_row = {
                "family_id": body.family_id,
                "created_by_uid": user["id"],
                "title": unit_title,
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
                lid_str = None
                if les_ins.data and len(les_ins.data) > 0:
                    lid_str = str(les_ins.data[0]["id"])
                    lesson_ids.append(lid_str)
                lt = (le.lesson_type or "lesson").strip().lower()
                if lt not in MANUAL_LESSON_TYPES:
                    lt = "lesson"
                minutes = le.minutes_est if le.minutes_est is not None else 60
                if not isinstance(minutes, int):
                    try:
                        minutes = int(minutes) if minutes is not None else 60
                    except (TypeError, ValueError):
                        minutes = 60
                minutes = max(1, min(480, minutes))
                cadence_meta = _parsed_lesson_reference_cadence(le)
                flat_for_events.append(
                    {
                        "unit_title": unit_title,
                        "seq": seq,
                        "lesson_title": (le.title or "").strip() or "Untitled Lesson",
                        "lesson_type": lt,
                        "modality": modality,
                        "minutes": minutes,
                        "objective": (le.objective or "").strip() or None,
                        "notes": (le.notes or "").strip() or None,
                        "materials": [],
                        "is_placeholder": False,
                        "cadence_metadata": cadence_meta,
                        "curriculum_lesson_id": lid_str,
                        "metadata_extra": {
                            "import_source": "plain_text_parse",
                            "syllabus_import_id": syllabus_import_id,
                        },
                    }
                )

        calendar_event_ids: List[str] = []
        slots_filled = 0
        if flat_for_events:
            ay_body = (body.academic_year_id or "").strip() if body.academic_year_id else ""
            sids = [str(s).strip() for s in (body.student_ids or []) if s]
            calendar_event_ids, slots_filled, _ = _materialize_plan_year_curriculum_events(
                supabase,
                family_id=body.family_id,
                subject_id=body.subject_id,
                subject_name=subject_name,
                academic_year_id=ay_body,
                student_ids=sids,
                event_source="plain_text_parsed",
                builder_mode_label="plain_text_parsed",
                flat_lessons=flat_for_events,
                replace_existing=body.replace_existing_events,
            )

        log_event(
            "curriculum.commit_parsed.ok",
            family_id=body.family_id,
            subject_id=body.subject_id,
            syllabus_import_id=syllabus_import_id,
            units_created=len(unit_ids),
            lessons_created=len(lesson_ids),
            events_created=len(calendar_event_ids),
            plan_slots_filled=slots_filled,
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
            events_created=len(calendar_event_ids),
            calendar_event_ids=calendar_event_ids,
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
# events.start_ts / end_ts are NOT NULL — use a far-future anchor + per-lesson offset for unscheduled shells.
_MANUAL_CURRICULUM_PLACEHOLDER_ANCHOR = datetime(2099, 6, 1, 0, 0, 0, tzinfo=timezone.utc)


def _manual_lesson_type_to_event_type(lesson_type: str) -> str:
    """Map manual builder lesson_type to events.event_type (matches Event Details chips)."""
    m = {
        "lesson": "Lesson",
        "assignment": "Assignment",
        "project": "Project",
        "assessment": "Exam",
        "review": "Lesson",
        "activity": "Activity",
        "reading": "Lesson",
        "lab": "Activity",
        "placeholder": "Lesson",
    }
    key = (lesson_type or "lesson").strip().lower()
    return m.get(key, "Lesson")


def _materialize_plan_year_curriculum_events(
    supabase,
    *,
    family_id: str,
    subject_id: str,
    subject_name: str,
    academic_year_id: str,
    student_ids: List[str],
    event_source: str,
    builder_mode_label: str,
    flat_lessons: List[Dict[str, Any]],
    replace_existing: bool,
) -> Tuple[List[str], int, int]:
    """
    Create or update calendar events for Plan Year curriculum (manual or import-from-text).
    flat_lessons rows: unit_title, seq, lesson_title, lesson_type, modality, minutes, objective, notes,
    materials (list), is_placeholder (bool), cadence_metadata (dict), curriculum_lesson_id (optional str),
    metadata_extra (dict merged into curriculum_metadata).
    """
    if replace_existing:
        supabase.table("events").delete().eq("family_id", family_id).eq("subject_id", subject_id).eq(
            "is_curriculum_related", True
        ).eq("source", event_source).is_("deleted_at", "null").execute()

    ay_id = (academic_year_id or "").strip() if academic_year_id else ""
    sid_list = [str(s).strip() for s in (student_ids or []) if s]
    if ay_id and not sid_list:
        ch_res = supabase.table("children").select("id").eq("family_id", family_id).execute()
        sid_list = [str(r["id"]) for r in (ch_res.data or []) if r.get("id")]

    slot_queue: deque = deque()
    if ay_id and sid_list:
        ay_res = (
            supabase.table("academic_years")
            .select("start_date, end_date")
            .eq("id", ay_id)
            .eq("family_id", family_id)
            .limit(1)
            .execute()
        )
        ay_rows = ay_res.data or []
        if ay_rows:
            row0 = ay_rows[0]
            sd = str(row0.get("start_date", ""))[:10]
            ed = str(row0.get("end_date", ""))[:10]
            if len(sd) >= 10 and len(ed) >= 10:
                empty_slots = _get_eligible_plan_slots(
                    supabase,
                    family_id,
                    sid_list,
                    sd,
                    ed,
                    subject_id=subject_id,
                    academic_year_id=ay_id,
                )
                refill_slots: List[Dict[str, Any]] = []
                if (
                    replace_existing
                    and event_source == "plain_text_parsed"
                    and subject_id
                    and str(subject_id).strip()
                ):
                    refill_slots = _get_refillable_plain_text_plan_slots(
                        supabase,
                        family_id,
                        sid_list,
                        sd,
                        ed,
                        str(subject_id).strip(),
                        ay_id,
                    )
                slot_queue = _merge_plan_curriculum_slot_queues(empty_slots, refill_slots)

    event_ids: List[str] = []
    slots_filled = 0
    placeholder_lesson_index = 0
    lesson_made = 0
    used_slot_ids: Set[str] = set()

    for row in flat_lessons:
        unit_title = (row.get("unit_title") or "").strip() or "Unit"
        seq = int(row.get("seq") or 0) or 1
        lesson_title = (row.get("lesson_title") or "").strip() or f"Lesson {seq}"
        if not lesson_title:
            continue
        lesson_made += 1

        lt = (row.get("lesson_type") or "lesson").strip().lower()
        if lt not in MANUAL_LESSON_TYPES:
            lt = "lesson"
        modality = (row.get("modality") or MANUAL_MODALITY_MAP.get(lt) or "practice").strip().lower()
        if modality not in {"reading", "video", "hands_on", "discussion", "practice", "quiz", "project"}:
            modality = "practice"
        minutes = row.get("minutes")
        if not isinstance(minutes, int):
            try:
                minutes = int(minutes) if minutes is not None else 60
            except (TypeError, ValueError):
                minutes = 60
        minutes = max(1, min(480, minutes))

        reference_date = None
        cadence_meta = row.get("cadence_metadata") or {}
        if isinstance(cadence_meta, dict) and cadence_meta.get("reference_date"):
            reference_date = cadence_meta["reference_date"]

        curriculum_metadata = {
            "lesson_type": lt,
            "modality": modality,
            "minutes_est": minutes,
            "objective": (row.get("objective") or "").strip() or None,
            "notes": (row.get("notes") or "").strip() or None,
            "materials": row["materials"] if isinstance(row.get("materials"), list) else [],
            "builder_mode": builder_mode_label,
        }
        if row.get("is_placeholder"):
            curriculum_metadata["is_placeholder"] = True
        if isinstance(cadence_meta, dict) and cadence_meta:
            curriculum_metadata["cadence_metadata"] = cadence_meta
        curriculum_metadata["lesson_label"] = lesson_title
        extra_meta = row.get("metadata_extra") or {}
        if isinstance(extra_meta, dict) and extra_meta:
            curriculum_metadata.update(extra_meta)

        event_type_ev = _manual_lesson_type_to_event_type(lt)
        cl_id = row.get("curriculum_lesson_id")
        cl_id_str = str(cl_id).strip() if cl_id else None

        slot_ev = slot_queue.popleft() if slot_queue else None
        if (
            slot_ev is None
            and reference_date
            and ay_id
            and sid_list
            and subject_id
            and str(subject_id).strip()
        ):
            try:
                rd0 = str(reference_date).strip()
                ymd = rd0[:10] if len(rd0) >= 10 else ""
                if len(ymd) == 10 and ymd[4] == "-" and ymd[7] == "-":
                    found = _find_plan_year_slot_for_reference_day(
                        supabase,
                        family_id=family_id,
                        academic_year_id=ay_id,
                        subject_id=str(subject_id).strip(),
                        student_ids=sid_list,
                        date_ymd=ymd,
                        replace_existing=replace_existing,
                        event_source=event_source,
                        exclude_ids=used_slot_ids,
                    )
                    if found:
                        slot_ev = found
            except (ValueError, TypeError):
                pass

        if slot_ev:
            cm_slot = dict(curriculum_metadata)
            cm_slot.pop("unscheduled_placeholder", None)
            update_payload: Dict[str, Any] = {
                "title": subject_name,
                "unit": unit_title,
                "lesson": lesson_title,
                "curriculum_unit_title": unit_title,
                "description": (row.get("objective") or "").strip() or None,
                "event_type": event_type_ev,
                "modality": modality,
                "is_curriculum_related": True,
                "is_reference_date": False,
                "curriculum_lesson_sequence": seq,
                "curriculum_metadata": cm_slot,
                "counts_toward_plan": True,
            }
            if cl_id_str:
                update_payload["curriculum_lesson_id"] = cl_id_str
            upd = (
                supabase.table("events")
                .update(update_payload)
                .eq("id", slot_ev["id"])
                .eq("family_id", family_id)
                .execute()
            )
            err_upd = getattr(upd, "error", None)
            if err_upd:
                raise RuntimeError(f"events update failed for slot {slot_ev.get('id')}: {err_upd!r}")
            event_ids.append(str(slot_ev["id"]))
            slots_filled += 1
            used_slot_ids.add(str(slot_ev["id"]))
            continue

        has_real_reference_time = False
        start_ts = None
        end_ts = None
        if reference_date:
            try:
                rd = str(reference_date).strip()
                if "T" in rd:
                    ref_dt = datetime.fromisoformat(rd.replace("Z", "+00:00"))
                else:
                    ref_dt = datetime.combine(
                        date.fromisoformat(rd[:10]),
                        time(12, 0),
                        tzinfo=timezone.utc,
                    )
                start_ts = ref_dt.isoformat()
                end_ts = (ref_dt + timedelta(minutes=minutes)).isoformat()
                has_real_reference_time = True
            except (ValueError, AttributeError):
                pass

        if not has_real_reference_time:
            ph = _MANUAL_CURRICULUM_PLACEHOLDER_ANCHOR + timedelta(seconds=placeholder_lesson_index)
            placeholder_lesson_index += 1
            start_ts = ph.isoformat()
            end_ts = (ph + timedelta(minutes=minutes)).isoformat()
            curriculum_metadata["unscheduled_placeholder"] = True

        is_ref_date = has_real_reference_time

        event_record: Dict[str, Any] = {
            "family_id": family_id,
            "subject_id": subject_id,
            "child_id": None,
            "title": subject_name,
            "unit": unit_title,
            "lesson": lesson_title,
            "description": (row.get("objective") or "").strip() or None,
            "start_ts": start_ts,
            "end_ts": end_ts,
            "status": "scheduled",
            "source": event_source,
            "event_type": event_type_ev,
            "modality": modality,
            "is_curriculum_related": True,
            "is_reference_date": is_ref_date,
            "curriculum_unit_title": unit_title,
            "curriculum_lesson_sequence": seq,
            "curriculum_metadata": curriculum_metadata,
            "counts_toward_plan": True,
        }
        if ay_id:
            event_record["academic_year_id"] = ay_id
        if cl_id_str:
            event_record["curriculum_lesson_id"] = cl_id_str

        event_ins = supabase.table("events").insert(event_record).execute()
        if not event_ins.data:
            err_detail = getattr(event_ins, "error", None) or getattr(event_ins, "error_message", None)
            raise RuntimeError(f"events insert returned no row: {err_detail!r}")
        event_ids.append(event_ins.data[0]["id"])

    return event_ids, slots_filled, lesson_made


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

    When academic_year_id matches and plan_year slots exist for this subject+children, lessons are merged
    into those calendar events in chronological order: title stays the subject name; unit / lesson live in
    unit + curriculum fields and curriculum_metadata.lesson_label; event_type follows manual lesson_type.
    Remaining lessons become shell events (reference date or far-future placeholder).
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family ID mismatch")
        _validate_manual_draft(body.draft)
        subject_name = (body.subject_name or "").strip() or "Subject"
        supabase = get_admin_client()

        ay_id = (body.academic_year_id or "").strip() if body.academic_year_id else ""
        sid_list = [str(s).strip() for s in (body.student_ids or []) if s]
        if ay_id and not sid_list:
            ch_res = supabase.table("children").select("id").eq("family_id", family_id).execute()
            sid_list = [str(r["id"]) for r in (ch_res.data or []) if r.get("id")]

        flat_rows: List[Dict[str, Any]] = []
        for ui, u in enumerate(body.draft.units):
            unit_title = (u.title or "").strip() or f"Unit {ui + 1}"
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
                cadence_meta = getattr(le, "cadence_metadata", None) or {}
                if not isinstance(cadence_meta, dict):
                    cadence_meta = {}
                flat_rows.append(
                    {
                        "unit_title": unit_title,
                        "seq": seq,
                        "lesson_title": lesson_title,
                        "lesson_type": lt,
                        "modality": modality,
                        "minutes": minutes,
                        "objective": (le.objective or "").strip() or None,
                        "notes": (le.notes or "").strip() or None,
                        "materials": le.materials if isinstance(le.materials, list) else [],
                        "is_placeholder": bool(getattr(le, "is_placeholder", False)),
                        "cadence_metadata": cadence_meta,
                        "curriculum_lesson_id": None,
                        "metadata_extra": {},
                    }
                )

        event_ids, slots_filled, lesson_count = _materialize_plan_year_curriculum_events(
            supabase,
            family_id=body.family_id,
            subject_id=body.subject_id,
            subject_name=subject_name,
            academic_year_id=ay_id,
            student_ids=sid_list,
            event_source="manual",
            builder_mode_label=body.builder_mode,
            flat_lessons=flat_rows,
            replace_existing=body.replace_existing,
        )
        unit_count = len(body.draft.units)

        log_event(
            "curriculum.commit_manual.ok",
            family_id=body.family_id,
            subject_id=body.subject_id,
            units_created=unit_count,
            lessons_created=lesson_count,
            events_created=len(event_ids),
            plan_slots_filled=slots_filled,
            user_id=user["id"],
        )
        return CommitManualDraftResponse(
            subject_id=body.subject_id,
            family_id=body.family_id,
            source_type="manual",
            builder_mode=body.builder_mode,
            units_created_count=unit_count,
            lessons_created_count=lesson_count,
            unit_ids=[],  # No longer using curriculum_units
            lesson_ids=event_ids,  # Return event IDs instead
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
    Includes:
    - Per-child slots: child_id in student_ids (one event per child per date).
    - Whole-family slots: child_id is null and child_ids overlaps student_ids (or empty child_ids),
      as created by block_regenerator for multi-assignee blocks.
    Used by preview_pacing and by commit (same logic). Order by start_ts ascending.
    """
    range_start_d = date.fromisoformat(start_date_str)
    range_end_d = date.fromisoformat(end_date_str)
    range_start_ts = datetime.combine(range_start_d, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    range_end_ts = datetime.combine(range_end_d, datetime.max.time(), tzinfo=timezone.utc).isoformat()
    sid_set = {str(s).strip() for s in (student_ids or []) if s is not None and str(s).strip()}
    if not sid_set:
        return []

    def base_query():
        q = (
            supabase.table("events")
            .select("id, start_ts, end_ts, child_id, subject_id, child_ids")
            .eq("family_id", family_id)
            .eq("generated_by", "plan_year")
            .is_("curriculum_lesson_id", "null")
            .is_("deleted_at", "null")
            .gte("start_ts", range_start_ts)
            .lte("start_ts", range_end_ts)
            .order("start_ts", desc=False)
        )
        if subject_id:
            q = q.eq("subject_id", subject_id)
        else:
            q = q.is_("subject_id", "null")
        if academic_year_id:
            q = q.eq("academic_year_id", academic_year_id)
        return q

    by_id: Dict[str, Dict[str, Any]] = {}

    res_pc = base_query().in_("child_id", list(sid_set)).execute()
    for row in res_pc.data or []:
        rid = row.get("id")
        if rid:
            by_id[str(rid)] = row

    res_wf = base_query().is_("child_id", "null").execute()
    for row in res_wf.data or []:
        rid = row.get("id")
        if not rid:
            continue
        raw_cids = row.get("child_ids")
        if isinstance(raw_cids, list):
            cid_set = {str(c).strip() for c in raw_cids if c is not None and str(c).strip()}
        else:
            cid_set = set()
        # Empty child_ids on a whole-family row: treat as matching any requested student.
        if not cid_set or (cid_set & sid_set):
            by_id[str(rid)] = row

    slots = sorted(by_id.values(), key=lambda r: (r.get("start_ts") or "", str(r.get("id") or "")))
    return slots


def _curriculum_metadata_is_plain_text_import(cm: Any) -> bool:
    """True if this event was previously filled by commit-parsed-draft (Import from text)."""
    if not isinstance(cm, dict):
        return False
    if cm.get("import_source") in ("plain_text_parse", "plain_text_parsed"):
        return True
    if cm.get("builder_mode") == "plain_text_parsed":
        return True
    return False


def _event_row_matches_student_filter(row: Dict[str, Any], sid_set: Set[str]) -> bool:
    """Whether a plan event's assignees overlap the requested student_ids (per-child or whole-family)."""
    if not sid_set:
        return False
    cid = row.get("child_id")
    if cid is not None and str(cid).strip() in sid_set:
        return True
    if cid is None:
        raw_cids = row.get("child_ids")
        if isinstance(raw_cids, list):
            cid_set = {str(c).strip() for c in raw_cids if c is not None and str(c).strip()}
        else:
            cid_set = set()
        if not cid_set or (cid_set & sid_set):
            return True
    return False


def _row_accept_plain_text_curriculum_update(
    row: Dict[str, Any],
    *,
    replace_existing: bool,
    event_source: str,
) -> bool:
    """Empty instructional slot or prior plain-text fill we may replace when replace_existing."""
    cl = row.get("curriculum_lesson_id")
    is_empty = cl is None or (isinstance(cl, str) and not str(cl).strip())
    if is_empty:
        return True
    if replace_existing and event_source == "plain_text_parsed" and _curriculum_metadata_is_plain_text_import(
        row.get("curriculum_metadata")
    ):
        return True
    return False


def _find_plan_year_slot_for_reference_day(
    supabase,
    *,
    family_id: str,
    academic_year_id: str,
    subject_id: str,
    student_ids: List[str],
    date_ymd: str,
    replace_existing: bool,
    event_source: str,
    exclude_ids: Set[str],
) -> Optional[Dict[str, Any]]:
    """
    When the chronological slot queue is exhausted but a lesson has suggested_date / reference_date,
    attach to the plan_year calendar row on that local calendar day (same subject, plan, assignees).
    Avoids inserting a second event on the same day as the real instructional slot.
    """
    sid_set = {str(s).strip() for s in (student_ids or []) if s is not None and str(s).strip()}
    if not sid_set or len(date_ymd) < 10:
        return None
    try:
        day = date.fromisoformat(date_ymd[:10])
    except ValueError:
        return None
    range_start_ts = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    range_end_ts = datetime.combine(day, datetime.max.time(), tzinfo=timezone.utc).isoformat()

    res = (
        supabase.table("events")
        .select("id, start_ts, end_ts, child_id, child_ids, curriculum_lesson_id, curriculum_metadata")
        .eq("family_id", family_id)
        .eq("academic_year_id", academic_year_id)
        .eq("subject_id", subject_id)
        .eq("generated_by", "plan_year")
        .is_("deleted_at", "null")
        .gte("start_ts", range_start_ts)
        .lte("start_ts", range_end_ts)
        .order("start_ts", desc=False)
        .execute()
    )
    for row in res.data or []:
        rid = row.get("id")
        if not rid or str(rid) in exclude_ids:
            continue
        if not _event_row_matches_student_filter(row, sid_set):
            continue
        if not _row_accept_plain_text_curriculum_update(
            row, replace_existing=replace_existing, event_source=event_source
        ):
            continue
        return {
            "id": rid,
            "start_ts": row.get("start_ts"),
            "end_ts": row.get("end_ts"),
            "child_id": row.get("child_id"),
            "subject_id": row.get("subject_id"),
            "child_ids": row.get("child_ids"),
        }
    return None


def _get_refillable_plain_text_plan_slots(
    supabase,
    family_id: str,
    student_ids: List[str],
    start_date_str: str,
    end_date_str: str,
    subject_id: str,
    academic_year_id: str,
) -> List[Dict[str, Any]]:
    """
    Plan Year slots already filled from a prior plain-text import (curriculum_lesson_id set).
    Same child matching rules as _get_eligible_plan_slots. Used on re-commit so we UPDATE
    these rows instead of inserting duplicate calendar events on the same dates.
    """
    sid_set = {str(s).strip() for s in (student_ids or []) if s is not None and str(s).strip()}
    if not sid_set or not (subject_id or "").strip() or not (academic_year_id or "").strip():
        return []
    range_start_d = date.fromisoformat(start_date_str)
    range_end_d = date.fromisoformat(end_date_str)
    range_start_ts = datetime.combine(range_start_d, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    range_end_ts = datetime.combine(range_end_d, datetime.max.time(), tzinfo=timezone.utc).isoformat()

    res = (
        supabase.table("events")
        .select("id, start_ts, end_ts, child_id, subject_id, child_ids, curriculum_metadata")
        .eq("family_id", family_id)
        .eq("generated_by", "plan_year")
        .eq("subject_id", str(subject_id).strip())
        .eq("academic_year_id", str(academic_year_id).strip())
        .not_.is_("curriculum_lesson_id", "null")
        .is_("deleted_at", "null")
        .gte("start_ts", range_start_ts)
        .lte("start_ts", range_end_ts)
        .order("start_ts", desc=False)
        .execute()
    )
    out: List[Dict[str, Any]] = []
    for row in res.data or []:
        if not _curriculum_metadata_is_plain_text_import(row.get("curriculum_metadata")):
            continue
        cid = row.get("child_id")
        if cid is not None and str(cid).strip() in sid_set:
            out.append(
                {
                    "id": row["id"],
                    "start_ts": row.get("start_ts"),
                    "end_ts": row.get("end_ts"),
                    "child_id": cid,
                    "subject_id": row.get("subject_id"),
                    "child_ids": row.get("child_ids"),
                }
            )
            continue
        if cid is None:
            raw_cids = row.get("child_ids")
            if isinstance(raw_cids, list):
                cid_set = {str(c).strip() for c in raw_cids if c is not None and str(c).strip()}
            else:
                cid_set = set()
            if not cid_set or (cid_set & sid_set):
                out.append(
                    {
                        "id": row["id"],
                        "start_ts": row.get("start_ts"),
                        "end_ts": row.get("end_ts"),
                        "child_id": cid,
                        "subject_id": row.get("subject_id"),
                        "child_ids": row.get("child_ids"),
                    }
                )
    return out


def _merge_plan_curriculum_slot_queues(
    empty_slots: List[Dict[str, Any]],
    refill_slots: List[Dict[str, Any]],
) -> deque:
    """Single chronological queue; refill rows reuse event ids from prior plain-text apply."""
    by_id: Dict[str, Dict[str, Any]] = {}
    for s in empty_slots:
        eid = s.get("id")
        if eid:
            by_id[str(eid)] = s
    for s in refill_slots:
        eid = s.get("id")
        if eid:
            by_id[str(eid)] = s
    ordered = sorted(by_id.values(), key=lambda r: (r.get("start_ts") or "", str(r.get("id") or "")))
    return deque(ordered)


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
        committed_unit_title = (unit_data.get("title") or "").strip() or None

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
                        lt = (lesson_data.get("title") or "").strip() or "Lesson"
                        utopic = (lesson_data.get("unit_topic") or "").strip() or None
                        unit_col = utopic or committed_unit_title
                        slot_update = {
                            "curriculum_lesson_id": lesson_id,
                            "source": "curriculum",
                            "title": lt,
                        }
                        if committed_unit_title:
                            slot_update["curriculum_unit_title"] = committed_unit_title
                        if unit_col:
                            slot_update["unit"] = unit_col
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
                    
                    lt = (lesson_data.get("title") or "").strip() or "Lesson"
                    utopic = (lesson_data.get("unit_topic") or "").strip() or None
                    unit_col = utopic or committed_unit_title
                    event_record = {
                        "family_id": family_id,
                        "child_id": placement["child_id"],
                        "subject_id": subject_id,
                        "title": lt,
                        "start_ts": event_start.isoformat(),
                        "end_ts": event_end.isoformat(),
                        "status": "scheduled",
                        "source": "curriculum",
                        "curriculum_lesson_id": lesson_id,
                        "description": lesson_data.get("objective"),
                        "modality": lesson_data.get("modality"),
                        "curriculum_metadata": {"lesson_label": lt},
                    }
                    if committed_unit_title:
                        event_record["curriculum_unit_title"] = committed_unit_title
                    if unit_col:
                        event_record["unit"] = unit_col
                    
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
                                            lt_fb = (lesson_data.get("title") or "").strip() or "Lesson"
                                            utopic_fb = (lesson_data.get("unit_topic") or "").strip() or None
                                            unit_col_fb = utopic_fb or committed_unit_title
                                            event_record = {
                                                "family_id": family_id,
                                                "child_id": fallback_child_id,
                                                "subject_id": subject_id,
                                                "title": lt_fb,
                                                "start_ts": candidate_start.isoformat(),
                                                "end_ts": candidate_end.isoformat(),
                                                "status": "scheduled",
                                                "source": "curriculum",
                                                "curriculum_lesson_id": lesson_id,
                                                "description": lesson_data.get("objective"),
                                                "modality": lesson_data.get("modality"),
                                                "curriculum_metadata": {"lesson_label": lt_fb},
                                            }
                                            if committed_unit_title:
                                                event_record["curriculum_unit_title"] = committed_unit_title
                                            if unit_col_fb:
                                                event_record["unit"] = unit_col_fb
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
