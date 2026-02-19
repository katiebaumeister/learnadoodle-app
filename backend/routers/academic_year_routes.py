"""
FastAPI routes for Academic Year Planning (Plan Year feature)

Supports:
- Non-homeschool fast path (defaults + typical holidays)
- Homeschool constraint solver (pick 3 vars, compute 4th)
- Global holiday subscription ("follow global holidays") + custom holidays
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
from collections import defaultdict
import math
import json
import sys
import traceback
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, require_onboarding_complete
from logger import log_event
from supabase_client import get_admin_client
from services.year_calculator import recalculate_year, get_instructional_dates_list, CalculationMode
from services.blocks_calculator import (
    compute_schedule_potential,
    exclusion_ranges_from_breaks_and_holidays,
    get_block_occurrence_dates,
)
from services.block_regenerator import regenerate_block as regen_block
from services.holiday_providers import fetch_global_holidays, HolidayProvider
import uuid

router = APIRouter(prefix="/api/academic_year", tags=["academic_year"])


# ============================================================
# Request/Response Models
# ============================================================

class HolidayEntry(BaseModel):
    date: str  # YYYY-MM-DD
    name: str
    type: str = "CUSTOM_HOLIDAY"  # GLOBAL_HOLIDAY | CUSTOM_HOLIDAY | BREAK | BLACKOUT
    source_id: Optional[str] = None


class HolidaySettings(BaseModel):
    follow_global_holidays: bool = False
    holiday_country_code: Optional[str] = None  # e.g., "US", "AU"
    holiday_region: Optional[str] = None
    provider: str = "NAGER_DATE"  # NAGER_DATE | GOOGLE_ICS | CALENDARIFIC


class RecalculateInput(BaseModel):
    academic_year_id: Optional[str] = None  # None for preview/draft
    mode: str  # FIXED_END | TARGET_DAYS | TARGET_HOURS
    start_date: str  # YYYY-MM-DD
    end_date: Optional[str] = None  # Required for FIXED_END
    target_instructional_days: Optional[int] = None  # Required for TARGET_DAYS
    target_instructional_hours: Optional[int] = None  # Required for TARGET_HOURS
    planned_hours_per_day: Optional[float] = None  # Required for TARGET_HOURS
    allowed_weekdays: List[int] = Field(default=[1, 2, 3, 4, 5])  # Mon-Fri default
    holiday_settings: Optional[HolidaySettings] = None
    custom_holidays: List[HolidayEntry] = []


class RecalculateOutput(BaseModel):
    instructional_days: int
    instructional_hours: Optional[float] = None
    end_date: Optional[str] = None
    non_instructional_days: int
    diff_summary: Optional[Dict[str, Any]] = None


class CustomBreakEntry(BaseModel):
    start: str  # YYYY-MM-DD
    end: str    # YYYY-MM-DD
    name: str


class BlockEntry(BaseModel):
    """Block schema: subject + weekdays + time range + children. block_id optional for new blocks."""
    block_id: Optional[str] = None
    subject_id: str
    child_ids: List[str] = []
    weekdays: List[int] = [1, 2, 3, 4, 5]  # 0=Sun, 1=Mon, ..., 6=Sat
    start_time: str = "09:00"
    end_time: str = "10:00"
    all_day: bool = False


class ApplyToCalendarInput(BaseModel):
    academic_year_id: Optional[str] = None
    family_id: str
    start_date: str
    end_date: str
    allowed_weekdays: List[int] = [1, 2, 3, 4, 5]
    follow_public_holidays: bool = True
    holiday_region: Optional[str] = None  # e.g. "US" or "US:NATIONAL"
    custom_holidays: List[HolidayEntry] = []
    custom_breaks: List[CustomBreakEntry] = []
    target_instructional_days: int = 180
    subjects: List[str] = []  # subject UUIDs (used when blocks empty — legacy)
    child_id: Optional[str] = None
    replace_placeholders: bool = True
    blocks: List[BlockEntry] = []  # when non-empty, generate from blocks (Phase 2)
    # Phase 3: constraint mode + target for academic_year_plan
    constraint_mode: Optional[str] = None  # 'days' | 'hours'
    target_days: Optional[int] = None
    target_hours: Optional[float] = None
    subject_targets: Optional[Dict[str, Dict[str, Any]]] = None  # { subject_id: { target_days, target_hours } }; validated on write


class BlockRegenResult(BaseModel):
    block_id: str
    updated: int
    inserted: int
    deleted: int


class ApplyToCalendarOutput(BaseModel):
    created: int
    generation_batch_id: str
    planned_days: int
    academic_year_id: Optional[str] = None
    blocks: Optional[List[BlockRegenResult]] = None
    totals: Optional[Dict[str, int]] = None


class SchedulePotentialInput(BaseModel):
    family_id: str
    start_date: str
    end_date: str
    blocks: List[BlockEntry] = []
    custom_holidays: List[HolidayEntry] = []
    custom_breaks: List[CustomBreakEntry] = []
    target_days: Optional[int] = None
    target_hours: Optional[float] = None
    plan_children_ids: Optional[List[str]] = None  # for whole-family blocks: attribute to these children (child-aware suggested_end_date)
    subject_targets: Optional[Dict[str, Dict[str, Any]]] = None  # { subject_id: { target_days, target_hours } } for suggested_end_date_for_subject_target


class SchedulePotentialOutput(BaseModel):
    projected_days: int
    projected_hours: float
    target_days: Optional[int] = None
    target_hours: Optional[float] = None
    delta_days: Optional[int] = None
    delta_hours: Optional[float] = None
    per_subject: Optional[Dict[str, Dict[str, Any]]] = None  # subject_id -> { projected_days, suggested_end_date, ... }
    per_child: Optional[Dict[str, Dict[str, Any]]] = None  # child_id -> { projected_days, suggested_end_date } (child-aware)
    per_child_subject: Optional[Dict[str, Dict[str, Dict[str, Any]]]] = None  # child_id -> subject_id -> { projected_days, occurrence_dates_sorted }


class PlanHealthOutput(BaseModel):
    plan_exists: bool
    planned_days: Optional[int] = None
    planned_hours: Optional[float] = None
    delta_days: Optional[int] = None
    delta_hours: Optional[float] = None
    percent_complete: Optional[float] = None
    constraint_mode: Optional[str] = None
    target_days: Optional[int] = None
    target_hours: Optional[float] = None
    academic_year_id: Optional[str] = None
    manual_events_days: Optional[int] = None
    manual_events_hours: Optional[float] = None
    per_child: Optional[Dict[str, Dict[str, Any]]] = None
    per_child_subject: Optional[Dict[str, Dict[str, Dict[str, Any]]]] = None  # child_id -> subject_id -> { planned_days, subject_target_days, subject_delta_days, ... }
    subject_targets: Optional[Dict[str, Dict[str, Any]]] = None  # subject_id -> { target_days, target_hours } for client/schedule potential
    planning_mode: Optional[str] = None  # HOMESCHOOL_COMPLIANCE | AFTERSCHOOL_GOALS | NONE


class ApplyFixSuggestionInput(BaseModel):
    family_id: str
    suggestion_type: str  # 'extra_day_per_week' | 'extend_end_date' | 'catch_up_week'
    params: Optional[Dict[str, Any]] = None


class AcademicYearPlanSummary(BaseModel):
    """Embedded plan for edit modal: blocks + constraint targets."""
    start_date: str
    end_date: str
    constraint_mode: str = "days"
    target_days: Optional[int] = None
    target_hours: Optional[float] = None
    blocks: List[Dict[str, Any]] = []


class AcademicYearResponse(BaseModel):
    id: str
    family_id: str
    year_name: str
    start_date: str
    end_date: str
    mode: Optional[str] = None
    target_instructional_days: Optional[int] = None
    target_instructional_hours: Optional[int] = None
    planned_hours_per_day: Optional[float] = None
    allowed_weekdays: List[int] = []
    is_draft: bool
    holiday_settings: Optional[HolidaySettings] = None
    holidays: List[HolidayEntry] = []
    counts: Optional[Dict[str, Any]] = None
    plan: Optional[AcademicYearPlanSummary] = None


# ============================================================
# Helper Functions
# ============================================================

def validate_subject_targets(
    supabase,
    family_id: str,
    subject_targets: Dict[str, Dict[str, Any]],
) -> None:
    """
    Validate subject_targets before persist. Raises HTTPException if invalid.
    - Each subject_id must exist in subject table for this family.
    - target_days must be >= 0 when present.
    - target_hours must be >= 0 when present.
    """
    if not subject_targets or not isinstance(subject_targets, dict):
        return
    subject_ids = list(subject_targets.keys())
    if not subject_ids:
        return
    sub_resp = supabase.table("subject").select("id").eq("family_id", family_id).in_("id", subject_ids).execute()
    valid_ids = {str(r["id"]) for r in (sub_resp.data or [])}
    for sid, st in subject_targets.items():
        if not sid or not isinstance(st, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="subject_targets: each key must be a subject_id with value { target_days?, target_hours? }.",
            )
        if sid not in valid_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"subject_targets: subject_id {sid} not found or not in this family.",
            )
        td = st.get("target_days")
        if td is not None and (not isinstance(td, (int, float)) or int(td) < 0):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"subject_targets: target_days for {sid} must be >= 0.",
            )
        th = st.get("target_hours")
        if th is not None and (not isinstance(th, (int, float)) or float(th) < 0):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"subject_targets: target_hours for {sid} must be >= 0.",
            )


def get_holidays_for_year(
    supabase,
    academic_year_id: str,
    include_global: bool = False,
    country_code: Optional[str] = None,
    region: Optional[str] = None,
    provider: str = "NAGER_DATE"
) -> List[Dict]:
    """Get all holidays for an academic year (custom + optionally global)"""
    holidays = []
    
    # Get custom holidays from database
    holidays_resp = supabase.table("holidays").select("*").eq(
        "academic_year_id", academic_year_id
    ).execute()
    
    if holidays_resp.data:
        for h in holidays_resp.data:
            d = h["holiday_date"]
            holidays.append({
                "date": d.isoformat() if hasattr(d, "isoformat") else str(d),
                "name": h["holiday_name"],
                "type": h.get("type", "CUSTOM_HOLIDAY"),
                "source_id": h.get("source_id")
            })
    
    # If global holidays enabled, fetch and merge
    if include_global and country_code:
        # Get year from academic_year
        year_resp = supabase.table("academic_years").select("start_date, end_date").eq(
            "id", academic_year_id
        ).single().execute()
        
        if year_resp.data:
            start_date = datetime.fromisoformat(year_resp.data["start_date"]).date()
            end_date = datetime.fromisoformat(year_resp.data["end_date"]).date()
            
            # Fetch for both years if the year spans two calendar years
            years_to_fetch = set([start_date.year, end_date.year])
            
            for year in years_to_fetch:
                global_holidays = fetch_global_holidays(
                    country_code, year, provider, region, None
                )
                
                for gh in global_holidays:
                    # Only include if within academic year range
                    if start_date <= gh.date <= end_date:
                        # Check if already exists (by source_id)
                        if not any(h.get("source_id") == gh.source_id for h in holidays):
                            holidays.append({
                                "date": gh.date.isoformat(),
                                "name": gh.name,
                                "type": "GLOBAL_HOLIDAY",
                                "source_id": gh.source_id
                            })
    
    return holidays


# ============================================================
# Routes
# ============================================================

@router.post("/create_default")
async def create_default_academic_year(
    familyId: str = Query(..., description="Family ID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Create a default academic year for non-homeschool families.
    Defaults: Aug 15 → Jun 15, typical holidays, follow global holidays ON (US).
    """
    log_event("academic_year.create_default.start", user_id=user["id"], family_id=familyId)
    
    try:
        # Validate family access
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != familyId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )
        require_onboarding_complete(family_id)
        supabase = get_admin_client()
        
        # Calculate default dates (current or next academic year)
        today = date.today()
        current_year = today.year
        
        # If we're past June, use next academic year
        if today.month > 6:
            start_year = current_year
        else:
            start_year = current_year - 1
        
        start_date = date(start_year, 8, 15)
        end_date = date(start_year + 1, 6, 15)
        
        # Create academic year
        year_resp = supabase.table("academic_years").insert({
            "family_id": family_id,
            "year_name": f"{start_year}-{start_year + 1}",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "is_draft": False,
            "mode": "FIXED_END",
            "allowed_weekdays": [1, 2, 3, 4, 5],  # Mon-Fri
            "is_current": True
        }).select().single().execute()
        
        if not year_resp.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create academic year"
            )
        
        academic_year_id = year_resp.data["id"]
        
        # Create holiday settings with global holidays enabled (US default)
        supabase.table("academic_year_holiday_settings").insert({
            "academic_year_id": academic_year_id,
            "follow_global_holidays": True,
            "holiday_country_code": "US",
            "provider": "NAGER_DATE"
        }).execute()
        
        # Sync global holidays
        await sync_global_holidays_internal(
            supabase, academic_year_id, family_id, user["id"]
        )
        
        log_event("academic_year.create_default.success", user_id=user["id"], academic_year_id=academic_year_id)
        
        return {"academic_year_id": academic_year_id, "status": "created"}
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.create_default.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create default academic year: {str(e)}"
        )


@router.post("/recalculate", response_model=RecalculateOutput)
async def recalculate_academic_year(
    body: RecalculateInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Recalculate academic year based on mode and constraints.
    Returns computed values without persisting.
    """
    log_event("academic_year.recalculate.start", user_id=user["id"], mode=body.mode)
    
    try:
        supabase = get_admin_client()
        
        # Get holidays (custom + global if enabled)
        holiday_dates = set()
        
        if body.academic_year_id:
            # Get existing holidays
            holidays = get_holidays_for_year(
                supabase,
                body.academic_year_id,
                include_global=body.holiday_settings.follow_global_holidays if body.holiday_settings else False,
                country_code=body.holiday_settings.holiday_country_code if body.holiday_settings else None,
                region=body.holiday_settings.holiday_region if body.holiday_settings else None,
                provider=body.holiday_settings.provider if body.holiday_settings else "NAGER_DATE"
            )
            
            # Add custom holidays from request
            for ch in body.custom_holidays:
                holidays.append({
                    "date": ch.date,
                    "name": ch.name,
                    "type": ch.type,
                    "source_id": ch.source_id
                })
            
            # Extract dates
            for h in holidays:
                holiday_dates.add(date.fromisoformat(h["date"]))
        else:
            # Preview mode - only use custom holidays from request
            for ch in body.custom_holidays:
                holiday_dates.add(date.fromisoformat(ch.date))
            
            # If global holidays enabled, fetch them
            if body.holiday_settings and body.holiday_settings.follow_global_holidays:
                start_date_obj = date.fromisoformat(body.start_date)
                end_date_obj = date.fromisoformat(body.end_date) if body.end_date else None
                
                if end_date_obj:
                    years_to_fetch = set([start_date_obj.year, end_date_obj.year])
                else:
                    years_to_fetch = {start_date_obj.year}
                
                for year in years_to_fetch:
                    global_holidays = fetch_global_holidays(
                        body.holiday_settings.holiday_country_code or "US",
                        year,
                        body.holiday_settings.provider,
                        body.holiday_settings.holiday_region,
                        None
                    )
                    
                    for gh in global_holidays:
                        if start_date_obj <= gh.date:
                            if not end_date_obj or gh.date <= end_date_obj:
                                holiday_dates.add(gh.date)
        
        # Parse dates
        start_date_obj = date.fromisoformat(body.start_date)
        end_date_obj = date.fromisoformat(body.end_date) if body.end_date else None
        
        # Call calculation engine
        result = recalculate_year(
            mode=body.mode,
            start_date=start_date_obj,
            end_date=end_date_obj,
            target_instructional_days=body.target_instructional_days,
            target_instructional_hours=body.target_instructional_hours,
            planned_hours_per_day=body.planned_hours_per_day,
            allowed_weekdays=body.allowed_weekdays,
            holiday_dates=holiday_dates
        )
        
        log_event("academic_year.recalculate.success", user_id=user["id"], 
                 instructional_days=result["instructional_days"])
        
        return RecalculateOutput(**result)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        log_event("academic_year.recalculate.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to recalculate: {str(e)}"
        )


@router.post("/save")
async def save_academic_year(
    body: RecalculateInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Save academic year configuration.
    Persists year, holiday settings, and holidays.
    """
    log_event("academic_year.save.start", user_id=user["id"], academic_year_id=body.academic_year_id)
    
    try:
        # Validate family access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        supabase = get_admin_client()
        
        # Parse dates
        start_date_obj = date.fromisoformat(body.start_date)
        end_date_obj = date.fromisoformat(body.end_date) if body.end_date else None
        
        # Recalculate to get end_date if needed
        holiday_dates = set()
        for ch in body.custom_holidays:
            holiday_dates.add(date.fromisoformat(ch.date))
        
        if body.holiday_settings and body.holiday_settings.follow_global_holidays:
            # Fetch global holidays for preview
            years_to_fetch = {start_date_obj.year}
            if end_date_obj:
                years_to_fetch.add(end_date_obj.year)
            
            for year in years_to_fetch:
                global_holidays = fetch_global_holidays(
                    body.holiday_settings.holiday_country_code or "US",
                    year,
                    body.holiday_settings.provider,
                    body.holiday_settings.holiday_region,
                    None
                )
                for gh in global_holidays:
                    if start_date_obj <= gh.date:
                        if not end_date_obj or gh.date <= end_date_obj:
                            holiday_dates.add(gh.date)
        
        result = recalculate_year(
            mode=body.mode,
            start_date=start_date_obj,
            end_date=end_date_obj,
            target_instructional_days=body.target_instructional_days,
            target_instructional_hours=body.target_instructional_hours,
            planned_hours_per_day=body.planned_hours_per_day,
            allowed_weekdays=body.allowed_weekdays,
            holiday_dates=holiday_dates
        )
        
        # Use computed end_date if mode was TARGET_DAYS or TARGET_HOURS
        if result.get("end_date"):
            end_date_obj = date.fromisoformat(result["end_date"])
        
        # Upsert academic year
        year_data = {
            "family_id": family_id,
            "year_name": f"{start_date_obj.year}-{end_date_obj.year}",
            "start_date": start_date_obj.isoformat(),
            "end_date": end_date_obj.isoformat(),
            "mode": body.mode,
            "target_instructional_days": body.target_instructional_days,
            "target_instructional_hours": body.target_instructional_hours,
            "planned_hours_per_day": body.planned_hours_per_day,
            "allowed_weekdays": body.allowed_weekdays,
            "is_draft": False
        }
        
        if body.academic_year_id:
            # Update existing
            year_resp = supabase.table("academic_years").update(year_data).eq(
                "id", body.academic_year_id
            ).select().single().execute()
            academic_year_id = body.academic_year_id
        else:
            # Create new
            year_resp = supabase.table("academic_years").insert(year_data).select().single().execute()
            academic_year_id = year_resp.data["id"]
        
        # Upsert holiday settings
        if body.holiday_settings:
            settings_data = {
                "academic_year_id": academic_year_id,
                "follow_global_holidays": body.holiday_settings.follow_global_holidays,
                "holiday_country_code": body.holiday_settings.holiday_country_code,
                "holiday_region": body.holiday_settings.holiday_region,
                "provider": body.holiday_settings.provider
            }
            
            supabase.table("academic_year_holiday_settings").upsert(
                settings_data,
                on_conflict="academic_year_id"
            ).execute()
            
            # Sync global holidays if enabled
            if body.holiday_settings.follow_global_holidays:
                await sync_global_holidays_internal(
                    supabase, academic_year_id, family_id, user["id"]
                )
        else:
            # Turn off global holidays - delete GLOBAL_HOLIDAY rows
            supabase.table("holidays").delete().eq(
                "academic_year_id", academic_year_id
            ).eq("type", "GLOBAL_HOLIDAY").execute()
        
        # Upsert custom holidays
        for ch in body.custom_holidays:
            holiday_data = {
                "academic_year_id": academic_year_id,
                "holiday_name": ch.name,
                "holiday_date": ch.date,
                "type": ch.type,
                "source_id": ch.source_id,
                "is_proposed": False
            }
            
            # Use upsert with conflict on academic_year_id + date + type + source_id
            supabase.table("holidays").upsert(
                holiday_data,
                on_conflict="academic_year_id,holiday_date,type,source_id"
            ).execute()
        
        log_event("academic_year.save.success", user_id=user["id"], academic_year_id=academic_year_id)
        
        return {"academic_year_id": academic_year_id, "status": "saved"}
        
    except Exception as e:
        log_event("academic_year.save.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save academic year: {str(e)}"
        )


@router.post("/sync_global_holidays")
async def sync_global_holidays(
    academic_year_id: str = Query(..., description="Academic Year ID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Force resync global holidays for an academic year.
    Idempotent - won't create duplicates.
    """
    log_event("academic_year.sync_global_holidays.start", user_id=user["id"], academic_year_id=academic_year_id)
    
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        supabase = get_admin_client()
        
        await sync_global_holidays_internal(
            supabase, academic_year_id, family_id, user["id"]
        )
        
        log_event("academic_year.sync_global_holidays.success", user_id=user["id"], academic_year_id=academic_year_id)
        
        return {"status": "synced"}
        
    except Exception as e:
        log_event("academic_year.sync_global_holidays.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync global holidays: {str(e)}"
        )


@router.get("/plan_health", response_model=PlanHealthOutput)
async def get_plan_health(
    family_id: str = Query(..., description="Family ID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Compute plan health (actual compliance) from events in DB.
    Uses academic_year_plan for the family's most recent academic year.
    Stores result in health_cache for instant UI.
    """
    from services.plan_health import compute_plan_health_from_attributions
    from services.instructional_attribution import get_instructional_attributions

    try:
        family_id_user = get_family_id_for_user(user["id"])
        if not family_id_user or family_id_user != family_id:
            raise HTTPException(status_code=403, detail="Forbidden: Family ID mismatch")
        supabase = get_admin_client()

        # planning_mode / subject_targets may not exist yet (migration order). Be resilient in dev.
        try:
            plan_resp = (
                supabase.table("academic_year_plan")
                .select("id, academic_year_id, family_id, start_date, end_date, constraint_mode, target_days, target_hours, planning_mode, subject_targets")
                .eq("family_id", family_id)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )
        except Exception:
            try:
                plan_resp = (
                    supabase.table("academic_year_plan")
                    .select("id, academic_year_id, family_id, start_date, end_date, constraint_mode, target_days, target_hours, planning_mode")
                    .eq("family_id", family_id)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
            except Exception:
                plan_resp = (
                    supabase.table("academic_year_plan")
                    .select("id, academic_year_id, family_id, start_date, end_date, constraint_mode, target_days, target_hours")
                    .eq("family_id", family_id)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
        if not plan_resp.data or len(plan_resp.data) == 0:
            return PlanHealthOutput(plan_exists=False)

        plan = plan_resp.data[0]
        subject_targets = plan.get("subject_targets")  # optional { subject_id: { target_days, target_hours } }
        academic_year_id = plan["academic_year_id"]
        start_date_obj = date.fromisoformat(plan["start_date"][:10])
        end_date_obj = date.fromisoformat(plan["end_date"][:10])
        constraint_mode = plan.get("constraint_mode") or "days"
        target_days = plan.get("target_days")
        target_hours = float(plan["target_hours"]) if plan.get("target_hours") is not None else None

        end_next = (end_date_obj + timedelta(days=1)).isoformat()
        # Some columns (instructional_status/instructional_day_credit) may not exist until migrations run.
        # Prefer the full projection, but fall back to a minimal one in dev.
        try:
            ev_resp = (
                supabase.table("events")
                .select(
                    "id, start_ts, end_ts, event_type, status, deleted_at, counts_toward_plan, instructional_status, "
                    "academic_year_id, child_id, child_ids, subject_id, instructional_minutes, instructional_day_credit, is_placeholder"
                )
                .eq("family_id", family_id)
                .eq("academic_year_id", academic_year_id)
                .is_("deleted_at", None)
                .gte("start_ts", plan["start_date"] + "T00:00:00")
                .lt("start_ts", end_next + "T00:00:00")
                .execute()
            )
        except Exception:
            ev_resp = (
                supabase.table("events")
                .select(
                    "id, start_ts, end_ts, status, deleted_at, counts_toward_plan, "
                    "academic_year_id, child_id, child_ids, subject_id, instructional_minutes, is_placeholder"
                )
                .eq("family_id", family_id)
                .eq("academic_year_id", academic_year_id)
                .is_("deleted_at", None)
                .gte("start_ts", plan["start_date"] + "T00:00:00")
                .lt("start_ts", end_next + "T00:00:00")
                .execute()
            )
        events = ev_resp.data or []
        attributions = get_instructional_attributions(events)
        result = compute_plan_health_from_attributions(
            attributions,
            start_date_obj,
            end_date_obj,
            constraint_mode,
            target_days,
            target_hours,
            subject_targets=subject_targets,
        )
        health_cache = {
            **result,
            "computed_at": datetime.now().isoformat(),
        }
        supabase.table("academic_year_plan").update({
            "health_cache": health_cache,
            "updated_at": datetime.now().isoformat(),
        }).eq("id", plan["id"]).execute()

        return PlanHealthOutput(
            plan_exists=True,
            planned_days=result["planned_days"],
            planned_hours=result["planned_hours"],
            delta_days=result.get("delta_days"),
            delta_hours=result.get("delta_hours"),
            percent_complete=result.get("percent_complete"),
            constraint_mode=constraint_mode,
            target_days=target_days,
            target_hours=target_hours,
            academic_year_id=academic_year_id,
            manual_events_days=result.get("manual_events_days"),
            manual_events_hours=result.get("manual_events_hours"),
            per_child=result.get("per_child"),
            per_child_subject=result.get("per_child_subject"),
            subject_targets=subject_targets,
            planning_mode=plan.get("planning_mode"),
        )
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.plan_health.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/instructional_attributions")
async def get_instructional_attributions_debug(
    academic_year_id: str = Query(..., description="Academic year ID"),
    family_id: str = Query(..., description="Family ID"),
    sample_size: int = Query(50, ge=1, le=500, description="Max attribution rows to return in sample"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Debug endpoint: return instructional attribution rows and aggregated totals for an academic year.
    Response: sample of attribution rows, totals per child, totals per child-subject (days/hours).
    """
    from services.instructional_attribution import get_instructional_attributions
    from services.plan_health import _parse_ts_to_date

    try:
        family_id_user = get_family_id_for_user(user["id"])
        if not family_id_user or family_id_user != family_id:
            raise HTTPException(status_code=403, detail="Forbidden: Family ID mismatch")
        supabase = get_admin_client()
        ay = supabase.table("academic_years").select("id, family_id, start_date, end_date").eq("id", academic_year_id).execute()
        if not ay.data or len(ay.data) == 0:
            raise HTTPException(status_code=404, detail="Academic year not found")
        if ay.data[0].get("family_id") != family_id:
            raise HTTPException(status_code=403, detail="Academic year does not belong to this family")

        start_date = ay.data[0]["start_date"][:10]
        end_date = ay.data[0]["end_date"][:10]
        end_next = (date.fromisoformat(end_date) + timedelta(days=1)).isoformat()
        try:
            ev_resp = (
                supabase.table("events")
                .select(
                    "id, start_ts, end_ts, status, deleted_at, counts_toward_plan, instructional_status, "
                    "academic_year_id, child_id, child_ids, subject_id, instructional_minutes, is_placeholder"
                )
                .eq("family_id", family_id)
                .eq("academic_year_id", academic_year_id)
                .is_("deleted_at", None)
                .gte("start_ts", start_date + "T00:00:00")
                .lt("start_ts", end_next + "T00:00:00")
                .execute()
            )
        except Exception:
            ev_resp = (
                supabase.table("events")
                .select("id, start_ts, end_ts, status, deleted_at, counts_toward_plan, academic_year_id, child_id, child_ids, subject_id, instructional_minutes, is_placeholder")
                .eq("family_id", family_id)
                .eq("academic_year_id", academic_year_id)
                .is_("deleted_at", None)
                .gte("start_ts", start_date + "T00:00:00")
                .lt("start_ts", end_next + "T00:00:00")
                .execute()
            )
        events = ev_resp.data or []
        attributions = get_instructional_attributions(events)

        # Aggregates: per child (distinct dates, total minutes), per child-subject (distinct dates, total minutes)
        per_child_dates: Dict[str, set] = defaultdict(set)
        per_child_minutes: Dict[str, int] = defaultdict(int)
        per_child_subject_dates: Dict[tuple, set] = defaultdict(set)
        per_child_subject_minutes: Dict[tuple, int] = defaultdict(int)
        start_date_obj = date.fromisoformat(start_date)
        end_date_obj = date.fromisoformat(end_date)
        for row in attributions:
            start_ts = row.get("start_ts")
            d = _parse_ts_to_date(start_ts) if start_ts else None
            if d is None or d < start_date_obj or d > end_date_obj:
                continue
            minutes = row.get("instructional_minutes") or 0
            if minutes <= 0:
                continue
            child_id = str(row.get("child_id") or "")
            if not child_id:
                continue
            per_child_dates[child_id].add(d)
            per_child_minutes[child_id] += minutes
            subject_id = row.get("subject_id")
            if subject_id:
                key = (child_id, str(subject_id))
                per_child_subject_dates[key].add(d)
                per_child_subject_minutes[key] += minutes

        by_child = {}
        for cid in per_child_dates:
            by_child[cid] = {
                "instructional_days": len(per_child_dates[cid]),
                "instructional_hours": round(per_child_minutes[cid] / 60.0, 2),
            }
        by_child_subject = {}
        for (cid, sid), dates_set in per_child_subject_dates.items():
            if cid not in by_child_subject:
                by_child_subject[cid] = {}
            by_child_subject[cid][sid] = {
                "instructional_days": len(dates_set),
                "instructional_hours": round(per_child_subject_minutes.get((cid, sid), 0) / 60.0, 2),
            }

        sample = attributions[:sample_size]
        return {
            "academic_year_id": academic_year_id,
            "events_count": len(events),
            "attributions_count": len(attributions),
            "sample": sample,
            "aggregates": {
                "per_child": by_child,
                "per_child_subject": by_child_subject,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.instructional_attributions.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/apply_fix_suggestion")
async def apply_fix_suggestion(
    body: ApplyFixSuggestionInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Apply a fix-it suggestion: add Flex block (extra day/week), extend end date, or add catch-up week.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=403, detail="Forbidden: Family ID mismatch")
        require_onboarding_complete(family_id)
        supabase = get_admin_client()
        plan_resp = (
            supabase.table("academic_year_plan")
            .select("id, academic_year_id, family_id, start_date, end_date, constraint_mode, target_days, target_hours, blocks")
            .eq("family_id", family_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if not plan_resp.data or len(plan_resp.data) == 0:
            raise HTTPException(status_code=404, detail="No plan found. Create a plan first.")

        plan = plan_resp.data[0]
        academic_year_id = plan["academic_year_id"]
        blocks = list(plan.get("blocks") or [])
        start_date = plan["start_date"][:10]
        end_date = plan["end_date"][:10]
        params = body.params or {}

        if body.suggestion_type == "extra_day_per_week":
            wday_count = {w: 0 for w in [1, 2, 3, 4, 5]}
            for b in blocks:
                for w in b.get("weekdays") or [1, 2, 3, 4, 5]:
                    if w in wday_count:
                        wday_count[w] += 1
            least_loaded = min(wday_count, key=wday_count.get)
            sub_resp = supabase.table("subject").select("id").eq("family_id", family_id).limit(1).execute()
            subject_id = (sub_resp.data[0]["id"] if sub_resp.data else None) or (
                blocks[0]["subject_id"] if blocks else None
            )
            if not subject_id:
                raise HTTPException(status_code=400, detail="Add at least one subject first.")
            children_resp = supabase.table("children").select("id").eq("family_id", family_id).execute()
            child_ids = [r["id"] for r in (children_resp.data or [])]
            new_block = {
                "block_id": str(uuid.uuid4()),
                "subject_id": subject_id,
                "child_ids": child_ids[:1] if child_ids else [],
                "weekdays": [least_loaded],
                "start_time": "10:00",
                "end_time": "11:00",
                "all_day": False,
            }
            blocks.append(new_block)
            supabase.table("academic_year_plan").update({
                "blocks": blocks,
                "updated_at": datetime.now().isoformat(),
            }).eq("id", plan["id"]).execute()

        elif body.suggestion_type == "extend_end_date":
            extra_weeks = int(params.get("extra_weeks", 2))
            end_obj = date.fromisoformat(end_date)
            new_end = (end_obj + timedelta(weeks=extra_weeks)).isoformat()
            end_date = new_end
            supabase.table("academic_years").update({"end_date": new_end}).eq("id", academic_year_id).execute()
            supabase.table("academic_year_plan").update({
                "end_date": new_end,
                "updated_at": datetime.now().isoformat(),
            }).eq("id", plan["id"]).execute()

        elif body.suggestion_type == "catch_up_week":
            week_start = params.get("week_start")
            if not week_start:
                raise HTTPException(status_code=400, detail="week_start (YYYY-MM-DD) required for catch_up_week")
            start_d = date.fromisoformat(week_start[:10])
            sub_resp = supabase.table("subject").select("id").eq("family_id", family_id).limit(1).execute()
            subject_id = (sub_resp.data[0]["id"] if sub_resp.data else None) or (blocks[0]["subject_id"] if blocks else None)
            if not subject_id:
                raise HTTPException(status_code=400, detail="Add at least one subject first.")
            children_resp = supabase.table("children").select("id").eq("family_id", family_id).execute()
            child_ids = [r["id"] for r in (children_resp.data or [])]
            events_to_insert = []
            gen_id = str(uuid.uuid4())
            for i in range(5):
                d = start_d + timedelta(days=i)
                for cid in (child_ids[:1] if child_ids else [None]):
                    events_to_insert.append({
                        "family_id": family_id,
                        "child_id": cid,
                        "title": "Catch-up — Lesson",
                        "start_ts": f"{d.isoformat()}T10:00:00+00:00",
                        "end_ts": f"{d.isoformat()}T11:00:00+00:00",
                        "status": "scheduled",
                        "source": "system",
                        "event_type": "Lesson",
                        "subject_id": subject_id,
                        "is_placeholder": True,
                        "generated_by": "plan_year",
                        "academic_year_id": academic_year_id,
                        "generation_batch_id": gen_id,
                        "counts_toward_plan": True,
                    })
            if events_to_insert:
                supabase.table("events").insert(events_to_insert).execute()
            return {"success": True, "created": len(events_to_insert), "message": f"Added {len(events_to_insert)} catch-up lessons."}

        holidays = get_holidays_for_year(supabase, academic_year_id, include_global=True, country_code="US")
        apply_body = ApplyToCalendarInput(
            family_id=family_id,
            academic_year_id=academic_year_id,
            start_date=start_date,
            end_date=end_date,
            blocks=[BlockEntry(
                block_id=b.get("block_id"),
                subject_id=b["subject_id"],
                child_ids=b.get("child_ids", []),
                weekdays=b.get("weekdays", [1, 2, 3, 4, 5]),
                start_time=b.get("start_time", "09:00"),
                end_time=b.get("end_time", "10:00"),
                all_day=b.get("all_day", False),
            ) for b in blocks],
            custom_holidays=[HolidayEntry(date=h.get("date", h.get("holiday_date", "")), name=h.get("name", h.get("holiday_name", ""))) for h in holidays],
            custom_breaks=[],
            follow_public_holidays=True,
            holiday_region="US",
            replace_placeholders=True,
            constraint_mode=plan.get("constraint_mode") or "days",
            target_days=plan.get("target_days"),
            target_hours=float(plan["target_hours"]) if plan.get("target_hours") is not None else None,
        )
        result = await apply_to_calendar(apply_body, user, __)
        return {"success": True, "created": result.created, "planned_days": result.planned_days}
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.apply_fix_suggestion.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


async def sync_global_holidays_internal(
    supabase,
    academic_year_id: str,
    family_id: str,
    user_id: str
):
    """Internal helper to sync global holidays"""
    # Get holiday settings (optional: row may not exist)
    settings_resp = supabase.table("academic_year_holiday_settings").select("*").eq(
        "academic_year_id", academic_year_id
    ).limit(1).execute()
    settings = (settings_resp.data[0] if settings_resp.data and len(settings_resp.data) > 0 else None)
    if not settings or not settings.get("follow_global_holidays"):
        return  # Global holidays not enabled
    country_code = settings.get("holiday_country_code", "US")
    provider = settings.get("provider", "NAGER_DATE")
    region = settings.get("holiday_region")
    
    # Get academic year dates
    year_resp = supabase.table("academic_years").select("start_date, end_date").eq(
        "id", academic_year_id
    ).single().execute()
    
    if not year_resp.data:
        return
    
    start_date = datetime.fromisoformat(year_resp.data["start_date"]).date()
    end_date = datetime.fromisoformat(year_resp.data["end_date"]).date()
    
    # Fetch for both years if spanning
    years_to_fetch = set([start_date.year, end_date.year])
    
    holidays_to_insert = []
    for year in years_to_fetch:
        global_holidays = fetch_global_holidays(country_code, year, provider, region, None)
        
        for gh in global_holidays:
            # Only include if within academic year range
            if start_date <= gh.date <= end_date:
                holidays_to_insert.append({
                    "academic_year_id": academic_year_id,
                    "holiday_name": gh.name,
                    "holiday_date": gh.date.isoformat(),
                    "type": "GLOBAL_HOLIDAY",
                    "source_id": gh.source_id,
                    "is_proposed": False
                })
    
    # Upsert holidays (idempotent - won't create duplicates due to unique index)
    for holiday in holidays_to_insert:
        supabase.table("holidays").upsert(
            holiday,
            on_conflict="academic_year_id,holiday_date,type,source_id"
        ).execute()
    
    # Update last_synced_at
    supabase.table("academic_year_holiday_settings").update({
        "last_synced_at": datetime.now().isoformat()
    }).eq("academic_year_id", academic_year_id).execute()


@router.get("/holidays_for_range")
async def get_holidays_for_range(
    family_id: str = Query(..., description="Family ID"),
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get all holidays (from global holiday table + custom) for a family in a date range.
    Used by the planner to show holidays on month/week views.
    """
    try:
        family_id_user = get_family_id_for_user(user["id"])
        if not family_id_user or family_id_user != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )
        start_date = date.fromisoformat(start[:10])
        end_date = date.fromisoformat(end[:10])
        if start_date > end_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start must be <= end")

        supabase = get_admin_client()
        # Find academic years that overlap [start, end]
        years_resp = supabase.table("academic_years").select("id, start_date, end_date").eq(
            "family_id", family_id
        ).execute()
        if not years_resp.data:
            return {"holidays": []}

        def _parse_date(v):
            if v is None:
                return None
            s = (v.isoformat() if hasattr(v, "isoformat") else str(v))[:10]
            return date.fromisoformat(s)

        seen = set()  # (date_str, name) for dedupe
        result = []
        for row in years_resp.data:
            ay_start = _parse_date(row.get("start_date"))
            ay_end = _parse_date(row.get("end_date"))
            if ay_start is None or ay_end is None:
                continue
            if ay_end < start_date or ay_start > end_date:
                continue
            try:
                # Use limit(1) instead of maybe_single() - Supabase Python maybe_single() throws on 0 rows
                settings_resp = supabase.table("academic_year_holiday_settings").select("*").eq(
                    "academic_year_id", row["id"]
                ).limit(1).execute()
                holiday_settings = (settings_resp.data[0] if settings_resp.data and len(settings_resp.data) > 0 else None)
                include_global = holiday_settings.get("follow_global_holidays", False) if holiday_settings else False
                country_code = holiday_settings.get("holiday_country_code") if holiday_settings else None
                region = holiday_settings.get("holiday_region") if holiday_settings else None
                provider = (holiday_settings.get("provider") or "NAGER_DATE") if holiday_settings else "NAGER_DATE"
                holidays = get_holidays_for_year(
                    supabase,
                    row["id"],
                    include_global=include_global,
                    country_code=country_code,
                    region=region,
                    provider=provider,
                )
            except Exception as year_err:
                log_event("academic_year.holidays_for_range.year_error", user_id=user["id"], academic_year_id=row["id"], error=str(year_err))
                holidays = []
            for h in holidays:
                raw = h.get("date")
                if raw is None:
                    continue
                d = date.fromisoformat(str(raw)[:10]) if isinstance(raw, str) else (raw if hasattr(raw, "year") else date.fromisoformat(str(raw)[:10]))
                date_str = str(raw)[:10] if isinstance(raw, str) else (raw.isoformat() if hasattr(raw, "isoformat") else str(raw)[:10])
                if start_date <= d <= end_date:
                    key = (date_str, h.get("name", ""))
                    if key not in seen:
                        seen.add(key)
                        result.append({"date": date_str, "name": h.get("name", ""), "type": h.get("type", "CUSTOM_HOLIDAY")})
        result.sort(key=lambda x: (x["date"], x["name"]))
        return {"holidays": result}
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.holidays_for_range.error", user_id=user.get("id"), error=str(e))
        # Return empty holidays so the planner never breaks; fix backend and restart to get holidays
        return {"holidays": []}


@router.post("/schedule_potential", response_model=SchedulePotentialOutput)
async def schedule_potential(
    body: SchedulePotentialInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Compute schedule potential from blocks (never queries events).
    Returns projected_days, projected_hours, and delta vs target when target_days/target_hours provided.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=403, detail="Forbidden: Family ID mismatch")

        start_date_obj = date.fromisoformat(body.start_date)
        end_date_obj = date.fromisoformat(body.end_date)
        if start_date_obj > end_date_obj:
            raise HTTPException(status_code=400, detail="start_date must be <= end_date")

        holiday_dates = [h.date for h in body.custom_holidays]
        exclusion_ranges = exclusion_ranges_from_breaks_and_holidays(
            [{"start": b.start, "end": b.end} for b in body.custom_breaks],
            holiday_dates,
        )

        blocks_dict = []
        for b in body.blocks:
            block = {
                "block_id": b.block_id,
                "subject_id": b.subject_id,
                "child_ids": b.child_ids,
                "weekdays": b.weekdays,
                "start_time": b.start_time,
                "end_time": b.end_time,
                "all_day": b.all_day,
            }
            if not block["block_id"]:
                block["block_id"] = str(uuid.uuid4())
            blocks_dict.append(block)

        result = compute_schedule_potential(
            blocks_dict,
            start_date_obj,
            end_date_obj,
            exclusion_ranges,
            target_days=body.target_days,
            plan_children_ids=body.plan_children_ids,
            subject_targets=body.subject_targets,
        )
        projected_days = result["projected_days"]
        projected_hours = result["projected_hours"]
        delta_days = None
        delta_hours = None

        if body.target_days is not None:
            delta_days = projected_days - body.target_days
        if body.target_hours is not None:
            delta_hours = round(projected_hours - body.target_hours, 2)

        return SchedulePotentialOutput(
            projected_days=projected_days,
            projected_hours=projected_hours,
            target_days=body.target_days,
            target_hours=body.target_hours,
            delta_days=delta_days,
            delta_hours=delta_hours,
            per_subject=result.get("per_subject"),
            per_child=result.get("per_child"),
            per_child_subject=result.get("per_child_subject"),
        )
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.schedule_potential.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clear_placeholders")
async def clear_placeholders(
    family_id: str = Query(..., description="Family ID"),
    academic_year_id: str = Query(None, description="Optional: clear only this year's placeholders"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Remove Plan Year placeholder lessons. By default clears all placeholders for the family.
    If academic_year_id is provided, clears only that year's placeholders (validates family ownership).
    Only deletes events where is_placeholder=true and generated_by='plan_year'.
    Manual events are never touched.
    """
    try:
        family_id_user = get_family_id_for_user(user["id"])
        if not family_id_user or family_id_user != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch",
            )
        supabase = get_admin_client()

        if academic_year_id:
            # Validate academic year belongs to family
            ay = supabase.table("academic_years").select("family_id").eq("id", academic_year_id).execute()
            if not ay.data or len(ay.data) == 0:
                raise HTTPException(status_code=404, detail="Academic year not found")
            if ay.data[0].get("family_id") != family_id:
                raise HTTPException(status_code=403, detail="Academic year does not belong to your family")

        q = supabase.table("events").delete().eq("family_id", family_id).eq("is_placeholder", True).eq("generated_by", "plan_year")
        if academic_year_id:
            q = q.eq("academic_year_id", academic_year_id)
        resp = q.select("id").execute()
        deleted = len(resp.data) if resp.data else 0
        log_event("academic_year.clear_placeholders.success", user_id=user["id"], family_id=family_id, academic_year_id=academic_year_id, deleted=deleted)
        return {"deleted": deleted}
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.clear_placeholders.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear placeholders: {str(e)}",
        )


@router.get("/by_id")
async def get_academic_year_by_id(
    academic_year_id: str = Query(..., alias="academic_year_id", description="Academic year UUID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get academic year by query param (avoids path-with-UUID being replaced by tracking GIF by some clients).
    """
    return await _get_academic_year_impl(academic_year_id, user)


@router.get("/{academic_year_id}")
async def get_academic_year(
    academic_year_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get academic year with holiday settings, holidays, and counts.
    """
    return await _get_academic_year_impl(academic_year_id, user)


async def _get_academic_year_impl(academic_year_id: str, user: dict):
    """Shared implementation for GET academic year (by path or query)."""
    print(f"[academic_year] GET {academic_year_id} entered", flush=True)
    log_event("academic_year.get.start", user_id=user["id"], academic_year_id=academic_year_id)
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        supabase = get_admin_client()
        
        # Get academic year
        year_resp = supabase.table("academic_years").select("*").eq(
            "id", academic_year_id
        ).single().execute()
        
        if not year_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Academic year not found"
            )
        
        year_data = year_resp.data
        
        # Verify family access
        if year_data["family_id"] != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Academic year does not belong to family"
            )
        
        # Get holiday settings (optional: row may not exist)
        settings_resp = supabase.table("academic_year_holiday_settings").select("*").eq(
            "academic_year_id", academic_year_id
        ).limit(1).execute()
        settings_row = (settings_resp.data[0] if settings_resp.data and len(settings_resp.data) > 0 else None)
        holiday_settings = None
        if settings_row:
            holiday_settings = HolidaySettings(
                follow_global_holidays=settings_row.get("follow_global_holidays", False),
                holiday_country_code=settings_row.get("holiday_country_code"),
                holiday_region=settings_row.get("holiday_region"),
                provider=settings_row.get("provider", "NAGER_DATE")
            )
        
        # Get holidays
        holidays = get_holidays_for_year(
            supabase,
            academic_year_id,
            include_global=holiday_settings.follow_global_holidays if holiday_settings else False,
            country_code=holiday_settings.holiday_country_code if holiday_settings else None,
            region=holiday_settings.holiday_region if holiday_settings else None,
            provider=holiday_settings.provider if holiday_settings else "NAGER_DATE"
        )
        
        # Calculate counts
        start_date_obj = date.fromisoformat(year_data["start_date"])
        end_date_obj = date.fromisoformat(year_data["end_date"])
        allowed_weekdays = year_data.get("allowed_weekdays", [1, 2, 3, 4, 5])
        holiday_dates = {date.fromisoformat(h["date"]) for h in holidays}
        
        from services.year_calculator import count_instructional_days
        instructional_days = count_instructional_days(
            start_date_obj, end_date_obj, allowed_weekdays, holiday_dates
        )
        
        counts = {
            "instructional_days": instructional_days,
            "non_instructional_days": (end_date_obj - start_date_obj).days + 1 - instructional_days,
            "total_days": (end_date_obj - start_date_obj).days + 1
        }
        
        if year_data.get("planned_hours_per_day"):
            from services.year_calculator import compute_hours_from_days
            counts["instructional_hours"] = compute_hours_from_days(
                instructional_days, year_data["planned_hours_per_day"]
            )
        
        # Optional: include academic_year_plan for edit modal (blocks, target_days/hours)
        plan_summary = None
        plan_resp = supabase.table("academic_year_plan").select(
            "start_date, end_date, constraint_mode, target_days, target_hours, blocks, created_at, updated_at"
        ).eq("academic_year_id", academic_year_id).limit(1).execute()
        plan_created_at = None
        plan_updated_at = None
        if plan_resp.data and len(plan_resp.data) > 0:
            p = plan_resp.data[0]
            _start = p.get("start_date", year_data["start_date"])
            _end = p.get("end_date", year_data["end_date"])
            _th = p.get("target_hours")
            plan_summary = AcademicYearPlanSummary(
                start_date=_start.isoformat() if hasattr(_start, "isoformat") else str(_start),
                end_date=_end.isoformat() if hasattr(_end, "isoformat") else str(_end),
                constraint_mode=p.get("constraint_mode") or "days",
                target_days=p.get("target_days"),
                target_hours=None if _th is None else (float(_th) if math.isfinite(float(_th)) else None),
                blocks=p.get("blocks") or [],
            )
            plan_created_at = p.get("created_at")
            plan_updated_at = p.get("updated_at")
        
        log_event("academic_year.get.success", user_id=user["id"], academic_year_id=academic_year_id)
        
        # Build JSON-serializable response (avoid Pydantic/float NaN issues)
        def _str_date(v):
            if v is None:
                return ""
            return v.isoformat() if hasattr(v, "isoformat") else str(v)
        def _str_ts(v):
            if v is None:
                return None
            return v.isoformat() if hasattr(v, "isoformat") else str(v)
        year_start = year_data.get("start_date")
        year_end = year_data.get("end_date")
        payload = {
            "id": str(year_data.get("id", "")),
            "created_at": _str_ts(year_data.get("created_at")),
            "updated_at": _str_ts(year_data.get("updated_at")),
            "family_id": str(year_data.get("family_id", "")),
            "year_name": str(year_data.get("year_name", "")),
            "start_date": _str_date(year_start),
            "end_date": _str_date(year_end),
            "mode": year_data.get("mode"),
            "target_instructional_days": year_data.get("target_instructional_days"),
            "target_instructional_hours": year_data.get("target_instructional_hours"),
            "planned_hours_per_day": None if not year_data.get("planned_hours_per_day") else (float(year_data["planned_hours_per_day"]) if math.isfinite(float(year_data["planned_hours_per_day"])) else None),
            "allowed_weekdays": list(year_data.get("allowed_weekdays", [1, 2, 3, 4, 5])),
            "is_draft": bool(year_data.get("is_draft", False)),
            "holiday_settings": None if not holiday_settings else {
                "follow_global_holidays": holiday_settings.follow_global_holidays,
                "holiday_country_code": holiday_settings.holiday_country_code,
                "holiday_region": holiday_settings.holiday_region,
                "provider": holiday_settings.provider,
            },
            "holidays": [{"date": _str_date(h.get("date")), "name": h.get("name", ""), "type": h.get("type", "CUSTOM_HOLIDAY"), "source_id": h.get("source_id")} for h in holidays],
            "counts": {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in (counts or {}).items()},
            "plan": None if not plan_summary else {
                "start_date": plan_summary.start_date,
                "end_date": plan_summary.end_date,
                "constraint_mode": plan_summary.constraint_mode,
                "target_days": plan_summary.target_days,
                "target_hours": plan_summary.target_hours,
                "blocks": list(plan_summary.blocks) if plan_summary.blocks else [],
                "created_at": _str_ts(plan_created_at),
                "updated_at": _str_ts(plan_updated_at),
            },
        }
        try:
            body = json.dumps(payload, default=str)
        except (TypeError, ValueError) as e:
            log_event("academic_year.get.json_error", user_id=user["id"], error=str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Response serialization failed: {e}") from e
        # Return UTF-8 bytes so no encoding ambiguity; avoid cached/wrong body
        return Response(
            content=body.encode("utf-8"),
            media_type="application/json; charset=utf-8",
            headers={"Cache-Control": "no-store"},
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.get.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get academic year: {str(e)}"
        )


LESSONS_PER_DAY = 2


def _parse_time_to_iso(date_obj: date, time_str: str) -> str:
    """Build ISO timestamp: date + time_str (e.g. '09:00') -> YYYY-MM-DDTHH:MM:00+00:00"""
    parts = (time_str or "09:00").strip().split(":")
    h = int(parts[0]) if len(parts) >= 1 and parts[0].strip() else 9
    m = int(parts[1].split()[0]) if len(parts) >= 2 and parts[1] else 0
    h = max(0, min(23, h))
    m = max(0, min(59, m))
    return f"{date_obj.isoformat()}T{h:02d}:{m:02d}:00+00:00"


def _build_exclusion_ranges_for_apply(
    holiday_dates: set,
    custom_breaks: List[Dict],
) -> List[tuple]:
    """Build exclusion ranges from holiday_dates (set of date) and custom_breaks."""
    ranges = []
    for b in custom_breaks:
        try:
            start_d = date.fromisoformat(b.get("start", "")[:10])
            end_d = date.fromisoformat(b.get("end", "")[:10])
            ranges.append((start_d, end_d))
        except (ValueError, TypeError):
            pass
    for d in holiday_dates:
        ranges.append((d, d))
    return ranges


def _allowed_weekdays_from_blocks(blocks: List[Any]) -> List[int]:
    """Compute allowed_weekdays as union of all block weekdays. Used when persisting for block-driven flow."""
    weekdays = set()
    for b in blocks or []:
        wd = getattr(b, "weekdays", None) if hasattr(b, "weekdays") else (b.get("weekdays") if isinstance(b, dict) else None)
        wd = wd or []
        for w in wd:
            if isinstance(w, int) and 0 <= w <= 6:
                weekdays.add(w)
    return sorted(weekdays) if weekdays else [1, 2, 3, 4, 5]


def _build_holiday_dates_for_apply(
    start_date_obj: date,
    end_date_obj: date,
    follow_public_holidays: bool,
    holiday_region: Optional[str],
    custom_holidays: List[Dict],
    custom_breaks: List[Dict],
    supabase,
) -> set:
    """Build set of holiday dates for apply_to_calendar (custom + breaks expanded + global)."""
    holiday_dates = set()
    for ch in custom_holidays:
        holiday_dates.add(date.fromisoformat(ch["date"]))
    for br in custom_breaks:
        start_br = date.fromisoformat(br["start"])
        end_br = date.fromisoformat(br["end"])
        d = start_br
        while d <= end_br:
            holiday_dates.add(d)
            d += timedelta(days=1)
    if follow_public_holidays and holiday_region:
        country_code = holiday_region.split(":")[0] if ":" in holiday_region else holiday_region
        region_code = holiday_region.split(":")[1] if ":" in holiday_region and len(holiday_region.split(":")) > 1 else None
        years_to_fetch = {start_date_obj.year, end_date_obj.year}
        for year in years_to_fetch:
            global_holidays = fetch_global_holidays(
                country_code, year, "NAGER_DATE", region_code, None
            )
            for gh in global_holidays:
                if start_date_obj <= gh.date <= end_date_obj:
                    holiday_dates.add(gh.date)
    return holiday_dates


@router.post("/apply_to_calendar", response_model=ApplyToCalendarOutput)
async def apply_to_calendar(
    body: ApplyToCalendarInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Compute eligible instructional dates and create lesson placeholder events.
    Reuses recalc logic; optionally replaces existing placeholders for the academic year.
    """
    log_event("academic_year.apply_to_calendar.start", user_id=user["id"], family_id=body.family_id)
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Family ID mismatch")
        require_onboarding_complete(family_id)
        supabase = get_admin_client()
        start_date_obj = date.fromisoformat(body.start_date)
        end_date_obj = date.fromisoformat(body.end_date)
        if start_date_obj > end_date_obj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date must be <= end_date",
            )

        custom_holidays_dict = [{"date": h.date, "name": h.name, "type": getattr(h, "type", "CUSTOM_HOLIDAY")} for h in body.custom_holidays]
        custom_breaks_dict = [{"start": b.start, "end": b.end, "name": b.name} for b in body.custom_breaks]

        holiday_dates = _build_holiday_dates_for_apply(
            start_date_obj,
            end_date_obj,
            body.follow_public_holidays,
            body.holiday_region,
            custom_holidays_dict,
            custom_breaks_dict,
            supabase,
        )

        use_blocks = body.blocks and len(body.blocks) > 0
        allowed_weekdays_for_persist = (
            _allowed_weekdays_from_blocks(body.blocks) if use_blocks else body.allowed_weekdays
        )
        blocks_to_use: List[Dict[str, Any]] = []
        subject_rows: Dict[str, str] = {}
        family_child_ids: List[Any] = []

        if use_blocks:
            for b in body.blocks:
                block_id = b.block_id or str(uuid.uuid4())
                blocks_to_use.append({
                    "block_id": block_id,
                    "subject_id": b.subject_id,
                    "child_ids": list(b.child_ids) if b.child_ids else [],
                    "weekdays": list(b.weekdays) if b.weekdays else [1, 2, 3, 4, 5],
                    "start_time": b.start_time or "09:00",
                    "end_time": b.end_time or "10:00",
                    "all_day": b.all_day or False,
                })
            subject_ids_in_blocks = list({b["subject_id"] for b in blocks_to_use if b["subject_id"]})
            sub_resp = supabase.table("subject").select("id, name").eq("family_id", body.family_id).in_("id", subject_ids_in_blocks or ["__none__"]).execute()
            subject_rows = {str(r["id"]): r["name"] for r in (sub_resp.data or [])}
            for b in blocks_to_use:
                if b["subject_id"] and str(b["subject_id"]) not in subject_rows:
                    raise HTTPException(status_code=400, detail=f"Subject {b['subject_id']} is invalid or not in this family.")
            children_resp = supabase.table("children").select("id").eq("family_id", body.family_id).execute()
            family_child_ids = [r["id"] for r in (children_resp.data or [])]
        else:
            if not body.subjects:
                raise HTTPException(status_code=400, detail="At least one subject is required, or provide blocks.")
            sub_resp = supabase.table("subject").select("id, name").eq("family_id", body.family_id).in_("id", body.subjects).execute()
            subject_rows = {str(r["id"]): r["name"] for r in (sub_resp.data or [])}
            if len(subject_rows) < len(body.subjects):
                raise HTTPException(status_code=400, detail="One or more subject IDs are invalid or not in this family.")
            subject_ids_ordered = [s for s in body.subjects if str(s) in subject_rows]
            if not subject_ids_ordered:
                raise HTTPException(status_code=400, detail="No valid subjects.")
            eligible_dates = get_instructional_dates_list(
                start_date_obj, end_date_obj, body.allowed_weekdays, holiday_dates, limit=body.target_instructional_days
            )
            if len(eligible_dates) < body.target_instructional_days:
                raise HTTPException(
                    status_code=400,
                    detail=f"Not enough days. Eligible: {len(eligible_dates)}, target: {body.target_instructional_days}.",
                )
            planned_dates_legacy = eligible_dates[: body.target_instructional_days]

        exclusion_ranges = _build_exclusion_ranges_for_apply(holiday_dates, custom_breaks_dict) if use_blocks else []

        academic_year_id = body.academic_year_id
        if not academic_year_id:
            # insert().execute() returns inserted row(s) in .data (no .select() on insert builder in this client)
            year_row = (
                supabase.table("academic_years")
                .insert(
                    {
                        "family_id": body.family_id,
                        "year_name": f"{start_date_obj.year}-{end_date_obj.year}",
                        "start_date": body.start_date,
                        "end_date": body.end_date,
                        "is_draft": False,
                        "mode": "FIXED_END",
                        "allowed_weekdays": allowed_weekdays_for_persist,
                        "is_current": True,
                    }
                )
                .execute()
            )
            if year_row.data and len(year_row.data) > 0:
                academic_year_id = year_row.data[0]["id"]
            elif year_row.data and isinstance(year_row.data, dict):
                academic_year_id = year_row.data.get("id")
            if not academic_year_id:
                err_msg = getattr(year_row, "error", None) or getattr(year_row, "message", None) or "No id returned"
                log_event("academic_year.apply_to_calendar.error", user_id=user["id"], error=f"academic_year insert failed: {err_msg}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Could not create academic year. {str(err_msg)}",
                )

        generation_batch_id = str(uuid.uuid4())
        events_to_insert = []
        planned_dates_set = set()
        block_regen_results: List[BlockRegenResult] = []
        totals_updated, totals_inserted, totals_deleted = 0, 0, 0

        if use_blocks:
            # Block-aware regeneration: only touch placeholders for each block (no global delete)
            for block in blocks_to_use:
                subject_id = block["subject_id"]
                subject_name = subject_rows.get(str(subject_id), "Lesson")
                result = regen_block(
                    supabase,
                    body.family_id,
                    academic_year_id,
                    block,
                    start_date_obj,
                    end_date_obj,
                    exclusion_ranges,
                    generation_batch_id,
                    subject_name,
                    family_child_ids,
                    body.child_id,
                    log_event_fn=log_event,
                    user_id=user["id"],
                )
                block_regen_results.append(BlockRegenResult(
                    block_id=str(block["block_id"]),
                    updated=result["updated"],
                    inserted=result["inserted"],
                    deleted=result["deleted"],
                ))
                totals_updated += result["updated"]
                totals_inserted += result["inserted"]
                totals_deleted += result["deleted"]
                for d in get_block_occurrence_dates(block, start_date_obj, end_date_obj, exclusion_ranges):
                    planned_dates_set.add(d)
            created_count = totals_inserted
        else:
            # Legacy path: no blocks — use target days + subjects
            subject_index = 0
            for day_idx, d in enumerate(planned_dates_legacy):
                date_str = d.isoformat()
                planned_dates_set.add(d)
                for slot in range(LESSONS_PER_DAY):
                    subject_id = subject_ids_ordered[subject_index % len(subject_ids_ordered)]
                    subject_name = subject_rows.get(str(subject_id), "Lesson")
                    subject_index += 1
                    start_ts = f"{date_str}T09:00:00+00:00" if slot == 0 else f"{date_str}T10:00:00+00:00"
                    end_ts = f"{date_str}T09:45:00+00:00" if slot == 0 else f"{date_str}T10:45:00+00:00"
                    ev = {
                        "family_id": body.family_id,
                        "child_id": body.child_id,
                        "title": f"{subject_name} — Lesson",
                        "start_ts": start_ts,
                        "end_ts": end_ts,
                        "status": "scheduled",
                        "source": "system",
                        "event_type": "Lesson",
                        "subject_id": subject_id,
                        "is_placeholder": True,
                        "generated_by": "plan_year",
                        "academic_year_id": academic_year_id,
                        "generation_batch_id": generation_batch_id,
                        "counts_toward_plan": True,
                        "instructional_status": "PLAN_PLACEHOLDER",
                    }
                    events_to_insert.append(ev)

        if not use_blocks:
            created_count = 0
        if events_to_insert and not use_blocks:
            try:
                supabase.table("events").insert(events_to_insert).execute()
                created_count = len(events_to_insert)
            except Exception as bulk_err:
                err_str = str(bulk_err).lower()
                is_overlap = "overlap" in err_str or "p0001" in err_str
                if is_overlap:
                    # Inline conflict resolution: insert one-by-one, skip conflicting
                    for ev in events_to_insert:
                        try:
                            supabase.table("events").insert(ev).execute()
                            created_count += 1
                        except Exception:
                            pass  # skip this event (overlap or other)
                    log_event("academic_year.apply_to_calendar.conflicts_skipped", user_id=user["id"], created=created_count, skipped=len(events_to_insert) - created_count)
                else:
                    raise

        # Phase 3: Upsert academic_year_plan when using blocks (store constraint mode + target)
        if use_blocks and academic_year_id:
            if body.subject_targets is not None:
                validate_subject_targets(supabase, body.family_id, body.subject_targets)
            constraint_mode = body.constraint_mode if body.constraint_mode in ("days", "hours") else "days"
            plan_data = {
                "academic_year_id": academic_year_id,
                "family_id": body.family_id,
                "start_date": body.start_date,
                "end_date": body.end_date,
                "constraint_mode": constraint_mode,
                "target_days": body.target_days if constraint_mode == "days" else None,
                "target_hours": float(body.target_hours) if constraint_mode == "hours" and body.target_hours is not None else None,
                "blocks": [{"block_id": b["block_id"], "subject_id": b["subject_id"], "child_ids": b.get("child_ids", []), "weekdays": b.get("weekdays", [1, 2, 3, 4, 5]), "start_time": b.get("start_time", "09:00"), "end_time": b.get("end_time", "10:00"), "all_day": b.get("all_day", False)} for b in blocks_to_use],
                "current_generation_id": generation_batch_id,
                "updated_at": datetime.now().isoformat(),
            }
            if body.subject_targets is not None:
                plan_data["subject_targets"] = body.subject_targets
            supabase.table("academic_year_plan").upsert(plan_data, on_conflict="academic_year_id").execute()
            # Persist allowed_weekdays derived from blocks so GET /academic_year counts stay consistent
            supabase.table("academic_years").update({"allowed_weekdays": allowed_weekdays_for_persist}).eq("id", academic_year_id).execute()

        planned_days = len(planned_dates_set)
        log_event("academic_year.apply_to_calendar.success", user_id=user["id"], created=created_count, planned_days=planned_days)

        return ApplyToCalendarOutput(
            created=created_count,
            generation_batch_id=generation_batch_id,
            planned_days=planned_days,
            academic_year_id=academic_year_id,
            blocks=block_regen_results if use_blocks else None,
            totals={"updated": totals_updated, "inserted": totals_inserted, "deleted": totals_deleted} if use_blocks else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.apply_to_calendar.error", user_id=user["id"], error=str(e))
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply to calendar: {str(e)}",
        )
