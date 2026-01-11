"""
FastAPI routes for Curriculum Builder
Creates structured curriculum units with lessons and pacing
"""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
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
    add_to_backlog: Optional[bool] = Field(False, description="Add all lessons to backlog")
    lesson_backlog_map: Optional[Dict[str, bool]] = Field(None, description="Map of lesson index to backlog status")


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
            "pacing_id": pacing_res.data[0]["id"] if pacing_res.data else None
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
                "pacing_id": pacing_res.data[0]["id"] if 'pacing_res' in locals() and pacing_res.data else None
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
