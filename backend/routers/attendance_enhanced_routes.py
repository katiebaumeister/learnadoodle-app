"""
Enhanced attendance routes for check-in/out, manual attendance, and reports
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date, timedelta
import sys
from pathlib import Path
import csv
import io

# Optional PDF generation support (requires reportlab)
try:
    from reportlab.lib import colors as reportlab_colors
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
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

router = APIRouter(prefix="/api/attendance", tags=["attendance_enhanced"])


class CheckInInput(BaseModel):
    child_id: str = Field(..., description="Child ID")
    check_in_time: Optional[str] = Field(None, description="ISO timestamp (defaults to now)")
    note: Optional[str] = Field(None, description="Optional note")


class CheckOutInput(BaseModel):
    check_in_id: str = Field(..., description="Check-in record ID")
    check_out_time: Optional[str] = Field(None, description="ISO timestamp (defaults to now)")
    note: Optional[str] = Field(None, description="Optional note")


class ManualAttendanceInput(BaseModel):
    child_id: str = Field(..., description="Child ID")
    day_date: str = Field(..., description="Date (YYYY-MM-DD)")
    attendance_type: str = Field(..., description="'day', 'hours', or 'minutes'")
    value: float = Field(..., description="Value based on attendance_type")
    status: str = Field(default="present", description="'present', 'partial', or 'absent'")
    note: Optional[str] = Field(None, description="Optional note")


class AttendanceReportInput(BaseModel):
    child_id: str = Field(..., description="Child ID")
    report_type: str = Field(..., description="'daily', 'weekly', 'monthly', 'yearly', 'custom'")
    date_range_start: str = Field(..., description="Start date (YYYY-MM-DD)")
    date_range_end: str = Field(..., description="End date (YYYY-MM-DD)")
    format: str = Field(default="pdf", description="'pdf', 'csv', or 'html'")


@router.post("/check_in")
async def check_in(
    body: CheckInInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Check in a child for attendance tracking"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=404, detail="Family not found")

    supabase = get_admin_client()

    # Verify child belongs to family
    child_check = supabase.table("children").select("id").eq("id", body.child_id).eq("family_id", family_id).single().execute()
    if not child_check.data:
        raise HTTPException(status_code=404, detail="Child not found")

    check_in_time = datetime.now() if not body.check_in_time else datetime.fromisoformat(body.check_in_time.replace("Z", "+00:00"))
    day_date = check_in_time.date().isoformat()

    check_in_data = {
        "family_id": family_id,
        "child_id": body.child_id,
        "check_in_time": check_in_time.isoformat(),
        "day_date": day_date,
        "note": body.note,
        "created_by": user["id"]
    }

    result = supabase.table("check_in_out").insert(check_in_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create check-in record")

    log_event("attendance.check_in", child_id=body.child_id, family_id=family_id)
    return result.data[0]


@router.post("/check_out")
async def check_out(
    body: CheckOutInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Check out a child and calculate total minutes"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=404, detail="Family not found")

    supabase = get_admin_client()

    # Load check-in record
    check_in_res = supabase.table("check_in_out").select("*").eq("id", body.check_in_id).single().execute()
    if not check_in_res.data:
        raise HTTPException(status_code=404, detail="Check-in record not found")

    check_in_record = check_in_res.data
    if check_in_record["family_id"] != family_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    check_out_time = datetime.now() if not body.check_out_time else datetime.fromisoformat(body.check_out_time.replace("Z", "+00:00"))
    check_in_time = datetime.fromisoformat(check_in_record["check_in_time"].replace("Z", "+00:00"))
    total_minutes = int((check_out_time - check_in_time).total_seconds() / 60)

    update_data = {
        "check_out_time": check_out_time.isoformat(),
        "total_minutes": total_minutes,
        "note": body.note if body.note else check_in_record.get("note")
    }

    result = supabase.table("check_in_out").update(update_data).eq("id", body.check_in_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update check-out record")

    log_event("attendance.check_out", check_in_id=body.check_in_id, total_minutes=total_minutes, family_id=family_id)
    return result.data[0]


@router.get("/check_in_status/{child_id}")
async def get_check_in_status(
    child_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get current check-in status for a child"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=404, detail="Family not found")

    supabase = get_admin_client()

    # Get most recent check-in without check-out
    result = supabase.table("check_in_out").select("*").eq("child_id", child_id).eq("family_id", family_id).is_("check_out_time", "null").order("check_in_time", desc=True).limit(1).execute()

    if result.data and len(result.data) > 0:
        return {"checked_in": True, "check_in_record": result.data[0]}
    return {"checked_in": False}


@router.post("/manual")
async def add_manual_attendance(
    body: ManualAttendanceInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Add manual attendance record (day/hour based)"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=404, detail="Family not found")

    supabase = get_admin_client()

    # Verify child belongs to family
    child_check = supabase.table("children").select("id").eq("id", body.child_id).eq("family_id", family_id).single().execute()
    if not child_check.data:
        raise HTTPException(status_code=404, detail="Child not found")

    if body.attendance_type not in ["day", "hours", "minutes"]:
        raise HTTPException(status_code=400, detail="attendance_type must be 'day', 'hours', or 'minutes'")

    attendance_data = {
        "family_id": family_id,
        "child_id": body.child_id,
        "day_date": body.day_date,
        "attendance_type": body.attendance_type,
        "value": body.value,
        "status": body.status,
        "note": body.note,
        "created_by": user["id"]
    }

    # Upsert based on unique constraint
    result = supabase.table("manual_attendance").upsert(
        attendance_data,
        on_conflict="child_id,day_date,attendance_type"
    ).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create manual attendance record")

    log_event("attendance.manual_added", child_id=body.child_id, attendance_type=body.attendance_type, family_id=family_id)
    return result.data[0] if isinstance(result.data, list) else result.data


@router.get("/manual/{child_id}")
async def get_manual_attendance(
    child_id: str,
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get manual attendance records for a child"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=404, detail="Family not found")

    supabase = get_admin_client()

    result = supabase.table("manual_attendance").select("*").eq("child_id", child_id).eq("family_id", family_id).gte("day_date", start_date).lte("day_date", end_date).order("day_date", desc=True).execute()

    return result.data or []


@router.post("/report")
async def generate_attendance_report(
    body: AttendanceReportInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Generate formatted attendance report (PDF, CSV, or HTML)"""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=404, detail="Family not found")

    supabase = get_admin_client()

    # Verify child belongs to family
    child_check = supabase.table("children").select("id, first_name").eq("id", body.child_id).eq("family_id", family_id).single().execute()
    if not child_check.data:
        raise HTTPException(status_code=404, detail="Child not found")

    child_name = child_check.data.get("first_name", "Student")

    # Get all attendance data
    # Event-based attendance
    event_attendance = supabase.table("attendance_records").select("day_date, minutes, status, note").eq("child_id", body.child_id).gte("day_date", body.date_range_start).lte("day_date", body.date_range_end).order("day_date").execute()

    # Manual attendance
    manual_attendance = supabase.table("manual_attendance").select("*").eq("child_id", body.child_id).gte("day_date", body.date_range_start).lte("day_date", body.date_range_end).order("day_date").execute()

    # Check-in/out records
    check_in_out = supabase.table("check_in_out").select("*").eq("child_id", body.child_id).gte("day_date", body.date_range_start).lte("day_date", body.date_range_end).order("day_date").execute()

    # Calculate totals
    total_minutes = 0
    total_days = 0

    if event_attendance.data:
        for record in event_attendance.data:
            if record.get("status") in ["present", "partial"]:
                total_minutes += record.get("minutes", 0)
                total_days += 1

    if manual_attendance.data:
        for record in manual_attendance.data:
            if record.get("status") in ["present", "partial"]:
                if record.get("attendance_type") == "hours":
                    total_minutes += record.get("value", 0) * 60
                elif record.get("attendance_type") == "minutes":
                    total_minutes += record.get("value", 0)
                elif record.get("attendance_type") == "day":
                    total_days += record.get("value", 0)
                    total_minutes += record.get("value", 0) * 480  # Assume 8 hours per day

    if check_in_out.data:
        for record in check_in_out.data:
            if record.get("check_out_time") and record.get("total_minutes"):
                total_minutes += record.get("total_minutes", 0)

    # Generate report based on format
    if body.format == "csv":
        return generate_csv_report(child_name, body.date_range_start, body.date_range_end, event_attendance.data or [], manual_attendance.data or [], check_in_out.data or [], total_minutes, total_days)
    elif body.format == "pdf":
        if not REPORTLAB_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="PDF generation requires reportlab library. Please install it with: pip install reportlab"
            )
        return generate_pdf_report(child_name, body.date_range_start, body.date_range_end, event_attendance.data or [], manual_attendance.data or [], check_in_out.data or [], total_minutes, total_days)
    else:
        raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'csv'")


def generate_csv_report(child_name, start_date, end_date, event_attendance, manual_attendance, check_in_out, total_minutes, total_days):
    """Generate CSV attendance report"""
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(["Attendance Report"])
    writer.writerow([f"Student: {child_name}"])
    writer.writerow([f"Date Range: {start_date} to {end_date}"])
    writer.writerow([])

    # Summary
    writer.writerow(["Summary"])
    writer.writerow(["Total Days", total_days])
    writer.writerow(["Total Hours", round(total_minutes / 60, 2)])
    writer.writerow(["Total Minutes", total_minutes])
    writer.writerow([])

    # Event-based attendance
    if event_attendance:
        writer.writerow(["Event-Based Attendance"])
        writer.writerow(["Date", "Minutes", "Status", "Note"])
        for record in event_attendance:
            writer.writerow([
                record.get("day_date"),
                record.get("minutes", 0),
                record.get("status", ""),
                record.get("note", "")
            ])
        writer.writerow([])

    # Manual attendance
    if manual_attendance:
        writer.writerow(["Manual Attendance"])
        writer.writerow(["Date", "Type", "Value", "Status", "Note"])
        for record in manual_attendance:
            writer.writerow([
                record.get("day_date"),
                record.get("attendance_type", ""),
                record.get("value", 0),
                record.get("status", ""),
                record.get("note", "")
            ])
        writer.writerow([])

    # Check-in/out
    if check_in_out:
        writer.writerow(["Check-In/Out Records"])
        writer.writerow(["Date", "Check-In", "Check-Out", "Minutes", "Note"])
        for record in check_in_out:
            writer.writerow([
                record.get("day_date"),
                record.get("check_in_time", ""),
                record.get("check_out_time", ""),
                record.get("total_minutes", 0),
                record.get("note", "")
            ])

    csv_content = output.getvalue()
    output.close()

    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8")),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="attendance_report_{child_name}_{start_date}_{end_date}.csv"'
        }
    )


def generate_pdf_report(child_name, start_date, end_date, event_attendance, manual_attendance, check_in_out, total_minutes, total_days):
    """Generate PDF attendance report"""
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
        fontSize=18,
        textColor=reportlab_colors.HexColor('#1e40af'),
        spaceAfter=30,
    )
    story.append(Paragraph("Attendance Report", title_style))
    story.append(Paragraph(f"<b>Student:</b> {child_name}", styles['Normal']))
    story.append(Paragraph(f"<b>Date Range:</b> {start_date} to {end_date}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # Summary table
    summary_data = [
        ["Metric", "Value"],
        ["Total Days", str(total_days)],
        ["Total Hours", f"{round(total_minutes / 60, 2)}"],
        ["Total Minutes", str(total_minutes)],
    ]
    summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#3b82f6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), reportlab_colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.3*inch))

    # Event-based attendance
    if event_attendance:
        story.append(Paragraph("<b>Event-Based Attendance</b>", styles['Heading2']))
        event_data = [["Date", "Minutes", "Status", "Note"]]
        for record in event_attendance[:50]:  # Limit to 50 rows
            event_data.append([
                record.get("day_date", ""),
                str(record.get("minutes", 0)),
                record.get("status", ""),
                record.get("note", "")[:50]  # Truncate long notes
            ])
        event_table = Table(event_data, colWidths=[1.5*inch, 1*inch, 1*inch, 2.5*inch])
        event_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#10b981')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), reportlab_colors.white),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        story.append(event_table)
        story.append(Spacer(1, 0.3*inch))

    # Manual attendance
    if manual_attendance:
        story.append(Paragraph("<b>Manual Attendance</b>", styles['Heading2']))
        manual_data = [["Date", "Type", "Value", "Status", "Note"]]
        for record in manual_attendance[:50]:
            manual_data.append([
                record.get("day_date", ""),
                record.get("attendance_type", ""),
                str(record.get("value", 0)),
                record.get("status", ""),
                record.get("note", "")[:40]
            ])
        manual_table = Table(manual_data, colWidths=[1.2*inch, 0.8*inch, 0.8*inch, 0.8*inch, 2.4*inch])
        manual_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#f59e0b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), reportlab_colors.white),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        story.append(manual_table)
        story.append(Spacer(1, 0.3*inch))

    # Check-in/out
    if check_in_out:
        story.append(Paragraph("<b>Check-In/Out Records</b>", styles['Heading2']))
        cio_data = [["Date", "Check-In", "Check-Out", "Minutes", "Note"]]
        for record in check_in_out[:50]:
            check_in = record.get("check_in_time", "")
            check_out = record.get("check_out_time", "")
            if check_in:
                check_in = datetime.fromisoformat(check_in.replace("Z", "+00:00")).strftime("%H:%M")
            if check_out:
                check_out = datetime.fromisoformat(check_out.replace("Z", "+00:00")).strftime("%H:%M")
            cio_data.append([
                record.get("day_date", ""),
                check_in,
                check_out,
                str(record.get("total_minutes", 0)),
                record.get("note", "")[:40]
            ])
        cio_table = Table(cio_data, colWidths=[1.2*inch, 1*inch, 1*inch, 0.8*inch, 2*inch])
        cio_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), reportlab_colors.HexColor('#8b5cf6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), reportlab_colors.white),
            ('GRID', (0, 0), (-1, -1), 1, reportlab_colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        story.append(cio_table)

    doc.build(story)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="attendance_report_{child_name}_{start_date}_{end_date}.pdf"'
        }
    )

