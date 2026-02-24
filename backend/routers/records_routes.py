"""
FastAPI routes for Records, Credits & Compliance (Phase 4)
Handles grades, transcripts, portfolio uploads, and state requirements
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query, Request, Body
from fastapi.responses import StreamingResponse, JSONResponse, Response
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
import hashlib
from email.utils import formatdate
import sys
import csv
import io
from pathlib import Path
import json
import zipfile
from io import BytesIO

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client
from cache import cached

router = APIRouter(prefix="/api/records", tags=["records"])


class AddGradeInput(BaseModel):
    child_id: str = Field(..., description="Child ID")
    subject_id: Optional[str] = Field(None, description="Subject ID (optional)")
    term_label: Optional[str] = Field(None, description="Term label e.g. '2025–26 Semester 1'")
    score: Optional[float] = Field(None, description="Numeric score")
    grade: Optional[str] = Field(None, description="Grade e.g. 'A', 'B+', 'Pass'")
    credits: Optional[float] = Field(None, description="Credits (e.g. 1.0, 0.5)")
    rubric: Optional[str] = Field(None, description="Description of how graded")
    notes: Optional[str] = Field(None, description="Additional notes")


class AddGradeOut(BaseModel):
    id: str
    child_id: str
    subject_id: Optional[str]
    term_label: Optional[str]
    score: Optional[float]
    grade: Optional[str]
    rubric: Optional[str]
    notes: Optional[str]
    created_at: str


class AddPortfolioUploadInput(BaseModel):
    child_id: str = Field(..., description="Child ID")
    subject_id: Optional[str] = Field(None, description="Subject ID (optional)")
    event_id: Optional[str] = Field(None, description="Event ID (optional)")
    caption: Optional[str] = Field(None, description="Caption for the upload")
    file_path: str = Field(..., description="Supabase Storage path")


class AddPortfolioUploadOut(BaseModel):
    id: str
    child_id: Optional[str]
    subject_id: Optional[str]
    event_id: Optional[str]
    storage_path: str
    caption: Optional[str]
    created_at: str


class StateRequirement(BaseModel):
    id: str
    label: str
    detail: Optional[str] = None
    type: str  # "info", "required", "optional"
    source_url: Optional[str] = None
    last_verified_date: Optional[str] = None  # ISO date or null
    verified_at: Optional[str] = None  # ISO timestamp when last marked verified


class UpdateSupportProfileIn(BaseModel):
    color_mode: Optional[str] = Field(None, description="Color mode preference")
    color_preferences: Optional[Dict[str, Any]] = Field(None, description="Custom color preferences as JSON")


class StateRequirementVerifyIn(BaseModel):
    notes: Optional[str] = Field(None, description="Optional note when marking as verified")


@router.post("/add_grade", response_model=AddGradeOut)
async def add_grade(
    input: AddGradeInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Add a grade record for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_check = supabase.table("children").select("id").eq("id", input.child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=404, detail="Child not found")

        # Insert grade
        grade_data = {
            "family_id": family_id,
            "child_id": input.child_id,
            "subject_id": input.subject_id,
            "term_label": input.term_label,
            "score": input.score,
            "grade": input.grade,
            "credits": input.credits or 0,
            "rubric": input.rubric,
            "notes": input.notes,
            "created_by": user["id"]
        }

        result = supabase.table("grades").insert(grade_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create grade")

        log_event("grade_added", {
            "grade_id": result.data[0]["id"],
            "child_id": input.child_id,
            "family_id": family_id
        })

        return AddGradeOut(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="add_grade")
        raise HTTPException(status_code=500, detail=f"Error adding grade: {str(e)}")


@router.post("/add_portfolio_upload", response_model=AddPortfolioUploadOut)
async def add_portfolio_upload(
    input: AddPortfolioUploadInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Add a portfolio upload metadata record"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family if provided
        if input.child_id:
            child_check = supabase.table("children").select("id").eq("id", input.child_id).eq("family_id", family_id).single().execute()
            if not child_check.data:
                raise HTTPException(status_code=404, detail="Child not found")

        # Insert upload metadata
        upload_data = {
            "family_id": family_id,
            "child_id": input.child_id,
            "subject_id": input.subject_id,
            "event_id": input.event_id,
            "storage_path": input.file_path,
            "caption": input.caption,
            "created_by": user["id"]
        }

        result = supabase.table("uploads").insert(upload_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create upload record")

        log_event("portfolio_upload_added", {
            "upload_id": result.data[0]["id"],
            "child_id": input.child_id,
            "family_id": family_id
        })

        return AddPortfolioUploadOut(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="add_portfolio_upload")
        raise HTTPException(status_code=500, detail=f"Error adding portfolio upload: {str(e)}")


def _fetch_state_requirements_from_db(state_code: str) -> List[StateRequirement]:
    """Read state requirements from DB (source of truth). Returns empty list if none."""
    try:
        supabase = get_admin_client()
        result = (
            supabase.table("state_requirements")
            .select(
                "id, requirement_key, requirement_title, requirement_description, obligation_type, "
                "source_url, last_verified_date, verified_at"
            )
            .eq("state_code", state_code.upper())
            .order("requirement_type")
            .execute()
        )
        rows = result.data or []
        out = []
        for r in rows:
            last_verified = r.get("last_verified_date")
            verified_at = r.get("verified_at")
            out.append(
                StateRequirement(
                    id=str(r["id"]),
                    label=r.get("requirement_title") or "",
                    detail=r.get("requirement_description"),
                    type=r.get("obligation_type") or "required",
                    source_url=r.get("source_url"),
                    last_verified_date=str(last_verified) if last_verified else None,
                    verified_at=verified_at.isoformat() if isinstance(verified_at, datetime) else (str(verified_at) if verified_at else None),
                )
            )
        return out
    except Exception as e:
        log_event("state_requirements.db_error", error=str(e), state_code=state_code)
        return []


def _get_state_requirements_max_updated(state_code: str) -> Optional[datetime]:
    """Return MAX(updated_at) for state_requirements in this state (for ETag/Last-Modified)."""
    try:
        supabase = get_admin_client()
        result = (
            supabase.table("state_requirements")
            .select("updated_at")
            .eq("state_code", state_code.upper())
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data or len(result.data) == 0:
            return None
        raw = result.data[0].get("updated_at")
        if raw is None:
            return None
        if isinstance(raw, datetime):
            return raw
        if isinstance(raw, str):
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return None
    except Exception:
        return None


def _fetch_state_requirements_from_json(state_code: str) -> List[StateRequirement]:
    """Fallback: load from JSON file when DB has no rows for this state."""
    data_file = Path(__file__).parent.parent / "data" / "state_requirements.json"
    if not data_file.exists():
        return [
            StateRequirement(id="hours", label="Minimum hours per year", detail="900 hours", type="info"),
            StateRequirement(id="attendance", label="Attendance tracking", type="required"),
        ]
    with open(data_file, "r") as f:
        all_requirements = json.load(f)
    state_requirements = all_requirements.get(state_code.upper(), [])
    # JSON uses id, label, detail, type — map to StateRequirement (id must be string for API); no source/verified in JSON
    return [
        StateRequirement(
            id=req.get("id", ""),
            label=req.get("label", ""),
            detail=req.get("detail"),
            type=req.get("type", "required"),
            source_url=None,
            last_verified_date=None,
            verified_at=None,
        )
        for req in state_requirements
    ]


@cached(ttl_seconds=3600)  # Cache for 1 hour
def _fetch_state_requirements(state_code: str) -> List[StateRequirement]:
    """DB as source of truth; JSON fallback if DB empty for this state."""
    state_code = state_code.upper()
    from_db = _fetch_state_requirements_from_db(state_code)
    if from_db:
        return from_db
    log_event(
        "state_requirements.fallback_json",
        state_code=state_code,
        message="No rows in state_requirements for state; using JSON fallback",
    )
    return _fetch_state_requirements_from_json(state_code)


@router.get("/state_requirements")
async def get_state_requirements(
    request: Request,
    state_code: str = Query(..., description="State code (e.g. 'CA', 'NY')"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get state requirements for compliance (cached for 1 hour). Reads from DB first, falls back to JSON.
    Returns ETag and Last-Modified when data is from DB; supports If-None-Match / If-Modified-Since for 304."""
    try:
        data = _fetch_state_requirements(state_code)
        state_code_upper = state_code.upper()
        from_db = _fetch_state_requirements_from_db(state_code_upper)
        headers = {}
        if from_db:
            max_updated = _get_state_requirements_max_updated(state_code_upper)
            if max_updated:
                last_modified = formatdate(timeval=max_updated.timestamp(), localtime=False, usegmt=True)
                headers["Last-Modified"] = last_modified
                etag = '"' + hashlib.md5(str(max_updated.isoformat()).encode()).hexdigest() + '"'
                headers["ETag"] = etag
                if_none_match = request.headers.get("If-None-Match")
                if_modified_since = request.headers.get("If-Modified-Since")
                if (if_none_match and if_none_match.strip() == etag) or (
                    if_modified_since and last_modified and if_modified_since == last_modified
                ):
                    return Response(status_code=304, headers=headers)
        body = [r.model_dump() for r in data]
        return JSONResponse(content=body, headers=headers)
    except Exception as e:
        log_event("error", error=str(e), endpoint="state_requirements")
        raise HTTPException(status_code=500, detail=f"Error loading state requirements: {str(e)}")


@router.post("/state_requirements/{requirement_id}/verify")
async def verify_state_requirement(
    requirement_id: str,
    body: Optional[StateRequirementVerifyIn] = Body(None),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter),
):
    """Mark a state requirement as verified (admin/content workflow). Sets verified_at, verified_by, last_verified_date, verification_notes."""
    try:
        supabase = get_admin_client()
        # Ensure requirement exists
        row = (
            supabase.table("state_requirements")
            .select("id")
            .eq("id", requirement_id)
            .single()
            .execute()
        )
        if not row.data:
            raise HTTPException(status_code=404, detail="Requirement not found")
        now = datetime.utcnow()
        update_data = {
            "verified_at": now.isoformat(),
            "verified_by": user["id"],
            "last_verified_date": now.date().isoformat(),
            "updated_at": now.isoformat(),
        }
        if body and body.notes is not None:
            update_data["verification_notes"] = body.notes
        supabase.table("state_requirements").update(update_data).eq("id", requirement_id).execute()
        log_event("state_requirement_verified", requirement_id=requirement_id, user_id=user["id"])
        return {"ok": True, "requirement_id": requirement_id}
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="state_requirements_verify")
        raise HTTPException(status_code=500, detail=f"Error verifying requirement: {str(e)}")


@router.get("/last_transcript")
async def get_last_transcript(
    child_id: str = Query(..., description="Child ID"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get the last transcript export for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_check = supabase.table("children").select("id").eq("id", child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=404, detail="Child not found")

        # Get last transcript
        transcript_result = supabase.table("transcripts").select(
            "id, created_at, export_url"
        ).eq("child_id", child_id).order("created_at", ascending=False).limit(1).execute()

        if not transcript_result.data:
            return {"last_transcript": None}

        return {"last_transcript": transcript_result.data[0]}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="last_transcript")
        raise HTTPException(status_code=500, detail=f"Error fetching last transcript: {str(e)}")


@router.get("/generate_transcript")
async def generate_transcript(
    child_id: str = Query(..., description="Child ID"),
    range_start: date = Query(..., description="Start date (YYYY-MM-DD)"),
    range_end: date = Query(..., description="End date (YYYY-MM-DD)"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Generate a transcript CSV for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_check = supabase.table("children").select("id, first_name").eq("id", child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=404, detail="Child not found")

        child_name = child_check.data.get("first_name", "Student")

        # Query attendance records in range
        attendance_result = supabase.table("attendance_records").select(
            "day_date, minutes, status, note"
        ).eq("child_id", child_id).gte("day_date", str(range_start)).lte("day_date", str(range_end)).order("day_date").execute()

        # Query grades for the child
        grades_result = supabase.table("grades").select(
            "term_label, subject_id, grade, score, credits, rubric, notes, created_at"
        ).eq("child_id", child_id).order("created_at").execute()

        # Get subject names for grades
        subject_ids = [g.get("subject_id") for g in grades_result.data if g.get("subject_id")]
        subjects_map = {}
        if subject_ids:
            subjects_result = supabase.table("subject").select("id, name").in_("id", subject_ids).execute()
            subjects_map = {s["id"]: s["name"] for s in subjects_result.data}

        # Query event outcomes summary
        outcomes_result = supabase.table("event_outcomes").select(
            "subject_id, rating, grade, strengths, struggles"
        ).eq("child_id", child_id).execute()

        # Build CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow(["Transcript for", child_name])
        writer.writerow(["Date Range", f"{range_start} to {range_end}"])
        writer.writerow([])

        # Attendance Summary
        writer.writerow(["ATTENDANCE SUMMARY"])
        writer.writerow(["Total Days", "Total Hours", "Total Minutes", "Present Days", "Partial Days", "Absent Days"])
        total_minutes = 0
        present_days = 0
        partial_days = 0
        absent_days = 0
        unique_days = set()
        
        for record in attendance_result.data:
            minutes = record.get("minutes", 0)
            status = record.get("status", "").lower()
            day_date = record.get("day_date", "")
            
            total_minutes += minutes
            unique_days.add(day_date)
            
            if status == "present":
                present_days += 1
            elif status == "partial":
                partial_days += 1
            elif status == "absent":
                absent_days += 1
        
        total_hours = round(total_minutes / 60, 2)
        writer.writerow([
            len(unique_days),
            total_hours,
            total_minutes,
            present_days,
            partial_days,
            absent_days
        ])
        writer.writerow([])
        
        # Detailed Attendance Records
        writer.writerow(["DETAILED ATTENDANCE RECORDS"])
        writer.writerow(["Date", "Minutes", "Status", "Note"])
        for record in attendance_result.data:
            writer.writerow([
                record.get("day_date", ""),
                record.get("minutes", 0),
                record.get("status", ""),
                record.get("note", "")
            ])
        writer.writerow([])

        # Grades Summary
        writer.writerow(["GRADES SUMMARY"])
        writer.writerow(["Term", "Subject", "Grade", "Score", "Credits", "Rubric", "Notes", "Date"])
        total_credits = 0
        grades_by_subject = {}
        
        for grade in grades_result.data:
            subject_id = grade.get("subject_id")
            subject_name = subjects_map.get(subject_id, "")
            credits = grade.get("credits") or 0
            total_credits += credits
            
            if subject_id not in grades_by_subject:
                grades_by_subject[subject_id] = []
            grades_by_subject[subject_id].append(grade)
            
            writer.writerow([
                grade.get("term_label", ""),
                subject_name,
                grade.get("grade", ""),
                grade.get("score", ""),
                credits,
                grade.get("rubric", ""),
                grade.get("notes", ""),
                grade.get("created_at", "")
            ])
        
        writer.writerow([])
        writer.writerow(["Total Credits", total_credits])
        writer.writerow([])
        
        # Grades by Subject
        writer.writerow(["GRADES BY SUBJECT"])
        for subject_id, grade_list in grades_by_subject.items():
            subject_name = subjects_map.get(subject_id, "")
            writer.writerow([f"Subject: {subject_name}"])
            writer.writerow(["Term", "Grade", "Score", "Credits"])
            for grade in grade_list:
                writer.writerow([
                    grade.get("term_label", ""),
                    grade.get("grade", ""),
                    grade.get("score", ""),
                    grade.get("credits") or 0
                ])
            writer.writerow([])

        # Outcomes Summary
        writer.writerow(["OUTCOMES SUMMARY"])
        writer.writerow(["Subject", "Average Rating", "Top Strengths", "Top Struggles"])
        outcomes_by_subject = {}
        for outcome in outcomes_result.data:
            subject_id = outcome.get("subject_id")
            if subject_id not in outcomes_by_subject:
                outcomes_by_subject[subject_id] = {
                    "ratings": [],
                    "strengths": [],
                    "struggles": []
                }
            if outcome.get("rating"):
                outcomes_by_subject[subject_id]["ratings"].append(outcome.get("rating"))
            if outcome.get("strengths"):
                outcomes_by_subject[subject_id]["strengths"].extend(outcome.get("strengths", []))
            if outcome.get("struggles"):
                outcomes_by_subject[subject_id]["struggles"].extend(outcome.get("struggles", []))

        for subject_id, data in outcomes_by_subject.items():
            subject_name = subjects_map.get(subject_id, "")
            avg_rating = sum(data["ratings"]) / len(data["ratings"]) if data["ratings"] else None
            # Count frequency of strengths/struggles
            strengths_count = {}
            for s in data["strengths"]:
                strengths_count[s] = strengths_count.get(s, 0) + 1
            struggles_count = {}
            for s in data["struggles"]:
                struggles_count[s] = struggles_count.get(s, 0) + 1
            
            top_strengths = ", ".join([s for s, _ in sorted(strengths_count.items(), key=lambda x: x[1], reverse=True)[:3]])
            top_struggles = ", ".join([s for s, _ in sorted(struggles_count.items(), key=lambda x: x[1], reverse=True)[:3]])
            
            writer.writerow([
                subject_name,
                f"{avg_rating:.2f}" if avg_rating else "",
                top_strengths,
                top_struggles
            ])
        
        writer.writerow([])
        
        # Notes Section (Top 3 Strengths/Struggles)
        writer.writerow(["NOTES"])
        all_strengths = []
        all_struggles = []
        for data in outcomes_by_subject.values():
            all_strengths.extend(data["strengths"])
            all_struggles.extend(data["struggles"])
        
        if all_strengths or all_struggles:
            strengths_count = {}
            for s in all_strengths:
                strengths_count[s] = strengths_count.get(s, 0) + 1
            struggles_count = {}
            for s in all_struggles:
                struggles_count[s] = struggles_count.get(s, 0) + 1
            
            top_3_strengths = [s for s, _ in sorted(strengths_count.items(), key=lambda x: x[1], reverse=True)[:3]]
            top_3_struggles = [s for s, _ in sorted(struggles_count.items(), key=lambda x: x[1], reverse=True)[:3]]
            
            if top_3_strengths:
                writer.writerow(["Top Strengths:", ", ".join(top_3_strengths)])
            if top_3_struggles:
                writer.writerow(["Top Struggles:", ", ".join(top_3_struggles)])

        csv_content = output.getvalue()
        output.close()

        # Save transcript record
        transcript_data = {
            "family_id": family_id,
            "child_id": child_id,
            "export_url": f"transcript_{child_name}_{range_start}_{range_end}.csv",
            "created_by": user["id"]
        }
        
        transcript_result = supabase.table("transcripts").insert(transcript_data).execute()
        
        log_event("transcript_generated", {
            "child_id": child_id,
            "family_id": family_id,
            "range_start": str(range_start),
            "range_end": str(range_end),
            "transcript_id": transcript_result.data[0]["id"] if transcript_result.data else None
        })

        # Return CSV as streaming response
        return StreamingResponse(
            io.BytesIO(csv_content.encode("utf-8")),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="transcript_{child_name}_{range_start}_{range_end}.csv"'
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="generate_transcript")
        raise HTTPException(status_code=500, detail=f"Error generating transcript: {str(e)}")


# ============================================================
# Essential Documents Routes
# ============================================================

class AddDocumentInput(BaseModel):
    child_id: str = Field(..., description="Child ID")
    type: str = Field(..., description="Document type (medical_profile, id_card, allergy_sheet, etc.)")
    title: str = Field(..., description="Document title")
    file_url: Optional[str] = Field(None, description="Supabase Storage URL")
    metadata: Optional[dict] = Field(None, description="Additional structured data (allergies, medications, etc.)")


class DocumentOut(BaseModel):
    id: str
    child_id: str
    family_id: str
    type: str
    title: str
    file_url: Optional[str]
    metadata: Optional[dict]
    created_at: str
    updated_at: str


@router.post("/documents", response_model=DocumentOut)
async def add_document(
    input: AddDocumentInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Add an essential document for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(input.child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Validate document type
        valid_types = [
            "medical_profile", "id_card", "allergy_sheet", "vaccination_record",
            "safety_plan", "permission_form", "iep", "504_plan", "behavior_plan",
            "therapy_contact", "other"
        ]
        if input.type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid document type. Must be one of: {', '.join(valid_types)}")

        # Insert document
        document_data = {
            "child_id": input.child_id,
            "family_id": family_id,
            "type": input.type,
            "title": input.title,
            "file_url": input.file_url,
            "metadata": input.metadata or {}
        }

        result = supabase.table("child_documents").insert(document_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create document")

        log_event("document_added", {
            "document_id": result.data[0]["id"],
            "child_id": input.child_id,
            "family_id": family_id,
            "type": input.type
        })

        return DocumentOut(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="add_document")
        raise HTTPException(status_code=500, detail=f"Error adding document: {str(e)}")


@router.get("/documents", response_model=List[DocumentOut])
async def list_documents(
    child_id: str = Query(..., description="Child ID"),
    doc_type: Optional[str] = Query(None, description="Filter by document type"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """List essential documents for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Query documents
        query = supabase.table("child_documents").select("*").eq("child_id", child_id).eq("family_id", family_id)
        
        if doc_type:
            query = query.eq("type", doc_type)
        
        result = query.order("created_at", desc=True).execute()

        return [DocumentOut(**doc) for doc in result.data]

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="list_documents")
        raise HTTPException(status_code=500, detail=f"Error listing documents: {str(e)}")


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Delete an essential document"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify document belongs to family
        doc_check = supabase.table("child_documents").select("id, family_id").eq("id", document_id).single().execute()
        if not doc_check.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        if doc_check.data.get("family_id") != family_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Delete document
        result = supabase.table("child_documents").delete().eq("id", document_id).execute()

        log_event("document_deleted", {
            "document_id": document_id,
            "family_id": family_id
        })

        return {"success": True, "message": "Document deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="delete_document")
        raise HTTPException(status_code=500, detail=f"Error deleting document: {str(e)}")


@router.get("/support_profile")
async def get_support_profile(
    child_id: str = Query(..., description="Child ID"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get support profile for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Query support profile
        result = supabase.table("child_support_profiles").select("*").eq("child_id", child_id).execute()

        if not result.data:
            return {
                "child_id": child_id,
                "diagnoses": [],
                "learning_modalities": [],
                "support_needs": [],
                "executive_function": [],
                "notes": None,
                "color_mode": None,
                "color_preferences": {}
            }

        profile = result.data[0]
        return {
            "child_id": child_id,
            "diagnoses": profile.get("diagnoses", []),
            "learning_modalities": profile.get("learning_modalities", []),
            "support_needs": profile.get("support_needs", []),
            "executive_function": profile.get("executive_function", []),
            "notes": profile.get("notes"),
            "color_mode": profile.get("color_mode"),
            "color_preferences": profile.get("color_preferences", {})
        }

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="get_support_profile")
        raise HTTPException(status_code=500, detail=f"Error fetching support profile: {str(e)}")


@router.put("/support_profile")
async def update_support_profile(
    child_id: str = Query(..., description="Child ID"),
    payload: UpdateSupportProfileIn = ...,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Update support profile including color mode preferences"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Build update data
        update_data = {}
        if payload.color_mode is not None:
            valid_modes = ['default', 'high_contrast', 'low_contrast', 'colorblind_friendly', 'dyslexia_friendly', 'autism_friendly']
            if payload.color_mode not in valid_modes:
                raise HTTPException(status_code=400, detail=f"Invalid color_mode. Must be one of: {', '.join(valid_modes)}")
            update_data["color_mode"] = payload.color_mode
        if payload.color_preferences is not None:
            update_data["color_preferences"] = payload.color_preferences

        if not update_data:
            raise HTTPException(status_code=400, detail="No update data provided")

        # Upsert support profile
        update_data["child_id"] = child_id
        result = supabase.table("child_support_profiles").upsert(
            update_data,
            on_conflict="child_id"
        ).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update support profile")

        log_event("records.support_profile.updated", user_id=user["id"], child_id=child_id, color_mode=payload.color_mode if payload.color_mode else None)
        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="update_support_profile")
        raise HTTPException(status_code=500, detail=f"Error updating support profile: {str(e)}")


# ============================================================
# Learner Profile Routes
# ============================================================

class LearnerProfileIn(BaseModel):
    strengths: Optional[List[str]] = None
    interests: Optional[List[str]] = None
    learning_preferences: Optional[dict] = None
    academic_strengths: Optional[List[str]] = None
    academic_challenges: Optional[List[str]] = None
    preferred_subjects: Optional[List[str]] = None
    social_preferences: Optional[dict] = None
    motivation_factors: Optional[List[str]] = None
    learning_patterns: Optional[dict] = None
    progress_notes: Optional[str] = None


class LearnerProfileOut(BaseModel):
    id: str
    child_id: str
    strengths: List[str]
    interests: List[str]
    learning_preferences: dict
    academic_strengths: List[str]
    academic_challenges: List[str]
    preferred_subjects: List[str]
    social_preferences: dict
    motivation_factors: List[str]
    learning_patterns: dict
    progress_notes: Optional[str]
    created_at: str
    updated_at: str


@router.get("/learner_profile", response_model=LearnerProfileOut)
async def get_learner_profile(
    child_id: str = Query(..., description="Child ID"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get comprehensive learner profile for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Query learner profile - handle RLS errors gracefully
        try:
            result = supabase.table("child_learner_profile").select("*").eq("child_id", child_id).execute()
            
            if result.data and len(result.data) > 0:
                profile = result.data[0]
                # Map to expected format
                return {
                    "id": profile.get("id", ""),
                    "child_id": child_id,
                    "strengths": profile.get("strengths", []),
                    "interests": profile.get("interests", []),
                    "learning_preferences": profile.get("learning_patterns", {}),  # Map learning_patterns to learning_preferences
                    "academic_strengths": profile.get("academic_strengths", []),
                    "academic_challenges": profile.get("academic_challenges", []),
                    "preferred_subjects": profile.get("preferred_subjects", []),
                    "social_preferences": {},  # Not in schema yet
                    "motivation_factors": profile.get("motivation_factors", []),
                    "learning_patterns": profile.get("learning_patterns", {}),
                    "progress_notes": None,  # Not in schema yet
                    "created_at": profile.get("created_at", ""),
                    "updated_at": profile.get("updated_at", "")
                }
        except Exception as table_error:
            # If table doesn't exist or RLS blocks access, return empty profile
            error_str = str(table_error)
            if "permission denied" in error_str.lower() or "42501" in error_str:
                log_event("learner_profile.rls_blocked", user_id=user["id"], child_id=child_id, error=error_str)
            else:
                log_event("learner_profile.query_error", user_id=user["id"], child_id=child_id, error=error_str)
        
        # Return default empty profile
        return {
            "id": "",
            "child_id": child_id,
            "strengths": [],
            "interests": [],
            "learning_preferences": {},
            "academic_strengths": [],
            "academic_challenges": [],
            "preferred_subjects": [],
            "social_preferences": {},
            "motivation_factors": [],
            "learning_patterns": {},
            "progress_notes": None,
            "created_at": "",
            "updated_at": ""
        }

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="get_learner_profile")
        raise HTTPException(status_code=500, detail=f"Error fetching learner profile: {str(e)}")


@router.put("/learner_profile", response_model=LearnerProfileOut)
async def update_learner_profile(
    child_id: str = Query(..., description="Child ID"),
    profile: LearnerProfileIn = ...,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Create or update comprehensive learner profile"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Build update data from model
        update_data = {"child_id": child_id}
        profile_dict = profile.dict(exclude_unset=True)
        for key, value in profile_dict.items():
            if value is not None:
                update_data[key] = value

        # Upsert learner profile - handle RLS errors
        try:
            result = supabase.table("child_learner_profile").upsert(
                update_data,
                on_conflict="child_id"
            ).execute()

            if not result.data:
                raise HTTPException(status_code=500, detail="Failed to update learner profile")

            log_event("records.learner_profile.updated", user_id=user["id"], child_id=child_id)
            
            # Map response to expected format
            profile = result.data[0]
            return {
                "id": profile.get("id", ""),
                "child_id": child_id,
                "strengths": profile.get("strengths", []),
                "interests": profile.get("interests", []),
                "learning_preferences": profile.get("learning_patterns", {}),
                "academic_strengths": profile.get("academic_strengths", []),
                "academic_challenges": profile.get("academic_challenges", []),
                "preferred_subjects": profile.get("preferred_subjects", []),
                "social_preferences": {},
                "motivation_factors": profile.get("motivation_factors", []),
                "learning_patterns": profile.get("learning_patterns", {}),
                "progress_notes": None,
                "created_at": profile.get("created_at", ""),
                "updated_at": profile.get("updated_at", "")
            }
        except Exception as table_error:
            error_str = str(table_error)
            if "permission denied" in error_str.lower() or "42501" in error_str:
                log_event("learner_profile.update_rls_blocked", user_id=user["id"], child_id=child_id, error=error_str)
                raise HTTPException(
                    status_code=500, 
                    detail="Permission denied. Please ensure the database migration has been run and RLS policies are configured correctly."
                )
            raise
        return LearnerProfileOut(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="update_learner_profile")
        raise HTTPException(status_code=500, detail=f"Error updating learner profile: {str(e)}")


@router.get("/comprehensive_profile")
async def get_comprehensive_profile(
    child_id: str = Query(..., description="Child ID"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get comprehensive learner profile combining support profile and learner profile"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Use the database function to get comprehensive profile
        result = supabase.rpc("get_comprehensive_learner_profile", {"_child_id": child_id}).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to fetch comprehensive profile")

        return result.data

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="get_comprehensive_profile")
        raise HTTPException(status_code=500, detail=f"Error fetching comprehensive profile: {str(e)}")


# ============================================================
# Personalized Recommendations Routes
# ============================================================

class RecommendationIn(BaseModel):
    recommendation_type: str
    title: str
    description: str
    rationale: Optional[str] = None
    linked_content_type: Optional[str] = None
    linked_content_id: Optional[str] = None
    priority: Optional[int] = 3
    confidence_score: Optional[float] = 0.5
    estimated_benefit: Optional[str] = None
    estimated_time_minutes: Optional[int] = None
    cognitive_load: Optional[str] = None
    influenced_by: Optional[dict] = None


class RecommendationOut(BaseModel):
    id: str
    family_id: str
    child_id: str
    recommendation_type: str
    title: str
    description: str
    rationale: Optional[str]
    linked_content_type: Optional[str]
    linked_content_id: Optional[str]
    priority: int
    confidence_score: Optional[float]
    estimated_benefit: Optional[str]
    estimated_time_minutes: Optional[int]
    cognitive_load: Optional[str]
    influenced_by: dict
    status: str
    accepted_at: Optional[str]
    dismissed_at: Optional[str]
    completed_at: Optional[str]
    snoozed_until: Optional[str]
    user_feedback: Optional[str]
    user_rating: Optional[int]
    created_at: str
    updated_at: str


@router.get("/recommendations", response_model=List[RecommendationOut])
async def get_recommendations(
    child_id: str = Query(..., description="Child ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    recommendation_type: Optional[str] = Query(None, description="Filter by type"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get personalized recommendations for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Build query
        query = supabase.table("personalized_recommendations").select("*").eq("child_id", child_id).eq("family_id", family_id)

        if status:
            query = query.eq("status", status)
        if recommendation_type:
            query = query.eq("recommendation_type", recommendation_type)

        result = query.order("priority", desc=True).order("created_at", desc=True).execute()

        return [RecommendationOut(**rec) for rec in (result.data or [])]

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="get_recommendations")
        raise HTTPException(status_code=500, detail=f"Error fetching recommendations: {str(e)}")


@router.post("/recommendations", response_model=RecommendationOut)
async def create_recommendation(
    child_id: str = Query(..., description="Child ID"),
    recommendation: RecommendationIn = ...,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Create a new personalized recommendation"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Validate recommendation_type
        valid_types = ['learning_strategy', 'resource', 'schedule_adjustment', 'subject_suggestion', 'activity_suggestion', 'support_strategy', 'goal_setting', 'skill_development']
        if recommendation.recommendation_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid recommendation_type. Must be one of: {', '.join(valid_types)}")

        # Build insert data
        insert_data = {
            "family_id": family_id,
            "child_id": child_id,
            "created_by": user["id"],
            **recommendation.dict(exclude_unset=True)
        }

        result = supabase.table("personalized_recommendations").insert(insert_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create recommendation")

        log_event("records.recommendation.created", user_id=user["id"], child_id=child_id, recommendation_type=recommendation.recommendation_type)
        return RecommendationOut(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="create_recommendation")
        raise HTTPException(status_code=500, detail=f"Error creating recommendation: {str(e)}")


@router.patch("/recommendations/{recommendation_id}", response_model=RecommendationOut)
async def update_recommendation(
    recommendation_id: str,
    status: Optional[str] = Query(None, description="Update status"),
    user_feedback: Optional[str] = Query(None, description="User feedback"),
    user_rating: Optional[int] = Query(None, description="User rating 1-5"),
    snoozed_until: Optional[str] = Query(None, description="Snooze until date (ISO format)"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Update recommendation status or feedback"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify recommendation belongs to family
        rec_result = supabase.table("personalized_recommendations").select("family_id, child_id").eq("id", recommendation_id).single().execute()
        if not rec_result.data or rec_result.data["family_id"] != family_id:
            raise HTTPException(status_code=404, detail="Recommendation not found")

        # Build update data
        update_data = {}
        if status:
            valid_statuses = ['pending', 'accepted', 'dismissed', 'completed', 'snoozed']
            if status not in valid_statuses:
                raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
            update_data["status"] = status
            # Set timestamp based on status
            if status == "accepted":
                update_data["accepted_at"] = datetime.utcnow().isoformat()
            elif status == "dismissed":
                update_data["dismissed_at"] = datetime.utcnow().isoformat()
            elif status == "completed":
                update_data["completed_at"] = datetime.utcnow().isoformat()
        if user_feedback is not None:
            update_data["user_feedback"] = user_feedback
        if user_rating is not None:
            if user_rating < 1 or user_rating > 5:
                raise HTTPException(status_code=400, detail="user_rating must be between 1 and 5")
            update_data["user_rating"] = user_rating
        if snoozed_until is not None:
            update_data["snoozed_until"] = snoozed_until
            update_data["status"] = "snoozed"

        if not update_data:
            raise HTTPException(status_code=400, detail="No update data provided")

        result = supabase.table("personalized_recommendations").update(update_data).eq("id", recommendation_id).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update recommendation")

        log_event("records.recommendation.updated", user_id=user["id"], recommendation_id=recommendation_id, status=status)
        return RecommendationOut(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="update_recommendation")
        raise HTTPException(status_code=500, detail=f"Error updating recommendation: {str(e)}")


# ============================================================
# Compliance Packet Export
# ============================================================

class CompliancePacketRequest(BaseModel):
    family_id: str
    child_ids: Optional[List[str]] = None
    date_start: date
    date_end: date


@router.post("/compliance_packet")
async def generate_compliance_packet(
    payload: CompliancePacketRequest,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """
    Generate a compliance packet ZIP file with transcripts, attendance, evidence, and summaries.
    """
    try:
        supabase = get_admin_client()
        
        # Verify user is authorized to access this family_id
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != payload.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this family")
        
        # Resolve list of children
        if payload.child_ids and len(payload.child_ids) > 0:
            # Verify all children belong to family
            children_res = supabase.table("children").select("id, first_name").eq("family_id", payload.family_id).in_("id", payload.child_ids).execute()
            children = children_res.data or []
            if len(children) != len(payload.child_ids):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Some children not accessible")
        else:
            # Get all children in family
            children_res = supabase.table("children").select("id, first_name").eq("family_id", payload.family_id).execute()
            children = children_res.data or []
        
        if not children:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No children found")
        
        # Create ZIP in memory
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            date_start_str = str(payload.date_start)
            date_end_str = str(payload.date_end)
            
            # Get subjects map
            subjects_res = supabase.table("subject").select("id, name").eq("family_id", payload.family_id).execute()
            subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}
            
            # For each child, create files
            for child in children:
                child_id = child["id"]
                child_name = child.get("first_name", "Student")
                safe_name = child_name.replace("/", "_").replace("\\", "_")
                
                # 1. Transcript/credits CSV
                transcript_csv = io.StringIO()
                transcript_writer = csv.writer(transcript_csv)
                transcript_writer.writerow(["Transcript for", child_name])
                transcript_writer.writerow(["Date Range", f"{date_start_str} to {date_end_str}"])
                transcript_writer.writerow([])
                
                # Get grades/credits
                grades_res = supabase.table("grades").select(
                    "term_label, subject_id, grade, score, credits, rubric, notes, created_at"
                ).eq("child_id", child_id).order("created_at").execute()
                
                transcript_writer.writerow(["GRADES"])
                transcript_writer.writerow(["Term", "Subject", "Grade", "Score", "Credits", "Rubric", "Notes", "Date"])
                total_credits = 0
                for grade in (grades_res.data or []):
                    subject_name = subjects_map.get(grade.get("subject_id"), "Unassigned")
                    credits = float(grade.get("credits") or 0)
                    total_credits += credits
                    transcript_writer.writerow([
                        grade.get("term_label", ""),
                        subject_name,
                        grade.get("grade", ""),
                        grade.get("score", ""),
                        credits,
                        grade.get("rubric", ""),
                        grade.get("notes", ""),
                        grade.get("created_at", "")
                    ])
                transcript_writer.writerow([])
                transcript_writer.writerow(["Total Credits", total_credits])
                
                zf.writestr(f"{safe_name}/transcript.csv", transcript_csv.getvalue())
                transcript_csv.close()
                
                # 2. Attendance CSV
                attendance_csv = io.StringIO()
                attendance_writer = csv.writer(attendance_csv)
                attendance_writer.writerow(["Attendance Logs for", child_name])
                attendance_writer.writerow(["Date Range", f"{date_start_str} to {date_end_str}"])
                attendance_writer.writerow([])
                
                attendance_res = supabase.table("attendance_records").select(
                    "day_date, minutes, status, note"
                ).eq("child_id", child_id).gte("day_date", date_start_str).lte("day_date", date_end_str).order("day_date").execute()
                
                attendance_writer.writerow(["Date", "Minutes", "Status", "Note"])
                total_minutes = 0
                for record in (attendance_res.data or []):
                    minutes = record.get("minutes", 0) or 0
                    total_minutes += minutes
                    attendance_writer.writerow([
                        record.get("day_date", ""),
                        minutes,
                        record.get("status", ""),
                        record.get("note", "")
                    ])
                attendance_writer.writerow([])
                attendance_writer.writerow(["Total Minutes", total_minutes])
                attendance_writer.writerow(["Total Hours", round(total_minutes / 60, 2)])
                
                zf.writestr(f"{safe_name}/attendance.csv", attendance_csv.getvalue())
                attendance_csv.close()
                
                # 3. Evidence manifest CSV
                evidence_csv = io.StringIO()
                evidence_writer = csv.writer(evidence_csv)
                evidence_writer.writerow(["Evidence/Portfolio Items for", child_name])
                evidence_writer.writerow(["Date Range", f"{date_start_str} to {date_end_str}"])
                evidence_writer.writerow([])
                
                evidence_res = supabase.table("uploads").select(
                    "id, caption, storage_path, created_at, subject_id, mime, bytes"
                ).eq("child_id", child_id).gte("created_at", date_start_str).lte("created_at", date_end_str + "T23:59:59").order("created_at", desc=True).execute()
                
                evidence_writer.writerow(["Date", "Title", "Subject", "Type", "Size (bytes)", "File Path"])
                for evidence in (evidence_res.data or []):
                    subject_name = subjects_map.get(evidence.get("subject_id"), "Unassigned")
                    evidence_type = evidence.get("mime", "file").split("/")[0] if evidence.get("mime") else "file"
                    evidence_writer.writerow([
                        evidence.get("created_at", ""),
                        evidence.get("caption", "Untitled"),
                        subject_name,
                        evidence_type,
                        evidence.get("bytes", 0),
                        evidence.get("storage_path", "")
                    ])
                
                zf.writestr(f"{safe_name}/evidence_manifest.csv", evidence_csv.getvalue())
                evidence_csv.close()
                
                # 4. Summary text file
                summary_text = f"""Summary for {child_name}
Date Range: {date_start_str} to {date_end_str}

Credits Summary:
- Total Credits Earned: {total_credits}
- Number of Grades: {len(grades_res.data or [])}

Attendance Summary:
- Total Minutes: {total_minutes}
- Total Hours: {round(total_minutes / 60, 2)}
- Number of Log Entries: {len(attendance_res.data or [])}

Portfolio Summary:
- Number of Evidence Items: {len(evidence_res.data or [])}

Notes:
- This is a summary export for compliance documentation.
- Detailed records are available in the CSV files.
"""
                zf.writestr(f"{safe_name}/summary.txt", summary_text)
            
            # Root level files
            # 1. Compliance overview
            overview_text = f"""Compliance Packet Overview
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Date Range: {date_start_str} to {date_end_str}
Family ID: {payload.family_id}
Children Included: {len(children)}

This packet contains:
- Transcript/credits data for each child
- Attendance logs for each child
- Evidence/portfolio manifests for each child
- Summary files for each child

For state-specific requirements, see state_rules files (if available).
"""
            zf.writestr("compliance_overview.txt", overview_text)
            
            # 2. State rules placeholder (can be enhanced later)
            state_rules_text = """State Rules Summary
TODO: This section will be populated with state-specific compliance requirements.

To add state rules:
1. Configure your state in family settings
2. State-specific requirements will be listed here
"""
            zf.writestr("state_rules_PLACEHOLDER.txt", state_rules_text)
        
        buffer.seek(0)
        
        log_event("compliance_packet_generated", {
            "family_id": payload.family_id,
            "child_count": len(children),
            "date_start": date_start_str,
            "date_end": date_end_str,
            "user_id": user["id"]
        })
        
        return StreamingResponse(
            buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="compliance_packet_{date_start_str}_{date_end_str}.zip"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("compliance_packet.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate compliance packet: {str(e)}"
        )


# ============================================================
# Enhanced Transcript Routes
# ============================================================

class UpdateGradeInput(BaseModel):
    course_rigor_notes: Optional[str] = Field(None, description="Course rigor notes")
    syllabus_attachment_id: Optional[str] = Field(None, description="Syllabus attachment upload ID")
    gpa_type: Optional[str] = Field(None, description="'weighted' or 'unweighted'")
    weight_multiplier: Optional[float] = Field(None, description="Weight multiplier for weighted GPA")


class TranscriptSettingsInput(BaseModel):
    child_id: str = Field(..., description="Child ID")
    default_gpa_type: str = Field(default="unweighted", description="'weighted' or 'unweighted'")
    include_course_rigor: bool = Field(default=True)
    include_syllabi: bool = Field(default=True)


class YearEndSummaryInput(BaseModel):
    child_id: str = Field(..., description="Child ID")
    academic_year_start: str = Field(..., description="Start date (YYYY-MM-DD)")
    academic_year_end: str = Field(..., description="End date (YYYY-MM-DD)")
    summary_type: str = Field(default="full", description="'full', 'attendance_only', 'grades_only', 'portfolio_only'")


@router.put("/grades/{grade_id}")
async def update_grade(
    grade_id: str,
    body: UpdateGradeInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Update a grade with course rigor notes, syllabus attachment, and GPA settings"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify grade belongs to family
        grade_check = supabase.table("grades").select("id, family_id").eq("id", grade_id).single().execute()
        if not grade_check.data or grade_check.data["family_id"] != family_id:
            raise HTTPException(status_code=404, detail="Grade not found")

        update_data = {}
        if body.course_rigor_notes is not None:
            update_data["course_rigor_notes"] = body.course_rigor_notes
        if body.syllabus_attachment_id is not None:
            update_data["syllabus_attachment_id"] = body.syllabus_attachment_id
        if body.gpa_type is not None:
            if body.gpa_type not in ["weighted", "unweighted"]:
                raise HTTPException(status_code=400, detail="gpa_type must be 'weighted' or 'unweighted'")
            update_data["gpa_type"] = body.gpa_type
        if body.weight_multiplier is not None:
            update_data["weight_multiplier"] = body.weight_multiplier

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = supabase.table("grades").update(update_data).eq("id", grade_id).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update grade")

        log_event("grade_updated", grade_id=grade_id, family_id=family_id, updated_fields=list(update_data.keys()))
        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="update_grade")
        raise HTTPException(status_code=500, detail=f"Error updating grade: {str(e)}")


@router.post("/transcript_settings")
async def update_transcript_settings(
    body: TranscriptSettingsInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Update transcript settings for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(body.child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        if body.default_gpa_type not in ["weighted", "unweighted"]:
            raise HTTPException(status_code=400, detail="default_gpa_type must be 'weighted' or 'unweighted'")

        settings_data = {
            "family_id": family_id,
            "child_id": body.child_id,
            "default_gpa_type": body.default_gpa_type,
            "include_course_rigor": body.include_course_rigor,
            "include_syllabi": body.include_syllabi,
            "created_by": user["id"]
        }

        result = supabase.table("transcript_settings").upsert(
            settings_data,
            on_conflict="child_id"
        ).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update transcript settings")

        log_event("transcript_settings_updated", child_id=body.child_id, family_id=family_id)
        return result.data[0] if isinstance(result.data, list) else result.data

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="update_transcript_settings")
        raise HTTPException(status_code=500, detail=f"Error updating transcript settings: {str(e)}")


@router.get("/generate_transcript_enhanced")
async def generate_transcript_enhanced(
    child_id: str = Query(..., description="Child ID"),
    range_start: date = Query(..., description="Start date (YYYY-MM-DD)"),
    range_end: date = Query(..., description="End date (YYYY-MM-DD)"),
    gpa_type: str = Query(default="unweighted", description="'weighted' or 'unweighted'"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Generate enhanced transcript with weighted/unweighted GPA, course rigor notes, and syllabus attachments"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_check = supabase.table("children").select("id, first_name").eq("id", child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=404, detail="Child not found")

        child_name = child_check.data.get("first_name", "Student")

        # Get transcript settings
        settings_res = supabase.table("transcript_settings").select("*").eq("child_id", child_id).maybeSingle().execute()
        settings = settings_res.data if settings_res.data else {}
        
        # Use provided gpa_type or default from settings
        effective_gpa_type = gpa_type if gpa_type in ["weighted", "unweighted"] else settings.get("default_gpa_type", "unweighted")
        include_rigor = settings.get("include_course_rigor", True)
        include_syllabi = settings.get("include_syllabi", True)

        # Query grades with enhanced fields
        grades_result = supabase.table("grades").select(
            "term_label, subject_id, grade, score, credits, rubric, notes, course_rigor_notes, syllabus_attachment_id, gpa_type, weight_multiplier, created_at"
        ).eq("child_id", child_id).order("created_at").execute()

        # Get subject names
        subject_ids = [g.get("subject_id") for g in grades_result.data if g.get("subject_id")]
        subjects_map = {}
        if subject_ids:
            subjects_result = supabase.table("subject").select("id, name").in_("id", subject_ids).execute()
            subjects_map = {s["id"]: s["name"] for s in subjects_result.data}

        # Calculate GPA using database function
        gpa_result = supabase.rpc("calculate_gpa", {
            "p_child_id": child_id,
            "p_start_date": str(range_start),
            "p_end_date": str(range_end),
            "p_gpa_type": effective_gpa_type
        }).execute()

        calculated_gpa = gpa_result.data if gpa_result.data else None

        # Build CSV
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(["Enhanced Transcript"])
        writer.writerow([f"Student: {child_name}"])
        writer.writerow([f"Date Range: {range_start} to {range_end}"])
        writer.writerow([f"GPA Type: {effective_gpa_type.upper()}"])
        if calculated_gpa:
            writer.writerow([f"Calculated GPA: {calculated_gpa}"])
        writer.writerow([])

        # Grades with enhanced fields
        writer.writerow(["GRADES"])
        headers = ["Term", "Subject", "Grade", "Score", "Credits"]
        if include_rigor:
            headers.append("Course Rigor Notes")
        if include_syllabi:
            headers.append("Syllabus Attached")
        headers.extend(["GPA Type", "Weight Multiplier", "Notes", "Date"])
        writer.writerow(headers)

        for grade in grades_result.data:
            subject_name = subjects_map.get(grade.get("subject_id"), "")
            row = [
                grade.get("term_label", ""),
                subject_name,
                grade.get("grade", ""),
                grade.get("score", ""),
                grade.get("credits", 0),
            ]
            if include_rigor:
                row.append(grade.get("course_rigor_notes", ""))
            if include_syllabi:
                syllabus_id = grade.get("syllabus_attachment_id")
                row.append("Yes" if syllabus_id else "No")
            row.extend([
                grade.get("gpa_type", "unweighted"),
                grade.get("weight_multiplier", 1.0),
                grade.get("notes", ""),
                grade.get("created_at", "")
            ])
            writer.writerow(row)

        csv_content = output.getvalue()
        output.close()

        return StreamingResponse(
            io.BytesIO(csv_content.encode("utf-8")),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="transcript_enhanced_{child_name}_{range_start}_{range_end}.csv"'
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="generate_transcript_enhanced")
        raise HTTPException(status_code=500, detail=f"Error generating enhanced transcript: {str(e)}")


@router.post("/year_end_summary")
async def generate_year_end_summary(
    body: YearEndSummaryInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Generate year-end summary PDF"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_check = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=404, detail="Child not found")

        child_name = child_check.data.get("first_name", "Student")

        # This is a placeholder - full PDF generation would require reportlab
        # For now, return a simple message
        return {
            "message": "Year-end summary generation coming soon",
            "child_id": body.child_id,
            "academic_year_start": body.academic_year_start,
            "academic_year_end": body.academic_year_end,
            "summary_type": body.summary_type
        }

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="year_end_summary")
        raise HTTPException(status_code=500, detail=f"Error generating year-end summary: {str(e)}")

