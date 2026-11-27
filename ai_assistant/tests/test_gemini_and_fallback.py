"""Unit tests for GeminiProvider and FallbackPoolProvider."""

import asyncio
from unittest.mock import AsyncMock, patch
from django.test import SimpleTestCase

from ai_assistant.exceptions import AIProviderRateLimitError
from ai_assistant.providers.base import (
    BaseLLMProvider,
    LLMMessage,
    LLMResponse,
    LLMUsage,
)
from ai_assistant.providers.fallback import FallbackPoolProvider
from ai_assistant.providers.gemini import GeminiProvider, sanitize_json_schema_for_gemini


class MockFailingProvider(BaseLLMProvider):
    provider_name = "failing_mock"
    model_name = "mock-1"

    async def generate(self, **kwargs):
        raise AIProviderRateLimitError("Mock 429 quota exhausted")


class MockSuccessfulProvider(BaseLLMProvider):
    provider_name = "success_mock"
    model_name = "mock-2"

    async def generate(self, **kwargs):
        return LLMResponse(
            text="Success from fallback candidate",
            tool_calls=[],
            usage=LLMUsage(prompt_tokens=10, completion_tokens=15, total_tokens=25),
            finish_reason="stop",
            model_name=self.model_name,
            provider_name=self.provider_name,
        )


class GeminiAndFallbackTestCase(SimpleTestCase):
    def test_sanitize_json_schema_for_gemini(self):
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Player name"},
                "age": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
            },
            "required": ["name"],
        }
        sanitized = sanitize_json_schema_for_gemini(schema)
        self.assertEqual(sanitized["type"], "object")
        self.assertEqual(sanitized["properties"]["name"]["type"], "string")
        self.assertTrue(sanitized["properties"]["age"].get("nullable"))

    def test_fallback_pool_transitions_on_rate_limit(self):
        failing = MockFailingProvider()
        succeeding = MockSuccessfulProvider()

        pool = FallbackPoolProvider(
            [failing, succeeding],
            rate_limit_cooldown_seconds=10.0,
        )

        resp = asyncio.run(
            pool.generate(
                system_prompt="Test",
                messages=[LLMMessage(role="user", content="Hello")],
                tools=[],
                max_output_tokens=100,
            )
        )
        self.assertEqual(resp.text, "Success from fallback candidate")
        self.assertEqual(resp.provider_name, "success_mock")
        # Ensure the failing candidate is marked in cooldown
        self.assertTrue(pool.candidates[0].is_cooling_down)
        self.assertEqual(pool.candidates[0].failure_count, 1)
