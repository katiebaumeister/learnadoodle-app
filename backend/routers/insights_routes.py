"""
FastAPI routes for Insights
Provides AI-powered insights and observations about learning progress
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from pathlib import Path
import sys

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client

router = APIRouter(prefix="/api/insights", tags=["insights"])


class InsightOut(BaseModel):
    type: str  # 'alert', 'observation', 'nudge'
    title: str
    description: str
    action_type: Optional[str] = None  # e.g., 'reschedule', 'add_event', 'review_subject'
    payload: Optional[dict] = None
    proposed_changes: Optional[List[dict]] = None


@router.get("", response_model=List[InsightOut])
async def get_insights(
    family_id: str = Query(..., description="Family ID"),
    children: Optional[str] = Query(None, description="Comma-separated list of child IDs"),
    start: Optional[str] = Query(None, description="Start date (ISO format)"),
    end: Optional[str] = Query(None, description="End date (ISO format)"),
    timeframe: Optional[str] = Query(None, description="Timeframe filter: 'today', 'week', 'month'"),
    date: Optional[str] = Query(None, description="Specific date for 'today' timeframe"),
    child_ids: Optional[List[str]] = Query(None, description="Child IDs as list (alternative to children param)"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """
    Get insights feed for a family and date range.
    Returns AI-powered observations, alerts, and suggestions.
    """
    try:
        # Verify user has access to this family
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != family_id:
            raise HTTPException(status_code=403, detail="Access denied to this family")

        supabase = get_admin_client()

        # Parse child IDs - make optional
        child_id_list = []
        if child_ids:
            child_id_list = child_ids
        elif children:
            child_id_list = [cid.strip() for cid in children.split(",") if cid.strip()]

        # Verify all children belong to family (only if child IDs provided)
        if child_id_list:
            children_res = supabase.table("children").select("id").eq("family_id", family_id).in_("id", child_id_list).execute()
            if len(children_res.data or []) != len(child_id_list):
                raise HTTPException(status_code=403, detail="Some children not accessible")
        else:
            # If no children specified, get all children for the family
            children_res = supabase.table("children").select("id").eq("family_id", family_id).execute()
            child_id_list = [c["id"] for c in (children_res.data or [])]

        # Parse dates - use timeframe/date if start/end not provided
        start_date = None
        end_date = None
        
        if start and end:
            try:
                start_date = datetime.fromisoformat(start.replace("Z", "+00:00")).date()
                end_date = datetime.fromisoformat(end.replace("Z", "+00:00")).date()
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid date format: {str(e)}")
        elif timeframe == "today" and date:
            try:
                target_date = datetime.fromisoformat(date.replace("Z", "+00:00")).date()
                start_date = target_date
                end_date = target_date
            except Exception:
                # If date parsing fails, use today
                from datetime import date as date_class
                today = date_class.today()
                start_date = today
                end_date = today

        # For now, return empty array (endpoint exists but insights generation not yet implemented)
        # TODO: Implement actual insights generation logic
        # This could analyze:
        # - Attendance patterns
        # - Subject coverage gaps
        # - Learning progress trends
        # - Upcoming deadlines
        # - Schedule optimization opportunities

        insights = []

        # Example: Check for upcoming events without preparation
        # Only query events if we have valid dates and child IDs
        if child_id_list and start_date and end_date and start and end:
            try:
                # Get events in range
                events_res = supabase.table("events").select(
                    "id, title, start_ts, child_id, subject_id"
                ).eq("family_id", family_id).in_("child_id", child_id_list).gte("start_ts", start).lte("start_ts", end).execute()

                # Example insight: Events tomorrow morning without notes
                if timeframe == "today" and date:
                    try:
                        target_date = datetime.fromisoformat(date.replace("Z", "+00:00")).date()
                        tomorrow = target_date
                        # Check for events tomorrow morning
                        tomorrow_start = datetime.combine(tomorrow, datetime.min.time()).isoformat()
                        tomorrow_end = datetime.combine(tomorrow, datetime.min.time().replace(hour=12)).isoformat()
                        
                        tomorrow_events = [
                            e for e in (events_res.data or [])
                            if tomorrow_start <= e.get("start_ts", "") <= tomorrow_end
                        ]
                        
                        if tomorrow_events:
                            insights.append(InsightOut(
                                type="nudge",
                                title="Tomorrow Morning Prep",
                                description=f"You have {len(tomorrow_events)} event(s) scheduled for tomorrow morning. Consider preparing materials tonight.",
                                action_type="open_planner",
                                payload={"date": date, "focus": "prep"}
                            ))
                    except Exception:
                        pass  # Skip if date parsing fails
            except Exception as e:
                # If query fails, just return empty insights (don't crash)
                log_event("insights_query_error", family_id=family_id, error=str(e))

        log_event("insights_fetched", family_id=family_id, child_count=len(child_id_list), timeframe=timeframe, insight_count=len(insights))

        return insights

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="get_insights")
        raise HTTPException(status_code=500, detail=f"Error fetching insights: {str(e)}")

