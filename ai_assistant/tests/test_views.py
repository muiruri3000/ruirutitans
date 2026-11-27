"""Unit tests for AI conversation and messaging API endpoints."""

import json
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase, Client
from django.urls import reverse

from ai_assistant.models import AIConversation, AIMessage
from ai_assistant.providers.base import LLMResponse, LLMUsage

User = get_user_model()


class AIViewsTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username="coach_sam",
            password="securepassword123",
            is_staff=True,
            is_active=True,
        )
        self.client.force_login(self.user)
        self.list_url = reverse("ai_assistant:conversation_list_create")
        self.providers_url = reverse("ai_assistant:provider_list")

    def test_list_providers(self):
        resp = self.client.get(self.providers_url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        ids = [p["id"] for p in data]
        self.assertIn("pool", ids)
        self.assertIn("claude", ids)
        self.assertIn("gemini", ids)

    def test_create_and_list_conversations(self):
        # Create
        create_resp = self.client.post(
            self.list_url,
            data=json.dumps({"title": "Championship Review", "provider_name": "claude"}),
            content_type="application/json",
        )
        self.assertEqual(create_resp.status_code, 201)
        conv_data = create_resp.json()
        conv_id = conv_data["id"]
        self.assertEqual(conv_data["title"], "Championship Review")
        self.assertEqual(conv_data["provider_name"], "claude")

        # List
        list_resp = self.client.get(self.list_url)
        self.assertEqual(list_resp.status_code, 200)
        items = list_resp.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], conv_id)

    def test_get_and_delete_conversation(self):
        conv = AIConversation.objects.create(
            user=self.user,
            title="Tactical Analysis",
            provider_name="gemini",
        )
        detail_url = reverse("ai_assistant:conversation_detail", kwargs={"pk": conv.id})

        # Get
        resp = self.client.get(detail_url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["title"], "Tactical Analysis")

        # Delete (soft archive)
        del_resp = self.client.delete(detail_url)
        self.assertEqual(del_resp.status_code, 204)
        conv.refresh_from_db()
        self.assertTrue(conv.is_archived)

    @patch("ai_assistant.orchestrator.get_llm_provider")
    def test_send_message_executes_turn(self, mock_get_provider):
        conv = AIConversation.objects.create(
            user=self.user,
            title="Match Preview",
            provider_name="claude",
        )
        mock_provider = mock_get_provider.return_value
        mock_provider.provider_name = "claude"
        mock_provider.model_name = "claude-3-5-sonnet-20241022"

        async def _mock_gen(**kwargs):
            return LLMResponse(
                text="Titans Red is in top form with solid defensive organization.",
                tool_calls=[],
                usage=LLMUsage(prompt_tokens=40, completion_tokens=25, total_tokens=65),
                finish_reason="stop",
                model_name="claude-3-5-sonnet-20241022",
                provider_name="claude",
            )

        mock_provider.generate = _mock_gen

        msg_url = reverse("ai_assistant:send_message", kwargs={"pk": conv.id})
        resp = self.client.post(
            msg_url,
            data=json.dumps({"content": "Analyze team form before the derby."}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["conversation_id"], str(conv.id))
        self.assertEqual(data["user_message"]["content"], "Analyze team form before the derby.")
        self.assertIn("Titans Red is in top form", data["assistant_message"]["content"])
        self.assertEqual(data["usage"]["total_tokens"], 65)

        # Check DB persistence
        self.assertEqual(AIMessage.objects.filter(conversation=conv).count(), 2)
