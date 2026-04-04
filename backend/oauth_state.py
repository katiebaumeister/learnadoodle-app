"""
Signed OAuth state for Google (and similar) flows.

In-memory cache breaks when the API runs multiple workers: /oauth/start may hit
worker A while Google's redirect hits worker B. A signed state embeds user_id and
family_id with an expiry and HMAC so any worker can validate it.
"""
import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict, Optional


def _signing_secret(google_client_secret: str) -> str:
    return os.environ.get("OAUTH_STATE_SECRET") or google_client_secret


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def create_signed_oauth_state(
    *,
    user_id: str,
    family_id: str,
    purpose: str,
    google_client_secret: str,
    ttl_seconds: int = 600,
) -> str:
    secret = _signing_secret(google_client_secret)
    payload = {
        "u": user_id,
        "f": family_id,
        "p": purpose,
        "exp": int(time.time()) + ttl_seconds,
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).digest()
    return f"{_b64url_encode(raw)}.{_b64url_encode(sig)}"


def parse_signed_oauth_state(
    state: str,
    *,
    purpose: str,
    google_client_secret: str,
) -> Optional[Dict[str, Any]]:
    if not state or "." not in state:
        return None
    body_b64, _, sig_b64 = state.rpartition(".")
    if not body_b64 or not sig_b64:
        return None
    secret = _signing_secret(google_client_secret)
    try:
        raw = _b64url_decode(body_b64)
        sig = _b64url_decode(sig_b64)
    except (ValueError, TypeError):
        return None
    expected = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if payload.get("p") != purpose:
        return None
    if int(time.time()) > int(payload.get("exp") or 0):
        return None
    uid = payload.get("u")
    fid = payload.get("f")
    if not isinstance(uid, str) or not isinstance(fid, str):
        return None
    return {"user_id": uid, "family_id": fid}
