import os
import requests
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple

from supabase_client import get_admin_client
from logger import log_event

TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo"
CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3/calendars"
DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.events.readonly",
]


def _get_google_config() -> Tuple[str, str, str]:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
    if not client_id or not client_secret:
        raise RuntimeError("Missing Google OAuth env vars")
    if not redirect_uri:
        redirect_uri = "http://localhost:8000/api/google/calendar/oauth/callback"
    return client_id, client_secret, redirect_uri


def get_credential(user_id: str, family_id: str) -> Optional[Dict[str, Any]]:
    supabase = get_admin_client()
    resp = (
        supabase
        .table("google_calendar_credentials")
        .select("id, user_id, family_id, account_email, access_token, refresh_token, scope, expires_at, sync_token, last_synced_at")
        .eq("user_id", user_id)
        .eq("family_id", family_id)
        .maybe_single()
        .execute()
    )
    data = getattr(resp, "data", None)
    if not data:
        return None
    return data


def upsert_credential(user_id: str, family_id: str, values: Dict[str, Any]) -> Dict[str, Any]:
    supabase = get_admin_client()
    payload = {
        "user_id": user_id,
        "family_id": family_id,
        **values,
    }
    resp = (
        supabase
        .table("google_calendar_credentials")
        .upsert(payload, on_conflict="user_id,family_id")
        .execute()
    )
    data = getattr(resp, "data", None)
    if not data:
        raise RuntimeError("Failed to persist Google credential")
    return data[0]


def _parse_expires_at(expires_at: Optional[str]) -> Optional[datetime]:
    if not expires_at:
        return None
    try:
        return datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError:
        return None


def ensure_access_token(credential: Dict[str, Any]) -> Dict[str, Any]:
    expires_at = _parse_expires_at(credential.get("expires_at"))
    now = datetime.now(timezone.utc)
    if expires_at and expires_at - timedelta(minutes=2) > now:
        return credential

    refresh_token = credential.get("refresh_token")
    if not refresh_token:
        raise RuntimeError("Missing refresh token; re-authentication required")

    client_id, client_secret, redirect_uri = _get_google_config()
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }
    resp = requests.post(TOKEN_URL, data=data, timeout=20)
    if resp.status_code != 200:
        log_event("google.token.refresh_failed", status=resp.status_code, body=resp.text)
        raise RuntimeError("Failed to refresh Google token")

    payload = resp.json()
    access_token = payload.get("access_token")
    expires_in = payload.get("expires_in", 3600)
    new_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

    updated = upsert_credential(
        credential["user_id"],
        credential["family_id"],
        {
            "access_token": access_token,
            "expires_at": new_expires_at.isoformat(),
            "refresh_token": refresh_token,
            "account_email": credential.get("account_email"),
            "scope": credential.get("scope"),
            "sync_token": credential.get("sync_token"),
        },
    )
    log_event("google.token.refresh_success", expires_at=updated.get("expires_at"))
    return updated


def fetch_account_email(access_token: str) -> Optional[str]:
    try:
        resp = requests.get(
            USERINFO_URL,
            params={"alt": "json"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("email")
    except Exception as exc:  # noqa: BLE001
        log_event("google.userinfo.error", error=str(exc))
    return None


def _build_event_payload(event: Dict[str, Any], timezone_name: str) -> Dict[str, Any]:
    summary = event.get("title") or "Untitled"
    description = event.get("description") or event.get("notes") or ""
    start_ts = event.get("start_ts")
    end_ts = event.get("end_ts")
    if not start_ts or not end_ts:
        raise RuntimeError("Event missing start/end timestamps")

    attendees = []
    if event.get("attendees"):
        attendees = [{"email": email} for email in event["attendees"] if email]

    return {
        "summary": summary,
        "description": description,
        "start": {
            "dateTime": start_ts,
            "timeZone": timezone_name,
        },
        "end": {
            "dateTime": end_ts,
            "timeZone": timezone_name,
        },
        "attendees": attendees,
    }


def _get_family_timezone(family_id: str) -> str:
    supabase = get_admin_client()
    resp = (
        supabase
        .table("family")
        .select("timezone")
        .eq("id", family_id)
        .maybe_single()
        .execute()
    )
    data = getattr(resp, "data", None)
    tz = data.get("timezone") if data else None
    return tz or "UTC"


def push_event_to_google(credential: Dict[str, Any], event: Dict[str, Any]) -> Dict[str, Any]:
    credential = ensure_access_token(credential)
    timezone_name = _get_family_timezone(credential["family_id"])
    payload = _build_event_payload(event, timezone_name)

    supabase = get_admin_client()
    link_resp = (
        supabase
        .table("google_calendar_event_links")
        .select("id, google_event_id")
        .eq("event_id", event["id"])
        .eq("credential_id", credential["id"])
        .maybe_single()
        .execute()
    )
    link_data = getattr(link_resp, "data", None)
    existing_link = link_data if link_data else None

    headers = {
        "Authorization": f"Bearer {credential['access_token']}",
        "Content-Type": "application/json",
    }

    calendar_id = "primary"
    if existing_link:
        google_event_id = existing_link["google_event_id"]
        resp = requests.patch(
            f"{CALENDAR_BASE_URL}/{calendar_id}/events/{google_event_id}",
            headers=headers,
            json=payload,
            timeout=20,
        )
        action = "updated"
    else:
        resp = requests.post(
            f"{CALENDAR_BASE_URL}/{calendar_id}/events",
            headers=headers,
            json=payload,
            timeout=20,
        )
        action = "created"

    if resp.status_code not in (200, 201):
        log_event(
            "google.calendar.push_failed",
            status=resp.status_code,
            body=resp.text,
            event_id=event["id"],
        )
        raise RuntimeError("Failed to push event to Google Calendar")

    data = resp.json()
    google_event_id = data.get("id")
    if not google_event_id:
        raise RuntimeError("Google response missing event id")

    link_payload = {
        "event_id": event["id"],
        "credential_id": credential["id"],
        "google_event_id": google_event_id,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("google_calendar_event_links").upsert(link_payload, on_conflict="event_id,credential_id").execute()

    supabase.table("google_calendar_sync_log").insert({
        "credential_id": credential["id"],
        "status": "success",
        "message": f"Event {action}",
        "inserted_events": 1 if action == "created" else 0,
        "updated_events": 1 if action == "updated" else 0,
    }).execute()

    log_event(
        "google.calendar.push_success",
        event_id=event["id"],
        google_event_id=google_event_id,
        action=action,
    )

    return {
        "google_event_id": google_event_id,
        "action": action,
        "htmlLink": data.get("htmlLink"),
    }
