"""Multi-model and cross-provider fallback pool adapter for Ruiru Titans AI."""

from __future__ import annotations

import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass

from ai_assistant.exceptions import (
    AIProviderConfigurationError,
    AIProviderError,
    AIProviderRateLimitError,
)
from ai_assistant.providers.base import (
    BaseLLMProvider,
    LLMMessage,
    LLMResponse,
    LLMToolDefinition,
)

logger = logging.getLogger("ai_assistant.fallback")


@dataclass
class ProviderCandidate:
    """Wraps an LLM provider instance with runtime health and cooldown tracking."""

    provider: BaseLLMProvider
    cooldown_until: float = 0.0
    failure_count: int = 0
    last_error: str = ""

    @property
    def is_cooling_down(self) -> bool:
        return time.monotonic() < self.cooldown_until

    def mark_cooldown(self, seconds: float, error_message: str = "") -> None:
        self.cooldown_until = time.monotonic() + max(1.0, seconds)
        self.failure_count += 1
        self.last_error = error_message

    def reset(self) -> None:
        self.cooldown_until = 0.0
        self.failure_count = 0
        self.last_error = ""


class FallbackPoolProvider(BaseLLMProvider):
    """Orchestrates an ordered pool of LLM provider candidates (Gemini, Claude, Mock).

    When a candidate encounters rate limits or errors, it is temporarily cooled down
    and execution seamlessly transitions to the next available provider candidate.
    """

    def __init__(
        self,
        candidates: Sequence[BaseLLMProvider],
        *,
        rate_limit_cooldown_seconds: float = 60.0,
        transient_error_cooldown_seconds: float = 30.0,
    ) -> None:
        if not candidates:
            raise AIProviderConfigurationError("FallbackPoolProvider requires at least one provider candidate.")
        self.candidates: list[ProviderCandidate] = [ProviderCandidate(provider=p) for p in candidates]
        self.rate_limit_cooldown_seconds = rate_limit_cooldown_seconds
        self.transient_error_cooldown_seconds = transient_error_cooldown_seconds
        self._last_active_candidate: ProviderCandidate = self.candidates[0]

    @property
    def provider_name(self) -> str:
        return self._last_active_candidate.provider.provider_name

    @property
    def model_name(self) -> str:
        return self._last_active_candidate.provider.model_name

    def _select_candidate_order(self) -> list[ProviderCandidate]:
        healthy = [c for c in self.candidates if not c.is_cooling_down]
        if healthy:
            return healthy

        logger.warning(
            "FallbackPoolProvider: all %d candidates are in cooldown. Attempting earliest cooldown expiry.",
            len(self.candidates),
        )
        return sorted(self.candidates, key=lambda c: c.cooldown_until)

    async def generate(
        self,
        *,
        system_prompt: str,
        messages: Sequence[LLMMessage],
        tools: Sequence[LLMToolDefinition],
        max_output_tokens: int,
        temperature: float = 0.1,
        timeout_seconds: float = 25.0,
        allow_tool_calls: bool = True,
    ) -> LLMResponse:
        ordered_candidates = self._select_candidate_order()
        last_exception: Exception | None = None

        for candidate in ordered_candidates:
            self._last_active_candidate = candidate
            try:
                response = await candidate.provider.generate(
                    system_prompt=system_prompt,
                    messages=messages,
                    tools=tools,
                    max_output_tokens=max_output_tokens,
                    temperature=temperature,
                    timeout_seconds=timeout_seconds,
                    allow_tool_calls=allow_tool_calls,
                )
                candidate.reset()
                return response
            except AIProviderRateLimitError as exc:
                logger.warning(
                    "Candidate %s/%s hit rate limit: %s. Cooling down for %.1fs.",
                    candidate.provider.provider_name,
                    candidate.provider.model_name,
                    exc,
                    self.rate_limit_cooldown_seconds,
                )
                candidate.mark_cooldown(self.rate_limit_cooldown_seconds, str(exc))
                last_exception = exc
            except (AIProviderConfigurationError, AIProviderError) as exc:
                logger.warning(
                    "Candidate %s/%s failed: %s. Cooling down for %.1fs.",
                    candidate.provider.provider_name,
                    candidate.provider.model_name,
                    exc,
                    self.transient_error_cooldown_seconds,
                )
                candidate.mark_cooldown(self.transient_error_cooldown_seconds, str(exc))
                last_exception = exc
            except Exception as exc:
                logger.exception(
                    "Candidate %s/%s unexpected error: %s",
                    candidate.provider.provider_name,
                    candidate.provider.model_name,
                    exc,
                )
                candidate.mark_cooldown(self.transient_error_cooldown_seconds, str(exc))
                last_exception = exc

        if last_exception:
            raise last_exception
        raise AIProviderError("All LLM provider candidates failed.")
