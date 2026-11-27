"""REST API endpoints for Ruiru Titans AI Assistant."""

from __future__ import annotations

import logging
from django.shortcuts import get_object_or_404
from rest_framework import status, views
from rest_framework.response import Response

from ai_assistant.exceptions import AIInputValidationError, AIProviderError
from ai_assistant.models import AIConversation
from ai_assistant.orchestrator import execute_turn
from ai_assistant.providers.registry import list_available_providers
from ai_assistant.serializers import (
    AIConversationCreateSerializer,
    AIConversationDetailSerializer,
    AIConversationSummarySerializer,
    AIMessageSerializer,
    AISendMessageSerializer,
    AIToolExecutionSerializer,
)
from ai_assistant.throttling import AIUserRateThrottle

logger = logging.getLogger("ai_assistant.views")


class ProviderListAPIView(views.APIView):
    """List available AI model providers (Claude, Gemini, Pool)."""

    def get(self, request):
        return Response(list_available_providers())


class ConversationListCreateAPIView(views.APIView):
    """List and create staff AI conversations."""

    throttle_classes = [AIUserRateThrottle]

    def get_queryset(self, request):
        qs = AIConversation.objects.filter(is_archived=False)
        user = getattr(request, "user", None)
        if user and getattr(user, "is_authenticated", False):
            qs = qs.filter(user=user)
        return qs.order_by("-updated_at")

    def get(self, request):
        conversations = self.get_queryset(request)[:50]
        serializer = AIConversationSummarySerializer(conversations, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = AIConversationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user if getattr(request.user, "is_authenticated", False) else None
        title = serializer.validated_data.get("title") or "Football Analysis"
        provider = serializer.validated_data.get("provider_name") or "pool"

        conversation = AIConversation.objects.create(
            user=user,
            title=title,
            provider_name=provider,
        )
        return Response(
            AIConversationDetailSerializer(conversation).data,
            status=status.HTTP_201_CREATED,
        )


class ConversationDetailAPIView(views.APIView):
    """Retrieve and delete a single AI conversation."""

    throttle_classes = [AIUserRateThrottle]

    def get_object(self, pk, request):
        user = request.user if getattr(request.user, "is_authenticated", False) else None
        if user:
            return get_object_or_404(AIConversation, pk=pk, user=user, is_archived=False)
        return get_object_or_404(AIConversation, pk=pk, is_archived=False)

    def get(self, request, pk):
        conv = self.get_object(pk, request)
        return Response(AIConversationDetailSerializer(conv).data)

    def delete(self, request, pk):
        conv = self.get_object(pk, request)
        conv.is_archived = True
        conv.save(update_fields=["is_archived"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SendMessageAPIView(views.APIView):
    """Send user prompt and execute bounded MCP tool-calling orchestration turn."""

    throttle_classes = [AIUserRateThrottle]

    def post(self, request, pk):
        user = request.user if getattr(request.user, "is_authenticated", False) else None
        if user:
            conversation = get_object_or_404(AIConversation, pk=pk, user=user, is_archived=False)
        else:
            conversation = get_object_or_404(AIConversation, pk=pk, is_archived=False)

        serializer = AISendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_prompt = serializer.validated_data["content"]
        provider_name = serializer.validated_data.get("provider_name") or conversation.provider_name

        try:
            turn_result = execute_turn(
                user=user,
                conversation=conversation,
                raw_user_message=user_prompt,
                provider_name=provider_name,
            )
        except AIInputValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except AIProviderError as exc:
            logger.exception("AI Provider invocation failure")
            return Response({"error": f"AI service error: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.exception("Unhandled error during conversation turn orchestration")
            return Response({"error": f"Failed to complete AI turn: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(
            {
                "conversation_id": str(conversation.id),
                "user_message": AIMessageSerializer(turn_result.user_message).data,
                "assistant_message": AIMessageSerializer(turn_result.assistant_message).data,
                "tool_executions": AIToolExecutionSerializer(turn_result.tool_executions, many=True).data,
                "usage": {
                    "prompt_tokens": turn_result.usage.prompt_tokens,
                    "completion_tokens": turn_result.usage.completion_tokens,
                    "total_tokens": turn_result.usage.total_tokens,
                },
            },
            status=status.HTTP_200_OK,
        )
