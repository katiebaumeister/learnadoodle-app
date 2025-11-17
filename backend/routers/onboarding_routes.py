"""
FastAPI routes for onboarding and child management
Handles family setup, adding children, and state standards lookup
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
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


@router.get("/health")
async def onboarding_health():
    """Health check for onboarding routes"""
    return {"status": "ok", "service": "onboarding"}


# ============================================================
# Request/Response Models
# ============================================================

class FamilySetupIn(BaseModel):
    name: Optional[str] = None
    home_state: Optional[str] = None
    timezone: Optional[str] = None


class AddChildIn(BaseModel):
    family_id: str
    name: str
    nickname: Optional[str] = None
    age: int
    grade_label: Optional[str] = None
    follow_standards: bool = False
    standards_state: Optional[str] = None
    avatar_url: Optional[str] = None
    interests: List[str] = []
    learning_styles: List[str] = []


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


@router.post("/add_child")
async def add_child(
    body: AddChildIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Add or edit a child profile.
    Accepts full payload with all child fields.
    """
    log_event("onboarding.add_child.start", user_id=user["id"], child_name=body.name[:50])
    
    try:
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
            "age": body.age,
        }
        
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
        
        increment_counter("children_added")
        log_event("onboarding.add_child.success", user_id=user["id"], child_id=child_data["id"], family_id=family_id)
        
        # Return child data in expected format (API spec format)
        return {
            "id": child_data["id"],
            "family_id": child_data.get("family_id"),
            "name": child_data.get("first_name") or child_data.get("name"),  # Map first_name to name for API
            "nickname": child_data.get("nickname"),
            "age": child_data.get("age"),
            "grade_label": child_data.get("grade_label") or child_data.get("grade"),  # Map grade to grade_label
            "follow_standards": child_data.get("follow_standards", bool(child_data.get("standards"))),
            "standards_state": child_data.get("standards_state") or child_data.get("standards"),  # Map standards to standards_state
            "avatar_url": child_data.get("avatar_url") or child_data.get("avatar"),  # Map avatar to avatar_url
            "interests": child_data.get("interests", []) if isinstance(child_data.get("interests"), list) else (child_data.get("interests", "").split(",") if child_data.get("interests") else []),
            "learning_styles": child_data.get("learning_styles", []) if isinstance(child_data.get("learning_styles"), list) else ([child_data.get("learning_style")] if child_data.get("learning_style") else []),
            "created_at": child_data.get("created_at"),
        }
        
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
            
            children.append({
                "id": child["id"],
                "family_id": child.get("family_id"),
                "name": child.get("first_name") or child.get("name"),  # Map first_name to name
                "nickname": child.get("nickname"),
                "age": child.get("age"),
                "grade_label": child.get("grade_label") or child.get("grade"),  # Map grade to grade_label
                "follow_standards": child.get("follow_standards", bool(child.get("standards"))),
                "standards_state": child.get("standards_state") or child.get("standards"),  # Map standards to standards_state
                "avatar_url": child.get("avatar_url") or child.get("avatar"),  # Map avatar to avatar_url
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


@router.get("/complete")
async def complete_onboarding(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Mark onboarding as finished (sets flag in family).
    """
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )
        
        supabase = get_admin_client()
        
        resp = supabase.table("family").update({
            "has_completed_onboarding": True,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", family_id).execute()
        
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family record not found"
            )
        
        log_event("onboarding.complete", user_id=user["id"], family_id=family_id)
        
        return {
            "success": True,
            "message": "Onboarding completed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_event("onboarding.complete.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete onboarding: {str(e)}"
        )

