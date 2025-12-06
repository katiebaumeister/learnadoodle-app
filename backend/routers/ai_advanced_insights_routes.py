"""
Advanced AI Insights Engine Routes
Comprehensive multi-layer insights with predictive and prescriptive capabilities
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client
from llm import llm_generate_advanced_insights

router = APIRouter(prefix="/api/ai/insights/advanced", tags=["ai_insights"])


class GenerateInsightsIn(BaseModel):
    child_id: Optional[str] = None
    insight_types: Optional[List[str]] = Field(default=None, description="Filter by types: emotional, tactical, strategic, predictive, prescriptive")
    layers: Optional[List[str]] = Field(default=None, description="Filter by layers: surface, pattern, deep, predictive")
    date_range_start: Optional[date] = None
    date_range_end: Optional[date] = None


class InsightOut(BaseModel):
    id: str
    insight_type: str
    layer: str
    title: str
    description: str
    data_points: Dict[str, Any]
    confidence_score: float
    impact_score: int
    actionable: bool
    proposed_changes: List[Dict[str, Any]]
    generated_at: str


@router.post("/generate", response_model=List[InsightOut])
async def generate_advanced_insights(
    body: GenerateInsightsIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Generate comprehensive multi-layer AI insights"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child if provided
        if body.child_id:
            if not child_belongs_to_family(body.child_id, family_id):
                raise HTTPException(status_code=403, detail="Child not in family")

        # Build context for insight generation
        context = {
            "family_id": family_id,
            "child_id": body.child_id,
            "date_range_start": body.date_range_start.isoformat() if body.date_range_start else None,
            "date_range_end": body.date_range_end.isoformat() if body.date_range_end else None,
        }

        # Gather learning data
        if body.child_id:
            # Get events
            events_query = supabase.table("events").select("*").eq("child_id", body.child_id)
            if body.date_range_start:
                events_query = events_query.gte("start_ts", body.date_range_start.isoformat())
            if body.date_range_end:
                events_query = events_query.lte("start_ts", body.date_range_end.isoformat())
            events_result = events_query.order("start_ts", desc=True).limit(100).execute()
            context["events"] = events_result.data or []

            # Get assignments
            assignments_query = supabase.table("assignments").select("*").eq("child_id", body.child_id)
            if body.date_range_start:
                assignments_query = assignments_query.gte("due_date", body.date_range_start)
            if body.date_range_end:
                assignments_query = assignments_query.lte("due_date", body.date_range_end)
            assignments_result = assignments_query.order("due_date", desc=True).limit(50).execute()
            context["assignments"] = assignments_result.data or []

            # Get outcomes
            outcomes_result = supabase.table("event_outcomes").select("*").eq("child_id", body.child_id).order("created_at", desc=True).limit(50).execute()
            context["outcomes"] = outcomes_result.data or []

            # Get child info
            child_result = supabase.table("children").select("*").eq("id", body.child_id).single().execute()
            if child_result.data:
                context["child_info"] = child_result.data

        # Get family-level data
        family_events_query = supabase.table("events").select("*").eq("family_id", family_id)
        if body.date_range_start:
            family_events_query = family_events_query.gte("start_ts", body.date_range_start.isoformat())
        if body.date_range_end:
            family_events_query = family_events_query.lte("start_ts", body.date_range_end.isoformat())
        family_events_result = family_events_query.order("start_ts", desc=True).limit(200).execute()
        context["family_events"] = family_events_result.data or []

        # Call LLM to generate insights
        start_time = datetime.now()
        try:
            insights_data = await llm_generate_advanced_insights(context)
        except Exception as e:
            log_event("ai.insights.llm_error", user_id=user["id"], error=str(e))
            raise HTTPException(status_code=500, detail=f"AI service unavailable: {str(e)}")
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

        # Filter by requested types and layers
        requested_types = body.insight_types or ["emotional", "tactical", "strategic", "predictive", "prescriptive"]
        requested_layers = body.layers or ["surface", "pattern", "deep", "predictive"]

        filtered_insights = [
            insight for insight in insights_data.get("insights", [])
            if insight.get("insight_type") in requested_types
            and insight.get("layer") in requested_layers
        ]

        # Insert insights into database
        inserted_insights = []
        for insight in filtered_insights:
            insight_data = {
                "family_id": family_id,
                "child_id": body.child_id,
                "insight_type": insight.get("insight_type", "tactical"),
                "layer": insight.get("layer", "surface"),
                "title": insight.get("title", ""),
                "description": insight.get("description", ""),
                "data_points": insight.get("data_points", {}),
                "confidence_score": insight.get("confidence_score", 0.5),
                "impact_score": insight.get("impact_score", 3),
                "actionable": insight.get("actionable", True),
                "proposed_changes": insight.get("proposed_changes", []),
                "expires_at": (datetime.now() + timedelta(days=7)).isoformat() if insight.get("expires_at") else None,
            }
            
            result = supabase.table("ai_insights").insert(insight_data).execute()
            if result.data:
                inserted_insights.append(result.data[0])

        # Log generation
        log_data = {
            "family_id": family_id,
            "child_id": body.child_id,
            "generation_type": "advanced",
            "context_snapshot": {
                "events_count": len(context.get("events", [])),
                "assignments_count": len(context.get("assignments", [])),
            },
            "insights_generated": len(inserted_insights),
            "processing_time_ms": processing_time,
            "model_version": "gpt-4o-mini",
        }
        supabase.table("ai_insight_generation_log").insert(log_data).execute()

        log_event("ai.insights.generated", user_id=user["id"], child_id=body.child_id, count=len(inserted_insights))

        return inserted_insights

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_advanced_insights_generate")
        raise HTTPException(status_code=500, detail=f"Error generating insights: {str(e)}")


@router.get("/", response_model=List[InsightOut])
async def get_insights(
    child_id: Optional[str] = Query(None),
    insight_type: Optional[str] = Query(None),
    layer: Optional[str] = Query(None),
    actionable_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get AI insights"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child if provided
        if child_id:
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(status_code=403, detail="Child not in family")

        query = supabase.table("ai_insights").select("*").eq("family_id", family_id)

        if child_id:
            query = query.eq("child_id", child_id)
        else:
            query = query.is_("child_id", "null")  # Family-level insights

        if insight_type:
            query = query.eq("insight_type", insight_type)

        if layer:
            query = query.eq("layer", layer)

        if actionable_only:
            query = query.eq("actionable", True)

        # Filter out expired insights
        query = query.or_("expires_at.is.null,expires_at.gt." + datetime.now().isoformat())

        result = query.order("generated_at", desc=True).limit(limit).execute()

        return result.data or []

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_insights_get")
        raise HTTPException(status_code=500, detail=f"Error getting insights: {str(e)}")


@router.post("/{insight_id}/apply")
async def apply_insight(
    insight_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Mark an insight as applied"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify insight belongs to family
        insight_result = supabase.table("ai_insights").select("*").eq("id", insight_id).eq("family_id", family_id).single().execute()
        if not insight_result.data:
            raise HTTPException(status_code=404, detail="Insight not found")

        # Update insight
        result = supabase.table("ai_insights").update({
            "applied_at": datetime.now().isoformat(),
        }).eq("id", insight_id).execute()

        log_event("ai.insight.applied", user_id=user["id"], insight_id=insight_id)

        return {"success": True, "insight": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_insight_apply")
        raise HTTPException(status_code=500, detail=f"Error applying insight: {str(e)}")


@router.post("/{insight_id}/dismiss")
async def dismiss_insight(
    insight_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Dismiss an insight"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        result = supabase.table("ai_insights").update({
            "dismissed_at": datetime.now().isoformat(),
        }).eq("id", insight_id).eq("family_id", family_id).execute()

        log_event("ai.insight.dismissed", user_id=user["id"], insight_id=insight_id)

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_insight_dismiss")
        raise HTTPException(status_code=500, detail=f"Error dismissing insight: {str(e)}")

