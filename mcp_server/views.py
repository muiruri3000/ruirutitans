"""External MCP Gateway View exposing Ruiru Titans MCP tools over Streamable HTTP."""

from __future__ import annotations

import json
import logging
import time
from typing import Any
from urllib.parse import urlparse

import httpx2
from asgiref.sync import async_to_sync
from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from mcp_server.auth import get_mcp_resource_url, mint_actor_token
from mcp_server.models import McpApiKey, McpExternalAuditLog
from mcp_server.server import create_streamable_http_app

logger = logging.getLogger("mcp_server.gateway")

DEFAULT_GATEWAY_RATE_LIMIT = 60  # requests per minute per key

SENSITIVE_ARGUMENT_KEYS = frozenset(
    {"token", "secret", "password", "key", "auth", "credential", "api_key", "actor_token", "jwt"}
)


def _sanitize_audit_arguments(value: Any, *, _depth: int = 0) -> Any:
    """Sanitize and redact sensitive arguments before storing in McpExternalAuditLog."""
    if _depth > 8:
        return "[TRUNCATED_DEPTH]"
    if isinstance(value, dict):
        sanitized = {}
        for k, v in value.items():
            k_lower = str(k).strip().lower()
            if any(s in k_lower for s in SENSITIVE_ARGUMENT_KEYS):
                sanitized[str(k)] = "[REDACTED]"
            else:
                sanitized[str(k)] = _sanitize_audit_arguments(v, _depth=_depth + 1)
        return sanitized
    if isinstance(value, (list, tuple)):
        return [_sanitize_audit_arguments(item, _depth=_depth + 1) for item in value]
    if isinstance(value, str):
        if len(value) > 250:
            return value[:250] + "...[TRUNCATED]"
        return value
    return value


def _extract_api_key(request: HttpRequest) -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    x_api_key = request.headers.get("X-API-Key", "")
    if x_api_key:
        return x_api_key.strip()
    return None


def _check_rate_limit(key_id: str, limit: int = DEFAULT_GATEWAY_RATE_LIMIT) -> bool:
    """Return True if within rate limit, False if exceeded."""
    current_bucket = int(time.time() // 60)
    cache_key = f"mcp_gateway_rate:{key_id}:{current_bucket}"
    try:
        count = cache.get(cache_key, 0)
        if count >= limit:
            return False
        cache.set(cache_key, count + 1, timeout=70)
        return True
    except Exception:
        return True


@csrf_exempt
def mcp_gateway_view(request: HttpRequest) -> HttpResponse:
    """Public authenticated gateway endpoint for external MCP clients."""
    if request.method not in ("POST", "GET", "DELETE", "HEAD", "OPTIONS"):
        return JsonResponse(
            {"jsonrpc": "2.0", "error": {"code": -32601, "message": "Method not allowed"}},
            status=405,
        )

    if request.method == "OPTIONS":
        response = HttpResponse()
        response["Allow"] = "POST, GET, DELETE, HEAD, OPTIONS"
        return response

    req_id = None
    if request.method == "POST" and request.body:
        try:
            body_check = json.loads(request.body.decode("utf-8"))
            if isinstance(body_check, dict):
                req_id = body_check.get("id")
        except Exception:
            pass

    raw_key = _extract_api_key(request)
    if not raw_key:
        return JsonResponse(
            {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32000,
                    "message": "Unauthorized: Missing API key. Provide 'Authorization: Bearer <key>'.",
                },
                "id": req_id,
            },
            status=401,
        )

    api_key_obj = McpApiKey.verify_raw_key(raw_key)
    if not api_key_obj:
        return JsonResponse(
            {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32000,
                    "message": "Unauthorized: Invalid, expired, or revoked API key.",
                },
                "id": req_id,
            },
            status=401,
        )

    if not _check_rate_limit(str(api_key_obj.id)):
        return JsonResponse(
            {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32000,
                    "message": "Too Many Requests: Rate limit exceeded. Try again in 60 seconds.",
                },
                "id": req_id,
            },
            status=429,
        )

    user = api_key_obj.user
    api_key_obj.record_usage()

    # Extract JSON-RPC payload telemetry for audit logging
    tool_name = "gateway_request"
    tool_args: dict[str, Any] = {}
    is_tool_call = False

    if request.method == "POST" and request.body:
        try:
            body_json = json.loads(request.body.decode("utf-8"))
            if isinstance(body_json, dict):
                method = body_json.get("method", "")
                if method == "tools/call":
                    is_tool_call = True
                    params = body_json.get("params", {})
                    if isinstance(params, dict):
                        tool_name = str(params.get("name", "unknown_tool"))
                        tool_args = params.get("arguments", {}) or {}
                else:
                    tool_name = method or "unknown_method"
        except Exception:
            pass

    resource_url = get_mcp_resource_url()
    actor_token = mint_actor_token(user, resource_url=resource_url)

    _server, app = create_streamable_http_app(
        resource_url=resource_url,
        json_response=True,
        stateless_http=True,
    )

    parsed = urlparse(resource_url)
    base_url = f"{parsed.scheme or 'http'}://{parsed.netloc or '127.0.0.1:8000'}"
    target_path = parsed.path or "/api/mcp/"
    if request.META.get("QUERY_STRING"):
        target_path = f"{target_path}?{request.META['QUERY_STRING']}"

    forward_headers = {
        "Authorization": f"Bearer {actor_token}",
        "Content-Type": request.headers.get("Content-Type", "application/json"),
        "Accept": request.headers.get("Accept", "application/json"),
    }
    session_id = request.headers.get("mcp-session-id")
    if session_id:
        forward_headers["mcp-session-id"] = session_id

    start_time = time.monotonic()
    status_str = "success"
    err_msg = ""

    async def _forward() -> tuple[int, bytes, dict[str, str]]:
        session_manager = getattr(app, "_mcp_session_manager", None)
        if session_manager is not None:
            async with session_manager.run():
                async with httpx2.AsyncClient(
                    transport=httpx2.ASGITransport(app=app),
                    base_url=base_url,
                ) as client:
                    resp = await client.request(
                        method=request.method,
                        url=target_path,
                        headers=forward_headers,
                        content=request.body,
                        timeout=60.0,
                    )
                    return resp.status_code, resp.content, dict(resp.headers)
        else:
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app),
                base_url=base_url,
            ) as client:
                resp = await client.request(
                    method=request.method,
                    url=target_path,
                    headers=forward_headers,
                    content=request.body,
                    timeout=60.0,
                )
                return resp.status_code, resp.content, dict(resp.headers)

    try:
        status_code, resp_content, resp_headers = async_to_sync(_forward)()
        if status_code >= 400:
            status_str = "tool_error"
            err_msg = f"HTTP {status_code}"
    except Exception as exc:
        logger.exception("Error proxying request through internal MCP ASGI app")
        status_str = "tool_error"
        err_msg = str(exc)
        status_code = 500
        resp_content = json.dumps(
            {"jsonrpc": "2.0", "error": {"code": -32603, "message": f"Internal proxy error: {exc}"}}
        ).encode("utf-8")
        resp_headers = {"content-type": "application/json"}

    duration_ms = int((time.monotonic() - start_time) * 1000)

    if is_tool_call or status_str != "success":
        try:
            McpExternalAuditLog.objects.create(
                api_key=api_key_obj,
                user=user,
                tool_name=tool_name,
                arguments=_sanitize_audit_arguments(tool_args),
                status=status_str,
                error_message=err_msg[:500],
                duration_ms=duration_ms,
            )
        except Exception as exc:
            logger.warning("Failed to persist McpExternalAuditLog: %s", exc)

    response = HttpResponse(
        resp_content,
        status=status_code,
        content_type=resp_headers.get("content-type", "application/json"),
    )
    for h in ("mcp-session-id", "cache-control", "allow"):
        if h in resp_headers:
            response[h] = resp_headers[h]

    return response
