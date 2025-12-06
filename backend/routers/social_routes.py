"""
Social & Community Features Routes
Handles family connections, groups, sharing, co-op planning, marketplace
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import secrets
import string

from helpers import get_family_id_for_user
from supabase_client import get_admin_client
from auth import get_current_user, rate_limiter
from logger import log_event

router = APIRouter(prefix="/api/social", tags=["social"])

# ============================================================
# Request/Response Models
# ============================================================

class CreateGroupInput(BaseModel):
    name: str
    description: Optional[str] = None
    group_type: str = Field(..., description="'coop', 'pod', 'class', 'club', 'study_group'")
    is_public: bool = False
    requires_approval: bool = True
    max_members: Optional[int] = None
    tags: List[str] = []
    location: Optional[str] = None
    meeting_schedule: Optional[Dict[str, Any]] = None

class JoinGroupInput(BaseModel):
    invite_code: Optional[str] = None

class ShareResourceInput(BaseModel):
    resource_type: str = Field(..., description="'template', 'curriculum', 'lesson_plan', 'syllabus', 'evidence', 'document'")
    resource_id: str
    shared_with_type: str = Field(..., description="'family', 'group', 'public'")
    shared_with_id: Optional[str] = None
    visibility: str = Field(default="members", description="'public', 'members', 'invite_only'")
    title: str
    description: Optional[str] = None
    tags: List[str] = []

class CreateSharedClassInput(BaseModel):
    group_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    subject_id: Optional[str] = None
    is_public: bool = False
    max_students: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    meeting_times: Optional[List[Dict[str, Any]]] = None
    visibility: str = Field(default="members", description="'public', 'members', 'invite_only'")

class EnrollInClassInput(BaseModel):
    child_id: str

class CreateConnectionInput(BaseModel):
    family_id: str

class CreateMarketplaceListingInput(BaseModel):
    resource_type: str = Field(..., description="'template', 'curriculum', 'lesson_pack', 'syllabus'")
    resource_id: str
    title: str
    description: str
    price_cents: int = Field(default=0, description="Price in cents, 0 = free")
    tags: List[str] = []
    category: Optional[str] = None

class CreateReviewInput(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    review_text: Optional[str] = None

# ============================================================
# Groups Routes
# ============================================================

@router.post("/groups")
async def create_group(
    body: CreateGroupInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Create a new family group (co-op, pod, class, etc.)"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Create group
        group_data = {
            "name": body.name,
            "description": body.description,
            "group_type": body.group_type,
            "created_by": user["id"],
            "is_public": body.is_public,
            "requires_approval": body.requires_approval,
            "max_members": body.max_members,
            "tags": body.tags,
            "location": body.location,
            "meeting_schedule": body.meeting_schedule,
        }

        group_res = supabase.table("family_groups").insert(group_data).execute()
        if not group_res.data:
            raise HTTPException(status_code=500, detail="Failed to create group")

        group = group_res.data[0]

        # Add creator as admin member
        member_data = {
            "group_id": group["id"],
            "family_id": family_id,
            "user_id": user["id"],
            "role": "admin",
            "status": "approved",
            "joined_at": datetime.now().isoformat(),
        }

        supabase.table("group_members").insert(member_data).execute()

        log_event("social.group.created", user_id=user["id"], group_id=group["id"])

        return {"success": True, "group": group}

    except HTTPException:
        raise
    except Exception as e:
        log_event("social.group.create.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error creating group: {str(e)}")

@router.get("/groups")
async def list_groups(
    group_type: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(None),
    q: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """List groups (public or user's groups)"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Build query
        query = supabase.table("family_groups").select("*")

        if group_type:
            query = query.eq("group_type", group_type)
        
        if is_public is not None:
            query = query.eq("is_public", is_public)

        if q:
            query = query.or_(f"name.ilike.%{q}%,description.ilike.%{q}%")

        groups_res = query.order("created_at", desc=True).execute()

        # Get user's group memberships
        memberships_res = supabase.table("group_members").select("group_id, role, status").eq("family_id", family_id).execute()
        membership_map = {m["group_id"]: m for m in memberships_res.data or []}

        # Add membership info to groups
        groups = []
        for group in groups_res.data or []:
            membership = membership_map.get(group["id"])
            group["membership"] = membership
            groups.append(group)

        return {"success": True, "groups": groups}

    except HTTPException:
        raise
    except Exception as e:
        log_event("social.groups.list.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error listing groups: {str(e)}")

@router.get("/groups/{group_id}")
async def get_group_details(
    group_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Get group details including members"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Get group
        group_res = supabase.table("family_groups").select("*").eq("id", group_id).single().execute()
        if not group_res.data:
            raise HTTPException(status_code=404, detail="Group not found")

        group = group_res.data[0]

        # Get members
        members_res = supabase.table("group_members").select(
            "*, family:family_id(id, name), user:user_id(id, email)"
        ).eq("group_id", group_id).execute()

        # Get shared resources count
        resources_res = supabase.table("shared_resources").select("id", count="exact").eq("shared_with_type", "group").eq("shared_with_id", group_id).execute()

        group["members"] = members_res.data or []
        group["resources_count"] = resources_res.count or 0

        return {"success": True, "group": group}

    except HTTPException:
        raise
    except Exception as e:
        log_event("social.group.get.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error getting group: {str(e)}")

@router.post("/groups/{group_id}/join")
async def join_group(
    group_id: str,
    body: JoinGroupInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Join a group (by invite code or direct join)"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Get group
        if body.invite_code:
            group_res = supabase.table("family_groups").select("*").eq("invite_code", body.invite_code).single().execute()
        else:
            group_res = supabase.table("family_groups").select("*").eq("id", group_id).single().execute()

        if not group_res.data:
            raise HTTPException(status_code=404, detail="Group not found")

        group = group_res.data[0]

        # Check if already a member
        existing_res = supabase.table("group_members").select("*").eq("group_id", group["id"]).eq("family_id", family_id).execute()
        if existing_res.data:
            return {"success": True, "message": "Already a member", "membership": existing_res.data[0]}

        # Check max members
        if group.get("max_members"):
            current_count_res = supabase.table("group_members").select("id", count="exact").eq("group_id", group["id"]).eq("status", "approved").execute()
            if (current_count_res.count or 0) >= group["max_members"]:
                raise HTTPException(status_code=400, detail="Group is full")

        # Create membership request
        member_data = {
            "group_id": group["id"],
            "family_id": family_id,
            "user_id": user["id"],
            "role": "member",
            "status": "approved" if not group.get("requires_approval") else "pending",
            "joined_at": datetime.now().isoformat(),
        }

        member_res = supabase.table("group_members").insert(member_data).execute()

        log_event("social.group.joined", user_id=user["id"], group_id=group["id"])

        return {"success": True, "membership": member_res.data[0] if member_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        log_event("social.group.join.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error joining group: {str(e)}")

@router.post("/groups/{group_id}/members/{member_id}/approve")
async def approve_member(
    group_id: str,
    member_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Approve a pending member (admin only)"""
    try:
        supabase = get_admin_client()

        # Verify admin
        admin_check = supabase.rpc("is_group_admin", {"_group_id": group_id, "_user_id": user["id"]}).execute()
        if not admin_check.data:
            raise HTTPException(status_code=403, detail="Not a group admin")

        # Update member status
        update_res = supabase.table("group_members").update({"status": "approved"}).eq("id", member_id).eq("group_id", group_id).execute()

        return {"success": True, "member": update_res.data[0] if update_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error approving member: {str(e)}")

# ============================================================
# Resource Sharing Routes
# ============================================================

@router.post("/resources/share")
async def share_resource(
    body: ShareResourceInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Share a resource (template, curriculum, etc.)"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Create shared resource
        resource_data = {
            "resource_type": body.resource_type,
            "resource_id": body.resource_id,
            "shared_by": user["id"],
            "shared_with_type": body.shared_with_type,
            "shared_with_id": body.shared_with_id,
            "visibility": body.visibility,
            "title": body.title,
            "description": body.description,
            "tags": body.tags,
        }

        resource_res = supabase.table("shared_resources").insert(resource_data).execute()

        log_event("social.resource.shared", user_id=user["id"], resource_type=body.resource_type, resource_id=body.resource_id)

        return {"success": True, "resource": resource_res.data[0] if resource_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        log_event("social.resource.share.error", user_id=user["id"], error=str(e))
        raise HTTPException(status_code=500, detail=f"Error sharing resource: {str(e)}")

@router.get("/resources")
async def list_shared_resources(
    resource_type: Optional[str] = Query(None),
    shared_with_type: Optional[str] = Query(None),
    shared_with_id: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """List shared resources"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Build query
        query = supabase.table("shared_resources").select("*")

        if resource_type:
            query = query.eq("resource_type", resource_type)

        if shared_with_type:
            query = query.eq("shared_with_type", shared_with_type)

        if shared_with_id:
            query = query.eq("shared_with_id", shared_with_id)

        if q:
            query = query.or_(f"title.ilike.%{q}%,description.ilike.%{q}%")

        resources_res = query.order("created_at", desc=True).execute()

        return {"success": True, "resources": resources_res.data or []}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing resources: {str(e)}")

# ============================================================
# Shared Classes Routes
# ============================================================

@router.post("/classes")
async def create_shared_class(
    body: CreateSharedClassInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Create a shared class (multi-family)"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        class_data = {
            "group_id": body.group_id,
            "name": body.name,
            "description": body.description,
            "subject_id": body.subject_id,
            "created_by": user["id"],
            "is_public": body.is_public,
            "max_students": body.max_students,
            "start_date": body.start_date,
            "end_date": body.end_date,
            "meeting_times": body.meeting_times,
            "visibility": body.visibility,
        }

        class_res = supabase.table("shared_classes").insert(class_data).execute()

        log_event("social.class.created", user_id=user["id"], class_id=class_res.data[0]["id"] if class_res.data else None)

        return {"success": True, "class": class_res.data[0] if class_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating shared class: {str(e)}")

@router.post("/classes/{class_id}/enroll")
async def enroll_in_class(
    class_id: str,
    body: EnrollInClassInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Enroll a child in a shared class"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify child belongs to family
        child_res = supabase.table("children").select("id").eq("id", body.child_id).eq("family_id", family_id).single().execute()
        if not child_res.data:
            raise HTTPException(status_code=404, detail="Child not found")

        # Check if already enrolled
        existing_res = supabase.table("shared_class_enrollments").select("*").eq("class_id", class_id).eq("child_id", body.child_id).execute()
        if existing_res.data:
            return {"success": True, "message": "Already enrolled", "enrollment": existing_res.data[0]}

        # Create enrollment
        enrollment_data = {
            "class_id": class_id,
            "child_id": body.child_id,
            "family_id": family_id,
            "enrolled_by": user["id"],
            "status": "active",
        }

        enrollment_res = supabase.table("shared_class_enrollments").insert(enrollment_data).execute()

        return {"success": True, "enrollment": enrollment_res.data[0] if enrollment_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enrolling in class: {str(e)}")

# ============================================================
# Family Connections Routes
# ============================================================

@router.post("/connections")
async def create_connection(
    body: CreateConnectionInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Connect with another family"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Verify target family exists
        target_family_res = supabase.table("family").select("id").eq("id", body.family_id).single().execute()
        if not target_family_res.data:
            raise HTTPException(status_code=404, detail="Target family not found")

        # Check if connection already exists
        existing_res = supabase.table("family_connections").select("*").or_(f"family_id_1.eq.{family_id},family_id_2.eq.{family_id}").or_(f"family_id_1.eq.{body.family_id},family_id_2.eq.{body.family_id}").execute()
        if existing_res.data:
            return {"success": True, "message": "Connection already exists", "connection": existing_res.data[0]}

        # Create connection
        connection_data = {
            "family_id_1": family_id,
            "family_id_2": body.family_id,
            "initiated_by": user["id"],
            "status": "pending",
        }

        connection_res = supabase.table("family_connections").insert(connection_data).execute()

        return {"success": True, "connection": connection_res.data[0] if connection_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating connection: {str(e)}")

@router.post("/connections/{connection_id}/accept")
async def accept_connection(
    connection_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Accept a family connection request"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Update connection status
        update_res = supabase.table("family_connections").update({"status": "accepted"}).eq("id", connection_id).or_(f"family_id_1.eq.{family_id},family_id_2.eq.{family_id}").execute()

        return {"success": True, "connection": update_res.data[0] if update_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error accepting connection: {str(e)}")

# ============================================================
# Marketplace Routes
# ============================================================

@router.post("/marketplace/listings")
async def create_marketplace_listing(
    body: CreateMarketplaceListingInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Create a marketplace listing"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        listing_data = {
            "resource_type": body.resource_type,
            "resource_id": body.resource_id,
            "listed_by": user["id"],
            "family_id": family_id,
            "title": body.title,
            "description": body.description,
            "price_cents": body.price_cents,
            "tags": body.tags,
            "category": body.category,
            "status": "active",
        }

        listing_res = supabase.table("marketplace_listings").insert(listing_data).execute()

        return {"success": True, "listing": listing_res.data[0] if listing_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating listing: {str(e)}")

@router.get("/marketplace/listings")
async def list_marketplace_listings(
    resource_type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    min_price: Optional[int] = Query(None),
    max_price: Optional[int] = Query(None),
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """List marketplace listings"""
    try:
        supabase = get_admin_client()

        query = supabase.table("marketplace_listings").select("*").eq("status", "active")

        if resource_type:
            query = query.eq("resource_type", resource_type)

        if category:
            query = query.eq("category", category)

        if q:
            query = query.or_(f"title.ilike.%{q}%,description.ilike.%{q}%")

        if min_price is not None:
            query = query.gte("price_cents", min_price)

        if max_price is not None:
            query = query.lte("price_cents", max_price)

        listings_res = query.order("created_at", desc=True).execute()

        return {"success": True, "listings": listings_res.data or []}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing marketplace: {str(e)}")

@router.post("/marketplace/listings/{listing_id}/purchase")
async def purchase_listing(
    listing_id: str,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Purchase a marketplace listing"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")

        supabase = get_admin_client()

        # Get listing
        listing_res = supabase.table("marketplace_listings").select("*").eq("id", listing_id).single().execute()
        if not listing_res.data:
            raise HTTPException(status_code=404, detail="Listing not found")

        listing = listing_res.data[0]

        # Check if already purchased
        existing_res = supabase.table("marketplace_purchases").select("*").eq("listing_id", listing_id).eq("purchased_by", user["id"]).execute()
        if existing_res.data:
            return {"success": True, "message": "Already purchased", "purchase": existing_res.data[0]}

        # Create purchase record
        purchase_data = {
            "listing_id": listing_id,
            "purchased_by": user["id"],
            "family_id": family_id,
            "price_paid_cents": listing["price_cents"],
        }

        purchase_res = supabase.table("marketplace_purchases").insert(purchase_data).execute()

        return {"success": True, "purchase": purchase_res.data[0] if purchase_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error purchasing listing: {str(e)}")

@router.post("/marketplace/listings/{listing_id}/reviews")
async def create_review(
    listing_id: str,
    body: CreateReviewInput,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter)
):
    """Create a review for a marketplace listing"""
    try:
        supabase = get_admin_client()

        # Check if already reviewed
        existing_res = supabase.table("marketplace_reviews").select("*").eq("listing_id", listing_id).eq("reviewed_by", user["id"]).execute()
        if existing_res.data:
            # Update existing review
            review_res = supabase.table("marketplace_reviews").update({
                "rating": body.rating,
                "review_text": body.review_text,
            }).eq("id", existing_res.data[0]["id"]).execute()
        else:
            # Create new review
            review_data = {
                "listing_id": listing_id,
                "reviewed_by": user["id"],
                "rating": body.rating,
                "review_text": body.review_text,
            }
            review_res = supabase.table("marketplace_reviews").insert(review_data).execute()

        return {"success": True, "review": review_res.data[0] if review_res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating review: {str(e)}")

