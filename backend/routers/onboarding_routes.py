"""
FastAPI routes for onboarding and child management
Handles family setup, adding children, and state standards lookup
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from metrics import increment_counter

try:
    from supabase_client import get_admin_client
except ImportError:
    import importlib.util
    spec = importlib.util.spec_from_file_location("supabase_client", backend_dir / "supabase_client.py")
    supabase_client = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(supabase_client)
    get_admin_client = supabase_client.get_admin_client

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

APPROACH_DEFAULT_FEATURES = {
    "HOMESCHOOL_COMPLIANCE": {
        "learningAreas": True,
        "assignments": True,
        "materials": True,
        "attendance": True,
        "grades": True,
        "complianceRecords": True,
    },
    "AFTERSCHOOL_GOALS": {
        "learningAreas": True,
        "assignments": True,
        "materials": True,
        "attendance": False,
        "grades": True,
        "complianceRecords": False,
    },
    "NONE": {
        "learningAreas": True,
        "assignments": True,
        "materials": True,
        "attendance": True,
        "grades": False,
        "complianceRecords": False,
    },
}


def build_student_self_managed_feature_settings(planning_mode: str) -> dict:
    base = APPROACH_DEFAULT_FEATURES.get(planning_mode or "AFTERSCHOOL_GOALS", APPROACH_DEFAULT_FEATURES["AFTERSCHOOL_GOALS"])
    return {
        **base,
        "learningAreas": True,
        "attendance": False,
        "grades": False,
        "complianceRecords": False,
    }

# Helper function to validate and clean avatar URLs
# Filters out UUIDs that aren't valid URLs to prevent 404 errors
def validate_avatar_url(url: Optional[str]) -> Optional[str]:
    """
    Validates an avatar URL and returns None if it's invalid (e.g., just a UUID).
    Valid URLs must start with http://, https://, or data:.
    """
    if not url or not isinstance(url, str):
        return None
    
    url = url.strip()
    if not url:
        return None
    
    # Check if it's just a UUID (invalid URL format)
    import re
    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
    if uuid_pattern.match(url):
        # It's just a UUID, not a valid URL - return None
        return None
    
    # Valid URLs must start with http://, https://, or data:
    if url.startswith('http://') or url.startswith('https://') or url.startswith('data:'):
        return url
    
    # If it's a known avatar key (like "prof1"), it's valid
    # These will be handled by the frontend's avatar source mapping
    known_avatar_keys = ['prof1', 'prof2', 'prof3', 'prof4', 'prof5', 'prof6', 'prof7', 'prof8', 'prof9', 'prof10']
    if url.lower() in known_avatar_keys:
        return url
    
    # Otherwise, it's not a valid URL
    return None


@router.get("/health")
async def onboarding_health():
    """Health check for onboarding routes"""
    return {"status": "ok", "service": "onboarding"}


@router.post("/ensure_family")
async def ensure_family(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Ensure the current user has a family. If profile has no family_id (new signup),
    create a family row, add family_members (parent), and update profile.family_id.
    Returns { "family_id": "..." }. Idempotent: if user already has a family, returns it.
    """
    family_id = get_family_id_for_user(user["id"])
    if family_id:
        return {"family_id": family_id}

    supabase = get_admin_client()
    try:
        # Only allow for parent role (profile created by handle_new_user with role=parent). Use limit(1) to avoid 406.
        profile_res = supabase.table("profiles").select("id, role").eq("id", user["id"]).limit(1).execute()
        profile_row = profile_res.data[0] if profile_res.data and len(profile_res.data) > 0 else None
        if not profile_row or profile_row.get("role") != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can create a family"
            )

        # Create family row via RPC to avoid supabase-py SyncQueryRequestBuilder (insert().select() not supported).
        try:
            rpc_res = supabase.rpc("create_family_return_id", {}).execute()
            raw = rpc_res.data
            family_id = None
            if isinstance(raw, str) and len(raw) > 0:
                family_id = raw
            elif isinstance(raw, list) and len(raw) > 0:
                family_id = raw[0] if isinstance(raw[0], str) else raw[0].get("id") if isinstance(raw[0], dict) else None
            elif isinstance(raw, dict) and raw.get("id"):
                family_id = raw.get("id")
            if not family_id:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create family (no id from RPC)"
                )
        except HTTPException:
            raise
        except Exception as e:
            log_event("onboarding.ensure_family.rpc_error", user_id=user["id"], error=str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create family (RPC): {str(e)}"
            )

        # Add user as parent in family_members
        supabase.table("family_members").insert({
            "family_id": family_id,
            "user_id": user["id"],
            "member_role": "parent",
        }).execute()

        # Link profile to family
        supabase.table("profiles").update({
            "family_id": family_id,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", user["id"]).execute()

        log_event("onboarding.ensure_family.created", user_id=user["id"], family_id=family_id)
        return {"family_id": family_id}
    except HTTPException:
        raise
    except Exception as e:
        log_event("onboarding.ensure_family.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ensure family: {str(e)}"
        )


# ============================================================
# Request/Response Models
# ============================================================

class FamilySetupIn(BaseModel):
    name: Optional[str] = None
    home_state: Optional[str] = None
    timezone: Optional[str] = None


class SetPlanningModeIn(BaseModel):
    family_id: str
    planning_mode: str  # HOMESCHOOL_COMPLIANCE | AFTERSCHOOL_GOALS | NONE


class CreateSubjectIn(BaseModel):
    family_id: str
    name: str
    color: Optional[str] = None
    child_id: Optional[str] = None  # UUID of child; subject is linked to this child (onboarding per-child step)
    summary: Optional[str] = None
    grade: Optional[str] = None
    credits: Optional[float] = None
    notes: Optional[str] = None


class AddChildIn(BaseModel):
    family_id: str
    name: str
    nickname: Optional[str] = None
    age: Optional[int] = None
    grade_label: Optional[str] = None
    follow_standards: bool = False
    standards_state: Optional[str] = None
    avatar_url: Optional[str] = None
    interests: List[str] = []
    learning_styles: List[str] = []
    # Support profile fields (all optional)
    diagnoses: Optional[List[str]] = None
    learning_modalities: Optional[List[str]] = None
    support_needs: Optional[List[str]] = None
    executive_function: Optional[List[str]] = None
    support_notes: Optional[str] = None


class ChildOut(BaseModel):
    id: str
    family_id: str
    name: Optional[str] = None
    nickname: Optional[str] = None
    age: Optional[int] = None
    grade_label: Optional[str] = None
    follow_standards: Optional[bool] = None
    standards_state: Optional[str] = None
    avatar_url: Optional[str] = None
    interests: Optional[List[str]] = None
    learning_styles: Optional[List[str]] = None
    created_at: Optional[str] = None
    # Support profile fields
    diagnoses: Optional[List[str]] = None
    learning_modalities: Optional[List[str]] = None
    support_needs: Optional[List[str]] = None
    executive_function: Optional[List[str]] = None
    support_notes: Optional[str] = None


class CompleteOnboardingIn(BaseModel):
    family_id: Optional[str] = None
    onboarding_who: Optional[str] = None  # 'parent' | 'student'


class ParentProfileIn(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=40)
    avatar_url: str = Field(..., min_length=1)


def _profile_has_parent_display(profile_row: Optional[dict]) -> bool:
    if not profile_row:
        return False
    name = (profile_row.get("first_name") or profile_row.get("name") or "").strip()
    avatar = validate_avatar_url(profile_row.get("avatar_url"))
    return bool(name and avatar)


# ============================================================
# Routes
# ============================================================

@router.post("/family_setup")
async def family_setup(
    body: FamilySetupIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Create or update family details (name, home_state, timezone).
    """
    log_event("onboarding.family_setup.start", user_id=user["id"])
    
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found. Please complete initial setup."
            )
        
        supabase = get_admin_client()
        
        # Update family record
        update_data = {}
        if body.name is not None:
            update_data["name"] = body.name
        if body.home_state is not None:
            update_data["home_state"] = body.home_state
        if body.timezone is not None:
            update_data["timezone"] = body.timezone
        
        if update_data:
            update_data["updated_at"] = datetime.utcnow().isoformat()
            resp = supabase.table("family").update(update_data).eq("id", family_id).execute()
            
            if not resp.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Family record not found"
                )
        
        increment_counter("family_setup_updates")
        log_event("onboarding.family_setup.success", user_id=user["id"], family_id=family_id)
        
        return {
            "success": True,
            "family_id": family_id,
            "message": "Family setup updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("onboarding.family_setup.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update family setup: {str(e)}"
        )


@router.post("/set_planning_mode")
async def set_planning_mode(
    body: SetPlanningModeIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Set family default_planning_mode (onboarding step 1)."""
    if body.planning_mode not in ("HOMESCHOOL_COMPLIANCE", "AFTERSCHOOL_GOALS", "NONE"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid planning_mode")
    family_id = get_family_id_for_user(user["id"])
    if not family_id or family_id != body.family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Family ID mismatch")
    supabase = get_admin_client()
    try:
        update_data = {"default_planning_mode": body.planning_mode, "updated_at": datetime.utcnow().isoformat()}
        supabase.table("family").update(update_data).eq("id", family_id).execute()
    except Exception as e:
        log_event("onboarding.set_planning_mode.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    log_event("onboarding.set_planning_mode.success", user_id=user["id"], family_id=family_id)
    return {"success": True}


# Deterministic subject color palette (cycle by family subject count)
SUBJECT_COLOR_PALETTE = [
    "#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#EC4899",
    "#6366F1", "#14B8A6", "#84CC16", "#F97316",
]


@router.post("/create_subject")
async def create_subject(
    body: CreateSubjectIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Create one subject for the family (onboarding step 3). Returns subject_id. Assigns color from palette if not provided. Optional child_id links subject to that child."""
    family_id = get_family_id_for_user(user["id"])
    if not family_id or family_id != body.family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Family ID mismatch")
    if body.child_id and not child_belongs_to_family(body.child_id, family_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Child does not belong to your family")
    supabase = get_admin_client()
    insert_data = {"family_id": family_id, "name": body.name.strip()}
    if body.child_id:
        insert_data["child_id"] = body.child_id
    if body.summary is not None:
        insert_data["summary"] = body.summary.strip() or None
    if body.grade is not None:
        insert_data["grade"] = body.grade.strip() or None
    if body.credits is not None:
        insert_data["credits"] = body.credits
    if body.notes is not None:
        insert_data["notes"] = body.notes.strip() or None
    if body.color:
        insert_data["color"] = body.color
    else:
        try:
            existing = supabase.table("subject").select("id").eq("family_id", family_id).execute()
            count = len(existing.data or [])
            insert_data["color"] = SUBJECT_COLOR_PALETTE[count % len(SUBJECT_COLOR_PALETTE)]
        except Exception:
            insert_data["color"] = SUBJECT_COLOR_PALETTE[0]
    try:
        resp = supabase.table("subject").insert(insert_data).execute()
    except Exception as e:
        log_event("onboarding.create_subject.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    if not resp.data or len(resp.data) == 0:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create subject")
    subject_id = resp.data[0]["id"]
    log_event("onboarding.create_subject.success", user_id=user["id"], family_id=family_id, subject_id=subject_id)
    return {"subject_id": subject_id}


@router.post("/parent_profile")
async def save_parent_profile(
    body: ParentProfileIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Save parent display name and bundled avatar key on profiles during onboarding."""
    display_name = body.display_name.strip()
    if not display_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Display name is required",
        )
    avatar_key = validate_avatar_url(body.avatar_url)
    if not avatar_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a valid avatar",
        )

    supabase = get_admin_client()
    user_id = user["id"]
    family_id = get_family_id_for_user(user_id)

    try:
        profile_res = supabase.table("profiles").select("id, role").eq("id", user_id).maybe_single().execute()
        profile_row = profile_res.data or {}
        role = (profile_row.get("role") or "").lower()
        if role and role not in ("parent", "admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can set a parent profile during onboarding",
            )

        now = datetime.utcnow().isoformat()
        supabase.table("profiles").update({
            "first_name": display_name,
            "name": display_name,
            "avatar_url": avatar_key,
            "updated_at": now,
        }).eq("id", user_id).execute()

        if family_id:
            try:
                supabase.table("family_members").update({
                    "display_name": display_name,
                    "updated_at": now,
                }).eq("family_id", family_id).eq("user_id", user_id).execute()
            except Exception as member_err:
                log_event(
                    "onboarding.parent_profile.family_member_display_name",
                    user_id=user_id,
                    family_id=family_id,
                    error=str(member_err),
                )

        log_event("onboarding.parent_profile.success", user_id=user_id, family_id=family_id)
        return {
            "success": True,
            "display_name": display_name,
            "avatar_url": avatar_key,
        }
    except HTTPException:
        raise
    except Exception as e:
        log_event("onboarding.parent_profile.error", user_id=user_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save parent profile: {str(e)}",
        )


@router.get("/status")
async def onboarding_status(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Return onboarding state for resume support."""
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        return {
            "onboarding_completed": False,
            "has_children": False,
            "has_subjects": False,
            "has_parent_profile": False,
            "parent_display_name": None,
            "parent_avatar_url": None,
            "default_planning_mode": None,
        }
    supabase = get_admin_client()
    profile_row = {}
    try:
        profile_res = supabase.table("profiles").select(
            "first_name, name, avatar_url, role"
        ).eq("id", user["id"]).maybe_single().execute()
        profile_row = profile_res.data or {}
    except Exception:
        profile_row = {}
    has_parent_profile = _profile_has_parent_display(profile_row)
    parent_display_name = (profile_row.get("first_name") or profile_row.get("name") or "").strip() or None
    parent_avatar_url = validate_avatar_url(profile_row.get("avatar_url"))
    try:
        family_res = supabase.table("family").select("*").eq("id", family_id).maybe_single().execute()
        row = family_res.data or {}
        completed = row.get("onboarding_completed")
        if completed is None:
            completed = row.get("has_completed_onboarding") or False
        default_planning_mode = row.get("default_planning_mode")
    except Exception:
        completed = False
        default_planning_mode = None
    try:
        children_res = supabase.table("children").select("id").eq("family_id", family_id).limit(1).execute()
        has_children = bool(children_res.data and len(children_res.data) > 0)
    except Exception:
        has_children = False
    try:
        subjects_res = supabase.table("subject").select("id").eq("family_id", family_id).limit(1).execute()
        has_subjects = bool(subjects_res.data and len(subjects_res.data) > 0)
    except Exception:
        has_subjects = False
    onboarding_is_valid = bool(
        default_planning_mode
        and has_children
    )
    return {
        "onboarding_completed": bool(completed),
        "onboarding_is_valid": onboarding_is_valid,
        "has_children": has_children,
        "has_subjects": has_subjects,
        "has_parent_profile": has_parent_profile,
        "parent_display_name": parent_display_name,
        "parent_avatar_url": parent_avatar_url,
        "default_planning_mode": default_planning_mode,
    }


@router.post("/add_child")
async def add_child(
    body: AddChildIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Add or edit a child profile.
    Accepts full payload with all child fields. For onboarding: name required, at least one of grade_label or age.
    """
    log_event("onboarding.add_child.start", user_id=user["id"], child_name=body.name[:50])
    
    try:
        # Validate: at least one of grade or age for onboarding
        if not body.grade_label and body.age is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide at least one of grade or age"
            )
        # Validate family access
        family_id = get_family_id_for_user(user["id"])
        if not family_id or family_id != body.family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Family ID mismatch"
            )
        
        supabase = get_admin_client()
        
        # Map API fields to database columns
        # Database uses: first_name, grade, standards, avatar, learning_style (singular)
        # API spec uses: name, grade_label, standards_state, avatar_url, learning_styles (plural)
        insert_data = {
            "family_id": body.family_id,
            "first_name": body.name,  # Database column is first_name
        }
        if body.age is not None:
            insert_data["age"] = body.age
        elif body.grade_label:
            # Some DBs require age; use a sentinel when only grade provided
            insert_data["age"] = 0
        
        # Optional fields - map to actual database columns
        if body.nickname:
            insert_data["nickname"] = body.nickname
        
        if body.grade_label:
            insert_data["grade"] = body.grade_label  # Database uses 'grade' (text)
        
        if body.follow_standards and body.standards_state:
            insert_data["standards"] = body.standards_state  # Database uses 'standards' (text)
        
        if body.avatar_url:
            insert_data["avatar"] = body.avatar_url  # Database uses 'avatar' (text)
        
        if body.interests:
            # Database stores as array or text - store as array if possible
            insert_data["interests"] = body.interests
        
        if body.learning_styles:
            # Database uses 'learning_style' (singular, text) - take first value
            if len(body.learning_styles) > 0:
                insert_data["learning_style"] = body.learning_styles[0]
        
        # Insert child record
        try:
            resp = supabase.table("children").insert(insert_data).execute()
        except Exception as db_err:
            log_event("onboarding.add_child.db_error", user_id=user["id"], error=str(db_err), insert_data=insert_data)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(db_err)}"
            )
        
        if not resp.data:
            log_event("onboarding.add_child.no_data", user_id=user["id"], insert_data=insert_data)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create child record - no data returned"
            )
        
        child_data = resp.data[0]
        child_id = child_data["id"]
        
        # Create or update support profile if any support fields are provided
        if any([body.diagnoses, body.learning_modalities, body.support_needs, body.executive_function, body.support_notes]):
            support_profile_data = {}
            if body.diagnoses is not None:
                support_profile_data["diagnoses"] = body.diagnoses
            if body.learning_modalities is not None:
                support_profile_data["learning_modalities"] = body.learning_modalities
            if body.support_needs is not None:
                support_profile_data["support_needs"] = body.support_needs
            if body.executive_function is not None:
                support_profile_data["executive_function"] = body.executive_function
            if body.support_notes is not None:
                support_profile_data["notes"] = body.support_notes
            
            if support_profile_data:
                support_profile_data["child_id"] = child_id
                # Use upsert to handle both insert and update
                try:
                    supabase.table("child_support_profiles").upsert(
                        support_profile_data,
                        on_conflict="child_id"
                    ).execute()
                except Exception as profile_err:
                    # Log but don't fail the child creation
                    log_event("onboarding.add_child.support_profile_error", 
                             user_id=user["id"], 
                             child_id=child_id, 
                             error=str(profile_err))
        
        increment_counter("children_added")
        log_event("onboarding.add_child.success", user_id=user["id"], child_id=child_id, family_id=family_id)
        
        # Fetch support profile if it exists
        support_profile = None
        try:
            profile_resp = supabase.table("child_support_profiles").select("*").eq("child_id", child_id).execute()
            if profile_resp.data:
                support_profile = profile_resp.data[0]
        except Exception:
            pass  # Support profile is optional
        
        # Get and validate avatar_url
        raw_avatar_url = child_data.get("avatar_url") or child_data.get("avatar")
        validated_avatar_url = validate_avatar_url(raw_avatar_url)
        
        # Return child data in expected format (API spec format)
        result = {
            "id": child_id,
            "family_id": child_data.get("family_id"),
            "name": child_data.get("first_name") or child_data.get("name"),  # Map first_name to name for API
            "nickname": child_data.get("nickname"),
            "age": child_data.get("age"),
            "grade_label": child_data.get("grade_label") or child_data.get("grade"),  # Map grade to grade_label
            "follow_standards": child_data.get("follow_standards", bool(child_data.get("standards"))),
            "standards_state": child_data.get("standards_state") or child_data.get("standards"),  # Map standards to standards_state
            "avatar_url": validated_avatar_url,  # Use validated URL (None if invalid)
            "interests": child_data.get("interests", []) if isinstance(child_data.get("interests"), list) else (child_data.get("interests", "").split(",") if child_data.get("interests") else []),
            "learning_styles": child_data.get("learning_styles", []) if isinstance(child_data.get("learning_styles"), list) else ([child_data.get("learning_style")] if child_data.get("learning_style") else []),
            "created_at": child_data.get("created_at"),
        }
        
        # Add support profile fields if available
        if support_profile:
            result["diagnoses"] = support_profile.get("diagnoses", [])
            result["learning_modalities"] = support_profile.get("learning_modalities", [])
            result["support_needs"] = support_profile.get("support_needs", [])
            result["executive_function"] = support_profile.get("executive_function", [])
            result["support_notes"] = support_profile.get("notes")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("onboarding.add_child.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add child: {str(e)}"
        )


@router.get("/children")
async def get_children(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Return accessible children for the current user based on their role.
    - Parents: all children in their family
    - Tutors: only children in their child_scope
    - Children: only themselves
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            return []
        
        supabase = get_admin_client()
        
        # Get accessible child IDs using RPC helper
        try:
            accessible_res = supabase.rpc(
                "get_accessible_children",
                {"_user_id": user["id"]}
            ).execute()
            
            accessible_child_ids = []
            if accessible_res.data:
                accessible_child_ids = [c.get("child_id") for c in accessible_res.data if c.get("child_id")]
        except Exception as rpc_error:
            # Fallback: if RPC doesn't exist yet, use legacy logic
            log_event("onboarding.get_children.rpc_fallback", user_id=user["id"], error=str(rpc_error))
            accessible_child_ids = None
        
        # Get children for the family
        query = supabase.table("children").select("*").eq("family_id", family_id).eq("archived", False)
        
        # Filter by accessible children if RPC worked
        if accessible_child_ids is not None:
            if not accessible_child_ids:
                # User has no accessible children
                return []
            query = query.in_("id", accessible_child_ids)
        
        resp = query.order("created_at").execute()
        
        children = []
        for child in resp.data or []:
            # Map database fields to API spec format
            interests = child.get("interests", [])
            if not isinstance(interests, list):
                interests = interests.split(",") if interests else []
            
            learning_styles = child.get("learning_styles", [])
            if not isinstance(learning_styles, list):
                learning_styles = [child.get("learning_style")] if child.get("learning_style") else []
            
            # Get and validate avatar_url
            raw_avatar_url = child.get("avatar_url") or child.get("avatar")
            validated_avatar_url = validate_avatar_url(raw_avatar_url)
            
            children.append({
                "id": child["id"],
                "family_id": child.get("family_id"),
                "name": child.get("first_name") or child.get("name"),  # Map first_name to name
                "nickname": child.get("nickname"),
                "age": child.get("age"),
                "grade_label": child.get("grade_label") or child.get("grade"),  # Map grade to grade_label
                "follow_standards": child.get("follow_standards", bool(child.get("standards"))),
                "standards_state": child.get("standards_state") or child.get("standards"),  # Map standards to standards_state
                "avatar_url": validated_avatar_url,  # Use validated URL (None if invalid)
                "interests": interests,
                "learning_styles": learning_styles,
                "created_at": child.get("created_at"),
            })
        
        return children
        
    except Exception as e:
        log_event("onboarding.get_children.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch children: {str(e)}"
        )


@router.post("/complete")
async def complete_onboarding(
    body: Optional[CompleteOnboardingIn] = None,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Mark onboarding as finished. Sets onboarding_completed = TRUE on family.
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        supabase = get_admin_client()
        update_payload = {
            "onboarding_completed": True,
            "updated_at": datetime.utcnow().isoformat(),
        }
        if body and body.onboarding_who == "student":
            try:
                family_res = (
                    supabase.table("family")
                    .select("default_planning_mode, feature_settings")
                    .eq("id", family_id)
                    .maybe_single()
                    .execute()
                )
                family_row = family_res.data or {}
                if not family_row.get("feature_settings"):
                    planning_mode = family_row.get("default_planning_mode") or "AFTERSCHOOL_GOALS"
                    update_payload["feature_settings"] = build_student_self_managed_feature_settings(planning_mode)
            except Exception as feature_error:
                log_event(
                    "onboarding.complete.student_feature_settings_error",
                    user_id=user["id"],
                    family_id=family_id,
                    error=str(feature_error),
                )
        resp = supabase.table("family").update(update_payload).eq("id", family_id).execute()
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family record not found"
            )

        # Student self-signup onboarding should end as a child-role account.
        # This allows learner-scoped experience from first login, before any parent link.
        if body and body.onboarding_who == "student":
            try:
                child_res = (
                    supabase.table("children")
                    .select("id")
                    .eq("family_id", family_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                child_rows = child_res.data or []
                child_id = child_rows[0]["id"] if child_rows else None

                if child_id:
                    fm_res = (
                        supabase.table("family_members")
                        .select("id")
                        .eq("family_id", family_id)
                        .eq("user_id", user["id"])
                        .execute()
                    )
                    fm_rows = fm_res.data or []
                    if fm_rows:
                        for fm in fm_rows:
                            if not fm.get("id"):
                                continue
                            supabase.table("family_members").update({
                                "member_role": "child",
                                "child_id": child_id,
                                "child_scope": [child_id],
                                "updated_at": datetime.utcnow().isoformat(),
                            }).eq("id", fm["id"]).execute()
                    else:
                        supabase.table("family_members").insert({
                            "family_id": family_id,
                            "user_id": user["id"],
                            "member_role": "child",
                            "child_id": child_id,
                            "child_scope": [child_id],
                        }).execute()

                    supabase.table("profiles").update({
                        "family_id": family_id,
                        "role": "child",
                        "updated_at": datetime.utcnow().isoformat(),
                    }).eq("id", user["id"]).execute()
                else:
                    log_event(
                        "onboarding.complete.student_no_child",
                        user_id=user["id"],
                        family_id=family_id,
                    )
            except Exception as role_error:
                log_event(
                    "onboarding.complete.student_role_error",
                    user_id=user["id"],
                    family_id=family_id,
                    error=str(role_error),
                )
        log_event("onboarding.complete", user_id=user["id"], family_id=family_id)
        return {"success": True, "message": "Onboarding completed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        log_event("onboarding.complete.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete onboarding: {str(e)}"
        )

