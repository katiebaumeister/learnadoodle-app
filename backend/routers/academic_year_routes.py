"""
FastAPI routes for Academic Year Planning (Plan Year feature)

Supports:
- Non-homeschool fast path (defaults + typical holidays)
- Homeschool constraint solver (pick 3 vars, compute 4th)
- Global holiday subscription ("follow global holidays") + custom holidays
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user
from logger import log_event
from supabase_client import get_admin_client
from services.year_calculator import recalculate_year, CalculationMode
from services.holiday_providers import fetch_global_holidays, HolidayProvider

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


# ============================================================
# Helper Functions
# ============================================================

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
            holidays.append({
                "date": h["holiday_date"],
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


async def sync_global_holidays_internal(
    supabase,
    academic_year_id: str,
    family_id: str,
    user_id: str
):
    """Internal helper to sync global holidays"""
    # Get holiday settings
    settings_resp = supabase.table("academic_year_holiday_settings").select("*").eq(
        "academic_year_id", academic_year_id
    ).single().execute()
    
    if not settings_resp.data or not settings_resp.data.get("follow_global_holidays"):
        return  # Global holidays not enabled
    
    settings = settings_resp.data
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


@router.get("/{academic_year_id}", response_model=AcademicYearResponse)
async def get_academic_year(
    academic_year_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get academic year with holiday settings, holidays, and counts.
    """
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
        
        # Get holiday settings
        settings_resp = supabase.table("academic_year_holiday_settings").select("*").eq(
            "academic_year_id", academic_year_id
        ).single().execute()
        
        holiday_settings = None
        if settings_resp.data:
            holiday_settings = HolidaySettings(
                follow_global_holidays=settings_resp.data.get("follow_global_holidays", False),
                holiday_country_code=settings_resp.data.get("holiday_country_code"),
                holiday_region=settings_resp.data.get("holiday_region"),
                provider=settings_resp.data.get("provider", "NAGER_DATE")
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
        
        log_event("academic_year.get.success", user_id=user["id"], academic_year_id=academic_year_id)
        
        return AcademicYearResponse(
            id=year_data["id"],
            family_id=year_data["family_id"],
            year_name=year_data["year_name"],
            start_date=year_data["start_date"],
            end_date=year_data["end_date"],
            mode=year_data.get("mode"),
            target_instructional_days=year_data.get("target_instructional_days"),
            target_instructional_hours=year_data.get("target_instructional_hours"),
            planned_hours_per_day=float(year_data["planned_hours_per_day"]) if year_data.get("planned_hours_per_day") else None,
            allowed_weekdays=year_data.get("allowed_weekdays", [1, 2, 3, 4, 5]),
            is_draft=year_data.get("is_draft", False),
            holiday_settings=holiday_settings,
            holidays=[HolidayEntry(**h) for h in holidays],
            counts=counts
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.get.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get academic year: {str(e)}"
        )
