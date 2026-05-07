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
from typing import List, Optional, Dict, Any, Tuple, Callable
from datetime import date, datetime, timedelta, timezone, time
from collections import defaultdict
import math
import json
from dateutil import parser as date_parser

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # type: ignore
import sys
import traceback
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter, rate_limiter_relaxed
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
    excluded_holiday_dates: Optional[List[str]] = None  # YYYY-MM-DD dates to exclude from global list


class RecalculateInput(BaseModel):
    academic_year_id: Optional[str] = None  # None for preview/draft
    family_school_year_id: Optional[str] = None
    family_school_term_id: Optional[str] = None
    term_id: Optional[str] = None
    run_scope_type: Optional[str] = "full_year"  # full_year | term
    school_duration_scope: Optional[str] = None  # full_year | fall_term | spring_term | custom_duration
    use_defaults: Optional[bool] = True
    defaults_snapshot_json: Optional[Dict[str, Any]] = None
    effective_config_json: Optional[Dict[str, Any]] = None
    overrides_json: Optional[Dict[str, Any]] = None
    mode: str  # FIXED_END | TARGET_DAYS | TARGET_HOURS
    start_date: str  # YYYY-MM-DD
    end_date: Optional[str] = None  # Required for FIXED_END
    target_instructional_days: Optional[int] = None  # Required for TARGET_DAYS
    target_instructional_hours: Optional[int] = None  # Required for TARGET_HOURS
    planned_hours_per_day: Optional[float] = None  # Required for TARGET_HOURS
    allowed_weekdays: List[int] = Field(default=[1, 2, 3, 4, 5])  # Mon-Fri default
    holiday_settings: Optional[HolidaySettings] = None
    custom_holidays: List[HolidayEntry] = []
    year_name: Optional[str] = None  # Display name e.g. "Lilly · Math · Feb 26 – Mar 26, 2026"


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
    """Block schema: subject + weekdays + time range + children. block_id optional. subject_id optional for generic/placeholder blocks."""
    block_id: Optional[str] = None
    subject_id: Optional[str] = None  # null = generic "Learning block" slot
    placeholder_label: Optional[str] = None  # display title when subject_id is null
    child_ids: List[str] = []
    weekdays: List[int] = [1, 2, 3, 4, 5]  # 0=Sun, 1=Mon, ..., 6=Sat
    start_time: str = "09:00"
    end_time: str = "10:00"
    all_day: bool = False


class ApplyToCalendarInput(BaseModel):
    academic_year_id: Optional[str] = None
    family_school_year_id: Optional[str] = None
    family_school_term_id: Optional[str] = None
    term_id: Optional[str] = None
    run_scope_type: Optional[str] = "full_year"  # full_year | term
    school_duration_scope: Optional[str] = None  # full_year | fall_term | spring_term | custom_duration
    use_defaults: Optional[bool] = True
    defaults_snapshot_json: Optional[Dict[str, Any]] = None
    effective_config_json: Optional[Dict[str, Any]] = None
    overrides_json: Optional[Dict[str, Any]] = None
    family_id: str
    start_date: str
    end_date: str
    allowed_weekdays: List[int] = [1, 2, 3, 4, 5]
    follow_public_holidays: bool = True
    holiday_region: Optional[str] = None  # e.g. "US" or "US:NATIONAL"
    excluded_holiday_dates: Optional[List[str]] = None  # YYYY-MM-DD to exclude from global holidays
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
    year_name: Optional[str] = None  # Display name e.g. "Lilly · Math · Feb 26 – Mar 26, 2026"
    timezone: Optional[str] = None  # IANA timezone from client (e.g. America/New_York) when family timezone not set
    force_new_plan: bool = False  # When True, always create a new academic year (do not reuse same start/end)
    apply_from_date: Optional[str] = None  # YYYY-MM-DD: when set, only regenerate block events from this date forward (edit-plan behavior)
    attendance_tracking_mode: Optional[str] = None  # 'subject' | 'class_day'


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
    totals: Optional[Dict[str, int]] = None  # updated, inserted, deleted


class SchedulePotentialInput(BaseModel):
    family_id: str
    start_date: str
    end_date: str
    blocks: List[BlockEntry] = []
    custom_holidays: List[HolidayEntry] = []
    custom_breaks: List[CustomBreakEntry] = []
    follow_public_holidays: Optional[bool] = False
    holiday_region: Optional[str] = None  # e.g. "US" or "US:ca"
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
    suggested_end_date: Optional[str] = None  # exact date that yields exactly target_days (0 over/under)
    per_subject: Optional[Dict[str, Dict[str, Any]]] = None  # subject_id -> { projected_days, suggested_end_date, ... }
    per_child: Optional[Dict[str, Dict[str, Any]]] = None  # child_id -> { projected_days, suggested_end_date } (child-aware)
    per_child_subject: Optional[Dict[str, Dict[str, Dict[str, Any]]]] = None  # child_id -> subject_id -> { projected_days, occurrence_dates_sorted }
    days_excluded_holidays: Optional[int] = None  # when follow_public_holidays: count of eligible days excluded due to (global) holidays
    cadence_suggestion: Optional[Dict[str, Any]] = None  # Phase 4: { min_weekdays_per_week, eligible_days_in_range, message }


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
    end_date: Optional[str] = None  # plan end date for fix-it impact preview
    suggested_end_date: Optional[str] = None  # exact date for 0 days over/under (from blocks)
    max_extra_days_per_week: Optional[int] = None  # 5 - distinct weekdays already in blocks (Mon–Fri only); 0 if already M–F
    manual_events_days: Optional[int] = None
    manual_events_hours: Optional[float] = None
    per_child: Optional[Dict[str, Dict[str, Any]]] = None
    per_child_subject: Optional[Dict[str, Dict[str, Dict[str, Any]]]] = None  # child_id -> subject_id -> { planned_days, subject_target_days, subject_delta_days, ... }
    subject_targets: Optional[Dict[str, Dict[str, Any]]] = None  # subject_id -> { target_days, target_hours } for client/schedule potential
    planning_mode: Optional[str] = None  # HOMESCHOOL_COMPLIANCE | AFTERSCHOOL_GOALS | NONE


class AttendanceModeSwitchRiskOutput(BaseModel):
    has_subject_plan_events: bool
    has_grades_or_outcomes: bool
    has_transcript_artifacts: bool
    is_data_rich: bool
    # No-requirement mode: baseline from first apply, current count, and example deleted date for UI message
    baseline_scheduled_days: Optional[int] = None
    current_scheduled_days: Optional[int] = None
    deleted_dates: Optional[List[str]] = None  # date strings (YYYY-MM-DD) that had a lesson deleted


class ApplyFixSuggestionInput(BaseModel):
    family_id: str
    suggestion_type: str  # 'extra_day_per_week' | 'extra_days_per_week' | 'extend_end_date' | 'catch_up_week'
    params: Optional[Dict[str, Any]] = None


class FixTargetGapInput(BaseModel):
    academic_year_id: str
    scope: str = "overall"  # overall | per_subject
    subject_id: Optional[str] = None
    subject_ids: Optional[List[str]] = None
    range_start_ymd: Optional[str] = None
    range_end_ymd: Optional[str] = None
    visible_projected_days: Optional[int] = None
    visible_gap_days: Optional[int] = None
    visible_projected_hours: Optional[float] = None
    visible_gap_hours: Optional[float] = None
    target_kind: str = "days"  # days | hours
    target_value: float
    mode: str = "fill_to_zero"
    strict_range: bool = False
    enforce_conflict_checks: bool = False
    timezone: Optional[str] = None  # IANA timezone from client (e.g. America/New_York)
    dry_run: bool = False


class FixTargetGapOutput(BaseModel):
    success: bool = True
    academic_year_id: str
    scope: str
    subject_id: Optional[str] = None
    target_kind: str
    target_value: float
    beforeProjectedDays: Optional[int] = None
    afterProjectedDays: Optional[int] = None
    beforeGapDays: Optional[int] = None
    afterGapDays: Optional[int] = None
    beforeProjectedHours: Optional[float] = None
    afterProjectedHours: Optional[float] = None
    beforeGapHours: Optional[float] = None
    afterGapHours: Optional[float] = None
    createdEvents: int = 0
    removedEvents: int = 0
    createdEventIds: List[str] = []
    removedEventIds: List[str] = []
    debugDaysNeeded: Optional[int] = None
    debugCandidateDatesCount: Optional[int] = None
    debugSelectedDatesCount: Optional[int] = None
    debugPotentialSelectedCount: Optional[int] = None
    debugInsertedCount: Optional[int] = None
    debugSelectedSlots: Optional[List[Dict[str, Any]]] = None
    debugFailureReason: Optional[str] = None
    debugInitialRangeEnd: Optional[str] = None
    debugFinalRangeEnd: Optional[str] = None
    requestedGap: Optional[int] = None
    assignedCount: Optional[int] = None
    insertedCount: Optional[int] = None
    attemptedInsertCount: Optional[int] = None
    successfulInsertCount: Optional[int] = None
    failedInsertCount: Optional[int] = None
    failedInsertReasons: Optional[Dict[str, int]] = None
    datesWithCapacity: Optional[int] = None
    datesWithoutCapacity: Optional[int] = None
    unassignedCount: Optional[int] = None
    skippedBecauseNoSlot: Optional[int] = None
    selectedAssignments: Optional[List[Dict[str, Any]]] = None
    assignmentStrategy: Optional[str] = None
    selectedDates: Optional[List[str]] = None
    partialFixPossible: Optional[bool] = None
    availableDates: Optional[int] = None
    remainingUnfixableGap: Optional[int] = None
    maxAchievableDays: Optional[int] = None
    message: Optional[str] = None


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
    attendance_tracking_mode: Optional[str] = "subject"
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


def resolve_school_scope(
    supabase,
    family_id: str,
    run_scope_type: Optional[str],
    family_school_year_id: Optional[str],
    family_school_term_id: Optional[str],
    term_id: Optional[str],
    start_date_obj: Optional[date],
    end_date_obj: Optional[date],
) -> Dict[str, Any]:
    """
    Validate/resolve year-term scope invariants.
    - run_scope_type='term' requires a term id and, when dates are provided, date range contained in the term.
    - run_scope_type='full_year' must not include a term id.
    - family_school_year_id / family_school_term_id must belong to this family.
    Returns normalized ids + validated scope.
    """
    scope = (run_scope_type or "full_year").strip().lower()
    if scope not in {"full_year", "term"}:
        raise HTTPException(status_code=400, detail="run_scope_type must be 'full_year' or 'term'.")

    selected_term_id = family_school_term_id or term_id
    if scope == "full_year" and selected_term_id:
        raise HTTPException(status_code=400, detail="term_id must be null when run_scope_type is 'full_year'.")
    if scope == "term" and not selected_term_id:
        raise HTTPException(status_code=400, detail="term_id is required when run_scope_type is 'term'.")

    resolved_year_id = family_school_year_id
    resolved_term_id = None
    term_row = None

    if selected_term_id:
        term_resp = (
            supabase.table("family_school_terms")
            .select("id, family_school_year_id, name, start_date, end_date")
            .eq("id", selected_term_id)
            .maybe_single()
            .execute()
        )
        term_row = term_resp.data
        if not term_row:
            raise HTTPException(status_code=400, detail="Selected term was not found.")
        resolved_term_id = term_row["id"]
        term_year_id = term_row.get("family_school_year_id")
        if resolved_year_id and str(resolved_year_id) != str(term_year_id):
            raise HTTPException(status_code=400, detail="Selected term does not belong to selected school year.")
        resolved_year_id = term_year_id
        term_start = date.fromisoformat(str(term_row["start_date"])[:10])
        term_end = date.fromisoformat(str(term_row["end_date"])[:10])
        if start_date_obj and end_date_obj and (start_date_obj < term_start or end_date_obj > term_end):
            raise HTTPException(
                status_code=400,
                detail="Term-scoped plan date range must be within the selected term date range.",
            )

    year_row = None
    if resolved_year_id:
        year_resp = (
            supabase.table("family_school_years")
            .select("id, family_id, start_date, end_date")
            .eq("id", resolved_year_id)
            .maybe_single()
            .execute()
        )
        year_row = year_resp.data
        if not year_row:
            raise HTTPException(status_code=400, detail="Selected school year was not found.")
        if str(year_row.get("family_id")) != str(family_id):
            raise HTTPException(status_code=403, detail="Selected school year does not belong to this family.")
    if term_row and year_row and str(term_row.get("family_school_year_id")) != str(year_row.get("id")):
        raise HTTPException(status_code=400, detail="Selected term/school year relation is invalid.")

    return {
        "run_scope_type": scope,
        "family_school_year_id": resolved_year_id,
        "family_school_term_id": resolved_term_id,
        "family_school_year_start_date": (year_row or {}).get("start_date"),
        "family_school_year_end_date": (year_row or {}).get("end_date"),
        "family_school_term_start_date": (term_row or {}).get("start_date"),
        "family_school_term_end_date": (term_row or {}).get("end_date"),
    }


def resolve_run_dates_for_scope(
    scope_data: Dict[str, Any],
    school_duration_scope: Optional[str],
    use_defaults: Optional[bool],
    client_start_date_obj: date,
    client_end_date_obj: date,
) -> Dict[str, Any]:
    """
    Resolve authoritative run date range.
    - defaults unchecked: trust client-selected range.
    - custom_duration: trust client-selected range.
    - term-scoped runs: use selected term boundaries.
    - full_year/fall_term/spring_term: derive from selected family school year.
    """
    duration_scope = (school_duration_scope or "").strip().lower()
    if use_defaults is False or duration_scope in {"", "custom_duration"}:
        if client_start_date_obj > client_end_date_obj:
            raise HTTPException(status_code=400, detail="start_date must be <= end_date")
        return {
            "start_date_obj": client_start_date_obj,
            "end_date_obj": client_end_date_obj,
            "date_source": (
                "client_manual_override"
                if use_defaults is False
                else ("client_custom_duration" if duration_scope == "custom_duration" else "client_legacy")
            ),
        }

    term_start_raw = scope_data.get("family_school_term_start_date")
    term_end_raw = scope_data.get("family_school_term_end_date")
    if scope_data.get("run_scope_type") == "term" and term_start_raw and term_end_raw:
        term_start = date.fromisoformat(str(term_start_raw)[:10])
        term_end = date.fromisoformat(str(term_end_raw)[:10])
        return {
            "start_date_obj": term_start,
            "end_date_obj": term_end,
            "date_source": "term_bounds",
        }

    year_start_raw = scope_data.get("family_school_year_start_date")
    year_end_raw = scope_data.get("family_school_year_end_date")
    if not year_start_raw or not year_end_raw:
        raise HTTPException(
            status_code=400,
            detail="Selected school year is required to derive dates from duration scope.",
        )

    year_start = date.fromisoformat(str(year_start_raw)[:10])
    year_end = date.fromisoformat(str(year_end_raw)[:10])
    school_start_year = year_start.year

    if duration_scope == "full_year":
        resolved_start = year_start
        resolved_end = year_end
    elif duration_scope == "fall_term":
        resolved_start = date(school_start_year, 8, 1)
        resolved_end = date(school_start_year, 12, 31)
    elif duration_scope == "spring_term":
        resolved_start = date(school_start_year + 1, 1, 1)
        resolved_end = date(school_start_year + 1, 5, 1)
    else:
        raise HTTPException(
            status_code=400,
            detail="school_duration_scope must be one of full_year, fall_term, spring_term, custom_duration.",
        )

    if resolved_start > resolved_end:
        raise HTTPException(status_code=400, detail="Resolved date range is invalid.")

    return {
        "start_date_obj": resolved_start,
        "end_date_obj": resolved_end,
        "date_source": f"scope_{duration_scope}",
    }


def with_scope_validation_audit(
    effective_config_json: Optional[Dict[str, Any]],
    scope_data: Dict[str, Any],
    source: str,
) -> Dict[str, Any]:
    """
    Ensure effective_config_json always includes a stable scope-validation audit marker.
    """
    base = effective_config_json.copy() if isinstance(effective_config_json, dict) else {}
    base["scope_validation"] = {
        "version": "v1",
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "run_scope_type": scope_data.get("run_scope_type"),
        "family_school_year_id": scope_data.get("family_school_year_id"),
        "family_school_term_id": scope_data.get("family_school_term_id"),
    }
    return base


def deep_merge_dict(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(base or {})
    for k, v in (override or {}).items():
        if (
            k in out
            and isinstance(out[k], dict)
            and isinstance(v, dict)
        ):
            out[k] = deep_merge_dict(out[k], v)
        else:
            out[k] = v
    return out


def resolve_effective_config_server(
    supabase,
    scope_data: Dict[str, Any],
    use_defaults: Optional[bool],
    defaults_snapshot_json: Optional[Dict[str, Any]],
    overrides_json: Optional[Dict[str, Any]],
    effective_config_json: Optional[Dict[str, Any]],
    legacy_config: Optional[Dict[str, Any]],
    source: str,
) -> Dict[str, Any]:
    """
    Backend source-of-truth resolver:
    school-year defaults -> term overrides -> run overrides -> explicit legacy fields.
    Returns normalized defaults snapshot + effective config with audit metadata.
    """
    year_defaults = {}
    term_overrides = {}

    school_year_id = scope_data.get("family_school_year_id")
    if school_year_id:
        year_resp = (
            supabase.table("family_school_years")
            .select("year_defaults_json")
            .eq("id", school_year_id)
            .maybe_single()
            .execute()
        )
        row = year_resp.data or {}
        if isinstance(row.get("year_defaults_json"), dict):
            year_defaults = row.get("year_defaults_json") or {}

    term_id = scope_data.get("family_school_term_id")
    if term_id:
        term_resp = (
            supabase.table("family_school_terms")
            .select("term_overrides_json")
            .eq("id", term_id)
            .maybe_single()
            .execute()
        )
        row = term_resp.data or {}
        if isinstance(row.get("term_overrides_json"), dict):
            term_overrides = row.get("term_overrides_json") or {}

    resolved_defaults = deep_merge_dict(year_defaults, term_overrides)
    run_overrides = overrides_json if isinstance(overrides_json, dict) else {}
    legacy = legacy_config if isinstance(legacy_config, dict) else {}
    client_effective = effective_config_json if isinstance(effective_config_json, dict) else {}

    effective = deep_merge_dict(resolved_defaults, run_overrides)
    effective = deep_merge_dict(effective, legacy)
    # Preserve unknown client keys, but keep backend-resolved values authoritative.
    effective = deep_merge_dict(client_effective, effective)

    defaults_snapshot = (
        defaults_snapshot_json
        if isinstance(defaults_snapshot_json, dict)
        else {
            "school_year_defaults": year_defaults,
            "term_overrides": term_overrides,
            "resolved_defaults": resolved_defaults,
        }
    )
    if isinstance(defaults_snapshot, dict):
        defaults_snapshot["resolved_defaults"] = resolved_defaults

    if use_defaults is False:
        # Keep snapshot useful for auditing even when defaults are unchecked.
        defaults_snapshot = defaults_snapshot or {}

    effective = with_scope_validation_audit(
        effective_config_json=effective,
        scope_data=scope_data,
        source=source,
    )
    return {
        "defaults_snapshot_json": defaults_snapshot,
        "effective_config_json": effective,
        "resolved_defaults": resolved_defaults,
    }


def get_holidays_for_year(
    supabase,
    academic_year_id: str,
    include_global: bool = False,
    country_code: Optional[str] = None,
    region: Optional[str] = None,
    provider: str = "NAGER_DATE",
    excluded_holiday_dates: Optional[List[str]] = None,
) -> List[Dict]:
    """Get all holidays for an academic year (custom + optionally global). Excluded dates are not included from global list."""
    holidays = []
    excluded_set = set(excluded_holiday_dates or [])

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
                    date_str = gh.date.isoformat()
                    if date_str in excluded_set:
                        continue
                    # Only include if within academic year range
                    if start_date <= gh.date <= end_date:
                        # Check if already exists (by source_id)
                        if not any(h.get("source_id") == gh.source_id for h in holidays):
                            holidays.append({
                                "date": date_str,
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
        start_str = start_date.isoformat()
        end_str = end_date.isoformat()

        # Reuse existing default year with same range so we don't create duplicate chips when user reopens Plan Year
        existing = (
            supabase.table("academic_years")
            .select("id")
            .eq("family_id", family_id)
            .eq("start_date", start_str)
            .eq("end_date", end_str)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            academic_year_id = existing.data[0]["id"]
        else:
            year_resp = supabase.table("academic_years").insert({
                "family_id": family_id,
                "year_name": f"{start_year}-{start_year + 1}",
                "start_date": start_str,
                "end_date": end_str,
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
        
        # Create or update holiday settings with global holidays enabled (US default)
        supabase.table("academic_year_holiday_settings").upsert({
            "academic_year_id": academic_year_id,
            "follow_global_holidays": True,
            "holiday_country_code": "US",
            "provider": "NAGER_DATE"
        }, on_conflict="academic_year_id").execute()
        
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
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        start_date_obj = date.fromisoformat(body.start_date)
        end_date_obj = date.fromisoformat(body.end_date) if body.end_date else None
        holiday_settings_local = body.holiday_settings
        recalc_mode = body.mode
        target_days_local = body.target_instructional_days
        target_hours_local = body.target_instructional_hours
        planned_hours_per_day_local = body.planned_hours_per_day

        if body.family_school_year_id or body.family_school_term_id or body.term_id:
            scope_data = resolve_school_scope(
                supabase=supabase,
                family_id=family_id,
                run_scope_type=body.run_scope_type,
                family_school_year_id=body.family_school_year_id,
                family_school_term_id=body.family_school_term_id,
                term_id=body.term_id,
                start_date_obj=start_date_obj,
                end_date_obj=end_date_obj or start_date_obj,
            )
            resolved_config = resolve_effective_config_server(
                supabase=supabase,
                scope_data=scope_data,
                use_defaults=body.use_defaults,
                defaults_snapshot_json=body.defaults_snapshot_json,
                overrides_json=body.overrides_json,
                effective_config_json=body.effective_config_json,
                legacy_config={},
                source="academic_year.recalculate",
            )
            resolved_defaults = resolved_config.get("resolved_defaults") or {}
            if body.use_defaults:
                hs = resolved_defaults.get("holiday_settings") if isinstance(resolved_defaults, dict) else None
                if isinstance(hs, dict):
                    holiday_settings_local = HolidaySettings(
                        follow_global_holidays=bool(hs.get("follow_global_holidays", False)),
                        holiday_country_code=hs.get("holiday_country_code"),
                        holiday_region=hs.get("holiday_region"),
                        provider=hs.get("provider") or "NAGER_DATE",
                        excluded_holiday_dates=hs.get("excluded_holiday_dates") or [],
                    )
                planning = resolved_defaults.get("planning") if isinstance(resolved_defaults, dict) else None
                if isinstance(planning, dict):
                    if target_days_local is None and planning.get("target_days") is not None:
                        target_days_local = int(planning.get("target_days"))
                    if target_hours_local is None and planning.get("target_hours") is not None:
                        target_hours_local = int(planning.get("target_hours"))
        
        # Get holidays (custom + global if enabled)
        holiday_dates = set()
        
        if body.academic_year_id:
            # Get existing holidays
            holidays = get_holidays_for_year(
                supabase,
                body.academic_year_id,
                include_global=holiday_settings_local.follow_global_holidays if holiday_settings_local else False,
                country_code=holiday_settings_local.holiday_country_code if holiday_settings_local else None,
                region=holiday_settings_local.holiday_region if holiday_settings_local else None,
                provider=holiday_settings_local.provider if holiday_settings_local else "NAGER_DATE"
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
            if holiday_settings_local and holiday_settings_local.follow_global_holidays:
                if end_date_obj:
                    years_to_fetch = set([start_date_obj.year, end_date_obj.year])
                else:
                    years_to_fetch = {start_date_obj.year}
                
                for year in years_to_fetch:
                    global_holidays = fetch_global_holidays(
                        holiday_settings_local.holiday_country_code or "US",
                        year,
                        holiday_settings_local.provider,
                        holiday_settings_local.holiday_region,
                        None
                    )
                    
                    for gh in global_holidays:
                        if start_date_obj <= gh.date:
                            if not end_date_obj or gh.date <= end_date_obj:
                                holiday_dates.add(gh.date)
        
        # Call calculation engine
        result = recalculate_year(
            mode=recalc_mode,
            start_date=start_date_obj,
            end_date=end_date_obj,
            target_instructional_days=target_days_local,
            target_instructional_hours=target_hours_local,
            planned_hours_per_day=planned_hours_per_day_local,
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
        
        # Parse client dates (used directly only for custom duration; otherwise backend derives).
        client_start_date_obj = date.fromisoformat(body.start_date)
        client_end_date_obj = date.fromisoformat(body.end_date) if body.end_date else client_start_date_obj
        duration_scope = (body.school_duration_scope or "").strip().lower()

        scope_data = resolve_school_scope(
            supabase=supabase,
            family_id=family_id,
            run_scope_type=body.run_scope_type,
            family_school_year_id=body.family_school_year_id,
            family_school_term_id=body.family_school_term_id,
            term_id=body.term_id,
            start_date_obj=client_start_date_obj if duration_scope in {"", "custom_duration"} else None,
            end_date_obj=client_end_date_obj if duration_scope in {"", "custom_duration"} else None,
        )
        resolved_dates = resolve_run_dates_for_scope(
            scope_data=scope_data,
            school_duration_scope=body.school_duration_scope,
            use_defaults=body.use_defaults,
            client_start_date_obj=client_start_date_obj,
            client_end_date_obj=client_end_date_obj,
        )
        start_date_obj = resolved_dates["start_date_obj"]
        end_date_obj = resolved_dates["end_date_obj"]
        
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
        if not end_date_obj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="end_date is required after recalculation.",
            )

        custom_holidays_dict = [{"date": h.date, "name": h.name, "type": getattr(h, "type", "CUSTOM_HOLIDAY")} for h in body.custom_holidays]
        custom_breaks_dict = [{"start": b.start, "end": b.end, "name": b.name} for b in body.custom_breaks]

        resolved_config = resolve_effective_config_server(
            supabase=supabase,
            scope_data=scope_data,
            use_defaults=body.use_defaults,
            defaults_snapshot_json=body.defaults_snapshot_json,
            overrides_json=body.overrides_json,
            effective_config_json=body.effective_config_json,
            legacy_config={
                "calendar": {
                    "mode": body.mode,
                    "start_date": start_date_obj.isoformat(),
                    "end_date": end_date_obj.isoformat(),
                },
                "planning": {
                    "constraint_mode": body.mode.lower().replace("target_", "").replace("fixed_end", "days"),
                    "target_days": body.target_instructional_days,
                    "target_hours": body.target_instructional_hours,
                    "planned_hours_per_day": body.planned_hours_per_day,
                },
                "holiday_settings": {
                    "follow_global_holidays": body.holiday_settings.follow_global_holidays if body.holiday_settings else False,
                    "holiday_country_code": body.holiday_settings.holiday_country_code if body.holiday_settings else None,
                    "holiday_region": body.holiday_settings.holiday_region if body.holiday_settings else None,
                    "provider": body.holiday_settings.provider if body.holiday_settings else "NAGER_DATE",
                    "excluded_holiday_dates": body.holiday_settings.excluded_holiday_dates if body.holiday_settings else [],
                },
                "custom_holidays": [
                    {"date": h.date, "name": h.name, "type": h.type}
                    for h in (body.custom_holidays or [])
                ],
            },
            source="academic_year.save",
        )
        effective_config_json = resolved_config["effective_config_json"]
        defaults_snapshot_json = resolved_config["defaults_snapshot_json"]
        
        # Upsert academic year
        year_name = (body.year_name and body.year_name.strip()) or f"{start_date_obj.year}-{end_date_obj.year}"
        year_data = {
            "family_id": family_id,
            "year_name": year_name,
            "start_date": start_date_obj.isoformat(),
            "end_date": end_date_obj.isoformat(),
            "mode": body.mode,
            "target_instructional_days": body.target_instructional_days,
            "target_instructional_hours": body.target_instructional_hours,
            "planned_hours_per_day": body.planned_hours_per_day,
            "allowed_weekdays": body.allowed_weekdays,
            "is_draft": False,
            "family_school_year_id": scope_data["family_school_year_id"],
            "family_school_term_id": scope_data["family_school_term_id"],
            "run_scope_type": scope_data["run_scope_type"],
            "use_defaults": True if body.use_defaults is None else bool(body.use_defaults),
            "defaults_snapshot_json": defaults_snapshot_json,
            "effective_config_json": effective_config_json,
            "overrides_json": body.overrides_json,
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
                "provider": body.holiday_settings.provider,
                "excluded_holiday_dates": body.holiday_settings.excluded_holiday_dates or [],
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
    academic_year_id_param: Optional[str] = Query(None, alias="academic_year_id", description="If provided, health for this plan only; otherwise most recently updated plan"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter_relaxed),
):
    """
    Compute plan health (actual compliance) from events in DB.
    When academic_year_id is provided, uses that plan only. Otherwise uses the family's most recent academic year.
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
        base_query = (
            supabase.table("academic_year_plan")
            .select("id, academic_year_id, family_id, start_date, end_date, constraint_mode, target_days, target_hours, planning_mode, subject_targets, blocks, baseline_scheduled_days, baseline_scheduled_dates")
            .eq("family_id", family_id)
        )
        if academic_year_id_param:
            base_query = base_query.eq("academic_year_id", academic_year_id_param)
        else:
            base_query = base_query.order("updated_at", desc=True).limit(1)
        try:
            plan_resp = base_query.execute()
        except Exception:
            try:
                fallback = (
                    supabase.table("academic_year_plan")
                    .select("id, academic_year_id, family_id, start_date, end_date, constraint_mode, target_days, target_hours, planning_mode, blocks")
                    .eq("family_id", family_id)
                )
                if academic_year_id_param:
                    fallback = fallback.eq("academic_year_id", academic_year_id_param)
                else:
                    fallback = fallback.order("updated_at", desc=True).limit(1)
                plan_resp = fallback.execute()
            except Exception:
                fallback2 = (
                    supabase.table("academic_year_plan")
                    .select("id, academic_year_id, family_id, start_date, end_date, constraint_mode, target_days, target_hours, blocks")
                    .eq("family_id", family_id)
                )
                if academic_year_id_param:
                    fallback2 = fallback2.eq("academic_year_id", academic_year_id_param)
                else:
                    fallback2 = fallback2.order("updated_at", desc=True).limit(1)
                plan_resp = fallback2.execute()
        if not plan_resp.data or len(plan_resp.data) == 0:
            print("[BACKEND] plan_health: no plan found for family, returning plan_exists=False", flush=True)
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
        # Phase 3: include instructional_status, instructional_day_credit for unified compliance (fallback if columns missing)
        try:
            ev_resp = (
                supabase.table("events")
                .select(
                    "id, start_ts, end_ts, event_type, status, deleted_at, counts_toward_plan, "
                    "academic_year_id, child_id, child_ids, subject_id, instructional_minutes, instructional_day_credit, "
                    "instructional_status, is_placeholder, generated_by"
                )
                .eq("family_id", family_id)
                .eq("academic_year_id", academic_year_id)
                .is_("deleted_at", None)
                .gte("start_ts", plan["start_date"] + "T00:00:00")
                .lt("start_ts", end_next + "T00:00:00")
                .execute()
            )
            events = ev_resp.data or []
        except Exception:
            ev_resp = (
                supabase.table("events")
                .select(
                    "id, start_ts, end_ts, event_type, status, deleted_at, counts_toward_plan, "
                    "academic_year_id, child_id, child_ids, subject_id, instructional_minutes, is_placeholder, generated_by"
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

        # No-requirement mode: compute current placeholder days and deleted dates for "You deleted a lesson on [date]..." message
        baseline_scheduled_days = plan.get("baseline_scheduled_days")
        baseline_scheduled_dates = plan.get("baseline_scheduled_dates") or []
        current_scheduled_days = None
        deleted_dates = None
        if constraint_mode == "none" and isinstance(baseline_scheduled_dates, list) and len(baseline_scheduled_dates) > 0:
            plan_event_dates = set()
            for e in events:
                if e.get("generated_by") == "plan_year":
                    start_ts = e.get("start_ts")
                    if start_ts and isinstance(start_ts, str) and "T" in start_ts:
                        plan_event_dates.add(start_ts[:10])
            current_scheduled_days = len(plan_event_dates)
            baseline_set = set(baseline_scheduled_dates)
            deleted_dates = sorted([d for d in baseline_set if d not in plan_event_dates])
        print(
            f"[BACKEND] plan_health: plan_id={plan.get('id')} academic_year_id={academic_year_id} "
            f"start={plan['start_date'][:10]} end={plan['end_date'][:10]} target_days={target_days} "
            f"events_in_range={len(events)} attributions={len(attributions)}",
            flush=True,
        )
        result = compute_plan_health_from_attributions(
            attributions,
            start_date_obj,
            end_date_obj,
            constraint_mode,
            target_days,
            target_hours,
            subject_targets=subject_targets,
        )
        print(
            f"[BACKEND] plan_health result: planned_days={result.get('planned_days')} delta_days={result.get('delta_days')} "
            f"planned_hours={result.get('planned_hours')} delta_hours={result.get('delta_hours')}",
            flush=True,
        )
        # Exact suggested_end_date for 0 days/hours over/under (from blocks)
        suggested_end_date = None
        if constraint_mode == "days" and target_days and (result.get("delta_days") or 0) != 0:
            blocks_for_potential = list(plan.get("blocks") or [])
            if blocks_for_potential:
                try:
                    exc_ranges = exclusion_ranges_from_breaks_and_holidays([], [])
                    pot = compute_schedule_potential(
                        blocks_for_potential,
                        start_date_obj,
                        end_date_obj,
                        exc_ranges,
                        target_days=target_days,
                    )
                    suggested_end_date = pot.get("suggested_end_date")
                except Exception:
                    pass
        elif constraint_mode == "hours" and target_hours and (result.get("delta_hours") or 0) < 0:
            blocks_for_potential = list(plan.get("blocks") or [])
            if blocks_for_potential:
                try:
                    exc_ranges = exclusion_ranges_from_breaks_and_holidays([], [])
                    pot = compute_schedule_potential(
                        blocks_for_potential,
                        start_date_obj,
                        end_date_obj,
                        exc_ranges,
                        target_hours=float(target_hours),
                    )
                    suggested_end_date = pot.get("suggested_end_date")
                except Exception:
                    pass

        health_cache = {
            **result,
            "computed_at": datetime.now().isoformat(),
        }
        supabase.table("academic_year_plan").update({
            "health_cache": health_cache,
            "updated_at": datetime.now().isoformat(),
        }).eq("id", plan["id"]).execute()

        # Max extra weekdays we can add (Mon–Fri): 5 minus distinct weekdays already in blocks
        scheduled_weekdays = set()
        for b in (plan.get("blocks") or []):
            for w in (b.get("weekdays") or []):
                if 1 <= w <= 5:
                    scheduled_weekdays.add(w)
        max_extra_days_per_week = max(0, 5 - len(scheduled_weekdays))

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
            end_date=plan["end_date"][:10] if plan.get("end_date") else None,
            suggested_end_date=suggested_end_date,
            max_extra_days_per_week=max_extra_days_per_week,
            manual_events_days=result.get("manual_events_days"),
            manual_events_hours=result.get("manual_events_hours"),
            per_child=result.get("per_child"),
            per_child_subject=result.get("per_child_subject"),
            subject_targets=subject_targets,
            planning_mode=plan.get("planning_mode"),
            baseline_scheduled_days=baseline_scheduled_days if constraint_mode == "none" else None,
            current_scheduled_days=current_scheduled_days if constraint_mode == "none" else None,
            deleted_dates=deleted_dates if constraint_mode == "none" else None,
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
        ev_resp = (
            supabase.table("events")
            .select(
                "id, start_ts, end_ts, status, deleted_at, counts_toward_plan, "
                "academic_year_id, child_id, child_ids, subject_id, instructional_minutes, is_placeholder"
            )
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
        print(
            f"[BACKEND] apply_fix_suggestion: suggestion_type={body.suggestion_type} family_id={body.family_id} params={getattr(body, 'params', {})}",
            flush=True,
        )
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

        elif body.suggestion_type == "extra_days_per_week":
            # Add N blocks on N different weekdays that currently have no blocks (no double-booking)
            wday_count = {w: 0 for w in [1, 2, 3, 4, 5]}
            for b in blocks:
                for w in b.get("weekdays") or []:
                    if w in wday_count:
                        wday_count[w] += 1
            available_weekdays = [w for w in [1, 2, 3, 4, 5] if wday_count[w] == 0]
            extra_days = min(int(params.get("extra_days_per_week", 1)), len(available_weekdays))
            if extra_days <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="No unused weekdays left (schedule is already Mon–Fri). Extend the year instead.",
                )
            sub_resp = supabase.table("subject").select("id").eq("family_id", family_id).limit(1).execute()
            subject_id = (sub_resp.data[0]["id"] if sub_resp.data else None) or (
                blocks[0]["subject_id"] if blocks else None
            )
            if not subject_id:
                raise HTTPException(status_code=400, detail="Add at least one subject first.")
            children_resp = supabase.table("children").select("id").eq("family_id", family_id).execute()
            child_ids = [r["id"] for r in (children_resp.data or [])]
            for w in available_weekdays[:extra_days]:
                new_block = {
                    "block_id": str(uuid.uuid4()),
                    "subject_id": subject_id,
                    "child_ids": child_ids[:1] if child_ids else [],
                    "weekdays": [w],
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
            new_end = None
            suggested = params.get("suggested_end_date")
            if suggested:
                try:
                    new_end = date.fromisoformat(suggested[:10]).isoformat()
                except (ValueError, TypeError):
                    pass
            if not new_end:
                extra_weeks = int(params.get("extra_weeks", 2))
                end_obj = date.fromisoformat(end_date)
                new_end = (end_obj + timedelta(weeks=extra_weeks)).isoformat()
            supabase.table("academic_years").update({"end_date": new_end}).eq("id", academic_year_id).execute()
            supabase.table("academic_year_plan").update({
                "end_date": new_end,
                "updated_at": datetime.now().isoformat(),
            }).eq("id", plan["id"]).execute()
            end_date = new_end[:10]
            plan["end_date"] = new_end

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
                        "is_placeholder": False,
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
        print(
            f"[BACKEND] apply_fix_suggestion done: created={result.created} planned_days={result.planned_days}",
            flush=True,
        )
        return {"success": True, "created": result.created, "planned_days": result.planned_days}
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.apply_fix_suggestion.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fix_target_gap", response_model=FixTargetGapOutput)
async def fix_target_gap(
    body: FixTargetGapInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Deterministically add/remove placeholder events to move day-based target gap toward zero.
    Core day counting:
      - per_subject: unique (subject_id, date)
      - overall: unique date across subjects
    """
    try:
        scope = (body.scope or "overall").strip().lower()
        if scope not in {"overall", "per_subject"}:
            raise HTTPException(status_code=400, detail="scope must be 'overall' or 'per_subject'")
        target_kind = (body.target_kind or "days").strip().lower()
        if target_kind not in {"days", "hours"}:
            raise HTTPException(status_code=400, detail="target_kind must be 'days' or 'hours'.")
        if (body.mode or "").strip().lower() != "fill_to_zero":
            raise HTTPException(status_code=400, detail="mode must be 'fill_to_zero'")
        target_value_num = float(body.target_value or 0)
        if target_value_num < 0:
            raise HTTPException(status_code=400, detail="target_value must be >= 0")
        target_days = int(round(target_value_num))
        target_hours = float(target_value_num)
        if scope == "per_subject" and not (body.subject_id or "").strip():
            raise HTTPException(status_code=400, detail="subject_id is required for per_subject scope")

        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=403, detail="Forbidden: Family access missing")
        require_onboarding_complete(family_id)
        supabase = get_admin_client()
        fix_gap_timezone_name = None
        if getattr(body, "timezone", None) and (body.timezone or "").strip():
            fix_gap_timezone_name = (body.timezone or "").strip()
        if not fix_gap_timezone_name:
            try:
                tz_resp = supabase.table("family").select("timezone").eq("id", family_id).maybe_single().execute()
                if getattr(tz_resp, "data", None) and (tz_resp.data.get("timezone") or "").strip():
                    fix_gap_timezone_name = (tz_resp.data.get("timezone") or "").strip()
            except Exception:
                pass
        if not fix_gap_timezone_name:
            fix_gap_timezone_name = "UTC"
        try:
            fix_gap_timezone = ZoneInfo(fix_gap_timezone_name)
        except Exception:
            fix_gap_timezone_name = "UTC"
            fix_gap_timezone = ZoneInfo("UTC")

        def _slot_dt_utc(day_key: str, hhmm: str) -> datetime:
            safe_day = str(day_key or "").strip()[:10]
            safe_hm = str(hhmm or "09:00").strip()[:5]
            if len(safe_day) != 10:
                raise ValueError(f"Invalid day key: {day_key}")
            if len(safe_hm) < 4:
                safe_hm = "09:00"
            local_naive = datetime.fromisoformat(f"{safe_day}T{safe_hm}:00")
            local_dt = local_naive.replace(tzinfo=fix_gap_timezone)
            return local_dt.astimezone(timezone.utc)

        def _slot_iso_utc(day_key: str, hhmm: str) -> str:
            return _slot_dt_utc(day_key, hhmm).isoformat()

        year_resp = (
            supabase.table("academic_years")
            .select("id, family_id, start_date, end_date")
            .eq("id", body.academic_year_id)
            .limit(1)
            .execute()
        )
        if not year_resp.data:
            raise HTTPException(status_code=404, detail="Academic year not found.")
        year_row = year_resp.data[0]
        if str(year_row.get("family_id")) != str(family_id):
            raise HTTPException(status_code=403, detail="Forbidden: Family ID mismatch")
        plan_resp = (
            supabase.table("academic_year_plan")
            .select("academic_year_id, family_id, start_date, end_date, blocks")
            .eq("academic_year_id", body.academic_year_id)
            .limit(1)
            .execute()
        )
        if not plan_resp.data:
            raise HTTPException(status_code=404, detail="No plan found for this academic year.")
        plan = plan_resp.data[0]
        blocks = list(plan.get("blocks") or [])
        if not blocks:
            raise HTTPException(status_code=400, detail="No schedule blocks found for this plan.")

        plan_start = str(plan.get("start_date") or year_row.get("start_date") or "")[:10]
        plan_end = str(plan.get("end_date") or year_row.get("end_date") or "")[:10]
        if not plan_start or not plan_end:
            raise HTTPException(status_code=400, detail="Plan start/end date missing.")
        start_date_obj = date.fromisoformat(plan_start)
        end_date_obj = date.fromisoformat(plan_end)
        if end_date_obj < start_date_obj:
            raise HTTPException(status_code=400, detail="Invalid plan date range.")

        target_subject_id = str(body.subject_id).strip() if body.subject_id else None
        requested_subject_ids = [
            str(sid).strip()
            for sid in (body.subject_ids or [])
            if str(sid).strip()
        ]
        requested_subject_set = set(requested_subject_ids)
        max_minutes_per_slot_for_hours = 300  # default 5h/session cap
        learning_window_start_min = 8 * 60
        learning_window_end_min = 15 * 60
        learning_window_start_hhmm = "08:00"
        learning_window_end_hhmm = "15:00"
        try:
            planner_settings_resp = (
                supabase.table("family_planner_settings")
                .select("default_planned_hours_per_day, default_day_start_time, default_day_end_time, allowed_weekdays, updated_at")
                .eq("family_id", family_id)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )
            planner_settings_row = (planner_settings_resp.data or [None])[0] or {}
            preferred_allowed_weekdays = []
            try:
                preferred_allowed_weekdays = sorted(
                    {
                        int(w)
                        for w in (planner_settings_row.get("allowed_weekdays") or [])
                        if isinstance(w, (int, float, str)) and str(w).strip().lstrip("-").isdigit()
                    }
                )
            except Exception:
                preferred_allowed_weekdays = []
            preferred_allowed_weekdays = [
                int(w)
                for w in preferred_allowed_weekdays
                if isinstance(w, int) and 0 <= int(w) <= 6
            ] or [1, 2, 3, 4, 5]
            try:
                raw_start = str(planner_settings_row.get("default_day_start_time") or "").strip()
                raw_end = str(planner_settings_row.get("default_day_end_time") or "").strip()
                if raw_start:
                    sh, sm = [int(x) for x in raw_start[:5].split(":")]
                    start_min = (sh * 60) + sm
                    if 0 <= start_min < (24 * 60):
                        learning_window_start_min = start_min
                        learning_window_start_hhmm = f"{sh:02d}:{sm:02d}"
                if raw_end:
                    eh, em = [int(x) for x in raw_end[:5].split(":")]
                    end_min = (eh * 60) + em
                    if 0 < end_min <= (24 * 60):
                        learning_window_end_min = end_min
                        learning_window_end_hhmm = f"{eh:02d}:{em:02d}"
                if learning_window_end_min <= learning_window_start_min:
                    learning_window_start_min = 8 * 60
                    learning_window_end_min = 15 * 60
                    learning_window_start_hhmm = "08:00"
                    learning_window_end_hhmm = "15:00"
            except Exception:
                learning_window_start_min = 8 * 60
                learning_window_end_min = 15 * 60
                learning_window_start_hhmm = "08:00"
                learning_window_end_hhmm = "15:00"
            parsed_hours_cap = float(planner_settings_row.get("default_planned_hours_per_day") or 0)
            if math.isfinite(parsed_hours_cap) and parsed_hours_cap > 0:
                max_minutes_per_slot_for_hours = int(round(parsed_hours_cap * 60))
        except Exception:
            max_minutes_per_slot_for_hours = 300
            preferred_allowed_weekdays = [1, 2, 3, 4, 5]
        learning_window_span_minutes = max(15, learning_window_end_min - learning_window_start_min)
        max_minutes_per_slot_for_hours = max(15, min(max_minutes_per_slot_for_hours, learning_window_span_minutes))
        filtered_blocks = []
        for block in blocks:
            sid = str(block.get("subject_id") or "").strip()
            if not sid:
                continue
            if scope == "per_subject" and sid != target_subject_id:
                continue
            if scope == "overall" and requested_subject_set and sid not in requested_subject_set:
                continue
            filtered_blocks.append(block)

        def _to_minutes_or_none(hm: str) -> Optional[int]:
            try:
                hh, mm = [int(x) for x in str(hm or "").strip()[:5].split(":")]
                total = (hh * 60) + mm
                if 0 <= total <= (24 * 60):
                    return total
            except Exception:
                pass
            return None

        def _minutes_to_hhmm_simple(total_minutes: int) -> str:
            total = max(0, min(int(total_minutes), 24 * 60))
            hh = total // 60
            mm = total % 60
            return f"{hh:02d}:{mm:02d}"

        def _default_end_for_start(start_hm: str) -> str:
            start_min = _to_minutes_or_none(start_hm)
            if start_min is None:
                return learning_window_end_hhmm
            desired_end = min(learning_window_end_min, start_min + 60)
            if desired_end <= start_min:
                desired_end = min(learning_window_end_min, start_min + 15)
            return _minutes_to_hhmm_simple(desired_end)

        def insertFixGapEventsWithObservability(
            eventsToInsert: List[Dict[str, Any]],
            assignedCount: int,
            preinsertFailures: Optional[List[Dict[str, Any]]] = None,
            dryRun: bool = False,
            logPrefix: str = "[FixGapV3]",
            recoverOnInsertError: Optional[Callable[[Dict[str, Any], Exception], Optional[Dict[str, Any]]]] = None,
        ) -> Dict[str, Any]:
            preinsert_failures = list(preinsertFailures or [])
            inserted_rows: List[Dict[str, Any]] = []
            inserted_ids: List[str] = []
            failed_insert_details: List[Dict[str, Any]] = list(preinsert_failures)

            attempted_from_parts = len(eventsToInsert) + len(preinsert_failures)
            attempted_insert_count = int(max(0, assignedCount))
            if attempted_insert_count != attempted_from_parts:
                print(
                    f"{logPrefix}[ERROR] assignment mismatch before insert",
                    {
                        "assignedCount": attempted_insert_count,
                        "attemptedFromRowsAndDrops": attempted_from_parts,
                        "preinsertDrops": len(preinsert_failures),
                        "rowsToInsert": len(eventsToInsert),
                    },
                    flush=True,
                )
                attempted_insert_count = attempted_from_parts

            def _classify_insert_error(msg: str) -> str:
                m = (msg or "").lower()
                if "duplicate key" in m or "unique constraint" in m:
                    return "unique_conflict"
                if "row-level security" in m or "rls" in m or "permission denied" in m:
                    return "rls_denied"
                if "overlap" in m or "conflict" in m:
                    return "overlap_conflict"
                return "insert_exception"

            if dryRun:
                inserted_rows = list(eventsToInsert)
                inserted_ids = [str(row.get("id") or "").strip() for row in eventsToInsert if str(row.get("id") or "").strip()]
            else:
                for row in eventsToInsert:
                    row_id = str(row.get("id") or "").strip()
                    row_subject_id = str(row.get("subject_id") or "").strip() or None
                    row_date = str(row.get("start_ts") or "")[:10] or None
                    row_child_ids = [str(cid) for cid in (row.get("child_ids") or []) if str(cid).strip()]
                    try:
                        one = supabase.table("events").insert(row).execute()
                        one_rows = list(one.data or [])
                        if one_rows:
                            inserted_rows.extend(one_rows)
                            inserted_ids.append(str(one_rows[0].get("id") or row_id))
                            continue
                        verify = (
                            supabase.table("events")
                            .select("id, subject_id, start_ts, end_ts, child_id, child_ids")
                            .eq("id", row_id)
                            .limit(1)
                            .execute()
                        )
                        verify_rows = list(verify.data or [])
                        if verify_rows:
                            inserted_rows.extend(verify_rows)
                            inserted_ids.append(str(verify_rows[0].get("id") or row_id))
                            continue
                        fail_detail = {
                            "date": row_date,
                            "subject_id": row_subject_id,
                            "child_ids": row_child_ids,
                            "candidate_start": str(row.get("start_ts") or ""),
                            "candidate_end": str(row.get("end_ts") or ""),
                            "reason": "insert_returned_no_rows",
                        }
                        failed_insert_details.append(fail_detail)
                        print(f"{logPrefix} insertFailure", fail_detail, flush=True)
                    except Exception as insert_err:
                        recovered_row = None
                        if callable(recoverOnInsertError):
                            try:
                                recovered_row = recoverOnInsertError(row, insert_err)
                            except Exception:
                                recovered_row = None
                        if recovered_row:
                            inserted_rows.append(recovered_row)
                            inserted_ids.append(str(recovered_row.get("id") or row_id))
                            continue
                        err_msg = str(insert_err)
                        fail_detail = {
                            "date": row_date,
                            "subject_id": row_subject_id,
                            "child_ids": row_child_ids,
                            "candidate_start": str(row.get("start_ts") or ""),
                            "candidate_end": str(row.get("end_ts") or ""),
                            "reason": _classify_insert_error(err_msg),
                            "db_error": err_msg[:400],
                        }
                        failed_insert_details.append(fail_detail)
                        print(f"{logPrefix} insertFailure", fail_detail, flush=True)

            successful_insert_count = len([rid for rid in inserted_ids if str(rid or "").strip()])
            failed_insert_count = len(failed_insert_details)
            failed_insert_reasons: Dict[str, int] = {}
            for detail in failed_insert_details:
                reason_key = str(detail.get("reason") or "unknown_insert_failure")
                failed_insert_reasons[reason_key] = int(failed_insert_reasons.get(reason_key) or 0) + 1
            if attempted_insert_count != (successful_insert_count + failed_insert_count):
                mismatch = attempted_insert_count - (successful_insert_count + failed_insert_count)
                if mismatch > 0:
                    failed_insert_reasons["unclassified_insert_drop"] = int(
                        failed_insert_reasons.get("unclassified_insert_drop") or 0
                    ) + mismatch
                    failed_insert_count += mismatch
                print(
                    f"{logPrefix}[ERROR] insert accounting mismatch",
                    {
                        "attemptedInsertCount": attempted_insert_count,
                        "successfulInsertCount": successful_insert_count,
                        "failedInsertCount": failed_insert_count,
                    },
                    flush=True,
                )
            if attempted_insert_count != successful_insert_count:
                print(
                    f"{logPrefix}[ERROR] insert drop detected",
                    {
                        "attemptedInsertCount": attempted_insert_count,
                        "successfulInsertCount": successful_insert_count,
                        "failedInsertCount": failed_insert_count,
                        "failedInsertReasons": failed_insert_reasons,
                    },
                    flush=True,
                )

            return {
                "insertedRows": inserted_rows,
                "insertedIds": inserted_ids,
                "attemptedInsertCount": attempted_insert_count,
                "successfulInsertCount": successful_insert_count,
                "failedInsertCount": failed_insert_count,
                "failedInsertReasons": failed_insert_reasons,
                "failedInsertDetails": failed_insert_details,
            }
        if scope == "per_subject" and not filtered_blocks:
            raise HTTPException(status_code=400, detail="No blocks found for selected subject.")
        if scope == "overall" and not filtered_blocks:
            raise HTTPException(status_code=400, detail="No subject blocks found for plan.")
        if scope == "overall" and not requested_subject_set:
            requested_subject_set = {
                str(block.get("subject_id") or "").strip()
                for block in filtered_blocks
                if str(block.get("subject_id") or "").strip()
            }
        # Ensure overall balancing can include every requested subject even when
        # the saved plan is missing explicit blocks for some of them.
        if scope == "overall" and requested_subject_set and filtered_blocks:
            existing_subjects_with_blocks = {
                str(block.get("subject_id") or "").strip()
                for block in filtered_blocks
                if str(block.get("subject_id") or "").strip()
            }
            missing_requested_subjects = [
                sid for sid in requested_subject_ids
                if sid and sid not in existing_subjects_with_blocks
            ]
            if missing_requested_subjects:
                template_blocks = [b for b in filtered_blocks if str(b.get("subject_id") or "").strip()]
                for idx, sid in enumerate(missing_requested_subjects):
                    if template_blocks:
                        tpl = template_blocks[idx % len(template_blocks)]
                        synth_block = dict(tpl)
                    else:
                        synth_block = {}
                    synth_block["subject_id"] = sid
                    synth_block["weekdays"] = list(preferred_allowed_weekdays)
                    synth_start = str(synth_block.get("start_time") or learning_window_start_hhmm)
                    synth_end = str(synth_block.get("end_time") or _default_end_for_start(synth_start))
                    synth_start_min = _to_minutes_or_none(synth_start)
                    synth_end_min = _to_minutes_or_none(synth_end)
                    if (
                        synth_start_min is None
                        or synth_end_min is None
                        or synth_end_min <= synth_start_min
                    ):
                        synth_start = learning_window_start_hhmm
                        synth_end = _default_end_for_start(synth_start)
                    synth_block["start_time"] = synth_start
                    synth_block["end_time"] = synth_end
                    synth_block["all_day"] = False
                    raw_block_id = str(synth_block.get("block_id") or "").strip()
                    try:
                        synth_block["block_id"] = str(uuid.UUID(raw_block_id)) if raw_block_id else str(uuid.uuid4())
                    except Exception:
                        synth_block["block_id"] = str(uuid.uuid4())
                    filtered_blocks.append(synth_block)
                print(
                    "[FixGapDebug] synthesized_subject_blocks",
                    {
                        "missingRequestedSubjects": missing_requested_subjects,
                        "templateBlockCount": len(template_blocks),
                        "totalFilteredBlocks": len(filtered_blocks),
                    },
                    flush=True,
                )

        subject_name_by_id: Dict[str, str] = {}
        try:
            subject_ids_for_titles = sorted({
                str(block.get("subject_id") or "").strip()
                for block in filtered_blocks
                if str(block.get("subject_id") or "").strip()
            })
            if subject_ids_for_titles:
                subject_rows_resp = (
                    supabase.table("subject")
                    .select("id, name")
                    .eq("family_id", family_id)
                    .in_("id", subject_ids_for_titles)
                    .execute()
                )
                for row in (subject_rows_resp.data or []):
                    sid = str(row.get("id") or "").strip()
                    if not sid:
                        continue
                    subject_name_by_id[sid] = str(row.get("name") or "").strip()
        except Exception:
            subject_name_by_id = {}

        range_start_ymd = str(body.range_start_ymd or "").strip()[:10]
        range_end_ymd = str(body.range_end_ymd or "").strip()[:10]
        # Evaluate/fix against requested range.
        # In strict_range mode we use it exactly (no implicit extension).
        effective_start_ymd = plan_start
        effective_end_ymd = plan_end
        if body.strict_range and len(range_start_ymd) == 10 and len(range_end_ymd) == 10:
            effective_start_ymd = range_start_ymd
            effective_end_ymd = range_end_ymd
        else:
            if len(range_start_ymd) == 10 and range_start_ymd > effective_start_ymd:
                effective_start_ymd = range_start_ymd
            if len(range_end_ymd) == 10 and range_end_ymd < effective_end_ymd:
                effective_end_ymd = range_end_ymd
        if effective_end_ymd < effective_start_ymd:
            raise HTTPException(status_code=400, detail="Invalid target range for fix gap.")
        effective_start_obj = date.fromisoformat(effective_start_ymd)
        effective_end_obj = date.fromisoformat(effective_end_ymd)

        settings_resp = (
            supabase.table("academic_year_holiday_settings")
            .select("*")
            .eq("academic_year_id", body.academic_year_id)
            .limit(1)
            .execute()
        )
        settings = settings_resp.data[0] if settings_resp.data else {}
        excluded_holiday_dates = settings.get("excluded_holiday_dates") if isinstance(settings.get("excluded_holiday_dates"), list) else []
        follow_global = bool(settings.get("follow_global_holidays"))
        holiday_region = settings.get("holiday_region") or settings.get("holiday_country_code") or "US"
        holiday_country = settings.get("holiday_country_code") or (holiday_region.split(":")[0] if ":" in str(holiday_region) else holiday_region)
        holidays = get_holidays_for_year(
            supabase,
            body.academic_year_id,
            include_global=follow_global,
            country_code=holiday_country,
            region=settings.get("holiday_region"),
            provider=settings.get("provider") or "NAGER_DATE",
            excluded_holiday_dates=excluded_holiday_dates,
        )
        custom_holidays = [
            {"date": str(h.get("date") or "")[:10], "name": h.get("name") or "", "type": h.get("type") or "CUSTOM_HOLIDAY"}
            for h in (holidays or [])
            if str(h.get("date") or "")[:10]
        ]
        try:
            breaks_resp = (
                supabase.table("academic_year_exclusions")
                .select("start_date, end_date, exclusion_type, label")
                .eq("academic_year_id", body.academic_year_id)
                .eq("exclusion_type", "break")
                .execute()
            )
            breaks_rows = list(breaks_resp.data or [])
        except Exception:
            breaks_rows = []
        custom_breaks = [
            {
                "start": str(row.get("start_date") or "")[:10],
                "end": str(row.get("end_date") or "")[:10],
                "name": row.get("label") or "Break",
            }
            for row in breaks_rows
            if str(row.get("start_date") or "")[:10] and str(row.get("end_date") or "")[:10]
        ]
        holiday_dates = _build_holiday_dates_for_apply(
            effective_start_obj,
            effective_end_obj,
            follow_global,
            str(holiday_region) if holiday_region else "US",
            custom_holidays,
            custom_breaks,
            supabase,
            excluded_holiday_dates=excluded_holiday_dates,
        )
        exclusion_ranges = _build_exclusion_ranges_for_apply(holiday_dates, custom_breaks)

        try:
            events_resp = (
                supabase.table("events")
                .select(
                    "id, start_ts, due_ts, status, deleted_at, subject_id, counts_toward_plan, "
                    "instructional_status, generated_by, is_placeholder, source_block_id"
                )
                .eq("family_id", family_id)
                .eq("academic_year_id", body.academic_year_id)
                .is_("deleted_at", None)
                .neq("status", "canceled")
                .gte("start_ts", f"{effective_start_ymd}T00:00:00")
                .lte("start_ts", f"{effective_end_ymd}T23:59:59")
                .execute()
            )
            all_events = list(events_resp.data or [])
        except Exception:
            # Backward compatibility: some schemas may not include instructional_status/source_block_id.
            events_resp = (
                supabase.table("events")
                .select(
                    "id, start_ts, due_ts, status, deleted_at, subject_id, counts_toward_plan, "
                    "generated_by, is_placeholder"
                )
                .eq("family_id", family_id)
                .eq("academic_year_id", body.academic_year_id)
                .is_("deleted_at", None)
                .neq("status", "canceled")
                .gte("start_ts", f"{effective_start_ymd}T00:00:00")
                .lte("start_ts", f"{effective_end_ymd}T23:59:59")
                .execute()
            )
            all_events = list(events_resp.data or [])

        def _day_key(ev: Dict[str, Any]) -> Optional[str]:
            ts = str(ev.get("start_ts") or ev.get("due_ts") or "")[:10]
            return ts if len(ts) == 10 else None

        def _counts_toward(ev: Dict[str, Any]) -> bool:
            ins = str(ev.get("instructional_status") or "").strip().upper()
            if ins in {"MANUAL_COUNTS", "PLAN_PLACEHOLDER", "PLAN_LOCKED"}:
                return True
            return ev.get("counts_toward_plan") is True

        def _minutes_from_hhmm(start_hm: str, end_hm: str, default_minutes: int = 60) -> int:
            try:
                sh, sm = [int(x) for x in str(start_hm or "09:00").split(":")]
                eh, em = [int(x) for x in str(end_hm or "10:00").split(":")]
                mins = (eh * 60 + em) - (sh * 60 + sm)
                if mins > 0:
                    return mins
            except Exception:
                pass
            return default_minutes

        def _event_minutes(ev: Dict[str, Any]) -> int:
            try:
                raw = ev.get("instructional_minutes")
                if raw is not None:
                    mins = int(round(float(raw)))
                    if mins > 0:
                        return mins
            except Exception:
                pass
            st_hm = str(ev.get("start_ts") or "")[11:16]
            et_hm = str(ev.get("end_ts") or "")[11:16]
            return _minutes_from_hhmm(st_hm, et_hm, default_minutes=60)

        counted_events = [ev for ev in all_events if _counts_toward(ev)]
        if scope == "per_subject":
            counted_events = [
                ev for ev in counted_events if str(ev.get("subject_id") or "").strip() == target_subject_id
            ]
        else:
            counted_events = [
                ev for ev in counted_events
                if str(ev.get("subject_id") or "").strip() in requested_subject_set
            ]

        # -----------------------------------------------------------------------------
        # Fix-gap V3 (day targets): source of truth is planning preferences + events table.
        # -----------------------------------------------------------------------------
        if target_kind == "days":
            def _parse_positive_int(value: Any) -> Optional[int]:
                try:
                    parsed = int(round(float(value)))
                    return parsed if parsed > 0 else None
                except Exception:
                    return None

            def _parse_child_ids(raw_child_id: Any) -> List[str]:
                raw = str(raw_child_id or "").strip()
                if not raw:
                    return []
                parts = [p.strip() for p in raw.replace(",", ";").split(";")]
                return [p for p in parts if p]

            def _day_from_ts(ts_raw: Any) -> Optional[str]:
                day = str(ts_raw or "")[:10]
                return day if len(day) == 10 else None

            def _normalize_slot_times_v3(start_hm: str, end_hm: str) -> Tuple[str, str]:
                start_min = _to_minutes_or_none(start_hm)
                end_min = _to_minutes_or_none(end_hm)
                safe_start = start_min if start_min is not None else learning_window_start_min
                safe_end = end_min if end_min is not None else (safe_start + 60)
                safe_start = max(learning_window_start_min, min(safe_start, learning_window_end_min - 15))
                safe_end = min(learning_window_end_min, safe_end)
                if safe_end <= safe_start:
                    safe_end = min(learning_window_end_min, safe_start + 60)
                if safe_end <= safe_start:
                    safe_end = min(learning_window_end_min, safe_start + 15)
                return _minutes_to_hhmm_simple(safe_start), _minutes_to_hhmm_simple(safe_end)

            def _evenly_pick_days(eligible_days: List[str], needed: int) -> List[str]:
                if needed <= 0 or not eligible_days:
                    return []
                if needed >= len(eligible_days):
                    return list(eligible_days)
                spacing = len(eligible_days) / float(needed)
                selected: List[str] = []
                used_idx = set()
                for i in range(needed):
                    idx = int(math.floor(i * spacing))
                    idx = max(0, min(len(eligible_days) - 1, idx))
                    while idx in used_idx and idx + 1 < len(eligible_days):
                        idx += 1
                    if idx in used_idx:
                        for back in range(idx - 1, -1, -1):
                            if back not in used_idx:
                                idx = back
                                break
                    used_idx.add(idx)
                    selected.append(eligible_days[idx])
                return selected

            settings_scope = str(planner_settings_row.get("target_scope") or "overall").strip().lower()
            effective_scope = settings_scope if settings_scope in {"overall", "per_subject"} else scope
            selected_subject_ids = (
                [target_subject_id] if effective_scope == "per_subject" and target_subject_id
                else (requested_subject_ids if requested_subject_ids else sorted(requested_subject_set))
            )
            if not selected_subject_ids:
                selected_subject_ids = sorted({
                    str(block.get("subject_id") or "").strip()
                    for block in filtered_blocks
                    if str(block.get("subject_id") or "").strip()
                })
            selected_subject_ids = [sid for sid in selected_subject_ids if sid]
            if not selected_subject_ids:
                raise HTTPException(status_code=400, detail="No subjects available for fix-gap.")

            subjects_resp = (
                supabase.table("subject")
                .select("id, name, child_id, default_constraint_mode, default_target_days, default_target_hours")
                .eq("family_id", family_id)
                .in_("id", selected_subject_ids)
                .execute()
            )
            subject_rows = list(subjects_resp.data or [])
            subject_by_id: Dict[str, Dict[str, Any]] = {
                str(row.get("id")): row
                for row in subject_rows
                if str(row.get("id") or "").strip()
            }
            selected_subject_ids = [sid for sid in selected_subject_ids if sid in subject_by_id]
            if not selected_subject_ids:
                raise HTTPException(status_code=400, detail="Selected subjects are invalid for this family.")

            saved_range_start = str(planner_settings_row.get("default_year_start_date") or plan_start)[:10]
            saved_range_end = str(planner_settings_row.get("default_year_end_date") or plan_end)[:10]
            if len(saved_range_start) != 10:
                saved_range_start = plan_start
            if len(saved_range_end) != 10:
                saved_range_end = plan_end
            if saved_range_end < saved_range_start:
                saved_range_start = plan_start
                saved_range_end = plan_end
            today_ymd = datetime.now(timezone.utc).date().isoformat()
            range_start_for_fix = max(saved_range_start, today_ymd)
            if saved_range_end < range_start_for_fix:
                return FixTargetGapOutput(
                    success=False,
                    academic_year_id=body.academic_year_id,
                    scope=effective_scope,
                    subject_id=target_subject_id,
                    target_kind="days",
                    target_value=float(target_value_num),
                    beforeProjectedDays=0,
                    afterProjectedDays=0,
                    beforeGapDays=0,
                    afterGapDays=0,
                    createdEvents=0,
                    selectedDates=[],
                    partialFixPossible=True,
                    availableDates=0,
                    remainingUnfixableGap=0,
                    maxAchievableDays=0,
                    debugFailureReason="saved_range_already_ended",
                    message="Saved planning range has already ended. Extend planning preferences to add days.",
                )
            start_obj = date.fromisoformat(range_start_for_fix)
            end_obj = date.fromisoformat(saved_range_end)

            holiday_settings_resp = (
                supabase.table("academic_year_holiday_settings")
                .select("*")
                .eq("academic_year_id", body.academic_year_id)
                .limit(1)
                .execute()
            )
            holiday_settings = (holiday_settings_resp.data or [None])[0] or {}
            follow_global = bool(holiday_settings.get("follow_global_holidays"))
            holiday_region = holiday_settings.get("holiday_region") or holiday_settings.get("holiday_country_code") or "US"
            excluded_holiday_dates = holiday_settings.get("excluded_holiday_dates") if isinstance(holiday_settings.get("excluded_holiday_dates"), list) else []
            holiday_dates = _build_holiday_dates_for_apply(
                start_obj,
                end_obj,
                follow_global,
                str(holiday_region) if holiday_region else "US",
                [],
                [],
                supabase,
                excluded_holiday_dates=excluded_holiday_dates,
            )
            exclusions_resp = (
                supabase.table("academic_year_exclusions")
                .select("start_date, end_date")
                .eq("academic_year_id", body.academic_year_id)
                .execute()
            )
            exclusion_rows = list(exclusions_resp.data or [])
            excluded_dates = {d.isoformat() for d in holiday_dates}
            for row in exclusion_rows:
                st = str(row.get("start_date") or "")[:10]
                en = str(row.get("end_date") or "")[:10]
                if len(st) != 10 or len(en) != 10 or en < st:
                    continue
                cursor = date.fromisoformat(st)
                end_cursor = date.fromisoformat(en)
                while cursor <= end_cursor:
                    excluded_dates.add(cursor.isoformat())
                    cursor += timedelta(days=1)

            learning_dates: List[str] = []
            cursor = start_obj
            preferred_weekday_set = set(preferred_allowed_weekdays or [1, 2, 3, 4, 5])
            while cursor <= end_obj:
                weekday_num = int((cursor.weekday() + 1) % 7)
                day_key = cursor.isoformat()
                if weekday_num in preferred_weekday_set and day_key not in excluded_dates:
                    learning_dates.append(day_key)
                cursor += timedelta(days=1)

            events_for_count_resp = (
                supabase.table("events")
                .select("id, subject_id, start_ts, status")
                .eq("family_id", family_id)
                .eq("academic_year_id", body.academic_year_id)
                .eq("counts_toward_plan", True)
                .is_("deleted_at", None)
                .neq("status", "canceled")
                .gte("start_ts", f"{saved_range_start}T00:00:00")
                .lte("start_ts", f"{saved_range_end}T23:59:59")
                .execute()
            )
            events_for_count = [
                ev for ev in (events_for_count_resp.data or [])
                if str(ev.get("subject_id") or "").strip() in set(selected_subject_ids)
            ]
            done_by_subject: Dict[str, set] = defaultdict(set)
            upcoming_by_subject: Dict[str, set] = defaultdict(set)
            existing_by_subject: Dict[str, set] = defaultdict(set)
            existing_overall_dates: set = set()
            for ev in events_for_count:
                sid = str(ev.get("subject_id") or "").strip()
                day_key = _day_from_ts(ev.get("start_ts"))
                if not sid or not day_key:
                    continue
                existing_by_subject[sid].add(day_key)
                existing_overall_dates.add(day_key)
                status_raw = str(ev.get("status") or "").strip().lower()
                if status_raw == "done" and day_key <= today_ymd:
                    done_by_subject[sid].add(day_key)
                elif day_key > today_ymd:
                    upcoming_by_subject[sid].add(day_key)

            before_projected_days = 0
            before_gap_days = 0
            target_days_effective = _parse_positive_int(planner_settings_row.get("default_target_days")) or target_days
            per_subject_gaps: Dict[str, int] = {}
            if effective_scope == "overall":
                done_overall = set().union(*done_by_subject.values()) if done_by_subject else set()
                upcoming_overall = set().union(*upcoming_by_subject.values()) if upcoming_by_subject else set()
                before_projected_days = len(done_overall.union(upcoming_overall))
                before_gap_days = int(target_days_effective - before_projected_days)
            else:
                for sid in selected_subject_ids:
                    subject_row = subject_by_id.get(sid) or {}
                    subject_target_days = _parse_positive_int(subject_row.get("default_target_days"))
                    if subject_target_days is None:
                        continue
                    projected_sid = len((done_by_subject.get(sid) or set()).union(upcoming_by_subject.get(sid) or set()))
                    gap_sid = int(subject_target_days - projected_sid)
                    per_subject_gaps[sid] = gap_sid
                before_projected_days = sum(
                    len((done_by_subject.get(sid) or set()).union(upcoming_by_subject.get(sid) or set()))
                    for sid in per_subject_gaps.keys()
                )
                before_gap_days = sum(max(0, gap) for gap in per_subject_gaps.values())
                target_days_effective = before_projected_days + before_gap_days

            if before_gap_days <= 0:
                return FixTargetGapOutput(
                    success=True,
                    academic_year_id=body.academic_year_id,
                    scope=effective_scope,
                    subject_id=target_subject_id,
                    target_kind="days",
                    target_value=float(target_days_effective),
                    beforeProjectedDays=before_projected_days,
                    afterProjectedDays=before_projected_days,
                    beforeGapDays=before_gap_days,
                    afterGapDays=before_gap_days,
                    createdEvents=0,
                    removedEvents=0,
                    selectedDates=[],
                    partialFixPossible=False,
                    availableDates=0,
                    remainingUnfixableGap=0,
                    maxAchievableDays=before_projected_days,
                    debugDaysNeeded=max(0, before_gap_days),
                    debugCandidateDatesCount=0,
                    debugSelectedDatesCount=0,
                    debugPotentialSelectedCount=0,
                    message="Already on target.",
                )

            slot_templates_by_subject: Dict[str, Tuple[str, str]] = {}
            for block in filtered_blocks:
                sid = str(block.get("subject_id") or "").strip()
                if not sid or sid in slot_templates_by_subject:
                    continue
                st, et = _normalize_slot_times_v3(
                    str(block.get("start_time") or learning_window_start_hhmm),
                    str(block.get("end_time") or learning_window_end_hhmm),
                )
                slot_templates_by_subject[sid] = (st, et)

            assignment_requests: List[Dict[str, Any]] = []
            available_dates_count = 0
            if effective_scope == "overall":
                # Do not drop whole dates just because a counted event already exists on that date.
                # Slot-level overlap probing is the source of truth for capacity.
                eligible_days = list(learning_dates)
                available_dates_count = len(eligible_days)
                selected_days = _evenly_pick_days(eligible_days, max(0, before_gap_days))
                for idx, day_key in enumerate(selected_days):
                    sid = selected_subject_ids[idx % len(selected_subject_ids)]
                    st, et = slot_templates_by_subject.get(
                        sid,
                        (learning_window_start_hhmm, _default_end_for_start(learning_window_start_hhmm)),
                    )
                    assignment_requests.append({
                        "subject_id": sid,
                        "preferred_date": day_key,
                        "preferred_start": st,
                        "preferred_end": et,
                        "candidate_dates": [day_key] + [d for d in eligible_days if d != day_key],
                    })
            else:
                for sid in selected_subject_ids:
                    gap_sid = max(0, int(per_subject_gaps.get(sid, 0)))
                    if gap_sid <= 0:
                        continue
                    # Keep all preferred/excluded-filtered learning dates; per-slot conflict checks
                    # handle whether each date can accept an additional event.
                    eligible_days_sid = list(learning_dates)
                    available_dates_count += len(eligible_days_sid)
                    selected_days_sid = _evenly_pick_days(eligible_days_sid, gap_sid)
                    st, et = slot_templates_by_subject.get(
                        sid,
                        (learning_window_start_hhmm, _default_end_for_start(learning_window_start_hhmm)),
                    )
                    for day_key in selected_days_sid:
                        assignment_requests.append({
                            "subject_id": sid,
                            "preferred_date": day_key,
                            "preferred_start": st,
                            "preferred_end": et,
                            "candidate_dates": [day_key] + [d for d in eligible_days_sid if d != day_key],
                        })

            affected_child_ids = set()
            for sid in selected_subject_ids:
                row = subject_by_id.get(sid) or {}
                for cid in _parse_child_ids(row.get("child_id")):
                    affected_child_ids.add(cid)
            if not affected_child_ids:
                try:
                    children_resp = (
                        supabase.table("child")
                        .select("id")
                        .eq("family_id", family_id)
                        .execute()
                    )
                    affected_child_ids = {
                        str(row.get("id") or "").strip()
                        for row in (children_resp.data or [])
                        if str(row.get("id") or "").strip()
                    }
                except Exception:
                    affected_child_ids = set()
            # Build conflict scope from all family children so pre-check never underfetches
            # compared to DB overlap guards.
            try:
                family_children_resp = (
                    supabase.table("child")
                    .select("id")
                    .eq("family_id", family_id)
                    .execute()
                )
                for row in (family_children_resp.data or []):
                    cid = str(row.get("id") or "").strip()
                    if cid:
                        affected_child_ids.add(cid)
            except Exception:
                pass

            selected_child_ids_for_conflict = sorted({
                str(cid).strip()
                for cid in affected_child_ids
                if str(cid).strip()
            })
            events_by_date: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

            def _normalize_uuid_str(raw: Any) -> Optional[str]:
                value = str(raw or "").strip().strip('"').strip("'").strip()
                if not value:
                    return None
                return value.lower()

            def _coerce_child_ids(raw_child_ids: Any) -> List[str]:
                values: List[Any] = []
                if isinstance(raw_child_ids, (list, tuple, set)):
                    values = list(raw_child_ids)
                elif isinstance(raw_child_ids, str):
                    s = raw_child_ids.strip()
                    if not s:
                        values = []
                    elif s.startswith("["):
                        try:
                            parsed = json.loads(s)
                            values = parsed if isinstance(parsed, list) else [parsed]
                        except Exception:
                            values = [s]
                    elif s.startswith("{") and s.endswith("}"):
                        inner = s[1:-1].strip()
                        values = [p.strip() for p in inner.split(",")] if inner else []
                    else:
                        values = [s]
                elif raw_child_ids is None:
                    values = []
                else:
                    values = [raw_child_ids]
                out: List[str] = []
                for item in values:
                    norm = _normalize_uuid_str(item)
                    if norm:
                        out.append(norm)
                return out

            def _normalized_child_set(child_id_raw: Any, child_ids_raw: Any) -> set:
                normalized = set(_coerce_child_ids(child_ids_raw))
                one = _normalize_uuid_str(child_id_raw)
                if one:
                    normalized.add(one)
                return normalized

            def _event_child_ids(ev: Dict[str, Any]) -> List[str]:
                return sorted(_normalized_child_set(ev.get("child_id"), ev.get("child_ids")))

            def _shares_child(new_child_ids: List[str], existing_child_ids: List[str]) -> bool:
                new_set = {_normalize_uuid_str(cid) for cid in (new_child_ids or []) if _normalize_uuid_str(cid)}
                existing_set = {_normalize_uuid_str(cid) for cid in (existing_child_ids or []) if _normalize_uuid_str(cid)}
                # Align to DB overlap scope requested by fix-gap: only events whose child
                # membership intersects selected children are considered conflicts.
                if not existing_set or not new_set:
                    return False
                return bool(new_set.intersection(existing_set))

            def _minutes_from_ts(ts_raw: Any, fallback_min: int) -> int:
                hm = str(ts_raw or "")[11:16]
                parsed = _to_minutes_or_none(hm)
                return parsed if parsed is not None else fallback_min

            def _overlaps(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
                return a_start < b_end and a_end > b_start

            def _parse_ts_utc(ts_raw: Any) -> Optional[datetime]:
                raw = str(ts_raw or "").strip()
                if not raw:
                    return None
                try:
                    dt = date_parser.isoparse(raw)
                    return _ensure_utc_dt(dt)
                except Exception:
                    return None

            def _ensure_utc_dt(dt: datetime) -> datetime:
                if dt.tzinfo is None:
                    return dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)

            def _normalize_event_window(ev: Dict[str, Any]) -> Optional[Tuple[datetime, datetime]]:
                start_dt = _parse_ts_utc(ev.get("start_ts"))
                if not start_dt:
                    return None
                end_dt = _parse_ts_utc(ev.get("end_ts"))
                if bool(ev.get("all_day")):
                    start_day = datetime.combine(start_dt.date(), time.min, tzinfo=timezone.utc)
                    # all-day covers the full start date in overlap checks
                    return start_day, start_day + timedelta(days=1)
                if not end_dt or end_dt <= start_dt:
                    end_dt = start_dt + timedelta(minutes=60)
                return start_dt, end_dt

            def _find_conflicting_event(
                day_events: List[Dict[str, Any]],
                candidate_start_dt: datetime,
                candidate_end_dt: datetime,
                candidate_child_ids: List[str],
                candidate_day_key: Optional[str] = None,
            ) -> Optional[Dict[str, Any]]:
                debug_day = "2026-05-06"
                candidate_start_utc = _ensure_utc_dt(candidate_start_dt)
                candidate_end_utc = _ensure_utc_dt(candidate_end_dt)
                candidate_child_set = {
                    _normalize_uuid_str(cid)
                    for cid in (candidate_child_ids or [])
                    if _normalize_uuid_str(cid)
                }
                for ev in day_events:
                    ev_start_dt = ev.get("start_dt")
                    ev_end_dt = ev.get("end_dt")
                    if not isinstance(ev_start_dt, datetime) or not isinstance(ev_end_dt, datetime):
                        continue
                    ev_start_utc = _ensure_utc_dt(ev_start_dt)
                    ev_end_utc = _ensure_utc_dt(ev_end_dt)
                    existing_child_set = {
                        _normalize_uuid_str(cid)
                        for cid in (ev.get("child_ids") or [])
                        if _normalize_uuid_str(cid)
                    }
                    children_overlap = bool(candidate_child_set.intersection(existing_child_set))
                    time_overlap = candidate_start_utc < ev_end_utc and candidate_end_utc > ev_start_utc
                    conflict = children_overlap and time_overlap
                    if candidate_day_key == debug_day:
                        print(
                            "[FixGapV3] conflictDiagnostic",
                            {
                                "existing_id": ev.get("id"),
                                "existing_start_ts": str(ev.get("start_ts") or ""),
                                "existing_end_ts": str(ev.get("end_ts") or ""),
                                "existing_deleted_at": ev.get("deleted_at"),
                                "existing_status": ev.get("status"),
                                "existing_generated_by": ev.get("generated_by"),
                                "existing_is_placeholder": ev.get("is_placeholder"),
                                "existing_child_id": ev.get("child_id"),
                                "existing_child_ids": ev.get("child_ids_raw"),
                                "normalized_existing_child_set": sorted(existing_child_set),
                                "candidate_child_set": sorted(candidate_child_set),
                                "child_intersection_result": children_overlap,
                                "candidate_start_utc": candidate_start_utc.isoformat(),
                                "existing_start_utc": ev_start_utc.isoformat(),
                                "existing_end_utc": ev_end_utc.isoformat(),
                                "time_overlap_result": time_overlap,
                                "final_conflict_result": conflict,
                            },
                            flush=True,
                        )
                    if not children_overlap:
                        continue
                    # Must match DB overlap semantics: touching endpoints are allowed.
                    if time_overlap:
                        return ev
                return None

            def _fetch_conflict_events_for_selected_children() -> List[Dict[str, Any]]:
                if not selected_child_ids_for_conflict:
                    return []
                # Mirror DB-trigger visibility with full-scope pagination (no date/year/type filters).
                page_size = 1000

                def _fetch_rows(*, active_only: bool) -> List[Dict[str, Any]]:
                    fetched_rows: List[Dict[str, Any]] = []
                    offset = 0
                    while True:
                        query = (
                            supabase.table("events")
                            .select("id, start_ts, end_ts, child_id, child_ids, status, deleted_at, generated_by, is_placeholder")
                            .eq("family_id", family_id)
                            .neq("status", "canceled")
                        )
                        if active_only:
                            query = query.is_("deleted_at", None)
                        events_resp = query.range(offset, offset + page_size - 1).execute()
                        page_rows = list(events_resp.data or [])
                        if not page_rows:
                            break
                        fetched_rows.extend(page_rows)
                        if len(page_rows) < page_size:
                            break
                        offset += page_size
                    return fetched_rows

                all_rows = _fetch_rows(active_only=False)
                active_all_rows = _fetch_rows(active_only=True)
                selected_set = set(selected_child_ids_for_conflict)
                intersecting_including_deleted: List[Dict[str, Any]] = []
                for ev in all_rows:
                    ev_child_set = set(_event_child_ids(ev))
                    if ev_child_set.intersection(selected_set):
                        intersecting_including_deleted.append(ev)
                active_rows: List[Dict[str, Any]] = []
                for ev in active_all_rows:
                    ev_child_set = set(_event_child_ids(ev))
                    if ev_child_set.intersection(selected_set):
                        active_rows.append(ev)
                out: List[Dict[str, Any]] = []
                for ev in active_rows:
                    out.append(ev)
                print(
                    "[FixGapV3] conflictEventScope",
                    {
                        "selectedChildIdsCount": len(selected_child_ids_for_conflict),
                        "fetchedRowsCount": len(all_rows),
                        "fetchedConflictRowsIncludingDeleted": len(intersecting_including_deleted),
                        "fetchedConflictRowsActiveOnly": len(active_rows),
                        "ignoredDeletedConflictRows": max(0, len(intersecting_including_deleted) - len(active_rows)),
                        "filteredConflictRowsCount": len(out),
                    },
                    flush=True,
                )
                return out

            for ev in _fetch_conflict_events_for_selected_children():
                win = _normalize_event_window(ev)
                if not win:
                    continue
                start_dt, end_dt = win
                child_ids = _event_child_ids(ev)
                span_start = start_dt.date()
                span_end = (end_dt - timedelta(microseconds=1)).date()
                day_cursor = span_start
                while day_cursor <= span_end:
                    day_key = day_cursor.isoformat()
                    events_by_date[day_key].append({
                        "id": str(ev.get("id") or "").strip() or None,
                        "start_dt": start_dt,
                        "end_dt": end_dt,
                        "start_ts": str(ev.get("start_ts") or ""),
                        "end_ts": str(ev.get("end_ts") or ""),
                        "child_id": ev.get("child_id"),
                        "child_ids_raw": ev.get("child_ids"),
                        "child_ids": child_ids,
                    })
                    day_cursor += timedelta(days=1)

            selected_assignments: List[Dict[str, Any]] = []
            used_overall_dates: set = set()
            used_subject_dates: Dict[str, set] = defaultdict(set)
            generated_child_days: Dict[str, set] = defaultdict(set)
            assigned_count_by_week: Dict[str, int] = defaultdict(int)
            skipped_no_slot = 0

            def _week_start_ymd(day_key: str) -> str:
                try:
                    d = date.fromisoformat(day_key)
                    return (d - timedelta(days=d.weekday())).isoformat()
                except Exception:
                    return day_key

            def _nearest_balanced_fallback_dates(
                preferred_day: str,
                candidate_dates: List[str],
            ) -> List[str]:
                try:
                    pref_ord = date.fromisoformat(preferred_day).toordinal()
                except Exception:
                    pref_ord = 0
                def _ord_or_zero(day_key: str) -> int:
                    try:
                        return date.fromisoformat(day_key).toordinal()
                    except Exception:
                        return 0
                deduped = []
                seen = set()
                for d in candidate_dates:
                    if d in seen:
                        continue
                    seen.add(d)
                    deduped.append(d)
                return sorted(
                    deduped,
                    key=lambda d: (
                        abs(_ord_or_zero(d) - pref_ord),
                        assigned_count_by_week[_week_start_ymd(d)],
                        d,
                    ),
                )

            assignment_debug: List[Dict[str, Any]] = []
            def _slot_dt_utc_for_fix(day_key: str, hhmm: str) -> datetime:
                safe_day = str(day_key or "").strip()[:10]
                safe_hm = str(hhmm or "09:00").strip()[:5]
                if len(safe_day) != 10:
                    raise ValueError(f"Invalid day key: {day_key}")
                if len(safe_hm) < 4:
                    safe_hm = "09:00"
                local_naive = datetime.fromisoformat(f"{safe_day}T{safe_hm}:00")
                local_dt = local_naive.replace(tzinfo=fix_gap_timezone)
                return local_dt.astimezone(timezone.utc)

            for req in assignment_requests:
                sid = str(req.get("subject_id") or "").strip()
                subject_row = subject_by_id.get(sid) or {}
                child_ids = _parse_child_ids(subject_row.get("child_id"))
                if not child_ids:
                    child_ids = sorted(affected_child_ids)
                preferred_start, preferred_end = _normalize_slot_times_v3(
                    str(req.get("preferred_start") or learning_window_start_hhmm),
                    str(req.get("preferred_end") or _default_end_for_start(str(req.get("preferred_start") or learning_window_start_hhmm))),
                )
                preferred_start_min = _to_minutes_or_none(preferred_start) or learning_window_start_min
                preferred_end_min = _to_minutes_or_none(preferred_end) or (preferred_start_min + 60)
                duration_min = max(15, preferred_end_min - preferred_start_min)
                duration_min = min(duration_min, max(15, learning_window_end_min - learning_window_start_min))
                latest_start_min = learning_window_end_min - duration_min
                preferred_start_min = max(learning_window_start_min, min(preferred_start_min, latest_start_min))

                assigned = None
                candidate_dates = [d for d in (req.get("candidate_dates") or []) if isinstance(d, str) and len(d) == 10]
                preferred_day = str(req.get("preferred_date") or "").strip()[:10]
                fallback_used = False
                fallback_reason = ""
                on_selected_date_attempted = False

                def _try_assign_on_dates(date_list: List[str], allow_same_child_day: bool) -> Optional[Dict[str, Any]]:
                    for day_key in date_list:
                        # Day-target accounting: never place a new event on a day that's
                        # already counted for this scope before the run.
                        if effective_scope == "overall":
                            if day_key in existing_overall_dates:
                                continue
                        else:
                            if day_key in (existing_by_subject.get(sid) or set()):
                                continue
                        if effective_scope == "overall" and day_key in used_overall_dates:
                            continue
                        if day_key in (used_subject_dates.get(sid) or set()):
                            continue
                        if (not allow_same_child_day) and any(day_key in (generated_child_days.get(cid) or set()) for cid in child_ids):
                            continue
                        day_events = events_by_date.setdefault(day_key, [])
                        candidate_starts = [
                            minute for minute in range(learning_window_start_min, latest_start_min + 1, 30)
                        ]
                        if preferred_start_min in candidate_starts:
                            candidate_starts = [preferred_start_min] + [m for m in candidate_starts if m != preferred_start_min]
                        rejected_slot_count = 0
                        first_rejected_reason: Optional[Dict[str, Any]] = None
                        selected_slot_log: Optional[Dict[str, Any]] = None
                        for start_min in candidate_starts:
                            end_min = start_min + duration_min
                            if end_min > learning_window_end_min:
                                continue
                            candidate_start_dt = _slot_dt_utc_for_fix(day_key, _minutes_to_hhmm_simple(start_min))
                            candidate_end_dt = _slot_dt_utc_for_fix(day_key, _minutes_to_hhmm_simple(end_min))
                            conflicting_ev = _find_conflicting_event(
                                day_events=day_events,
                                candidate_start_dt=candidate_start_dt,
                                candidate_end_dt=candidate_end_dt,
                                candidate_child_ids=child_ids,
                                candidate_day_key=day_key,
                            )
                            if conflicting_ev is not None:
                                rejected_slot_count += 1
                                if first_rejected_reason is None:
                                    first_rejected_reason = {
                                        "reason": "overlap_conflict",
                                        "conflicting_event_id": conflicting_ev.get("id"),
                                        "conflicting_start": str(conflicting_ev.get("start_ts") or ""),
                                        "conflicting_end": str(conflicting_ev.get("end_ts") or ""),
                                        "conflicting_child_ids": list(conflicting_ev.get("child_ids") or []),
                                        "deleted_at": conflicting_ev.get("deleted_at"),
                                        "status": conflicting_ev.get("status"),
                                        "generated_by": conflicting_ev.get("generated_by"),
                                        "is_placeholder": conflicting_ev.get("is_placeholder"),
                                    }
                                print(
                                    "[FixGapV3] conflictCheckFail",
                                    {
                                        "candidate_start": candidate_start_dt.isoformat(),
                                        "candidate_end": candidate_end_dt.isoformat(),
                                        "candidate_child_ids": list(child_ids),
                                        "conflicting_event_id": conflicting_ev.get("id"),
                                        "conflicting_start": str(conflicting_ev.get("start_ts") or ""),
                                        "conflicting_end": str(conflicting_ev.get("end_ts") or ""),
                                        "conflicting_child_ids": list(conflicting_ev.get("child_ids") or []),
                                        "deleted_at": conflicting_ev.get("deleted_at"),
                                        "status": conflicting_ev.get("status"),
                                        "generated_by": conflicting_ev.get("generated_by"),
                                        "is_placeholder": conflicting_ev.get("is_placeholder"),
                                    },
                                    flush=True,
                                )
                                continue
                            selected_slot_log = {
                                "start": candidate_start_dt.isoformat(),
                                "end": candidate_end_dt.isoformat(),
                            }
                            assigned_local = {
                                "date": day_key,
                                "subject_id": sid,
                                "start_time": _minutes_to_hhmm_simple(start_min),
                                "end_time": _minutes_to_hhmm_simple(end_min),
                                "child_ids": child_ids,
                            }
                            day_events.append({
                                "id": None,
                                "start_dt": candidate_start_dt,
                                "end_dt": candidate_end_dt,
                                "start_ts": _slot_iso_utc(day_key, _minutes_to_hhmm_simple(start_min)),
                                "end_ts": _slot_iso_utc(day_key, _minutes_to_hhmm_simple(end_min)),
                                "child_ids": list(child_ids),
                            })
                            print(
                                "[FixGapV3] slotSelection",
                                {
                                    "date": day_key,
                                    "slotCount": len(candidate_starts),
                                    "rejectedSlotCount": rejected_slot_count,
                                    "firstRejectedReason": first_rejected_reason,
                                    "selectedSlot": selected_slot_log,
                                },
                                flush=True,
                            )
                            if effective_scope == "overall":
                                used_overall_dates.add(day_key)
                            used_subject_dates[sid].add(day_key)
                            for cid in child_ids:
                                generated_child_days[cid].add(day_key)
                            assigned_count_by_week[_week_start_ymd(day_key)] += 1
                            return assigned_local
                        print(
                            "[FixGapV3] slotSelection",
                            {
                                "date": day_key,
                                "slotCount": len(candidate_starts),
                                "rejectedSlotCount": rejected_slot_count,
                                "firstRejectedReason": first_rejected_reason,
                                "selectedSlot": None,
                            },
                            flush=True,
                        )
                    return None

                # 1) Preserve even spread: try selected anchor date first.
                if preferred_day:
                    on_selected_date_attempted = True
                    assigned = _try_assign_on_dates([preferred_day], allow_same_child_day=False)
                    if not assigned:
                        assigned = _try_assign_on_dates([preferred_day], allow_same_child_day=True)
                        if assigned:
                            fallback_reason = "same_child_day_required_on_selected_date"
                    if assigned and assigned.get("date") == preferred_day:
                        fallback_used = False

                # 2) Fallback only if selected date cannot fit any valid slot.
                if not assigned:
                    fallback_used = True
                    remaining_dates = [d for d in candidate_dates if d != preferred_day]
                    ordered_fallback = _nearest_balanced_fallback_dates(preferred_day, remaining_dates)
                    assigned = _try_assign_on_dates(ordered_fallback, allow_same_child_day=False)
                    if not assigned:
                        assigned = _try_assign_on_dates(ordered_fallback, allow_same_child_day=True)
                        if assigned:
                            fallback_reason = "same_child_day_required_on_fallback_date"
                    if not assigned and not fallback_reason:
                        fallback_reason = "no_open_slot_on_selected_or_fallback_dates"

                if assigned:
                    if fallback_used and not fallback_reason:
                        fallback_reason = "selected_date_fully_booked"
                    assignment_debug.append({
                        "originalSelectedDate": preferred_day,
                        "finalAssignedDate": assigned.get("date"),
                        "fallbackUsed": bool(assigned.get("date") != preferred_day),
                        "fallbackReason": fallback_reason if bool(assigned.get("date") != preferred_day) else "",
                        "subject_id": sid,
                    })
                    selected_assignments.append(assigned)
                else:
                    assignment_debug.append({
                        "originalSelectedDate": preferred_day,
                        "finalAssignedDate": None,
                        "fallbackUsed": True if on_selected_date_attempted else False,
                        "fallbackReason": fallback_reason or "no_slot_found",
                        "subject_id": sid,
                    })
                    skipped_no_slot += 1

            selected_assignments.sort(key=lambda slot: (slot["date"], slot["subject_id"], slot["start_time"]))
            selected_dates = [slot["date"] for slot in selected_assignments]
            assigned_count_before_revalidation = len(selected_assignments)
            preinsert_conflict_failures: List[Dict[str, Any]] = []
            if selected_assignments and not body.dry_run:
                if selected_child_ids_for_conflict:
                    refreshed_events_by_date: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
                    for ev in _fetch_conflict_events_for_selected_children():
                        win = _normalize_event_window(ev)
                        if not win:
                            continue
                        start_dt, end_dt = win
                        child_ids = _event_child_ids(ev)
                        span_start = start_dt.date()
                        span_end = (end_dt - timedelta(microseconds=1)).date()
                        day_cursor = span_start
                        while day_cursor <= span_end:
                            day_key = day_cursor.isoformat()
                            refreshed_events_by_date[day_key].append({
                                "id": str(ev.get("id") or "").strip() or None,
                                "start_dt": start_dt,
                                "end_dt": end_dt,
                                "start_ts": str(ev.get("start_ts") or ""),
                                "end_ts": str(ev.get("end_ts") or ""),
                                "child_id": ev.get("child_id"),
                                "deleted_at": ev.get("deleted_at"),
                                "status": ev.get("status"),
                                "generated_by": ev.get("generated_by"),
                                "is_placeholder": ev.get("is_placeholder"),
                                "child_ids_raw": ev.get("child_ids"),
                                "child_ids": child_ids,
                            })
                            day_cursor += timedelta(days=1)

                    revalidated_assignments: List[Dict[str, Any]] = []
                    for slot in selected_assignments:
                        day_key = str(slot.get("date") or "").strip()
                        if not day_key:
                            fail_detail = {
                                "date": day_key or None,
                                "subject_id": str(slot.get("subject_id") or "").strip() or None,
                                "child_ids": [str(cid) for cid in (slot.get("child_ids") or []) if str(cid).strip()],
                                "reason": "invalid_assignment_date",
                            }
                            preinsert_conflict_failures.append(fail_detail)
                            print("[FixGapV3] preInsertDrop", fail_detail, flush=True)
                            continue
                        child_ids = [str(cid) for cid in (slot.get("child_ids") or []) if str(cid).strip()]
                        start_min = _to_minutes_or_none(str(slot.get("start_time") or "")) or learning_window_start_min
                        end_min = _to_minutes_or_none(str(slot.get("end_time") or "")) or (start_min + 60)
                        if end_min <= start_min:
                            end_min = start_min + 60
                        candidate_start_dt = _slot_dt_utc_for_fix(day_key, _minutes_to_hhmm_simple(start_min))
                        candidate_end_dt = _slot_dt_utc_for_fix(day_key, _minutes_to_hhmm_simple(end_min))
                        day_events = refreshed_events_by_date.setdefault(day_key, [])
                        conflicting_ev = _find_conflicting_event(
                            day_events=day_events,
                            candidate_start_dt=candidate_start_dt,
                            candidate_end_dt=candidate_end_dt,
                            candidate_child_ids=child_ids,
                            candidate_day_key=day_key,
                        )
                        if conflicting_ev is not None:
                            fail_detail = {
                                "date": day_key,
                                "subject_id": str(slot.get("subject_id") or "").strip() or None,
                                "child_ids": child_ids,
                                "reason": "preinsert_overlap_conflict",
                                "conflicting_event_id": conflicting_ev.get("id"),
                                "conflicting_start": str(conflicting_ev.get("start_ts") or ""),
                                "conflicting_end": str(conflicting_ev.get("end_ts") or ""),
                                "conflicting_child_ids": list(conflicting_ev.get("child_ids") or []),
                                "deleted_at": conflicting_ev.get("deleted_at"),
                                "status": conflicting_ev.get("status"),
                                "generated_by": conflicting_ev.get("generated_by"),
                                "is_placeholder": conflicting_ev.get("is_placeholder"),
                            }
                            preinsert_conflict_failures.append(fail_detail)
                            print(
                                "[FixGapV3] conflictCheckFail",
                                {
                                    "candidate_start": candidate_start_dt.isoformat(),
                                    "candidate_end": candidate_end_dt.isoformat(),
                                    "candidate_child_ids": list(child_ids),
                                    "conflicting_event_id": conflicting_ev.get("id"),
                                    "conflicting_start": str(conflicting_ev.get("start_ts") or ""),
                                    "conflicting_end": str(conflicting_ev.get("end_ts") or ""),
                                    "conflicting_child_ids": list(conflicting_ev.get("child_ids") or []),
                                    "deleted_at": conflicting_ev.get("deleted_at"),
                                    "status": conflicting_ev.get("status"),
                                    "generated_by": conflicting_ev.get("generated_by"),
                                    "is_placeholder": conflicting_ev.get("is_placeholder"),
                                },
                                flush=True,
                            )
                            print("[FixGapV3] preInsertDrop", fail_detail, flush=True)
                            continue
                        revalidated_assignments.append(slot)
                        day_events.append({
                            "id": None,
                            "start_dt": candidate_start_dt,
                            "end_dt": candidate_end_dt,
                            "start_ts": _slot_iso_utc(day_key, _minutes_to_hhmm_simple(start_min)),
                            "end_ts": _slot_iso_utc(day_key, _minutes_to_hhmm_simple(end_min)),
                            "child_ids": list(child_ids),
                        })
                    if preinsert_conflict_failures:
                        print(
                            "[FixGapV3] preInsertRevalidation",
                            {
                                "removed": len(preinsert_conflict_failures),
                                "kept": len(revalidated_assignments),
                                "inputAssignments": len(selected_assignments),
                            },
                            flush=True,
                        )
                    selected_assignments = revalidated_assignments
                    selected_dates = [slot["date"] for slot in selected_assignments]

            created_rows: List[Dict[str, Any]] = []
            for slot in selected_assignments:
                sid = str(slot.get("subject_id") or "").strip()
                subject_row = subject_by_id.get(sid) or {}
                subject_name = str(subject_row.get("name") or "Subject").strip() or "Subject"
                child_ids = [str(cid) for cid in (slot.get("child_ids") or []) if str(cid).strip()]
                st = str(slot.get("start_time") or learning_window_start_hhmm)
                et = str(slot.get("end_time") or _default_end_for_start(st))
                created_rows.append({
                    "id": str(uuid.uuid4()),
                    "family_id": family_id,
                    "academic_year_id": body.academic_year_id,
                    "created_by": user.get("id"),
                    "updated_by": user.get("id"),
                    "subject_id": sid,
                    "title": f"{subject_name} catch-up day",
                    "event_type": "Lesson",
                    "status": "scheduled",
                    "source": "system",
                    "start_ts": _slot_iso_utc(slot["date"], st),
                    "end_ts": _slot_iso_utc(slot["date"], et),
                    "counts_toward_plan": True,
                    "instructional_status": "PLAN_PLACEHOLDER",
                    "is_placeholder": True,
                    "generated_by": "fix_gap",
                    "child_id": (child_ids[0] if child_ids else None),
                    "child_ids": child_ids,
                })

            duplicate_suppressed_failures: List[Dict[str, Any]] = []
            if created_rows and not body.dry_run:
                def _slot_identity_key(
                    subject_id: Any,
                    start_ts: Any,
                    end_ts: Any,
                    child_ids_raw: Any,
                    child_id_raw: Any,
                ) -> str:
                    sid = str(subject_id or "").strip()
                    start_str = str(start_ts or "")
                    end_str = str(end_ts or "")
                    day = start_str[:10]
                    start_hm = start_str[11:16]
                    end_hm = end_str[11:16]
                    ids = [str(cid).strip() for cid in (child_ids_raw or []) if str(cid).strip()]
                    single = str(child_id_raw or "").strip()
                    if single:
                        ids.append(single)
                    ids_key = ",".join(sorted(set(ids)))
                    return f"{sid}|{day}|{start_hm}|{end_hm}|{ids_key}"

                min_created_day = min(str(row.get("start_ts") or "")[:10] for row in created_rows)
                max_created_day = max(str(row.get("start_ts") or "")[:10] for row in created_rows)
                existing_fix_resp = (
                    supabase.table("events")
                    .select("subject_id, start_ts, end_ts, child_id, child_ids")
                    .eq("family_id", family_id)
                    .eq("academic_year_id", body.academic_year_id)
                    .eq("generated_by", "fix_gap")
                    .is_("deleted_at", None)
                    .neq("status", "canceled")
                    .gte("start_ts", f"{min_created_day}T00:00:00")
                    .lte("start_ts", f"{max_created_day}T23:59:59")
                    .execute()
                )
                existing_keys = {
                    _slot_identity_key(
                        ev.get("subject_id"),
                        ev.get("start_ts"),
                        ev.get("end_ts"),
                        ev.get("child_ids") or [],
                        ev.get("child_id"),
                    )
                    for ev in (existing_fix_resp.data or [])
                }
                filtered_rows: List[Dict[str, Any]] = []
                seen_new_keys: set = set()
                for row in created_rows:
                    row_key = _slot_identity_key(
                        row.get("subject_id"),
                        row.get("start_ts"),
                        row.get("end_ts"),
                        row.get("child_ids") or [],
                        row.get("child_id"),
                    )
                    if row_key in existing_keys or row_key in seen_new_keys:
                        fail_detail = {
                            "date": str(row.get("start_ts") or "")[:10] or None,
                            "subject_id": str(row.get("subject_id") or "").strip() or None,
                            "child_ids": [str(cid) for cid in (row.get("child_ids") or []) if str(cid).strip()],
                            "reason": "duplicate_suppressed",
                        }
                        duplicate_suppressed_failures.append(fail_detail)
                        print("[FixGapV3] preInsertDrop", fail_detail, flush=True)
                        continue
                    seen_new_keys.add(row_key)
                    filtered_rows.append(row)
                if duplicate_suppressed_failures:
                    print(
                        "[FixGapV3] duplicateSuppression",
                        {
                            "suppressed": len(duplicate_suppressed_failures),
                            "remaining": len(filtered_rows),
                        },
                        flush=True,
                    )
                created_rows = filtered_rows

            inserted_rows: List[Dict[str, Any]] = []
            inserted_ids: List[str] = []
            observed_insert = insertFixGapEventsWithObservability(
                eventsToInsert=created_rows,
                assignedCount=assigned_count_before_revalidation,
                preinsertFailures=[*preinsert_conflict_failures, *duplicate_suppressed_failures],
                dryRun=bool(body.dry_run),
                logPrefix="[FixGapV3]",
            )
            inserted_rows = list(observed_insert.get("insertedRows") or [])
            inserted_ids = [str(i) for i in (observed_insert.get("insertedIds") or []) if str(i).strip()]
            attempted_insert_count = int(observed_insert.get("attemptedInsertCount") or 0)
            successful_insert_count = int(observed_insert.get("successfulInsertCount") or 0)
            failed_insert_count = int(observed_insert.get("failedInsertCount") or 0)
            failed_insert_reasons = dict(observed_insert.get("failedInsertReasons") or {})
            failed_insert_details = list(observed_insert.get("failedInsertDetails") or [])
            if (
                not body.dry_run
                and int(failed_insert_reasons.get("overlap_conflict") or 0) > 0
                and failed_insert_details
            ):
                refreshed_conflict_events = _fetch_conflict_events_for_selected_children()
                for fail in failed_insert_details:
                    if str(fail.get("reason") or "") != "overlap_conflict":
                        continue
                    cand_start = _parse_ts_utc(fail.get("candidate_start"))
                    cand_end = _parse_ts_utc(fail.get("candidate_end"))
                    cand_child_ids = [str(cid) for cid in (fail.get("child_ids") or []) if str(cid).strip()]
                    if not cand_start or not cand_end or not cand_child_ids:
                        continue
                    matched = None
                    for ev in refreshed_conflict_events:
                        win = _normalize_event_window(ev)
                        if not win:
                            continue
                        ev_start, ev_end = win
                        ev_child_ids = _event_child_ids(ev)
                        if not _shares_child(cand_child_ids, ev_child_ids):
                            continue
                        if cand_start < ev_end and cand_end > ev_start:
                            matched = {
                                "conflicting_event_id": str(ev.get("id") or "").strip() or None,
                                "conflicting_start": str(ev.get("start_ts") or ""),
                                "conflicting_end": str(ev.get("end_ts") or ""),
                                "conflicting_child_ids": ev_child_ids,
                                "deleted_at": ev.get("deleted_at"),
                                "status": ev.get("status"),
                                "generated_by": ev.get("generated_by"),
                                "is_placeholder": ev.get("is_placeholder"),
                            }
                            break
                    if matched:
                        print(
                            "[FixGapV3] dbRejectConflictMatch",
                            {
                                "candidate_start": cand_start.isoformat(),
                                "candidate_end": cand_end.isoformat(),
                                "candidate_child_ids": cand_child_ids,
                                **matched,
                            },
                            flush=True,
                        )

            events_created_count = successful_insert_count
            inserted_day_keys_by_subject: Dict[str, set] = defaultdict(set)
            for ev in inserted_rows:
                sid = str(ev.get("subject_id") or "").strip()
                day_key = _day_from_ts(ev.get("start_ts"))
                if sid and day_key:
                    inserted_day_keys_by_subject[sid].add(day_key)

            if effective_scope == "overall":
                done_overall = set().union(*done_by_subject.values()) if done_by_subject else set()
                upcoming_overall = set().union(*upcoming_by_subject.values()) if upcoming_by_subject else set()
                before_projected_set = done_overall.union(upcoming_overall)
                inserted_overall_days = set().union(*inserted_day_keys_by_subject.values()) if inserted_day_keys_by_subject else set()
                after_projected_set = before_projected_set.union(inserted_overall_days)
                projected_after_days = len(after_projected_set)
            else:
                projected_after_days = 0
                for sid in per_subject_gaps.keys():
                    projected_before_sid = (done_by_subject.get(sid) or set()).union(upcoming_by_subject.get(sid) or set())
                    projected_after_sid = projected_before_sid.union(inserted_day_keys_by_subject.get(sid) or set())
                    projected_after_days += len(projected_after_sid)

            after_gap_days = int(target_days_effective - projected_after_days)
            remaining_unfixable_gap = max(0, after_gap_days)
            partial_fix_possible = after_gap_days > 0
            progress_days = max(0, int(projected_after_days - before_projected_days))

            print(
                "[FixGapV3] result",
                {
                    "target": target_days_effective,
                    "projectedBefore": before_projected_days,
                    "gapBefore": before_gap_days,
                    "eligibleDatesCount": available_dates_count,
                    "selectedDates": selected_dates,
                    "eventsToInsert": len(created_rows),
                    "assignedCount": assigned_count_before_revalidation,
                    "attemptedInsertCount": attempted_insert_count,
                    "successfulInsertCount": successful_insert_count,
                    "insertedEvents": events_created_count,
                    "failedInsertCount": failed_insert_count,
                    "failedInsertReasons": failed_insert_reasons,
                    "unassignedCount": max(0, len(assignment_requests) - assigned_count_before_revalidation),
                    "preInsertConflictSkips": len(preinsert_conflict_failures),
                    "duplicateSuppressedCount": len(duplicate_suppressed_failures),
                    "assignmentStrategy": "even_spread_conflict_aware",
                    "assignmentDebug": assignment_debug,
                    "progressDays": progress_days,
                    "projectedAfter": projected_after_days,
                    "gapAfter": after_gap_days,
                },
                flush=True,
            )

            message = None
            if partial_fix_possible:
                message = (
                    f"Only {progress_days} of {before_gap_days} missing day{'s' if before_gap_days != 1 else ''} could be scheduled. "
                    f"Extend planning range or add more preferred learning days to close the remaining {remaining_unfixable_gap}-day gap."
                )

            return FixTargetGapOutput(
                success=not partial_fix_possible,
                academic_year_id=body.academic_year_id,
                scope=effective_scope,
                subject_id=target_subject_id,
                target_kind="days",
                target_value=float(target_days_effective),
                beforeProjectedDays=before_projected_days,
                afterProjectedDays=projected_after_days,
                beforeGapDays=before_gap_days,
                afterGapDays=after_gap_days,
                createdEvents=events_created_count,
                removedEvents=0,
                createdEventIds=inserted_ids,
                removedEventIds=[],
                debugDaysNeeded=max(0, before_gap_days),
                debugCandidateDatesCount=len(learning_dates),
                debugSelectedDatesCount=len(selected_assignments),
                debugPotentialSelectedCount=len(assignment_requests),
                debugInsertedCount=events_created_count,
                debugSelectedSlots=selected_assignments,
                debugFailureReason=("partial_fix_possible" if partial_fix_possible else None),
                debugInitialRangeEnd=saved_range_end,
                debugFinalRangeEnd=saved_range_end,
                requestedGap=max(0, before_gap_days),
                assignedCount=assigned_count_before_revalidation,
                insertedCount=events_created_count,
                attemptedInsertCount=attempted_insert_count,
                successfulInsertCount=successful_insert_count,
                failedInsertCount=failed_insert_count,
                failedInsertReasons=failed_insert_reasons,
                datesWithCapacity=assigned_count_before_revalidation,
                datesWithoutCapacity=max(0, len(assignment_requests) - assigned_count_before_revalidation),
                unassignedCount=max(0, len(assignment_requests) - assigned_count_before_revalidation),
                skippedBecauseNoSlot=(skipped_no_slot + len(preinsert_conflict_failures)),
                selectedAssignments=selected_assignments,
                assignmentStrategy="even_spread_conflict_aware",
                selectedDates=selected_dates,
                partialFixPossible=partial_fix_possible,
                availableDates=available_dates_count,
                remainingUnfixableGap=remaining_unfixable_gap,
                maxAchievableDays=projected_after_days,
                message=message,
            )

        now_utc = datetime.now(timezone.utc)
        today_ymd = now_utc.date().isoformat()

        def _event_is_attended_for_projection(ev: Dict[str, Any]) -> bool:
            status = str(ev.get("status") or "").strip().lower()
            instructional_status = str(ev.get("instructional_status") or "").strip().upper()
            return status == "done" or instructional_status == "MANUAL_COUNTS"

        def _event_is_upcoming_for_projection(ev: Dict[str, Any]) -> bool:
            ts_raw = str(ev.get("start_ts") or ev.get("due_ts") or "").strip()
            if not ts_raw:
                return False
            # Use day-level comparison to match UI day-target behavior and avoid
            # timezone/time-of-day skew that can incorrectly drop same-day/future slots.
            day = ts_raw[:10]
            return len(day) == 10 and day >= today_ymd

        # Keep backend projection aligned to UI Year Targets row:
        # projected = attended/manual-counts + upcoming events (not all historical scheduled).
        projected_events = [
            ev for ev in counted_events
            if _event_is_attended_for_projection(ev) or _event_is_upcoming_for_projection(ev)
        ]

        def _projected_unique_days(events: List[Dict[str, Any]]) -> int:
            if scope == "overall":
                return len({_day_key(ev) for ev in events if _day_key(ev)})
            return len({
                f"{str(ev.get('subject_id') or '').strip()}:{_day_key(ev)}"
                for ev in events
                if _day_key(ev) and str(ev.get("subject_id") or "").strip()
            })

        def _projected_total_hours(events: List[Dict[str, Any]]) -> float:
            total_minutes = 0
            for ev in events:
                total_minutes += _event_minutes(ev)
            return round(total_minutes / 60.0, 2)

        backend_before_projected_days = _projected_unique_days(projected_events)
        backend_before_projected_hours = _projected_total_hours(projected_events)
        ui_before_projected_days = None
        ui_gap_days = None
        ui_before_projected_hours = None
        ui_gap_hours = None
        try:
            if body.visible_projected_days is not None:
                ui_before_projected_days = int(round(float(body.visible_projected_days)))
        except Exception:
            ui_before_projected_days = None
        try:
            if body.visible_gap_days is not None:
                ui_gap_days = int(round(float(body.visible_gap_days)))
        except Exception:
            ui_gap_days = None
        try:
            if body.visible_projected_hours is not None:
                ui_before_projected_hours = float(body.visible_projected_hours)
        except Exception:
            ui_before_projected_hours = None
        try:
            if body.visible_gap_hours is not None:
                ui_gap_hours = float(body.visible_gap_hours)
        except Exception:
            ui_gap_hours = None

        # Fix Gap V2: trust the visible row baseline when provided so we do not
        # short-circuit on a wider backend baseline (e.g. full-year vs row scope).
        before_projected_days = None
        before_gap_days = None
        before_projected_hours = None
        before_gap_hours = None
        if target_kind == "days":
            before_projected_days = (
                ui_before_projected_days
                if ui_before_projected_days is not None and ui_before_projected_days >= 0
                else backend_before_projected_days
            )
            before_gap_days = (
                ui_gap_days
                if ui_gap_days is not None
                else int(target_days - before_projected_days)
            )
        else:
            before_projected_hours = (
                ui_before_projected_hours
                if ui_before_projected_hours is not None and ui_before_projected_hours >= 0
                else backend_before_projected_hours
            )
            before_gap_hours = (
                ui_gap_hours
                if ui_gap_hours is not None
                else round(target_hours - before_projected_hours, 2)
            )
            # Keep compatibility fields populated for callers that still read day fields.
            before_projected_days = int(round(before_projected_hours))
            before_gap_days = int(round(before_gap_hours))
        print(
            "[FixGapV2] baseline_source",
            {
                "backendBeforeProjectedDays": backend_before_projected_days,
                "backendBeforeProjectedHours": backend_before_projected_hours,
                "uiBeforeProjectedDays": ui_before_projected_days,
                "uiGapDays": ui_gap_days,
                "uiBeforeProjectedHours": ui_before_projected_hours,
                "uiGapHours": ui_gap_hours,
                "chosenBeforeProjectedDays": before_projected_days,
                "chosenBeforeGapDays": before_gap_days,
                "chosenBeforeProjectedHours": before_projected_hours,
                "chosenBeforeGapHours": before_gap_hours,
            },
            flush=True,
        )
        no_gap = (
            before_gap_days == 0
            if target_kind == "days"
            else abs(float(before_gap_hours or 0.0)) < 0.01
        )
        if no_gap:
            return FixTargetGapOutput(
                success=True,
                academic_year_id=body.academic_year_id,
                scope=scope,
                subject_id=target_subject_id,
                target_kind=target_kind,
                target_value=float(target_value_num),
                beforeProjectedDays=before_projected_days,
                afterProjectedDays=before_projected_days,
                beforeGapDays=before_gap_days,
                afterGapDays=before_gap_days,
                beforeProjectedHours=before_projected_hours,
                afterProjectedHours=before_projected_hours,
                beforeGapHours=before_gap_hours,
                afterGapHours=before_gap_hours,
                createdEvents=0,
                removedEvents=0,
                debugSelectedSlots=[],
                message="Already on target.",
            )

        day_set_before = set()
        if target_kind == "hours":
            for ev in projected_events:
                dk = _day_key(ev)
                sid = str(ev.get("subject_id") or "").strip()
                st_hm = str(ev.get("start_ts") or "")[11:16] or "09:00"
                if dk and sid:
                    day_set_before.add(f"{sid}:{dk}:{st_hm}")
        elif scope == "overall":
            for ev in projected_events:
                dk = _day_key(ev)
                if dk:
                    day_set_before.add(dk)
        else:
            for ev in projected_events:
                dk = _day_key(ev)
                sid = str(ev.get("subject_id") or "").strip()
                if dk and sid:
                    day_set_before.add(f"{sid}:{dk}")

        created_rows: List[Dict[str, Any]] = []
        created_event_ids: List[str] = []
        removed_event_ids: List[str] = []
        debug_candidate_dates_count: Optional[int] = None
        debug_selected_dates_count: Optional[int] = None
        debug_inserted_count: Optional[int] = None

        positive_gap = (
            before_gap_days > 0
            if target_kind == "days"
            else float(before_gap_hours or 0.0) > 0
        )
        if positive_gap:
            # Need to add placeholders.
            today_iso = datetime.now(timezone.utc).date().isoformat()
            fix_start_ymd = max(
                plan_start,
                today_iso,
            )
            fix_start_obj = date.fromisoformat(fix_start_ymd)
            # Start with effective range end.
            fix_end_obj = effective_end_obj if effective_end_obj >= fix_start_obj else fix_start_obj
            days_needed = int(before_gap_days or 0)
            minutes_needed = int(math.ceil(max(float(before_gap_hours or 0.0), 0.0) * 60.0)) if target_kind == "hours" else 0
            progress_needed = days_needed if target_kind == "days" else minutes_needed
            candidate_slots: List[Dict[str, Any]] = []
            potential_selected_count = 0
            dense_fallback_enabled = bool(target_kind == "days" and scope == "overall")
            extension_anchor_end_obj = effective_end_obj
            if len(range_end_ymd) == 10:
                try:
                    extension_anchor_end_obj = date.fromisoformat(range_end_ymd)
                except Exception:
                    extension_anchor_end_obj = effective_end_obj
            hard_cap_end_obj = (
                fix_end_obj
                if body.strict_range
                else max(fix_end_obj, extension_anchor_end_obj + timedelta(days=365))
            )  # 12 months from requested/effective range end
            def _parse_hhmm_to_minutes(raw_hm: str, fallback_minutes: int) -> int:
                try:
                    hh, mm = [int(x) for x in str(raw_hm or "").strip()[:5].split(":")]
                    value = (hh * 60) + mm
                    if 0 <= value < (24 * 60):
                        return value
                except Exception:
                    pass
                return fallback_minutes

            def _minutes_to_hhmm(total_minutes: int) -> str:
                bounded = max(0, min((24 * 60) - 1, int(total_minutes or 0)))
                hh = bounded // 60
                mm = bounded % 60
                return f"{hh:02d}:{mm:02d}"

            def _normalize_slot_times(start_hm: str, end_hm: str) -> Tuple[str, str]:
                start_min_raw = _parse_hhmm_to_minutes(start_hm, learning_window_start_min)
                end_min_raw = _parse_hhmm_to_minutes(end_hm, learning_window_end_min)
                start_min = max(start_min_raw, learning_window_start_min)
                end_min = min(end_min_raw, learning_window_end_min)
                if end_min <= start_min:
                    start_min = learning_window_start_min
                    end_min = min(learning_window_end_min, start_min + 60)
                    if end_min <= start_min:
                        end_min = min((24 * 60) - 1, start_min + 15)
                return _minutes_to_hhmm(start_min), _minutes_to_hhmm(end_min)

            def _slot_duration_minutes(slot: Dict[str, Any]) -> int:
                return _minutes_from_hhmm(
                    str(slot.get("start_time") or "09:00"),
                    str(slot.get("end_time") or "10:00"),
                    default_minutes=60,
                )

            def _slot_capacity_minutes(slot: Dict[str, Any]) -> int:
                if target_kind != "hours":
                    return _slot_duration_minutes(slot)
                slot_start_min = _parse_hhmm_to_minutes(
                    str(slot.get("start_time") or learning_window_start_hhmm),
                    learning_window_start_min,
                )
                remaining_in_window = learning_window_end_min - slot_start_min
                if remaining_in_window <= 0:
                    return 0
                return max(15, min(max_minutes_per_slot_for_hours, remaining_in_window))

            def _add_minutes_hhmm(start_hm: str, add_minutes: int) -> str:
                try:
                    sh, sm = [int(x) for x in str(start_hm or learning_window_start_hhmm).split(":")]
                    total = (sh * 60 + sm) + int(max(add_minutes, 1))
                    total = max(1, min(total, learning_window_end_min))
                    eh = total // 60
                    em = total % 60
                    return f"{eh:02d}:{em:02d}"
                except Exception:
                    return learning_window_end_hhmm
            while True:
                candidate_slots = []
                for block in filtered_blocks:
                    sid = str(block.get("subject_id") or "").strip()
                    if not sid:
                        continue
                    dates = get_block_occurrence_dates(block, fix_start_obj, fix_end_obj, exclusion_ranges)
                    for d in dates:
                        weekday_num = int((d.weekday() + 1) % 7)
                        if weekday_num not in preferred_allowed_weekdays:
                            continue
                        ymd = d.isoformat()
                        norm_start, norm_end = _normalize_slot_times(
                            str(block.get("start_time") or learning_window_start_hhmm),
                            str(block.get("end_time") or learning_window_end_hhmm),
                        )
                        candidate_slots.append({
                            "date": ymd,
                            "subject_id": sid,
                            "block_id": block.get("block_id"),
                            "start_time": norm_start,
                            "end_time": norm_end,
                            "all_day": False,
                            "child_ids": list(block.get("child_ids") or []),
                        })
                if dense_fallback_enabled:
                    # Keep saved class duration, but allow trying preferred learning weekdays
                    # when saved cadence is too sparse to close gap.
                    existing_sid_day = {
                        f"{str(slot.get('subject_id') or '').strip()}:{str(slot.get('date') or '')[:10]}"
                        for slot in candidate_slots
                        if str(slot.get("subject_id") or "").strip() and str(slot.get("date") or "")[:10]
                    }
                    template_by_sid: Dict[str, Dict[str, Any]] = {}
                    for block in filtered_blocks:
                        sid = str(block.get("subject_id") or "").strip()
                        if not sid or sid in template_by_sid:
                            continue
                        norm_start, norm_end = _normalize_slot_times(
                            str(block.get("start_time") or learning_window_start_hhmm),
                            str(block.get("end_time") or learning_window_end_hhmm),
                        )
                        template_by_sid[sid] = {
                            "start_time": norm_start,
                            "end_time": norm_end,
                            "child_ids": list(block.get("child_ids") or []),
                            "block_id": block.get("block_id"),
                        }
                    dense_subject_ids = requested_subject_ids if requested_subject_ids else sorted(requested_subject_set)
                    for sid in dense_subject_ids:
                        sid_clean = str(sid or "").strip()
                        tpl = template_by_sid.get(sid_clean)
                        if not sid_clean or not tpl:
                            continue
                        dense_block = {
                            "subject_id": sid_clean,
                            "weekdays": list(preferred_allowed_weekdays),
                            "start_time": tpl.get("start_time") or learning_window_start_hhmm,
                            "end_time": tpl.get("end_time") or learning_window_end_hhmm,
                            "all_day": False,
                            "child_ids": list(tpl.get("child_ids") or []),
                            "block_id": tpl.get("block_id"),
                        }
                        dense_dates = get_block_occurrence_dates(dense_block, fix_start_obj, fix_end_obj, exclusion_ranges)
                        for d in dense_dates:
                            ymd = d.isoformat()
                            sid_day_key = f"{sid_clean}:{ymd}"
                            if sid_day_key in existing_sid_day:
                                continue
                            existing_sid_day.add(sid_day_key)
                            candidate_slots.append({
                                "date": ymd,
                                "subject_id": sid_clean,
                                "block_id": dense_block.get("block_id"),
                                "start_time": dense_block["start_time"],
                                "end_time": dense_block["end_time"],
                                "all_day": False,
                                "child_ids": list(dense_block.get("child_ids") or []),
                            })
                candidate_slots.sort(key=lambda s: (s["date"], str(s.get("start_time") or ""), str(s.get("subject_id") or "")))
                # Compute how many truly addable keys exist for this window.
                preview_used = set(day_set_before)
                potential_selected_count = 0
                for slot in candidate_slots:
                    ymd = slot["date"]
                    sid = str(slot.get("subject_id") or "").strip()
                    if target_kind == "days":
                        key = ymd if scope == "overall" else f"{sid}:{ymd}"
                    else:
                        key = f"{sid}:{ymd}:{str(slot.get('start_time') or '09:00')}"
                    if key in preview_used:
                        continue
                    preview_used.add(key)
                    potential_selected_count += 1 if target_kind == "days" else _slot_capacity_minutes(slot)
                    if potential_selected_count >= progress_needed:
                        break

                should_keep_extending_for_conflicts = (
                    target_kind == "hours"
                    and bool(body.enforce_conflict_checks)
                )
                if potential_selected_count >= progress_needed and not should_keep_extending_for_conflicts:
                    break
                if fix_end_obj >= hard_cap_end_obj:
                    break
                next_end = fix_end_obj + timedelta(days=30)
                fix_end_obj = next_end if next_end <= hard_cap_end_obj else hard_cap_end_obj

            family_child_ids: List[str] = []
            if body.enforce_conflict_checks:
                try:
                    children_resp = (
                        supabase.table("child")
                        .select("id")
                        .eq("family_id", family_id)
                        .execute()
                    )
                    family_child_ids = [str(r.get("id")) for r in (children_resp.data or []) if str(r.get("id") or "").strip()]
                except Exception:
                    family_child_ids = []

            conflict_windows_by_day_child: Dict[str, Dict[str, List[Tuple[int, int]]]] = {}
            if body.enforce_conflict_checks:
                try:
                    conflict_events_resp = (
                        supabase.table("events")
                        .select("id, start_ts, end_ts, due_ts, status, deleted_at, child_id, child_ids, all_day")
                        .eq("family_id", family_id)
                        .is_("deleted_at", None)
                        .neq("status", "canceled")
                        .gte("start_ts", f"{fix_start_obj.isoformat()}T00:00:00")
                        .lte("start_ts", f"{fix_end_obj.isoformat()}T23:59:59")
                        .execute()
                    )
                    for ev in (conflict_events_resp.data or []):
                        day_key = str(ev.get("start_ts") or ev.get("due_ts") or "")[:10]
                        if len(day_key) != 10:
                            continue
                        child_ids = [str(cid) for cid in (ev.get("child_ids") or []) if str(cid).strip()]
                        child_id_single = str(ev.get("child_id") or "").strip()
                        if child_id_single:
                            child_ids.append(child_id_single)
                        if not child_ids:
                            child_ids = list(family_child_ids)
                        if not child_ids:
                            continue
                        all_day = bool(ev.get("all_day"))
                        if all_day:
                            start_min = 0
                            end_min = 24 * 60
                        else:
                            start_hm = str(ev.get("start_ts") or "")[11:16]
                            end_hm = str(ev.get("end_ts") or "")[11:16]
                            try:
                                sh, sm = [int(x) for x in start_hm.split(":")]
                                start_min = sh * 60 + sm
                            except Exception:
                                start_min = 9 * 60
                            try:
                                eh, em = [int(x) for x in end_hm.split(":")]
                                end_min = eh * 60 + em
                            except Exception:
                                end_min = start_min + 60
                            if end_min <= start_min:
                                end_min = start_min + 60
                        day_bucket = conflict_windows_by_day_child.setdefault(day_key, {})
                        for cid in child_ids:
                            day_bucket.setdefault(cid, []).append((start_min, end_min))
                except Exception:
                    conflict_windows_by_day_child = {}

            def _slot_conflicts(slot: Dict[str, Any]) -> bool:
                if not body.enforce_conflict_checks:
                    return False
                day_key = str(slot.get("date") or "")[:10]
                if len(day_key) != 10:
                    return True
                slot_child_ids = [str(cid) for cid in (slot.get("child_ids") or []) if str(cid).strip()]
                if not slot_child_ids:
                    slot_child_ids = list(family_child_ids)
                if not slot_child_ids:
                    return False
                all_day = bool(slot.get("all_day"))
                if all_day:
                    slot_start = 0
                    slot_end = 24 * 60
                else:
                    st = str(slot.get("start_time") or "09:00")
                    et = str(slot.get("end_time") or "10:00")
                    try:
                        sh, sm = [int(x) for x in st.split(":")]
                        slot_start = sh * 60 + sm
                    except Exception:
                        slot_start = 9 * 60
                    try:
                        eh, em = [int(x) for x in et.split(":")]
                        slot_end = eh * 60 + em
                    except Exception:
                        slot_end = slot_start + 60
                    if slot_end <= slot_start:
                        slot_end = slot_start + 60
                day_bucket = conflict_windows_by_day_child.get(day_key, {})
                def _overlaps_any(start_min: int, end_min: int) -> bool:
                    for cid in slot_child_ids:
                        for existing_start, existing_end in (day_bucket.get(cid) or []):
                            if start_min < existing_end and end_min > existing_start:
                                return True
                    return False
                if not _overlaps_any(slot_start, slot_end):
                    return False
                # If a slot conflicts, try to re-time it within saved learning window.
                # This allows filling open time on already-scheduled days (e.g. 8-9, 10-3).
                desired_duration = max(15, slot_end - slot_start)
                if target_kind == "days":
                    # Day targets count one day, so a 60-minute placeholder is enough.
                    desired_duration = min(60, learning_window_span_minutes)
                desired_duration = min(desired_duration, learning_window_span_minutes)
                latest_start = learning_window_end_min - desired_duration
                probe_start = learning_window_start_min
                while probe_start <= latest_start:
                    probe_end = probe_start + desired_duration
                    if not _overlaps_any(probe_start, probe_end):
                        slot["start_time"] = _minutes_to_hhmm(probe_start)
                        slot["end_time"] = _minutes_to_hhmm(probe_end)
                        return False
                    probe_start += 15
                return True

            def _register_slot_window(slot: Dict[str, Any]) -> None:
                if not body.enforce_conflict_checks:
                    return
                day_key = str(slot.get("date") or "")[:10]
                if len(day_key) != 10:
                    return
                slot_child_ids = [str(cid) for cid in (slot.get("child_ids") or []) if str(cid).strip()]
                if not slot_child_ids:
                    slot_child_ids = list(family_child_ids)
                if not slot_child_ids:
                    return
                all_day = bool(slot.get("all_day"))
                if all_day:
                    slot_start = 0
                    slot_end = 24 * 60
                else:
                    st = str(slot.get("start_time") or "09:00")
                    et = str(slot.get("end_time") or "10:00")
                    try:
                        sh, sm = [int(x) for x in st.split(":")]
                        slot_start = sh * 60 + sm
                    except Exception:
                        slot_start = 9 * 60
                    try:
                        eh, em = [int(x) for x in et.split(":")]
                        slot_end = eh * 60 + em
                    except Exception:
                        slot_end = slot_start + 60
                    if slot_end <= slot_start:
                        slot_end = slot_start + 60
                day_bucket = conflict_windows_by_day_child.setdefault(day_key, {})
                for cid in slot_child_ids:
                    day_bucket.setdefault(cid, []).append((slot_start, slot_end))

            selected_slots: List[Dict[str, Any]] = []
            used_keys = set(day_set_before)
            selected_progress = 0
            if scope == "overall":
                rotation_subject_ids = []
                # Prefer requested subject order from UI so overall fill stays balanced
                # even when the saved plan blocks are missing one of those subjects.
                for sid in requested_subject_ids:
                    sid_clean = str(sid or "").strip()
                    if sid_clean and sid_clean not in rotation_subject_ids:
                        rotation_subject_ids.append(sid_clean)
                if not rotation_subject_ids:
                    for block in filtered_blocks:
                        sid = str(block.get("subject_id") or "").strip()
                        if sid and sid not in rotation_subject_ids:
                            rotation_subject_ids.append(sid)
                if not rotation_subject_ids:
                    rotation_subject_ids = sorted({
                        str(slot.get("subject_id") or "").strip()
                        for slot in candidate_slots
                        if str(slot.get("subject_id") or "").strip()
                    })
                subject_index_by_id = {sid: idx for idx, sid in enumerate(rotation_subject_ids)}
                selected_count_by_subject = defaultdict(int)
                selected_count_by_subject_week = defaultdict(int)
                last_chosen_subject_id = ""
                rotation_pointer = 0
                slots_by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
                for slot in candidate_slots:
                    day_key = str(slot.get("date") or "")[:10]
                    if len(day_key) == 10:
                        slots_by_day[day_key].append(slot)
                for day_key in sorted(slots_by_day.keys()):
                    if day_key in used_keys:
                        continue
                    day_slots = slots_by_day.get(day_key) or []
                    day_slots = [slot for slot in day_slots if not _slot_conflicts(slot)]
                    if not day_slots:
                        continue

                    def _rotation_distance(subject_id: str) -> int:
                        if not rotation_subject_ids:
                            return 0
                        idx = subject_index_by_id.get(subject_id, 0)
                        return (idx - rotation_pointer) % len(rotation_subject_ids)

                    # Only choose subjects that actually have an eligible slot on this day.
                    # This prevents assigning a subject into another subject's time window.
                    day_slots.sort(
                        key=lambda slot: (
                            str(slot.get("start_time") or ""),
                            str(slot.get("subject_id") or ""),
                        )
                    )
                    slot_by_subject: Dict[str, Dict[str, Any]] = {}
                    for slot in day_slots:
                        sid = str(slot.get("subject_id") or "").strip()
                        if not sid:
                            continue
                        # Days mode keeps one representative slot per subject/day.
                        # Hours mode can consume multiple slots per subject/day.
                        if target_kind == "days" and sid in slot_by_subject:
                            continue
                        slot_by_subject[sid] = slot
                    if target_kind == "days" and not slot_by_subject:
                        continue

                    try:
                        day_obj = date.fromisoformat(day_key)
                        week_start = (day_obj - timedelta(days=day_obj.weekday())).isoformat()
                    except Exception:
                        week_start = day_key

                    # For day targets, pick one balanced subject per day.
                    # For hours targets, keep selecting additional non-conflicting slots
                    # on the same day until we hit progress or run out of slots.
                    while True:
                        chosen_sid = ""
                        chosen: Optional[Dict[str, Any]] = None
                        if target_kind == "hours":
                            available_day_slots: List[Dict[str, Any]] = []
                            for slot in day_slots:
                                sid = str(slot.get("subject_id") or "").strip()
                                if not sid:
                                    continue
                                key = f"{sid}:{day_key}:{str(slot.get('start_time') or '09:00')}"
                                if key in used_keys:
                                    continue
                                if _slot_conflicts(slot):
                                    continue
                                available_day_slots.append(slot)
                            if not available_day_slots:
                                break
                            chosen = min(
                                available_day_slots,
                                key=lambda slot: (
                                    selected_count_by_subject[str(slot.get("subject_id") or "").strip()],
                                    selected_count_by_subject_week[f"{week_start}:{str(slot.get('subject_id') or '').strip()}"],
                                    1 if (
                                        last_chosen_subject_id
                                        and str(slot.get("subject_id") or "").strip() == last_chosen_subject_id
                                        and len(available_day_slots) > 1
                                    ) else 0,
                                    _rotation_distance(str(slot.get("subject_id") or "").strip()),
                                    str(slot.get("start_time") or ""),
                                    str(slot.get("subject_id") or ""),
                                ),
                            )
                            chosen_sid = str(chosen.get("subject_id") or "").strip()
                        else:
                            if not slot_by_subject:
                                break
                            if rotation_subject_ids:
                                available_sids = [sid for sid in rotation_subject_ids if sid in slot_by_subject]
                            else:
                                available_sids = []
                            if not available_sids:
                                available_sids = sorted(slot_by_subject.keys())
                            if not available_sids:
                                break
                            chosen_sid = min(
                                available_sids,
                                key=lambda sid: (
                                    selected_count_by_subject[sid],
                                    selected_count_by_subject_week[f"{week_start}:{sid}"],
                                    1 if (last_chosen_subject_id and sid == last_chosen_subject_id and len(available_sids) > 1) else 0,
                                    _rotation_distance(sid),
                                    sid,
                                ),
                            )
                            chosen = slot_by_subject[chosen_sid]
                        if not chosen:
                            break
                        chosen_day = str(chosen.get("date") or "")[:10]
                        if target_kind == "days":
                            chosen_key = chosen_day
                        else:
                            chosen_key = f"{chosen_sid}:{chosen_day}:{str(chosen.get('start_time') or '09:00')}"
                        if chosen_key in used_keys:
                            if target_kind == "days":
                                slot_by_subject.pop(chosen_sid, None)
                            continue
                        used_keys.add(chosen_key)
                        selected_slots.append(chosen)
                        _register_slot_window(chosen)
                        selected_progress += 1 if target_kind == "days" else _slot_capacity_minutes(chosen)
                        if chosen_sid:
                            selected_count_by_subject[chosen_sid] += 1
                            selected_count_by_subject_week[f"{week_start}:{chosen_sid}"] += 1
                            last_chosen_subject_id = chosen_sid
                            if rotation_subject_ids:
                                chosen_idx = subject_index_by_id.get(chosen_sid, 0)
                                rotation_pointer = (chosen_idx + 1) % len(rotation_subject_ids)
                        if selected_progress >= progress_needed:
                            break
                        if target_kind == "days":
                            break
                        # Hours mode continues with remaining day slots.

                    if selected_progress >= progress_needed:
                        break
            else:
                for slot in candidate_slots:
                    ymd = slot["date"]
                    sid = str(slot.get("subject_id") or "").strip()
                    if target_kind == "days":
                        key = f"{sid}:{ymd}"
                    else:
                        key = f"{sid}:{ymd}:{str(slot.get('start_time') or '09:00')}"
                    if key in used_keys:
                        continue
                    if _slot_conflicts(slot):
                        continue
                    used_keys.add(key)
                    selected_slots.append(slot)
                    _register_slot_window(slot)
                    selected_progress += 1 if target_kind == "days" else _slot_capacity_minutes(slot)
                    if selected_progress >= progress_needed:
                        break

            print(
                "[FixGapDebug] candidates",
                {
                    "daysNeeded": days_needed if target_kind == "days" else None,
                    "minutesNeeded": minutes_needed if target_kind == "hours" else None,
                    "candidateDatesCount": len(candidate_slots),
                    "selectedDatesCount": len(selected_slots),
                    "potentialSelectedCount": potential_selected_count,
                    "selectedProgress": selected_progress,
                    "requestedSubjectIds": requested_subject_ids if scope == "overall" else None,
                    "selectedBySubject": (
                        dict(sorted(selected_count_by_subject.items()))
                        if scope == "overall"
                        else None
                    ),
                },
                flush=True,
            )
            debug_candidate_dates_count = len(candidate_slots)
            debug_selected_dates_count = len(selected_slots)
            if selected_progress < progress_needed:
                return FixTargetGapOutput(
                    success=False,
                    academic_year_id=body.academic_year_id,
                    scope=scope,
                    subject_id=target_subject_id,
                    target_kind=target_kind,
                    target_value=float(target_value_num),
                    beforeProjectedDays=before_projected_days,
                    afterProjectedDays=before_projected_days,
                    beforeGapDays=before_gap_days,
                    afterGapDays=before_gap_days,
                    beforeProjectedHours=before_projected_hours,
                    afterProjectedHours=before_projected_hours,
                    beforeGapHours=before_gap_hours,
                    afterGapHours=before_gap_hours,
                    createdEvents=0,
                    removedEvents=0,
                    createdEventIds=[],
                    removedEventIds=[],
                    debugDaysNeeded=days_needed if target_kind == "days" else None,
                    debugCandidateDatesCount=debug_candidate_dates_count,
                    debugSelectedDatesCount=debug_selected_dates_count,
                    debugPotentialSelectedCount=potential_selected_count,
                    debugInsertedCount=0,
                    debugSelectedSlots=[
                        {
                            "date": str(slot.get("date") or ""),
                            "subject_id": str(slot.get("subject_id") or ""),
                            "start_time": str(slot.get("start_time") or "09:00"),
                            "end_time": str(slot.get("end_time") or "10:00"),
                            "all_day": bool(slot.get("all_day")),
                        }
                        for slot in selected_slots
                    ],
                    debugFailureReason=(
                        "insufficient_eligible_dates_in_strict_range"
                        if body.strict_range
                        else "insufficient_eligible_dates_after_extension"
                    ),
                    debugInitialRangeEnd=effective_end_obj.isoformat(),
                    debugFinalRangeEnd=fix_end_obj.isoformat(),
                    message=(
                        (
                            f"Not enough eligible slot-minutes in the selected school-year range (found {selected_progress}/{progress_needed} minutes)."
                            if body.strict_range
                            else f"Not enough eligible slot-minutes using saved cadence (found {selected_progress}/{progress_needed}) even after automatic extension cap."
                        )
                        if target_kind == "hours"
                        else (
                            f"Not enough eligible new dates in the selected school-year range (found {len(selected_slots)}/{days_needed})."
                            if body.strict_range
                            else f"Not enough eligible new dates using saved cadence (found {len(selected_slots)}/{days_needed}) even after automatic extension cap."
                        )
                    ),
                )

            created_events: List[Dict[str, Any]] = []
            assigned_count_for_insert = len(selected_slots)
            attempted_insert_count = assigned_count_for_insert
            successful_insert_count = 0
            failed_insert_count = 0
            failed_insert_reasons: Dict[str, int] = {}
            if selected_slots and not body.dry_run:
                # Keep selected subject assignments from slot selection. Do not rotate again
                # during insert, otherwise requested subjects can be dropped unexpectedly.
                subject_template_by_id: Dict[str, Dict[str, Any]] = {}
                for block in filtered_blocks:
                    sid = str(block.get("subject_id") or "").strip()
                    if not sid or sid in subject_template_by_id:
                        continue
                    norm_start, norm_end = _normalize_slot_times(
                        str(block.get("start_time") or learning_window_start_hhmm),
                        str(block.get("end_time") or learning_window_end_hhmm),
                    )
                    subject_template_by_id[sid] = {
                        "subject_id": sid,
                        "start_time": norm_start,
                        "end_time": norm_end,
                        "all_day": False,
                        "child_ids": list(block.get("child_ids") or []),
                    }
                remaining_minutes_to_allocate = minutes_needed if target_kind == "hours" else 0
                for slot_idx, slot in enumerate(selected_slots):
                    slot_for_insert = slot
                    sid = str(slot.get("subject_id") or "").strip()
                    tpl = subject_template_by_id.get(sid) or {}
                    if scope == "overall" and tpl:
                        # Preserve the conflict-safe time window chosen during slot selection.
                        # Only backfill child_ids if the selected slot does not already have them.
                        slot_for_insert = {
                            **slot,
                            "child_ids": list(slot.get("child_ids") or tpl.get("child_ids") or []),
                        }
                    eid = str(uuid.uuid4())
                    st, et = _normalize_slot_times(
                        str(slot_for_insert.get("start_time") or learning_window_start_hhmm),
                        str(slot_for_insert.get("end_time") or learning_window_end_hhmm),
                    )
                    slot_minutes = _minutes_from_hhmm(st, et, default_minutes=60)
                    allocated_minutes = slot_minutes
                    if target_kind == "hours":
                        remaining_slots = max(1, len(selected_slots) - slot_idx)
                        min_slot_minutes = max(15, slot_minutes)
                        max_slot_minutes = max(min_slot_minutes, _slot_capacity_minutes(slot_for_insert))
                        even_share = int(math.ceil(max(remaining_minutes_to_allocate, 0) / remaining_slots))
                        target_for_this = max(min_slot_minutes, even_share)
                        allocated_minutes = min(max_slot_minutes, target_for_this)
                        remaining_minutes_to_allocate = max(0, remaining_minutes_to_allocate - allocated_minutes)
                        et = _add_minutes_hhmm(st, allocated_minutes)
                    child_ids = [str(cid) for cid in (slot_for_insert.get("child_ids") or []) if str(cid).strip()]
                    subject_id_for_insert = str(slot_for_insert.get("subject_id") or "").strip()
                    event_title = subject_name_by_id.get(subject_id_for_insert) or "Lesson"
                    raw_source_block_id = str(slot_for_insert.get("block_id") or "").strip()
                    safe_source_block_id = None
                    if raw_source_block_id:
                        try:
                            safe_source_block_id = str(uuid.UUID(raw_source_block_id))
                        except Exception:
                            safe_source_block_id = None
                    created_rows.append({
                        "id": eid,
                        "family_id": family_id,
                        "created_by": user.get("id"),
                        "updated_by": user.get("id"),
                        "academic_year_id": body.academic_year_id,
                        "subject_id": subject_id_for_insert or None,
                        "title": event_title,
                        "event_type": "Lesson",
                        "status": "scheduled",
                        "source": "year_plan_seed",
                        "start_ts": _slot_iso_utc(slot["date"], st),
                        "end_ts": _slot_iso_utc(slot["date"], et),
                        "counts_toward_plan": True,
                        "instructional_minutes": allocated_minutes if target_kind == "hours" else None,
                        "instructional_status": "PLAN_PLACEHOLDER",
                        "is_placeholder": True,
                        "generated_by": "target_gap_fix",
                        "source_block_id": safe_source_block_id,
                        "child_id": (child_ids[0] if child_ids else None),
                        "child_ids": child_ids,
                    })
                if created_rows:
                    print("[FixGapDebug] insert payload", created_rows, flush=True)
                    def _is_overlap_insert_error(exc: Exception) -> bool:
                        raw = str(exc or "").lower()
                        return ("p0001" in raw) or ("overlap" in raw and "event" in raw)

                    def _retime_and_insert_on_conflict(row_payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
                        if not bool(body.enforce_conflict_checks):
                            return None
                        day_key = str(row_payload.get("start_ts") or "")[:10]
                        if len(day_key) != 10:
                            return None
                        start_hm = str(row_payload.get("start_ts") or "")[11:16]
                        end_hm = str(row_payload.get("end_ts") or "")[11:16]
                        try:
                            sh, sm = [int(x) for x in start_hm.split(":")]
                            eh, em = [int(x) for x in end_hm.split(":")]
                            duration_minutes = max(15, (eh * 60 + em) - (sh * 60 + sm))
                        except Exception:
                            duration_minutes = 60
                        duration_minutes = min(duration_minutes, max(15, learning_window_end_min - learning_window_start_min))
                        latest_start_min = learning_window_end_min - duration_minutes
                        if latest_start_min < learning_window_start_min:
                            return None
                        original_start_min = _to_minutes_or_none(start_hm)
                        candidate_start_minutes = []
                        for probe in range(learning_window_start_min, latest_start_min + 1, 15):
                            if original_start_min is not None and probe == original_start_min:
                                continue
                            candidate_start_minutes.append(probe)
                        if original_start_min is not None:
                            candidate_start_minutes.sort(key=lambda p: (abs(p - original_start_min), p))
                        for probe_start in candidate_start_minutes:
                            probe_end = probe_start + duration_minutes
                            probe_start_hhmm = _minutes_to_hhmm_simple(probe_start)
                            probe_end_hhmm = _minutes_to_hhmm_simple(probe_end)
                            candidate_row = {
                                **row_payload,
                                "start_ts": _slot_iso_utc(day_key, probe_start_hhmm),
                                "end_ts": _slot_iso_utc(day_key, probe_end_hhmm),
                            }
                            try:
                                one = supabase.table("events").insert(candidate_row).execute()
                                data = list(one.data or [])
                                if data:
                                    return data[0]
                            except Exception as candidate_exc:
                                if not _is_overlap_insert_error(candidate_exc):
                                    continue
                        return None
                    def _recover_on_insert_error(row_payload: Dict[str, Any], row_exc: Exception) -> Optional[Dict[str, Any]]:
                        if _is_overlap_insert_error(row_exc):
                            return _retime_and_insert_on_conflict(row_payload)
                        return None
                    observed_insert = insertFixGapEventsWithObservability(
                        eventsToInsert=created_rows,
                        assignedCount=len(selected_slots),
                        preinsertFailures=[],
                        dryRun=False,
                        logPrefix="[FixGapLegacy]",
                        recoverOnInsertError=_recover_on_insert_error,
                    )
                    inserted_rows = list(observed_insert.get("insertedRows") or [])
                    inserted_ids = [str(i) for i in (observed_insert.get("insertedIds") or []) if str(i).strip()]
                    attempted_insert_count = int(observed_insert.get("attemptedInsertCount") or 0)
                    successful_insert_count = int(observed_insert.get("successfulInsertCount") or 0)
                    failed_insert_count = int(observed_insert.get("failedInsertCount") or 0)
                    failed_insert_reasons = dict(observed_insert.get("failedInsertReasons") or {})
                    print(
                        "[FixGapDebug] insert result",
                        {
                            "attemptedInsertCount": attempted_insert_count,
                            "successfulInsertCount": successful_insert_count,
                            "failedInsertCount": failed_insert_count,
                            "failedInsertReasons": failed_insert_reasons,
                            "insertedCount": len(inserted_rows),
                            "inserted": inserted_rows,
                        },
                        flush=True,
                    )
                    created_events = inserted_rows
                    created_event_ids = inserted_ids
                    debug_inserted_count = successful_insert_count
                    if (not body.strict_range) and fix_end_obj > end_date_obj:
                        new_end_ymd = fix_end_obj.isoformat()
                        supabase.table("academic_year_plan").update({
                            "end_date": new_end_ymd,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }).eq("academic_year_id", body.academic_year_id).execute()
                        supabase.table("academic_years").update({
                            "end_date": new_end_ymd,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }).eq("id", body.academic_year_id).execute()
            else:
                created_event_ids = [str(i) for i in range(len(selected_slots))]
                created_events = [{
                    "id": f"dry-run-{idx}",
                    "start_ts": _slot_iso_utc(slot["date"], str(slot.get("start_time") or learning_window_start_hhmm)),
                    "subject_id": slot.get("subject_id"),
                    "counts_toward_plan": True,
                } for idx, slot in enumerate(selected_slots)]
                successful_insert_count = len(selected_slots)
                attempted_insert_count = len(selected_slots)
                failed_insert_count = 0
                failed_insert_reasons = {}
                debug_inserted_count = len(selected_slots)

            print(
                "[FixGapDebug] create result",
                {
                    "daysNeeded": days_needed,
                    "candidateDatesCount": len(candidate_slots),
                    "selectedDatesCount": len(selected_slots),
                    "createdEventsCount": len(created_events),
                    "assignedCount": assigned_count_for_insert,
                    "attemptedInsertCount": attempted_insert_count,
                    "successfulInsertCount": successful_insert_count,
                    "failedInsertCount": failed_insert_count,
                    "failedInsertReasons": failed_insert_reasons,
                    "createdEvents": created_events,
                    "requestedRangeStart": range_start_ymd or None,
                    "requestedRangeEnd": range_end_ymd or None,
                    "initialRangeEnd": effective_end_obj.isoformat(),
                    "fixRangeStart": fix_start_obj.isoformat(),
                    "fixRangeEnd": fix_end_obj.isoformat(),
                },
                flush=True,
            )

            # Recompute with synthetic created events if dry-run.
            synthetic_created = created_rows if created_rows else [{
                "id": f"dry-run-{idx}",
                "subject_id": slot.get("subject_id"),
                "start_ts": _slot_iso_utc(slot["date"], str(slot.get("start_time") or learning_window_start_hhmm)),
                "end_ts": _slot_iso_utc(slot["date"], str(slot.get("end_time") or learning_window_end_hhmm)),
                "counts_toward_plan": True,
                "instructional_minutes": _slot_duration_minutes(slot) if target_kind == "hours" else None,
                "instructional_status": "PLAN_PLACEHOLDER",
            } for idx, slot in enumerate(selected_slots)]
            after_events = counted_events + synthetic_created
            after_projected_days = _projected_unique_days(after_events)
            after_projected_hours = _projected_total_hours(after_events)
            after_gap_days = int(target_days - after_projected_days)
            after_gap_hours = round(target_hours - after_projected_hours, 2)
            return FixTargetGapOutput(
                success=True,
                academic_year_id=body.academic_year_id,
                scope=scope,
                subject_id=target_subject_id,
                target_kind=target_kind,
                target_value=float(target_value_num),
                beforeProjectedDays=before_projected_days,
                afterProjectedDays=after_projected_days,
                beforeGapDays=before_gap_days,
                afterGapDays=after_gap_days,
                beforeProjectedHours=before_projected_hours,
                afterProjectedHours=after_projected_hours,
                beforeGapHours=before_gap_hours,
                afterGapHours=after_gap_hours,
                createdEvents=successful_insert_count,
                removedEvents=0,
                createdEventIds=created_event_ids,
                removedEventIds=[],
                debugDaysNeeded=days_needed if target_kind == "days" else None,
                debugCandidateDatesCount=debug_candidate_dates_count,
                debugSelectedDatesCount=debug_selected_dates_count,
                debugPotentialSelectedCount=potential_selected_count,
                debugInsertedCount=debug_inserted_count,
                debugSelectedSlots=[
                    {
                        "date": str(slot.get("date") or ""),
                        "subject_id": str(slot.get("subject_id") or ""),
                        "start_time": str(slot.get("start_time") or "09:00"),
                        "end_time": str(slot.get("end_time") or "10:00"),
                        "all_day": bool(slot.get("all_day")),
                    }
                    for slot in selected_slots
                ],
                debugInitialRangeEnd=effective_end_obj.isoformat(),
                debugFinalRangeEnd=fix_end_obj.isoformat(),
                assignedCount=assigned_count_for_insert,
                attemptedInsertCount=attempted_insert_count,
                successfulInsertCount=successful_insert_count,
                failedInsertCount=failed_insert_count,
                failedInsertReasons=failed_insert_reasons,
                datesWithCapacity=len(selected_slots),
                datesWithoutCapacity=max(0, len(candidate_slots) - len(selected_slots)),
                insertedCount=successful_insert_count,
                message="Gap fix applied." if not body.dry_run else "Dry run completed.",
            )

        # before_gap_days < 0: remove future unlocked placeholders first.
        abs_over = abs(before_gap_days)
        attendance_ids = set()
        event_ids = [str(ev.get("id")) for ev in counted_events if ev.get("id")]
        if event_ids:
            att_resp = (
                supabase.table("attendance_records")
                .select("event_id, status")
                .in_("event_id", event_ids)
                .execute()
            )
            for row in (att_resp.data or []):
                st = str(row.get("status") or "").strip().lower()
                if st in {"present", "partial"}:
                    attendance_ids.add(str(row.get("event_id")))

        today_iso = datetime.now(timezone.utc).date().isoformat()
        removable = []
        for ev in counted_events:
            eid = str(ev.get("id") or "").strip()
            day = _day_key(ev)
            gen_by = str(ev.get("generated_by") or "").strip().lower()
            status_raw = str(ev.get("status") or "").strip().lower()
            ins_status = str(ev.get("instructional_status") or "").strip().upper()
            if not eid or not day:
                continue
            if day < today_iso:
                continue
            if status_raw in {"done", "completed", "attended"}:
                continue
            if eid in attendance_ids:
                continue
            if ins_status == "MANUAL_COUNTS":
                continue
            if gen_by not in {"plan_year", "target_gap_fix"}:
                continue
            removable.append(ev)

        removable.sort(key=lambda ev: (_day_key(ev) or "", str(ev.get("start_ts") or "")))
        chosen_remove_ids: List[str] = []
        chosen_remove_days = set()
        for ev in removable:
            day = _day_key(ev)
            if not day:
                continue
            dedupe_key = day if scope == "overall" else f"{str(ev.get('subject_id') or '').strip()}:{day}"
            if dedupe_key in chosen_remove_days:
                continue
            chosen_remove_days.add(dedupe_key)
            chosen_remove_ids.append(str(ev.get("id")))
            if len(chosen_remove_ids) >= abs_over:
                break

        if chosen_remove_ids and not body.dry_run:
            now_iso = datetime.now(timezone.utc).isoformat()
            supabase.table("events").update({
                "counts_toward_plan": False,
                "status": "canceled",
                "deleted_at": now_iso,
            }).in_("id", chosen_remove_ids).execute()
            removed_event_ids = chosen_remove_ids
        else:
            removed_event_ids = chosen_remove_ids

        removed_set = set(removed_event_ids)
        remaining_events = [ev for ev in counted_events if str(ev.get("id") or "") not in removed_set]
        after_projected_days = _projected_unique_days(remaining_events)
        after_projected_hours = _projected_total_hours(remaining_events)
        after_gap_days = int(target_days - after_projected_days)
        after_gap_hours = round(target_hours - after_projected_hours, 2)
        return FixTargetGapOutput(
            success=True,
            academic_year_id=body.academic_year_id,
            scope=scope,
            subject_id=target_subject_id,
            target_kind=target_kind,
            target_value=float(target_value_num),
            beforeProjectedDays=before_projected_days,
            afterProjectedDays=after_projected_days,
            beforeGapDays=before_gap_days,
            afterGapDays=after_gap_days,
            beforeProjectedHours=before_projected_hours,
            afterProjectedHours=after_projected_hours,
            beforeGapHours=before_gap_hours,
            afterGapHours=after_gap_hours,
            createdEvents=0,
            removedEvents=len(removed_event_ids),
            createdEventIds=[],
            removedEventIds=removed_event_ids,
            debugSelectedSlots=[],
            message="Gap fix applied." if not body.dry_run else "Dry run completed.",
        )
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.fix_target_gap.error", user_id=user.get("id"), error=str(e))
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fix target gap: {str(e)}")


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
    __: None = Depends(rate_limiter_relaxed),
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

        def _parse_date(v):
            if v is None:
                return None
            s = (v.isoformat() if hasattr(v, "isoformat") else str(v))[:10]
            return date.fromisoformat(s)

        seen = set()  # (date_str, name) for dedupe
        result = []

        # No academic years: always show default US public holidays on calendar (no plan required)
        if not years_resp.data:
            for year in range(start_date.year, end_date.year + 1):
                try:
                    global_holidays = fetch_global_holidays("US", year, "NAGER_DATE", None, None)
                    for gh in global_holidays:
                        d = gh.date if hasattr(gh.date, "year") else date.fromisoformat(str(gh.date)[:10])
                        if start_date <= d <= end_date:
                            date_str = d.isoformat() if hasattr(d, "isoformat") else str(d)[:10]
                            key = (date_str, gh.name or "")
                            if key not in seen:
                                seen.add(key)
                                result.append({"date": date_str, "name": gh.name or "", "type": "GLOBAL_HOLIDAY"})
                except Exception:
                    pass
            result.sort(key=lambda x: (x["date"], x["name"]))
            return {"holidays": result}

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
                # Calendar always shows holidays; "Follow public holidays" switch only affects scheduling (e.g. plan apply).
                if holiday_settings is None:
                    include_global = True
                    country_code = "US"
                    region = None
                    provider = "NAGER_DATE"
                    excluded_holiday_dates = []
                else:
                    include_global = True  # Always include for calendar display; follow_global_holidays only gates scheduling
                    country_code = holiday_settings.get("holiday_country_code") or "US"
                    region = holiday_settings.get("holiday_region")
                    provider = holiday_settings.get("provider") or "NAGER_DATE"
                    raw_excluded = holiday_settings.get("excluded_holiday_dates")
                    excluded_holiday_dates = list(raw_excluded) if isinstance(raw_excluded, list) else []
                holidays = get_holidays_for_year(
                    supabase,
                    row["id"],
                    include_global=include_global,
                    country_code=country_code,
                    region=region,
                    provider=provider,
                    excluded_holiday_dates=excluded_holiday_dates or None,
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

        try:
            start_date_obj = date.fromisoformat(body.start_date)
        except (ValueError, TypeError) as e:
            raise HTTPException(
                status_code=400,
                detail=f"start_date must be YYYY-MM-DD: got {body.start_date!r}",
            ) from e
        try:
            end_date_obj = date.fromisoformat(body.end_date)
        except (ValueError, TypeError) as e:
            raise HTTPException(
                status_code=400,
                detail=f"end_date must be YYYY-MM-DD: got {body.end_date!r}",
            ) from e
        if start_date_obj > end_date_obj:
            raise HTTPException(
                status_code=400,
                detail=f"start_date must be <= end_date (got start_date={body.start_date!r}, end_date={body.end_date!r})",
            )

        holiday_dates = [h.date for h in body.custom_holidays]
        if body.follow_public_holidays and body.holiday_region:
            country_code = body.holiday_region.split(":")[0] if ":" in body.holiday_region else body.holiday_region
            region_code = body.holiday_region.split(":")[1] if ":" in body.holiday_region and len(body.holiday_region.split(":")) > 1 else None
            for year in {start_date_obj.year, end_date_obj.year}:
                global_holidays = fetch_global_holidays(
                    country_code, year, "NAGER_DATE", region_code, None
                )
                for gh in global_holidays:
                    if start_date_obj <= gh.date <= end_date_obj:
                        holiday_dates.append(gh.date.isoformat())

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

        days_excluded_holidays = None
        if body.follow_public_holidays and body.holiday_region:
            custom_only_dates = [h.date for h in body.custom_holidays]
            exclusion_ranges_no_global = exclusion_ranges_from_breaks_and_holidays(
                [{"start": b.start, "end": b.end} for b in body.custom_breaks],
                custom_only_dates,
            )
            result_no_global = compute_schedule_potential(
                blocks_dict,
                start_date_obj,
                end_date_obj,
                exclusion_ranges_no_global,
                target_days=None,
                plan_children_ids=body.plan_children_ids,
                subject_targets=None,
            )
            days_excluded_holidays = max(0, result_no_global["projected_days"] - projected_days)

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
            suggested_end_date=result.get("suggested_end_date"),
            per_subject=result.get("per_subject"),
            per_child=result.get("per_child"),
            per_child_subject=result.get("per_child_subject"),
            days_excluded_holidays=days_excluded_holidays,
            cadence_suggestion=result.get("cadence_suggestion"),
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
    delete_plan: bool = Query(False, description="If True and academic_year_id set, also delete the academic year record (full plan removal)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Remove Plan Year plan events. By default clears all plan events for the family.
    If academic_year_id is provided, clears only that year's plan events (validates family ownership).
    Touches events where generated_by='plan_year' (and optional academic_year_id); deleted_at is null.
    Uses soft delete (sets deleted_at) so calendar/views that filter deleted_at IS NULL stop showing them.
    If delete_plan=True and academic_year_id is set, also deletes the academic_year row (CASCADE removes
    academic_year_plan, holidays, class_days, exclusions). Events keep rows but academic_year_id becomes NULL.
    """
    print(f"[BACKEND] clear_placeholders: family_id={family_id} academic_year_id={academic_year_id} delete_plan={delete_plan}")
    try:
        family_id_user = get_family_id_for_user(user["id"])
        if not family_id_user or family_id_user != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch",
            )
        supabase = get_admin_client()

        if academic_year_id:
            ay = supabase.table("academic_years").select("family_id").eq("id", academic_year_id).execute()
            if not ay.data or len(ay.data) == 0:
                raise HTTPException(status_code=404, detail="Academic year not found")
            if ay.data[0].get("family_id") != family_id:
                raise HTTPException(status_code=403, detail="Academic year does not belong to your family")

        # Select plan event ids (generated_by='plan_year'; only non-deleted)
        q = (
            supabase.table("events")
            .select("id")
            .eq("family_id", family_id)
            .eq("generated_by", "plan_year")
            .is_("deleted_at", None)
        )
        if academic_year_id:
            q = q.eq("academic_year_id", academic_year_id)
        resp = q.execute()
        ids = [row["id"] for row in (resp.data or [])]
        print(f"[BACKEND] clear_placeholders: found {len(ids)} plan event(s) to soft-delete")

        deleted = 0
        if ids:
            now_iso = datetime.now(timezone.utc).isoformat()
            batch_size = 100
            for i in range(0, len(ids), batch_size):
                batch = ids[i : i + batch_size]
                supabase.table("events").update({"deleted_at": now_iso}).in_("id", batch).eq("family_id", family_id).execute()
            deleted = len(ids)

        plan_deleted = False
        if delete_plan and academic_year_id:
            try:
                # events_instructional_requires_academic_year: (counts_toward_plan = false OR academic_year_id IS NOT NULL).
                # ON DELETE SET NULL will set academic_year_id = NULL; clear counts_toward_plan first so the constraint still holds.
                supabase.table("events").update({"counts_toward_plan": False}).eq("academic_year_id", academic_year_id).eq("family_id", family_id).execute()
                supabase.table("academic_years").delete().eq("id", academic_year_id).eq("family_id", family_id).execute()
                plan_deleted = True
                print(f"[BACKEND] clear_placeholders: deleted academic_year {academic_year_id}")
            except Exception as del_err:
                print(f"[BACKEND] clear_placeholders: academic_year delete failed: {del_err}")
                log_event("academic_year.clear_placeholders.plan_delete_failed", user_id=user["id"], family_id=family_id, academic_year_id=academic_year_id, error=str(del_err))

        log_event("academic_year.clear_placeholders.success", user_id=user["id"], family_id=family_id, academic_year_id=academic_year_id, deleted=deleted, plan_deleted=plan_deleted)
        return {"deleted": deleted, "plan_deleted": plan_deleted}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        print(f"[BACKEND] clear_placeholders error: {e}")
        log_event("academic_year.clear_placeholders.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear placeholders: {str(e)}",
        )


@router.get("/event_for_slot")
async def get_event_for_plan_slot(
    family_id: str = Query(..., description="Family UUID"),
    date_ymd: str = Query(..., description="Date YYYY-MM-DD"),
    start_local: Optional[str] = Query(None, description="Start time HH:MM (optional for all-day)"),
    subject_id: str = Query(..., description="Subject UUID"),
    academic_year_id: str = Query(..., description="Academic year UUID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Look up the calendar event for a plan event (from plan summary "Dates with events").
    Returns the event so the client can open the edit event modal. Slots are created as
    full events when the plan is applied, so this finds that event by date/time/subject.
    """
    try:
        fid = get_family_id_for_user(user["id"])
        if not fid or fid != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Family ID mismatch")
        supabase = get_admin_client()
        # Family timezone for comparing start_local
        family_tz = "UTC"
        try:
            tz_resp = supabase.table("family").select("timezone").eq("id", family_id).maybe_single().execute()
            if getattr(tz_resp, "data", None) and (tz_resp.data.get("timezone") or "").strip():
                family_tz = (tz_resp.data.get("timezone") or "").strip()
        except Exception:
            pass
        # Query events for this plan: same family, academic_year, subject, on this date
        start_str = date_ymd.strip()
        if len(start_str) != 10:
            raise HTTPException(status_code=400, detail="date_ymd must be YYYY-MM-DD")
        end_dt = date.fromisoformat(start_str) + timedelta(days=1)
        end_upper = end_dt.isoformat()
        try:
            local_tz = ZoneInfo(family_tz) if family_tz and family_tz.upper() != "UTC" else None
        except Exception:
            local_tz = None
        select_cols = "id, start_ts, end_ts, title, subject_id, child_id, child_ids, status, event_type, unit, lesson, curriculum_unit_title, source, is_placeholder, generated_by, academic_year_id"
        date_filter = (
            supabase.table("events")
            .select(select_cols)
            .eq("family_id", family_id)
            .eq("subject_id", subject_id)
            .is_("deleted_at", "null")
            .gte("start_ts", f"{start_str}T00:00:00")
            .lt("start_ts", f"{end_upper}T00:00:00")
        )
        events_res = date_filter.eq("academic_year_id", academic_year_id).execute()
        events = list(events_res.data or [])
        # Events missing academic_year_id still need lookup (matches subject Progress row delete vs planner).
        if not events:
            events_res = (
                supabase.table("events")
                .select(select_cols)
                .eq("family_id", family_id)
                .eq("subject_id", subject_id)
                .is_("deleted_at", "null")
                .gte("start_ts", f"{start_str}T00:00:00")
                .lt("start_ts", f"{end_upper}T00:00:00")
                .execute()
            )
            events = list(events_res.data or [])
        if not events:
            return {"event": None}
        # If start_local provided, match by local time (e.g. "09:00" or "9:00")
        def normalize_time(t: Optional[str]) -> str:
            if not t or not isinstance(t, str):
                return ""
            s = t.strip()
            parts = s.split(":")
            if len(parts) >= 2:
                try:
                    h, m = int(parts[0].strip()), (parts[1].strip()[:2] or "00")
                    return f"{h}:{m}"
                except (ValueError, TypeError):
                    pass
            return s or ""
        target_local = normalize_time(start_local) if start_local else None
        for ev in events:
            start_ts = ev.get("start_ts")
            if not start_ts:
                continue
            try:
                if isinstance(start_ts, str) and start_ts.endswith("Z"):
                    start_ts = start_ts.replace("Z", "+00:00")
                dt = datetime.fromisoformat(start_ts.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                local_dt = dt.astimezone(local_tz) if local_tz else dt
                ev_date_ymd = local_dt.strftime("%Y-%m-%d")
                if ev_date_ymd != start_str:
                    continue
                if target_local is None:
                    return {"event": ev}
                ev_start_local = local_dt.strftime("%H:%M")
                if normalize_time(ev_start_local) == target_local:
                    return {"event": ev}
            except (ValueError, TypeError):
                continue
        # No time match: if only one event that day for this subject, return it (same as planner UX)
        if len(events) == 1:
            return {"event": events[0]}
        return {"event": None}
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.event_for_slot.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to look up event: {str(e)}",
        )


@router.get("/plan_events")
async def get_academic_year_plan_events(
    family_id: str = Query(..., description="Family UUID"),
    academic_year_id: str = Query(..., description="Academic year UUID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Return actual saved events for one academic year.
    Used by planner edit/summary surfaces to avoid relying on stale plan_slot_labels.
    """
    try:
        fid = get_family_id_for_user(user["id"])
        if not fid or fid != family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Family ID mismatch")

        supabase = get_admin_client()
        select_cols = (
            "id, title, start_ts, end_ts, subject_id, status, event_type, unit, lesson, "
            "curriculum_unit_title, curriculum_metadata, is_placeholder, generated_by, academic_year_id"
        )
        res = (
            supabase.table("events")
            .select(select_cols)
            .eq("family_id", family_id)
            .eq("academic_year_id", academic_year_id)
            .is_("deleted_at", "null")
            .order("start_ts", desc=False)
            .execute()
        )
        return {"events": list(res.data or [])}
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.plan_events.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load academic year events: {str(e)}",
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


@router.get("/{academic_year_id}/attendance-mode-switch-risk", response_model=AttendanceModeSwitchRiskOutput)
@router.get("/{academic_year_id}/attendance_mode_switch_risk", response_model=AttendanceModeSwitchRiskOutput)
async def get_attendance_mode_switch_risk(
    academic_year_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter_relaxed),
):
    """Return a lightweight risk summary for attendance mode switching."""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found",
            )

        supabase = get_admin_client()
        year_resp = (
            supabase.table("academic_years")
            .select("id, family_id, start_date, end_date")
            .eq("id", academic_year_id)
            .limit(1)
            .execute()
        )
        year_rows = list(year_resp.data or [])
        if not year_rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Academic year not found",
            )
        year_row = year_rows[0]
        if str(year_row.get("family_id") or "") != str(family_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Academic year does not belong to family",
            )

        has_subject_plan_events = False
        has_grades_or_outcomes = False
        has_transcript_artifacts = False

        try:
            subject_plan_resp = (
                supabase.table("events")
                .select("id")
                .eq("academic_year_id", academic_year_id)
                .eq("generated_by", "plan_year")
                .eq("event_type", "Lesson")
                .not_.is_("subject_id", "null")
                .is_("deleted_at", None)
                .limit(1)
                .execute()
            )
            has_subject_plan_events = bool(subject_plan_resp.data)
        except Exception:
            has_subject_plan_events = False

        event_ids: List[str] = []
        try:
            year_events_resp = (
                supabase.table("events")
                .select("id, grade")
                .eq("academic_year_id", academic_year_id)
                .is_("deleted_at", None)
                .limit(2000)
                .execute()
            )
            year_events = list(year_events_resp.data or [])
            event_ids = [str(row.get("id")) for row in year_events if row.get("id")]
            has_grade_on_events = any(str(row.get("grade") or "").strip() for row in year_events)
            has_grades_or_outcomes = has_grades_or_outcomes or has_grade_on_events
        except Exception:
            pass

        if event_ids:
            try:
                outcomes_resp = (
                    supabase.table("event_outcomes")
                    .select("id")
                    .in_("event_id", event_ids[:500])
                    .limit(1)
                    .execute()
                )
                has_grades_or_outcomes = has_grades_or_outcomes or bool(outcomes_resp.data)
            except Exception:
                pass

            try:
                transcript_grades_resp = (
                    supabase.table("grades")
                    .select("id")
                    .eq("family_id", family_id)
                    .in_("assignment_id", event_ids[:500])
                    .limit(1)
                    .execute()
                )
                has_transcript_artifacts = has_transcript_artifacts or bool(transcript_grades_resp.data)
            except Exception:
                pass

        try:
            transcript_settings_resp = (
                supabase.table("transcript_settings")
                .select("id")
                .eq("family_id", family_id)
                .limit(1)
                .execute()
            )
            has_transcript_artifacts = has_transcript_artifacts or bool(transcript_settings_resp.data)
        except Exception:
            pass

        is_data_rich = bool(
            has_subject_plan_events
            or has_grades_or_outcomes
            or has_transcript_artifacts
        )
        return AttendanceModeSwitchRiskOutput(
            has_subject_plan_events=has_subject_plan_events,
            has_grades_or_outcomes=has_grades_or_outcomes,
            has_transcript_artifacts=has_transcript_artifacts,
            is_data_rich=is_data_rich,
        )
    except HTTPException:
        raise
    except Exception as e:
        log_event("academic_year.attendance_mode_switch_risk.error", user_id=user.get("id"), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute attendance switch risk: {str(e)}",
        )


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
            raw_excluded = settings_row.get("excluded_holiday_dates")
            excluded_list = list(raw_excluded) if isinstance(raw_excluded, list) else None
            holiday_settings = HolidaySettings(
                follow_global_holidays=settings_row.get("follow_global_holidays", False),
                holiday_country_code=settings_row.get("holiday_country_code"),
                holiday_region=settings_row.get("holiday_region"),
                provider=settings_row.get("provider", "NAGER_DATE"),
                excluded_holiday_dates=excluded_list,
            )

        # Get holidays
        excluded_dates = (holiday_settings.excluded_holiday_dates if holiday_settings else None) or None
        holidays = get_holidays_for_year(
            supabase,
            academic_year_id,
            include_global=holiday_settings.follow_global_holidays if holiday_settings else False,
            country_code=holiday_settings.holiday_country_code if holiday_settings else None,
            region=holiday_settings.holiday_region if holiday_settings else None,
            provider=holiday_settings.provider if holiday_settings else "NAGER_DATE",
            excluded_holiday_dates=excluded_dates,
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
        plan_slot_labels = []
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
            # Fetch events in plan range to get unit/topic per slot for plan summary display
            plan_slot_labels = []
            try:
                start_str = _start.isoformat() if hasattr(_start, "isoformat") else str(_start)
                end_str = _end.isoformat() if hasattr(_end, "isoformat") else str(_end)
                end_dt = date.fromisoformat(end_str) if isinstance(end_str, str) else _end
                end_upper = (end_dt + timedelta(days=1)).isoformat()
                tz_name = "America/New_York"
                local_tz = ZoneInfo(tz_name)
                ev_resp = supabase.table("events").select(
                    "start_ts, subject_id, unit, lesson, curriculum_unit_title, title, curriculum_metadata, generated_by, is_curriculum_related"
                ).eq(
                    "family_id", family_id
                ).eq("academic_year_id", academic_year_id).is_(
                    "deleted_at", "null"
                ).gte(
                    "start_ts", f"{start_str}T00:00:00"
                ).lt("start_ts", f"{end_upper}T00:00:00").execute()
                for ev in (ev_resp.data or []):
                    unit = (ev.get("unit") or ev.get("curriculum_unit_title") or "").strip()
                    meta = ev.get("curriculum_metadata")
                    if isinstance(meta, str):
                        try:
                            meta = json.loads(meta)
                        except (json.JSONDecodeError, TypeError):
                            meta = {}
                    elif not isinstance(meta, dict):
                        meta = {}
                    lesson = str(meta.get("lesson_label") or "").strip()
                    if not lesson:
                        lesson = str(ev.get("lesson") or "").strip()
                    if not lesson and unit:
                        lesson = str(ev.get("title") or "").strip()
                    subj_raw = ev.get("subject_id")
                    gen_by = str(ev.get("generated_by") or "").strip()
                    is_cr = bool(ev.get("is_curriculum_related"))
                    # Filled curriculum (import/manual) sets is_curriculum_related; do not label as "open" placeholder.
                    has_curriculum = bool(unit or lesson) or is_cr
                    # Empty plan_year slots only have subject title on the event — still list them in summary
                    if not has_curriculum:
                        if not subj_raw or gen_by != "plan_year":
                            continue
                        open_plan_slot = True
                    else:
                        open_plan_slot = False
                    start_ts = ev.get("start_ts")
                    if not start_ts:
                        continue
                    try:
                        if isinstance(start_ts, str) and start_ts.endswith("Z"):
                            start_ts = start_ts.replace("Z", "+00:00")
                        dt = datetime.fromisoformat(start_ts.replace("Z", "+00:00"))
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        local_dt = dt.astimezone(local_tz)
                        date_ymd = local_dt.strftime("%Y-%m-%d")
                        start_local = local_dt.strftime("%H:%M")
                        plan_slot_labels.append({
                            "date_ymd": date_ymd,
                            "start_local": start_local,
                            "subject_id": str(subj_raw or ""),
                            "unit": unit or None,
                            "lesson": lesson or None,
                            "open_plan_slot": open_plan_slot,
                        })
                    except (ValueError, TypeError):
                        continue
            except Exception as slot_err:
                log_event("academic_year.get.slot_labels_error", user_id=user["id"], error=str(slot_err))

        # Events in this plan (plan summary "Dates with events" lists these). Query all events for this academic year in range — treat as events, not placeholders/slots.
        plan_event_dates = []
        if plan_summary and family_id and academic_year_id:
            try:
                tz_name = "America/New_York"
                try:
                    tz_resp = supabase.table("family").select("timezone").eq("id", family_id).maybe_single().execute()
                    if getattr(tz_resp, "data", None) and (tz_resp.data.get("timezone") or "").strip():
                        tz_name = (tz_resp.data.get("timezone") or "").strip()
                except Exception:
                    pass
                local_tz = ZoneInfo(tz_name) if tz_name and tz_name.upper() != "UTC" else ZoneInfo("America/New_York")
                start_str = plan_summary.start_date if isinstance(plan_summary.start_date, str) else (plan_summary.start_date.isoformat() if hasattr(plan_summary.start_date, "isoformat") else str(plan_summary.start_date))
                end_str = plan_summary.end_date if isinstance(plan_summary.end_date, str) else (plan_summary.end_date.isoformat() if hasattr(plan_summary.end_date, "isoformat") else str(plan_summary.end_date))
                end_dt = date.fromisoformat(end_str[:10])
                end_upper = (end_dt + timedelta(days=1)).isoformat()
                ev_resp = (
                    supabase.table("events")
                    .select("start_ts, subject_id, materials_attachment_ids")
                    .eq("family_id", family_id)
                    .eq("academic_year_id", academic_year_id)
                    .is_("deleted_at", "null")
                    .gte("start_ts", f"{start_str[:10]}T00:00:00")
                    .lt("start_ts", f"{end_upper}T00:00:00")
                    .execute()
                )
                for ev in (ev_resp.data or []):
                    start_ts = ev.get("start_ts")
                    if not start_ts:
                        continue
                    try:
                        if isinstance(start_ts, str) and start_ts.endswith("Z"):
                            start_ts = start_ts.replace("Z", "+00:00")
                        dt = datetime.fromisoformat(start_ts.replace("Z", "+00:00"))
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        local_dt = dt.astimezone(local_tz)
                        mat_ids = ev.get("materials_attachment_ids") or []
                        has_attachment = bool(mat_ids)
                        plan_event_dates.append({
                            "date_ymd": local_dt.strftime("%Y-%m-%d"),
                            "subject_id": str(ev.get("subject_id") or ""),
                            "start_local": local_dt.strftime("%H:%M"),
                            "has_attachment": has_attachment,
                        })
                    except (ValueError, TypeError):
                        continue
            except Exception as event_dates_err:
                log_event("academic_year.get.event_dates_error", user_id=user["id"], error=str(event_dates_err))

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
            "attendance_tracking_mode": year_data.get("attendance_tracking_mode") or "subject",
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
                "excluded_holiday_dates": holiday_settings.excluded_holiday_dates or [],
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
                "plan_slot_labels": plan_slot_labels,
                "plan_event_dates": plan_event_dates,
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
    excluded_holiday_dates: Optional[List[str]] = None,
) -> set:
    """Build set of holiday dates for apply_to_calendar (custom + breaks expanded + global)."""
    holiday_dates = set()
    excluded_set = set(excluded_holiday_dates or [])
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
                if gh.date.isoformat() in excluded_set:
                    continue
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
    print(
        f"[BACKEND] apply_to_calendar start: family_id={body.family_id} academic_year_id={body.academic_year_id or 'new'} "
        f"start_date={body.start_date} end_date={body.end_date} replace_placeholders={getattr(body, 'replace_placeholders', None)} apply_from_date={getattr(body, 'apply_from_date', None)}",
        flush=True,
    )
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Family ID mismatch")
        require_onboarding_complete(family_id)
        supabase = get_admin_client()
        client_start_date_obj = date.fromisoformat(body.start_date)
        client_end_date_obj = date.fromisoformat(body.end_date)
        duration_scope = (body.school_duration_scope or "").strip().lower()
        # When editing a plan: only regenerate events from this date forward (inclusive)
        scope_data = resolve_school_scope(
            supabase=supabase,
            family_id=family_id,
            run_scope_type=body.run_scope_type,
            family_school_year_id=body.family_school_year_id,
            family_school_term_id=body.family_school_term_id,
            term_id=body.term_id,
            start_date_obj=client_start_date_obj if duration_scope in {"", "custom_duration"} else None,
            end_date_obj=client_end_date_obj if duration_scope in {"", "custom_duration"} else None,
        )
        resolved_dates = resolve_run_dates_for_scope(
            scope_data=scope_data,
            school_duration_scope=body.school_duration_scope,
            use_defaults=body.use_defaults,
            client_start_date_obj=client_start_date_obj,
            client_end_date_obj=client_end_date_obj,
        )
        start_date_obj = resolved_dates["start_date_obj"]
        end_date_obj = resolved_dates["end_date_obj"]
        if start_date_obj > end_date_obj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date must be <= end_date",
            )
        resolved_start_date = start_date_obj.isoformat()
        resolved_end_date = end_date_obj.isoformat()

        regen_start_date = start_date_obj
        if body.apply_from_date:
            try:
                apply_from = date.fromisoformat(body.apply_from_date)
                if apply_from < start_date_obj or apply_from > end_date_obj:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="apply_from_date must be within the plan's start and end date",
                    )
                regen_start_date = apply_from
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="apply_from_date must be a valid date (YYYY-MM-DD)",
                )

        custom_holidays_dict = [
            {"date": h.date, "name": h.name, "type": getattr(h, "type", "CUSTOM_HOLIDAY")}
            for h in (body.custom_holidays or [])
        ]
        custom_breaks_dict = [
            {"start": b.start, "end": b.end, "name": b.name}
            for b in (body.custom_breaks or [])
        ]

        resolved_config = resolve_effective_config_server(
            supabase=supabase,
            scope_data=scope_data,
            use_defaults=body.use_defaults,
            defaults_snapshot_json=body.defaults_snapshot_json,
            overrides_json=body.overrides_json,
            effective_config_json=body.effective_config_json,
            legacy_config={
                "calendar": {
                    "mode": body.constraint_mode or "days",
                    "start_date": resolved_start_date,
                    "end_date": resolved_end_date,
                },
                "planning": {
                    "constraint_mode": body.constraint_mode,
                    "target_days": body.target_days,
                    "target_hours": body.target_hours,
                    "subject_targets": body.subject_targets,
                },
                "holiday_settings": {
                    "follow_global_holidays": body.follow_public_holidays,
                    "holiday_country_code": (body.holiday_region.split(":")[0] if body.holiday_region and ":" in body.holiday_region else body.holiday_region),
                    "holiday_region": body.holiday_region,
                    "provider": "NAGER_DATE",
                    "excluded_holiday_dates": body.excluded_holiday_dates or [],
                },
                "custom_holidays": custom_holidays_dict,
                "custom_breaks": custom_breaks_dict,
                "subjects": body.subjects or [],
            },
            source="academic_year.apply_to_calendar",
        )
        effective_config_json = resolved_config["effective_config_json"]
        defaults_snapshot_json = resolved_config["defaults_snapshot_json"]

        holiday_dates = _build_holiday_dates_for_apply(
            start_date_obj,
            end_date_obj,
            body.follow_public_holidays,
            body.holiday_region,
            custom_holidays_dict,
            custom_breaks_dict,
            supabase,
            excluded_holiday_dates=body.excluded_holiday_dates or None,
        )

        requested_attendance_mode = (body.attendance_tracking_mode or "").strip().lower()
        if requested_attendance_mode not in {"subject", "class_day"}:
            requested_attendance_mode = ""

        def _infer_subject_mode_for_year(year_id: Optional[str]) -> str:
            year_key = str(year_id or "").strip()
            if not year_key:
                return "class_day"
            try:
                lesson_resp = (
                    supabase.table("events")
                    .select("id")
                    .eq("academic_year_id", year_key)
                    .eq("generated_by", "plan_year")
                    .eq("event_type", "Lesson")
                    .not_.is_("subject_id", "null")
                    .is_("deleted_at", None)
                    .limit(1)
                    .execute()
                )
                if lesson_resp.data and len(lesson_resp.data) > 0:
                    return "subject"
            except Exception:
                pass
            return "class_day"

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
                    "placeholder_label": getattr(b, "placeholder_label", None),
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
            if not body.subjects and attendance_tracking_mode != "class_day":
                raise HTTPException(status_code=400, detail="At least one subject is required, or provide blocks.")
            if body.subjects:
                sub_resp = supabase.table("subject").select("id, name").eq("family_id", body.family_id).in_("id", body.subjects).execute()
                subject_rows = {str(r["id"]): r["name"] for r in (sub_resp.data or [])}
                if len(subject_rows) < len(body.subjects):
                    raise HTTPException(status_code=400, detail="One or more subject IDs are invalid or not in this family.")
                subject_ids_ordered = [s for s in body.subjects if str(s) in subject_rows]
                if not subject_ids_ordered and attendance_tracking_mode != "class_day":
                    raise HTTPException(status_code=400, detail="No valid subjects.")
            else:
                subject_ids_ordered = []
            eligible_dates = get_instructional_dates_list(
                start_date_obj, end_date_obj, body.allowed_weekdays, holiday_dates, limit=body.target_instructional_days
            )
            if len(eligible_dates) < body.target_instructional_days:
                raise HTTPException(
                    status_code=400,
                    detail=f"Not enough days. Eligible: {len(eligible_dates)}, target: {body.target_instructional_days}.",
                )
            planned_dates_legacy = eligible_dates[: body.target_instructional_days]

        if use_blocks:
            exclusion_ranges = _build_exclusion_ranges_for_apply(holiday_dates, custom_breaks_dict)
        else:
            exclusion_ranges = []

        academic_year_id = body.academic_year_id
        if not academic_year_id:
            # Reuse existing academic year for this family with same start/end so edits don't create duplicate plans
            # Unless force_new_plan: then always create a new row so "Create new plan" adds a new entry to the list
            reuse_existing = not getattr(body, "force_new_plan", False)
            existing = (
                supabase.table("academic_years")
                .select("id, attendance_tracking_mode")
                .eq("family_id", body.family_id)
                .eq("start_date", resolved_start_date)
                .eq("end_date", resolved_end_date)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )
            if reuse_existing and existing.data and len(existing.data) > 0:
                academic_year_id = existing.data[0]["id"]
                year_updates = {
                    "family_school_year_id": scope_data["family_school_year_id"],
                    "family_school_term_id": scope_data["family_school_term_id"],
                    "run_scope_type": scope_data["run_scope_type"],
                    "use_defaults": True if body.use_defaults is None else bool(body.use_defaults),
                    "defaults_snapshot_json": defaults_snapshot_json,
                    "effective_config_json": effective_config_json,
                    "overrides_json": body.overrides_json,
                    "attendance_tracking_mode": attendance_tracking_mode,
                }
                if body.year_name and body.year_name.strip():
                    year_updates["year_name"] = body.year_name.strip()
                existing_row = existing.data[0] or {}
                existing_mode = str(existing_row.get("attendance_tracking_mode") or "").strip().lower()
                resolved_attendance_mode = requested_attendance_mode or (
                    existing_mode if existing_mode in {"subject", "class_day"} else _infer_subject_mode_for_year(academic_year_id)
                )
                year_updates["attendance_tracking_mode"] = resolved_attendance_mode
                supabase.table("academic_years").update(year_updates).eq("id", academic_year_id).execute()
            else:
                resolved_attendance_mode = requested_attendance_mode or "class_day"
                year_name_apply = (body.year_name and body.year_name.strip()) or f"{start_date_obj.year}-{end_date_obj.year}"
                year_row = (
                    supabase.table("academic_years")
                    .insert(
                        {
                            "family_id": body.family_id,
                            "year_name": year_name_apply,
                            "start_date": resolved_start_date,
                            "end_date": resolved_end_date,
                            "is_draft": False,
                            "mode": "FIXED_END",
                            "allowed_weekdays": allowed_weekdays_for_persist,
                            "is_current": True,
                            "family_school_year_id": scope_data["family_school_year_id"],
                            "family_school_term_id": scope_data["family_school_term_id"],
                            "run_scope_type": scope_data["run_scope_type"],
                            "use_defaults": True if body.use_defaults is None else bool(body.use_defaults),
                            "defaults_snapshot_json": defaults_snapshot_json,
                            "effective_config_json": effective_config_json,
                            "overrides_json": body.overrides_json,
                            "attendance_tracking_mode": resolved_attendance_mode,
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
        else:
            existing_mode = ""
            try:
                year_mode_resp = (
                    supabase.table("academic_years")
                    .select("attendance_tracking_mode")
                    .eq("id", academic_year_id)
                    .maybe_single()
                    .execute()
                )
                existing_mode = str((year_mode_resp.data or {}).get("attendance_tracking_mode") or "").strip().lower()
            except Exception:
                existing_mode = ""
            resolved_attendance_mode = requested_attendance_mode or (
                existing_mode if existing_mode in {"subject", "class_day"} else _infer_subject_mode_for_year(academic_year_id)
            )
            # Reapply: academic_year_id was provided — still update year_name if sent so the plan label stays current
            year_updates = {
                "family_school_year_id": scope_data["family_school_year_id"],
                "family_school_term_id": scope_data["family_school_term_id"],
                "run_scope_type": scope_data["run_scope_type"],
                "use_defaults": True if body.use_defaults is None else bool(body.use_defaults),
                "defaults_snapshot_json": defaults_snapshot_json,
                "effective_config_json": effective_config_json,
                "overrides_json": body.overrides_json,
                "attendance_tracking_mode": resolved_attendance_mode,
            }
            if body.year_name and body.year_name.strip():
                year_updates["year_name"] = body.year_name.strip()
            supabase.table("academic_years").update(year_updates).eq("id", academic_year_id).execute()

        attendance_tracking_mode = resolved_attendance_mode

        generation_batch_id = str(uuid.uuid4())
        events_to_insert = []
        planned_dates_set = set()
        block_regen_results: List[BlockRegenResult] = []
        totals_updated, totals_inserted, totals_deleted = 0, 0, 0

        # Persist plan (target_days, end_date, blocks) immediately so Edit Plan shows saved values even if placeholder generation fails
        if academic_year_id:
            if body.subject_targets is not None:
                validate_subject_targets(supabase, body.family_id, body.subject_targets)
            constraint_mode = body.constraint_mode if body.constraint_mode in ("days", "hours", "none") else "days"
            plan_data = {
                "academic_year_id": academic_year_id,
                "family_id": body.family_id,
                "start_date": resolved_start_date,
                "end_date": resolved_end_date,
                "constraint_mode": constraint_mode,
                "target_days": body.target_days if constraint_mode == "days" else None,
                "target_hours": float(body.target_hours) if constraint_mode == "hours" and body.target_hours is not None else None,
                "current_generation_id": generation_batch_id,
                "updated_at": datetime.now().isoformat(),
            }
            if use_blocks and blocks_to_use:
                plan_data["blocks"] = [
                    {"block_id": b["block_id"], "subject_id": b["subject_id"], "child_ids": b.get("child_ids", []),
                     "weekdays": b.get("weekdays", [1, 2, 3, 4, 5]), "start_time": b.get("start_time", "09:00"),
                     "end_time": b.get("end_time", "10:00"), "all_day": b.get("all_day", False)}
                    for b in blocks_to_use
                ]
            else:
                plan_data["blocks"] = []
            if body.subject_targets is not None:
                plan_data["subject_targets"] = body.subject_targets
            supabase.table("academic_year_plan").upsert(plan_data, on_conflict="academic_year_id").execute()
            supabase.table("academic_years").update({"allowed_weekdays": allowed_weekdays_for_persist}).eq("id", academic_year_id).execute()
            # Persist holiday settings (including exclusions) so calendar and holidays_for_range use them
            holiday_region = body.holiday_region or "US"
            country_code = holiday_region.split(":")[0] if ":" in holiday_region else holiday_region
            supabase.table("academic_year_holiday_settings").upsert({
                "academic_year_id": academic_year_id,
                "follow_global_holidays": body.follow_public_holidays,
                "holiday_country_code": country_code,
                "holiday_region": body.holiday_region,
                "provider": "NAGER_DATE",
                "excluded_holiday_dates": body.excluded_holiday_dates or [],
            }, on_conflict="academic_year_id").execute()

        # Timezone for plan times: prefer client (browser), then family DB, else UTC
        family_tz = None
        if getattr(body, "timezone", None) and (body.timezone or "").strip():
            family_tz = (body.timezone or "").strip()
        if not family_tz:
            try:
                tz_resp = supabase.table("family").select("timezone").eq("id", body.family_id).maybe_single().execute()
                if getattr(tz_resp, "data", None) and (tz_resp.data.get("timezone") or "").strip():
                    family_tz = (tz_resp.data.get("timezone") or "").strip()
            except Exception:
                pass
        if not family_tz:
            family_tz = "UTC"
            print("[BACKEND] apply_to_calendar: no timezone from client or family; using UTC (plan times may show wrong)", flush=True)
        else:
            print(f"[BACKEND] apply_to_calendar using timezone: {family_tz}", flush=True)
        if use_blocks and blocks_to_use:
            b0 = blocks_to_use[0]
            print(f"[BACKEND] apply_to_calendar first block: start_time={b0.get('start_time')} end_time={b0.get('end_time')}", flush=True)

        if use_blocks and attendance_tracking_mode == "class_day":
            allowed_weekdays_set = set(int(w) for w in (allowed_weekdays_for_persist or [1, 2, 3, 4, 5]))
            full_class_day_dates: List[date] = []
            regen_class_day_dates: List[date] = []
            cur = start_date_obj
            while cur <= end_date_obj:
                if cur.weekday() in allowed_weekdays_set and cur not in holiday_dates:
                    full_class_day_dates.append(cur)
                    if cur >= regen_start_date:
                        regen_class_day_dates.append(cur)
                cur += timedelta(days=1)

            delete_from_iso = regen_start_date.isoformat()
            supabase.table("events").delete().eq("academic_year_id", academic_year_id).eq("generated_by", "plan_year").eq("event_type", "ClassDay").eq("counts_toward_plan", True).gte("start_ts", f"{delete_from_iso}T00:00:00+00:00").execute()

            start_time = "09:00"
            end_time = "10:00"
            if blocks_to_use:
                start_time = blocks_to_use[0].get("start_time") or start_time
                end_time = blocks_to_use[0].get("end_time") or end_time

            for d in full_class_day_dates:
                planned_dates_set.add(d)

            for d in regen_class_day_dates:
                date_str = d.isoformat()
                events_to_insert.append({
                    "family_id": body.family_id,
                    "child_id": body.child_id,
                    "title": "Class Day",
                    "start_ts": _parse_time_to_iso(d, start_time),
                    "end_ts": _parse_time_to_iso(d, end_time),
                    "status": "scheduled",
                    "source": "system",
                    "event_type": "ClassDay",
                    "subject_id": None,
                    "is_placeholder": False,
                    "generated_by": "plan_year",
                    "academic_year_id": academic_year_id,
                    "generation_batch_id": generation_batch_id,
                    "counts_toward_plan": True,
                    "instructional_status": "PLAN_PLACEHOLDER",
                })
            if events_to_insert:
                supabase.table("events").insert(events_to_insert).execute()
            created_count = len(events_to_insert)
            totals_inserted = created_count
            totals_deleted = 0
        elif use_blocks:
            # Block-aware regeneration: only touch placeholders for each block (no global delete)
            for block in blocks_to_use:
                subject_id = block.get("subject_id")
                subject_name = (
                    subject_rows.get(str(subject_id), "Learning block")
                    if subject_id
                    else (block.get("placeholder_label") or "Learning block")
                )
                result = regen_block(
                    supabase,
                    body.family_id,
                    academic_year_id,
                    block,
                    regen_start_date,
                    end_date_obj,
                    exclusion_ranges,
                    generation_batch_id,
                    subject_name,
                    family_child_ids,
                    body.child_id,
                    family_timezone=family_tz,
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
            # No-requirement mode: store baseline so we can show "You deleted a lesson on [date]..." if user removes placeholders
            if constraint_mode == "none" and planned_dates_set:
                baseline_dates = sorted([d.isoformat() for d in planned_dates_set])
                try:
                    supabase.table("academic_year_plan").update({
                        "baseline_scheduled_days": len(planned_dates_set),
                        "baseline_scheduled_dates": baseline_dates,
                        "updated_at": datetime.now().isoformat(),
                    }).eq("academic_year_id", academic_year_id).execute()
                except Exception:
                    pass  # columns may not exist before migration
        else:
            # Legacy path: no blocks — use target days + subjects
            if attendance_tracking_mode == "class_day":
                delete_from_iso = regen_start_date.isoformat()
                supabase.table("events").delete().eq("academic_year_id", academic_year_id).eq("generated_by", "plan_year").eq("event_type", "ClassDay").eq("counts_toward_plan", True).gte("start_ts", f"{delete_from_iso}T00:00:00+00:00").execute()
                for d in planned_dates_legacy:
                    date_str = d.isoformat()
                    planned_dates_set.add(d)
                    events_to_insert.append({
                        "family_id": body.family_id,
                        "child_id": body.child_id,
                        "title": "Class Day",
                        "start_ts": f"{date_str}T09:00:00+00:00",
                        "end_ts": f"{date_str}T09:45:00+00:00",
                        "status": "scheduled",
                        "source": "system",
                        "event_type": "ClassDay",
                        "subject_id": None,
                        "is_placeholder": False,
                        "generated_by": "plan_year",
                        "academic_year_id": academic_year_id,
                        "generation_batch_id": generation_batch_id,
                        "counts_toward_plan": True,
                        "instructional_status": "PLAN_PLACEHOLDER",
                    })
            else:
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
                            "title": subject_name,
                            "start_ts": start_ts,
                            "end_ts": end_ts,
                            "status": "scheduled",
                            "source": "system",
                            "event_type": "Lesson",
                            "subject_id": subject_id,
                            "is_placeholder": False,
                            "generated_by": "plan_year",
                            "academic_year_id": academic_year_id,
                            "generation_batch_id": generation_batch_id,
                            "counts_toward_plan": True,
                        }
                        events_to_insert.append(ev)

        if not use_blocks:
            created_count = 0
        if events_to_insert and not use_blocks:
            supabase.table("events").insert(events_to_insert).execute()
            created_count = len(events_to_insert)

        planned_days = len(planned_dates_set)
        log_event("academic_year.apply_to_calendar.success", user_id=user["id"], created=created_count, planned_days=planned_days)
        totals_msg = ""
        if use_blocks and block_regen_results:
            tu = sum(r.updated for r in block_regen_results)
            ti = sum(r.inserted for r in block_regen_results)
            td = sum(r.deleted for r in block_regen_results)
            totals_msg = f" updated={tu} inserted={ti} deleted={td}"
        print(
            f"[BACKEND] apply_to_calendar success: academic_year_id={academic_year_id} created={created_count} planned_days={planned_days}{totals_msg}",
            flush=True,
        )

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
