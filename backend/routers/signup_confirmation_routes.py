"""
Public endpoints for sign-up flow: record when we sent a confirmation email
and return last sent time so the UI can show "Confirmation sent on [date/time]. Please check your email!"
"""
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from supabase_client import get_admin_client

router = APIRouter(prefix="/api/auth", tags=["auth-signup"])


class SignupConfirmationRecordIn(BaseModel):
    email: str


class SignupConfirmationSentOut(BaseModel):
    sent_at: str | None


@router.get("/signup-confirmation-sent", response_model=SignupConfirmationSentOut)
async def get_signup_confirmation_sent(
    email: str = Query(..., description="Email address to check"),
):
    """Return the most recent time we sent a sign-up confirmation to this email, if any."""
    if not email or not email.strip():
        return SignupConfirmationSentOut(sent_at=None)
    try:
        supabase = get_admin_client()
        res = (
            supabase.table("signup_confirmation_sent")
            .select("sent_at")
            .eq("email", email.strip().lower())
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data and len(res.data) > 0:
            return SignupConfirmationSentOut(sent_at=res.data[0]["sent_at"])
        return SignupConfirmationSentOut(sent_at=None)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check confirmation status",
        ) from e


@router.post("/signup-confirmation-sent")
async def record_signup_confirmation_sent(body: SignupConfirmationRecordIn):
    """Record that we sent a sign-up confirmation email to this address (called after successful signUp)."""
    if not body.email or not body.email.strip():
        return {"ok": True}
    try:
        supabase = get_admin_client()
        supabase.table("signup_confirmation_sent").insert({
            "email": body.email.strip().lower(),
        }).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record confirmation sent",
        ) from e
