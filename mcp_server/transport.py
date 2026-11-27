"""Internal backend ASGI transport helpers for talking to the Ruiru Titans MCP server."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from contextlib import asynccontextmanager, nullcontext
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx2
from asgiref.sync import sync_to_async
from mcp.client import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.exceptions import MCPError

from mcp_server.auth import get_mcp_resource_url, mint_actor_token
from mcp_server.server import create_streamable_http_app


def _split_base_and_url(resource_url: str) -> tuple[str, str]:
    parsed = urlparse(resource_url)
    scheme = parsed.scheme or "http"
    netloc = parsed.netloc or "127.0.0.1:8000"
    path = parsed.path or "/api/mcp/"
    base_url = urlunparse((scheme, netloc, "", "", "", ""))
    full_url = urlunparse((scheme, netloc, path, "", "", ""))
    return base_url, full_url


@asynccontextmanager
async def mcp_app_lifespan(app: Any) -> AsyncIterator[None]:
    """Enter the single-use Streamable HTTP session manager lifespan for ``app``."""
    session_manager = getattr(app, "_mcp_session_manager", None)
    if session_manager is None:
        yield
        return
    async with session_manager.run():
        yield


@asynccontextmanager
async def open_mcp_client_for_app(
    app: Any,
    *,
    actor_token: str | None = None,
    resource_url: str | None = None,
    extra_headers: Mapping[str, str] | None = None,
    manage_lifespan: bool = True,
) -> AsyncIterator[Client]:
    """Open an authenticated internal MCP ``Client`` over ``httpx2.ASGITransport``."""
    resolved_url = resource_url or get_mcp_resource_url()
    base_url, full_url = _split_base_and_url(resolved_url)

    headers: dict[str, str] = {}
    if actor_token:
        headers["Authorization"] = f"Bearer {actor_token}"
    if extra_headers:
        headers.update(extra_headers)

    lifespan_cm = mcp_app_lifespan(app) if manage_lifespan else nullcontext()
    async with lifespan_cm:
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app),
            base_url=base_url,
            headers=headers,
        ) as http_client:
            transport_cm = streamable_http_client(
                full_url,
                http_client=http_client,
                terminate_on_close=False,
            )
            async with Client(transport_cm) as client:
                yield client


@asynccontextmanager
async def open_internal_mcp_client(
    *,
    actor_token: str,
    resource_url: str | None = None,
    json_response: bool = True,
    extra_headers: Mapping[str, str] | None = None,
) -> AsyncIterator[Client]:
    """Spin up a fresh internal stateless MCP ASGI app and yield an initialized ``Client``."""
    resolved_url = resource_url or get_mcp_resource_url()
    _server, app = create_streamable_http_app(
        resource_url=resolved_url,
        json_response=json_response,
        stateless_http=True,
    )
    async with open_mcp_client_for_app(
        app,
        actor_token=actor_token,
        resource_url=resolved_url,
        extra_headers=extra_headers,
        manage_lifespan=True,
    ) as client:
        yield client


def _unwrap_single_mcp_error(exc: BaseException) -> MCPError | None:
    current: BaseException = exc
    while isinstance(current, BaseExceptionGroup):
        if len(current.exceptions) != 1:
            return None
        current = current.exceptions[0]
    return current if isinstance(current, MCPError) else None


async def _run_with_user_client(
    user: Any,
    fn: Callable[[Client], Awaitable[Any]],
    *,
    resource_url: str | None = None,
) -> Any:
    resolved_url = resource_url or get_mcp_resource_url()
    token = await sync_to_async(mint_actor_token, thread_sensitive=True)(
        user, resource_url=resolved_url
    )
    try:
        async with open_internal_mcp_client(
            actor_token=token,
            resource_url=resolved_url,
        ) as client:
            return await fn(client)
    except BaseExceptionGroup as exc_group:
        unwrapped = _unwrap_single_mcp_error(exc_group)
        if unwrapped is not None:
            raise unwrapped from None
        raise


async def list_mcp_tools_for_user(user: Any, *, resource_url: str | None = None) -> list[Any]:
    """Mint a short-lived actor token for ``user`` and return discovered MCP tools."""
    result = await _run_with_user_client(
        user,
        lambda client: client.list_tools(),
        resource_url=resource_url,
    )
    return list(result.tools)


async def call_mcp_tool_for_user(
    user: Any,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    *,
    resource_url: str | None = None,
) -> Any:
    """Mint an actor token for ``user`` and invoke ``tool_name`` over internal ASGITransport."""
    return await _run_with_user_client(
        user,
        lambda client: client.call_tool(tool_name, arguments or {}),
        resource_url=resource_url,
    )
