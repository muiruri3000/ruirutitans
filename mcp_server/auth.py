"""Actor-token minting, cryptographic verification, and ASGI header hardening."""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import jwt
from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from jwt import InvalidTokenError
from mcp.server.auth.provider import AccessToken, TokenVerifier

from mcp_server.exceptions import MCPAuthenticationError, MCPAuthorizationError

logger = logging.getLogger("mcp_server")

ACTOR_TOKEN_ISSUER = "ruirutitans-backend"
ACTOR_TOKEN_ALGORITHM = "HS256"
MAX_ACTOR_TOKEN_TTL_SECONDS = 900
DEFAULT_ACTOR_TOKEN_TTL_SECONDS = 300
CLOCK_SKEW_SECONDS = 5
STAFF_MCP_ROLES = frozenset({"admin", "manager", "staff"})
ADMIN_MCP_ROLES = frozenset({"admin"})
READ_SCOPE = "ruirutitans:mcp:read"

_OVERRIDE_HEADERS = frozenset(
    {
        b"x-role",
        b"x-actor-role",
        b"x-user-id",
        b"x-titans-user-id",
    }
)


@dataclass(frozen=True)
class VerifiedActor:
    """Trusted server-resolved actor identity backed by current DB state."""

    user: Any
    role: str
    jti: str
    token_claims: dict[str, Any]


def get_actor_token_secret() -> str:
    """Return the signing key for internal MCP actor tokens."""
    configured = (getattr(settings, "MCP_ACTOR_TOKEN_SECRET", "") or "").strip()
    if configured:
        return configured

    if not getattr(settings, "DEBUG", False):
        configured_sec = getattr(settings, "SECRET_KEY", "")
        if not configured_sec:
            raise MCPAuthenticationError("MCP_ACTOR_TOKEN_SECRET or SECRET_KEY is required.")
        return hmac.new(
            configured_sec.encode("utf-8"),
            b"ruirutitans-mcp-actor-token-v1",
            hashlib.sha256,
        ).hexdigest()

    sec = getattr(settings, "SECRET_KEY", "dev-secret-key")
    return hmac.new(
        sec.encode("utf-8"),
        b"ruirutitans-mcp-actor-token-dev-v1",
        hashlib.sha256,
    ).hexdigest()


def get_mcp_resource_url() -> str:
    """Return the canonical resource URL that tokens must target in their ``aud`` claim."""
    configured = getattr(settings, "MCP_RESOURCE_URL", None)
    if configured:
        return str(configured).rstrip("/") + "/"
    return "http://127.0.0.1:8000/api/mcp/"


def role_of(user: Any) -> str:
    """Determine the normalized role of a user."""
    if not user:
        return "anonymous"
    if getattr(user, "is_superuser", False):
        return "admin"
    if getattr(user, "is_staff", False):
        return "staff"
    return "player"


def mint_actor_token(
    user: Any,
    *,
    resource_url: str | None = None,
    ttl_seconds: int = DEFAULT_ACTOR_TOKEN_TTL_SECONDS,
    scopes: list[str] | None = None,
) -> str:
    """Issue a signed JWT actor token representing an authenticated staff user."""
    if not user or not getattr(user, "is_active", False):
        raise MCPAuthenticationError("Cannot issue an actor token for an inactive user.")

    role = role_of(user)
    if role not in STAFF_MCP_ROLES and not getattr(user, "is_staff", False):
        raise MCPAuthorizationError("Only staff users can acquire an MCP actor token.")

    ttl = min(max(ttl_seconds, 30), MAX_ACTOR_TOKEN_TTL_SECONDS)
    now = int(time.time())
    resolved_resource = (resource_url or get_mcp_resource_url()).rstrip("/") + "/"
    resolved_scopes = scopes or [READ_SCOPE]

    claims: dict[str, Any] = {
        "iss": ACTOR_TOKEN_ISSUER,
        "aud": resolved_resource,
        "sub": str(user.pk),
        "username": getattr(user, "username", str(user.pk)),
        "role": role,
        "scopes": resolved_scopes,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "nbf": now - CLOCK_SKEW_SECONDS,
        "exp": now + ttl,
    }
    return jwt.encode(claims, get_actor_token_secret(), algorithm=ACTOR_TOKEN_ALGORITHM)


def decode_actor_token(
    raw_token: str,
    *,
    resource_url: str | None = None,
) -> dict[str, Any]:
    """Cryptographically verify and decode a raw JWT actor token."""
    if not raw_token or not isinstance(raw_token, str):
        raise MCPAuthenticationError("Missing or empty actor token.")

    clean_token = raw_token.strip()
    if clean_token.lower().startswith("bearer "):
        clean_token = clean_token[7:].strip()

    resolved_resource = (resource_url or get_mcp_resource_url()).rstrip("/") + "/"
    options = {
        "require": ["exp", "iat", "nbf", "sub", "iss", "aud", "jti"],
        "verify_signature": True,
        "verify_exp": True,
        "verify_nbf": True,
        "verify_iat": True,
        "verify_aud": True,
        "verify_iss": True,
    }
    try:
        claims = jwt.decode(
            clean_token,
            get_actor_token_secret(),
            algorithms=[ACTOR_TOKEN_ALGORITHM],
            issuer=ACTOR_TOKEN_ISSUER,
            audience=resolved_resource,
            leeway=CLOCK_SKEW_SECONDS,
            options=options,
        )
    except InvalidTokenError as exc:
        raise MCPAuthenticationError(f"Actor token validation failed: {exc}") from exc

    return claims


def verify_actor(
    raw_token: str,
    *,
    resource_url: str | None = None,
) -> VerifiedActor:
    """Verify raw token and validate live DB user state."""
    claims = decode_actor_token(raw_token, resource_url=resource_url)
    user_model = get_user_model()

    user_id = claims["sub"]
    user = user_model.objects.filter(pk=user_id).first()
    if not user or not user.is_active:
        raise MCPAuthenticationError("Actor user not found or inactive in database.")

    role = role_of(user)
    if role not in STAFF_MCP_ROLES and not getattr(user, "is_staff", False):
        raise MCPAuthorizationError("Actor user is no longer active staff.")

    return VerifiedActor(
        user=user,
        role=role,
        jti=claims["jti"],
        token_claims=claims,
    )


class TitansActorTokenVerifier(TokenVerifier):
    """MCP SDK TokenVerifier integration for Ruiru Titans."""

    def __init__(self, resource_url: str | None = None) -> None:
        self.resource_url = resource_url or get_mcp_resource_url()

    async def verify_token(self, token: str) -> AccessToken:
        verified: VerifiedActor = await sync_to_async(
            verify_actor,
            thread_sensitive=True,
        )(token, resource_url=self.resource_url)

        return AccessToken(
            token=token,
            client_id=str(verified.user.pk),
            scopes=verified.token_claims.get("scopes", [READ_SCOPE]),
            expires_at=verified.token_claims.get("exp"),
            resource=self.resource_url,
            subject=str(verified.user.pk),
            claims=verified.token_claims,
            extra={
                "user_id": str(verified.user.pk),
                "username": getattr(verified.user, "username", ""),
                "role": verified.role,
                "jti": verified.jti,
            },
        )


class ActorHeaderNormalizationMiddleware:
    """ASGI middleware that strips forged identity headers and sets verified actor headers."""

    def __init__(self, app: Any, resource_url: str | None = None) -> None:
        self.app = app
        self.resource_url = resource_url or get_mcp_resource_url()

    async def __call__(self, scope: Mapping[str, Any], receive: Any, send: Any) -> Any:
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)

        headers: list[tuple[bytes, bytes]] = []
        auth_header_value: str | None = None

        for name, value in scope.get("headers", []):
            name_lower = name.lower()
            if name_lower in _OVERRIDE_HEADERS:
                continue
            if name_lower == b"authorization":
                try:
                    auth_header_value = value.decode("utf-8")
                except UnicodeDecodeError:
                    pass
            headers.append((name, value))

        if auth_header_value:
            try:
                verified = await sync_to_async(verify_actor, thread_sensitive=True)(
                    auth_header_value, resource_url=self.resource_url
                )
                headers.append((b"x-titans-user-id", str(verified.user.pk).encode("utf-8")))
                headers.append((b"x-actor-role", verified.role.encode("utf-8")))
            except Exception as exc:
                logger.debug("Header normalization token verification failed: %s", exc)

        modified_scope = dict(scope)
        modified_scope["headers"] = headers
        return await self.app(modified_scope, receive, send)
