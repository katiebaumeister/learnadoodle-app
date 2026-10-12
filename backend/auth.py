import os
import time
import threading
from typing import Optional
from fastapi import Depends, HTTPException, status, Request

from supabase_client import get_admin_client

_LOG_LEVEL = os.environ.get("LOG_LEVEL", "info").lower()

_rate_lock = threading.Lock()
_rate_hits = {}
_RATE_LIMIT_WINDOW = 60  # seconds
_RATE_LIMIT_MAX = 60  # requests per window

_RATE_LIMIT_RELAXED_MAX = 300  # higher ceiling for read-heavy GET endpoints
# Tight ceiling for LLM / AI spend paths (bots + burst abuse).
# Slightly above the original prod 8 so beta testers aren't tripped by normal
# multi-call flows; still far below a bot scrape.
_IS_DEV = os.environ.get("ENVIRONMENT", "development").strip().lower() in (
    "development",
    "dev",
    "local",
)
_AI_RATE_LIMIT_MAX = int(
    os.environ.get("AI_RATE_LIMIT_MAX", "30" if _IS_DEV else "15")
)


def _rate_limit_key(request: Request) -> str:
    client_ip = request.client.host if request.client else "unknown"
    route = request.url.path
    return f"{client_ip}:{route}"


def _check_rate_key(key: str, max_hits: int):
    now = time.time()
    with _rate_lock:
        hits, window_start = _rate_hits.get(key, (0, now))
        if now - window_start > _RATE_LIMIT_WINDOW:
            hits = 0
            window_start = now
        hits += 1
        _rate_hits[key] = (hits, window_start)
        if hits > max_hits:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests")


def _check_rate(request: Request, max_hits: int):
    _check_rate_key(_rate_limit_key(request), max_hits)


def rate_limiter(request: Request):
    _check_rate(request, _RATE_LIMIT_MAX)


def rate_limiter_relaxed(request: Request):
    """Higher ceiling for read-only GET endpoints that the frontend polls frequently."""
    _check_rate(request, _RATE_LIMIT_RELAXED_MAX)


def ai_rate_limiter(request: Request):
    """Stricter per-IP limit for OpenAI-backed routes."""
    _check_rate(request, _AI_RATE_LIMIT_MAX)


def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization")
    token: Optional[str] = None

    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if _LOG_LEVEL == "debug":
            print(f"[AUTH] Found Bearer token: {token[:20]}...")
    elif "sb-access-token" in request.cookies:
        token = request.cookies.get("sb-access-token")
        if _LOG_LEVEL == "debug":
            print(f"[AUTH] Found cookie token")
    else:
        if _LOG_LEVEL == "debug":
            print(f"[AUTH] No Authorization header found. Headers: {list(request.headers.keys())}")

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token")

    supabase = get_admin_client()
    try:
        resp = supabase.auth.get_user(token)
        if not resp or not resp.user:
            if _LOG_LEVEL == "debug":
                print(f"[AUTH] Invalid token response")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")
    except Exception as exc:
        if _LOG_LEVEL == "debug":
            print(f"[AUTH] Token validation error: {type(exc).__name__}: {str(exc)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token") from exc

    user = resp.user
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if _LOG_LEVEL == "debug":
        print(f"[AUTH] Authenticated user: {user.email}")
    return {"id": user.id, "email": user.email}


def ai_user_rate_limiter(request: Request, user: dict = Depends(get_current_user)):
    """
    Stricter per-user + per-IP limit for OpenAI-backed routes.
    Requires auth (depends on get_current_user).
    """
    user_id = (user or {}).get("id") or "unknown"
    route = request.url.path
    _check_rate_key(f"user:{user_id}:{route}", _AI_RATE_LIMIT_MAX)
    _check_rate(request, _AI_RATE_LIMIT_MAX)
    return None
