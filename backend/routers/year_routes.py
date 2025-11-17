"""
FastAPI routes for year planning features
Part of Phase 1 - Year-Round Intelligence Core
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
import sys
from pathlib import Path
import time
import hashlib
import json

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from metrics import increment_counter

try:
    from supabase_client import get_admin_client
except ImportError:
    import importlib.util
    spec = importlib.util.spec_from_file_location("supabase_client", backend_dir / "supabase_client.py")
    supabase_client = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(supabase_client)
    get_admin_client = supabase_client.get_admin_client

router = APIRouter(prefix="/api/year", tags=["year"])


# ============================================================
# Request/Response Models
# ============================================================

class SubjectTarget(BaseModel):
    key: str
    targetMinPerWeek: int = Field(..., ge=0, le=10080)  # Max minutes per week


class PlanChild(BaseModel):
    childId: str
    subjects: List[SubjectTarget] = []
    hoursPerWeek: Optional[Dict[str, float]] = None


class BreakPeriod(BaseModel):
    start: str  # YYYY-MM-DD
    end: str    # YYYY-MM-DD
    label: Optional[str] = None


class CreateYearPlanInput(BaseModel):
    familyId: str
    scope: str = Field(default="current", pattern="^(current|next|custom)$")
    startDate: str  # YYYY-MM-DD
    endDate: str    # YYYY-MM-DD
    breaks: List[BreakPeriod] = []
    children: List[PlanChild] = []


class YearPlanOut(BaseModel):
    id: str
    familyId: str
    scope: str
    startDate: str
    endDate: str
    totalWeeks: int
    createdAt: str


class HeatmapRow(BaseModel):
    week_start: str
    subject: str
    minutes_scheduled: float
    minutes_done: float


class RebalanceInput(BaseModel):
    yearPlanId: str
    eventId: str
    newStart: str  # ISO 8601 timestamp


class RebalanceMove(BaseModel):
    eventId: str
    currentStart: str
    proposedStart: str
    reason: str


class RebalanceOut(BaseModel):
    ok: bool
    moves: List[RebalanceMove]
    count: int
    error: Optional[str] = None


# ============================================================
# Helper Functions
# ============================================================

def hash_family_id(family_id: str) -> str:
    """Hash family ID for logging (privacy)"""
    return hashlib.sha256(family_id.encode()).hexdigest()[:8]


def validate_dates(start: str, end: str) -> tuple[date, date]:
    """Validate and parse date strings"""
    try:
        start_date = datetime.fromisoformat(start).date()
        end_date = datetime.fromisoformat(end).date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD"
        )
    
    if start_date >= end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be before end date"
        )
    
    if (end_date - start_date).days > 370:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Year plan cannot exceed 370 days"
        )
    
    return start_date, end_date


# ============================================================
# Routes
# ============================================================

@router.get("/health")
async def year_health():
    """Health check for year routes"""
    return {"status": "ok", "service": "year"}


@router.post("/create", response_model=YearPlanOut)
async def create_year_plan(
    body: CreateYearPlanInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Create a new year plan with children and milestones.
    All behind require_parent (get_current_user).
    """
    log_event("year.create.start", user_id=user["id"], family_hash=hash_family_id(body.familyId))
    
    try:
        # Validate family access
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.familyId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )
        
        # Validate dates
        start_date, end_date = validate_dates(body.startDate, body.endDate)
        
        # Validate breaks array length
        if len(body.breaks) > 40:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Too many breaks (maximum 40)"
            )
        
        # Validate children belong to family
        supabase = get_admin_client()
        for child in body.children:
            if not child_belongs_to_family(child.childId, family_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Child {child.childId} does not belong to family"
                )
        
        # Prepare breaks JSONB
        breaks_jsonb = []
        for brk in body.breaks:
            breaks_jsonb.append({
                "start": brk.start,
                "end": brk.end,
                "label": brk.label
            })
        
        # Prepare children JSONB
        children_jsonb = []
        for child in body.children:
            # Ensure subjects are properly formatted
            subjects_list = []
            for s in child.subjects:
                subjects_list.append({
                    "key": str(s.key),
                    "targetMinPerWeek": int(s.targetMinPerWeek)
                })
            
            children_jsonb.append({
                "childId": str(child.childId),
                "subjects": subjects_list,
                "hoursPerWeek": child.hoursPerWeek or {}
            })
        
        # Log the payload for debugging
        log_event("year.create.rpc_call", user_id=user["id"], 
                 children_count=len(children_jsonb),
                 breaks_count=len(breaks_jsonb))
        
        # Call RPC with retries
        max_retries = 3
        last_error = None
        for attempt in range(max_retries):
            try:
                result = supabase.rpc(
                    "create_year_plan",
                    {
                        "p_family_id": family_id,
                        "p_start": start_date.isoformat(),
                        "p_end": end_date.isoformat(),
                        "p_breaks": breaks_jsonb,
                        "p_created_by": user["id"],
                        "p_scope": body.scope,
                        "p_children": children_jsonb
                    }
                ).execute()
                
                # Check for RPC errors
                if hasattr(result, 'error') and result.error:
                    error_msg = f"RPC error: {result.error}"
                    last_error = error_msg
                    log_event("year.create.rpc_error_response", user_id=user["id"], error=str(result.error))
                    if attempt == max_retries - 1:
                        raise Exception(error_msg)
                    continue
                
                if result.data:
                    year_plan_id = result.data
                    break
                else:
                    error_msg = "RPC returned no data and no error"
                    last_error = error_msg
                    log_event("year.create.rpc_no_data", user_id=user["id"], error=error_msg)
                    if attempt == max_retries - 1:
                        raise Exception(error_msg)
            except Exception as e:
                last_error = str(e)
                error_details = {
                    "attempt": attempt + 1,
                    "error": str(e),
                    "error_type": type(e).__name__
                }
                # Try to extract more details from Supabase exceptions
                if hasattr(e, 'message'):
                    error_details["message"] = str(e.message)
                if hasattr(e, 'details'):
                    error_details["details"] = str(e.details)
                if hasattr(e, 'hint'):
                    error_details["hint"] = str(e.hint)
                    
                log_event("year.create.rpc_error", user_id=user["id"], **error_details)
                
                if attempt == max_retries - 1:
                    # Include more details in the error message
                    detail_msg = f"Failed to create year plan after {max_retries} attempts: {last_error}"
                    if hasattr(e, 'message'):
                        detail_msg += f" | Message: {e.message}"
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=detail_msg
                    )
                time.sleep(0.5 * (attempt + 1))  # Exponential backoff
        
        # Fetch created plan
        plan_resp = supabase.table("year_plans").select("*").eq("id", year_plan_id).single().execute()
        if not plan_resp.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch created year plan"
            )
        
        plan = plan_resp.data
        
        increment_counter("year_plan_created")
        log_event("year.create.success", user_id=user["id"], family_hash=hash_family_id(family_id), year_plan_id=year_plan_id)
        
        return YearPlanOut(
            id=plan["id"],
            familyId=plan["family_id"],
            scope=plan["plan_scope"],
            startDate=plan["start_date"],
            endDate=plan["end_date"],
            totalWeeks=plan["total_weeks"],
            createdAt=plan["created_at"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("year.create.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create year plan: {str(e)}"
        )


@router.get("/heatmap", response_model=List[HeatmapRow])
async def get_heatmap(
    familyId: str = Query(..., description="Family ID"),
    start: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end: str = Query(..., description="End date (YYYY-MM-DD)"),
    mock: Optional[int] = Query(None, description="Return mock data if 1"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get curriculum heatmap data for a date range.
    Returns weekly subject minutes scheduled vs done.
    """
    log_event("year.heatmap.start", user_id=user["id"], family_hash=hash_family_id(familyId))
    
    try:
        # Validate family access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        if family_id != familyId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )
        
        # Mock mode
        if mock == 1:
            return [
                HeatmapRow(
                    week_start="2025-01-06",
                    subject="Math",
                    minutes_scheduled=180.0,
                    minutes_done=150.0
                ),
                HeatmapRow(
                    week_start="2025-01-06",
                    subject="Science",
                    minutes_scheduled=120.0,
                    minutes_done=120.0
                )
            ]
        
        # Validate dates
        start_date, end_date = validate_dates(start, end)
        
        # Call RPC
        supabase = get_admin_client()
        result = supabase.rpc(
            "get_curriculum_heatmap",
            {
                "p_family_id": family_id,
                "p_start": start_date.isoformat(),
                "p_end": end_date.isoformat()
            }
        ).execute()
        
        if result.data is None:
            return []  # Empty but valid shape for new users
        
        # Transform to response model
        rows = []
        for row in result.data:
            rows.append(HeatmapRow(
                week_start=row["week_start"],
                subject=row["subject"],
                minutes_scheduled=float(row["minutes_scheduled"] or 0),
                minutes_done=float(row["minutes_done"] or 0)
            ))
        
        log_event("year.heatmap.success", user_id=user["id"], family_hash=hash_family_id(family_id), row_count=len(rows))
        return rows
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("year.heatmap.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get heatmap: {str(e)}"
        )


@router.post("/rebalance", response_model=RebalanceOut)
async def rebalance_schedule(
    body: RebalanceInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Preview rebalance moves for an event.
    Returns proposed moves without mutating data.
    """
    log_event("year.rebalance.start", user_id=user["id"], event_id=body.eventId)
    
    try:
        # Validate family access via year plan
        supabase = get_admin_client()
        plan_resp = supabase.table("year_plans").select("family_id").eq("id", body.yearPlanId).single().execute()
        
        if not plan_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Year plan not found"
            )
        
        family_id = plan_resp.data["family_id"]
        user_family_id = get_family_id_for_user(user["id"])
        
        if not user_family_id or user_family_id != family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Year plan does not belong to user family"
            )
        
        # Parse new start timestamp
        try:
            new_start_dt = datetime.fromisoformat(body.newStart.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid timestamp format. Use ISO 8601"
            )
        
        # Call RPC
        result = supabase.rpc(
            "rebalance_schedule",
            {
                "p_year_plan_id": body.yearPlanId,
                "p_event_id": body.eventId,
                "p_new_start": new_start_dt.isoformat()
            }
        ).execute()
        
        if not result.data or not result.data.get("ok"):
            return RebalanceOut(
                ok=False,
                moves=[],
                count=0,
                error=result.data.get("error", "Unknown error")
            )
        
        # Transform moves
        moves = []
        for move in result.data.get("moves", []):
            moves.append(RebalanceMove(
                eventId=move["eventId"],
                currentStart=move["currentStart"],
                proposedStart=move["proposedStart"],
                reason=move["reason"]
            ))
        
        log_event("year.rebalance.success", user_id=user["id"], move_count=len(moves))
        return RebalanceOut(
            ok=True,
            moves=moves,
            count=len(moves)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("year.rebalance.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rebalance: {str(e)}"
        )


@router.get("/prefill")
async def prefill_year_plan(
    childId: str = Query(..., description="Child ID"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get prefilled data for year plan creation.
    Aggregates last-year mins/week; returns empty arrays if none.
    """
    log_event("year.prefill.start", user_id=user["id"], child_id=childId)
    
    try:
        # Validate family access
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        if not child_belongs_to_family(childId, family_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child does not belong to family"
            )
        
        # Get last year's events to calculate averages
        supabase = get_admin_client()
        one_year_ago = (datetime.now() - timedelta(days=365)).isoformat()
        
        # Events table only has subject_id, not subject name
        events_resp = supabase.table("events").select(
            "subject_id, minutes, start_ts"
        ).eq(
            "child_id", childId
        ).eq(
            "status", "done"
        ).gte(
            "start_ts", one_year_ago
        ).execute()
        
        # If no events found, fallback to onboarding interests
        if not events_resp.data:
            # Get child's interests from onboarding
            child_resp = supabase.table("children").select("interests").eq("id", childId).single().execute()
            
            if child_resp.data:
                interests_raw = child_resp.data.get("interests", [])
                interests = []
                
                # Handle different formats: array, string, or JSON string
                if isinstance(interests_raw, list):
                    interests = [str(i).strip() for i in interests_raw if i]
                elif isinstance(interests_raw, str):
                    # Try to parse as JSON first (in case it's a JSON string like '["Arts"]')
                    try:
                        parsed = json.loads(interests_raw)
                        if isinstance(parsed, list):
                            interests = [str(i).strip() for i in parsed if i]
                        else:
                            interests = [interests_raw.strip()] if interests_raw.strip() else []
                    except (json.JSONDecodeError, ValueError):
                        # Not JSON, treat as comma-separated string
                        interests = [i.strip() for i in interests_raw.split(",") if i.strip()]
                else:
                    interests = []
                
                # Convert interests to subjects with default hours (3 hours/week = 180 minutes)
                if interests:
                    subjects = []
                    hours_per_week = {}
                    for interest in interests:
                        if interest:  # Skip empty strings
                            # Extract the actual interest name (handle if it's still wrapped somehow)
                            interest_name = str(interest).strip()
                            # Remove any array brackets or quotes that might be in the string
                            interest_name = interest_name.strip('[]"\'')
                            
                            # Create a safe key from interest name (lowercase, underscores)
                            subject_key = interest_name.lower().replace(" ", "_").replace("-", "_")
                            
                            # Use the cleaned interest name as the display name (capitalize first letter)
                            display_name = interest_name.capitalize() if interest_name else subject_key
                            
                            subjects.append({
                                "key": display_name,  # Use display name, not the key
                                "targetMinPerWeek": 180  # Default: 3 hours/week = 180 minutes
                            })
                            hours_per_week[subject_key] = 3.0
                    
                    log_event("year.prefill.success", user_id=user["id"], child_id=childId, subject_count=len(subjects), source="interests")
                    return {
                        "subjects": subjects,
                        "hoursPerWeek": hours_per_week
                    }
            
            # No events and no interests - return empty
            return {
                "subjects": [],
                "hoursPerWeek": {}
            }
        
        # Aggregate by subject_id
        subject_minutes = {}
        for event in events_resp.data:
            subject_id = event.get("subject_id")
            if not subject_id:
                continue
            
            minutes = event.get("minutes") or 0
            if subject_id not in subject_minutes:
                subject_minutes[subject_id] = 0
            subject_minutes[subject_id] += minutes
        
        # Get subject names (try multiple table names)
        subject_ids = list(subject_minutes.keys())
        subject_map = {}
        
        # Try to get subject names from various possible table names
        # Note: subject table is family-scoped, so filter by family_id
        for table_name in ["family_subjects", "subjects", "subject"]:
            try:
                query = supabase.table(table_name).select("id, name").in_("id", subject_ids)
                # If table has family_id column, filter by it
                if table_name == "subject":
                    query = query.eq("family_id", family_id)
                subjects_resp = query.execute()
                if subjects_resp.data:
                    subject_map = {s["id"]: s["name"] for s in subjects_resp.data}
                    break  # Got names, stop trying
            except Exception as e:
                # Log error but continue trying other tables
                print(f"[year/prefill] Failed to query {table_name}: {e}")
                continue
        
        # Calculate weekly averages (assuming 52 weeks)
        subjects = []
        hours_per_week = {}
        for subject_id, total_minutes in subject_minutes.items():
            # Use subject name if available, otherwise use a generic name based on ID
            subject_name = subject_map.get(subject_id)
            if not subject_name:
                # Fallback: use subject_id as name, or a generic name
                subject_name = f"Subject {subject_id[:8]}" if subject_id else "Unnamed"
            
            weekly_minutes = int(total_minutes / 52)
            
            # Create a safe key from subject name
            subject_key = str(subject_name).lower().replace(" ", "_").replace("-", "_")
            
            subjects.append({
                "key": subject_key,
                "targetMinPerWeek": weekly_minutes
            })
            
            hours_per_week[subject_key] = round(weekly_minutes / 60, 1)
        
        log_event("year.prefill.success", user_id=user["id"], child_id=childId, subject_count=len(subjects))
        return {
            "subjects": subjects,
            "hoursPerWeek": hours_per_week
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("year.prefill.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to prefill: {str(e)}"
        )

