"""
Supabase client with service role (admin) access
Never expose service role key to the browser
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env file
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

_SUPABASE_URL = os.environ.get("SUPABASE_URL")
_SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def _log(msg: str, **kwargs):
    context = " ".join([f"{k}={v!r}" for k, v in kwargs.items()])
    print(f"[SUPABASE-ADMIN] {msg}{(' ' + context) if context else ''}")

if not _SUPABASE_URL or not _SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError(
        "Missing required environment variables. "
        "Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env file"
    )

def get_admin_client() -> Client:
    """Get Supabase client with service role (bypasses RLS)"""
    key_preview = f"{_SUPABASE_SERVICE_ROLE_KEY[:6]}...{_SUPABASE_SERVICE_ROLE_KEY[-4:]}" if len(_SUPABASE_SERVICE_ROLE_KEY) > 10 else "<too_short>"
    print(f"[SUPABASE-ADMIN] Creating client with URL={_SUPABASE_URL} key_preview={key_preview}")
    _log("create_client.start", url=_SUPABASE_URL, key_preview=key_preview, key_length=len(_SUPABASE_SERVICE_ROLE_KEY))
    client = create_client(_SUPABASE_URL, _SUPABASE_SERVICE_ROLE_KEY)
    # Verify service role key is being used (starts with 'eyJ' for JWT or is the service role key)
    if not _SUPABASE_SERVICE_ROLE_KEY.startswith('eyJ') and len(_SUPABASE_SERVICE_ROLE_KEY) < 100:
        print(f"WARNING: Service role key format may be incorrect. Expected JWT token.")
    _log("create_client.success")
    return client

