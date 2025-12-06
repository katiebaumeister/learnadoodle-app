"""
FastAPI routes for Notes
Handles learning notes, observations, and reflections
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
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

router = APIRouter(prefix="/api/records/notes", tags=["notes"])


class CreateNoteInput(BaseModel):
    family_id: str = Field(..., description="Family ID")
    child_id: Optional[str] = Field(None, description="Child ID (optional - null for family-level notes)")
    text: str = Field(..., description="Note content")
    type: Optional[str] = Field("log", description="Note type: log, observation, reflection, milestone, concern, celebration")
    subject_id: Optional[str] = Field(None, description="Subject ID (optional)")
    tags: Optional[List[str]] = Field(None, description="Tags array")
    linked_evidence_id: Optional[str] = Field(None, description="Linked evidence/upload ID")
    linked_event_id: Optional[str] = Field(None, description="Linked event ID")


class NoteOut(BaseModel):
    id: str
    family_id: str
    child_id: Optional[str] = None
    subject_id: Optional[str]
    text: str
    type: str
    tags: List[str]
    linked_evidence_id: Optional[str]
    linked_event_id: Optional[str]
    created_at: str
    updated_at: str
    created_by: Optional[str]


class UpdateNoteInput(BaseModel):
    text: Optional[str] = None
    type: Optional[str] = None
    subject_id: Optional[str] = None
    tags: Optional[List[str]] = None
    linked_evidence_id: Optional[str] = None
    linked_event_id: Optional[str] = None


@router.post("", response_model=NoteOut)
async def create_note(
    input: CreateNoteInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Create a new note"""
    try:
        # Verify user has access to this family
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != input.family_id:
            raise HTTPException(status_code=403, detail="Access denied to this family")

        supabase = get_admin_client()

        # Verify child belongs to family (only if child_id is provided)
        if input.child_id and not child_belongs_to_family(input.child_id, input.family_id):
            raise HTTPException(status_code=404, detail="Child not found")

        # Validate note type
        valid_types = ["log", "observation", "reflection", "milestone", "concern", "celebration"]
        if input.type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid note type. Must be one of: {', '.join(valid_types)}")

        # Insert note
        note_data = {
            "family_id": input.family_id,
            "child_id": input.child_id,
            "text": input.text,
            "type": input.type,
            "subject_id": input.subject_id,
            "tags": input.tags or [],
            "linked_evidence_id": input.linked_evidence_id,
            "linked_event_id": input.linked_event_id,
            "created_by": user["id"]
        }

        result = supabase.table("notes").insert(note_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create note")

        log_event("note_created", {
            "note_id": result.data[0]["id"],
            "child_id": input.child_id,
            "family_id": input.family_id,
            "type": input.type
        })

        return NoteOut(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="create_note")
        raise HTTPException(status_code=500, detail=f"Error creating note: {str(e)}")


@router.get("", response_model=List[NoteOut])
async def get_notes(
    family_id: str = Query(..., description="Family ID"),
    child_ids: Optional[List[str]] = Query(None, description="Child IDs to filter by"),
    start: Optional[str] = Query(None, description="Start date (ISO format)"),
    end: Optional[str] = Query(None, description="End date (ISO format)"),
    subject: Optional[str] = Query(None, description="Subject ID filter"),
    type: Optional[str] = Query(None, description="Note type filter"),
    tag: Optional[str] = Query(None, description="Tag filter"),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get notes for a family with optional filters"""
    try:
        # Verify user has access to this family
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != family_id:
            raise HTTPException(status_code=403, detail="Access denied to this family")

        supabase = get_admin_client()

        # Build query
        query = supabase.table("notes").select("*").eq("family_id", family_id)

        if child_ids and len(child_ids) > 0:
            query = query.in_("child_id", child_ids)

        if start:
            query = query.gte("created_at", start)

        if end:
            query = query.lte("created_at", end)

        if subject:
            query = query.eq("subject_id", subject)

        if type:
            query = query.eq("type", type)

        result = query.order("created_at", desc=True).execute()

        notes = result.data or []

        # Filter by tag in memory (since tags is JSONB array)
        if tag:
            notes = [
                note for note in notes
                if note.get("tags") and tag.lower() in [t.lower() for t in note.get("tags", [])]
            ]

        return [NoteOut(**note) for note in notes]

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="get_notes")
        raise HTTPException(status_code=500, detail=f"Error fetching notes: {str(e)}")


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: str,
    input: UpdateNoteInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Update a note"""
    try:
        supabase = get_admin_client()

        # Verify note exists and user has access
        note_check = supabase.table("notes").select("id, family_id").eq("id", note_id).single().execute()
        if not note_check.data:
            raise HTTPException(status_code=404, detail="Note not found")

        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or note_check.data.get("family_id") != user_family_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Build update payload
        update_data = {}
        if input.text is not None:
            update_data["text"] = input.text
        if input.type is not None:
            update_data["type"] = input.type
        if input.subject_id is not None:
            update_data["subject_id"] = input.subject_id
        if input.tags is not None:
            update_data["tags"] = input.tags
        if input.linked_evidence_id is not None:
            update_data["linked_evidence_id"] = input.linked_evidence_id
        if input.linked_event_id is not None:
            update_data["linked_event_id"] = input.linked_event_id

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = supabase.table("notes").update(update_data).eq("id", note_id).select().single().execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update note")

        log_event("note_updated", {
            "note_id": note_id,
            "family_id": user_family_id
        })

        return NoteOut(**result.data)

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="update_note")
        raise HTTPException(status_code=500, detail=f"Error updating note: {str(e)}")


@router.delete("/{note_id}")
async def delete_note(
    note_id: str,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Delete a note"""
    try:
        supabase = get_admin_client()

        # Verify note exists and user has access
        note_check = supabase.table("notes").select("id, family_id").eq("id", note_id).single().execute()
        if not note_check.data:
            raise HTTPException(status_code=404, detail="Note not found")

        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or note_check.data.get("family_id") != user_family_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Delete note
        supabase.table("notes").delete().eq("id", note_id).execute()

        log_event("note_deleted", {
            "note_id": note_id,
            "family_id": user_family_id
        })

        return {"success": True, "message": "Note deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="delete_note")
        raise HTTPException(status_code=500, detail=f"Error deleting note: {str(e)}")

