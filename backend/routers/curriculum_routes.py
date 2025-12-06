"""
FastAPI routes for Curriculum AI Wizard
Handles pacing generation, unit summaries, and evidence linking
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from helpers import get_family_id_for_user
from auth import get_current_user, rate_limiter
from supabase_client import get_admin_client

# Import log_event from logger if available, otherwise define a simple version
try:
    from logger import log_event
except ImportError:
    def log_event(event_name, **kwargs):
        """Simple log event function if logger.log_event not available"""
        print(f"[EVENT] {event_name}: {kwargs}")

router = APIRouter(prefix="/api/curriculum", tags=["curriculum"])

class GeneratePacingBody(BaseModel):
    syllabus_id: str
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    family_id: Optional[str] = None
    child_id: Optional[str] = None

class UnitSummaryBody(BaseModel):
    section_id: str
    family_id: Optional[str] = None

@router.post("/generate-pacing")
async def generate_pacing(
    body: GeneratePacingBody,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Generate pacing recommendations for syllabus units"""
    try:
        supabase = get_admin_client()
        family_id = body.family_id or get_family_id_for_user(user["id"])
        
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Get syllabus with sections
        syllabus_res = supabase.table("syllabi").select("*").eq("id", body.syllabus_id).eq("family_id", family_id).single().execute()
        if not syllabus_res.data:
            raise HTTPException(status_code=404, detail="Syllabus not found")
        
        syllabus = syllabus_res.data
        
        # Get all unit sections (section_type = 'unit')
        sections_res = supabase.table("syllabus_sections").select("*").eq("syllabus_id", body.syllabus_id).eq("section_type", "unit").order("position", desc=False).execute()
        
        if not sections_res.data:
            return {
                "success": True,
                "units": [],
                "message": "No units found in syllabus"
            }
        
        units = sections_res.data
        
        # Parse dates
        start_date = datetime.strptime(body.start_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(body.end_date, "%Y-%m-%d").date()
        total_days = (end_date - start_date).days + 1
        
        if total_days <= 0:
            raise HTTPException(status_code=400, detail="End date must be after start date")
        
        # Calculate total estimated minutes
        total_minutes = sum(unit.get("estimated_minutes", 0) or 0 for unit in units)
        
        # Calculate pacing
        pacing_units = []
        current_date = start_date
        minutes_per_day = total_minutes / total_days if total_days > 0 else 0
        
        for idx, unit in enumerate(units):
            unit_minutes = unit.get("estimated_minutes", 0) or 0
            unit_days = max(1, int(unit_minutes / minutes_per_day)) if minutes_per_day > 0 else 1
            
            unit_start = current_date
            unit_end = min(current_date + timedelta(days=unit_days - 1), end_date)
            
            # Calculate weekly hours for this unit
            weeks_for_unit = max(1, unit_days / 7)
            weekly_hours = (unit_minutes / 60) / weeks_for_unit if weeks_for_unit > 0 else 0
            
            pacing_units.append({
                "unit_id": unit["id"],
                "unit_title": unit.get("heading", f"Unit {idx + 1}"),
                "suggested_start_date": unit_start.isoformat(),
                "suggested_end_date": unit_end.isoformat(),
                "estimated_minutes": unit_minutes,
                "estimated_days": unit_days,
                "weekly_hours": round(weekly_hours, 1)
            })
            
            # Update suggested dates in database
            supabase.table("syllabus_sections").update({
                "suggested_due_ts": unit_end.isoformat()
            }).eq("id", unit["id"]).execute()
            
            current_date = unit_end + timedelta(days=1)
            if current_date > end_date:
                break
        
        log_event("curriculum_pacing_generated", {
            "syllabus_id": body.syllabus_id,
            "family_id": family_id,
            "units_count": len(pacing_units),
            "start_date": body.start_date,
            "end_date": body.end_date
        })
        
        return {
            "success": True,
            "units": pacing_units,
            "total_minutes": total_minutes,
            "total_days": total_days,
            "average_minutes_per_day": round(minutes_per_day, 1)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum_pacing_error", error=str(e), syllabus_id=body.syllabus_id)
        raise HTTPException(status_code=500, detail=f"Failed to generate pacing: {str(e)}")

@router.post("/unit-summary")
async def generate_unit_summary(
    body: UnitSummaryBody,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Generate completion summary for a syllabus unit"""
    try:
        supabase = get_admin_client()
        family_id = body.family_id or get_family_id_for_user(user["id"])
        
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Get section/unit details
        section_res = supabase.table("syllabus_sections").select("*").eq("id", body.section_id).single().execute()
        if not section_res.data:
            raise HTTPException(status_code=404, detail="Section not found")
        
        section = section_res.data
        syllabus_id = section.get("syllabus_id")
        
        # Verify syllabus belongs to family
        syllabus_res = supabase.table("syllabi").select("*").eq("id", syllabus_id).eq("family_id", family_id).single().execute()
        if not syllabus_res.data:
            raise HTTPException(status_code=403, detail="Syllabus not found or access denied")
        
        syllabus = syllabus_res.data
        child_id = syllabus.get("child_id")
        
        # Get skills for this unit
        skills_res = supabase.table("syllabus_skills").select("*").eq("section_id", body.section_id).execute()
        skills = skills_res.data or []
        
        # Get linked evidence (uploads with metadata containing this section_id)
        # Note: This assumes evidence is linked via metadata JSONB field
        uploads_res = supabase.table("uploads").select("*").eq("family_id", family_id).execute()
        linked_evidence = []
        
        for upload in (uploads_res.data or []):
            metadata = upload.get("metadata") or {}
            if isinstance(metadata, dict) and metadata.get("syllabus_section_id") == body.section_id:
                linked_evidence.append({
                    "id": upload["id"],
                    "title": upload.get("title") or upload.get("caption") or "Untitled",
                    "created_at": upload.get("created_at"),
                    "mime": upload.get("mime")
                })
        
        # Get related events (if syllabus has events linked)
        events_res = supabase.table("events").select("*").eq("family_id", family_id).eq("child_id", child_id).eq("subject_id", syllabus.get("subject_id")).execute()
        related_events = []
        
        for event in (events_res.data or []):
            # Check if event description or title mentions this unit
            event_title = (event.get("title") or "").lower()
            event_desc = (event.get("description") or "").lower()
            unit_title = (section.get("heading") or "").lower()
            
            if unit_title and (unit_title in event_title or unit_title in event_desc):
                related_events.append({
                    "id": event["id"],
                    "title": event.get("title"),
                    "start_ts": event.get("start_ts"),
                    "status": event.get("status")
                })
        
        # Calculate completion metrics
        total_skills = len(skills)
        total_lessons = 0
        
        # Count lessons in this unit
        if section.get("section_type") == "unit":
            lessons_res = supabase.table("syllabus_sections").select("*").eq("syllabus_id", syllabus_id).eq("section_type", "lesson").gt("position", section.get("position", 0)).execute()
            # Find next unit to determine lesson count
            next_unit_res = supabase.table("syllabus_sections").select("position").eq("syllabus_id", syllabus_id).eq("section_type", "unit").gt("position", section.get("position", 0)).order("position", desc=False).limit(1).execute()
            next_unit_pos = next_unit_res.data[0]["position"] if next_unit_res.data else None
            
            if next_unit_pos:
                lessons = [l for l in (lessons_res.data or []) if l.get("position", 0) < next_unit_pos]
            else:
                lessons = lessons_res.data or []
            total_lessons = len(lessons)
        
        # Generate summary text
        summary_parts = [
            f"Unit: {section.get('heading', 'Untitled Unit')}",
            f"Skills: {total_skills}",
            f"Lessons: {total_lessons}",
            f"Evidence: {len(linked_evidence)} items",
            f"Related Events: {len(related_events)}"
        ]
        
        summary_text = "\n".join(summary_parts)
        
        log_event("curriculum_unit_summary_generated", {
            "section_id": body.section_id,
            "syllabus_id": syllabus_id,
            "family_id": family_id,
            "skills_count": total_skills,
            "evidence_count": len(linked_evidence)
        })
        
        return {
            "success": True,
            "section_id": body.section_id,
            "unit_title": section.get("heading", "Untitled Unit"),
            "summary": summary_text,
            "skills": skills,
            "skills_count": total_skills,
            "lessons_count": total_lessons,
            "evidence_count": len(linked_evidence),
            "evidence": linked_evidence,
            "events_count": len(related_events),
            "events": related_events,
            "estimated_minutes": section.get("estimated_minutes", 0),
            "suggested_due_date": section.get("suggested_due_ts")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("curriculum_unit_summary_error", error=str(e), section_id=body.section_id)
        raise HTTPException(status_code=500, detail=f"Failed to generate unit summary: {str(e)}")

