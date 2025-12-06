"""
FastAPI routes for Planner features
Phase 5: Everyday Fluidity + Motion-AI
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
import sys
from pathlib import Path
import io

# Optional PDF generation support (requires reportlab)
try:
    from reportlab.lib import colors as reportlab_colors
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/planner", tags=["planner"])
events_router = APIRouter(prefix="/api/events", tags=["events"])


# --- Pydantic Models ---

class RescheduleEventInput(BaseModel):
    new_start_at: str = Field(..., description="New start timestamp (ISO 8601)")
    new_end_at: str = Field(..., description="New end timestamp (ISO 8601)")
    origin: Optional[str] = Field(None, description="Reschedule origin (e.g., 'drag_drop', 'shift_week')")
    reason: Optional[str] = Field(None, description="Human-readable reason for reschedule")


class ShiftWeekInput(BaseModel):
    week_start: str = Field(..., description="Week start date (YYYY-MM-DD)")


class FreezeWeekInput(BaseModel):
    week_start: str = Field(..., description="Week start date (YYYY-MM-DD)")
    frozen: bool = Field(..., description="Whether to freeze (true) or unfreeze (false) the week")


class UpdateEventStatusInput(BaseModel):
    status: str = Field(..., description="New status: 'scheduled', 'in_progress', or 'done'")


class AutoScheduleCourseInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    course_id: str = Field(..., description="Course/Syllabus ID")
    child_ids: Optional[List[str]] = Field(None, description="Child IDs to schedule for (if None, uses course's children)")
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")
    strategy: str = Field("even", description="Strategy: 'even' (evenly distribute) or 'use_target_dates'")


# --- Helper Functions ---

async def verify_event_family_access(event_id: str, family_id: str) -> dict:
    """Verify event belongs to family and return event data"""
    supabase = get_admin_client()
    event_res = supabase.table("events").select("*").eq("id", event_id).single().execute()
    
    if not event_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    event = event_res.data
    if event.get("family_id") != family_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Event does not belong to your family"
        )
    
    return event


# --- Routes ---

@events_router.patch("/{event_id}/reschedule")
async def reschedule_event(
    event_id: str,
    body: RescheduleEventInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Reschedule an event to new start/end times.
    Updates reschedule_origin and reschedule_reason, then refreshes calendar cache.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        # Verify event belongs to family
        event = await verify_event_family_access(event_id, family_id)
        
        # Parse new timestamps
        try:
            new_start_dt = datetime.fromisoformat(body.new_start_at.replace("Z", "+00:00"))
            new_end_dt = datetime.fromisoformat(body.new_end_at.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid timestamp format: {str(e)}"
            )
        
        # Validate end is after start
        if new_end_dt <= new_start_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End time must be after start time"
            )
        
        supabase = get_admin_client()
        
        # Update event
        update_data = {
            "start_ts": new_start_dt.isoformat(),
            "end_ts": new_end_dt.isoformat(),
            "reschedule_origin": body.origin or "manual",
            "reschedule_reason": body.reason or f"Rescheduled to {new_start_dt.date()}"
        }
        
        update_res = supabase.table("events").update(update_data).eq("id", event_id).execute()
        
        if not update_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update event"
            )
        
        updated_event = update_res.data[0]
        
        # Refresh calendar cache for affected days (old date and new date)
        old_date = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00")).date()
        new_date = new_start_dt.date()
        
        # Refresh cache for both dates (in case event moved to different day)
        cache_start = min(old_date, new_date)
        cache_end = max(old_date, new_date) + timedelta(days=1)  # Include next day for safety
        
        try:
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(cache_start),
                    "p_to_date": str(cache_end)
                }
            ).execute()
        except Exception as cache_error:
            # Log but don't fail - cache refresh is best effort
            log_event("reschedule_event.cache_refresh_error", event_id=event_id, error=str(cache_error))
        
        log_event("event_rescheduled", event_id=event_id, family_id=family_id, origin=body.origin or "manual", old_start=event["start_ts"], new_start=new_start_dt.isoformat())
        
        return updated_event
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("reschedule_event.error", event_id=event_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error rescheduling event: {str(e)}")


@events_router.patch("/{event_id}/status")
async def update_event_status(
    event_id: str,
    body: UpdateEventStatusInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Update event status (for undoing completion or changing status).
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        # Validate status
        valid_statuses = ['scheduled', 'in_progress', 'done']
        if body.status not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
            )

        # Verify event belongs to family
        event = await verify_event_family_access(event_id, family_id)
        
        supabase = get_admin_client()
        
        # Update event status
        update_res = supabase.table("events").update({
            "status": body.status
        }).eq("id", event_id).execute()
        
        if not update_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update event status"
            )
        
        updated_event = update_res.data[0]
        
        # Refresh calendar cache for affected date
        try:
            start_ts = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00"))
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(start_ts.date()),
                    "p_to_date": str(start_ts.date())
                }
            ).execute()
        except Exception as e:
            log_event("update_event_status.cache_refresh_error", event_id=event_id, error=str(e))
        
        log_event("event_status_updated", event_id=event_id, family_id=family_id, old_status=event.get("status"), new_status=body.status)
        
        return {
            "event": updated_event,
            "message": f"Event status updated to {body.status}"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("update_event_status.error", event_id=event_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error updating event status: {str(e)}")


@router.post("/shift_week")
async def shift_week(
    body: ShiftWeekInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Shift all events in a week forward by 7 days.
    Uses the shift_week_forward RPC function.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Parse week_start date
        try:
            week_start_date = date.fromisoformat(body.week_start)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD"
            )
        
        supabase = get_admin_client()
        
        # Call shift_week_forward RPC
        result = supabase.rpc(
            "shift_week_forward",
            {
                "p_family_id": family_id,
                "p_week_start": str(week_start_date)
            }
        ).execute()
        
        shifted_count = result.data if result.data is not None else 0
        
        log_event("week_shifted", family_id=family_id, week_start=body.week_start, shifted_count=shifted_count)
        
        return {
            "success": True,
            "shifted_count": shifted_count,
            "week_start": body.week_start
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("shift_week.error", week_start=body.week_start, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error shifting week: {str(e)}")


@router.post("/freeze_week")
async def freeze_week(
    body: FreezeWeekInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Freeze or unfreeze a week by setting is_frozen flag on calendar_days_cache.
    Frozen weeks prevent AI from proposing changes.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Parse week_start date
        try:
            week_start_date = date.fromisoformat(body.week_start)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD"
            )
        
        # Calculate week end (7 days after start)
        week_end_date = week_start_date + timedelta(days=7)
        
        supabase = get_admin_client()
        
        # Update is_frozen for all days in that week for this family
        update_res = supabase.table("calendar_days_cache").update({
            "is_frozen": body.frozen
        }).eq("family_id", family_id).gte("date", str(week_start_date)).lt("date", str(week_end_date)).execute()
        
        affected_count = len(update_res.data) if update_res.data else 0
        
        log_event("week_frozen" if body.frozen else "week_unfrozen", family_id=family_id, week_start=body.week_start, affected_days=affected_count)
        
        return {
            "success": True,
            "frozen": body.frozen,
            "week_start": body.week_start,
            "affected_days": affected_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("freeze_week.error", week_start=body.week_start, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error freezing week: {str(e)}")


@router.post("/auto_schedule_course")
async def auto_schedule_course(
    body: AutoScheduleCourseInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Auto-generate planner events from a course/syllabus.
    Creates events for all units (or remaining units) evenly distributed over date range
    or using target_date per unit.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
        supabase = get_admin_client()
        
        # Get course/syllabus details
        syllabus_res = supabase.table("syllabi").select("*").eq("id", body.course_id).eq("family_id", family_id).single().execute()
        if not syllabus_res.data:
            raise HTTPException(status_code=404, detail="Course not found")
        
        syllabus = syllabus_res.data
        
        # Get units (sections)
        sections_res = supabase.table("syllabus_sections").select("*").eq("syllabus_id", body.course_id).order("position", desc=False).execute()
        sections = sections_res.data or []
        
        if not sections:
            return {
                "created_events_count": 0,
                "units_scheduled": 0,
                "conflicts": []
            }
        
        # Determine child IDs
        child_ids = body.child_ids or [syllabus.get("child_id")]
        if not child_ids:
            raise HTTPException(status_code=400, detail="No children specified")
        
        # Verify children belong to family
        for child_id in child_ids:
            child_res = supabase.table("children").select("id").eq("id", child_id).eq("family_id", family_id).single().execute()
            if not child_res.data:
                raise HTTPException(status_code=403, detail=f"Child {child_id} not found")
        
        # Parse dates
        try:
            start_date = date.fromisoformat(body.start_date)
            end_date = date.fromisoformat(body.end_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        if end_date <= start_date:
            raise HTTPException(status_code=400, detail="End date must be after start date")
        
        # Calculate date distribution
        total_days = (end_date - start_date).days + 1
        units_per_child = len(sections) * len(child_ids)
        
        created_events = []
        conflicts = []
        
        if body.strategy == "use_target_dates":
            # Use target_date from each section if available
            for section in sections:
                target_date_str = section.get("target_date")
                if target_date_str:
                    try:
                        target_date = date.fromisoformat(target_date_str)
                        if start_date <= target_date <= end_date:
                            for child_id in child_ids:
                                # Create event at target date
                                start_ts = datetime.combine(target_date, datetime.min.time()).isoformat()
                                end_ts = (datetime.combine(target_date, datetime.min.time()) + timedelta(minutes=section.get("expected_minutes", 60))).isoformat()
                                
                                event_data = {
                                    "family_id": family_id,
                                    "child_id": child_id,
                                    "subject_id": syllabus.get("subject_id"),
                                    "title": section.get("title", f"Unit {section.get('position', '?')}"),
                                    "start_ts": start_ts,
                                    "end_ts": end_ts,
                                    "status": "scheduled",
                                    "source": "syllabus",
                                    "source_section_id": section.get("id"),
                                }
                                
                                event_res = supabase.table("events").insert(event_data).execute()
                                if event_res.data:
                                    created_events.append(event_res.data[0])
                        else:
                            conflicts.append(f"Unit '{section.get('title')}' target date {target_date_str} outside range")
                    except ValueError:
                        conflicts.append(f"Unit '{section.get('title')}' has invalid target_date")
                else:
                    # No target_date, skip or use even distribution
                    conflicts.append(f"Unit '{section.get('title')}' has no target_date")
        else:
            # Even distribution strategy
            days_per_unit = max(1, total_days // len(sections)) if sections else 1
            
            for idx, section in enumerate(sections):
                # Calculate date for this unit
                unit_date = start_date + timedelta(days=idx * days_per_unit)
                if unit_date > end_date:
                    unit_date = end_date
                
                for child_id in child_ids:
                    start_ts = datetime.combine(unit_date, datetime.min.time()).isoformat()
                    end_ts = (datetime.combine(unit_date, datetime.min.time()) + timedelta(minutes=section.get("expected_minutes", 60))).isoformat()
                    
                    event_data = {
                        "family_id": family_id,
                        "child_id": child_id,
                        "subject_id": syllabus.get("subject_id"),
                        "title": section.get("title", f"Unit {section.get('position', '?')}"),
                        "start_ts": start_ts,
                        "end_ts": end_ts,
                        "status": "scheduled",
                        "source": "syllabus",
                        "source_section_id": section.get("id"),
                    }
                    
                    event_res = supabase.table("events").insert(event_data).execute()
                    if event_res.data:
                        created_events.append(event_res.data[0])
        
        # Refresh calendar cache
        try:
            supabase.rpc(
                "refresh_calendar_days_cache",
                {
                    "p_family_id": family_id,
                    "p_from_date": str(start_date),
                    "p_to_date": str(end_date + timedelta(days=1))
                }
            ).execute()
        except Exception as cache_error:
            log_event("auto_schedule_course.cache_refresh_error", error=str(cache_error))
        
        log_event("auto_schedule_course.completed", course_id=body.course_id, family_id=family_id, created_count=len(created_events), strategy=body.strategy)
        
        return {
            "created_events_count": len(created_events),
            "units_scheduled": len(sections),
            "conflicts": conflicts
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("auto_schedule_course.error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error auto-scheduling course: {str(e)}")


# --- Weekly Student Packet ---

def generate_weekly_packet_pdf(
    child_name: str,
    week_start: date,
    week_end: date,
    events: List[Dict[str, Any]],
    backlog_items: List[Dict[str, Any]],
    subjects_map: Dict[str, str]
) -> io.BytesIO:
    """Generate print-friendly weekly student packet PDF"""
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="PDF generation requires reportlab library. Please install it with: pip install reportlab"
        )
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=20,
    )
    story.append(Paragraph("Weekly Student Packet", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Week:</b> {week_start.strftime('%B %d')} - {week_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Group events by day
    events_by_day: Dict[str, List[Dict[str, Any]]] = {}
    for event in events:
        event_date = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00")).date()
        date_str = event_date.strftime("%Y-%m-%d")
        day_name = event_date.strftime("%A, %B %d")
        
        if day_name not in events_by_day:
            events_by_day[day_name] = []
        events_by_day[day_name].append(event)
    
    # Daily Schedule Section
    if events_by_day:
        story.append(Paragraph("<b>Daily Schedule</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))
        
        for day_name in sorted(events_by_day.keys()):
            day_events = events_by_day[day_name]
            story.append(Paragraph(f"<b>{day_name}</b>", styles['Heading3']))
            
            # Create table for day's events
            day_data = [["Time", "Subject", "Activity", "Status"]]
            for event in sorted(day_events, key=lambda e: e.get("start_ts", "")):
                start_ts = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00"))
                end_ts = datetime.fromisoformat(event.get("end_ts", "").replace("Z", "+00:00"))
                time_str = f"{start_ts.strftime('%I:%M %p')} - {end_ts.strftime('%I:%M %p')}"
                
                subject_name = subjects_map.get(event.get("subject_id", ""), "General")
                title = event.get("title", "Activity")[:40]
                status = event.get("status", "scheduled")
                
                day_data.append([
                    time_str,
                    subject_name[:20],
                    title,
                    status.capitalize()
                ])
            
            day_table = Table(day_data, colWidths=[1.5*inch, 1.2*inch, 2.8*inch, 1*inch])
            day_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), reportlab_colors.white),
                ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [reportlab_colors.white, reportlab_colors.HexColor('#f9fafb')]),
            ]))
            story.append(day_table)
            story.append(Spacer(1, 0.2*inch))
        
        story.append(PageBreak())
    
    # Assignments/Tasks Section
    if backlog_items:
        story.append(Paragraph("<b>Assignments & Tasks</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))
        
        task_data = [["Task", "Subject", "Due Date", "Est. Time", "Priority"]]
        for item in backlog_items:
            title = item.get("title", "Task")[:50]
            subject_name = subjects_map.get(item.get("subject_id", ""), "General")
            due_date = item.get("due_date", "")
            if due_date:
                try:
                    due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                    due_date = due_dt.strftime("%m/%d")
                except:
                    pass
            else:
                due_date = "No due date"
            
            est_minutes = item.get("estimate_minutes", 0) or 0
            est_time = f"{est_minutes} min" if est_minutes > 0 else "—"
            priority = item.get("priority", "normal").capitalize()
            
            task_data.append([
                title,
                subject_name[:20],
                due_date,
                est_time,
                priority
            ])
        
        task_table = Table(task_data, colWidths=[2.5*inch, 1.2*inch, 1*inch, 1*inch, 1*inch])
        task_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#10b981')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), reportlab_colors.white),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [reportlab_colors.white, reportlab_colors.HexColor('#f0fdf4')]),
        ]))
        story.append(task_table)
        story.append(Spacer(1, 0.3*inch))
    
    # Notes Section
    story.append(Paragraph("<b>Notes</b>", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_________________________________________________________________", styles['Normal']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_________________________________________________________________", styles['Normal']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_________________________________________________________________", styles['Normal']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_________________________________________________________________", styles['Normal']))
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_weekly_packet_html(
    child_name: str,
    week_start: date,
    week_end: date,
    events: List[Dict[str, Any]],
    backlog_items: List[Dict[str, Any]],
    subjects_map: Dict[str, str],
    materials: List[Dict[str, Any]] = None,
    progress_summary: Dict[str, Any] = None
) -> str:
    """Generate HTML version of weekly packet for direct browser printing"""
    materials = materials or []
    progress_summary = progress_summary or {}
    
    # Group events by day
    events_by_day: Dict[str, List[Dict[str, Any]]] = {}
    for event in events:
        event_date = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00")).date()
        day_name = event_date.strftime("%A, %B %d")
        if day_name not in events_by_day:
            events_by_day[day_name] = []
        events_by_day[day_name].append(event)
    
    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Weekly Packet - {child_name}</title>
    <style>
        @media print {{
            @page {{
                margin: 0.5in;
            }}
            body {{
                margin: 0;
            }}
            .no-print {{
                display: none;
            }}
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 20px;
            color: #111827;
        }}
        .header {{
            border-bottom: 3px solid #1e40af;
            padding-bottom: 16px;
            margin-bottom: 24px;
        }}
        h1 {{
            color: #1e40af;
            margin: 0 0 8px 0;
            font-size: 24px;
        }}
        .header-info {{
            color: #6b7280;
            font-size: 14px;
        }}
        h2 {{
            color: #374151;
            font-size: 18px;
            margin-top: 24px;
            margin-bottom: 12px;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 6px;
        }}
        h3 {{
            color: #4b5563;
            font-size: 16px;
            margin-top: 16px;
            margin-bottom: 8px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
        }}
        th {{
            background: #3b82f6;
            color: white;
            padding: 10px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
        }}
        td {{
            padding: 8px 10px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
        }}
        tr:nth-child(even) {{
            background: #f9fafb;
        }}
        .task-table th {{
            background: #10b981;
        }}
        .materials-table th {{
            background: #f59e0b;
        }}
        .progress-summary {{
            background: #eff6ff;
            border: 1px solid #3b82f6;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
        }}
        .progress-item {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }}
        .progress-bar {{
            height: 8px;
            background: #dbeafe;
            border-radius: 4px;
            margin-top: 4px;
            overflow: hidden;
        }}
        .progress-fill {{
            height: 100%;
            background: #3b82f6;
            transition: width 0.3s;
        }}
        .notes-section {{
            margin-top: 32px;
            page-break-inside: avoid;
        }}
        .notes-line {{
            border-bottom: 1px solid #d1d5db;
            margin-bottom: 12px;
            min-height: 20px;
        }}
        .print-button {{
            position: fixed;
            top: 20px;
            right: 20px;
            background: #3b82f6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }}
        .print-button:hover {{
            background: #2563eb;
        }}
    </style>
</head>
<body>
    <button class="print-button no-print" onclick="window.print()">Print</button>
    
    <div class="header">
        <h1>Weekly Student Packet</h1>
        <div class="header-info">
            <strong>Student:</strong> {child_name}<br>
            <strong>Week:</strong> {week_start.strftime('%B %d')} - {week_end.strftime('%B %d, %Y')}
        </div>
    </div>
"""
    
    # Progress Summary
    if progress_summary:
        html += """
    <div class="progress-summary">
        <h2>Progress Summary</h2>
"""
        if progress_summary.get("events_completed"):
            total = progress_summary.get("events_total", 0)
            completed = progress_summary.get("events_completed", 0)
            percent = (completed / total * 100) if total > 0 else 0
            html += f"""
        <div class="progress-item">
            <span><strong>Events Completed:</strong> {completed} of {total}</span>
            <span>{percent:.0f}%</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: {percent}%"></div>
        </div>
"""
        if progress_summary.get("tasks_completed"):
            total = progress_summary.get("tasks_total", 0)
            completed = progress_summary.get("tasks_completed", 0)
            percent = (completed / total * 100) if total > 0 else 0
            html += f"""
        <div class="progress-item">
            <span><strong>Tasks Completed:</strong> {completed} of {total}</span>
            <span>{percent:.0f}%</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: {percent}%"></div>
        </div>
"""
        html += """
    </div>
"""
    
    # Daily Schedule
    if events_by_day:
        html += """
    <h2>Daily Schedule</h2>
"""
        for day_name in sorted(events_by_day.keys()):
            day_events = events_by_day[day_name]
            html += f"""
    <h3>{day_name}</h3>
    <table>
        <thead>
            <tr>
                <th>Time</th>
                <th>Subject</th>
                <th>Activity</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
"""
            for event in sorted(day_events, key=lambda e: e.get("start_ts", "")):
                start_ts = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00"))
                end_ts = datetime.fromisoformat(event.get("end_ts", "").replace("Z", "+00:00"))
                time_str = f"{start_ts.strftime('%I:%M %p')} - {end_ts.strftime('%I:%M %p')}"
                subject_name = subjects_map.get(event.get("subject_id", ""), "General")
                title = event.get("title", "Activity")
                status = event.get("status", "scheduled").capitalize()
                html += f"""
            <tr>
                <td>{time_str}</td>
                <td>{subject_name}</td>
                <td>{title}</td>
                <td>{status}</td>
            </tr>
"""
            html += """
        </tbody>
    </table>
"""
    
    # Assignments/Tasks
    if backlog_items:
        html += """
    <h2>Assignments & Tasks</h2>
    <table class="task-table">
        <thead>
            <tr>
                <th>Task</th>
                <th>Subject</th>
                <th>Due Date</th>
                <th>Est. Time</th>
                <th>Priority</th>
            </tr>
        </thead>
        <tbody>
"""
        for item in backlog_items:
            title = item.get("title", "Task")
            subject_name = subjects_map.get(item.get("subject_id", ""), "General")
            due_date = item.get("due_date", "")
            if due_date:
                try:
                    due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                    due_date = due_dt.strftime("%m/%d")
                except:
                    pass
            else:
                due_date = "No due date"
            est_minutes = item.get("estimate_minutes", 0) or 0
            est_time = f"{est_minutes} min" if est_minutes > 0 else "—"
            priority = item.get("priority", "normal").capitalize()
            html += f"""
            <tr>
                <td>{title}</td>
                <td>{subject_name}</td>
                <td>{due_date}</td>
                <td>{est_time}</td>
                <td>{priority}</td>
            </tr>
"""
        html += """
        </tbody>
    </table>
"""
    
    # Materials/Resources
    if materials:
        html += """
    <h2>Materials & Resources</h2>
    <table class="materials-table">
        <thead>
            <tr>
                <th>Material</th>
                <th>Type</th>
                <th>Date Added</th>
            </tr>
        </thead>
        <tbody>
"""
        for material in materials:
            title = material.get("title", "Untitled")
            mime = material.get("mime", "")
            mime_type = mime.split("/")[0] if "/" in mime else "file"
            created_at = material.get("created_at", "")
            if created_at:
                try:
                    created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    created_at = created_dt.strftime("%m/%d/%Y")
                except:
                    pass
            html += f"""
            <tr>
                <td>{title}</td>
                <td>{mime_type.capitalize()}</td>
                <td>{created_at}</td>
            </tr>
"""
        html += """
        </tbody>
    </table>
"""
    
    # Notes Section
    html += """
    <div class="notes-section">
        <h2>Notes</h2>
        <div class="notes-line"></div>
        <div class="notes-line"></div>
        <div class="notes-line"></div>
        <div class="notes-line"></div>
    </div>
    
</body>
</html>
"""
    return html


@router.get("/weekly-packet/{child_id}")
async def get_weekly_packet(
    child_id: str,
    week_start: str = Query(..., description="Week start date (YYYY-MM-DD)"),
    format: str = Query("pdf", description="Output format: 'pdf' or 'html'"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Generate weekly student packet with schedule, assignments, tasks, materials, and progress.
    Supports PDF and HTML formats.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not found or access denied")
        
        # Parse week_start date
        try:
            week_start_date = date.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD"
            )
        
        # Calculate week end (7 days after start)
        week_end_date = week_start_date + timedelta(days=6)
        
        # Convert to datetime for queries
        week_start_ts = datetime.combine(week_start_date, datetime.min.time()).isoformat()
        week_end_ts = datetime.combine(week_end_date, datetime.max.time()).isoformat()
        
        supabase = get_admin_client()
        
        # Get child name
        child_res = supabase.table("children").select("first_name, last_name").eq("id", child_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_data = child_res.data
        child_name = f"{child_data.get('first_name', 'Student')} {child_data.get('last_name', '')}".strip()
        
        # Get events for the week (including materials)
        events_res = supabase.table("events").select(
            "id, title, description, start_ts, end_ts, subject_id, status, materials_attachment_ids"
        ).eq("child_id", child_id).gte("start_ts", week_start_ts).lte("start_ts", week_end_ts).order("start_ts").execute()
        
        events = events_res.data or []
        
        # Collect all material IDs from events
        material_ids = set()
        for event in events:
            if event.get("materials_attachment_ids"):
                material_ids.update(event["materials_attachment_ids"])
        
        # Get materials
        materials = []
        if material_ids:
            materials_res = supabase.table("uploads").select(
                "id, title, mime, created_at"
            ).in_("id", list(material_ids)).execute()
            materials = materials_res.data or []
        
        # Calculate progress summary
        events_total = len(events)
        events_completed = len([e for e in events if e.get("status") == "done"])
        tasks_total = len(backlog_items)
        tasks_completed = len([t for t in backlog_items if t.get("status") == "completed"])
        
        progress_summary = {
            "events_total": events_total,
            "events_completed": events_completed,
            "tasks_total": tasks_total,
            "tasks_completed": tasks_completed
        }
        
        # Get backlog items due this week
        backlog_res = supabase.table("backlog_items").select(
            "id, title, description, due_date, estimate_minutes, subject_id, priority"
        ).eq("child_id", child_id).eq("is_active", True).gte("due_date", str(week_start_date)).lte("due_date", str(week_end_date)).order("due_date").execute()
        
        backlog_items = backlog_res.data or []
        
        # Get subjects map
        subject_ids = set()
        for event in events:
            if event.get("subject_id"):
                subject_ids.add(event["subject_id"])
        for item in backlog_items:
            if item.get("subject_id"):
                subject_ids.add(item["subject_id"])
        
        subjects_map = {}
        if subject_ids:
            subjects_res = supabase.table("subject").select("id, name").in_("id", list(subject_ids)).execute()
            if subjects_res.data:
                subjects_map = {s["id"]: s["name"] for s in subjects_res.data}
        
        # Generate output based on format
        if format.lower() == "html":
            html_content = generate_weekly_packet_html(
                child_name=child_name,
                week_start=week_start_date,
                week_end=week_end_date,
                events=events,
                backlog_items=backlog_items,
                subjects_map=subjects_map,
                materials=materials,
                progress_summary=progress_summary
            )
            
            log_event("weekly_packet_generated", child_id=child_id, week_start=week_start, format="html", user_id=user["id"])
            
            return HTMLResponse(content=html_content)
        else:
            # Generate PDF (enhanced with materials and progress)
            pdf_buffer = generate_weekly_packet_pdf(
                child_name=child_name,
                week_start=week_start_date,
                week_end=week_end_date,
                events=events,
                backlog_items=backlog_items,
                subjects_map=subjects_map
            )
            
            log_event("weekly_packet_generated", child_id=child_id, week_start=week_start, format="pdf", user_id=user["id"])
            
            return StreamingResponse(
                pdf_buffer,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="weekly_packet_{child_name.replace(" ", "_")}_{week_start}.pdf"'
                }
            )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("weekly_packet.error", child_id=child_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating weekly packet: {str(e)}")


# Export both routers
__all__ = ["router", "events_router"]

