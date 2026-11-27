"""Internal Ruiru Titans MCPServer initialization and Streamable HTTP ASGI builder."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse, urlunparse

from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer

from mcp_server.auth import (
    READ_SCOPE,
    ActorHeaderNormalizationMiddleware,
    TitansActorTokenVerifier,
    get_mcp_resource_url,
)
from mcp_server.context import StrictToolArgumentMiddleware
from mcp_server.tools import register_readonly_tools


def _derive_issuer_and_host(resource_url: str) -> tuple[str, str, str]:
    parsed = urlparse(resource_url)
    scheme = parsed.scheme or "http"
    netloc = parsed.netloc or "127.0.0.1:8000"
    path = parsed.path or "/api/mcp/"
    issuer_url = urlunparse((scheme, netloc, "", "", "", ""))
    return issuer_url, netloc, path


def create_mcp_server(*, resource_url: str | None = None) -> MCPServer:
    """Create and configure the internal Ruiru Titans ``MCPServer`` with read-only tools."""
    resolved_resource = resource_url or get_mcp_resource_url()
    issuer_url, _host, _path = _derive_issuer_and_host(resolved_resource)

    auth_settings = AuthSettings(
        issuer_url=issuer_url,
        resource_server_url=resolved_resource,
        required_scopes=[READ_SCOPE],
        validate_token_resource=True,
    )
    verifier = TitansActorTokenVerifier(resource_url=resolved_resource)

    server = MCPServer(
        name="ruirutitans-mcp",
        title="Ruiru Titans FC MCP Server",
        description=(
            "Internal read-only MCP boundary exposing football categories, "
            "league standings, fixtures, player stats, transfers, and bans."
        ),
        version="1.0.0",
        auth=auth_settings,
        token_verifier=verifier,
        middleware=[StrictToolArgumentMiddleware()],
    )
    register_readonly_tools(server)
    return server


def create_streamable_http_app(
    *,
    resource_url: str | None = None,
    json_response: bool = True,
    stateless_http: bool = True,
) -> tuple[MCPServer, Any]:
    """Build a fresh internal Streamable HTTP ASGI app wrapped with header hardening."""
    resolved_resource = resource_url or get_mcp_resource_url()
    _issuer_url, host_header, path = _derive_issuer_and_host(resolved_resource)

    server = create_mcp_server(resource_url=resolved_resource)
    starlette_app = server.streamable_http_app(
        streamable_http_path=path,
        json_response=json_response,
        stateless_http=stateless_http,
        host=host_header,
    )
    wrapped_app: Any = ActorHeaderNormalizationMiddleware(
        starlette_app,
        resource_url=resolved_resource,
    )
    wrapped_app._mcp_server = server
    wrapped_app._mcp_session_manager = server._lowlevel_server._session_manager
    return server, wrapped_app
