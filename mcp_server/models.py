"""Models for external MCP API authentication and execution auditing."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from typing import Any

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import models
from django.utils import timezone

API_KEY_PREFIX = "rt_mcp_live_"


class McpApiKey(models.Model):
    """Staff API key for external MCP client authentication (Claude Desktop / Claude Code / Antigravity)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mcp_api_keys",
    )
    name = models.CharField(max_length=120, blank=True, default="Staff MCP Key")
    key_prefix = models.CharField(max_length=24, db_index=True)
    key_hash = models.CharField(max_length=128, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["key_prefix", "is_active"]),
            models.Index(fields=["user", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"McpApiKey({self.name}, prefix={self.key_prefix}, user={self.user_id})"

    def clean(self) -> None:
        super().clean()
        if not self.user_id:
            raise ValidationError("McpApiKey must belong to a user.")
        if not self.user.is_active:
            raise ValidationError("Key owner must be an active user.")
        if not (self.user.is_staff or self.user.is_superuser):
            raise ValidationError("Only staff or superuser roles can hold MCP API keys.")

    def save(self, *args, **kwargs):
        self.clean()
        return super().save(*args, **kwargs)

    @classmethod
    def generate_key(
        cls,
        user: Any,
        name: str = "Staff MCP Key",
        expires_at: Any = None,
    ) -> tuple[McpApiKey, str]:
        """Generate a cryptographically secure API key and persist its one-way hash.

        Returns:
            A tuple of (instance, raw_key). The plaintext key is only returned once.
        """
        if not user or not user.is_active:
            raise PermissionDenied("Active staff user is required to issue an MCP key.")
        if not (user.is_staff or user.is_superuser):
            raise PermissionDenied("Only staff or superuser roles can hold MCP API keys.")

        random_suffix = secrets.token_urlsafe(32)
        raw_key = f"{API_KEY_PREFIX}{random_suffix}"
        prefix = raw_key[:18]
        key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

        key_instance = cls(
            user=user,
            name=name,
            key_prefix=prefix,
            key_hash=key_hash,
            is_active=True,
            expires_at=expires_at,
        )
        key_instance.save()
        return key_instance, raw_key

    @classmethod
    def verify_raw_key(cls, raw_key: str) -> McpApiKey | None:
        """Verify raw key using constant-time hash check and live DB status checks."""
        if not raw_key or not isinstance(raw_key, str):
            return None
        raw_key = raw_key.strip()
        if not raw_key.startswith(API_KEY_PREFIX) or len(raw_key) < 24:
            return None

        prefix = raw_key[:18]
        computed_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

        candidates = cls.objects.select_related("user").filter(
            key_prefix=prefix,
            is_active=True,
            revoked_at__isnull=True,
        )
        for candidate in candidates:
            if hmac.compare_digest(candidate.key_hash, computed_hash):
                if candidate.is_valid():
                    return candidate
        return None

    def is_valid(self) -> bool:
        """Confirm key has not been revoked, expired, or deactivated, and user is active staff."""
        if not self.is_active or self.revoked_at is not None:
            return False
        if self.expires_at is not None and self.expires_at <= timezone.now():
            return False
        if not self.user or not self.user.is_active:
            return False
        if not (self.user.is_staff or self.user.is_superuser):
            return False
        return True

    def revoke(self) -> None:
        """Revoke key immediately."""
        self.is_active = False
        self.revoked_at = timezone.now()
        self.save(update_fields=["is_active", "revoked_at", "updated_at"])

    def record_usage(self) -> None:
        """Update last_used_at timestamp."""
        self.last_used_at = timezone.now()
        self.save(update_fields=["last_used_at"])


class McpExternalAuditLog(models.Model):
    """Audit log entry capturing external tool invocations via the MCP gateway."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    api_key = models.ForeignKey(
        McpApiKey,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mcp_external_audit_logs",
    )
    tool_name = models.CharField(max_length=100)
    arguments = models.JSONField(default=dict)
    status = models.CharField(max_length=30)  # success, tool_error, validation_error, blocked
    error_message = models.CharField(max_length=500, blank=True, default="")
    duration_ms = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tool_name", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"McpExternalAuditLog({self.tool_name}, status={self.status}, user={self.user_id})"
