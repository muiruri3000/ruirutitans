"""Provider factory resolving configured LLM adapters (Gemini, Claude, Fallback Pool)."""

from __future__ import annotations

from typing import Any
from django.conf import settings

from ai_assistant.exceptions import AIProviderConfigurationError
from ai_assistant.providers.base import BaseLLMProvider
from ai_assistant.providers.claude import ClaudeProvider
from ai_assistant.providers.fallback import FallbackPoolProvider
from ai_assistant.providers.gemini import GeminiProvider


def _build_gemini_candidates() -> list[BaseLLMProvider]:
    api_key = (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    model = (getattr(settings, "GEMINI_MODEL", "gemini-2.0-flash") or "gemini-2.0-flash").strip()
    base_url = getattr(
        settings, "GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
    )
    return [GeminiProvider(api_key=api_key, model_name=model, base_url=base_url)]


def _build_claude_candidates() -> list[BaseLLMProvider]:
    api_key = (
        getattr(settings, "ANTHROPIC_API_KEY", "")
        or getattr(settings, "CLAUDE_API_KEY", "")
        or ""
    ).strip()
    model = (getattr(settings, "CLAUDE_MODEL", "claude-3-5-sonnet-20241022") or "claude-3-5-sonnet-20241022").strip()
    base_url = getattr(settings, "CLAUDE_API_BASE_URL", "https://api.anthropic.com")
    return [ClaudeProvider(api_key=api_key, model_name=model, base_url=base_url)]


def list_available_providers() -> list[dict[str, Any]]:
    """Return available AI model providers for the frontend selector."""
    gemini_key = bool((getattr(settings, "GEMINI_API_KEY", "") or "").strip())
    claude_key = bool(
        (getattr(settings, "ANTHROPIC_API_KEY", "") or getattr(settings, "CLAUDE_API_KEY", "") or "").strip()
    )

    return [
        {
            "id": "pool",
            "name": "Auto Fallback (Gemini + Claude)",
            "description": "Multi-model pool automatically failing over on rate limits or errors.",
            "is_configured": gemini_key or claude_key,
        },
        {
            "id": "claude",
            "name": "Anthropic Claude 3.5 Sonnet",
            "description": "High-intelligence reasoning and precise tool-calling via Claude Messages API.",
            "is_configured": claude_key,
        },
        {
            "id": "gemini",
            "name": "Google Gemini 2.0 Flash",
            "description": "Ultra-fast low-latency sports analysis and real-time query generation.",
            "is_configured": gemini_key,
        },
    ]


def get_llm_provider(provider_name: str | None = None) -> BaseLLMProvider:
    """Instantiate the configured or requested LLM provider adapter."""
    selected = (provider_name or getattr(settings, "AI_PROVIDER", "pool") or "").strip().lower()

    if selected == "gemini":
        candidates = _build_gemini_candidates()
        return candidates[0]

    if selected in ("claude", "anthropic"):
        candidates = _build_claude_candidates()
        return candidates[0]

    if selected in ("pool", "fallback", "auto"):
        candidates: list[BaseLLMProvider] = []
        gemini_candidates = _build_gemini_candidates()
        claude_candidates = _build_claude_candidates()

        # Prioritize providers that have configured API keys
        if gemini_candidates[0].api_key:
            candidates.append(gemini_candidates[0])
        if claude_candidates[0].api_key:
            candidates.append(claude_candidates[0])

        if not candidates:
            # If neither has keys set, include both so clear config error is raised on use
            candidates = [*gemini_candidates, *claude_candidates]

        if len(candidates) == 1:
            return candidates[0]

        rate_limit_cooldown = float(getattr(settings, "AI_RATE_LIMIT_COOLDOWN_SECONDS", 60.0))
        error_cooldown = float(getattr(settings, "AI_ERROR_COOLDOWN_SECONDS", 30.0))
        return FallbackPoolProvider(
            candidates,
            rate_limit_cooldown_seconds=rate_limit_cooldown,
            transient_error_cooldown_seconds=error_cooldown,
        )

    raise AIProviderConfigurationError(f"Unsupported AI provider '{selected}'.")
