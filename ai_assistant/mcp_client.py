"""Internal Streamable HTTP MCP client session with schema validation and audit capture."""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Mapping
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any

import jsonschema
from asgiref.sync import sync_to_async
from mcp.client import Client
from mcp.shared.exceptions import MCPError

from mcp_server.auth import get_mcp_resource_url, mint_actor_token
from mcp_server.context import find_forbidden_scope_key
from mcp_server.server import create_streamable_http_app
from mcp_server.transport import open_mcp_client_for_app
from ai_assistant.sanitization import sanitize_tool_payload, sanitize_untrusted_text

logger = logging.getLogger("ai_assistant.client")


@dataclass(frozen=True)
class MCPToolSpec:
    """Discovered read-only MCP tool descriptor."""

    name: str
    description: str
    input_schema: dict[str, Any]
    read_only: bool


@dataclass(frozen=True)
class ToolCallExecutionRecord:
    """Captured result and audit telemetry for a single LLM tool invocation."""

    tool_name: str
    arguments: dict[str, Any]
    raw_payload: dict[str, Any]
    llm_payload: dict[str, Any]
    status: str
    error_message: str
    duration_ms: int
    is_error: bool


def _extract_result_payload(result: Any) -> tuple[dict[str, Any], str]:
    structured = getattr(result, "structured_content", None)
    if isinstance(structured, Mapping):
        return dict(structured), ""

    content_blocks = getattr(result, "content", None) or []
    text_parts: list[str] = []
    for block in content_blocks:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            text_parts.append(text.strip())
    joined = "\n".join(text_parts)
    if joined:
        try:
            parsed = json.loads(joined)
            if isinstance(parsed, Mapping):
                return dict(parsed), joined
        except ValueError:
            pass
    return {}, joined


class TitansMCPClientSession:
    """Short-lived internal MCP client session bound to one verified staff user."""

    def __init__(self, *, user: Any, resource_url: str | None = None) -> None:
        self.user = user
        self.resource_url = resource_url or get_mcp_resource_url()
        self._stack = AsyncExitStack()
        self._client: Client | None = None

    async def __aenter__(self) -> TitansMCPClientSession:
        token = await sync_to_async(mint_actor_token, thread_sensitive=True)(
            self.user,
            resource_url=self.resource_url,
        )
        _server, app = create_streamable_http_app(
            resource_url=self.resource_url,
            json_response=True,
            stateless_http=True,
        )
        client_cm = open_mcp_client_for_app(
            app,
            actor_token=token,
            resource_url=self.resource_url,
            manage_lifespan=True,
        )
        self._client = await self._stack.enter_async_context(client_cm)
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self._stack.aclose()
        self._client = None

    @property
    def client(self) -> Client:
        if self._client is None:
            raise RuntimeError("MCP client session is not active. Use 'async with session:'.")
        return self._client

    async def discover_tools(self) -> dict[str, MCPToolSpec]:
        """Discover read-only MCP tools exposed on the server."""
        result = await self.client.list_tools()
        tools_map: dict[str, MCPToolSpec] = {}
        for t in result.tools:
            name = getattr(t, "name", "")
            desc = getattr(t, "description", "") or ""
            schema = getattr(t, "inputSchema", {}) or getattr(t, "input_schema", {}) or {}
            annotations = getattr(t, "annotations", None)
            is_readonly = getattr(annotations, "read_only_hint", True) if annotations else True

            tools_map[name] = MCPToolSpec(
                name=name,
                description=desc,
                input_schema=schema,
                read_only=is_readonly,
            )
        return tools_map

    async def execute_tool(
        self,
        *,
        tool_name: str,
        arguments: dict[str, Any],
        tool_spec: MCPToolSpec | None = None,
    ) -> ToolCallExecutionRecord:
        """Execute a tool with client-side JSON Schema validation and audit sanitization."""
        forbidden_key = find_forbidden_scope_key(arguments)
        if forbidden_key is not None:
            return ToolCallExecutionRecord(
                tool_name=tool_name,
                arguments=arguments,
                raw_payload={},
                llm_payload={"error": f"Argument '{forbidden_key}' is forbidden."},
                status="blocked",
                error_message=f"Forbidden argument: {forbidden_key}",
                duration_ms=0,
                is_error=True,
            )

        if tool_spec and tool_spec.input_schema:
            try:
                jsonschema.validate(instance=arguments, schema=tool_spec.input_schema)
            except jsonschema.ValidationError as exc:
                return ToolCallExecutionRecord(
                    tool_name=tool_name,
                    arguments=arguments,
                    raw_payload={},
                    llm_payload={"error": f"Invalid arguments for {tool_name}: {exc.message}"},
                    status="validation_error",
                    error_message=exc.message[:250],
                    duration_ms=0,
                    is_error=True,
                )

        start = time.monotonic()
        try:
            result = await self.client.call_tool(tool_name, arguments)
            duration_ms = int((time.monotonic() - start) * 1000)
            is_error = bool(getattr(result, "isError", False) or getattr(result, "is_error", False))
            payload, raw_text = _extract_result_payload(result)

            if is_error:
                err_msg = payload.get("error") or raw_text or "Tool reported failure"
                return ToolCallExecutionRecord(
                    tool_name=tool_name,
                    arguments=arguments,
                    raw_payload=payload,
                    llm_payload={"error": str(err_msg)},
                    status="tool_error",
                    error_message=str(err_msg)[:250],
                    duration_ms=duration_ms,
                    is_error=True,
                )

            sanitized_payload = sanitize_tool_payload(payload)
            return ToolCallExecutionRecord(
                tool_name=tool_name,
                arguments=arguments,
                raw_payload=payload,
                llm_payload=sanitized_payload,
                status="success",
                error_message="",
                duration_ms=duration_ms,
                is_error=False,
            )

        except Exception as exc:
            duration_ms = int((time.monotonic() - start) * 1000)
            logger.warning("Tool execution error for %s: %s", tool_name, exc)
            return ToolCallExecutionRecord(
                tool_name=tool_name,
                arguments=arguments,
                raw_payload={},
                llm_payload={"error": f"Tool execution failed: {exc}"},
                status="tool_error",
                error_message=str(exc)[:250],
                duration_ms=duration_ms,
                is_error=True,
            )
