"""
Inspire Learning action routes

These endpoints power the post-approval actions in the Inspire Learning UI:
- Add to schedule
- Add to todo list
- Save to ideas
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from pathlib import Path
import sys

# Ensure backend directory is on path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
  sys.path.insert(0, str(backend_dir))

from auth import get_current_user
from helpers import get_family_id_for_user, child_belongs_to_family, require_onboarding_complete
from logger import log_event

try:
  from supabase_client import get_admin_client
except ImportError:
  import importlib.util

  spec = importlib.util.spec_from_file_location("supabase_client", backend_dir / "supabase_client.py")
  supabase_client = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(supabase_client)
  get_admin_client = supabase_client.get_admin_client


router = APIRouter(prefix="/api/inspire", tags=["inspire"])


class SuggestionActionBody(BaseModel):
  suggestion_id: str = Field(..., description="learning_suggestions.id to act on")


def _get_suggestion_for_child(
  supabase,
  suggestion_id: str,
  child_id: str,
  family_id: str,
) -> Dict[str, Any]:
  """Fetch a learning_suggestions row and ensure it belongs to the family/child."""
  res = (
    supabase.table("learning_suggestions")
    .select("*")
    .eq("id", suggestion_id)
    .single()
    .execute()
  )

  suggestion = res.data
  if not suggestion:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Suggestion not found",
    )

  if str(suggestion.get("child_id")) != str(child_id):
    raise HTTPException(
      status_code=status.HTTP_403_FORBIDDEN,
      detail="Suggestion does not belong to this child",
    )

  if str(suggestion.get("family_id")) != str(family_id):
    raise HTTPException(
      status_code=status.HTTP_403_FORBIDDEN,
      detail="Suggestion does not belong to this family",
    )

  return suggestion


@router.post("/{child_id}/schedule_from_suggestion")
async def schedule_from_suggestion(
  child_id: str,
  body: SuggestionActionBody,
  user: dict = Depends(get_current_user),
):
  """
  Create a scheduled event from a learning suggestion.

  For now this creates a single event in the next available window (simple heuristic):
  - Start: now + 1 day
  - Duration: suggestion.duration_min or 30 minutes
  """
  family_id = get_family_id_for_user(user["id"])
  if not family_id:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Family not found",
    )
  require_onboarding_complete(family_id)
  if not child_belongs_to_family(child_id, family_id):
    raise HTTPException(
      status_code=status.HTTP_403_FORBIDDEN,
      detail="Child not in family",
    )

  supabase = get_admin_client()

  suggestion = _get_suggestion_for_child(supabase, body.suggestion_id, child_id, family_id)

  # Basic scheduling heuristic: tomorrow at the current time, with reasonable duration
  now = datetime.utcnow()
  start_ts = now + timedelta(days=1)
  duration_min = suggestion.get("duration_min") or 30
  try:
    duration_min = int(duration_min)
  except (TypeError, ValueError):
    duration_min = 30
  end_ts = start_ts + timedelta(minutes=duration_min)

  event_data: Dict[str, Any] = {
    "family_id": family_id,
    "child_id": child_id,
    "title": suggestion.get("title") or "Learning activity",
    "description": suggestion.get("description") or suggestion.get("source") or "",
    "start_ts": start_ts.isoformat() + "Z",
    "end_ts": end_ts.isoformat() + "Z",
    "status": "scheduled",
    "source": "inspire_learning",
  }

  try:
    insert_res = supabase.table("events").insert(event_data).execute()
    if not insert_res.data:
      raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to create event from suggestion",
      )

    event_id = insert_res.data[0]["id"]

    log_event(
      "inspire.schedule_from_suggestion",
      user_id=user["id"],
      child_id=child_id,
      family_id=str(family_id),
      suggestion_id=body.suggestion_id,
      event_id=event_id,
    )

    return {"ok": True, "event_id": event_id}
  except HTTPException:
    raise
  except Exception as e:
    log_event(
      "inspire.schedule_from_suggestion.error",
      user_id=user["id"],
      child_id=child_id,
      family_id=str(family_id),
      suggestion_id=body.suggestion_id,
      error=str(e),
    )
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail=f"Error creating event from suggestion: {e}",
    )


@router.post("/{child_id}/todo_from_suggestion")
async def todo_from_suggestion(
  child_id: str,
  body: SuggestionActionBody,
  user: dict = Depends(get_current_user),
):
  """
  Create a short-duration 'todo' style event from a learning suggestion.

  Implementation:
  - Creates a 20-minute event today (or tomorrow if today has passed) with metadata.kind='todo'
  - This keeps todos represented as events while still feeling like a checklist item.
  """
  family_id = get_family_id_for_user(user["id"])
  if not family_id:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Family not found",
    )
  require_onboarding_complete(family_id)
  if not child_belongs_to_family(child_id, family_id):
    raise HTTPException(
      status_code=status.HTTP_403_FORBIDDEN,
      detail="Child not in family",
    )

  supabase = get_admin_client()
  suggestion = _get_suggestion_for_child(supabase, body.suggestion_id, child_id, family_id)

  now = datetime.utcnow()
  # Use "today" as a simple anchor; if late in the day this will still be a future timestamp
  start_ts = now
  end_ts = start_ts + timedelta(minutes=20)

  event_data: Dict[str, Any] = {
    "family_id": family_id,
    "child_id": child_id,
    "title": suggestion.get("title") or "Learning todo",
    "description": suggestion.get("description") or suggestion.get("source") or "",
    "start_ts": start_ts.isoformat() + "Z",
    "end_ts": end_ts.isoformat() + "Z",
    "status": "scheduled",
    "source": "inspire_learning_todo",
    # If events.metadata exists this will be stored; if not, it's harmless extra data
    "metadata": {
      "kind": "todo",
      "inspire_suggestion_id": body.suggestion_id,
    },
  }

  try:
    insert_res = supabase.table("events").insert(event_data).execute()
    if not insert_res.data:
      raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to create todo from suggestion",
      )

    event_id = insert_res.data[0]["id"]

    log_event(
      "inspire.todo_from_suggestion",
      user_id=user["id"],
      child_id=child_id,
      family_id=str(family_id),
      suggestion_id=body.suggestion_id,
      event_id=event_id,
    )

    return {"ok": True, "event_id": event_id}
  except HTTPException:
    raise
  except Exception as e:
    log_event(
      "inspire.todo_from_suggestion.error",
      user_id=user["id"],
      child_id=child_id,
      family_id=str(family_id),
      suggestion_id=body.suggestion_id,
      error=str(e),
    )
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail=f"Error creating todo from suggestion: {e}",
    )


@router.post("/{child_id}/save_idea_from_suggestion")
async def save_idea_from_suggestion(
  child_id: str,
  body: SuggestionActionBody,
  user: dict = Depends(get_current_user),
):
  """
  Mark a suggestion as saved to the parent's ideas list.

  This updates a simple boolean flag on learning_suggestions so we can later
  query 'ideas' separately from general approved suggestions.
  """
  family_id = get_family_id_for_user(user["id"])
  if not family_id:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Family not found",
    )

  if not child_belongs_to_family(child_id, family_id):
    raise HTTPException(
      status_code=status.HTTP_403_FORBIDDEN,
      detail="Child not in family",
    )

  supabase = get_admin_client()
  # Ensure suggestion belongs to this family/child
  _ = _get_suggestion_for_child(supabase, body.suggestion_id, child_id, family_id)

  try:
    update_res = (
      supabase.table("learning_suggestions")
      .update({"saved_to_ideas": True})
      .eq("id", body.suggestion_id)
      .execute()
    )

    if not update_res.data:
      raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to save suggestion to ideas list",
      )

    log_event(
      "inspire.save_idea_from_suggestion",
      user_id=user["id"],
      child_id=child_id,
      family_id=str(family_id),
      suggestion_id=body.suggestion_id,
    )

    return {"ok": True}
  except HTTPException:
    raise
  except Exception as e:
    log_event(
      "inspire.save_idea_from_suggestion.error",
      user_id=user["id"],
      child_id=child_id,
      family_id=str(family_id),
      suggestion_id=body.suggestion_id,
      error=str(e),
    )
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail=f"Error saving suggestion to ideas list: {e}",
    )


