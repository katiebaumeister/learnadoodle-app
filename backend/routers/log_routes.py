"""
Logging routes for planner instrumentation
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user
from planner_logging.planner_instrumentation import log_action

router = APIRouter(prefix="/api/log", tags=["logging"])


class PlannerActionPayload(BaseModel):
    family_id: str = Field(..., description="Family ID")
    user_id: str = Field(..., description="User ID")
    action_type: str = Field(..., description="Action type (drag_drop, add_event, etc.)")
    child_id: Optional[str] = Field(None, description="Child ID (optional)")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


@router.post("/planner_action")
async def log_planner_action(
    payload: PlannerActionPayload,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Log a user action in the planner UI
    
    This endpoint is called by the frontend to track user interactions
    such as drag-drop events, adding/deleting events, etc.
    """
    try:
        # Verify user matches the payload
        if payload.user_id != user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User ID mismatch"
            )
        
        # Verify family_id belongs to user
        user_family_id = get_family_id_for_user(user["id"])
        if not user_family_id or user_family_id != payload.family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family ID mismatch"
            )
        
        # Log the action
        action_id = log_action(
            family_id=payload.family_id,
            user_id=payload.user_id,
            action_type=payload.action_type,
            child_id=payload.child_id,
            metadata=payload.metadata
        )
        
        if action_id:
            return {"status": "ok", "action_id": action_id}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to log action"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log planner action: {str(e)}"
        )

