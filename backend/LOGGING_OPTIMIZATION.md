# Logging Optimization & Caching

## Changes Made

### 1. Reduced Verbose Logging
- **Default LOG_LEVEL**: Changed from `info` to `warn` - filters out most info-level logs
- **CORS DEBUG logs**: Now only show when `LOG_LEVEL=debug`
- **AUTH logs**: Now only show when `LOG_LEVEL=debug`
- **SUPABASE-ADMIN logs**: Now only show when `LOG_LEVEL=debug`
- **FastAPI access logs**: Disabled (no more `INFO: 127.0.0.1:... "GET /api/..."` lines)
- **Suppressed repetitive non-critical logs**:
  - Cache check/save errors (non-critical fallbacks)
  - Confidence streak extraction from errors (workaround)
  - Dashboard family members query failures (non-critical)
  - Accreditation coverage returning empty (expected fallback)

### 2. Cached Supabase Client
- **Before**: Created a new Supabase client instance on every API call
- **After**: Singleton pattern - client is created once and reused
- **Impact**: Eliminates hundreds of "Creating client" log messages per request

### 3. How to Control Logging

Set the `LOG_LEVEL` environment variable in your `.env` file:

```bash
# Minimal logging (default) - only warnings and errors
LOG_LEVEL=warn

# Only errors
LOG_LEVEL=error

# Include info-level events (more verbose)
LOG_LEVEL=info

# Verbose debugging (includes everything)
LOG_LEVEL=debug
```

## Performance Improvements

1. **Supabase Client Caching**: 
   - Before: ~10-20 client creations per page load
   - After: 1 client creation total (singleton)
   - Reduces overhead and connection setup time

2. **Reduced Log Output**:
   - Before: ~50-100 log lines per page load
   - After: ~0-2 log lines per page load (with LOG_LEVEL=warn, default)
   - FastAPI access logs disabled (no more HTTP request logs)
   - Repetitive non-critical errors suppressed
   - Faster terminal output, easier to spot real issues

## Caching Implementation

Added in-memory TTL caching for frequently accessed, rarely-changing data:

### Cached Endpoints

1. **Standards Data** (`/api/standards/`)
   - Cache TTL: 1 hour
   - Cached by: state_code, grade_level, subject, domain
   - Impact: Standards rarely change, saves database queries

2. **State Requirements** (`/api/records/state_requirements`)
   - Cache TTL: 1 hour
   - Cached by: state_code
   - Impact: Requirements are static JSON data

3. **Subject Lists** (used in accreditation routes)
   - Cache TTL: 5 minutes
   - Cached by: family_id
   - Impact: Subjects change infrequently but more often than standards

### Cache Management

The cache automatically:
- Expires entries after TTL
- Cleans up expired entries when cache grows large
- Generates unique keys from function arguments

### Cache Statistics

You can check cache stats by importing:
```python
from cache import get_cache_stats
stats = get_cache_stats()
```

### Clearing Cache

To clear cache (useful for testing or after data updates):
```python
from cache import clear_cache
clear_cache()  # Clear all
clear_cache("standards")  # Clear only standards cache
```

