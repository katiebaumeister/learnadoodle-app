"""
FastAPI routes for LLM-powered syllabus parsing and plan suggestions
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from routers.util import (
    get_file_text_from_storage,
    load_planning_context,
    persist_ai_plan,
    apply_ai_plan_changes,
    util_save_outline,
    get_admin_client
)
from llm import llm_extract_outline, llm_suggest_plan
from llm_skills import llm_extract_skills
from auth import get_current_user, rate_limiter

router = APIRouter(prefix="/llm", tags=["llm"])


def parse_due_date_hint(due_hint: str, start_date: Optional[str] = None, end_date: Optional[str] = None, week_number: int = 1) -> Optional[str]:
    """
    Parse due date hints like "Week 1", "End of Unit 2", "September 15", etc.
    Returns ISO date string or None.
    """
    if not due_hint:
        return None
    
    due_hint = due_hint.strip().lower()
    
    # Try to parse absolute dates
    date_patterns = [
        r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})',  # MM/DD/YYYY or DD/MM/YYYY
        r'(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})',  # Month Day
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, due_hint, re.IGNORECASE)
        if match:
            try:
                if '/' in due_hint or '-' in due_hint:
                    # Date format
                    parts = re.split(r'[/-]', match.group(0))
                    if len(parts) == 3:
                        month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
                        if year < 100:
                            year += 2000
                        return datetime(year, month, day).isoformat()
                else:
                    # Month name format
                    months = {
                        'january': 1, 'february': 2, 'march': 3, 'april': 4,
                        'may': 5, 'june': 6, 'july': 7, 'august': 8,
                        'september': 9, 'october': 10, 'november': 11, 'december': 12
                    }
                    month_name = match.group(1).lower()
                    day = int(match.group(2))
                    year = datetime.now().year
                    return datetime(year, months[month_name], day).isoformat()
            except:
                pass
    
    # Try to parse relative dates if start_date is provided
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
            
            # Week patterns
            week_match = re.search(r'week\s+(\d+)', due_hint)
            if week_match:
                week_num = int(week_match.group(1))
                # Assume week starts on Monday
                days_to_add = (week_num - 1) * 7
                # Default to Friday of that week
                due_dt = start_dt + timedelta(days=days_to_add + 4)
                return due_dt.isoformat()
            
            # "End of unit" patterns
            if 'end' in due_hint or 'finish' in due_hint:
                # Use week_number as estimate
                days_to_add = (week_number - 1) * 7 + 6  # End of week
                if end_date:
                    end_dt = datetime.fromisoformat(end_date)
                    # Use a percentage through the course
                    total_days = (end_dt - start_dt).days
                    if total_days > 0:
                        progress = min(week_number / 10.0, 1.0)  # Assume max 10 weeks
                        due_dt = start_dt + timedelta(days=int(total_days * progress))
                        return due_dt.isoformat()
                else:
                    due_dt = start_dt + timedelta(days=days_to_add)
                    return due_dt.isoformat()
        except:
            pass
    
    return None

class ParseSyllabusBody(BaseModel):
    syllabus_id: str
    storage_bucket: str = "syllabi"
    storage_path: str  # e.g. "family123/chem.pdf"
    family_id: str
    child_id: Optional[str] = None

class ParseSyllabusEnhancedBody(BaseModel):
    syllabus_id: str
    storage_bucket: str = "evidence"
    storage_path: str
    family_id: str
    child_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    expected_weekly_minutes: Optional[int] = None
    create_backlog_items: bool = True  # If False, return tasks for review without creating

@router.post("/parse-syllabus")
async def parse_syllabus(body: ParseSyllabusBody):
    """Parse syllabus PDF/text and extract structured outline"""
    try:
        # Fetch file from storage
        text = await get_file_text_from_storage(body.storage_bucket, body.storage_path)
        
        # Extract outline using LLM
        outline = await llm_extract_outline(text)
        
        # Persist outline
        saved = await util_save_outline(body.syllabus_id, outline)
        
        return {
            "sections": saved.get("sections_count", 0),
            "outline": outline,
            "saved": saved.get("saved", False)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse syllabus: {str(e)}")

@router.post("/parse-syllabus-enhanced")
async def parse_syllabus_enhanced(body: ParseSyllabusEnhancedBody):
    """Enhanced syllabus parsing with skills extraction and unit creation"""
    from routers.util import get_admin_client
    from datetime import datetime, timedelta
    import json
    import re
    
    supa = get_admin_client()
    
    try:
        # Fetch file from storage
        text = await get_file_text_from_storage(body.storage_bucket, body.storage_path)
        
        # Extract outline using LLM
        outline = await llm_extract_outline(text)
        
        # Extract skills for each unit
        units_with_skills = []
        for unit in outline.get("units", []):
            unit_text = f"{unit.get('title', '')} {json.dumps(unit.get('sections', []))}"
            skills = await llm_extract_skills(unit_text)
            units_with_skills.append({
                **unit,
                "skills": skills
            })
        
        # Save units as syllabus_sections
        position = 1
        section_ids = []
        backlog_created = 0
        pending_backlog_items = []  # Initialize for review mode
        
        for unit_data in units_with_skills:
            # Create unit section
            unit_section = supa.table("syllabus_sections").insert({
                "syllabus_id": body.syllabus_id,
                "position": position,
                "section_type": "unit",
                "heading": unit_data.get("title", f"Unit {position}"),
                "notes": json.dumps(unit_data.get("sections", [])),
                "estimated_minutes": sum(s.get("minutes_estimate", 60) for s in unit_data.get("sections", [])),
                "suggested_due_ts": None  # Will be set by pacing
            }).execute()
            
            if unit_section.data:
                unit_section_id = unit_section.data[0]["id"]
                section_ids.append(unit_section_id)
                position += 1
                
                # Save skills for this unit
                for skill_data in unit_data.get("skills", []):
                    supa.table("syllabus_skills").insert({
                        "syllabus_id": body.syllabus_id,
                        "section_id": unit_section_id,
                        "skill": skill_data.get("skill", ""),
                        "difficulty": skill_data.get("difficulty", "intermediate"),
                        "weight": skill_data.get("weight", 1.0)
                    }).execute()
                
                # Create lesson sections and backlog items
                for lesson in unit_data.get("sections", []):
                    # Determine if this is an assignment or lesson based on type field
                    lesson_type = lesson.get("type", "").lower()
                    is_assignment = "assignment" in lesson_type or "homework" in lesson_type or "project" in lesson_type or "essay" in lesson_type
                    section_type = "assignment" if is_assignment else "lesson"
                    
                    lesson_section = supa.table("syllabus_sections").insert({
                        "syllabus_id": body.syllabus_id,
                        "position": position,
                        "section_type": section_type,
                        "heading": lesson.get("title", f"{section_type.capitalize()} {position}"),
                        "notes": lesson.get("due_hint", ""),
                        "estimated_minutes": lesson.get("minutes_estimate", 60),
                        "suggested_due_ts": None
                    }).execute()
                    
                    if lesson_section.data:
                        lesson_section_id = lesson_section.data[0]["id"]
                        position += 1
                        
                        # Create backlog item for this lesson/assignment if child_id is provided
                        if body.child_id:
                            try:
                                # Get subject_id from syllabus
                                syllabus_data = supa.table("syllabi").select("subject_id").eq("id", body.syllabus_id).single().execute()
                                subject_id = syllabus_data.data.get("subject_id") if syllabus_data.data else None
                                
                                # Parse due_date_hint if available
                                due_ts = parse_due_date_hint(
                                    lesson.get("due_hint", ""),
                                    body.start_date,
                                    body.end_date,
                                    week_number=position  # Use position as week number estimate
                                )
                                
                                # Build notes with syllabus link info
                                notes_parts = []
                                if lesson.get("description"):
                                    notes_parts.append(lesson.get("description"))
                                notes_parts.append(f"From syllabus: {unit_data.get('title', 'Unit')}")
                                notes_parts.append(f"Type: {section_type}")
                                notes_parts.append(f"Syllabus ID: {body.syllabus_id}, Section ID: {lesson_section_id}")
                                
                                backlog_item = {
                                    "family_id": body.family_id,
                                    "child_id": body.child_id,
                                    "subject_id": subject_id,
                                    "title": lesson.get("title", f"{section_type.capitalize()} {position}"),
                                    "notes": " | ".join(notes_parts),
                                    "estimated_minutes": lesson.get("minutes_estimate", 60),
                                    "due_ts": due_ts,
                                    "priority": 1 if is_assignment else 0,  # Assignments get higher priority
                                    "created_by": None,  # Can be set if user context available
                                    "section_id": lesson_section_id,  # Store for reference
                                    "section_type": section_type
                                }
                                
                                # Only create if create_backlog_items is True
                                if body.create_backlog_items:
                                    supa.table("backlog_items").insert({
                                        k: v for k, v in backlog_item.items() 
                                        if k not in ["section_id", "section_type"]  # Remove metadata fields
                                    }).execute()
                                    backlog_created += 1
                                else:
                                    # Store for review
                                    pending_backlog_items.append(backlog_item)
                            except Exception as e:
                                # Don't fail the whole parsing if backlog creation fails
                                print(f"Warning: Failed to create backlog item for lesson: {e}")
        
        # Auto-link evidence: Find uploads for this child/subject and link to relevant units
        linked_count = 0
        if body.child_id:
            try:
                # Get all uploads for this child and subject
                syllabus_data = supa.table("syllabi").select("subject_id").eq("id", body.syllabus_id).single().execute()
                subject_id = syllabus_data.data.get("subject_id") if syllabus_data.data else None
                
                uploads_query = supa.table("uploads").select("*").eq("child_id", body.child_id)
                if subject_id:
                    uploads_query = uploads_query.eq("subject_id", subject_id)
                
                uploads_res = uploads_query.execute()
                uploads = uploads_res.data or []
                
                # Create a mapping of unit titles to section_ids
                unit_title_to_section_id = {}
                for idx, unit_data in enumerate(units_with_skills):
                    if idx < len(section_ids):
                        unit_title = unit_data.get("title", "").lower()
                        unit_title_to_section_id[unit_title] = section_ids[idx]
                
                # Try to match uploads to units based on title/keywords
                for upload in uploads:
                    upload_title = (upload.get("title") or upload.get("caption") or "").lower()
                    upload_notes = (upload.get("notes") or "").lower()
                    
                    # Find best matching unit
                    best_match = None
                    best_score = 0
                    
                    for unit_data in units_with_skills:
                        unit_title = (unit_data.get("title", "")).lower()
                        unit_keywords = [k for k in unit_title.split() if len(k) > 3]
                        
                        # Simple matching: check if unit keywords appear in upload
                        score = 0
                        for keyword in unit_keywords:
                            if keyword in upload_title or keyword in upload_notes:
                                score += 1
                        
                        if score > best_score and score > 0:
                            best_score = score
                            best_match = unit_title_to_section_id.get(unit_title)
                    
                    # Link upload to best matching unit via metadata
                    if best_match:
                        metadata = upload.get("metadata") or {}
                        if not isinstance(metadata, dict):
                            metadata = {}
                        
                        metadata["syllabus_section_id"] = best_match
                        metadata["syllabus_id"] = body.syllabus_id
                        metadata["auto_linked"] = True
                        metadata["linked_at"] = datetime.now().isoformat()
                        
                        supa.table("uploads").update({
                            "metadata": metadata
                        }).eq("id", upload["id"]).execute()
                        linked_count += 1
            except Exception as e:
                # Don't fail the whole parsing if evidence linking fails
                print(f"Warning: Failed to auto-link evidence: {e}")
        
        result = {
            "success": True,
            "syllabus_id": body.syllabus_id,
            "units": units_with_skills,
            "sections_created": len(section_ids),
            "backlog_items_created": backlog_created if (body.child_id and body.create_backlog_items) else 0,
            "evidence_linked": linked_count if body.child_id else 0
        }
        
        # Include pending backlog items for review if not creating them
        if body.child_id and not body.create_backlog_items and "pending_backlog_items" in locals():
            result["pending_backlog_items"] = pending_backlog_items
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse syllabus: {str(e)}")


class CreateBacklogItemsBody(BaseModel):
    syllabus_id: str
    backlog_items: List[Dict[str, Any]]


@router.post("/create-backlog-items")
async def create_backlog_items(
    body: CreateBacklogItemsBody,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """
    Create backlog items after review/approval.
    Called from frontend after user reviews extracted tasks.
    """
    from routers.util import get_admin_client
    from helpers import get_family_id_for_user
    
    supa = get_admin_client()
    
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        created_ids = []
        for item in body.backlog_items:
            # Remove metadata fields before inserting
            insert_data = {
                k: v for k, v in item.items()
                if k not in ["section_id", "section_type"]
            }
            insert_data["created_by"] = user["id"]
            
            result = supa.table("backlog_items").insert(insert_data).execute()
            if result.data:
                created_ids.append(result.data[0]["id"])
        
        log_event("syllabus.backlog_items_created", 
                 syllabus_id=body.syllabus_id,
                 count=len(created_ids),
                 user_id=user["id"])
        
        return {
            "success": True,
            "created_count": len(created_ids),
            "backlog_item_ids": created_ids
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create backlog items: {str(e)}")

class SuggestPlanBody(BaseModel):
    family_id: str
    week_start: str  # YYYY-MM-DD
    child_ids: List[str]
    horizon_weeks: int = Field(default=2, ge=1, le=4)
    reason: str = "rebalance"

@router.post("/suggest-plan", status_code=200)
async def suggest_plan(body: SuggestPlanBody):
    """Generate AI plan proposal (does not apply changes)"""
    try:
        # Load planning context
        context = await load_planning_context(
            family_id=body.family_id,
            week_start=body.week_start,
            child_ids=body.child_ids,
            horizon_weeks=body.horizon_weeks
        )
        
        # Validate context and provide user clarity
        required_minutes = context.get("required_minutes", [])
        availability = context.get("availability", [])
        events = context.get("events", [])
        
        # Check for pack_week specific requirements
        if body.reason == "pack_week":
            # For pack_week, we need flexible backlog items
            # Check if there are any flexible backlog items in the context
            # (This would be added to context in load_planning_context if needed)
            # For now, we'll let the LLM handle it and add a message if nothing is found
            
            # Check if there's any availability with actual time windows
            has_availability = any(
                entry.get("windows") and len(entry.get("windows", [])) > 0
                for entry in availability
            )
            
            if not has_availability:
                # Check if this is due to cache failure (availability entries exist but no windows)
                has_entries_but_no_windows = len(availability) > 0 and not has_availability
                
                if has_entries_but_no_windows:
                    # This likely means calendar_days_cache RLS is blocking or cache is empty
                    # The fallback should have tried to refresh the cache, but it may need schedule rules
                    # Check if schedule rules exist
                    try:
                        supa = get_admin_client()
                        rules_res = supa.table("schedule_rules").select("id").eq(
                            "family_id", body.family_id
                        ).eq("is_active", True).limit(1).execute()
                        has_rules = len(rules_res.data or []) > 0
                    except:
                        has_rules = False  # Assume no rules if check fails
                    
                    return {
                        "planId": None,
                        "summary": {"adds": 0, "moves": 0, "deletes": 0},
                        "proposal": {
                            "adds": [],
                            "moves": [],
                            "deletes": [],
                            "rationale": [
                                "Schedule availability cache is not accessible or empty. The system attempted to refresh it, but schedule rules may need to be set up first."
                            ]
                        },
                        "changes": [],
                        "userMessage": "No available time slots found. This usually means:\n\n• Schedule rules need to be set up\n  → Go to Settings → Schedule Rules\n  → Define when teaching time is available (e.g., 9am-3pm weekdays)\n\n• Calendar cache needs to be populated\n  → The system tried to refresh it automatically\n  → If it's still empty, set up schedule rules first\n\n• RLS permissions may be blocking access\n  → Run fix_calendar_days_cache_rls.sql in Supabase if needed\n\nOnce schedule rules are set up, the cache will populate and planning will work.",
                        "needsScheduleRules": not has_rules  # Flag to route to schedule rules
                    }
                else:
                    # No availability entries at all
                    return {
                        "planId": None,
                        "summary": {"adds": 0, "moves": 0, "deletes": 0},
                        "proposal": {
                            "adds": [],
                            "moves": [],
                            "deletes": [],
                            "rationale": [
                                "No available time slots found for the selected period. Please check your schedule rules and blackout periods."
                            ]
                        },
                        "changes": [],
                        "userMessage": "No available time slots found. Please check your schedule rules and ensure there are no blackout periods blocking the planning window."
                    }
        
        # Check if there are required minutes for catch_up mode
        if body.reason == "catch_up" and len(required_minutes) == 0:
            return {
                "planId": None,
                "summary": {"adds": 0, "moves": 0, "deletes": 0},
                "proposal": {
                    "adds": [],
                    "moves": [],
                    "deletes": [],
                    "rationale": [
                        "No required minutes found for any subjects. To use catch-up planning, please set up subject requirements or syllabi with required weekly minutes."
                    ]
                },
                "changes": [],
                "userMessage": "No required minutes found. Please set up subject requirements or syllabi with weekly minute targets to use catch-up planning."
            }
        
        # Get LLM suggestion (pass reason for context-aware behavior)
        proposal = await llm_suggest_plan(context, reason=body.reason)
        
        # Check if proposal is empty and add helpful message
        adds_count = len(proposal.get("adds", []))
        moves_count = len(proposal.get("moves", []))
        deletes_count = len(proposal.get("deletes", []))
        
        user_message = None
        if adds_count == 0 and moves_count == 0 and deletes_count == 0:
            if body.reason == "pack_week":
                user_message = "No events were scheduled. This usually means:\n• No flexible backlog items are available to schedule\n• All available time slots are already filled\n• No schedule rules are configured\n\nTry adding items to your backlog first, or check your schedule rules."
            elif body.reason == "catch_up":
                user_message = "No catch-up sessions were suggested. This usually means:\n• No required minutes are set for subjects\n• All requirements are already met\n• No availability windows found\n\nTry setting up subject requirements or syllabi with weekly targets."
            else:
                user_message = "No schedule changes were suggested. Your schedule appears to be balanced already."
        
        # Persist plan
        plan_id, counts, persisted_changes = await persist_ai_plan(
            family_id=body.family_id,
            week_start=body.week_start,
            scope={
                "childIds": body.child_ids,
                "horizonWeeks": body.horizon_weeks,
                "reason": body.reason
            },
            proposal=proposal
        )
        
        result = {
            "planId": plan_id,
            "summary": counts,
            "proposal": proposal,
            "changes": persisted_changes  # Include persisted changes with database IDs
        }
        
        if user_message:
            result["userMessage"] = user_message
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to suggest plan: {str(e)}")

class Approval(BaseModel):
    change_id: str
    approved: bool
    edits: Optional[Dict[str, Any]] = None

class ApproveBody(BaseModel):
    plan_id: str
    approvals: List[Approval]

@router.patch("/approve")
async def approve_changes(body: ApproveBody):
    """Approve and apply plan changes atomically"""
    try:
        # Convert Pydantic models to dictionaries (Pydantic v2 uses model_dump())
        approvals_dict = [a.model_dump() for a in body.approvals]
        result = await apply_ai_plan_changes(body.plan_id, approvals_dict)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve changes: {str(e)}")

