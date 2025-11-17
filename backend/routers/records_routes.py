"""
FastAPI routes for Records, Credits & Compliance (Phase 4)
Handles grades, transcripts, portfolio uploads, and state requirements
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
import sys
import csv
import io
from pathlib import Path
import json

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user
from logger import log_event
from supabase_client import get_admin_client

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


@router.post("/add_grade", response_model=AddGradeOut)
async def add_grade(
    input: AddGradeInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Add a grade record for a child"""
    try:
        family_id = await get_family_id_for_user(user["id"])
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
        log_event("error", {"error": str(e), "endpoint": "add_grade"})
        raise HTTPException(status_code=500, detail=f"Error adding grade: {str(e)}")


@router.post("/add_portfolio_upload", response_model=AddPortfolioUploadOut)
async def add_portfolio_upload(
    input: AddPortfolioUploadInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Add a portfolio upload metadata record"""
    try:
        family_id = await get_family_id_for_user(user["id"])
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
        log_event("error", {"error": str(e), "endpoint": "add_portfolio_upload"})
        raise HTTPException(status_code=500, detail=f"Error adding portfolio upload: {str(e)}")


@router.get("/state_requirements", response_model=List[StateRequirement])
async def get_state_requirements(
    state_code: str = Query(..., description="State code (e.g. 'CA', 'NY')"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get state requirements for compliance"""
    try:
        # Load state requirements from JSON file
        data_file = Path(__file__).parent.parent / "data" / "state_requirements.json"
        
        if not data_file.exists():
            # Return default requirements if file doesn't exist
            return [
                StateRequirement(
                    id="hours",
                    label="Minimum hours per year",
                    detail="900 hours",
                    type="info"
                ),
                StateRequirement(
                    id="attendance",
                    label="Attendance tracking",
                    type="required"
                )
            ]

        with open(data_file, "r") as f:
            all_requirements = json.load(f)

        # Get requirements for the specified state
        state_requirements = all_requirements.get(state_code.upper(), [])

        return [StateRequirement(**req) for req in state_requirements]

    except Exception as e:
        log_event("error", {"error": str(e), "endpoint": "state_requirements"})
        raise HTTPException(status_code=500, detail=f"Error loading state requirements: {str(e)}")


@router.get("/last_transcript")
async def get_last_transcript(
    child_id: str = Query(..., description="Child ID"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get the last transcript export for a child"""
    try:
        family_id = await get_family_id_for_user(user["id"])
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
        log_event("error", {"error": str(e), "endpoint": "last_transcript"})
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
        family_id = await get_family_id_for_user(user["id"])
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
        log_event("error", {"error": str(e), "endpoint": "generate_transcript"})
        raise HTTPException(status_code=500, detail=f"Error generating transcript: {str(e)}")

