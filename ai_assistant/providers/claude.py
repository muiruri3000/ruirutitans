"""Anthropic Claude Messages API adapter supporting cross-AI model integration."""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from typing import Any

import httpx2

from ai_assistant.exceptions import (
    AIProviderConfigurationError,
    AIProviderError,
    AIProviderRateLimitError,
)
from ai_assistant.providers.base import (
    BaseLLMProvider,
    LLMMessage,
    LLMResponse,
    LLMToolCall,
    LLMToolDefinition,
    LLMUsage,
)

logger = logging.getLogger("ai_assistant.claude")


class ClaudeProvider(BaseLLMProvider):
    """Anthropic Claude Messages API provider adapter with function/tool calling."""

    provider_name = "claude"

    def __init__(
        self,
        api_key: str,
        model_name: str = "claude-3-5-sonnet-20241022",
        base_url: str = "https://api.anthropic.com",
    ) -> None:
        self.api_key = (api_key or "").strip()
        self.model_name = (model_name or "claude-3-5-sonnet-20241022").strip()
        self.base_url = (base_url or "https://api.anthropic.com").rstrip("/")

    def _convert_tools(self, tools: Sequence[LLMToolDefinition]) -> list[dict[str, Any]]:
        claude_tools = []
        for t in tools:
            claude_tools.append(
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters_schema,
                }
            )
        return claude_tools

    def _convert_messages(self, messages: Sequence[LLMMessage]) -> list[dict[str, Any]]:
        converted: list[dict[str, Any]] = []

        for msg in messages:
            if msg.role == "user":
                converted.append({
                    "role": "user",
                    "content": msg.content or "...",
                })
            elif msg.role == "assistant":
                blocks: list[dict[str, Any]] = []
                if msg.content:
                    blocks.append({"type": "text", "text": msg.content})
                for call in msg.tool_calls:
                    blocks.append({
                        "type": "tool_use",
                        "id": call.call_id,
                        "name": call.name,
                        "input": call.arguments,
                    })
                converted.append({
                    "role": "assistant",
                    "content": blocks or [{"type": "text", "text": ""}],
                })
            elif msg.role == "tool_results":
                tool_result_blocks: list[dict[str, Any]] = []
                for res in msg.tool_results:
                    tool_result_blocks.append({
                        "type": "tool_result",
                        "tool_use_id": res.call_id,
                        "content": json.dumps(res.payload, default=str),
                        "is_error": res.is_error,
                    })
                converted.append({
                    "role": "user",
                    "content": tool_result_blocks,
                })

        return converted

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
        if not self.api_key:
            raise AIProviderConfigurationError("Anthropic Claude API key is missing or not configured.")

        endpoint = f"{self.base_url}/v1/messages"
        payload: dict[str, Any] = {
            "model": self.model_name,
            "max_tokens": max_output_tokens,
            "temperature": temperature,
            "messages": self._convert_messages(messages),
        }
        if system_prompt:
            payload["system"] = system_prompt

        if allow_tool_calls and tools:
            payload["tools"] = self._convert_tools(tools)

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        try:
            async with httpx2.AsyncClient() as client:
                resp = await client.post(
                    endpoint,
                    json=payload,
                    headers=headers,
                    timeout=timeout_seconds,
                )
        except Exception as exc:
            raise AIProviderError(f"Claude connection failed: {exc}") from exc

        if resp.status_code == 429:
            raise AIProviderRateLimitError("Claude rate limit exceeded (HTTP 429).")
        if resp.status_code in (401, 403):
            raise AIProviderConfigurationError(f"Claude authentication failed (HTTP {resp.status_code}).")
        if resp.status_code >= 400:
            raise AIProviderError(f"Claude error HTTP {resp.status_code}: {resp.text[:300]}")

        data = resp.json()
        if hasattr(data, "__await__"):
            data = await data
        content_blocks = data.get("content", [])
        text_pieces: list[str] = []
        tool_calls: list[LLMToolCall] = []

        for block in content_blocks:
            b_type = block.get("type")
            if b_type == "text":
                text_pieces.append(block.get("text", ""))
            elif b_type == "tool_use":
                tool_calls.append(
                    LLMToolCall(
                        call_id=block.get("id", ""),
                        name=block.get("name", ""),
                        arguments=block.get("input", {}) or {},
                    )
                )

        usage_data = data.get("usage", {})
        prompt_tokens = usage_data.get("input_tokens", 0)
        completion_tokens = usage_data.get("output_tokens", 0)
        usage = LLMUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        )

        return LLMResponse(
            text="\n".join(text_pieces).strip(),
            tool_calls=tool_calls,
            usage=usage,
            finish_reason=data.get("stop_reason", "end_turn"),
            model_name=self.model_name,
            provider_name=self.provider_name,
        )
