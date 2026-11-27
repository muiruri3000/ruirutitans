"""URL patterns for the Ruiru Titans AI Assistant API."""

from django.urls import path
from ai_assistant.views import (
    ConversationDetailAPIView,
    ConversationListCreateAPIView,
    ProviderListAPIView,
    SendMessageAPIView,
)

app_name = "ai_assistant"

urlpatterns = [
    path("providers/", ProviderListAPIView.as_view(), name="provider_list"),
    path("conversations/", ConversationListCreateAPIView.as_view(), name="conversation_list_create"),
    path("conversations/<uuid:pk>/", ConversationDetailAPIView.as_view(), name="conversation_detail"),
    path("conversations/<uuid:pk>/messages/", SendMessageAPIView.as_view(), name="send_message"),
]
