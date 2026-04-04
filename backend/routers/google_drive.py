import os
import urllib.parse
import requests
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from oauth_state import create_signed_oauth_state, parse_signed_oauth_state
from logger import log_event
from supabase_client import get_admin_client
from google_drive_service import (
    DEFAULT_SCOPES,
    fetch_account_email,
    get_credential,
    get_drive_file_content,
    get_drive_file_metadata,
    list_drive_files,
    upsert_credential,
)

router = APIRouter(prefix="/api/google/drive", tags=["google-drive"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
STATE_TTL_SECONDS = 600


def _get_google_client() -> tuple[str, str, str]:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_DRIVE_REDIRECT_URI") or os.environ.get("GOOGLE_REDIRECT_URI")
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    if not redirect_uri:
        redirect_uri = "http://localhost:8000/api/google/drive/oauth/callback"
    return client_id, client_secret, redirect_uri


def _build_state(user_id: str, family_id: str, google_client_secret: str) -> str:
    return create_signed_oauth_state(
        user_id=user_id,
        family_id=family_id,
        purpose="google_drive",
        google_client_secret=google_client_secret,
        ttl_seconds=STATE_TTL_SECONDS,
    )


def _assert_parent_access(user_id: str, family_id: str):
    supabase = get_admin_client()
    try:
        member_check = (
            supabase.table("family_members")
            .select("member_role")
            .eq("family_id", family_id)
            .eq("user_id", user_id)
            .eq("member_role", "parent")
            .limit(1)
            .execute()
        )
        if member_check.data:
            return
    except Exception:
        pass

    try:
        profile_check = supabase.table("profiles").select("role, family_id").eq("id", user_id).single().execute()
        if profile_check.data:
            role = profile_check.data.get("role")
            profile_family_id = profile_check.data.get("family_id")
            if profile_family_id == family_id and (role == "parent" or role is None):
                return
    except Exception:
        pass

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only parents can manage Google Drive imports")


class GoogleDriveFileOut(BaseModel):
    id: str
    name: str
    mime_type: str
    modified_time: Optional[str] = None
    web_view_link: Optional[str] = None
    icon_link: Optional[str] = None
    thumbnail_link: Optional[str] = None
    size: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None


class ImportGoogleDriveFileInput(BaseModel):
    file_id: str
    child_id: Optional[str] = None
    subject_id: Optional[str] = None
    subject_key: Optional[str] = None
    import_mode: str = Field(default="library", description="library or curriculum")


class ImportGoogleDriveFileOut(BaseModel):
    material_id: str
    external_link_id: Optional[str] = None
    provider: str
    title: str
    extracted_text_length: int = 0


@router.get("/status")
async def get_status(user=Depends(get_current_user), _: None = Depends(rate_limiter)):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")
    _assert_parent_access(user["id"], family_id)

    credential = get_credential(user["id"], family_id)
    if not credential:
        return {"connected": False}

    return {
        "connected": True,
        "account_email": credential.get("account_email"),
        "expires_at": credential.get("expires_at"),
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
    _assert_parent_access(user["id"], resolved_family_id)

    client_id, client_secret, redirect_uri = _get_google_client()
    state = _build_state(user["id"], resolved_family_id, client_secret)
    query = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(DEFAULT_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return {"auth_url": f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(query)}", "state": state}


@router.get("/oauth/callback")
async def oauth_callback(state: str, code: Optional[str] = None, error: Optional[str] = None):
    client_id, client_secret, redirect_uri = _get_google_client()
    state_value = parse_signed_oauth_state(
        state, purpose="google_drive", google_client_secret=client_secret
    )
    if not state_value:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    if error:
        log_event("google.drive.oauth.error", state=state, error=error)
        raise HTTPException(status_code=400, detail=f"Google OAuth error: {error}")
    token_resp = requests.post(
        TOKEN_URL,
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    if token_resp.status_code != 200:
        log_event("google.drive.oauth.token_failed", status=token_resp.status_code, body=token_resp.text)
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
    email = fetch_account_email(access_token)

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

    success_redirect = os.environ.get("GOOGLE_OAUTH_SUCCESS_REDIRECT")
    if success_redirect:
        return RedirectResponse(url=success_redirect)

    html = """
    <html>
      <head><title>Connected</title></head>
      <body style=\"font-family: sans-serif; text-align: center; margin-top: 80px;\">
        <h1>Google Drive Connected</h1>
        <p>You can close this window and return to Learnadoodle.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_DRIVE_OAUTH_SUCCESS' }, '*');
            setTimeout(function() { window.close(); }, 1500);
          }
        </script>
      </body>
    </html>
    """
    return HTMLResponse(content=html)


@router.delete("/credential")
async def disconnect(user=Depends(get_current_user), _: None = Depends(rate_limiter)):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")
    _assert_parent_access(user["id"], family_id)

    supabase = get_admin_client()
    supabase.table("google_drive_credentials").delete().eq("user_id", user["id"]).eq("family_id", family_id).execute()
    return {"disconnected": True}


@router.get("/files", response_model=List[GoogleDriveFileOut])
async def get_files(
    page_size: int = Query(default=25, ge=1, le=100),
    user=Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")
    _assert_parent_access(user["id"], family_id)

    credential = get_credential(user["id"], family_id)
    if not credential:
        raise HTTPException(status_code=400, detail="Connect Google Drive first")

    files = list_drive_files(credential, page_size=page_size)
    out = []
    for row in files:
        owners = row.get("owners") or []
        owner = owners[0] if owners else {}
        out.append(
            GoogleDriveFileOut(
                id=row["id"],
                name=row.get("name") or "Untitled",
                mime_type=row.get("mimeType") or "application/octet-stream",
                modified_time=row.get("modifiedTime"),
                web_view_link=row.get("webViewLink"),
                icon_link=row.get("iconLink"),
                thumbnail_link=row.get("thumbnailLink"),
                size=row.get("size"),
                owner_name=owner.get("displayName"),
                owner_email=owner.get("emailAddress"),
            )
        )
    return out


@router.post("/import", response_model=ImportGoogleDriveFileOut)
async def import_file(
    body: ImportGoogleDriveFileInput,
    user=Depends(get_current_user),
    _: None = Depends(rate_limiter),
):
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="Family not found")
    _assert_parent_access(user["id"], family_id)

    if body.child_id and not child_belongs_to_family(body.child_id, family_id):
        raise HTTPException(status_code=404, detail="Child not found")

    credential = get_credential(user["id"], family_id)
    if not credential:
        raise HTTPException(status_code=400, detail="Connect Google Drive first")

    metadata = get_drive_file_metadata(credential, body.file_id)
    mime_type = metadata.get("mimeType") or "application/octet-stream"
    file_payload = get_drive_file_content(credential, body.file_id, mime_type)
    metadata = file_payload["metadata"]
    provider = file_payload["provider"]
    extracted_text = (file_payload.get("extracted_text") or "").strip()
    title = metadata.get("name") or "Imported Google File"
    source_url = metadata.get("webViewLink") or f"https://drive.google.com/file/d/{body.file_id}/view"

    supabase = get_admin_client()
    material_payload: Dict[str, Any] = {
        "family_id": family_id,
        "title": title,
        "type": "other",
        "mime": mime_type,
        "subject_id": body.subject_id,
        "subject_key": body.subject_key,
        "notes": extracted_text or None,
        "url": source_url,
        "provider_url": source_url,
        "provider_name": "Google Docs" if provider == "google_docs" else "Google Drive",
        "created_by": user["id"],
        "tags": [
            "source:google",
            f"provider:{provider}",
            f"import_mode:{body.import_mode}",
        ],
    }
    material_res = supabase.table("materials").insert(material_payload).execute()
    material_rows = getattr(material_res, "data", None) or []
    if not material_rows:
        raise HTTPException(status_code=500, detail="Failed to create imported material")
    material = material_rows[0]

    if body.child_id:
        supabase.table("material_children").upsert(
            {
                "material_id": material["id"],
                "child_id": body.child_id,
                "family_id": family_id,
                "status": "in_use",
            },
            on_conflict="material_id,child_id",
        ).execute()

    external_link_id = None
    try:
        link_res = supabase.table("external_links").insert(
            {
                "family_id": family_id,
                "child_id": body.child_id,
                "subject_id": body.subject_id,
                "provider": provider,
                "link_type": "document",
                "title": title,
                "url": source_url,
                "mime_type": mime_type,
                "metadata": {
                    "google_file_id": body.file_id,
                    "owner_email": credential.get("account_email"),
                    "import_mode": body.import_mode,
                },
            }
        ).execute()
        rows = getattr(link_res, "data", None) or []
        if rows:
            external_link_id = rows[0].get("id")
    except Exception as exc:  # noqa: BLE001
        log_event("google.drive.import.external_link_failed", error=str(exc), file_id=body.file_id)

    log_event("google.drive.import.success", user_id=user["id"], family_id=family_id, file_id=body.file_id, material_id=material["id"])
    return ImportGoogleDriveFileOut(
        material_id=material["id"],
        external_link_id=external_link_id,
        provider=provider,
        title=title,
        extracted_text_length=len(extracted_text),
    )
