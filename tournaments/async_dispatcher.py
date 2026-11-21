"""
Asynchronous Background Offloading (Celery & Daemon Async Dispatch) for Ruiru Titans.

Features:
- Sub-30ms HTTP API response times: offloads heavy tasks (audit logging, cache invalidation,
  analytics aggregation, external notifications) out of the request-response cycle.
- Celery + Redis Broker with graceful daemon thread fallback if Celery/Redis is unreachable,
  offline, or in development/cPanel environments.
- Synchronous inline execution during automated test runs ('test' in sys.argv) so test
  assertions never suffer race conditions.
"""

import sys
import logging
import threading
from typing import Callable, Any, Dict
from django.conf import settings

logger = logging.getLogger(__name__)

# Try to import Celery shared_task if celery is installed
try:
    from celery import shared_task
    HAS_CELERY = True
except ImportError:
    HAS_CELERY = False
    def shared_task(func):
        return func


def _run_in_daemon_thread(func: Callable, *args, **kwargs):
    """Executes a callable inside an isolated background daemon thread."""
    def _runner():
        try:
            func(*args, **kwargs)
        except Exception as exc:
            logger.error("Daemon thread task '%s' encountered an error: %s", getattr(func, "__name__", "anonymous"), exc, exc_info=True)

    thread = threading.Thread(target=_runner, name=f"TitansAsync-{getattr(func, '__name__', 'task')}", daemon=True)
    thread.start()
    return thread


def dispatch_task_async(func: Callable, *args, **kwargs) -> Dict[str, Any]:
    """
    Sub-30ms HTTP API Response Times: Shifts slow I/O tasks out of the client request-response cycle.

    Execution Strategy:
    1. Test Suite: Runs inline synchronously when running tests to ensure 100% deterministic assertions.
    2. Celery + Redis: Queues through Celery workers if Celery is installed and broker is reachable.
    3. Daemon Thread Fallback: If Celery or Redis is unreachable in development or cPanel environments,
       it gracefully offloads to daemon threads without blocking the browser.
    """
    task_name = getattr(func, "__name__", str(func))

    # 1. Deterministic test mode
    if "test" in sys.argv or getattr(settings, "TESTING", False):
        try:
            result = func(*args, **kwargs)
            return {"status": "completed_inline", "mode": "inline", "result": result}
        except Exception as exc:
            logger.error("Synchronous test task '%s' failed: %s", task_name, exc)
            return {"status": "error_inline", "mode": "inline", "error": str(exc)}

    # 2. Celery Worker Queue
    if HAS_CELERY and hasattr(func, "delay"):
        try:
            async_res = func.delay(*args, **kwargs)
            return {"status": "dispatched", "mode": "celery", "task_id": async_res.id}
        except Exception as exc:
            logger.warning("Celery dispatch failed for '%s' (%s), falling back to daemon thread.", task_name, exc)

    # 3. Resilient Daemon Thread Fallback
    try:
        thread = _run_in_daemon_thread(func, *args, **kwargs)
        return {"status": "dispatched", "mode": "daemon_thread", "thread_name": thread.name}
    except Exception as exc:
        logger.error("Failed to spawn daemon thread for task '%s': %s", task_name, exc)
        # Last resort inline execution
        try:
            res = func(*args, **kwargs)
            return {"status": "completed_fallback", "mode": "inline_fallback", "result": res}
        except Exception as inner_exc:
            return {"status": "failed", "mode": "failed", "error": str(inner_exc)}
