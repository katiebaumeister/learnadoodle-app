import os
import json
import time

LOG_LEVEL = os.environ.get("LOG_LEVEL", "info").lower()
_LEVELS = ["debug", "info", "warn", "error"]


def _should_log(level: str) -> bool:
    try:
        return _LEVELS.index(level) >= _LEVELS.index(LOG_LEVEL)
    except ValueError:
        return True


def log_event(event: str, **fields):
    level = fields.pop("level", "info").lower()
    if not _should_log(level):
        return
    payload = {
        "ts": time.time(),
        "event": event,
        "level": level,
        **fields,
    }
    print(json.dumps(payload, ensure_ascii=False))
