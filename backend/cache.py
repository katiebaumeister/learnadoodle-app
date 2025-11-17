import time
import threading
from typing import Any, Dict, Tuple

_cache_lock = threading.Lock()
_cache: Dict[str, Tuple[float, Any]] = {}


def get_cached(key: str):
    with _cache_lock:
        entry = _cache.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at < time.time():
            _cache.pop(key, None)
            return None
        return value


def set_cached(key: str, value: Any, ttl_seconds: float):
    with _cache_lock:
        _cache[key] = (time.time() + ttl_seconds, value)
