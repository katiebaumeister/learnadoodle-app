"""
AI Recommendations Routes
Generate recommendations for review tasks, practice sets, etc.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
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

router = APIRouter(prefix="/api/ai/recommendations", tags=["ai_recommendations"])


@router.get("/{child_id}")
async def get_recommendations(
    child_id: str,
    recommendation_type: Optional[str] = Query(None, description="Filter by type"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get AI recommendations for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_check = supabase.table("children").select("id, first_name").eq("id", child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=404, detail="Child not found")

        # Get existing recommendations
        query = supabase.table("ai_recommendations").select("*").eq("child_id", child_id).eq("family_id", family_id).eq("status", "pending")
        
        if recommendation_type:
            query = query.eq("recommendation_type", recommendation_type)

        result = query.order("priority", desc=True).order("created_at", desc=True).execute()

        existing_recommendations = result.data or []

        # Generate new recommendations based on child's learning data
        # This is a placeholder - would use AI to analyze learning patterns
        new_recommendations = []

        # Check for subjects with low coverage
        coverage_result = supabase.rpc("get_low_coverage_subjects", {
            "_family_id": family_id,
            "_child_id": child_id,
            "_days_back": 30,
        }).execute()

        if coverage_result.data:
            for subject in coverage_result.data[:3]:  # Top 3
                new_recommendations.append({
                    "family_id": family_id,
                    "child_id": child_id,
                    "recommendation_type": "practice_set",
                    "title": f"Practice {subject.get('subject_name', 'Subject')}",
                    "description": f"Focus on {subject.get('subject_name', 'this subject')} to improve coverage",
                    "reason": f"Low coverage detected: {subject.get('minutes_needed', 0)} minutes needed",
                    "priority": 4,
                    "linked_content_id": subject.get("subject_id"),
                    "linked_content_type": "subject",
                    "cognitive_load": "medium",
                    "estimated_benefit": "Improve subject coverage and mastery",
                    "status": "pending",
                    "ai_model": "coverage_analyzer",
                })

        # Check for assignments that need review
        assignments_result = supabase.table("assignments").select("id, title, related_subject").eq("child_id", child_id).eq("status", "accepted").order("updated_at", desc=True).limit(5).execute()

        if assignments_result.data:
            for assignment in assignments_result.data[:2]:  # Top 2
                new_recommendations.append({
                    "family_id": family_id,
                    "child_id": child_id,
                    "recommendation_type": "review_task",
                    "title": f"Review: {assignment.get('title', 'Assignment')}",
                    "description": "Review this completed assignment to reinforce learning",
                    "reason": "Completed assignment ready for review",
                    "priority": 3,
                    "linked_content_id": assignment["id"],
                    "linked_content_type": "assignment",
                    "cognitive_load": "low",
                    "estimated_benefit": "Reinforce learning through review",
                    "status": "pending",
                    "ai_model": "review_suggestor",
                })

        # Insert new recommendations if they don't already exist
        if new_recommendations:
            # Check for duplicates
            existing_titles = {r.get("title") for r in existing_recommendations}
            unique_recommendations = [r for r in new_recommendations if r["title"] not in existing_titles]

            if unique_recommendations:
                supabase.table("ai_recommendations").insert(unique_recommendations).execute()

        # Reload all recommendations
        result = query.order("priority", desc=True).order("created_at", desc=True).execute()

        log_event("ai.recommendations.generated", user_id=user["id"], child_id=child_id, count=len(unique_recommendations) if new_recommendations else 0)

        return result.data or []

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_recommendations_get")
        raise HTTPException(status_code=500, detail=f"Error getting recommendations: {str(e)}")


@router.post("/{recommendation_id}/accept")
async def accept_recommendation(
    recommendation_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Accept a recommendation"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Get recommendation
        recommendation = supabase.table("ai_recommendations").select("*").eq("id", recommendation_id).eq("family_id", family_id).single().execute()
        if not recommendation.data:
            raise HTTPException(status_code=404, detail="Recommendation not found")

        # Update status
        result = supabase.table("ai_recommendations").update({
            "status": "accepted",
            "updated_at": datetime.now().isoformat(),
        }).eq("id", recommendation_id).execute()

        log_event("ai.recommendation.accepted", user_id=user["id"], recommendation_id=recommendation_id)

        return {"success": True, "recommendation": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_recommendation_accept")
        raise HTTPException(status_code=500, detail=f"Error accepting recommendation: {str(e)}")


@router.post("/{recommendation_id}/dismiss")
async def dismiss_recommendation(
    recommendation_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Dismiss a recommendation"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        result = supabase.table("ai_recommendations").update({
            "status": "dismissed",
            "updated_at": datetime.now().isoformat(),
        }).eq("id", recommendation_id).eq("family_id", family_id).execute()

        log_event("ai.recommendation.dismissed", user_id=user["id"], recommendation_id=recommendation_id)

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_recommendation_dismiss")
        raise HTTPException(status_code=500, detail=f"Error dismissing recommendation: {str(e)}")

