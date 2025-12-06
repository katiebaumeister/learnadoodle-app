"""
FastAPI routes for conversation starters and feedback helpers
Helps parents connect with children through personalized prompts
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

# Import LLM function
try:
    from llm import llm_generate_conversation_starters, llm_write_feedback
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False
    log_event("conversation.llm_unavailable", message="LLM module not available")

router = APIRouter(prefix="/api/conversation", tags=["conversation"])


# ============================================================
# Request/Response Models
# ============================================================

class ConversationStarterOut(BaseModel):
    child_id: str
    child_name: str
    prompt: str
    context: str
    type: str  # 'interest', 'subject', 'personal', 'encouragement'


class FeedbackRequest(BaseModel):
    child_id: str
    context: str = Field(..., description="What feedback is about (e.g., 'math progress', 'science interest', 'completed project')")
    tone: Optional[str] = Field("encouraging", description="Tone: encouraging, celebratory, supportive, gentle")
    situation: Optional[str] = Field(None, description="Specific situation or context")


class FeedbackOut(BaseModel):
    feedback_text: str
    suggestions: List[str]
    tips: List[str]


# ============================================================
# Routes
# ============================================================

@router.get("/starters", response_model=List[ConversationStarterOut])
async def get_conversation_starters(
    child_id: Optional[str] = Query(None, description="Specific child ID (optional, returns for all children if not provided)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get daily conversation starters for parents to connect with children.
    Examples:
    - "Ask Lilly about dinosaurs, she was reading about them in biology yesterday"
    - "Tell Max a story about your childhood in DC, he's learning US history"
    """
    try:
        supabase = get_admin_client()
        
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        # Get children
        query = supabase.table("children").select("id, first_name, grade").eq("family_id", family_id).eq("archived", False)
        if child_id:
            query = query.eq("id", child_id)
        
        children_res = query.execute()
        children = children_res.data or []
        
        if not children:
            return []
        
        starters = []
        today = date.today()
        yesterday = today - timedelta(days=1)
        week_ago = today - timedelta(days=7)
        
        for child in children:
            child_id_val = child["id"]
            child_name = child.get("first_name", "your child")
            child_starters = []  # Collect all starters for this child
            
            # Get recent events (last 7 days) to find what they've been learning
            try:
                events_res = supabase.table("events").select(
                    "id, title, subject_id, start_ts, status"
                ).eq("child_id", child_id_val).gte("start_ts", week_ago.isoformat()).order("start_ts", desc=True).limit(20).execute()
                recent_events = events_res.data or []
            except Exception:
                recent_events = []
            
            # Get subject names
            subject_ids = list(set([e.get("subject_id") for e in recent_events if e.get("subject_id")]))
            subject_map = {}
            if subject_ids:
                try:
                    subjects_res = supabase.table("subject").select("id, name").in_("id", subject_ids).execute()
                    subject_map = {s["id"]: s["name"] for s in (subjects_res.data or [])}
                except Exception:
                    pass
            
            # Get recent outcomes/reflections to find interests
            try:
                outcomes_res = supabase.table("event_outcomes").select(
                    "subject_id, strengths, struggles, rating, created_at"
                ).eq("child_id", child_id_val).gte("created_at", week_ago.isoformat()).order("created_at", desc=True).limit(10).execute()
                recent_outcomes = outcomes_res.data or []
            except Exception:
                recent_outcomes = []
            
            # Get support profile for context
            support_profile = None
            try:
                profile_res = supabase.table("child_support_profiles").select("*").eq("child_id", child_id_val).maybe_single().execute()
                if profile_res.data:
                    support_profile = profile_res.data
            except Exception:
                pass
            
            # Build conversation starters based on recent activity
            
            # 1. Subject-based starters (from recent events)
            subjects_learned = {}
            for event in recent_events:
                subject_id = event.get("subject_id")
                if subject_id and subject_id in subject_map:
                    subject_name = subject_map[subject_id]
                    event_date = datetime.fromisoformat(event["start_ts"].replace("Z", "+00:00")).date()
                    if subject_name not in subjects_learned:
                        subjects_learned[subject_name] = []
                    subjects_learned[subject_name].append({
                        "title": event.get("title", ""),
                        "date": event_date
                    })
            
            # Find subjects from yesterday or recent days
            for subject_name, events_list in subjects_learned.items():
                recent_subject_events = [e for e in events_list if e["date"] >= yesterday]
                if recent_subject_events:
                    event_title = recent_subject_events[0]["title"]
                    if "yesterday" in str(recent_subject_events[0]["date"] - today).lower() or recent_subject_events[0]["date"] == yesterday:
                        time_ref = "yesterday"
                    else:
                        time_ref = "recently"
                    
                    # Generate subject-based starter
                    if "history" in subject_name.lower() or "social studies" in subject_name.lower():
                        child_starters.append(ConversationStarterOut(
                            child_id=child_id_val,
                            child_name=child_name,
                            prompt=f"Tell {child_name} a story about your childhood or experiences related to {subject_name.lower()}. They were learning about {event_title} {time_ref}.",
                            context=f"Learning {subject_name}: {event_title}",
                            type="subject"
                        ))
                    elif "science" in subject_name.lower() or "biology" in subject_name.lower():
                        # Extract topic from event title
                        topic = event_title.lower()
                        if "dinosaur" in topic or "dino" in topic:
                            child_starters.append(ConversationStarterOut(
                                child_id=child_id_val,
                                child_name=child_name,
                                prompt=f"Ask {child_name} about dinosaurs. They were reading about them in {subject_name.lower()} {time_ref}.",
                                context=f"Learning {subject_name}: {event_title}",
                                type="interest"
                            ))
                        else:
                            child_starters.append(ConversationStarterOut(
                                child_id=child_id_val,
                                child_name=child_name,
                                prompt=f"Ask {child_name} about {topic}. They were learning about it in {subject_name.lower()} {time_ref}.",
                                context=f"Learning {subject_name}: {event_title}",
                                type="interest"
                            ))
                    else:
                        child_starters.append(ConversationStarterOut(
                            child_id=child_id_val,
                            child_name=child_name,
                            prompt=f"Ask {child_name} about {event_title}. They were working on it in {subject_name.lower()} {time_ref}.",
                            context=f"Learning {subject_name}: {event_title}",
                            type="subject"
                        ))
            
            # 2. Interest-based starters (from outcomes/strengths)
            if recent_outcomes:
                for outcome in recent_outcomes[:3]:  # Top 3 recent outcomes
                    strengths = outcome.get("strengths", [])
                    if strengths:
                        strength = strengths[0]  # Use first strength
                        child_starters.append(ConversationStarterOut(
                            child_id=child_id_val,
                            child_name=child_name,
                            prompt=f"Ask {child_name} about {strength.lower()}. They showed strength in this area recently.",
                            context=f"Recent strength: {strength}",
                            type="interest"
                        ))
            
            # 3. Encouragement starters (based on completion rates)
            completed_recent = [e for e in recent_events if e.get("status") == "done"]
            if len(completed_recent) >= 3:
                child_starters.append(ConversationStarterOut(
                    child_id=child_id_val,
                    child_name=child_name,
                    prompt=f"Celebrate with {child_name}! They completed {len(completed_recent)} activities this week.",
                    context=f"Completed {len(completed_recent)} activities",
                    type="encouragement"
                ))
            
            # 4. Use LLM to generate more personalized starter if we don't have one yet
            if LLM_AVAILABLE and len(child_starters) == 0:
                try:
                    llm_context = {
                        "child_name": child_name,
                        "child_grade": child.get("grade"),
                        "recent_subjects": list(subjects_learned.keys())[:5],
                        "recent_events": [e.get("title") for e in recent_events[:5]],
                        "support_profile": support_profile,
                        "recent_strengths": [s for o in recent_outcomes for s in (o.get("strengths", []) or [])][:3]
                    }
                    
                    llm_starters = await llm_generate_conversation_starters(llm_context)
                    if llm_starters and len(llm_starters) > 0:
                        # Use the first/best LLM-generated starter
                        starter = llm_starters[0]
                        child_starters.append(ConversationStarterOut(
                            child_id=child_id_val,
                            child_name=child_name,
                            prompt=starter.get("prompt", ""),
                            context=starter.get("context", ""),
                            type=starter.get("type", "personal")
                        ))
                except Exception as llm_error:
                    log_event("conversation.llm_error", child_id=child_id_val, error=str(llm_error))
                    # Continue without LLM starters
            
            # Keep only the best/most relevant starter for this child
            # Prioritize: interest > subject > personal > encouragement
            if child_starters:
                priority_order = {"interest": 0, "subject": 1, "personal": 2, "encouragement": 3}
                child_starters.sort(key=lambda s: priority_order.get(s.type, 99))
                # Keep only the first (highest priority) starter
                starters.append(child_starters[0])
        
        # Return one starter per child
        return starters
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("conversation.starters.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate conversation starters: {str(e)}"
        )


@router.post("/feedback", response_model=FeedbackOut)
async def write_feedback(
    request: FeedbackRequest,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Help parents write encouraging feedback to children.
    Examples:
    - "Help me write encouraging feedback about Sam's math progress"
    - "Suggest a gentle way to encourage interest in science"
    """
    try:
        supabase = get_admin_client()
        
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        # Verify child belongs to family
        child_check = supabase.table("children").select("id, first_name, grade").eq("id", request.child_id).eq("family_id", family_id).single().execute()
        if not child_check.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
        
        child_name = child_check.data.get("first_name", "your child")
        child_grade = child_check.data.get("grade")
        
        # Get recent progress for context
        week_ago = date.today() - timedelta(days=7)
        try:
            events_res = supabase.table("events").select(
                "id, title, subject_id, status, start_ts"
            ).eq("child_id", request.child_id).gte("start_ts", week_ago.isoformat()).execute()
            recent_events = events_res.data or []
        except Exception:
            recent_events = []
        
        # Get support profile
        support_profile = None
        try:
            profile_res = supabase.table("child_support_profiles").select("*").eq("child_id", request.child_id).maybe_single().execute()
            if profile_res.data:
                support_profile = profile_res.data
        except Exception:
            pass
        
        # Use LLM if available, otherwise generate rule-based feedback
        if LLM_AVAILABLE:
            try:
                llm_context = {
                    "child_name": child_name,
                    "child_grade": child_grade,
                    "context": request.context,
                    "tone": request.tone or "encouraging",
                    "situation": request.situation,
                    "recent_events": recent_events[:5],
                    "support_profile": support_profile
                }
                
                result = await llm_write_feedback(llm_context)
                return FeedbackOut(
                    feedback_text=result.get("feedback_text", ""),
                    suggestions=result.get("suggestions", []),
                    tips=result.get("tips", [])
                )
            except Exception as llm_error:
                log_event("conversation.feedback.llm_error", child_id=request.child_id, error=str(llm_error))
                # Fall through to rule-based generation
        
        # Rule-based fallback
        completed = len([e for e in recent_events if e.get("status") == "done"])
        total = len(recent_events)
        
        feedback_text = f"I noticed you've been working hard on {request.context.lower()}. "
        if completed > 0:
            feedback_text += f"You completed {completed} activities this week, which shows great dedication. "
        
        feedback_text += "Keep up the excellent effort!"
        
        suggestions = [
            f"Focus on {child_name}'s effort and process, not just outcomes",
            f"Ask {child_name} what they enjoyed most about {request.context.lower()}",
            f"Celebrate small wins and progress, not just completion"
        ]
        
        tips = [
            "Use specific examples from their work",
            "Frame challenges as learning opportunities",
            "Connect their interests to the subject matter"
        ]
        
        return FeedbackOut(
            feedback_text=feedback_text,
            suggestions=suggestions,
            tips=tips
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("conversation.feedback.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate feedback: {str(e)}"
        )

