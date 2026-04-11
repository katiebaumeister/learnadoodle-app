import os
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

import requests
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user
from oauth_state import create_signed_oauth_state, parse_signed_oauth_state
from logger import log_event
from supabase_client import get_admin_client
from google_calendar_service import (
    get_credential,
    upsert_credential,
    fetch_account_email,
    push_event_to_google,
    ensure_access_token,
    DEFAULT_SCOPES,
)

router = APIRouter(prefix="/api/google/calendar", tags=["google-calendar"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
STATE_TTL_SECONDS = 600
GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"


def _get_google_client() -> tuple[str, str, str]:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    if not redirect_uri:
        redirect_uri = "http://localhost:8000/api/google/calendar/oauth/callback"
    return client_id, client_secret, redirect_uri


def _build_state(user_id: str, family_id: str, google_client_secret: str) -> str:
    return create_signed_oauth_state(
        user_id=user_id,
        family_id=family_id,
        purpose="google_calendar",
        google_client_secret=google_client_secret,
        ttl_seconds=STATE_TTL_SECONDS,
    )


@router.get("/debug/redirect-uri")
async def get_redirect_uri_debug(user=Depends(get_current_user), _: None = Depends(rate_limiter)):
    """Debug endpoint to check what redirect URI is configured"""
    try:
        _, _, redirect_uri = _get_google_client()
        return {
            "redirect_uri": redirect_uri,
            "message": "This is the redirect URI that will be sent to Google. Make sure it matches exactly in Google Cloud Console."
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/status")
async def get_status(user=Depends(get_current_user), _: None = Depends(rate_limiter)):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")

    credential = get_credential(user["id"], family_id)
    if not credential:
        return {"connected": False}

    expires_at = credential.get("expires_at")
    return {
        "connected": True,
        "account_email": credential.get("account_email"),
        "expires_at": expires_at,
        "last_synced_at": credential.get("last_synced_at"),
    }


@router.get("/oauth/start")
async def start_oauth(
    family_id: Optional[str] = Query(default=None),
    user=Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    resolved_family_id = family_id or get_family_id_for_user(user["id"])
    if not resolved_family_id:
        raise HTTPException(status_code=400, detail="Family not found")

    client_id, client_secret, redirect_uri = _get_google_client()
    state = _build_state(user["id"], resolved_family_id, client_secret)

    scope_param = " ".join(DEFAULT_SCOPES)
    query = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope_param,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    url = f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(query)}"
    log_event("google.oauth.start", user_id=user["id"], family_id=resolved_family_id)
    return {"auth_url": url, "state": state}


@router.get("/oauth/callback")
async def oauth_callback(state: str, code: Optional[str] = None, error: Optional[str] = None):
    try:
        client_id, client_secret, redirect_uri = _get_google_client()
        state_value = parse_signed_oauth_state(
            state, purpose="google_calendar", google_client_secret=client_secret
        )
        if not state_value:
            raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

        if error:
            log_event("google.oauth.error", state=state, error=error)
            raise HTTPException(status_code=400, detail=f"Google OAuth error: {error}")

        data = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }

        token_resp = requests.post(TOKEN_URL, data=data, timeout=20)
        if token_resp.status_code != 200:
            log_event("google.oauth.token_failed", status=token_resp.status_code, body=token_resp.text)
            raise HTTPException(status_code=500, detail="Failed to exchange code for tokens")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 3600)

        if not access_token:
            raise HTTPException(status_code=500, detail="Missing access token from Google")

        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        scope = token_data.get("scope")
        scope_list = scope.split(" ") if isinstance(scope, str) else DEFAULT_SCOPES

        email = fetch_account_email(access_token) if access_token else None

        # Preserve existing refresh token if Google did not return a new one
        user_id = state_value["user_id"]
        family_id = state_value["family_id"]
        existing = get_credential(user_id, family_id)
        if existing and not refresh_token:
            refresh_token = existing.get("refresh_token")

        upsert_credential(
            user_id,
            family_id,
            {
                "account_email": email,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_at": expires_at.isoformat(),
                "scope": scope_list,
            },
        )

        log_event("google.oauth.success", user_id=user_id, family_id=family_id)

        success_redirect = os.environ.get("GOOGLE_OAUTH_SUCCESS_REDIRECT")
        if success_redirect:
            return RedirectResponse(url=success_redirect)

        html = """
        <html>
          <head><title>Connected</title></head>
          <body style=\"font-family: sans-serif; text-align: center; margin-top: 80px;\">
            <h1>Google Calendar Connected</h1>
            <p>You can close this window and return to Learnadoodle.</p>
            <script>
              // Notify parent window of successful connection
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_SUCCESS' }, '*');
                // Close window after a short delay
                setTimeout(function() {
                  window.close();
                }, 1500);
              }
            </script>
          </body>
        </html>
        """
        return HTMLResponse(content=html)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log_event("google.oauth.callback.error", error=str(exc))
        raise HTTPException(
            status_code=500,
            detail=f"Google Calendar OAuth callback failed: {str(exc)}"
        ) from exc


@router.delete("/credential")
async def disconnect(user=Depends(get_current_user), _: None = Depends(rate_limiter)):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")

    supabase = get_admin_client()
    log_event("google.disconnect", user_id=user["id"], family_id=family_id)
    supabase.table("google_calendar_credentials").delete().eq("user_id", user["id"]).eq("family_id", family_id).execute()
    return {"disconnected": True}


# Request models


class PushEventRequest(BaseModel):
    event_id: str = Field(..., description="Internal event id to sync")


class SyncRequest(BaseModel):
    start: Optional[str] = Field(None, description="ISO timestamp start (inclusive)")
    end: Optional[str] = Field(None, description="ISO timestamp end (inclusive)")
    limit: int = Field(50, ge=1, le=200)


class PullRequest(BaseModel):
    start: Optional[str] = Field(None, description="ISO timestamp start (inclusive)")
    end: Optional[str] = Field(None, description="ISO timestamp end (inclusive)")
    max_pages: int = Field(5, ge=1, le=20)


def _normalize_google_event_timestamps(event_payload: Dict[str, Any]) -> tuple[str, str, bool]:
    start = event_payload.get("start") or {}
    end = event_payload.get("end") or {}
    start_dt = start.get("dateTime")
    end_dt = end.get("dateTime")
    if start_dt and end_dt:
        return start_dt, end_dt, False
    if start_dt and not end_dt:
        try:
            parsed_start = datetime.fromisoformat(start_dt.replace("Z", "+00:00"))
            parsed_end = parsed_start + timedelta(hours=1)
            return start_dt, parsed_end.isoformat(), False
        except Exception:  # noqa: BLE001
            return start_dt, start_dt, False

    start_date = start.get("date")
    end_date = end.get("date")
    if not start_date:
        raise RuntimeError("Google event missing start date")

    # Google all-day events use end.date as exclusive.
    start_iso = f"{start_date}T00:00:00+00:00"
    if end_date:
        try:
            last_day = datetime.fromisoformat(end_date) - timedelta(days=1)
            end_iso = f"{last_day.date().isoformat()}T23:59:59+00:00"
        except Exception:  # noqa: BLE001
            end_iso = f"{start_date}T23:59:59+00:00"
    else:
        end_iso = f"{start_date}T23:59:59+00:00"
    return start_iso, end_iso, True


@router.post("/push_event")
async def push_event(body: PushEventRequest, user=Depends(get_current_user), _: None = Depends(rate_limiter)):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")

    credential = get_credential(user["id"], family_id)
    if not credential:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    supabase = get_admin_client()
    event_resp = (
        supabase
        .table("events")
        .select("id, family_id, title, description, notes, start_ts, end_ts")
        .eq("id", body.event_id)
        .eq("family_id", family_id)
        .maybe_single()
        .execute()
    )
    event = event_resp.data if event_resp.data else None
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    try:
        result = push_event_to_google(credential, event)
    except Exception as exc:  # noqa: BLE001
        log_event("google.push_event.error", error=str(exc), event_id=body.event_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return result


@router.post("/sync")
async def sync_events(body: SyncRequest, user=Depends(get_current_user), _: None = Depends(rate_limiter)):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")

    credential = get_credential(user["id"], family_id)
    if not credential:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    start_iso = body.start or datetime.now(timezone.utc).isoformat()
    end_iso = body.end or (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    supabase = get_admin_client()
    query = (
        supabase
        .table("events")
        .select("id, family_id, title, description, notes, start_ts, end_ts")
        .eq("family_id", family_id)
        .gte("start_ts", start_iso)
        .lte("start_ts", end_iso)
        .order("start_ts", desc=False)
        .limit(body.limit)
    )
    resp = query.execute()
    events = resp.data or []
    if not events:
        return {"synced": 0, "results": []}

    results: List[dict] = []
    failures = 0
    for event in events:
        try:
            result = push_event_to_google(credential, event)
            results.append({"event_id": event["id"], **result})
        except Exception as exc:  # noqa: BLE001
            failures += 1
            log_event("google.sync.event_failed", event_id=event["id"], error=str(exc))

    supabase.table("google_calendar_sync_log").insert({
        "credential_id": credential["id"],
        "status": "success" if failures == 0 else "error",
        "message": f"Synced {len(events)} events ({failures} failures)",
        "inserted_events": sum(1 for r in results if r.get("action") == "created"),
        "updated_events": sum(1 for r in results if r.get("action") == "updated"),
        "skipped_events": failures,
    }).execute()

    return {"synced": len(results), "failures": failures, "results": results}


@router.post("/pull")
async def pull_events(body: PullRequest, user=Depends(get_current_user), _: None = Depends(rate_limiter)):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")

    credential = get_credential(user["id"], family_id)
    if not credential:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    credential = ensure_access_token(credential)
    access_token = credential.get("access_token")
    if not access_token:
        raise HTTPException(status_code=500, detail="Missing Google access token")

    time_min = body.start or (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    time_max = body.end or (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()

    headers = {"Authorization": f"Bearer {access_token}"}
    page_token = None
    page_count = 0
    imported = 0
    updated = 0
    skipped = 0

    supabase = get_admin_client()
    children_resp = (
        supabase
        .table("child")
        .select("id")
        .eq("family_id", family_id)
        .execute()
    )
    family_child_ids = [
        row.get("id")
        for row in (getattr(children_resp, "data", None) or [])
        if row.get("id")
    ]

    while page_count < body.max_pages:
        params: Dict[str, Any] = {
            "singleEvents": "true",
            "orderBy": "startTime",
            "timeMin": time_min,
            "timeMax": time_max,
            "maxResults": 250,
        }
        if page_token:
            params["pageToken"] = page_token

        resp = requests.get(GOOGLE_EVENTS_URL, headers=headers, params=params, timeout=20)
        if resp.status_code != 200:
            log_event("google.calendar.pull_failed", status=resp.status_code, body=resp.text)
            raise HTTPException(status_code=502, detail="Failed to fetch Google Calendar events")

        payload = resp.json() or {}
        items = payload.get("items") or []
        for item in items:
            if item.get("status") == "cancelled":
                skipped += 1
                continue

            google_event_id = item.get("id")
            if not google_event_id:
                skipped += 1
                continue

            try:
                start_ts, end_ts, is_all_day = _normalize_google_event_timestamps(item)
            except Exception:  # noqa: BLE001
                skipped += 1
                continue

            event_values = {
                "family_id": family_id,
                "child_id": None,
                "child_ids": family_child_ids,
                "title": item.get("summary") or "Google Calendar event",
                "description": item.get("description") or None,
                "start_ts": start_ts,
                "end_ts": end_ts,
                "all_day": is_all_day,
                "status": "scheduled",
                "source": "google",
                "event_type": "Activity",
                "is_placeholder": False,
            }

            link_resp = (
                supabase
                .table("google_calendar_event_links")
                .select("id, event_id")
                .eq("credential_id", credential["id"])
                .eq("google_event_id", google_event_id)
                .maybe_single()
                .execute()
            )
            link_data = getattr(link_resp, "data", None)
            existing_link = link_data if link_data else None

            if existing_link and existing_link.get("event_id"):
                supabase.table("events").update(event_values).eq("id", existing_link["event_id"]).execute()
                updated += 1
            else:
                created_resp = supabase.table("events").insert(event_values).execute()
                created_data = getattr(created_resp, "data", None) or []
                if not created_data:
                    skipped += 1
                    continue
                created_event_id = created_data[0].get("id")
                if not created_event_id:
                    skipped += 1
                    continue
                supabase.table("google_calendar_event_links").upsert({
                    "event_id": created_event_id,
                    "credential_id": credential["id"],
                    "google_event_id": google_event_id,
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                }, on_conflict="event_id,credential_id").execute()
                imported += 1

        page_count += 1
        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    supabase.table("google_calendar_sync_log").insert({
        "credential_id": credential["id"],
        "status": "success",
        "message": f"Pulled Google events (imported={imported}, updated={updated}, skipped={skipped})",
        "inserted_events": imported,
        "updated_events": updated,
        "skipped_events": skipped,
    }).execute()

    return {"imported": imported, "updated": updated, "skipped": skipped}


@router.post("/refresh-token")
async def refresh_token(user=Depends(get_current_user), _: None = Depends(rate_limiter)):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")

    credential = get_credential(user["id"], family_id)
    if not credential:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    try:
        updated = ensure_access_token(credential)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "access_token": updated.get("access_token"),
        "expires_at": updated.get("expires_at"),
    }
