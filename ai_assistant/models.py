"""Conversation, message, and tool execution audit models for Ruiru Titans AI Assistant."""

from __future__ import annotations

import uuid
from django.conf import settings
from django.db import models


class AIConversation(models.Model):
    """Staff AI conversation strictly isolated to an authenticated user."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_conversations",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=200, blank=True, default="Football Analysis")
    provider_name = models.CharField(max_length=50, default="gemini")
    model_name = models.CharField(max_length=100, blank=True, default="")
    is_archived = models.BooleanField(default=False)
    total_prompt_tokens = models.PositiveIntegerField(default=0)
    total_completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-created_at"]
        indexes = [
            models.Index(fields=["user", "-updated_at"]),
        ]

    def __str__(self) -> str:
        label = self.title or str(self.id)
        return f"AIConversation({label}, user={self.user_id})"


class AIMessage(models.Model):
    """Single persisted turn message belonging to an ``AIConversation``."""

    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    conversation = models.ForeignKey(
        AIConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    content = models.TextField()
    provider_name = models.CharField(max_length=50, blank=True, default="")
    model_name = models.CharField(max_length=100, blank=True, default="")
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    tool_rounds_used = models.PositiveSmallIntegerField(default=0)
    grounding_status = models.CharField(max_length=40, blank=True, default="direct")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"AIMessage({self.role}, conv={self.conversation_id})"


class AIToolExecution(models.Model):
    """Audit log entry recording each MCP tool attempt, arguments, and outcome."""

    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        TOOL_ERROR = "tool_error", "Tool Error"
        VALIDATION_ERROR = "validation_error", "Validation Error"
        BLOCKED = "blocked", "Blocked"

    conversation = models.ForeignKey(
        AIConversation,
        on_delete=models.CASCADE,
        related_name="tool_executions",
    )
    assistant_message = models.ForeignKey(
        AIMessage,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="tool_executions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_tool_executions",
    )
    round_index = models.PositiveSmallIntegerField(default=0)
    tool_name = models.CharField(max_length=100)
    arguments = models.JSONField(default=dict)
    result_payload = models.JSONField(default=dict)
    status = models.CharField(max_length=24, choices=Status.choices)
    error_message = models.CharField(max_length=300, blank=True, default="")
    duration_ms = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"AIToolExecution({self.tool_name}, status={self.status})"
