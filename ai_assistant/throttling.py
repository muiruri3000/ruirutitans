"""Rate limiting and token budgeting for Ruiru Titans AI Assistant."""

from __future__ import annotations

import logging
import time
from typing import Any
from django.conf import settings
from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle

logger = logging.getLogger("ai_assistant.throttling")


class AIUserRateThrottle(SimpleRateThrottle):
    """Limit AI conversation message calls per authenticated user."""

    scope = "ai_user"

    def get_rate(self):
        return getattr(settings, "THROTTLE_AI_USER_RATE", "30/minute")

    def get_cache_key(self, request, view):
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            # For anonymous demo or testing
            return self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": str(user.pk)}


def reserve_user_token_budget(user: Any, requested_tokens: int = 1000) -> bool:
    """Reserve estimated tokens against user's daily budget."""
    if not user:
        return True
    user_id = getattr(user, "pk", "anon")
    day_bucket = int(time.time() // 86400)
    cache_key = f"ai_token_budget:{user_id}:{day_bucket}"
    daily_limit = int(getattr(settings, "AI_DAILY_TOKEN_LIMIT", 100000))

    try:
        current = cache.get(cache_key, 0)
        if current + requested_tokens > daily_limit:
            logger.warning("Token budget exceeded for user=%s (used=%s, limit=%s)", user_id, current, daily_limit)
            return False
        cache.set(cache_key, current + requested_tokens, timeout=90000)
        return True
    except Exception:
        return True


def settle_user_token_reservation(user: Any, reserved: int, actual: int) -> None:
    """Adjust user token balance after turn completion."""
    if not user:
        return
    user_id = getattr(user, "pk", "anon")
    day_bucket = int(time.time() // 86400)
    cache_key = f"ai_token_budget:{user_id}:{day_bucket}"
    try:
        current = cache.get(cache_key, 0)
        delta = actual - reserved
        new_val = max(0, current + delta)
        cache.set(cache_key, new_val, timeout=90000)
    except Exception:
        pass
