"""DRF serializers for AI Conversations, Messages, and Tool Audit telemetry."""

from __future__ import annotations

from rest_framework import serializers
from ai_assistant.models import AIConversation, AIMessage, AIToolExecution


class AIToolExecutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIToolExecution
        fields = [
            "id",
            "round_index",
            "tool_name",
            "arguments",
            "result_payload",
            "status",
            "error_message",
            "duration_ms",
            "created_at",
        ]


class AIMessageSerializer(serializers.ModelSerializer):
    tool_executions = AIToolExecutionSerializer(many=True, read_only=True)

    class Meta:
        model = AIMessage
        fields = [
            "id",
            "role",
            "content",
            "provider_name",
            "model_name",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "tool_rounds_used",
            "grounding_status",
            "tool_executions",
            "created_at",
        ]


class AIConversationSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = AIConversation
        fields = [
            "id",
            "title",
            "provider_name",
            "model_name",
            "total_prompt_tokens",
            "total_completion_tokens",
            "total_tokens",
            "created_at",
            "updated_at",
        ]


class AIConversationDetailSerializer(serializers.ModelSerializer):
    messages = AIMessageSerializer(many=True, read_only=True)

    class Meta:
        model = AIConversation
        fields = [
            "id",
            "title",
            "provider_name",
            "model_name",
            "total_prompt_tokens",
            "total_completion_tokens",
            "total_tokens",
            "messages",
            "created_at",
            "updated_at",
        ]


class AIConversationCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False, allow_blank=True, default="Football Analysis")
    provider_name = serializers.CharField(max_length=50, required=False, default="pool")


class AISendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(required=True, allow_blank=False, max_length=4000)
    provider_name = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
