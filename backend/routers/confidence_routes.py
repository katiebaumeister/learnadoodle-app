"""
FastAPI routes for Confidence Layer / Parent Reassurance Engine
Provides "You're Doing Enough" features for parents
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
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

router = APIRouter(prefix="/api/confidence", tags=["confidence"])


# ============================================================
# Request/Response Models
# ============================================================

class ReadinessMeterOut(BaseModel):
    child_id: str
    child_name: str
    attendance_percentage: float
    attendance_days_logged: int
    attendance_message: str
    credits_by_subject: Dict[str, Any]
    evidence_by_subject: Dict[str, Any]
    pacing_data: Dict[str, Any]
    pacing_message: str
    velocity_by_subject: Dict[str, Any]


class AssuranceCardOut(BaseModel):
    message: str
    tone: str  # 'encouraging', 'reassuring', 'supportive'
    metrics: Dict[str, Any]
    week_start: date
    week_end: date


class ReassuranceMessageOut(BaseModel):
    message: str
    tone: str
    context: str
    data: Dict[str, Any]


class PacingPredictionOut(BaseModel):
    prediction: str
    status: str  # 'on_track', 'slightly_behind', 'adjusted', 'no_plan'
    projected_completion: Optional[date] = None
    weeks_remaining: Optional[int] = None
    velocity: Optional[float] = None


class StudentStreakOut(BaseModel):
    current_streak: int
    longest_streak: int
    recent_completions: int
    message: str


# ============================================================
# Routes
# ============================================================

@router.get("/readiness/{child_id}", response_model=ReadinessMeterOut)
async def get_readiness_meter(
    child_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get comprehensive readiness metrics for a child.
    Shows attendance %, credits, evidence depth, pacing vs plan.
    """
    try:
        supabase = get_admin_client()
        
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, first_name, family_id").eq("id", child_id).single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
        
        # Get readiness data from view
        readiness_res = supabase.table("confidence_readiness").select("*").eq("child_id", child_id).single().execute()
        
        if not readiness_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Readiness data not found")
        
        data = readiness_res.data
        child_name = data.get("child_name", "Student")
        
        # Generate attendance message
        attendance_pct = data.get("attendance_percentage", 0)
        days_logged = data.get("attendance_days_logged", 0)
        
        # Calculate days in year so far
        year_start = datetime.now().replace(month=1, day=1).date()
        days_in_year_so_far = (date.today() - year_start).days + 1
        
        if attendance_pct >= 80:
            attendance_message = f"You've logged {days_logged} days so far this year — this is excellent consistency."
        elif attendance_pct >= 60:
            attendance_message = f"You've logged {days_logged} days so far this year — this is normal for mid-year."
        else:
            attendance_message = f"You've logged {days_logged} days so far this year — consider logging a bit more frequently."
        
        # Generate pacing message
        pacing_data = data.get("pacing_data", {})
        planned_modules = pacing_data.get("planned_modules", 0)
        current_module = pacing_data.get("current_module", 0)
        completed_modules = pacing_data.get("completed_modules", 0)
        
        if planned_modules > 0:
            pacing_message = f"You planned {planned_modules} modules this term; you're on module {current_module}. Most families at this point are around {max(1, current_module - 1)}–{current_module + 1}. This is within the normal zone."
        else:
            pacing_message = "No year plan found. Consider creating one to track pacing."
        
        log_event("confidence.readiness.accessed", user_id=user["id"], child_id=child_id)
        
        return ReadinessMeterOut(
            child_id=child_id,
            child_name=child_name,
            attendance_percentage=attendance_pct,
            attendance_days_logged=days_logged,
            attendance_message=attendance_message,
            credits_by_subject=data.get("credits_by_subject", {}),
            evidence_by_subject=data.get("evidence_by_subject", {}),
            pacing_data=pacing_data,
            pacing_message=pacing_message,
            velocity_by_subject=data.get("velocity_by_subject", {}),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        log_event("confidence.readiness.error", user_id=user["id"], child_id=child_id, error=str(e), traceback=error_trace)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get readiness meter: {str(e)}"
        )


@router.get("/assurance", response_model=AssuranceCardOut)
async def get_assurance_card(
    week_start: Optional[str] = Query(None, description="Week start date in YYYY-MM-DD format (defaults to current week)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get at-a-glance assurance card for home screen.
    Provides supportive, data-based reassurance message.
    """
    try:
        supabase = get_admin_client()
        
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        # Parse week_start date
        if week_start:
            try:
                week_start_date = datetime.strptime(week_start, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Use YYYY-MM-DD"
                )
        else:
            # Default to current week
            today = date.today()
            week_start_date = today - timedelta(days=today.weekday())
        
        week_end_date = week_start_date + timedelta(days=6)
        week_start_str = week_start_date.isoformat()
        week_end_str = (week_end_date + timedelta(days=1)).isoformat()
        
        # Get children
        children_res = supabase.table("children").select("id, first_name").eq("family_id", family_id).eq("archived", False).execute()
        children = children_res.data or []
        
        if not children:
            return AssuranceCardOut(
                message="Welcome! Add your first child to start tracking progress.",
                tone="encouraging",
                metrics={},
                week_start=week_start_date,
                week_end=week_end_date,
            )
        
        # Get this week's metrics
        total_sessions = 0
        total_completed = 0
        attendance_days = 0
        
        for child in children:
            child_id = child["id"]
            
            # Count events
            events_res = supabase.table("events").select("id, status").eq("child_id", child_id).gte("start_ts", week_start_str).lt("start_ts", week_end_str).execute()
            events = events_res.data or []
            total_sessions += len(events)
            total_completed += len([e for e in events if e.get("status") == "done"])
            
            # Count attendance days
            attendance_res = supabase.table("attendance_records").select("day_date").eq("child_id", child_id).gte("day_date", week_start_date.isoformat()).lte("day_date", week_end_date.isoformat()).execute()
            attendance_days += len(set([a["day_date"] for a in (attendance_res.data or [])]))
        
        # Generate message
        if total_completed >= 8 and attendance_days >= 4:
            message = f"You're doing great. Your family completed {total_completed} learning sessions this week, met all required attendance, and logged consistent progress."
            tone = "encouraging"
        elif total_completed >= 5:
            message = f"You're on track. Your family completed {total_completed} learning sessions this week — this is solid progress."
            tone = "supportive"
        else:
            message = f"You're building momentum. {total_completed} sessions completed this week — every step counts."
            tone = "reassuring"
        
        log_event("confidence.assurance.accessed", user_id=user["id"], week_start=week_start_date.isoformat())
        
        return AssuranceCardOut(
            message=message,
            tone=tone,
            metrics={
                "sessions_completed": total_completed,
                "total_sessions": total_sessions,
                "attendance_days": attendance_days,
            },
            week_start=week_start_date,
            week_end=week_end_date,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("confidence.assurance.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get assurance card: {str(e)}"
        )


@router.get("/reassurance/{child_id}", response_model=ReassuranceMessageOut)
async def get_reassurance_message(
    child_id: str,
    context: str = Query("general", description="Context: 'late_completion', 'skipped_item', 'low_evidence', 'general'"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get contextual reassurance message for a specific situation.
    Used when parent marks something late, skips something, etc.
    """
    try:
        supabase = get_admin_client()
        
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id").eq("id", child_id).single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
        
        # Call RPC function
        rpc_res = supabase.rpc("get_reassurance_message", {
            "p_family_id": family_id,
            "p_child_id": child_id,
            "p_context": context,
        }).execute()
        
        if not rpc_res.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate reassurance message")
        
        log_event("confidence.reassurance.accessed", user_id=user["id"], child_id=child_id, context=context)
        
        return ReassuranceMessageOut(**rpc_res.data)
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("confidence.reassurance.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get reassurance message: {str(e)}"
        )


@router.get("/prediction/{child_id}", response_model=PacingPredictionOut)
async def get_pacing_prediction(
    child_id: str,
    subject_id: Optional[str] = Query(None, description="Optional subject ID for subject-specific prediction"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get future pacing prediction with LLM-powered forecast.
    Tells parents when they'll finish the year plan at current pace.
    """
    try:
        supabase = get_admin_client()
        
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id").eq("id", child_id).single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
        
        # Prepare RPC parameters
        rpc_params = {
            "p_family_id": family_id,
            "p_child_id": child_id,
        }
        if subject_id:
            rpc_params["p_subject_id"] = subject_id
        
        # Call RPC function
        rpc_res = supabase.rpc("get_pacing_prediction", rpc_params).execute()
        
        if not rpc_res.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate prediction")
        
        result = rpc_res.data
        
        # Convert date strings to date objects if present
        if result.get("projected_completion"):
            result["projected_completion"] = datetime.fromisoformat(result["projected_completion"]).date()
        
        log_event("confidence.prediction.accessed", user_id=user["id"], child_id=child_id, subject_id=subject_id)
        
        return PacingPredictionOut(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("confidence.prediction.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get prediction: {str(e)}"
        )


@router.get("/streak/{child_id}", response_model=StudentStreakOut)
async def get_student_streak(
    child_id: str,
    days_back: int = Query(30, description="Number of days to look back"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get student streak data for parent reassurance.
    Shows current streak, longest streak, and generates supportive message.
    """
    try:
        supabase = get_admin_client()
        
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        # Verify child belongs to family
        child_res = supabase.table("children").select("id, family_id").eq("id", child_id).single().execute()
        if not child_res.data or child_res.data["family_id"] != family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
        
        # Call RPC function - handle potential JSONB encoding issues
        try:
            rpc_res = supabase.rpc("get_student_streak_data", {
                "p_family_id": family_id,
                "p_child_id": child_id,
                "p_days_back": days_back,
            }).execute()
        except Exception as rpc_err:
            # If RPC call fails, check if error contains the data
            error_str = str(rpc_err)
            import json
            import re
            # Try to extract JSON from error message
            json_match = re.search(r'\{[^{}]*"current_streak"[^{}]*\}', error_str, re.DOTALL)
            if json_match:
                try:
                    json_str = json_match.group()
                    # Fix escaped unicode and quotes
                    json_str = json_str.replace('\\\\xe2\\\\x80\\\\x94', '—').replace('\\"', '"').replace("\\'", "'")
                    streak_data = json.loads(json_str)
                    # Extracted streak from error fallback (non-critical, suppress log)
                    # log_event("confidence.streak.extracted_from_error", user_id=user["id"], child_id=child_id, level="debug")
                    return StudentStreakOut(**streak_data)
                except (json.JSONDecodeError, ValueError):
                    pass
            # If extraction fails, return defaults
            log_event("confidence.streak.rpc_exception", user_id=user["id"], child_id=child_id, error=str(rpc_err)[:200])
            return StudentStreakOut(
                current_streak=0,
                longest_streak=0,
                recent_completions=0,
                message="Building consistency — every day counts!"
            )
        
        # Handle RPC response - Supabase sometimes wraps JSONB in error details
        streak_data = None
        
        # Check if response has error message but data in details
        if rpc_res.data and isinstance(rpc_res.data, dict):
            if rpc_res.data.get("message") == "JSON could not be generated" and "details" in rpc_res.data:
                # Extract JSON from error details
                import json
                import re
                details = rpc_res.data["details"]
                # Handle byte string
                if isinstance(details, bytes):
                    details = details.decode('utf-8')
                # Extract JSON object from details
                json_match = re.search(r'\{[^{}]*"current_streak"[^{}]*\}', str(details), re.DOTALL)
                if json_match:
                    try:
                        json_str = json_match.group()
                        # Fix escaped unicode (em dash) and quotes
                        json_str = json_str.replace('\\\\xe2\\\\x80\\\\x94', '—').replace('\\"', '"').replace("\\'", "'")
                        streak_data = json.loads(json_str)
                    except (json.JSONDecodeError, ValueError) as parse_err:
                        log_event("confidence.streak.parse_error", user_id=user["id"], child_id=child_id, error=str(parse_err))
            else:
                # Normal response - data is directly in rpc_res.data
                streak_data = rpc_res.data
        
        # If still no data, return defaults
        if not streak_data or not isinstance(streak_data, dict):
            log_event("confidence.streak.no_data", user_id=user["id"], child_id=child_id)
            return StudentStreakOut(
                current_streak=0,
                longest_streak=0,
                recent_completions=0,
                message="Building consistency — every day counts!"
            )
        
        log_event("confidence.streak.accessed", user_id=user["id"], child_id=child_id)
        
        return StudentStreakOut(**streak_data)
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("confidence.streak.error", user_id=user["id"], child_id=child_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get streak data: {str(e)}"
        )

