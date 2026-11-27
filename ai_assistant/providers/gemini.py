"""Google Gemini REST provider adapter using httpx2."""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping, Sequence
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

logger = logging.getLogger("ai_assistant.gemini")

_SAFE_MODEL_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def sanitize_json_schema_for_gemini(schema: Mapping[str, Any]) -> dict[str, Any]:
    """Convert standard JSON Schema to Gemini API compatible schema."""
    node: dict[str, Any] = dict(schema)
    out: dict[str, Any] = {}

    if "anyOf" in node and isinstance(node["anyOf"], list):
        non_null_branches = [
            b for b in node["anyOf"] if isinstance(b, Mapping) and b.get("type") != "null"
        ]
        has_null = any(isinstance(b, Mapping) and b.get("type") == "null" for b in node["anyOf"])
        if non_null_branches:
            merged = sanitize_json_schema_for_gemini(non_null_branches[0])
            if has_null:
                merged["nullable"] = True
            if "description" in node and "description" not in merged:
                merged["description"] = str(node["description"])
            return merged

    raw_type = node.get("type")
    if isinstance(raw_type, list):
        non_null_types = [t for t in raw_type if t != "null"]
        if non_null_types:
            out["type"] = non_null_types[0]
        if "null" in raw_type:
            out["nullable"] = True
    elif isinstance(raw_type, str):
        out["type"] = raw_type

    if "description" in node and node["description"] is not None:
        out["description"] = str(node["description"])

    if "nullable" in node and isinstance(node["nullable"], bool):
        out["nullable"] = node["nullable"]

    for key in ("enum", "minLength", "maxLength", "minimum", "maximum"):
        if key in node and node[key] is not None:
            out[key] = node[key]

    if isinstance(node.get("properties"), Mapping):
        out["properties"] = {
            str(k): sanitize_json_schema_for_gemini(v)
            for k, v in node["properties"].items()
            if isinstance(v, Mapping)
        }
        if "type" not in out:
            out["type"] = "object"

    if isinstance(node.get("required"), (list, tuple)):
        out["required"] = [str(r) for r in node["required"] if isinstance(r, str)]

    if isinstance(node.get("items"), Mapping):
        out["items"] = sanitize_json_schema_for_gemini(node["items"])
        if "type" not in out:
            out["type"] = "array"

    return out


class GeminiProvider(BaseLLMProvider):
    """Google Gemini LLM provider adapter."""

    provider_name = "gemini"

    def __init__(
        self,
        api_key: str,
        model_name: str = "gemini-2.0-flash",
        base_url: str = "https://generativelanguage.googleapis.com/v1beta",
    ) -> None:
        self.api_key = (api_key or "").strip()
        self.model_name = (model_name or "gemini-2.0-flash").strip()
        self.base_url = (base_url or "https://generativelanguage.googleapis.com/v1beta").rstrip("/")

    def _convert_tools(self, tools: Sequence[LLMToolDefinition]) -> list[dict[str, Any]]:
        decls = []
        for t in tools:
            decls.append(
                {
                    "name": t.name,
                    "description": t.description,
                    "parameters": sanitize_json_schema_for_gemini(t.parameters_schema),
                }
            )
        return [{"function_declarations": decls}] if decls else []

    def _convert_messages(self, messages: Sequence[LLMMessage]) -> list[dict[str, Any]]:
        contents: list[dict[str, Any]] = []
        for msg in messages:
            if msg.role == "user":
                contents.append({"role": "user", "parts": [{"text": msg.content}]})
            elif msg.role == "assistant":
                parts: list[dict[str, Any]] = []
                if msg.content:
                    parts.append({"text": msg.content})
                for call in msg.tool_calls:
                    parts.append(
                        {
                            "functionCall": {
                                "name": call.name,
                                "args": call.arguments,
                            }
                        }
                    )
                contents.append({"role": "model", "parts": parts or [{"text": ""}]})
            elif msg.role == "tool_results":
                parts = []
                for res in msg.tool_results:
                    parts.append(
                        {
                            "functionResponse": {
                                "name": res.name,
                                "response": {"name": res.name, "content": res.payload},
                            }
                        }
                    )
                contents.append({"role": "user", "parts": parts})
        return contents

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
            raise AIProviderConfigurationError("Gemini API key is missing or not configured.")

        endpoint = f"{self.base_url}/models/{self.model_name}:generateContent"
        payload: dict[str, Any] = {
            "contents": self._convert_messages(messages),
            "generationConfig": {
                "maxOutputTokens": max_output_tokens,
                "temperature": temperature,
            },
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}

        if allow_tool_calls and tools:
            payload["tools"] = self._convert_tools(tools)
            payload["toolConfig"] = {"functionCallingConfig": {"mode": "AUTO"}}

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
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
            raise AIProviderError(f"Gemini connection failed: {exc}") from exc

        if resp.status_code == 429:
            raise AIProviderRateLimitError("Gemini rate limit exceeded (HTTP 429).")
        if resp.status_code >= 400:
            raise AIProviderError(f"Gemini error HTTP {resp.status_code}: {resp.text[:300]}")

        data = resp.json()
        if hasattr(data, "__await__"):
            data = await data
        candidates = data.get("candidates", [])
        if not candidates:
            return LLMResponse(
                text="",
                finish_reason="empty",
                model_name=self.model_name,
                provider_name=self.provider_name,
            )

        candidate = candidates[0]
        content = candidate.get("content", {})
        parts = content.get("parts", [])

        text_pieces = []
        tool_calls: list[LLMToolCall] = []

        for p in parts:
            if "text" in p and p["text"]:
                text_pieces.append(p["text"])
            if "functionCall" in p:
                fc = p["functionCall"]
                call_id = f"call_{len(tool_calls)+1}"
                tool_calls.append(
                    LLMToolCall(
                        call_id=call_id,
                        name=fc.get("name", ""),
                        arguments=fc.get("args", {}) or {},
                    )
                )

        usage_meta = data.get("usageMetadata", {})
        usage = LLMUsage(
            prompt_tokens=usage_meta.get("promptTokenCount", 0),
            completion_tokens=usage_meta.get("candidatesTokenCount", 0),
            total_tokens=usage_meta.get("totalTokenCount", 0),
        )

        return LLMResponse(
            text="\n".join(text_pieces).strip(),
            tool_calls=tool_calls,
            usage=usage,
            finish_reason=candidate.get("finishReason", "stop"),
            model_name=self.model_name,
            provider_name=self.provider_name,
        )
