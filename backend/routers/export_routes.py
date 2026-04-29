"""
Comprehensive Export Routes
Handles all export types: weekly plans, daily printouts, substitute packets, portfolios, etc.
"""
import io
import csv
import zipfile
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

try:
    from reportlab.lib import colors as reportlab_colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.units import inch
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

from helpers import get_family_id_for_user
from supabase_client import get_admin_client
from auth import get_current_user, rate_limiter
from logger import log_event

router = APIRouter(prefix="/api/exports", tags=["exports"])

# ============================================================
# Request Models
# ============================================================

class WeeklyPlanExportInput(BaseModel):
    child_id: str
    week_start: date
    week_end: date
    format: str = Field(default="pdf", description="'pdf' or 'html'")

class DailyPrintoutInput(BaseModel):
    child_id: str
    date: date
    format: str = Field(default="pdf", description="'pdf' or 'html'")

class SubstitutePacketInput(BaseModel):
    child_ids: List[str]
    date: date
    include_notes: bool = True
    include_materials: bool = True

class PortfolioBookInput(BaseModel):
    child_id: str
    date_range_start: date
    date_range_end: date
    include_evidence: bool = True
    include_grades: bool = True
    include_attendance: bool = True

class YearEndSummaryInput(BaseModel):
    child_id: str
    academic_year_start: date
    academic_year_end: date
    summary_type: str = Field(default="comprehensive", description="'comprehensive', 'academic', 'social'")

class SkillMapExportInput(BaseModel):
    child_id: str
    subject_id: Optional[str] = None
    format: str = Field(default="pdf", description="'pdf' or 'csv'")

class CurriculumPlanExportInput(BaseModel):
    child_id: str
    subject_id: Optional[str] = None
    date_range_start: Optional[date] = None
    date_range_end: Optional[date] = None

class ProgressReportInput(BaseModel):
    child_id: str
    date_range_start: date
    date_range_end: date
    include_details: bool = True

class CaregiverPacketInput(BaseModel):
    child_id: str
    date_range_start: date
    date_range_end: date
    include_schedule: bool = True
    include_progress: bool = True
    include_materials: bool = True

class ReportCardExportInput(BaseModel):
    child_id: str
    term: str
    grades: List[Dict[str, Any]]
    behavior_comment: str = ""
    format: str = Field(default="pdf", description="'pdf' or 'docx'")

# ============================================================
# Helper Functions
# ============================================================

def get_week_start(d: date) -> date:
    """Get Monday of the week for a given date"""
    days_since_monday = d.weekday()
    return d - timedelta(days=days_since_monday)

def format_date(d: date) -> str:
    """Format date as YYYY-MM-DD"""
    return d.strftime("%Y-%m-%d")

# ============================================================
# Weekly Plans Export
# ============================================================

@router.post("/weekly-plan")
async def export_weekly_plan(
    body: WeeklyPlanExportInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export weekly plan as PDF"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get events for the week
        events_res = supabase.table("events").select(
            "id, title, description, start_ts, end_ts, subject_id, status, minutes, location"
        ).eq("child_id", body.child_id).gte("start_ts", body.week_start.isoformat()).lte("start_ts", body.week_end.isoformat()).order("start_ts").execute()

        # Get subjects
        subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
        subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        # Get backlog items
        backlog_res = supabase.table("learning_backlog").select(
            "id, title, description, due_date, subject_id, estimated_minutes, priority"
        ).eq("child_id", body.child_id).execute()

        if body.format == "pdf":
            if not REPORTLAB_AVAILABLE:
                raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
            
            buffer = generate_weekly_plan_pdf(
                child_name,
                body.week_start,
                body.week_end,
                events_res.data or [],
                backlog_res.data or [],
                subjects_map
            )
            
            filename = f"weekly_plan_{child_name}_{body.week_start}_{body.week_end}.pdf"
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        else:
            raise HTTPException(status_code=400, detail="Only PDF format supported currently")

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.weekly_plan.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating weekly plan: {str(e)}")

def generate_weekly_plan_pdf(
    child_name: str,
    week_start: date,
    week_end: date,
    events: List[Dict[str, Any]],
    backlog_items: List[Dict[str, Any]],
    subjects_map: Dict[str, str]
) -> io.BytesIO:
    """Generate weekly plan PDF"""
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
    story.append(Paragraph("Weekly Learning Plan", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Week:</b> {week_start.strftime('%B %d')} - {week_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Group events by day
    events_by_day: Dict[str, List[Dict[str, Any]]] = {}
    for event in events:
        event_date = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00")).date()
        day_name = event_date.strftime("%A, %B %d")
        if day_name not in events_by_day:
            events_by_day[day_name] = []
        events_by_day[day_name].append(event)

    # Daily Schedule
    if events_by_day:
        story.append(Paragraph("<b>Daily Schedule</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        for day_name in sorted(events_by_day.keys()):
            day_events = sorted(events_by_day[day_name], key=lambda e: e.get("start_ts", ""))
            story.append(Paragraph(f"<b>{day_name}</b>", styles['Heading3']))

            day_data = [["Time", "Subject", "Activity", "Duration"]]
            for event in day_events:
                start_ts = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00"))
                time_str = start_ts.strftime('%I:%M %p')
                subject_name = subjects_map.get(event.get("subject_id", ""), "General")
                title = event.get("title", "Activity")[:40]
                minutes = event.get("minutes", 0)
                duration = f"{minutes} min" if minutes else "—"

                day_data.append([time_str, subject_name[:20], title, duration])

            day_table = Table(day_data, colWidths=[1.2*inch, 1.5*inch, 3*inch, 0.8*inch])
            day_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [reportlab_colors.white, reportlab_colors.HexColor('#f9fafb')]),
            ]))
            story.append(day_table)
            story.append(Spacer(1, 0.2*inch))

        story.append(PageBreak())

    # Assignments/Tasks
    if backlog_items:
        story.append(Paragraph("<b>Assignments & Tasks</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        task_data = [["Task", "Subject", "Due Date", "Est. Time", "Priority"]]
        for item in backlog_items:
            title = item.get("title", "Task")[:50]
            subject_name = subjects_map.get(item.get("subject_id", ""), "General")
            due_date = item.get("due_date", "") or "—"
            est_time = f"{item.get('estimated_minutes', 0)} min" if item.get('estimated_minutes') else "—"
            priority = item.get("priority", "normal").capitalize()

            task_data.append([title, subject_name[:20], due_date, est_time, priority])

        task_table = Table(task_data, colWidths=[2.5*inch, 1.5*inch, 1.2*inch, 1*inch, 0.8*inch])
        task_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        story.append(task_table)

    doc.build(story)
    return buffer

# ============================================================
# Daily Printouts
# ============================================================

@router.post("/daily-printout")
async def export_daily_printout(
    body: DailyPrintoutInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export daily printout as PDF"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get events for the day
        day_start = datetime.combine(body.date, datetime.min.time()).isoformat()
        day_end = datetime.combine(body.date, datetime.max.time()).isoformat()
        
        events_res = supabase.table("events").select(
            "id, title, description, start_ts, end_ts, subject_id, status, minutes, location, materials_attachment_ids"
        ).eq("child_id", body.child_id).gte("start_ts", day_start).lte("start_ts", day_end).order("start_ts").execute()

        # Get subjects
        subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
        subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        if body.format == "pdf":
            if not REPORTLAB_AVAILABLE:
                raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
            
            buffer = generate_daily_printout_pdf(
                child_name,
                body.date,
                events_res.data or [],
                subjects_map
            )
            
            filename = f"daily_printout_{child_name}_{body.date}.pdf"
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        else:
            raise HTTPException(status_code=400, detail="Only PDF format supported currently")

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.daily_printout.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating daily printout: {str(e)}")

def generate_daily_printout_pdf(
    child_name: str,
    date: date,
    events: List[Dict[str, Any]],
    subjects_map: Dict[str, str]
) -> io.BytesIO:
    """Generate daily printout PDF"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=10,
    )
    day_name = date.strftime("%A, %B %d, %Y")
    story.append(Paragraph(f"Daily Schedule: {day_name}", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Schedule table
    if events:
        schedule_data = [["Time", "Subject", "Activity", "Location", "Materials"]]
        for event in sorted(events, key=lambda e: e.get("start_ts", "")):
            start_ts = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00"))
            end_ts = datetime.fromisoformat(event.get("end_ts", "").replace("Z", "+00:00"))
            time_str = f"{start_ts.strftime('%I:%M %p')} - {end_ts.strftime('%I:%M %p')}"
            subject_name = subjects_map.get(event.get("subject_id", ""), "General")
            title = event.get("title", "Activity")
            location = event.get("location", "") or "—"
            materials = "Yes" if event.get("materials_attachment_ids") else "—"

            schedule_data.append([time_str, subject_name, title[:40], location[:20], materials])

        schedule_table = Table(schedule_data, colWidths=[1.5*inch, 1.2*inch, 2.5*inch, 1.2*inch, 0.6*inch])
        schedule_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [reportlab_colors.white, reportlab_colors.HexColor('#f9fafb')]),
        ]))
        story.append(schedule_table)
    else:
        story.append(Paragraph("No events scheduled for this day.", styles['Normal']))

    # Notes section
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph("<b>Notes:</b>", styles['Heading3']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_" * 80, styles['Normal']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_" * 80, styles['Normal']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("_" * 80, styles['Normal']))

    doc.build(story)
    return buffer

# ============================================================
# Substitute Teacher Packets
# ============================================================

@router.post("/substitute-packet")
async def export_substitute_packet(
    body: SubstitutePacketInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export substitute teacher packet as PDF"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify children
        children_res = supabase.table("children").select("id, first_name").eq("family_id", family_id).in_("id", body.child_ids).execute()
        if not children_res.data or len(children_res.data) != len(body.child_ids):
            raise HTTPException(status_code=404, detail="One or more children not found")

        # Get events for the day
        day_start = datetime.combine(body.date, datetime.min.time()).isoformat()
        day_end = datetime.combine(body.date, datetime.max.time()).isoformat()
        
        events_res = supabase.table("events").select(
            "id, title, description, start_ts, end_ts, subject_id, child_id, status, minutes, location, materials_attachment_ids, notes"
        ).in_("child_id", body.child_ids).gte("start_ts", day_start).lte("start_ts", day_end).order("start_ts").execute()

        # Get subjects
        subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
        subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        if not REPORTLAB_AVAILABLE:
            raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
        
        buffer = generate_substitute_packet_pdf(
            [c.get("first_name", "Student") for c in children_res.data],
            body.date,
            events_res.data or [],
            subjects_map,
            body.include_notes,
            body.include_materials
        )
        
        filename = f"substitute_packet_{body.date}.pdf"
        return StreamingResponse(
            io.BytesIO(buffer.getvalue()),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.substitute_packet.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating substitute packet: {str(e)}")

def generate_substitute_packet_pdf(
    child_names: List[str],
    date: date,
    events: List[Dict[str, Any]],
    subjects_map: Dict[str, str],
    include_notes: bool,
    include_materials: bool
) -> io.BytesIO:
    """Generate substitute teacher packet PDF"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=22,
        textColor=reportlab_colors.HexColor('#dc2626'),
        spaceAfter=10,
    )
    day_name = date.strftime("%A, %B %d, %Y")
    story.append(Paragraph("Substitute Teacher Packet", title_style))
    story.append(Paragraph(f"<b>Date:</b> {day_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Students:</b> {', '.join(child_names)}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Group events by child
    events_by_child: Dict[str, List[Dict[str, Any]]] = {}
    for event in events:
        child_id = event.get("child_id", "")
        if child_id not in events_by_child:
            events_by_child[child_id] = []
        events_by_child[child_id].append(event)

    # Schedule for each child
    for child_name in child_names:
        # Find child's events (match by name for now)
        child_events = [e for e in events if any(cn in str(e) for cn in child_names)]
        
        story.append(Paragraph(f"<b>Schedule for {child_name}</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        if child_events:
            schedule_data = [["Time", "Subject", "Activity", "Location", "Notes"]]
            for event in sorted(child_events, key=lambda e: e.get("start_ts", "")):
                start_ts = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00"))
                end_ts = datetime.fromisoformat(event.get("end_ts", "").replace("Z", "+00:00"))
                time_str = f"{start_ts.strftime('%I:%M %p')} - {end_ts.strftime('%I:%M %p')}"
                subject_name = subjects_map.get(event.get("subject_id", ""), "General")
                title = event.get("title", "Activity")
                location = event.get("location", "") or "—"
                notes = event.get("notes", "")[:30] if include_notes and event.get("notes") else "—"

                schedule_data.append([time_str, subject_name, title[:35], location[:15], notes])

            schedule_table = Table(schedule_data, colWidths=[1.5*inch, 1.2*inch, 2*inch, 1*inch, 1.3*inch])
            schedule_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#dc2626')),
                ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
            ]))
            story.append(schedule_table)
        else:
            story.append(Paragraph("No scheduled activities for this student.", styles['Normal']))

        story.append(Spacer(1, 0.3*inch))
        story.append(PageBreak())

    doc.build(story)
    return buffer

# ============================================================
# Portfolio Books
# ============================================================

@router.post("/portfolio-book")
async def export_portfolio_book(
    body: PortfolioBookInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export portfolio book as PDF"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get evidence/portfolio items
        evidence_items = []
        if body.include_evidence:
            evidence_res = supabase.table("evidence").select(
                "id, title, description, created_at, subject_id, upload_id, kind"
            ).eq("child_id", body.child_id).gte("created_at", body.date_range_start.isoformat()).lte("created_at", body.date_range_end.isoformat()).order("created_at", desc=True).execute()
            evidence_items = evidence_res.data or []

        # Get grades
        grades = []
        if body.include_grades:
            grades_res = supabase.table("grades").select(
                "term_label, subject_id, grade, score, credits, notes, created_at"
            ).eq("child_id", body.child_id).gte("created_at", body.date_range_start.isoformat()).lte("created_at", body.date_range_end.isoformat()).order("created_at").execute()
            grades = grades_res.data or []

        # Get attendance summary
        attendance_summary = None
        if body.include_attendance:
            attendance_res = supabase.table("attendance_records").select(
                "day_date, minutes, status"
            ).eq("child_id", body.child_id).gte("day_date", body.date_range_start.isoformat()).lte("day_date", body.date_range_end.isoformat()).execute()
            attendance_summary = attendance_res.data or []

        # Get subjects
        subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
        subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        if not REPORTLAB_AVAILABLE:
            raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
        
        buffer = generate_portfolio_book_pdf(
            child_name,
            body.date_range_start,
            body.date_range_end,
            evidence_items,
            grades,
            attendance_summary,
            subjects_map
        )
        
        filename = f"portfolio_book_{child_name}_{body.date_range_start}_{body.date_range_end}.pdf"
        return StreamingResponse(
            io.BytesIO(buffer.getvalue()),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.portfolio_book.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating portfolio book: {str(e)}")

def generate_portfolio_book_pdf(
    child_name: str,
    date_start: date,
    date_end: date,
    evidence_items: List[Dict[str, Any]],
    grades: List[Dict[str, Any]],
    attendance_summary: Optional[List[Dict[str, Any]]],
    subjects_map: Dict[str, str]
) -> io.BytesIO:
    """Generate portfolio book PDF"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=22,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=10,
    )
    story.append(Paragraph(f"Portfolio Book: {child_name}", title_style))
    story.append(Paragraph(f"<b>Date Range:</b> {date_start.strftime('%B %d, %Y')} - {date_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Evidence/Work Samples
    if evidence_items:
        story.append(Paragraph("<b>Evidence & Work Samples</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        evidence_data = [["Date", "Title", "Subject", "Type"]]
        for item in evidence_items[:50]:  # Limit to 50 items
            created_at = datetime.fromisoformat(item.get("created_at", "").replace("Z", "+00:00")).strftime("%Y-%m-%d")
            title = item.get("title", "Untitled")[:40]
            subject_name = subjects_map.get(item.get("subject_id", ""), "General")
            kind = item.get("kind", "evidence").capitalize()

            evidence_data.append([created_at, title, subject_name, kind])

        evidence_table = Table(evidence_data, colWidths=[1.2*inch, 3*inch, 1.5*inch, 1.3*inch])
        evidence_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        story.append(evidence_table)
        story.append(PageBreak())

    # Grades
    if grades:
        story.append(Paragraph("<b>Grades & Assessments</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        grades_data = [["Term", "Subject", "Grade", "Score", "Credits", "Notes"]]
        for grade in grades:
            term = grade.get("term_label", "")
            subject_name = subjects_map.get(grade.get("subject_id", ""), "General")
            grade_val = grade.get("grade", "")
            score = grade.get("score", "") or "—"
            credits = grade.get("credits", 0) or "—"
            notes = grade.get("notes", "")[:30] or "—"

            grades_data.append([term, subject_name, grade_val, str(score), str(credits), notes])

        grades_table = Table(grades_data, colWidths=[1.2*inch, 2*inch, 0.8*inch, 0.8*inch, 0.8*inch, 2.2*inch])
        grades_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        story.append(grades_table)
        story.append(PageBreak())

    # Attendance Summary
    if attendance_summary:
        story.append(Paragraph("<b>Attendance Summary</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        total_days = len([a for a in attendance_summary if a.get("status") in ["present", "partial"]])
        total_minutes = sum(a.get("minutes", 0) for a in attendance_summary)

        summary_data = [
            ["Metric", "Value"],
            ["Total Days Present", str(total_days)],
            ["Total Hours", f"{round(total_minutes / 60, 1)}"],
            ["Total Minutes", str(total_minutes)],
        ]

        summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
        ]))
        story.append(summary_table)

    doc.build(story)
    return buffer

# ============================================================
# Year-End Summary
# ============================================================

@router.post("/year-end-summary")
async def export_year_end_summary(
    body: YearEndSummaryInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export year-end summary as PDF"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get comprehensive data
        # Grades
        grades_res = supabase.table("grades").select(
            "term_label, subject_id, grade, score, credits, notes"
        ).eq("child_id", body.child_id).gte("created_at", body.academic_year_start.isoformat()).lte("created_at", body.academic_year_end.isoformat()).execute()

        # Attendance
        attendance_res = supabase.table("attendance_records").select(
            "day_date, minutes, status"
        ).eq("child_id", body.child_id).gte("day_date", body.academic_year_start.isoformat()).lte("day_date", body.academic_year_end.isoformat()).execute()

        # Events/Activities
        events_res = supabase.table("events").select(
            "id, title, subject_id, start_ts, status"
        ).eq("child_id", body.child_id).gte("start_ts", body.academic_year_start.isoformat()).lte("start_ts", body.academic_year_end.isoformat()).execute()

        # Evidence count
        evidence_res = supabase.table("evidence").select("id").eq("child_id", body.child_id).gte("created_at", body.academic_year_start.isoformat()).lte("created_at", body.academic_year_end.isoformat()).execute()

        # Get subjects
        subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
        subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        if not REPORTLAB_AVAILABLE:
            raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
        
        buffer = generate_year_end_summary_pdf(
            child_name,
            body.academic_year_start,
            body.academic_year_end,
            grades_res.data or [],
            attendance_res.data or [],
            events_res.data or [],
            len(evidence_res.data or []),
            subjects_map,
            body.summary_type
        )
        
        filename = f"year_end_summary_{child_name}_{body.academic_year_start.year}.pdf"
        return StreamingResponse(
            io.BytesIO(buffer.getvalue()),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.year_end_summary.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating year-end summary: {str(e)}")

def generate_year_end_summary_pdf(
    child_name: str,
    year_start: date,
    year_end: date,
    grades: List[Dict[str, Any]],
    attendance: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    evidence_count: int,
    subjects_map: Dict[str, str],
    summary_type: str
) -> io.BytesIO:
    """Generate year-end summary PDF"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=10,
    )
    story.append(Paragraph(f"Year-End Summary: {year_start.year}-{year_end.year}", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Academic Year:</b> {year_start.strftime('%B %d, %Y')} - {year_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Summary Statistics
    story.append(Paragraph("<b>Summary Statistics</b>", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))

    total_credits = sum(float(g.get("credits", 0) or 0) for g in grades)
    total_days = len([a for a in attendance if a.get("status") in ["present", "partial"]])
    total_hours = sum(a.get("minutes", 0) for a in attendance) / 60
    completed_events = len([e for e in events if e.get("status") == "completed"])

    stats_data = [
        ["Metric", "Value"],
        ["Total Credits Earned", f"{total_credits:.1f}"],
        ["Days Present", str(total_days)],
        ["Total Learning Hours", f"{total_hours:.1f}"],
        ["Activities Completed", str(completed_events)],
        ["Evidence Items", str(evidence_count)],
    ]

    stats_table = Table(stats_data, colWidths=[3*inch, 2*inch])
    stats_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
    ]))
    story.append(stats_table)
    story.append(PageBreak())

    # Grades by Subject
    if grades:
        story.append(Paragraph("<b>Grades by Subject</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        # Group by subject
        subject_grades: Dict[str, List[Dict[str, Any]]] = {}
        for grade in grades:
            subject_id = grade.get("subject_id", "")
            subject_name = subjects_map.get(subject_id, "General")
            if subject_name not in subject_grades:
                subject_grades[subject_name] = []
            subject_grades[subject_name].append(grade)

        for subject_name, subject_grades_list in subject_grades.items():
            story.append(Paragraph(f"<b>{subject_name}</b>", styles['Heading3']))
            
            grades_data = [["Term", "Grade", "Score", "Credits"]]
            for grade in subject_grades_list:
                grades_data.append([
                    grade.get("term_label", ""),
                    grade.get("grade", ""),
                    str(grade.get("score", "") or "—"),
                    str(grade.get("credits", 0) or "—"),
                ])

            grades_table = Table(grades_data, colWidths=[2*inch, 1*inch, 1*inch, 1*inch])
            grades_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#e5e7eb')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
            ]))
            story.append(grades_table)
            story.append(Spacer(1, 0.2*inch))

    doc.build(story)
    return buffer

# ============================================================
# Enhanced Transcript (HS)
# ============================================================

@router.post("/transcript-enhanced")
async def export_transcript_enhanced(
    child_id: str = Query(...),
    range_start: date = Query(...),
    range_end: date = Query(...),
    gpa_type: str = Query(default="unweighted"),
    format: str = Query(default="pdf"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export enhanced transcript as PDF or CSV"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get grades from grades table
        # Note: We don't filter by created_at date range because grades don't have a term_date field
        # The date range is used for display purposes only. We get all grades for the child.
        grades_res = supabase.table("grades").select(
            "term_label, subject_id, grade, score, credits, gpa_type, weight_multiplier, course_rigor_notes, syllabus_attachment_id, notes, created_at"
        ).eq("child_id", child_id).order("created_at").execute()
        
        # Also get grades from events table (grades stored directly on events)
        events_res = supabase.table("events").select(
            "id, subject_id, grade, created_at, updated_at"
        ).eq("child_id", child_id).eq("family_id", family_id).is_("deleted_at", None).not_.is_("grade", "null").neq("grade", "").order("created_at").execute()
        
        # Convert events with grades to grade format
        grades_from_events = []
        if events_res.data:
            for event in events_res.data:
                if event.get("grade"):
                    grades_from_events.append({
                        "term_label": None,  # Events don't have term_label column
                        "subject_id": event.get("subject_id"),
                        "grade": event.get("grade"),
                        "score": None,
                        "credits": 0,
                        "gpa_type": "unweighted",
                        "weight_multiplier": 1.0,
                        "course_rigor_notes": None,
                        "syllabus_attachment_id": None,
                        "notes": None,
                        "created_at": event.get("updated_at") or event.get("created_at")
                    })
        
        # Combine grades from both sources
        all_grades = (grades_res.data or []) + grades_from_events

        # Get all subjects for the child (family-wide + child-specific)
        # This matches the modal logic which shows all subjects, even ungraded ones
        # First get all subjects for the family
        subjects_res = supabase.table("subject").select("id, name, child_id").eq("family_id", family_id).order("name").execute()
        all_subjects = subjects_res.data or []
        
        # Filter: Show family-wide subjects (child_id is null) or subjects for this child
        filtered_subjects = [s for s in all_subjects if s.get("child_id") is None or s.get("child_id") == child_id]
        
        # Deduplicate by name, preferring child-specific over family-wide
        subject_map = {}
        for subject in filtered_subjects:
            existing = subject_map.get(subject["name"])
            if not existing or (existing.get("child_id") is None and subject.get("child_id") is not None):
                subject_map[subject["name"]] = subject
        
        subjects_map = {s["id"]: s["name"] for s in subject_map.values()}
        
        # Build course list: include all subjects, even if they don't have grades
        course_list = []
        for subject_id, subject_name in subjects_map.items():
            # Find grades for this subject
            subject_grades = [g for g in all_grades if g.get("subject_id") == subject_id]
            
            if subject_grades:
                # If there are multiple grades, use the most recent one
                subject_grades.sort(key=lambda g: g.get("created_at") or "", reverse=True)
                latest_grade = subject_grades[0]
                course_list.append({
                    "term_label": latest_grade.get("term_label"),
                    "subject_id": subject_id,
                    "subject_name": subject_name,
                    "grade": latest_grade.get("grade"),
                    "score": latest_grade.get("score"),
                    "credits": latest_grade.get("credits", 0),
                    "gpa_type": latest_grade.get("gpa_type", "unweighted"),
                    "weight_multiplier": latest_grade.get("weight_multiplier", 1.0),
                    "course_rigor_notes": latest_grade.get("course_rigor_notes"),
                    "syllabus_attachment_id": latest_grade.get("syllabus_attachment_id"),
                    "notes": latest_grade.get("notes"),
                })
            else:
                # Include subject even if it has no grades
                course_list.append({
                    "term_label": None,
                    "subject_id": subject_id,
                    "subject_name": subject_name,
                    "grade": None,
                    "score": None,
                    "credits": 0,
                    "gpa_type": "unweighted",
                    "weight_multiplier": 1.0,
                    "course_rigor_notes": None,
                    "syllabus_attachment_id": None,
                    "notes": None,
                })

        # Calculate GPA
        total_credits = 0
        weighted_points = 0
        unweighted_points = 0
        
        grade_points = {"A": 4.0, "B": 3.0, "C": 2.0, "D": 1.0, "F": 0.0}
        
        for grade in all_grades:
            grade_letter = grade.get("grade", "").upper()
            if grade_letter in grade_points:
                credits = float(grade.get("credits", 0) or 0)
                if credits > 0:
                    points = grade_points[grade_letter]
                    weight = float(grade.get("weight_multiplier", 1.0) or 1.0)
                    
                    total_credits += credits
                    unweighted_points += points * credits
                    weighted_points += points * weight * credits

        unweighted_gpa = unweighted_points / total_credits if total_credits > 0 else 0.0
        weighted_gpa = weighted_points / total_credits if total_credits > 0 else 0.0

        if format == "pdf":
            if not REPORTLAB_AVAILABLE:
                raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
            
            buffer = generate_transcript_pdf(
                child_name,
                range_start,
                range_end,
                course_list,
                subjects_map,
                unweighted_gpa,
                weighted_gpa,
                total_credits,
                gpa_type
            )
            
            filename = f"transcript_{child_name}_{range_start}_{range_end}.pdf"
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        else:
            # CSV format
            output = io.StringIO()
            writer = csv.writer(output)
            
            writer.writerow(["unofficial transcript"])
            writer.writerow([f"Student: {child_name}"])
            writer.writerow([f"Date Range: {range_start} to {range_end}"])
            writer.writerow([])
            
            headers = ["Term", "Subject", "Grade", "Score", "Credits", "GPA Type", "Weight", "Rigor Notes", "Syllabus", "Notes"]
            writer.writerow(headers)
            
            for course in course_list:
                row = [
                    course.get("term_label", "") or "",
                    course.get("subject_name", ""),
                    course.get("grade", "") or "",
                    str(course.get("score", "")) if course.get("score") else "—",
                    course.get("credits", 0),
                    course.get("gpa_type", "unweighted"),
                    course.get("weight_multiplier", 1.0),
                    course.get("course_rigor_notes", "") or "",
                    "Yes" if course.get("syllabus_attachment_id") else "No",
                    course.get("notes", "") or "",
                ]
                writer.writerow(row)
            
            writer.writerow([])
            writer.writerow(["GPA Summary"])
            writer.writerow(["Unweighted GPA", f"{unweighted_gpa:.2f}"])
            writer.writerow(["Weighted GPA", f"{weighted_gpa:.2f}"])
            writer.writerow(["Total Credits", f"{total_credits:.1f}"])

            csv_content = output.getvalue()
            output.close()

            return StreamingResponse(
                io.BytesIO(csv_content.encode("utf-8")),
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="transcript_{child_name}_{range_start}_{range_end}.csv"'}
            )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.transcript_enhanced.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating transcript: {str(e)}")

def generate_transcript_pdf(
    child_name: str,
    range_start: date,
    range_end: date,
    course_list: List[Dict[str, Any]],
    subjects_map: Dict[str, str],
    unweighted_gpa: float,
    weighted_gpa: float,
    total_credits: float,
    gpa_type: str
) -> io.BytesIO:
    """Generate transcript PDF"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=22,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=10,
        alignment=TA_CENTER,
    )
    story.append(Paragraph("UNOFFICIAL TRANSCRIPT", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Date Range:</b> {range_start.strftime('%B %d, %Y')} - {range_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # GPA Summary
    gpa_data = [
        ["GPA Type", "GPA", "Total Credits"],
        ["Unweighted", f"{unweighted_gpa:.2f}", f"{total_credits:.1f}"],
        ["Weighted", f"{weighted_gpa:.2f}", f"{total_credits:.1f}"],
    ]

    gpa_table = Table(gpa_data, colWidths=[2.5*inch, 1.5*inch, 2*inch])
    gpa_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
    ]))
    story.append(gpa_table)
    story.append(Spacer(1, 0.3*inch))

    # Course List
    story.append(Paragraph("<b>Course List</b>", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))

    course_data = [["Term", "Subject", "Grade", "Score", "Credits", "GPA Type", "Weight"]]
    for course in course_list:
        course_data.append([
            course.get("term_label", "") or "",
            course.get("subject_name", ""),
            course.get("grade", "") or "",
            str(course.get("score", "")) if course.get("score") else "—",
            str(course.get("credits", 0)),
            course.get("gpa_type", "unweighted"),
            str(course.get("weight_multiplier", 1.0)),
        ])

    course_table = Table(course_data, colWidths=[1.2*inch, 2*inch, 0.8*inch, 0.8*inch, 0.8*inch, 1*inch, 0.8*inch])
    course_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
    ]))
    story.append(course_table)

    doc.build(story)
    return buffer

# ============================================================
# Formatted Attendance Log
# ============================================================

@router.post("/attendance-log")
async def export_attendance_log(
    child_id: str = Query(...),
    range_start: date = Query(...),
    range_end: date = Query(...),
    format: str = Query(default="pdf"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export formatted attendance log as PDF or CSV"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get attendance records
        attendance_res = supabase.table("attendance_records").select(
            "day_date, minutes, status, note"
        ).eq("child_id", child_id).gte("day_date", range_start.isoformat()).lte("day_date", range_end.isoformat()).order("day_date").execute()

        # Get check-in/out records
        checkin_res = supabase.table("check_in_out").select(
            "check_in_time, check_out_time, total_minutes, note"
        ).eq("child_id", child_id).gte("check_in_time", range_start.isoformat()).lte("check_in_time", range_end.isoformat()).order("check_in_time").execute()

        attendance_records = attendance_res.data if attendance_res and attendance_res.data else []
        checkin_records = checkin_res.data if checkin_res and checkin_res.data else []

        if format == "pdf":
            if not REPORTLAB_AVAILABLE:
                raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
            
            buffer = generate_attendance_log_pdf(
                child_name,
                range_start,
                range_end,
                attendance_records,
                checkin_records
            )
            
            filename = f"attendance_log_{child_name}_{range_start}_{range_end}.pdf"
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        else:
            # CSV format
            output = io.StringIO()
            writer = csv.writer(output)
            
            writer.writerow(["Attendance Log"])
            writer.writerow([f"Student: {child_name}"])
            writer.writerow([f"Date Range: {range_start} to {range_end}"])
            writer.writerow([])
            writer.writerow(["Date", "Status", "Minutes", "Hours", "Note"])
            
            total_minutes = 0
            for record in attendance_records:
                day_date = record.get("day_date", "") if record else ""
                status = record.get("status", "") if record else ""
                minutes = record.get("minutes", 0) or 0 if record else 0
                hours = round(minutes / 60, 2) if minutes > 0 else 0
                note = record.get("note", "") or "" if record else ""
                total_minutes += minutes
                
                writer.writerow([day_date, status, minutes, hours, note])
            
            writer.writerow([])
            writer.writerow(["Total Minutes", total_minutes])
            writer.writerow(["Total Hours", round(total_minutes / 60, 2)])

            csv_content = output.getvalue()
            output.close()

            return StreamingResponse(
                io.BytesIO(csv_content.encode("utf-8")),
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="attendance_log_{child_name}_{range_start}_{range_end}.csv"'}
            )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.attendance_log.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating attendance log: {str(e)}")

def generate_attendance_log_pdf(
    child_name: str,
    range_start: date,
    range_end: date,
    attendance_records: List[Dict[str, Any]],
    checkin_records: List[Dict[str, Any]]
) -> io.BytesIO:
    """Generate formatted attendance log PDF"""
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
        spaceAfter=10,
    )
    story.append(Paragraph("Attendance Log", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Date Range:</b> {range_start.strftime('%B %d, %Y')} - {range_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Summary
    total_days = len([a for a in attendance_records if a and a.get("status") in ["present", "partial"]])
    total_minutes = sum(a.get("minutes", 0) or 0 for a in attendance_records if a)
    total_hours = round(total_minutes / 60, 2) if total_minutes > 0 else 0

    summary_data = [
        ["Metric", "Value"],
        ["Days Present", str(total_days)],
        ["Total Hours", f"{total_hours}"],
        ["Total Minutes", str(total_minutes)],
    ]

    summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.3*inch))

    # Daily Records
    story.append(Paragraph("<b>Daily Attendance Records</b>", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))

    if attendance_records:
        log_data = [["Date", "Status", "Minutes", "Hours", "Note"]]
        for record in attendance_records:
            if not record:
                continue
            day_date = record.get("day_date", "") if record else ""
            status_str = record.get("status", "") if record else ""
            status = status_str.capitalize() if status_str else ""
            minutes = record.get("minutes", 0) or 0 if record else 0
            hours = round(minutes / 60, 2) if minutes > 0 else "—"
            note = (record.get("note", "") or "")[:40] if record and record.get("note") else "—"

            log_data.append([day_date, status, str(minutes), str(hours), note])

        log_table = Table(log_data, colWidths=[1.2*inch, 1*inch, 0.8*inch, 0.8*inch, 3.2*inch])
        log_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
        ]))
        story.append(log_table)

    doc.build(story)
    return buffer

# ============================================================
# Skill Map Export
# ============================================================

@router.post("/skill-map")
async def export_skill_map(
    body: SkillMapExportInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export skill map as PDF or CSV"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get skills
        skills_query = supabase.table("skills").select("id, name, description, subject_id, category, level").eq("family_id", family_id)
        if body.subject_id:
            skills_query = skills_query.eq("subject_id", body.subject_id)
        skills_res = skills_query.execute()

        # Get skill evidence/grades
        skill_grades_res = supabase.table("skill_grades").select(
            "skill_id, grade, notes, created_at"
        ).eq("child_id", body.child_id).execute()

        # Get subjects
        subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
        subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        # Map skill grades to skills
        skill_grades_map = {}
        for sg in skill_grades_res.data or []:
            skill_id = sg.get("skill_id")
            if skill_id not in skill_grades_map:
                skill_grades_map[skill_id] = []
            skill_grades_map[skill_id].append(sg)

        if body.format == "pdf":
            if not REPORTLAB_AVAILABLE:
                raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
            
            buffer = generate_skill_map_pdf(
                child_name,
                skills_res.data or [],
                skill_grades_map,
                subjects_map
            )
            
            filename = f"skill_map_{child_name}.pdf"
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        else:
            # CSV format
            output = io.StringIO()
            writer = csv.writer(output)
            
            writer.writerow(["Skill Map"])
            writer.writerow([f"Student: {child_name}"])
            writer.writerow([])
            writer.writerow(["Skill", "Subject", "Category", "Level", "Grade", "Notes"])
            
            for skill in skills_res.data or []:
                skill_name = skill.get("name", "")
                subject_name = subjects_map.get(skill.get("subject_id", ""), "General")
                category = skill.get("category", "") or "—"
                level = skill.get("level", "") or "—"
                
                # Get latest grade
                skill_id = skill.get("id")
                latest_grade = None
                if skill_id in skill_grades_map and skill_grades_map[skill_id]:
                    latest_grade = max(skill_grades_map[skill_id], key=lambda x: x.get("created_at", ""))
                
                grade = latest_grade.get("grade", "") if latest_grade else "—"
                notes = latest_grade.get("notes", "")[:50] if latest_grade and latest_grade.get("notes") else "—"
                
                writer.writerow([skill_name, subject_name, category, level, grade, notes])

            csv_content = output.getvalue()
            output.close()

            return StreamingResponse(
                io.BytesIO(csv_content.encode("utf-8")),
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="skill_map_{child_name}.csv"'}
            )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.skill_map.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating skill map: {str(e)}")

def generate_skill_map_pdf(
    child_name: str,
    skills: List[Dict[str, Any]],
    skill_grades_map: Dict[str, List[Dict[str, Any]]],
    subjects_map: Dict[str, str]
) -> io.BytesIO:
    """Generate skill map PDF"""
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
        spaceAfter=10,
    )
    story.append(Paragraph("Skill Map", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Group by category
    skills_by_category: Dict[str, List[Dict[str, Any]]] = {}
    for skill in skills:
        category = skill.get("category", "General")
        if category not in skills_by_category:
            skills_by_category[category] = []
        skills_by_category[category].append(skill)

    for category, category_skills in skills_by_category.items():
        story.append(Paragraph(f"<b>{category}</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        skill_data = [["Skill", "Subject", "Level", "Grade", "Status"]]
        for skill in category_skills:
            skill_name = skill.get("name", "")
            subject_name = subjects_map.get(skill.get("subject_id", ""), "General")
            level = skill.get("level", "") or "—"
            
            # Get latest grade
            skill_id = skill.get("id")
            latest_grade = None
            if skill_id in skill_grades_map and skill_grades_map[skill_id]:
                latest_grade = max(skill_grades_map[skill_id], key=lambda x: x.get("created_at", ""))
            
            grade = latest_grade.get("grade", "") if latest_grade else "—"
            status = "Assessed" if latest_grade else "Not Assessed"

            skill_data.append([skill_name[:40], subject_name[:20], level, grade, status])

        skill_table = Table(skill_data, colWidths=[2.5*inch, 1.5*inch, 1*inch, 0.8*inch, 1.2*inch])
        skill_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        story.append(skill_table)
        story.append(Spacer(1, 0.2*inch))

    doc.build(story)
    return buffer

# ============================================================
# Curriculum Plan Export
# ============================================================

@router.post("/curriculum-plan")
async def export_curriculum_plan(
    body: CurriculumPlanExportInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export curriculum plan as PDF"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get syllabi for child
        syllabi_query = supabase.table("syllabi").select(
            "id, title, child_id, subject_id, created_at"
        ).eq("child_id", body.child_id)
        
        if body.subject_id:
            syllabi_query = syllabi_query.eq("subject_id", body.subject_id)
        
        if body.date_range_start:
            syllabi_query = syllabi_query.gte("created_at", body.date_range_start.isoformat())
        
        if body.date_range_end:
            syllabi_query = syllabi_query.lte("created_at", body.date_range_end.isoformat())
        
        syllabi_res = syllabi_query.order("created_at", desc=True).execute()

        # Get syllabus sections
        syllabus_ids = [s.get("id") for s in syllabi_res.data or []]
        sections = []
        if syllabus_ids:
            sections_res = supabase.table("syllabus_sections").select(
                "id, syllabus_id, section_type, title, content, order_index"
            ).in_("syllabus_id", syllabus_ids).order("order_index").execute()
            sections = sections_res.data or []

        # Get subjects
        subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
        subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        if not REPORTLAB_AVAILABLE:
            raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
        
        buffer = generate_curriculum_plan_pdf(
            child_name,
            syllabi_res.data or [],
            sections,
            subjects_map
        )
        
        filename = f"curriculum_plan_{child_name}.pdf"
        return StreamingResponse(
            io.BytesIO(buffer.getvalue()),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.curriculum_plan.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating curriculum plan: {str(e)}")

def generate_curriculum_plan_pdf(
    child_name: str,
    syllabi: List[Dict[str, Any]],
    sections: List[Dict[str, Any]],
    subjects_map: Dict[str, str]
) -> io.BytesIO:
    """Generate curriculum plan PDF"""
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
        spaceAfter=10,
    )
    story.append(Paragraph("Curriculum Plan", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Group sections by syllabus
    sections_by_syllabus: Dict[str, List[Dict[str, Any]]] = {}
    for section in sections:
        syllabus_id = section.get("syllabus_id", "")
        if syllabus_id not in sections_by_syllabus:
            sections_by_syllabus[syllabus_id] = []
        sections_by_syllabus[syllabus_id].append(section)

    # For each syllabus
    for syllabus in syllabi:
        syllabus_id = syllabus.get("id", "")
        syllabus_title = syllabus.get("title", "Untitled")
        subject_name = subjects_map.get(syllabus.get("subject_id", ""), "General")
        
        story.append(Paragraph(f"<b>{syllabus_title}</b>", styles['Heading2']))
        story.append(Paragraph(f"Subject: {subject_name}", styles['Normal']))
        story.append(Spacer(1, 0.2*inch))

        # Sections
        syllabus_sections = sections_by_syllabus.get(syllabus_id, [])
        for section in syllabus_sections:
            section_type = section.get("section_type", "")
            section_title = section.get("title", "")
            content = section.get("content", "")[:200] or ""

            if section_type == "unit":
                story.append(Paragraph(f"<b>Unit: {section_title}</b>", styles['Heading3']))
            elif section_type == "lesson":
                story.append(Paragraph(f"Lesson: {section_title}", styles['Normal']))
                if content:
                    story.append(Paragraph(content, styles['Normal']))

        story.append(Spacer(1, 0.2*inch))
        story.append(PageBreak())

    doc.build(story)
    return buffer

# ============================================================
# Personalized Progress Report
# ============================================================

@router.post("/progress-report")
async def export_progress_report(
    body: ProgressReportInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export personalized progress report as PDF"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get comprehensive progress data
        # Grades
        grades_res = supabase.table("grades").select(
            "term_label, subject_id, grade, score, credits, notes"
        ).eq("child_id", body.child_id).gte("created_at", body.date_range_start.isoformat()).lte("created_at", body.date_range_end.isoformat()).execute()

        # Attendance
        attendance_res = supabase.table("attendance_records").select(
            "day_date, minutes, status"
        ).eq("child_id", body.child_id).gte("day_date", body.date_range_start.isoformat()).lte("day_date", body.date_range_end.isoformat()).execute()

        # Events completed
        events_res = supabase.table("events").select(
            "id, title, subject_id, status"
        ).eq("child_id", body.child_id).eq("status", "completed").gte("start_ts", body.date_range_start.isoformat()).lte("start_ts", body.date_range_end.isoformat()).execute()

        # Skills progress
        skills_res = supabase.table("skill_grades").select(
            "skill_id, grade, created_at"
        ).eq("child_id", body.child_id).gte("created_at", body.date_range_start.isoformat()).lte("created_at", body.date_range_end.isoformat()).execute()

        # Get subjects
        subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
        subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        if not REPORTLAB_AVAILABLE:
            raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
        
        buffer = generate_progress_report_pdf(
            child_name,
            body.date_range_start,
            body.date_range_end,
            grades_res.data or [],
            attendance_res.data or [],
            events_res.data or [],
            skills_res.data or [],
            subjects_map,
            body.include_details
        )
        
        filename = f"progress_report_{child_name}_{body.date_range_start}_{body.date_range_end}.pdf"
        return StreamingResponse(
            io.BytesIO(buffer.getvalue()),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.progress_report.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating progress report: {str(e)}")

def generate_progress_report_pdf(
    child_name: str,
    date_start: date,
    date_end: date,
    grades: List[Dict[str, Any]],
    attendance: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    skills: List[Dict[str, Any]],
    subjects_map: Dict[str, str],
    include_details: bool
) -> io.BytesIO:
    """Generate personalized progress report PDF"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=22,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=10,
    )
    story.append(Paragraph("Personalized Progress Report", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Report Period:</b> {date_start.strftime('%B %d, %Y')} - {date_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Executive Summary
    story.append(Paragraph("<b>Executive Summary</b>", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))

    total_credits = sum(float(g.get("credits", 0) or 0) for g in grades)
    total_days = len([a for a in attendance if a.get("status") in ["present", "partial"]])
    total_hours = sum(a.get("minutes", 0) for a in attendance) / 60
    completed_activities = len(events)
    skills_assessed = len(skills)

    summary_data = [
        ["Metric", "Value"],
        ["Credits Earned", f"{total_credits:.1f}"],
        ["Days Present", str(total_days)],
        ["Learning Hours", f"{total_hours:.1f}"],
        ["Activities Completed", str(completed_activities)],
        ["Skills Assessed", str(skills_assessed)],
    ]

    summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
    ]))
    story.append(summary_table)
    story.append(PageBreak())

    # Subject-by-Subject Progress
    if include_details and grades:
        story.append(Paragraph("<b>Subject Progress</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        # Group by subject
        subject_grades: Dict[str, List[Dict[str, Any]]] = {}
        for grade in grades:
            subject_id = grade.get("subject_id", "")
            subject_name = subjects_map.get(subject_id, "General")
            if subject_name not in subject_grades:
                subject_grades[subject_name] = []
            subject_grades[subject_name].append(grade)

        for subject_name, subject_grades_list in subject_grades.items():
            story.append(Paragraph(f"<b>{subject_name}</b>", styles['Heading3']))
            
            # Calculate average
            scores = [float(g.get("score", 0) or 0) for g in subject_grades_list if g.get("score")]
            avg_score = sum(scores) / len(scores) if scores else 0

            progress_data = [["Term", "Grade", "Score", "Credits"]]
            for grade in subject_grades_list:
                progress_data.append([
                    grade.get("term_label", ""),
                    grade.get("grade", ""),
                    str(grade.get("score", "") or "—"),
                    str(grade.get("credits", 0) or "—"),
                ])
            
            progress_data.append(["Average", "—", f"{avg_score:.1f}", "—"])

            progress_table = Table(progress_data, colWidths=[1.5*inch, 1*inch, 1*inch, 1*inch])
            progress_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#e5e7eb')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
            ]))
            story.append(progress_table)
            story.append(Spacer(1, 0.2*inch))

    doc.build(story)
    return buffer

# ============================================================
# Caregiver/Tutor PDF Packets
# ============================================================

@router.post("/caregiver-packet")
async def export_caregiver_packet(
    body: CaregiverPacketInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Export PDF packet for caregivers/tutors"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        
        child_name = child_res.data.get("first_name", "Student")

        # Get schedule
        events = []
        if body.include_schedule:
            events_res = supabase.table("events").select(
                "id, title, description, start_ts, end_ts, subject_id, status, minutes, location, materials_attachment_ids"
            ).eq("child_id", body.child_id).gte("start_ts", body.date_range_start.isoformat()).lte("start_ts", body.date_range_end.isoformat()).order("start_ts").execute()
            events = events_res.data or []

        # Get progress
        progress_data = {}
        if body.include_progress:
            grades_res = supabase.table("grades").select(
                "term_label, subject_id, grade, score"
            ).eq("child_id", body.child_id).gte("created_at", body.date_range_start.isoformat()).lte("created_at", body.date_range_end.isoformat()).execute()
            progress_data["grades"] = grades_res.data or []

        # Get subjects
        subjects_res = supabase.table("subject").select("id, name").eq("family_id", family_id).execute()
        subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        if not REPORTLAB_AVAILABLE:
            raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
        
        buffer = generate_caregiver_packet_pdf(
            child_name,
            body.date_range_start,
            body.date_range_end,
            events,
            progress_data,
            subjects_map,
            body.include_schedule,
            body.include_progress,
            body.include_materials
        )
        
        filename = f"caregiver_packet_{child_name}_{body.date_range_start}_{body.date_range_end}.pdf"
        return StreamingResponse(
            io.BytesIO(buffer.getvalue()),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.caregiver_packet.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating caregiver packet: {str(e)}")

def generate_caregiver_packet_pdf(
    child_name: str,
    date_start: date,
    date_end: date,
    events: List[Dict[str, Any]],
    progress_data: Dict[str, Any],
    subjects_map: Dict[str, str],
    include_schedule: bool,
    include_progress: bool,
    include_materials: bool
) -> io.BytesIO:
    """Generate caregiver/tutor packet PDF"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=22,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=10,
    )
    story.append(Paragraph("Student Information Packet", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Date Range:</b> {date_start.strftime('%B %d, %Y')} - {date_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Schedule
    if include_schedule and events:
        story.append(Paragraph("<b>Schedule</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        # Group by day
        events_by_day: Dict[str, List[Dict[str, Any]]] = {}
        for event in events:
            event_date = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00")).date()
            day_str = event_date.strftime("%Y-%m-%d")
            if day_str not in events_by_day:
                events_by_day[day_str] = []
            events_by_day[day_str].append(event)

        for day_str in sorted(events_by_day.keys()):
            day_date = datetime.strptime(day_str, "%Y-%m-%d").date()
            day_name = day_date.strftime("%A, %B %d")
            day_events = sorted(events_by_day[day_str], key=lambda e: e.get("start_ts", ""))

            story.append(Paragraph(f"<b>{day_name}</b>", styles['Heading3']))

            schedule_data = [["Time", "Subject", "Activity", "Location"]]
            for event in day_events:
                start_ts = datetime.fromisoformat(event.get("start_ts", "").replace("Z", "+00:00"))
                time_str = start_ts.strftime('%I:%M %p')
                subject_name = subjects_map.get(event.get("subject_id", ""), "General")
                title = event.get("title", "Activity")[:35]
                location = event.get("location", "") or "—"

                schedule_data.append([time_str, subject_name[:20], title, location[:20]])

            schedule_table = Table(schedule_data, colWidths=[1.2*inch, 1.5*inch, 2.8*inch, 1.5*inch])
            schedule_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
            ]))
            story.append(schedule_table)
            story.append(Spacer(1, 0.2*inch))

        story.append(PageBreak())

    # Progress Summary
    if include_progress and progress_data.get("grades"):
        story.append(Paragraph("<b>Progress Summary</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))

        progress_table_data = [["Subject", "Grade", "Score"]]
        for grade in progress_data["grades"][:20]:  # Limit to 20 most recent
            subject_name = subjects_map.get(grade.get("subject_id", ""), "General")
            grade_val = grade.get("grade", "")
            score = grade.get("score", "") or "—"

            progress_table_data.append([subject_name, grade_val, str(score)])

        progress_table = Table(progress_table_data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
        progress_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
        ]))
        story.append(progress_table)

    doc.build(story)
    return buffer


# ============================================================
# Learning Log Export
# ============================================================

@router.post("/learning-log")
async def export_learning_log(
    child_id: str = Query(...),
    range_start: date = Query(...),
    range_end: date = Query(...),
    format: str = Query(default="pdf"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Export learning log (lessons, activities, materials, assignments) for a child
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=403, detail="No family associated with user")

        supabase = get_admin_client()

        # Get child info
        child_res = supabase.table("children").select("id, first_name").eq("id", child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        child_name = child_res.data.get("first_name") or "Student"

        # Get all events for the child in the date range
        events_res = supabase.table("events").select(
            "id, title, description, subject_id, unit, grade, start_ts, child_id, event_type"
        ).eq("child_id", child_id).eq("family_id", family_id).is_("deleted_at", None).gte("start_ts", range_start.isoformat()).lte("start_ts", range_end.isoformat()).order("start_ts", desc=True).execute()

        events = events_res.data or []
        
        # Separate by type
        lessons = [e for e in events if e.get("event_type") == "Lesson"]
        activities = [e for e in events if e.get("event_type") == "Activity"]
        assignments = [e for e in events if e.get("event_type") in ["Project", "Exam", "Assignment", "Assessment"]]

        # Get subject names
        subject_ids = list(set([e.get("subject_id") for e in events if e.get("subject_id")]))
        subjects_map = {}
        if subject_ids:
            subjects_res = supabase.table("subject").select("id, name").in_("id", subject_ids).execute()
            subjects_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}

        # Get materials for the family (we can't filter by child via material_children due to RLS)
        # Get materials created in the date range for the family
        materials_res = supabase.table("materials").select("id, title, type, subject_id, created_at").eq("family_id", family_id).is_("deleted_at", None).gte("created_at", range_start.isoformat()).lte("created_at", range_end.isoformat()).execute()
        materials = materials_res.data or []

        if format == "pdf":
            if not REPORTLAB_AVAILABLE:
                raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
            
            buffer = generate_learning_log_pdf(
                child_name,
                range_start,
                range_end,
                lessons,
                activities,
                assignments,
                materials,
                subjects_map
            )
            
            filename = f"learning_log_{child_name}_{range_start}_{range_end}.pdf"
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        else:
            # DOCX format - for now return PDF (can be enhanced later)
            if not REPORTLAB_AVAILABLE:
                raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
            
            buffer = generate_learning_log_pdf(
                child_name,
                range_start,
                range_end,
                lessons,
                activities,
                assignments,
                materials,
                subjects_map
            )
            
            filename = f"learning_log_{child_name}_{range_start}_{range_end}.pdf"
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.learning_log.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating learning log: {str(e)}")

@router.post("/report-card")
async def export_report_card(
    body: ReportCardExportInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Export report card for a child
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=403, detail="No family associated with user")

        supabase = get_admin_client()

        # Get child info
        child_res = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")
        child_name = child_res.data.get("first_name") or "Student"

        if body.format == "pdf":
            if not REPORTLAB_AVAILABLE:
                raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
            
            buffer = generate_report_card_pdf(
                child_name,
                body.term,
                body.grades,
                body.behavior_comment
            )
            
            sanitized_term = body.term.replace(" ", "_").replace("/", "_").lower()
            filename = f"report_card_{child_name}_{sanitized_term}.pdf"
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        else:
            # DOCX format - for now return PDF (can be enhanced later)
            if not REPORTLAB_AVAILABLE:
                raise HTTPException(status_code=503, detail="PDF generation requires reportlab library")
            
            buffer = generate_report_card_pdf(
                child_name,
                body.term,
                body.grades,
                body.behavior_comment
            )
            
            sanitized_term = body.term.replace(" ", "_").replace("/", "_").lower()
            filename = f"report_card_{child_name}_{sanitized_term}.pdf"
            return StreamingResponse(
                io.BytesIO(buffer.getvalue()),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )

    except HTTPException:
        raise
    except Exception as e:
        log_event("export.report_card.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating report card: {str(e)}")

def generate_report_card_pdf(
    child_name: str,
    term: str,
    grades: List[Dict[str, Any]],
    behavior_comment: str
) -> io.BytesIO:
    """Generate report card PDF"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=22,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=10,
        alignment=TA_CENTER,
    )
    story.append(Paragraph("REPORT CARD", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>School:</b> Homeschool", styles['Normal']))
    story.append(Paragraph(f"<b>Term:</b> {term}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Grades Section (overall by subject)
    if grades:
        story.append(Paragraph("<b>Grades</b>", styles['Heading2']))
        story.append(Spacer(1, 0.1*inch))
        
        grade_data = [["Subject", "Overall Grade"]]
        for grade_item in grades:
            subject_name = grade_item.get("subjectName") or grade_item.get("subject") or "Unknown"
            grade = grade_item.get("grade", "Ungraded")
            grade_data.append([subject_name, grade])
        
        grade_table = Table(grade_data, colWidths=[4*inch, 2*inch])
        grade_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#1e40af')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(grade_table)
        story.append(Spacer(1, 0.3*inch))

        # Event-by-event breakdown (optional; driven by payload)
        has_any_breakdown = any(
            isinstance(item.get("eventBreakdown"), list) and len(item.get("eventBreakdown")) > 0
            for item in grades
        )
        if has_any_breakdown:
            story.append(Paragraph("<b>Event Breakdown</b>", styles['Heading2']))
            story.append(Spacer(1, 0.1*inch))
            for grade_item in grades:
                subject_name = grade_item.get("subjectName") or grade_item.get("subject") or "Unknown"
                breakdown_rows = grade_item.get("eventBreakdown") or []
                if not isinstance(breakdown_rows, list) or len(breakdown_rows) == 0:
                    continue

                story.append(Paragraph(f"<b>{subject_name}</b>", styles['Heading3']))
                detail_data = [["Event", "Date", "Grade"]]
                for row in breakdown_rows:
                    event_title = str(row.get("eventTitle") or "Event")
                    event_grade = str(row.get("grade") or "Ungraded")
                    raw_date = row.get("eventDate")
                    event_date = "—"
                    if raw_date:
                        try:
                            parsed = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                            event_date = parsed.strftime("%b %d, %Y")
                        except Exception:
                            event_date = str(raw_date)[:10]
                    detail_data.append([event_title, event_date, event_grade])

                detail_table = Table(detail_data, colWidths=[3.6*inch, 1.4*inch, 1.0*inch])
                detail_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#e5e7eb')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.black),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('ALIGN', (2, 1), (2, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('FONTSIZE', (0, 1), (-1, -1), 9),
                    ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ]))
                story.append(detail_table)
                story.append(Spacer(1, 0.15*inch))
    else:
        story.append(Paragraph("<i>No grades available for this term.</i>", styles['Normal']))
        story.append(Spacer(1, 0.3*inch))

    # Behavior Comments Section
    if behavior_comment:
        story.append(Paragraph("<b>Behavior Comments</b>", styles['Heading2']))
        story.append(Spacer(1, 0.1*inch))
        story.append(Paragraph(behavior_comment, styles['Normal']))
        story.append(Spacer(1, 0.3*inch))

    doc.build(story)
    buffer.seek(0)
    return buffer

def generate_learning_log_pdf(
    child_name: str,
    range_start: date,
    range_end: date,
    lessons: List[Dict[str, Any]],
    activities: List[Dict[str, Any]],
    assignments: List[Dict[str, Any]],
    materials: List[Dict[str, Any]],
    subjects_map: Dict[str, str]
) -> io.BytesIO:
    """Generate formatted learning log PDF"""
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
        spaceAfter=10,
    )
    story.append(Paragraph("Learning Log", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Date Range:</b> {range_start.strftime('%B %d, %Y')} - {range_end.strftime('%B %d, %Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Lessons Section
    if lessons:
        story.append(Paragraph(f"<b>Lessons ({len(lessons)})</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))
        for lesson in lessons:
            title = lesson.get("title", "Untitled Lesson")
            subject_name = subjects_map.get(lesson.get("subject_id", ""), "")
            unit = lesson.get("unit", "")
            notes = lesson.get("description", "") or lesson.get("notes", "")
            date_str = ""
            if lesson.get("start_ts"):
                try:
                    date_obj = datetime.fromisoformat(lesson["start_ts"].replace("Z", "+00:00"))
                    date_str = date_obj.strftime("%B %d, %Y")
                except:
                    pass
            
            lesson_text = f"<b>{title}</b>"
            if date_str:
                lesson_text += f"<br/>Date: {date_str}"
            if subject_name:
                lesson_text += f"<br/>Subject: {subject_name}"
            if unit:
                lesson_text += f"<br/>Unit: {unit}"
            if notes:
                lesson_text += f"<br/>{notes[:200]}{'...' if len(notes) > 200 else ''}"
            
            story.append(Paragraph(lesson_text, styles['Normal']))
            story.append(Spacer(1, 0.15*inch))
        story.append(Spacer(1, 0.3*inch))

    # Activities Section
    if activities:
        story.append(Paragraph(f"<b>Educational Activities ({len(activities)})</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))
        for activity in activities:
            title = activity.get("title", "Untitled Activity")
            subject_name = subjects_map.get(activity.get("subject_id", ""), "")
            notes = activity.get("description", "") or activity.get("notes", "")
            date_str = ""
            if activity.get("start_ts"):
                try:
                    date_obj = datetime.fromisoformat(activity["start_ts"].replace("Z", "+00:00"))
                    date_str = date_obj.strftime("%B %d, %Y")
                except:
                    pass
            
            activity_text = f"<b>{title}</b>"
            if date_str:
                activity_text += f"<br/>Date: {date_str}"
            if subject_name:
                activity_text += f"<br/>Subject: {subject_name}"
            if notes:
                activity_text += f"<br/>{notes[:200]}{'...' if len(notes) > 200 else ''}"
            
            story.append(Paragraph(activity_text, styles['Normal']))
            story.append(Spacer(1, 0.15*inch))
        story.append(Spacer(1, 0.3*inch))

    # Materials Section
    if materials:
        story.append(Paragraph(f"<b>Materials Used ({len(materials)})</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))
        for material in materials:
            title = material.get("title", "Untitled Material")
            material_type = material.get("type", "Other")
            subject_name = subjects_map.get(material.get("subject_id", ""), "")
            
            material_text = f"<b>{title}</b>"
            material_text += f"<br/>Type: {material_type}"
            if subject_name:
                material_text += f"<br/>Subject: {subject_name}"
            
            story.append(Paragraph(material_text, styles['Normal']))
            story.append(Spacer(1, 0.15*inch))
        story.append(Spacer(1, 0.3*inch))

    # Assignments Section
    if assignments:
        story.append(Paragraph(f"<b>Assignments ({len(assignments)})</b>", styles['Heading2']))
        story.append(Spacer(1, 0.2*inch))
        for assignment in assignments:
            title = assignment.get("title", "Untitled Assignment")
            subject_name = subjects_map.get(assignment.get("subject_id", ""), "")
            grade = assignment.get("grade", "")
            notes = assignment.get("description", "") or assignment.get("notes", "")
            date_str = ""
            if assignment.get("start_ts"):
                try:
                    date_obj = datetime.fromisoformat(assignment["start_ts"].replace("Z", "+00:00"))
                    date_str = date_obj.strftime("%B %d, %Y")
                except:
                    pass
            
            assignment_text = f"<b>{title}</b>"
            if date_str:
                assignment_text += f"<br/>Date: {date_str}"
            if subject_name:
                assignment_text += f"<br/>Subject: {subject_name}"
            if grade:
                assignment_text += f"<br/>Grade: {grade}"
            if notes:
                assignment_text += f"<br/>{notes[:200]}{'...' if len(notes) > 200 else ''}"
            
            story.append(Paragraph(assignment_text, styles['Normal']))
            story.append(Spacer(1, 0.15*inch))
        story.append(Spacer(1, 0.3*inch))

    doc.build(story)
    return buffer
