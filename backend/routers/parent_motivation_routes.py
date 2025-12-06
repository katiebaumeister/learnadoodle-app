"""
FastAPI routes for parent motivation features
Part of Student Mode & Compliance Features
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
import sys
from pathlib import Path
from functools import lru_cache
import hashlib
import json

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user
from logger import log_event
from supabase_client import get_admin_client
from cache import get_cached, set_cached

# Import LLM function
try:
    from llm_weekly_narrative import llm_generate_weekly_narrative
    LLM_AVAILABLE = True
except ImportError:
    try:
        # Fallback: try importing from llm.py if function was added there
        from llm import llm_generate_weekly_narrative
        LLM_AVAILABLE = True
    except ImportError:
        LLM_AVAILABLE = False
        log_event("parent.learning_story.llm_unavailable", message="LLM module not available")

router = APIRouter(prefix="/api/parent", tags=["parent"])


# ============================================================
# Request/Response Models
# ============================================================

class LearningStoryOut(BaseModel):
    week_start: date
    week_end: date
    children_summary: List[Dict[str, Any]]
    insights: List[str]
    suggestions: List[Dict[str, Any]]
    wins: List[Dict[str, Any]]
    # LLM-generated narratives
    family_summary: Optional[str] = None
    per_child_summaries: Optional[List[Dict[str, str]]] = None
    narrative_tone: Optional[str] = None


class ParentWinOut(BaseModel):
    type: str  # 'resource_reuse', 'time_saved', 'planning_efficiency', etc.
    description: str
    metric: Optional[str] = None
    value: Optional[float] = None
    week_start: date


# ============================================================
# Routes
# ============================================================

@router.get("/learning_story", response_model=LearningStoryOut)
async def get_learning_story(
    week_start: Optional[str] = Query(None, description="Week start date in YYYY-MM-DD format (defaults to current week)"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Generate weekly Learning Story with progress insights, suggestions, and wins.
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
        
        # Get family name
        try:
            family_res = supabase.table("family").select("name").eq("id", family_id).single().execute()
            family_name = family_res.data.get("name", "your family") if family_res.data else "your family"
        except Exception:
            family_name = "your family"
        
        # Get children
        children_res = supabase.table("children").select("id, first_name, grade").eq("family_id", family_id).eq("archived", False).execute()
        children = children_res.data or []
        
        children_summary = []
        insights = []
        suggestions = []
        wins = []
        
        # Prepare data for LLM narrative generation
        llm_children_data = []
        
        for child in children:
            child_id = child["id"]
            child_name = child.get("first_name", "Student")
            
            # Get events for the week
            # Convert dates to ISO format strings for Supabase
            week_start_str = week_start_date.isoformat()
            week_end_str = (week_end_date + timedelta(days=1)).isoformat()
            
            try:
                events_res = supabase.table("events").select(
                    "id, title, status, subject_id, start_ts"
                ).eq("child_id", child_id).gte("start_ts", week_start_str).lt("start_ts", week_end_str).execute()
                events = events_res.data or []
            except Exception as events_error:
                log_event("parent.learning_story.events_error", user_id=user["id"], child_id=child_id, error=str(events_error))
                events = []
            
            completed = [e for e in events if e.get("status") == "done"]
            total = len(events)
            
            # Analyze subjects from this week's events
            subject_events = {}
            # Cache subject names to avoid repeated queries
            subject_cache = {}
            
            for event in events:
                subject_id = event.get("subject_id")
                if subject_id:
                    # Get subject name from cache or query
                    if subject_id not in subject_cache:
                        try:
                            subject_res = supabase.table("subject").select("name").eq("id", subject_id).limit(1).execute()
                            if subject_res.data and len(subject_res.data) > 0:
                                subject_cache[subject_id] = subject_res.data[0].get("name")
                            else:
                                subject_cache[subject_id] = None
                        except:
                            subject_cache[subject_id] = None
                    
                    subject_name = subject_cache[subject_id]
                    if subject_name:
                        if subject_name not in subject_events:
                            subject_events[subject_name] = {"total": 0, "completed": 0}
                        subject_events[subject_name]["total"] += 1
                        if event.get("status") == "done":
                            subject_events[subject_name]["completed"] += 1
            
            # Get progress data (handle if view doesn't exist or has no data)
            progress_data = []
            try:
                progress_res = supabase.table("child_progress").select("*").eq("child_id", child_id).execute()
                progress_data = progress_res.data or []
            except Exception as progress_error:
                # If child_progress view doesn't exist or has issues, continue with empty data
                log_event("parent.learning_story.progress_error", user_id=user["id"], child_id=child_id, error=str(progress_error))
                progress_data = []
            
            # Get behavior tags from outcomes for this week
            behavior_data = {}
            try:
                outcomes_res = supabase.table("event_outcomes").select(
                    "behavior_tags, rating"
                ).eq("child_id", child_id).gte("created_at", week_start_str).lt("created_at", week_end_str).execute()
                outcomes = outcomes_res.data or []
                
                # Aggregate behavior tags
                behavior_counts = {"Focused": 0, "Distracted": 0, "Excited": 0, "Overwhelmed": 0}
                behavior_ratings = {"Focused": [], "Distracted": [], "Excited": [], "Overwhelmed": []}
                
                for outcome in outcomes:
                    tags = outcome.get("behavior_tags") or []
                    rating = outcome.get("rating")
                    for tag in tags:
                        if tag in behavior_counts:
                            behavior_counts[tag] += 1
                            if rating:
                                behavior_ratings[tag].append(rating)
                
                # Calculate percentages and average ratings
                total_tagged = sum(behavior_counts.values())
                if total_tagged > 0:
                    behavior_data = {
                        "focused_pct": round((behavior_counts["Focused"] / total_tagged) * 100, 1),
                        "distracted_pct": round((behavior_counts["Distracted"] / total_tagged) * 100, 1),
                        "excited_pct": round((behavior_counts["Excited"] / total_tagged) * 100, 1),
                        "overwhelmed_pct": round((behavior_counts["Overwhelmed"] / total_tagged) * 100, 1),
                        "focused_avg_rating": round(sum(behavior_ratings["Focused"]) / len(behavior_ratings["Focused"]), 1) if behavior_ratings["Focused"] else None,
                        "distracted_avg_rating": round(sum(behavior_ratings["Distracted"]) / len(behavior_ratings["Distracted"]), 1) if behavior_ratings["Distracted"] else None,
                    }
            except Exception as behavior_error:
                log_event("parent.learning_story.behavior_error", user_id=user["id"], child_id=child_id, error=str(behavior_error))
                behavior_data = {}
            
            # Aggregate progress
            total_completed = sum(p.get("completed_events", 0) or 0 for p in progress_data)
            total_events = sum(p.get("total_events", 0) or 0 for p in progress_data)
            avg_rating = None
            ratings = [p.get("avg_rating") for p in progress_data if p.get("avg_rating")]
            if ratings:
                avg_rating = sum(ratings) / len(ratings)
            
            # Use this week's subject data if available, otherwise fall back to progress view
            if subject_events:
                subject_progress = subject_events
            else:
                # Fallback to progress view data
                subject_progress = {}
                for p in progress_data:
                    subj_name = p.get("subject_name")
                    if subj_name:
                        subject_progress[subj_name] = {
                            "completed": p.get("completed_events", 0) or 0,
                            "total": p.get("total_events", 0) or 0,
                        }
            
            # Find best and slowest subjects
            best_subject = None
            slowest_subject = None
            if subject_progress:
                try:
                    # Filter out subjects with no events
                    active_subjects = {k: v for k, v in subject_progress.items() if v["total"] > 0}
                    if active_subjects:
                        best_subject = max(active_subjects.items(), key=lambda x: x[1]["completed"] / max(x[1]["total"], 1))
                        slowest_subject = min(active_subjects.items(), key=lambda x: x[1]["completed"] / max(x[1]["total"], 1))
                except (ValueError, ZeroDivisionError):
                    # Handle empty dict or division errors
                    pass
            
            children_summary.append({
                "child_id": child_id,
                "child_name": child_name,
                "completed_this_week": len(completed),
                "total_this_week": total,
                "completion_rate": len(completed) / max(total, 1) if total > 0 else 0.0,
                "avg_rating": round(avg_rating, 1) if avg_rating else None,
                "best_subject": best_subject[0] if best_subject else None,
                "slowest_subject": slowest_subject[0] if slowest_subject else None,
            })
            
            # Prepare LLM data for this child
            child_grade = child.get("grade")
            
            # Calculate hours (estimate based on events)
            estimated_hours = len(completed) * 0.5  # Rough estimate: 30 min per event
            
            # Get streak data (simplified - could use actual streak calculation)
            streak_days = 0
            try:
                # Try to get streak from recent completions
                recent_completions = [e for e in completed if e.get("start_ts")]
                if recent_completions:
                    # Simple streak: consecutive days with completions
                    completion_dates = sorted(set([
                        datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00")).date()
                        for e in recent_completions
                    ]))
                    # Count consecutive days from today backwards
                    today = date.today()
                    streak_days = 0
                    check_date = today
                    while check_date in completion_dates:
                        streak_days += 1
                        check_date -= timedelta(days=1)
            except Exception:
                pass
            
            # Build subject trends
            subject_trends = {}
            if subject_progress:
                for subj_name, subj_data in subject_progress.items():
                    completed_count = subj_data.get("completed", 0)
                    total_count = subj_data.get("total", 0)
                    completion_rate = completed_count / max(total_count, 1)
                    
                    # Determine trend (simplified - could compare to previous week)
                    if completion_rate >= 0.8:
                        trend = "up"
                    elif completion_rate < 0.5:
                        trend = "down"
                    else:
                        trend = "steady"
                    
                    subject_trends[subj_name] = {
                        "completed": completed_count,
                        "total": total_count,
                        "trend": trend
                    }
            
            # Collect wins and flags
            child_wins = []
            child_flags = []
            
            if best_subject and best_subject[1].get("completed", 0) > 0:
                child_wins.append(f"Strong progress in {best_subject[0]}")
            
            if len(completed) >= total * 0.8 and total > 0:
                child_wins.append(f"Completed {len(completed)} out of {total} activities")
            
            if slowest_subject and slowest_subject[1].get("completed", 0) < slowest_subject[1].get("total", 0):
                child_flags.append(f"{slowest_subject[0]} had fewer completions this week")
            
            llm_children_data.append({
                "name": child_name,
                "grade": child_grade,
                "hours": estimated_hours,
                "events_completed": len(completed),
                "streak_days": streak_days,
                "subjects": subject_trends,
                "wins": child_wins,
                "flags": child_flags,
                "behavior": behavior_data
            })
            
            # Generate insights
            if len(completed) > 0:
                insights.append(f"{child_name} completed {len(completed)} activities this week")
            elif total > 0:
                insights.append(f"{child_name} has {total} activities scheduled this week")
            
            if best_subject and best_subject[1].get("completed", 0) > 0:
                insights.append(f"{child_name} made the most progress in {best_subject[0]}")
            
            if slowest_subject and slowest_subject[1].get("total", 0) > 0 and slowest_subject[1].get("completed", 0) < slowest_subject[1].get("total", 0):
                insights.append(f"{child_name}'s {slowest_subject[0]} work slowed down this week")
            
            # Generate suggestions
            if slowest_subject and slowest_subject[1].get("total", 0) > 0:
                suggestions.append({
                    "type": "timing",
                    "child_id": child_id,
                    "child_name": child_name,
                    "subject": slowest_subject[0],
                    "suggestion": f"Try scheduling {slowest_subject[0]} earlier in the day - completion rates are higher before 11am",
                })
            
            # Add general encouragement if no specific insights
            if total == 0 and len(insights) == 0:
                insights.append(f"{child_name} is ready for a new week of learning!")
        
        # Calculate parent wins
        # Resource reuse tracking
        week_start_iso = week_start_date.isoformat()
        week_end_iso = (week_end_date + timedelta(days=1)).isoformat()
        
        try:
            uploads_res = supabase.table("uploads").select("id, created_at").eq("family_id", family_id).gte("created_at", week_start_iso).lt("created_at", week_end_iso).execute()
            uploads_this_week = len(uploads_res.data or [])
        except Exception:
            uploads_this_week = 0
        
        # Events with materials attachment (resource reuse)
        try:
            events_with_materials_res = supabase.table("events").select("id").eq("family_id", family_id).gte("start_ts", week_start_iso).lt("start_ts", week_end_iso).not_("materials_attachment_ids", "is", None).execute()
            reused_resources = len(events_with_materials_res.data or [])
        except Exception:
            reused_resources = 0
        
        if reused_resources > 0:
            wins.append({
                "type": "resource_reuse",
                "description": f"You reused {reused_resources} resources this week",
                "metric": "resources_reused",
                "value": reused_resources,
            })
        
        # Planning efficiency (events created vs completed)
        try:
            events_created_res = supabase.table("events").select("id").eq("family_id", family_id).gte("created_at", week_start_iso).lt("created_at", week_end_iso).execute()
            events_created = len(events_created_res.data or [])
        except Exception:
            events_created = 0
        
        if events_created > 10:
            wins.append({
                "type": "planning_efficiency",
                "description": f"You planned {events_created} activities this week",
                "metric": "activities_planned",
                "value": events_created,
            })
        
        # Prepare parent wins for LLM
        parent_wins_list = [w.get("description", "") for w in wins]
        
        # Generate LLM narratives with caching
        # Cache key: family_id + week_start + hash of children data
        family_summary = None
        per_child_summaries = None
        narrative_tone = None
        
        if LLM_AVAILABLE and llm_children_data:
            # Create cache key based on family, week, and data hash
            children_hash = hashlib.md5(json.dumps(llm_children_data, sort_keys=True).encode()).hexdigest()[:16]
            cache_key = f"learning_story:{family_id}:{week_start_date.isoformat()}:{children_hash}"
            
            # Check in-memory cache first (fast, but lost on restart)
            cached_narrative = get_cached(cache_key)
            if cached_narrative:
                family_summary = cached_narrative.get("family_summary")
                per_child_summaries = cached_narrative.get("per_child_summaries", [])
                narrative_tone = cached_narrative.get("tone", "supportive")
                log_event("parent.learning_story.memory_cache_hit", user_id=user["id"], week_start=week_start_date.isoformat())
            else:
                # Check database cache (persistent across restarts)
                try:
                    cache_res = supabase.table("learning_story_cache").select("*").eq("family_id", family_id).eq("week_start", week_start_date.isoformat()).eq("data_hash", children_hash).maybe_single().execute()
                    
                    if cache_res.data:
                        cached_narrative = cache_res.data.get("narrative_data")
                        if cached_narrative:
                            family_summary = cached_narrative.get("family_summary")
                            per_child_summaries = cached_narrative.get("per_child_summaries", [])
                            narrative_tone = cached_narrative.get("tone", "supportive")
                            # Also store in memory cache for faster access
                            set_cached(cache_key, cached_narrative, ttl_seconds=3600)  # 1 hour
                            log_event("parent.learning_story.db_cache_hit", user_id=user["id"], week_start=week_start_date.isoformat())
                except Exception as cache_error:
                    # Cache check failed, continue to generate (non-critical, suppress log)
                    # log_event("parent.learning_story.cache_check_error", user_id=user["id"], error=str(cache_error)[:100], level="debug")
                    pass
            
            # If no cached data, generate with LLM
            if family_summary is None:
                try:
                    # Add support profiles to LLM context
                    children_with_profiles = []
                    for child_data in llm_children_data:
                        child_with_profile = child_data.copy()
                        child_id = None
                        # Find child_id from children_summary
                        for cs in children_summary:
                            if cs.get("child_name") == child_data.get("name"):
                                # We need to get child_id from the original children list
                                for child in children:
                                    if child.get("first_name") == child_data.get("name"):
                                        child_id = child.get("id")
                                        break
                                break
                        
                        # Fetch support profile if we have child_id
                        if child_id:
                            try:
                                profile_res = supabase.table("child_support_profiles").select("*").eq("child_id", child_id).maybe_single().execute()
                                if profile_res.data:
                                    child_with_profile["support_profile"] = {
                                        "diagnoses": profile_res.data.get("diagnoses", []),
                                        "learning_modalities": profile_res.data.get("learning_modalities", []),
                                        "support_needs": profile_res.data.get("support_needs", []),
                                        "executive_function": profile_res.data.get("executive_function", [])
                                    }
                            except Exception:
                                pass  # Support profile is optional
                        
                        children_with_profiles.append(child_with_profile)
                    
                    # Calculate parent performance metrics
                    total_events_planned = events_created
                    # Count completed events for the week
                    total_events_completed = 0
                    for child in children:
                        try:
                            child_events_res = supabase.table("events").select("id, status").eq("child_id", child["id"]).gte("start_ts", week_start_str).lt("start_ts", week_end_str).execute()
                            completed_count = len([e for e in (child_events_res.data or []) if e.get("status") == "done"])
                            total_events_completed += completed_count
                        except Exception:
                            pass
                    planning_consistency = len([c for c in children_summary if c.get("completion_rate", 0) > 0.7])
                    
                    parent_performance = {
                        "events_planned": total_events_planned,
                        "events_completed": total_events_completed,
                        "completion_rate": total_events_completed / max(total_events_planned, 1) if total_events_planned > 0 else 0,
                        "children_with_good_completion": planning_consistency,
                        "resource_reuse": reused_resources,
                        "wins": parent_wins_list
                    }
                    
                    llm_context = {
                        "week_start": week_start_date.isoformat(),
                        "week_end": week_end_date.isoformat(),
                        "family_name": family_name,
                        "children": children_with_profiles,
                        "parent_wins": parent_wins_list,
                        "parent_performance": parent_performance
                    }
                    
                    llm_result = await llm_generate_weekly_narrative(llm_context)
                    family_summary = llm_result.get("family_summary")
                    per_child_summaries = llm_result.get("per_child_summaries", [])
                    narrative_tone = llm_result.get("tone", "supportive")
                    
                    # Cache the result in both memory and database
                    narrative_data = {
                        "family_summary": family_summary,
                        "per_child_summaries": per_child_summaries,
                        "tone": narrative_tone
                    }
                    
                    # Store in memory cache (1 hour TTL)
                    set_cached(cache_key, narrative_data, ttl_seconds=3600)
                    
                    # Store in database cache (persistent, auto-cleanup after 8 weeks)
                    try:
                        supabase.table("learning_story_cache").upsert({
                            "family_id": family_id,
                            "week_start": week_start_date.isoformat(),
                            "data_hash": children_hash,
                            "narrative_data": narrative_data,
                            "created_at": datetime.now().isoformat()
                        }).execute()
                        log_event("parent.learning_story.cached", user_id=user["id"], week_start=week_start_date.isoformat())
                    except Exception as cache_save_error:
                        # Cache save failed, but that's okay - we still have the narrative (non-critical, suppress log)
                        # log_event("parent.learning_story.cache_save_error", user_id=user["id"], error=str(cache_save_error)[:100], level="debug")
                        pass
                    
                    log_event("parent.learning_story.llm_success", user_id=user["id"], week_start=week_start_date.isoformat())
                except Exception as llm_error:
                    # Fallback: continue without LLM narratives
                    log_event("parent.learning_story.llm_error", user_id=user["id"], error=str(llm_error))
                    # Keep narratives as None - frontend will show rule-based insights instead
        
        log_event("parent.learning_story.generated", user_id=user["id"], week_start=week_start_date.isoformat())
        
        return LearningStoryOut(
            week_start=week_start_date,
            week_end=week_end_date,
            children_summary=children_summary,
            insights=insights,
            suggestions=suggestions,
            wins=wins,
            family_summary=family_summary,
            per_child_summaries=per_child_summaries,
            narrative_tone=narrative_tone,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        log_event("parent.learning_story.error", user_id=user["id"], error=str(e), traceback=error_trace)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate learning story: {str(e)}"
        )


@router.get("/wins", response_model=List[ParentWinOut])
async def get_parent_wins(
    weeks: int = Query(4, description="Number of weeks to look back"),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get parent wins over the past N weeks.
    """
    try:
        supabase = get_admin_client()
        
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
        
        # Calculate date range
        end_date = date.today()
        start_date = end_date - timedelta(weeks=weeks)
        
        wins = []
        
        # Resource reuse wins
        events_with_materials_res = supabase.table("events").select("id, created_at").eq("family_id", family_id).gte("created_at", start_date.isoformat()).lt("created_at", (end_date + timedelta(days=1)).isoformat()).not_("materials_attachment_ids", "is", None).execute()
        
        # Group by week
        weekly_reuse = {}
        for event in (events_with_materials_res.data or []):
            event_date = datetime.fromisoformat(event["created_at"].replace("Z", "+00:00")).date()
            week_start = event_date - timedelta(days=event_date.weekday())
            weekly_reuse[week_start] = weekly_reuse.get(week_start, 0) + 1
        
        for week_start, count in weekly_reuse.items():
            if count >= 3:
                wins.append(ParentWinOut(
                    type="resource_reuse",
                    description=f"You reused {count} resources",
                    metric="resources_reused",
                    value=count,
                    week_start=week_start,
                ))
        
        return wins
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("parent.wins.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get wins: {str(e)}"
        )

