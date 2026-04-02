import io
import os
import requests
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple, List

from supabase_client import get_admin_client
from logger import log_event

TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo"
DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"

DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/documents.readonly",
]


def _get_google_drive_config() -> Tuple[str, str, str]:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_DRIVE_REDIRECT_URI") or os.environ.get("GOOGLE_REDIRECT_URI")
    if not client_id or not client_secret:
        raise RuntimeError("Missing Google OAuth env vars")
    if not redirect_uri:
        redirect_uri = "http://localhost:8000/api/google/drive/oauth/callback"
    return client_id, client_secret, redirect_uri


def get_credential(user_id: str, family_id: str) -> Optional[Dict[str, Any]]:
    supabase = get_admin_client()
    resp = (
        supabase
        .table("google_drive_credentials")
        .select("id, user_id, family_id, account_email, access_token, refresh_token, scope, expires_at, created_at, updated_at")
        .eq("user_id", user_id)
        .eq("family_id", family_id)
        .maybe_single()
        .execute()
    )
    data = getattr(resp, "data", None)
    return data or None


def upsert_credential(user_id: str, family_id: str, values: Dict[str, Any]) -> Dict[str, Any]:
    supabase = get_admin_client()
    payload = {
        "user_id": user_id,
        "family_id": family_id,
        **values,
    }
    resp = (
        supabase
        .table("google_drive_credentials")
        .upsert(payload, on_conflict="user_id,family_id")
        .execute()
    )
    data = getattr(resp, "data", None)
    if not data:
        raise RuntimeError("Failed to persist Google Drive credential")
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

    client_id, client_secret, _redirect_uri = _get_google_drive_config()
    resp = requests.post(
        TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        timeout=20,
    )
    if resp.status_code != 200:
        log_event("google.drive.token.refresh_failed", status=resp.status_code, body=resp.text)
        raise RuntimeError("Failed to refresh Google Drive token")

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
        },
    )
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
        log_event("google.drive.userinfo.error", error=str(exc))
    return None


def _drive_headers(access_token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def list_drive_files(credential: Dict[str, Any], page_size: int = 25) -> List[Dict[str, Any]]:
    credential = ensure_access_token(credential)
    query = (
        "trashed = false and "
        "("
        "mimeType = 'application/vnd.google-apps.document' or "
        "mimeType = 'application/pdf' or "
        "mimeType = 'text/plain'"
        ")"
    )
    resp = requests.get(
        DRIVE_FILES_URL,
        headers=_drive_headers(credential["access_token"]),
        params={
            "q": query,
            "pageSize": page_size,
            "orderBy": "modifiedTime desc",
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
            "fields": "files(id,name,mimeType,webViewLink,iconLink,thumbnailLink,size,modifiedTime,owners(displayName,emailAddress))",
        },
        timeout=20,
    )
    if resp.status_code != 200:
        log_event("google.drive.files.list_failed", status=resp.status_code, body=resp.text)
        raise RuntimeError("Failed to list Google Drive files")
    return resp.json().get("files", [])


def get_drive_file_metadata(credential: Dict[str, Any], file_id: str) -> Dict[str, Any]:
    credential = ensure_access_token(credential)
    resp = requests.get(
        f"{DRIVE_FILES_URL}/{file_id}",
        headers=_drive_headers(credential["access_token"]),
        params={
            "supportsAllDrives": "true",
            "fields": "id,name,mimeType,webViewLink,size,modifiedTime,owners(displayName,emailAddress)",
        },
        timeout=20,
    )
    if resp.status_code != 200:
        log_event("google.drive.file.metadata_failed", file_id=file_id, status=resp.status_code, body=resp.text)
        raise RuntimeError("Failed to read Google Drive file metadata")
    return resp.json()


def _extract_pdf_text_from_bytes(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    text = []
    for page in reader.pages:
        text.append(page.extract_text() or "")
    return "\n".join(text).strip()


def get_drive_file_content(credential: Dict[str, Any], file_id: str, mime_type: str) -> Dict[str, Any]:
    credential = ensure_access_token(credential)
    headers = _drive_headers(credential["access_token"])
    metadata = get_drive_file_metadata(credential, file_id)

    extracted_text = ""
    source_kind = "google_drive"

    if mime_type == "application/vnd.google-apps.document":
        source_kind = "google_docs"
        export_resp = requests.get(
            f"{DRIVE_FILES_URL}/{file_id}/export",
            headers=headers,
            params={"mimeType": "text/plain"},
            timeout=30,
        )
        if export_resp.status_code != 200:
            log_event("google.drive.file.export_failed", file_id=file_id, status=export_resp.status_code, body=export_resp.text)
            raise RuntimeError("Failed to export Google Doc")
        extracted_text = export_resp.text.strip()
    elif mime_type == "application/pdf":
        download_resp = requests.get(
            f"{DRIVE_FILES_URL}/{file_id}",
            headers=headers,
            params={"alt": "media", "supportsAllDrives": "true"},
            timeout=30,
        )
        if download_resp.status_code != 200:
            log_event("google.drive.file.download_failed", file_id=file_id, status=download_resp.status_code, body=download_resp.text)
            raise RuntimeError("Failed to download Google Drive PDF")
        extracted_text = _extract_pdf_text_from_bytes(download_resp.content)
    else:
        download_resp = requests.get(
            f"{DRIVE_FILES_URL}/{file_id}",
            headers=headers,
            params={"alt": "media", "supportsAllDrives": "true"},
            timeout=30,
        )
        if download_resp.status_code != 200:
            log_event("google.drive.file.download_failed", file_id=file_id, status=download_resp.status_code, body=download_resp.text)
            raise RuntimeError("Failed to download Google Drive document")
        extracted_text = download_resp.content.decode("utf-8", errors="ignore").strip()

    return {
        "metadata": metadata,
        "extracted_text": extracted_text,
        "provider": source_kind,
    }
