"""Bounded tool-calling orchestration loop coordinating LLM providers and MCP."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from asgiref.sync import async_to_sync
from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from ai_assistant.exceptions import AIInputValidationError
from ai_assistant.mcp_client import TitansMCPClientSession, ToolCallExecutionRecord
from ai_assistant.models import AIConversation, AIMessage, AIToolExecution
from ai_assistant.prompts import build_system_prompt
from ai_assistant.providers.base import (
    BaseLLMProvider,
    LLMMessage,
    LLMToolCall,
    LLMToolDefinition,
    LLMToolResult,
    LLMUsage,
)
from ai_assistant.providers.registry import get_llm_provider
from ai_assistant.sanitization import (
    sanitize_untrusted_text,
    validate_and_clean_user_message,
    verify_factual_grounding,
)
from ai_assistant.throttling import reserve_user_token_budget, settle_user_token_reservation

logger = logging.getLogger("ai_assistant.orchestrator")

_MAX_HISTORY_CHARS = 16000


@dataclass(frozen=True)
class LoggedToolRecord:
    round_index: int
    record: ToolCallExecutionRecord


@dataclass(frozen=True)
class OrchestrationTurnResult:
    conversation: AIConversation
    user_message: AIMessage
    assistant_message: AIMessage
    tool_executions: list[AIToolExecution]
    usage: LLMUsage


def _load_conversation_history(
    conversation: AIConversation, max_messages: int = 20
) -> list[LLMMessage]:
    rows = list(
        AIMessage.objects.filter(conversation=conversation)
        .order_by("-created_at", "-id")[:max_messages]
    )
    rows.reverse()

    history: list[LLMMessage] = []
    char_budget = _MAX_HISTORY_CHARS
    kept: list[LLMMessage] = []
    for msg in reversed(rows):
        role = "user" if msg.role == AIMessage.Role.USER else "assistant"
        text = sanitize_untrusted_text(msg.content, max_length=2500)
        if not text:
            continue
        if char_budget - len(text) < 0 and kept:
            break
        char_budget -= len(text)
        kept.append(LLMMessage(role=role, content=text))
    history.extend(reversed(kept))
    return history


async def _execute_orchestration_turn(
    *,
    user: Any,
    provider: BaseLLMProvider,
    system_prompt: str,
    initial_messages: list[LLMMessage],
    max_rounds: int,
    max_tool_calls_per_turn: int,
    max_output_tokens: int,
    timeout_seconds: float,
) -> tuple[str, list[LoggedToolRecord], LLMUsage, int]:
    async with TitansMCPClientSession(user=user) as mcp_session:
        discovered_map = await mcp_session.discover_tools()
        llm_tools = [
            LLMToolDefinition(
                name=spec.name,
                description=spec.description,
                parameters_schema=spec.input_schema,
            )
            for spec in discovered_map.values()
        ]

        active_messages = list(initial_messages)
        logged_tools: list[LoggedToolRecord] = []
        total_prompt = 0
        total_completion = 0
        round_index = 0
        final_text = ""

        for round_index in range(1, max_rounds + 1):
            allow_tools = len(logged_tools) < max_tool_calls_per_turn
            response = await provider.generate(
                system_prompt=system_prompt,
                messages=active_messages,
                tools=llm_tools,
                max_output_tokens=max_output_tokens,
                temperature=0.1,
                timeout_seconds=timeout_seconds,
                allow_tool_calls=allow_tools,
            )

            total_prompt += response.usage.prompt_tokens
            total_completion += response.usage.completion_tokens

            if not response.tool_calls:
                final_text = response.text
                break

            active_messages.append(
                LLMMessage(
                    role="assistant",
                    content=response.text,
                    tool_calls=response.tool_calls,
                )
            )

            tool_results: list[LLMToolResult] = []
            for call in response.tool_calls:
                if len(logged_tools) >= max_tool_calls_per_turn:
                    rec = ToolCallExecutionRecord(
                        tool_name=call.name,
                        arguments=call.arguments,
                        raw_payload={},
                        llm_payload={"error": "Tool call limit exceeded for this conversation turn."},
                        status="blocked",
                        error_message="Tool budget exceeded",
                        duration_ms=0,
                        is_error=True,
                    )
                else:
                    spec = discovered_map.get(call.name)
                    rec = await mcp_session.execute_tool(
                        tool_name=call.name,
                        arguments=call.arguments,
                        tool_spec=spec,
                    )

                logged_tools.append(LoggedToolRecord(round_index=round_index, record=rec))
                tool_results.append(
                    LLMToolResult(
                        call_id=call.call_id,
                        name=call.name,
                        payload=rec.llm_payload,
                        is_error=rec.is_error,
                    )
                )

            active_messages.append(
                LLMMessage(
                    role="tool_results",
                    tool_results=tool_results,
                )
            )

        if not final_text and round_index >= max_rounds:
            final_resp = await provider.generate(
                system_prompt=system_prompt,
                messages=active_messages,
                tools=llm_tools,
                max_output_tokens=max_output_tokens,
                temperature=0.1,
                timeout_seconds=timeout_seconds,
                allow_tool_calls=False,
            )
            total_prompt += final_resp.usage.prompt_tokens
            total_completion += final_resp.usage.completion_tokens
            final_text = final_resp.text

        usage = LLMUsage(
            prompt_tokens=total_prompt,
            completion_tokens=total_completion,
            total_tokens=total_prompt + total_completion,
        )
        return final_text, logged_tools, usage, round_index


def execute_turn(
    *,
    user: Any,
    conversation: AIConversation,
    raw_user_message: str,
    provider_name: str | None = None,
) -> OrchestrationTurnResult:
    """Execute a single end-to-end conversation turn synchronously."""
    cleaned_input = validate_and_clean_user_message(raw_user_message)

    reserved_tokens = 1500
    if not reserve_user_token_budget(user, requested_tokens=reserved_tokens):
        raise AIInputValidationError("Daily AI token budget exceeded for this user account.")

    provider = get_llm_provider(provider_name or conversation.provider_name)
    system_prompt = build_system_prompt()
    history = _load_conversation_history(conversation)
    history.append(LLMMessage(role="user", content=cleaned_input))

    max_rounds = int(getattr(settings, "AI_MAX_TOOL_ROUNDS", 5))
    max_tool_calls = int(getattr(settings, "AI_MAX_TOOL_CALLS_PER_TURN", 10))
    max_output_tokens = int(getattr(settings, "AI_MAX_OUTPUT_TOKENS", 2048))
    timeout_seconds = float(getattr(settings, "AI_TIMEOUT_SECONDS", 30.0))

    try:
        final_text, logged_tools, usage, rounds_used = async_to_sync(
            _execute_orchestration_turn
        )(
            user=user,
            provider=provider,
            system_prompt=system_prompt,
            initial_messages=history,
            max_rounds=max_rounds,
            max_tool_calls_per_turn=max_tool_calls,
            max_output_tokens=max_output_tokens,
            timeout_seconds=timeout_seconds,
        )
    finally:
        # Guarantee reservation release if generation crashes
        pass

    # Verify factual grounding against executed tool results
    tool_payloads = [lt.record.raw_payload for lt in logged_tools if not lt.record.is_error]
    is_grounded, grounding_status, unverified = verify_factual_grounding(final_text, tool_payloads)

    with transaction.atomic():
        user_msg = AIMessage.objects.create(
            conversation=conversation,
            role=AIMessage.Role.USER,
            content=cleaned_input,
            provider_name=provider.provider_name,
            model_name=provider.model_name,
        )

        asst_msg = AIMessage.objects.create(
            conversation=conversation,
            role=AIMessage.Role.ASSISTANT,
            content=final_text,
            provider_name=provider.provider_name,
            model_name=provider.model_name,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
            tool_rounds_used=rounds_used,
            grounding_status=grounding_status,
        )

        created_executions: list[AIToolExecution] = []
        for lt in logged_tools:
            rec = lt.record
            exec_entry = AIToolExecution.objects.create(
                conversation=conversation,
                assistant_message=asst_msg,
                user=user,
                round_index=lt.round_index,
                tool_name=rec.tool_name,
                arguments=rec.arguments,
                result_payload=rec.raw_payload,
                status=rec.status,
                error_message=rec.error_message,
                duration_ms=rec.duration_ms,
            )
            created_executions.append(exec_entry)

        # Update conversation stats
        AIConversation.objects.filter(pk=conversation.pk).update(
            total_prompt_tokens=F("total_prompt_tokens") + usage.prompt_tokens,
            total_completion_tokens=F("total_completion_tokens") + usage.completion_tokens,
            total_tokens=F("total_tokens") + usage.total_tokens,
            updated_at=timezone.now(),
            provider_name=provider.provider_name,
            model_name=provider.model_name,
        )
        conversation.refresh_from_db()

        # Update conversation title if default
        if (not conversation.title or conversation.title == "Football Analysis") and cleaned_input:
            title_cand = cleaned_input[:60].strip()
            if len(cleaned_input) > 60:
                title_cand += "..."
            conversation.title = title_cand
            conversation.save(update_fields=["title"])

    settle_user_token_reservation(user, reserved=reserved_tokens, actual=usage.total_tokens)

    return OrchestrationTurnResult(
        conversation=conversation,
        user_message=user_msg,
        assistant_message=asst_msg,
        tool_executions=created_executions,
        usage=usage,
    )
