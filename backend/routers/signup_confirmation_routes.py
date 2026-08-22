"""
Public endpoints for sign-up flow: record when we sent a confirmation email
and return last sent time so the UI can show "Confirmation sent on [date/time]. Please check your email!"
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel

from supabase_client import get_admin_client

router = APIRouter(prefix="/api/auth", tags=["auth-signup"])


class SignupConfirmationRecordIn(BaseModel):
    email: str


class SignupConfirmationSentOut(BaseModel):
    sent_at: str | None
    account_exists: bool = False
    email_confirmed: bool = False


def _parse_auth_user_status(data) -> tuple[bool, bool]:
    """Parse auth_user_status_by_email RPC result into (exists, email_confirmed)."""
    if isinstance(data, dict):
        return bool(data.get("exists")), bool(data.get("email_confirmed"))
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        row = data[0]
        return bool(row.get("exists")), bool(row.get("email_confirmed"))
    return False, False


@router.get("/signup-confirmation-sent", response_model=SignupConfirmationSentOut)
async def get_signup_confirmation_sent(
    email: str = Query(..., description="Email address to check"),
):
    """Return the most recent time we sent a sign-up confirmation to this email, if any.
    If the account was deleted from Auth (no user for this email), return sent_at=None so
    the UI treats it as fresh and allows sending a new confirmation."""
    if not email or not email.strip():
        return SignupConfirmationSentOut(sent_at=None)
    try:
        supabase = get_admin_client()
        # Only show "confirmation sent" if there is still a user in Auth for this email (pending or confirmed).
        # If the user was deleted (e.g. manual delete in Supabase), treat as fresh so they can sign up again.
        user_exists = False
        email_confirmed = False
        try:
            status_res = supabase.rpc("auth_user_status_by_email", {"p_email": email.strip()}).execute()
            user_exists, email_confirmed = _parse_auth_user_status(status_res.data)
        except Exception:
            # Fallback for environments without the newer RPC.
            try:
                exists_res = supabase.rpc("auth_user_exists_by_email", {"p_email": email.strip()}).execute()
                if exists_res.data is True:
                    user_exists = True
                elif isinstance(exists_res.data, list) and len(exists_res.data) > 0:
                    user_exists = exists_res.data[0] is True or exists_res.data[0] == "true"
                elif getattr(exists_res, "data", None) in (True, "true"):
                    user_exists = True
            except Exception:
                user_exists = False
        if not user_exists:
            # Optionally clear stale rows so future requests don't rely on RPC
            try:
                supabase.table("signup_confirmation_sent").delete().eq(
                    "email", email.strip().lower()
                ).execute()
            except Exception:
                pass
            return SignupConfirmationSentOut(sent_at=None)
        if email_confirmed:
            return SignupConfirmationSentOut(
                sent_at=None,
                account_exists=True,
                email_confirmed=True,
            )
        res = (
            supabase.table("signup_confirmation_sent")
            .select("sent_at")
            .eq("email", email.strip().lower())
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
        )
        sent_at = res.data[0]["sent_at"] if res.data and len(res.data) > 0 else None
        return SignupConfirmationSentOut(
            sent_at=sent_at,
            account_exists=True,
            email_confirmed=False,
        )
    except Exception:
        # Table missing, Supabase down, or any other failure: return empty so frontend never sees 500
        return SignupConfirmationSentOut(sent_at=None)


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
    except Exception:
        # Table missing, Supabase down, or any other failure: succeed silently so frontend never sees 500
        return {"ok": True}
