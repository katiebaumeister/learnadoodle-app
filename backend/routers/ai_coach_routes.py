"""
AI Personal Learning Coach Routes
Provides dedicated coach interface for parents and children
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
from llm import llm_coach_conversation

router = APIRouter(prefix="/api/ai/coach", tags=["ai_coach"])


class CoachMessageIn(BaseModel):
    message: str
    session_id: Optional[str] = None
    child_id: Optional[str] = None
    session_type: str = Field(..., description="'parent' or 'child'")


class CoachMessageOut(BaseModel):
    session_id: str
    response: str
    recommendations: Optional[List[Dict[str, Any]]] = None
    conversation_history: List[Dict[str, Any]]


class CoachSessionOut(BaseModel):
    id: str
    session_type: str
    conversation_history: List[Dict[str, Any]]
    context_data: Dict[str, Any]
    goals: List[Dict[str, Any]]
    last_interaction_at: str


@router.post("/conversation", response_model=CoachMessageOut)
async def coach_conversation(
    body: CoachMessageIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Have a conversation with the AI learning coach"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child if provided
        if body.child_id:
            if not child_belongs_to_family(body.child_id, family_id):
                raise HTTPException(status_code=403, detail="Child not in family")

        # Get or create session
        if body.session_id:
            session_result = supabase.table("ai_coach_sessions").select("*").eq("id", body.session_id).eq("family_id", family_id).single().execute()
            if not session_result.data:
                raise HTTPException(status_code=404, detail="Session not found")
            session = session_result.data
        else:
            # Create new session
            session_data = {
                "family_id": family_id,
                "user_id": user["id"] if body.session_type == "parent" else None,
                "child_id": body.child_id if body.session_type == "child" else None,
                "session_type": body.session_type,
            }
            session_result = supabase.table("ai_coach_sessions").insert(session_data).execute()
            if not session_result.data:
                raise HTTPException(status_code=500, detail="Failed to create session")
            session = session_result.data[0]

        session_id = session["id"]

        # Get conversation history
        conversation_history = session.get("conversation_history", [])
        
        # Add user message
        user_message = {
            "role": "user",
            "content": body.message,
            "timestamp": datetime.now().isoformat()
        }
        conversation_history.append(user_message)

        # Build context for coach
        context = {
            "family_id": family_id,
            "user_id": user["id"],
            "child_id": body.child_id,
            "session_type": body.session_type,
            "conversation_history": conversation_history[-10:],  # Last 10 messages
            "context_data": session.get("context_data", {}),
            "goals": session.get("goals", []),
        }

        # Get learning context if child session
        if body.child_id:
            child_result = supabase.table("children").select("*").eq("id", body.child_id).single().execute()
            if child_result.data:
                context["child_info"] = child_result.data

            # Get recent progress
            events_result = supabase.table("events").select("id, title, start_ts, end_ts, subject_id, status").eq("child_id", body.child_id).order("start_ts", desc=True).limit(20).execute()
            context["recent_events"] = events_result.data or []

            # Get assignments
            assignments_result = supabase.table("assignments").select("id, title, due_date, status, cognitive_load").eq("child_id", body.child_id).order("due_date", desc=True).limit(10).execute()
            context["recent_assignments"] = assignments_result.data or []

        # Call LLM for coach response
        try:
            coach_response = await llm_coach_conversation(context)
        except Exception as e:
            log_event("ai.coach.llm_error", user_id=user["id"], error=str(e))
            raise HTTPException(status_code=500, detail=f"AI service unavailable: {str(e)}")

        # Add assistant response
        assistant_message = {
            "role": "assistant",
            "content": coach_response.get("response", "I'm here to help with your learning journey!"),
            "timestamp": datetime.now().isoformat()
        }
        conversation_history.append(assistant_message)

        # Update session
        update_data = {
            "conversation_history": conversation_history,
            "last_interaction_at": datetime.now().isoformat(),
        }
        
        # Update context if provided
        if coach_response.get("context_updates"):
            current_context = session.get("context_data", {})
            current_context.update(coach_response.get("context_updates", {}))
            update_data["context_data"] = current_context

        # Update goals if provided
        if coach_response.get("goals"):
            update_data["goals"] = coach_response.get("goals")

        supabase.table("ai_coach_sessions").update(update_data).eq("id", session_id).execute()

        # Create recommendations if provided
        recommendations = []
        if coach_response.get("recommendations"):
            for rec in coach_response.get("recommendations", []):
                rec_data = {
                    "session_id": session_id,
                    "recommendation_type": rec.get("type", "learning_strategy"),
                    "title": rec.get("title", ""),
                    "description": rec.get("description"),
                    "action_items": rec.get("action_items", []),
                    "priority": rec.get("priority", 3),
                }
                rec_result = supabase.table("ai_coach_recommendations").insert(rec_data).execute()
                if rec_result.data:
                    recommendations.append(rec_result.data[0])

        log_event("ai.coach.conversation", user_id=user["id"], session_id=session_id, session_type=body.session_type)

        return {
            "session_id": session_id,
            "response": coach_response.get("response", ""),
            "recommendations": recommendations,
            "conversation_history": conversation_history,
        }

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_coach_conversation")
        raise HTTPException(status_code=500, detail=f"Error in coach conversation: {str(e)}")


@router.get("/sessions", response_model=List[CoachSessionOut])
async def get_coach_sessions(
    session_type: Optional[str] = Query(None, description="Filter by 'parent' or 'child'"),
    child_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get coach sessions for the user"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        query = supabase.table("ai_coach_sessions").select("*").eq("family_id", family_id)

        if session_type:
            query = query.eq("session_type", session_type)

        if child_id:
            query = query.eq("child_id", child_id)
        elif session_type == "parent":
            query = query.eq("user_id", user["id"])

        result = query.order("last_interaction_at", desc=True).limit(20).execute()

        return result.data or []

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_coach_sessions")
        raise HTTPException(status_code=500, detail=f"Error getting sessions: {str(e)}")


@router.get("/sessions/{session_id}", response_model=CoachSessionOut)
async def get_coach_session(
    session_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get a specific coach session"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        result = supabase.table("ai_coach_sessions").select("*").eq("id", session_id).eq("family_id", family_id).single().execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Session not found")

        return result.data

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_coach_session")
        raise HTTPException(status_code=500, detail=f"Error getting session: {str(e)}")


@router.get("/recommendations")
async def get_coach_recommendations(
    session_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="Filter by status: pending, accepted, dismissed, completed"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Get coach recommendations"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        query = supabase.table("ai_coach_recommendations").select("*, ai_coach_sessions!inner(family_id)")

        if session_id:
            query = query.eq("session_id", session_id)

        if status:
            query = query.eq("status", status)

        result = query.order("priority", desc=True).order("created_at", desc=True).execute()

        return result.data or []

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_coach_recommendations")
        raise HTTPException(status_code=500, detail=f"Error getting recommendations: {str(e)}")


@router.post("/recommendations/{recommendation_id}/accept")
async def accept_recommendation(
    recommendation_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Accept a coach recommendation"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify recommendation belongs to family
        rec_result = supabase.table("ai_coach_recommendations").select("*, ai_coach_sessions!inner(family_id)").eq("id", recommendation_id).single().execute()
        if not rec_result.data:
            raise HTTPException(status_code=404, detail="Recommendation not found")

        # Update status
        result = supabase.table("ai_coach_recommendations").update({
            "status": "accepted",
            "accepted_at": datetime.now().isoformat(),
        }).eq("id", recommendation_id).execute()

        log_event("ai.coach.recommendation.accepted", user_id=user["id"], recommendation_id=recommendation_id)

        return {"success": True, "recommendation": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="ai_coach_accept_recommendation")
        raise HTTPException(status_code=500, detail=f"Error accepting recommendation: {str(e)}")

