"""
Simple TTL cache for API responses
"""
import time
from typing import Any, Optional, Callable
from functools import wraps

# Cache storage: {key: (value, expiry_time)}
_cache: dict[str, tuple[Any, float]] = {}


def get_cache_key(*args, **kwargs) -> str:
    """Generate a cache key from function arguments"""
    key_parts = []
    for arg in args:
        if isinstance(arg, (str, int, float, bool)):
            key_parts.append(str(arg))
        elif arg is None:
            key_parts.append("None")
    for k, v in sorted(kwargs.items()):
        if isinstance(v, (str, int, float, bool)):
            key_parts.append(f"{k}={v}")
        elif v is None:
            key_parts.append(f"{k}=None")
    return ":".join(key_parts)


def cached(ttl_seconds: int = 300, key_func: Optional[Callable] = None):
    """
    Decorator to cache function results with TTL
    
    Args:
        ttl_seconds: Time to live in seconds (default: 5 minutes)
        key_func: Optional function to generate cache key from args/kwargs
    """
    def decorator(func: Callable):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = f"{func.__name__}:{key_func(*args, **kwargs)}"
            else:
                cache_key = f"{func.__name__}:{get_cache_key(*args, **kwargs)}"
            
            # Check cache
            if cache_key in _cache:
                value, expiry = _cache[cache_key]
                if time.time() < expiry:
                    return value
                else:
                    # Expired, remove it
                    del _cache[cache_key]
            
            # Call function and cache result
            result = await func(*args, **kwargs)
            _cache[cache_key] = (result, time.time() + ttl_seconds)
            
            # Clean up expired entries periodically (every 100 calls)
            if len(_cache) > 1000:
                _cleanup_expired()
            
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = f"{func.__name__}:{key_func(*args, **kwargs)}"
            else:
                cache_key = f"{func.__name__}:{get_cache_key(*args, **kwargs)}"
            
            # Check cache
            if cache_key in _cache:
                value, expiry = _cache[cache_key]
                if time.time() < expiry:
                    return value
                else:
                    # Expired, remove it
                    del _cache[cache_key]
            
            # Call function and cache result
            result = func(*args, **kwargs)
            _cache[cache_key] = (result, time.time() + ttl_seconds)
            
            # Clean up expired entries periodically
            if len(_cache) > 1000:
                _cleanup_expired()
            
            return result
        
        # Return appropriate wrapper based on whether function is async
        if hasattr(func, '__code__') and func.__code__.co_flags & 0x80:  # CO_COROUTINE flag
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def _cleanup_expired():
    """Remove expired cache entries"""
    now = time.time()
    expired_keys = [k for k, (_, expiry) in _cache.items() if now >= expiry]
    for key in expired_keys:
        del _cache[key]


def clear_cache(pattern: Optional[str] = None):
    """Clear cache entries matching pattern (or all if None)"""
    if pattern is None:
        _cache.clear()
    else:
        keys_to_remove = [k for k in _cache.keys() if pattern in k]
        for key in keys_to_remove:
            del _cache[key]


def get_cache_stats() -> dict:
    """Get cache statistics"""
    now = time.time()
    active = sum(1 for _, expiry in _cache.values() if now < expiry)
    expired = len(_cache) - active
    return {
        "total_entries": len(_cache),
        "active_entries": active,
        "expired_entries": expired,
    }


# Backward compatibility functions for external_routes.py
def get_cached(key: str) -> Optional[Any]:
    """Get a cached value by key (backward compatibility)"""
    if key in _cache:
        value, expiry = _cache[key]
        if time.time() < expiry:
            return value
        else:
            # Expired, remove it
            del _cache[key]
    return None


def set_cached(key: str, value: Any, ttl_seconds: int = 300):
    """Set a cached value by key (backward compatibility)"""
    _cache[key] = (value, time.time() + ttl_seconds)
    
    # Clean up expired entries periodically
    if len(_cache) > 1000:
        _cleanup_expired()
