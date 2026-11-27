"""Abstract provider-agnostic LLM interface and message/tool contracts."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass(frozen=True)
class LLMToolDefinition:
    """Provider-neutral representation of a discovered MCP tool."""

    name: str
    description: str
    parameters_schema: dict[str, Any]


@dataclass(frozen=True)
class LLMToolCall:
    """Normalized tool invocation emitted by an LLM provider."""

    call_id: str
    name: str
    arguments: dict[str, Any]
    provider_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LLMToolResult:
    """Normalized tool execution result returned back to the LLM."""

    call_id: str
    name: str
    payload: dict[str, Any]
    is_error: bool = False


@dataclass(frozen=True)
class LLMMessage:
    """Normalized turn item in an orchestration conversation history."""

    role: Literal["user", "assistant", "tool_results"]
    content: str = ""
    tool_calls: list[LLMToolCall] = field(default_factory=list)
    tool_results: list[LLMToolResult] = field(default_factory=list)


@dataclass(frozen=True)
class LLMUsage:
    """Token accounting reported by an LLM provider."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True)
class LLMResponse:
    """Normalized response from a single LLM generation call."""

    text: str
    tool_calls: list[LLMToolCall] = field(default_factory=list)
    usage: LLMUsage = field(default_factory=LLMUsage)
    finish_reason: str = ""
    model_name: str = ""
    provider_name: str = ""


class BaseLLMProvider(ABC):
    """Contract implemented by all pluggable Titans AI LLM adapters."""

    provider_name: str
    model_name: str

    @abstractmethod
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
        """Generate assistant text and/or structured tool calls."""
