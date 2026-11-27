"""Execution boundary, strict schema enforcement, and scoped sync bridge for MCP tools."""

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping
from typing import Any, TypeVar

from asgiref.sync import sync_to_async
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.context import ServerRequestContext
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.mcpserver.tools.base import Tool
from mcp.server.mcpserver.utilities.func_metadata import ArgModelBase
from mcp.shared.exceptions import MCPError
from mcp_types import INVALID_PARAMS, ToolAnnotations
from pydantic import BaseModel, ConfigDict, ValidationError, create_model

from mcp_server.auth import STAFF_MCP_ROLES, VerifiedActor, verify_actor
from mcp_server.exceptions import (
    MCPAuthenticationError,
    MCPAuthorizationError,
    MCPScopeInjectionError,
)

logger = logging.getLogger("mcp_server")

InputModelT = TypeVar("InputModelT", bound=BaseModel)
OutputModelT = TypeVar("OutputModelT", bound=BaseModel)

READONLY_TOOL_ANNOTATIONS = ToolAnnotations(
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)

FORBIDDEN_SCOPE_ARGUMENTS = frozenset(
    {
        "user",
        "user_id",
        "actor",
        "actor_token",
        "role",
        "roles",
        "is_staff",
        "is_superuser",
    }
)


class StrictArgModelBase(ArgModelBase):
    """Pydantic argument model base rejecting any undeclared tool inputs."""

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")


def find_forbidden_scope_key(value: Any, *, _depth: int = 0) -> str | None:
    """Inspect nested JSON arguments for caller-supplied identity scope keys."""
    if _depth > 8:
        return None
    if isinstance(value, Mapping):
        for raw_key, nested in value.items():
            key_norm = str(raw_key).strip().lower()
            if key_norm in FORBIDDEN_SCOPE_ARGUMENTS:
                return str(raw_key)
            found = find_forbidden_scope_key(nested, _depth=_depth + 1)
            if found is not None:
                return found
    elif isinstance(value, (list, tuple)):
        for item in value:
            found = find_forbidden_scope_key(item, _depth=_depth + 1)
            if found is not None:
                return found
    return None


class StrictToolArgumentMiddleware:
    """MCP low-level middleware blocking forbidden scope overrides in ``tools/call``."""

    async def __call__(
        self,
        ctx: ServerRequestContext[Any, Any],
        call_next: Callable[[ServerRequestContext[Any, Any]], Any],
    ) -> Any:
        if ctx.method == "tools/call" and ctx.params is not None:
            arguments = (
                ctx.params.get("arguments")
                if isinstance(ctx.params, Mapping)
                else getattr(ctx.params, "arguments", None)
            )
            if arguments is not None:
                if not isinstance(arguments, Mapping):
                    raise MCPError(
                        code=INVALID_PARAMS,
                        message="Tool arguments must be a JSON object.",
                    )
                forbidden_key = find_forbidden_scope_key(arguments)
                if forbidden_key is not None:
                    logger.warning(
                        "Rejected forbidden scope argument '%s' on MCP tools/call",
                        forbidden_key,
                    )
                    raise MCPError(
                        code=INVALID_PARAMS,
                        message=(
                            f"Argument '{forbidden_key}' is forbidden; actor "
                            "scope is derived exclusively from the verified token."
                        ),
                    )
        return await call_next(ctx)


def enforce_strict_tool_schema(tool: Tool) -> None:
    """Rebuild a registered tool's argument model with ``extra='forbid'``."""
    old_model = tool.fn_metadata.arg_model
    fields = {
        name: (field.annotation, field)
        for name, field in old_model.model_fields.items()
    }
    strict_model = create_model(
        f"{tool.name}_StrictArgs",
        __base__=StrictArgModelBase,
        **fields,
    )
    tool.fn_metadata.arg_model = strict_model
    tool.parameters = strict_model.model_json_schema(by_alias=True)


async def run_scoped_sync_tool(
    tool_name: str,
    input_model_cls: type[InputModelT],
    raw_arguments: dict[str, Any],
    sync_handler: Callable[[VerifiedActor, InputModelT], OutputModelT],
    *,
    allowed_roles: frozenset[str] = STAFF_MCP_ROLES,
) -> OutputModelT:
    """Validate inputs, resolve verified DB actor, and run sync handler."""
    forbidden_key = find_forbidden_scope_key(raw_arguments)
    if forbidden_key is not None:
        raise ToolError(f"Argument '{forbidden_key}' is forbidden for '{tool_name}'.")

    try:
        validated_input = input_model_cls.model_validate(raw_arguments)
    except ValidationError as exc:
        raise ToolError(f"Invalid parameters for '{tool_name}': {exc}") from exc

    access_token = get_access_token()
    if access_token is None or not getattr(access_token, "token", None):
        logger.warning("Rejected unauthenticated execution attempt for tool=%s", tool_name)
        raise ToolError("Authenticated staff context is required.")

    token_str = str(access_token.token)

    def _run_in_sync_context() -> OutputModelT:
        actor = verify_actor(token_str)
        if actor.role not in allowed_roles:
            raise MCPAuthorizationError(f"Role '{actor.role}' lacks permission for '{tool_name}'.")
        return sync_handler(actor, validated_input)

    try:
        return await sync_to_async(_run_in_sync_context, thread_sensitive=True)()
    except (MCPAuthenticationError, MCPAuthorizationError, MCPScopeInjectionError) as exc:
        logger.warning("Denied MCP tool=%s execution: %s", tool_name, exc)
        raise ToolError(str(exc)) from exc
    except ToolError:
        raise
    except Exception as exc:
        logger.exception("Unhandled error executing MCP tool=%s", tool_name)
        raise ToolError(f"Internal error while executing '{tool_name}': {exc}") from exc
