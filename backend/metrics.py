import json
import threading
from typing import Dict

_metrics_lock = threading.Lock()
_metrics: Dict[str, float] = {}


def increment_counter(name: str, value: float = 1.0):
    with _metrics_lock:
        _metrics[name] = _metrics.get(name, 0.0) + value


def set_gauge(name: str, value: float):
    with _metrics_lock:
        _metrics[name] = value


def get_metrics() -> Dict[str, float]:
    with _metrics_lock:
        return dict(_metrics)


def reset_metrics():
    with _metrics_lock:
        _metrics.clear()
