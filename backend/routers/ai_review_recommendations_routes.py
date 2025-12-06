"""
AI Review Task Recommendations Routes
Advanced recommendation system for review tasks, spaced repetition, mastery checks
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
from llm import llm_generate_review_recommendations

router = APIRouter(prefix="/api/ai/reviews", tags=["ai_reviews"])


class ReviewRecommendationOut(BaseModel):
    id: str
    recommendation_type: str
    priority: int
    title: str
    description: str
    reason: str
    linked_content_id: Optional[str]
    linked_content_type: Optional[str]
    estimated_benefit: str
    estimated_time_minutes: Optional[int]
    cognitive_load: str
    optimal_timing: Dict[str, Any]
    mastery_level: Optional[float]
    target_mastery: Optional[float]
    status: str
    created_at: str


@router.post("/generate", response_model=List[ReviewRecommendationOut])
async def generate_review_recommendations(
    child_id: str = Query(..., description="Child ID"),
    recommendation_types: Optional[List[str]] = Query(default=None, description="Filter by types"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Generate AI-powered review task recommendations"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not in family")

        # Get child info
        child_result = supabase.table("children").select("*").eq("id", child_id).single().execute()
        if not child_result.data:
            raise HTTPException(status_code=404, detail="Child not found")
        child = child_result.data

        # Gather learning data for recommendations
        context = {
            "family_id": family_id,
            "child_id": child_id,
            "child_name": child.get("first_name", "the student"),
        }

        # Get completed assignments that need review
        assignments_result = supabase.table("assignments").select(
            "id, title, due_date, status, cognitive_load, related_subject, created_at"
        ).eq("child_id", child_id).in_("status", ["accepted", "reviewed"]).order("updated_at", desc=True).limit(50).execute()
        context["completed_assignments"] = assignments_result.data or []

        # Get recent events for skill tracking
        events_result = supabase.table("events").select(
            "id, title, start_ts, subject_id, cognitive_load"
        ).eq("child_id", child_id).order("start_ts", desc=True).limit(100).execute()
        context["recent_events"] = events_result.data or []

        # Get outcomes for mastery tracking
        outcomes_result = supabase.table("event_outcomes").select(
            "id, event_id, strengths, struggles, created_at"
        ).eq("child_id", child_id).order("created_at", desc=True).limit(50).execute()
        context["outcomes"] = outcomes_result.data or []

        # Get existing review recommendations to avoid duplicates
        existing_reviews = supabase.table("ai_review_recommendations").select(
            "linked_content_id, linked_content_type"
        ).eq("child_id", child_id).eq("status", "pending").execute()
        existing_content = {
            (r.get("linked_content_id"), r.get("linked_content_type"))
            for r in (existing_reviews.data or [])
        }

        # Call LLM to generate recommendations
        try:
            recommendations_data = await llm_generate_review_recommendations(context)
        except Exception as e:
            log_event("ai.reviews.llm_error", user_id=user["id"], error=str(e))
            raise HTTPException(status_code=500, detail=f"AI service unavailable: {str(e)}")

        # Filter by requested types
        requested_types = recommendation_types or [
            "spaced_review", "mastery_check", "skill_practice", "concept_reinforcement", "assignment_review"
        ]

        filtered_recommendations = [
            rec for rec in recommendations_data.get("recommendations", [])
            if rec.get("recommendation_type") in requested_types
        ]

        # Insert recommendations into database
        inserted_recommendations = []
        for rec in filtered_recommendations:
            # Skip if already exists
            content_key = (rec.get("linked_content_id"), rec.get("linked_content_type"))
            if content_key in existing_content:
                continue

            rec_data = {
                "family_id": family_id,
                "child_id": child_id,
                "recommendation_type": rec.get("recommendation_type", "spaced_review"),
                "priority": rec.get("priority", 3),
                "title": rec.get("title", ""),
                "description": rec.get("description", ""),
                "reason": rec.get("reason", ""),
                "linked_content_id": rec.get("linked_content_id"),
                "linked_content_type": rec.get("linked_content_type"),
                "estimated_benefit": rec.get("estimated_benefit", ""),
                "estimated_time_minutes": rec.get("estimated_time_minutes"),
                "cognitive_load": rec.get("cognitive_load", "medium"),
                "optimal_timing": rec.get("optimal_timing", {}),
                "spaced_repetition_data": rec.get("spaced_repetition_data", {}),
                "mastery_level": rec.get("mastery_level"),
                "target_mastery": rec.get("target_mastery", 0.8),
                "status": "pending",
                "ai_model": "review_engine",
            }

            result = supabase.table("ai_review_recommendations").insert(rec_data).execute()
            if result.data:
                inserted_recommendations.append(result.data[0])

        log_event("ai.reviews.generated", user_id=user["id"], child_id=child_id, count=len(inserted_recommendations))

        return inserted_recommendations

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_review_recommendations_generate")
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {str(e)}")


@router.get("/", response_model=List[ReviewRecommendationOut])
async def get_review_recommendations(
    child_id: str,
    recommendation_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="Filter by status"),
    priority_min: Optional[int] = Query(None, ge=1, le=5),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get review task recommendations"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=403, detail="Child not in family")

        query = supabase.table("ai_review_recommendations").select("*").eq("child_id", child_id).eq("family_id", family_id)

        if recommendation_type:
            query = query.eq("recommendation_type", recommendation_type)

        if status:
            query = query.eq("status", status)
        else:
            # Default to pending
            query = query.eq("status", "pending")

        if priority_min:
            query = query.gte("priority", priority_min)

        result = query.order("priority", desc=True).order("created_at", desc=True).limit(limit).execute()

        return result.data or []

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_review_recommendations_get")
        raise HTTPException(status_code=500, detail=f"Error getting recommendations: {str(e)}")


@router.post("/{recommendation_id}/schedule")
async def schedule_review(
    recommendation_id: str,
    scheduled_date: date,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Schedule a review recommendation"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify recommendation belongs to family
        rec_result = supabase.table("ai_review_recommendations").select("*").eq("id", recommendation_id).eq("family_id", family_id).single().execute()
        if not rec_result.data:
            raise HTTPException(status_code=404, detail="Recommendation not found")

        # Update status
        result = supabase.table("ai_review_recommendations").update({
            "status": "scheduled",
            "scheduled_at": scheduled_date.isoformat(),
        }).eq("id", recommendation_id).execute()

        log_event("ai.review.scheduled", user_id=user["id"], recommendation_id=recommendation_id)

        return {"success": True, "recommendation": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_review_schedule")
        raise HTTPException(status_code=500, detail=f"Error scheduling review: {str(e)}")


@router.post("/{recommendation_id}/complete")
async def complete_review(
    recommendation_id: str,
    actual_time_minutes: Optional[int] = Query(None),
    effectiveness_rating: Optional[int] = Query(None, ge=1, le=5),
    notes: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Mark a review recommendation as completed"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify recommendation belongs to family
        rec_result = supabase.table("ai_review_recommendations").select("*").eq("id", recommendation_id).eq("family_id", family_id).single().execute()
        if not rec_result.data:
            raise HTTPException(status_code=404, detail="Recommendation not found")

        recommendation = rec_result.data
        child_id = recommendation["child_id"]

        # Update recommendation status
        supabase.table("ai_review_recommendations").update({
            "status": "completed",
            "completed_at": datetime.now().isoformat(),
        }).eq("id", recommendation_id).execute()

        # Create completion record
        completion_data = {
            "recommendation_id": recommendation_id,
            "child_id": child_id,
            "completed_at": datetime.now().isoformat(),
            "actual_time_minutes": actual_time_minutes,
            "effectiveness_rating": effectiveness_rating,
            "notes": notes,
        }
        supabase.table("ai_review_completions").insert(completion_data).execute()

        log_event("ai.review.completed", user_id=user["id"], recommendation_id=recommendation_id)

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_review_complete")
        raise HTTPException(status_code=500, detail=f"Error completing review: {str(e)}")


@router.post("/{recommendation_id}/dismiss")
async def dismiss_review(
    recommendation_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Dismiss a review recommendation"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        result = supabase.table("ai_review_recommendations").update({
            "status": "dismissed",
            "dismissed_at": datetime.now().isoformat(),
        }).eq("id", recommendation_id).eq("family_id", family_id).execute()

        log_event("ai.review.dismissed", user_id=user["id"], recommendation_id=recommendation_id)

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_review_dismiss")
        raise HTTPException(status_code=500, detail=f"Error dismissing review: {str(e)}")

